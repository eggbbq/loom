import * as api from "./runtime/scene-api";
export * from "./runtime/scene-api";

type SceneAPI = typeof api;
const openHookKey = Symbol.for("loom.scene.Scene.open");
interface OpenHookState {
    original: typeof Laya.Scene.open;
    service: api.SceneManager;
}
type HookedScene = typeof Laya.Scene & { [openHookKey]?: OpenHookState };

function install(): void {
    Object.assign(window.loom ??= {} as Loom, api);
    const constructor = Laya.Scene as HookedScene;
    if (!constructor || constructor[openHookKey]) return;
    const state: OpenHookState = { original: constructor.open, service: api.scene };
    Object.defineProperty(constructor, openHookKey, { value: state });
    constructor.open = function (this: typeof Laya.Scene, ...args: any[]): Promise<Laya.Scene> {
        const hooks = state.service.hooks;
        const beforeOpen = hooks.beforeOpen;
        const afterOpen = hooks.afterOpen;
        // 空 hooks 直接透传，不增加微任务，也不改变原生返回值。
        if (!beforeOpen && !afterOpen) return Reflect.apply(state.original, this, args);
        const receiver = this;
        return (async () => {
            // 第三个参数为函数时是 complete 回调重载，不是打开参数。
            const param = typeof args[2] === "function" ? undefined : args[2];
            if (beforeOpen) await beforeOpen.call(hooks, args[0], param);
            const openedScene: Laya.Scene = await Reflect.apply(state.original, receiver, args);
            if (afterOpen) await afterOpen.call(hooks, args[0], param, openedScene);
            return openedScene;
        })();
    } as typeof Laya.Scene.open;
}

install();
Laya.addBeforeInitCallback(install);

if (typeof IEditorEnv !== "undefined") {
    IEditorEnv.onUserScriptsLoad({ install }, "install");
}

declare global {
    interface Loom extends SceneAPI {}
    var loom: Loom;
    namespace loom {
        /** 全局类型入口；接口编译后不会成为运行时属性。 */
        type ISceneHook = import("./runtime/scene-types").ISceneHook;
    }
}

// 保留安装包编译器需要的入口注册标记。
@Laya.regClass()
export class LoomScenePackageEntry {}
