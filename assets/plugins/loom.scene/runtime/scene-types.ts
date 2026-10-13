export interface ISceneHook {
    /** 加载前执行，失败阻止加载；不传打开参数时 param 为 undefined。 */
    beforeOpen?(url: string, param: any): void | PromiseLike<void>;
    /** 原生打开及 complete 后执行；失败不回滚场景，open 的 Promise 会等待完成。 */
    afterOpen?(url: string, param: any, openedScene: Laya.Scene): void | PromiseLike<void>;
}
