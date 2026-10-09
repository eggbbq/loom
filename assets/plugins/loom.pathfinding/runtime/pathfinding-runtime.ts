import * as api from "./pathfinding-api";
export * from "./pathfinding-api";

export class LoomPathfindingRuntime {
    static install(): void {
        window.loom ??= {} as LoomGlobal;
        window.loom.pathfinding = api;
    }
}

declare global {
    interface LoomGlobal { pathfinding: typeof api; }
    var loom: LoomGlobal;
}
