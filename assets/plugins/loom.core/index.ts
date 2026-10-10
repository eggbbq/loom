import * as api from "./runtime/core-api";
export * from "./runtime/core-api";
export type { Env } from "./runtime/g";

type CoreAPI = typeof api;

function install() {
    (window as any).$env ??= { log: { loom: false } };
    Object.assign(window.loom ??= {} as Loom, api);
    (window as any).format = api.formatf;
}

install();
Laya.addBeforeInitCallback(install);

if (typeof IEditorEnv !== "undefined") {
    IEditorEnv.onUserScriptsLoad({ install }, "install");
}

declare global {
    interface Loom extends CoreAPI {}
    var loom: Loom;
    const format: typeof api.formatf;
}

// 保留安装包编译器需要的入口注册标记。
@Laya.regClass()
export class LoomCorePackageEntry {}
