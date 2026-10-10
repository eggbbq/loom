import * as api from "./runtime/ui-api";
export * from "./runtime/ui-api";

type UIAPI = typeof api;
const buttonSoundHookKey = Symbol.for("loom.ui.GButton.onClick.sound");
interface ButtonSoundHook {
    original: Laya.GButton["onClick"];
    ignoreType: typeof api.UISoundIgnore;
}

function install() {
    Object.assign(window.loom ??= {} as Loom, api);
    const prototype = Laya.GButton?.prototype as Laya.GButton & { [buttonSoundHookKey]?: ButtonSoundHook };
    if (!prototype) return;
    const installed = prototype[buttonSoundHookKey];
    if (installed) {
        installed.ignoreType = api.UISoundIgnore;
        return;
    }
    const hook: ButtonSoundHook = { original: prototype.onClick, ignoreType: api.UISoundIgnore };
    Object.defineProperty(prototype, buttonSoundHookKey, { value: hook });
    prototype.onClick = function (this: Laya.GButton, ...args: any[]): void {
        if (this.getComponent(hook.ignoreType)) {
            this.sound = "";
        } else if (!this.sound) {
            this.sound = loom.ui.defaultButtonSound;
        }
        return Reflect.apply(hook.original, this, args);
    } as Laya.GButton["onClick"];
}

install();
Laya.addBeforeInitCallback(install);

if (typeof IEditorEnv !== "undefined") {
    IEditorEnv.onUserScriptsLoad({ install }, "install");
}

declare global {
    interface Loom extends UIAPI {}
    var loom: Loom;
}

// 保留安装包编译器需要的入口注册标记。
@Laya.regClass()
export class LoomUiPackageEntry {}
