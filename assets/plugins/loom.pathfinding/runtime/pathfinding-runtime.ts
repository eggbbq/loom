import type {} from "~/packages/loom.core";
import * as api from "./pathfinding-api";
export * from "./pathfinding-api";

@Laya.regClass()
export class LoomPathfindingRuntime {
    private static install(): void {
        window.loom ??= {} as LoomGlobal;
        window.loom.pathfinding = api;
    }
    static {
        Laya.addBeforeInitCallback(LoomPathfindingRuntime.install);
        if (typeof IEditorEnv !== "undefined") IEditorEnv.onUserScriptsLoad(LoomPathfindingRuntime, "install");
    }
}
declare global {
    interface LoomGlobal { pathfinding: typeof api; }
    var loom: LoomGlobal;
}
