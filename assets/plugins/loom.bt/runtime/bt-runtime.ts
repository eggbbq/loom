import * as api from "./bt-api";
export * from "./bt-api";

@Laya.regClass()
export class LoomBTRuntime {
    private static install(): void {
        window.loom ??= {} as LoomGlobal;
        window.loom.bt = api;
    }
    static {
        Laya.addBeforeInitCallback(LoomBTRuntime.install);
        if (typeof IEditorEnv !== "undefined") IEditorEnv.onUserScriptsLoad(LoomBTRuntime, "install");
    }
}
declare global {
    interface LoomGlobal { bt: typeof api; }
    var loom: LoomGlobal;
}
