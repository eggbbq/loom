// 当前这个版本的云存档同步机制采用轻量级增量同步
// 每次写入都会触发一次上传,如果上传失败则加入上传队列,等待下一次上传
// 下载时会覆盖本地数据,并更新版本号
// 当前目标是: 先保证基本功能可用
// [todo]
// 1 上传队列和重试机制
// 2 更复杂的同步策略, 比如冲突解决等
// 3 分批上传优化


function overwrite(src:Record<string, any>, dst:Record<string, any>) {
    for (const key in src) {
        dst[key] = src[key];
    }
}

export class UserArchiveSyncData {
    uid:string = "";
    data:Record<string, string> = {};
    version:Record<string, number> = {};
}

/**
 * 由于我不能确定未来的网络模块的具体实现,
 * 所以这里使用接口来抽象网络功能
 */
export interface NetworkHelper {
    enabled:boolean;
    upload(data:UserArchiveSyncData): Promise<any>;
    download(): Promise<UserArchiveSyncData>;
}

export class ArchiveSystem {

    protected _data:Record<string, string> = {};
    protected _version:Record<string, number> = {};
    protected _uid = "uid";
    protected _network?:NetworkHelper;

    constructor(network?:NetworkHelper) {
        this._network = network;
    }

    protected fmtkey(key:string) {
        return `${this._uid}:${key}`;
    }

    setUserId(uid:string) {
        this._uid = uid;
        this._data = {}
        this._version = {}
    }

    read(key:string):string|null {
        key = this.fmtkey(key);
        if (key in this._data) {
            return this._data[key]
        }
        const text = Laya.LocalStorage.getItem(key);
        this._data[key] = text;
        $env.log_arc && console.log("archive.read ", key, text);
        return text;
    }

    write(key:string, text:string) {
        key = this.fmtkey(key);
        this._data[key] = text;
        const v = this._version[key] = (this._version[key] ?? 0) + 1;
        const keyVersion = key + ".version";
        const versionText = v.toString();
        Laya.LocalStorage.setItem(keyVersion, versionText);
        Laya.LocalStorage.setItem(key, text);

        $env.log_arc && console.log("archive.write", keyVersion, versionText);
        $env.log_arc && console.log("archive.write", key, text);

        try {
            this.updateRemote(key, text, v);
        } catch (error) {
            console.error(error);
        }
    }

    private _uploadData = new UserArchiveSyncData();
    private _uploadScheduled = false;
    updateRemote(key:string, text:string, version:number) {
        if(!this._network) return;
        if(!this._network.enabled) return;
        this._uploadData.data[key] = text;
        this._uploadData.version[key] = version;
        this._uploadData.uid = this._uid;

        if (this._uploadScheduled) return;
        this._uploadScheduled = true;
        const delay = ($env.dataSyncDelay ?? 30) * 1000;
        setTimeout(()=>{
            this._uploadScheduled = false;
            const req = this._uploadData;
            this._uploadData = new UserArchiveSyncData();
            this._uploadQueue.push(req);
            this.upload();
        }, delay);
    }

    updateLocal(arc:{
        data:Record<string, string>,
        version:Record<string, number>
    }) {

        if (!arc) return;
        const data = arc.data;
        const version = arc.version;

        for (const key in version) {
            let s = Laya.LocalStorage.getItem(key + ".version");
            let v = 0;
            if (s) {
                try {
                    v = parseInt(s);
                } catch (error) {
                    v = 1;
                }
            }
            this._version[key] = v;
        }

        for (const key in data) {
            if (!(key in version)) continue;
            const _v = this._version[key] || 0;
            const _d = this._data[key];
            const v = version[key] || 0;
            const d = data[key];

            if (_v >= v) {
                const localData = _d ?? Laya.LocalStorage.getItem(key);
                this._data[key] = localData;
                this._version[key] = _v;

                if (localData != null) Laya.LocalStorage.setItem(key, localData);
                Laya.LocalStorage.setItem(key + ".version", _v.toString());
            } else {
                this._data[key] = d;
                this._version[key] = v;

                Laya.LocalStorage.setItem(key, d);
                Laya.LocalStorage.setItem(key + ".version", v.toString());
            }
        }
    }

    private _uploadQueue:UserArchiveSyncData[] = [];
    upload():Promise<boolean> {
        if(!this._network) return Promise.resolve(true);
        if(!this._network.enabled) return Promise.resolve(true);

        // 合并全部请求
        // 每次上传都合并所有请求, 新数据总是覆盖旧数据

        if (this._uploadQueue.length > 1) {
            const first = this._uploadQueue[0];
            for (let i = 1; i < this._uploadQueue.length; i++) {
                const req = this._uploadQueue[i];
                overwrite(req.data, first.data);
                overwrite(req.version, first.version);
            }
            this._uploadQueue.length = 1;
            this._uploadQueue[0] = first;
        }

        return new Promise<boolean>(async (resolve)=> {
            if (this._uploadQueue.length === 0) {
                return resolve(true);
            }

            const dataChunk = this._uploadQueue.shift();

            try {
                const result = await this._network.upload(dataChunk);
                // 如果req 上传失败 则把当前req 合并到队列头部重新加入队列
                // 等待下一轮重新上传
                if (!result?.success) {
                    this._uploadQueue.unshift(dataChunk);
                    resolve(false);
                } else {
                    resolve(true);
                }
            } catch (error) {
                this._uploadQueue.unshift(dataChunk);
                resolve(false);
            }
        });
    }

    download(): Promise<boolean> {
        if (!this._network?.enabled) return Promise.resolve(true);
        return new Promise<boolean>(async (resolve) => {
            try {
                const result = await this._network!.download();
                if (result) {
                    this.updateLocal(result);
                    resolve(true);
                } else {
                    resolve(false);
                }
            } catch (error) {
                console.error("archive.download failed", error);
                resolve(false);
            }
        });
    }
}