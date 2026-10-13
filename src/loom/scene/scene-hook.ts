/** 项目自己的场景钩子实现；插件升级不会覆盖此文件。 */
export class SceneHook implements loom.ISceneHook {
    static register(): void {
        loom.scene.hooks = new SceneHook();
    }

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
