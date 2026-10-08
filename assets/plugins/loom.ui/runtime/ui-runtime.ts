export * from "./ui-close-button";
export * from "./ui-const";
export * from "./ui-frame";
export * from "./ui-manager";
export * from "./ui-panel";
export * from "./ui-tips-manager";
export * from "./ui-tooltips-manager";
export * from "./ui-types";
export * from "./ui-utils";


import { UIManager } from "./ui-manager";

/** 安装包运行时入口；UI 层级和资源在首次使用时创建。 */
@Laya.regClass()
export class LoomUIRuntime {
    private static install(): void {
        window.loom ??= {} as LoomGlobal;
        window.loom.ui = UIManager.inst;
    }

    static {
        Laya.addBeforeInitCallback(LoomUIRuntime.install);
        if (typeof IEditorEnv !== "undefined") {
            IEditorEnv.onUserScriptsLoad(LoomUIRuntime, "install");
        }
    }
}

declare global {
    interface LoomGlobal { ui: UIManager; }
    var loom: LoomGlobal;
}
