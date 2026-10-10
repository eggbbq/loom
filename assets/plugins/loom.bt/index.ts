import * as api from "./runtime/bt-api";
export * from "./runtime/bt-api";

type BTAPI = typeof api;

function install() {
    Object.assign(window.loom ??= {} as Loom, api);
}

install();
Laya.addBeforeInitCallback(install);

if (typeof IEditorEnv !== "undefined") {
    IEditorEnv.onUserScriptsLoad({ install }, "install");
}

declare global {
    interface Loom extends BTAPI {}
    var loom: Loom;
}

// 保留安装包编译器需要的入口注册标记。
@Laya.regClass()
export class LoomBtPackageEntry {}
