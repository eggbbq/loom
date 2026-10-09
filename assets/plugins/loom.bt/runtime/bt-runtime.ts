import * as api from "./bt-api";
export * from "./bt-api";

export class LoomBTRuntime {
    static install(): void {
        window.loom ??= {} as LoomGlobal;
        window.loom.bt = api;
    }
}

declare global {
    interface LoomGlobal { bt: typeof api; }
    var loom: LoomGlobal;
}
