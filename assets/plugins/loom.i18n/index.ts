import * as api from "./runtime/i18n-api";
export * from "./runtime/i18n-api";

type I18nAPI = typeof api;

function install() {
    Object.assign(window.loom ??= {} as Loom, api);
}

install();
Laya.addBeforeInitCallback(install);

if (typeof IEditorEnv !== "undefined") {
    IEditorEnv.onUserScriptsLoad({ install }, "install");
}

declare global {
    interface Loom extends I18nAPI {}
    var loom: Loom;
}

// 保留安装包编译器需要的入口注册标记。
@Laya.regClass()
export class LoomI18nPackageEntry {}
