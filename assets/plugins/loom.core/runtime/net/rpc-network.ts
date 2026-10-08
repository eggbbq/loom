import { msg, Notifier } from "../utils/notifier";

export type RPCResult = {
    readonly proto:string|number;
    readonly success:boolean;
    readonly code:number;
    readonly data:any;
    [key: string]: any;
}

export type RPCRequest = {
    proto:string|number;
    data?:any;
    [key: string]: any;
}


/**
 * RPC接口定义
 * 所有RPC实现都需要实现此接口
 */
export interface IRPC {
    send(req:RPCRequest):Promise<RPCResult>;
    on(proto:number|string, callback:(result:RPCResult)=>void, thisArg?:any):void;
    off(proto:number|string, callback:(result:RPCResult)=>void, thisArg?:any):void;
    offAll():void;
    offCaller(thisArg:any):void;
}


/**
 * RPC通道基类
 */
export abstract class RPCChannel implements IRPC {

    abstract send(req:RPCRequest):Promise<RPCResult>;

    protected readonly _notifyer:Notifier = new Notifier();
    on(proto:number|string, callback:(result:RPCResult)=>void, thisArg?:any):void {
        const key = typeof(proto) === "string" ? proto: proto.toString();
        this._notifyer.on(key, thisArg, callback);
    }

    off(proto:number|string, callback:(result:RPCResult)=>void, thisArg?:any) {
        const key = typeof(proto) === "string" ? proto: proto.toString();
        this._notifyer.off(key, thisArg, callback);
    }

    offAll() {
        this._notifyer.offAll();
    }

    offCaller(thisArg:any) {
        this._notifyer.offAllCaller(thisArg);
    }

    protected dispatch(result: RPCResult) {
        try {
            this._notifyer.event(msg<RPCResult>(String(result.proto)), result);
        } catch (error) {
            console.error("dispatch error", error);
        }
    }
}
