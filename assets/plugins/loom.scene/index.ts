import * as api from "./runtime/scene-api";
export * from "./runtime/scene-api";

type SceneAPI = typeof api;

function install(): void {
    api.scene.install();
    Object.assign(window.loom ??= {} as Loom, api);
}

install();
Laya.addBeforeInitCallback(install);

if (typeof IEditorEnv !== "undefined") {
    IEditorEnv.onUserScriptsLoad({ install }, "install");
}

declare global {
    interface Loom extends SceneAPI {}
    var loom: Loom;
}

// 保留安装包编译器需要的入口注册标记。
@Laya.regClass()
export class LoomScenePackageEntry {}
