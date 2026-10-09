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

/** UI 运行时实现；UI 层级和资源在首次使用时创建。 */
export class LoomUIRuntime {
    static install(): void {
        window.loom ??= {} as LoomGlobal;
        window.loom.ui = UIManager.inst;
    }


}

declare global {
    interface LoomGlobal { ui: UIManager; }
    var loom: LoomGlobal;
}
