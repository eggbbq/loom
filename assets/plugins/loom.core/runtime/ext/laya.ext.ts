declare global {
    namespace Laya {
        interface Node {
            _uid: number;
            _data: any;
            setData(data: any): void;
        }
    }
}

if (!Laya.Node.prototype.hasOwnProperty("_uid")) {
    Object.defineProperty(Laya.Node.prototype, '_uid', {
        value: 0,
        writable: true,
        enumerable: false,
        configurable: false
    });
}

if (!Laya.Node.prototype.hasOwnProperty("_data")) {
    Object.defineProperty(Laya.Node.prototype, '_data', {
        value: null,
        writable: true,
        enumerable: false,
        configurable: false
    });
}

if (!Laya.Node.prototype.hasOwnProperty("setData")) {
    Object.defineProperty(Laya.Node.prototype, 'setData', {
        value: function (data: any): void {
            (this as Laya.Node)._data = data;
            (this as Laya.Node).event("setData", data);
        },
        writable: true,
        enumerable: false,
        configurable: false
    });
}

export { }
