import * as api from "./core-api";
export * from "./core-api";
export type { Env } from "./g";

/** 核心服务必须在业务模块类和 token 初始化前可用。 */
@Laya.regClass()
export class LoomCoreRuntime {
    private static install(): void {
        (window as any).$env ??= { log: { loom: false } };
        window.loom ??= {} as LoomGlobal;
        window.loom.core = api;
        (window as any).format = api.formatf;
    }
    static {
        LoomCoreRuntime.install();
        Laya.addBeforeInitCallback(LoomCoreRuntime.install);
        if (typeof IEditorEnv !== "undefined") IEditorEnv.onUserScriptsLoad(LoomCoreRuntime, "install");
    }
}
declare global {
    interface LoomGlobal { core: typeof api; }
    var loom: LoomGlobal;
    const format: typeof api.formatf;
}
