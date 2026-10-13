export interface ISceneHook {
    /** 加载前执行，失败阻止加载；不传打开参数时 param 为 undefined。 */
    beforeOpen?(url: string, param: any): void | PromiseLike<void>;
    /** 原生打开及 complete 后执行；失败不回滚场景，open 的 Promise 会等待完成。 */
    afterOpen?(url: string, param: any, openedScene: Laya.Scene): void | PromiseLike<void>;
}

/** 默认钩子实现，可在这里填充逻辑，或继承此类后注入 scene.hooks。 */
export class SceneHook implements ISceneHook {
    async beforeOpen(url: string, param: any): Promise<void> {
        // 可选接入 loom.ui；保持插件能够独立安装和编译。
        const ui = (window as any).loom?.ui;
        if (typeof ui?.closeAll === "function") {
            try {
                await ui.closeAll();
            } catch (error) {
                console.error("[LoomScene] Failed to close UI panels", error);
            }
        }
        Laya.Scene.showLoadingPage(url);
    }

    async afterOpen(url: string, param: any, openedScene: Laya.Scene): Promise<void> {
        Laya.Scene.hideLoadingPage();
    }
}
