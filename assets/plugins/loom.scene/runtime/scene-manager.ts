import { SceneHook, type ISceneHook } from "./scene-hook";

export interface SceneService {
    /** 当前钩子对象；可整体替换，不克隆或合并。 */
    hooks: ISceneHook;
}

const openHookKey = Symbol.for("loom.scene.Scene.open");
interface OpenHookState {
    original: typeof Laya.Scene.open;
    service: SceneManager;
}
type HookedScene = typeof Laya.Scene & { [openHookKey]?: OpenHookState };

export class SceneManager implements SceneService {
    // 保留已安装的实例和钩子，避免 Scene 包重载丢失业务注册或叠加包装。
    static readonly inst: SceneManager = (Laya.Scene as HookedScene)?.[openHookKey]?.service ?? new SceneManager();

    private _hooks: ISceneHook = new SceneHook();

    private constructor() {}

    get hooks(): ISceneHook {
        return this._hooks;
    }

    set hooks(value: ISceneHook) {
        this._hooks = value;
    }

    /** 由包入口在首次加载、引擎初始化及 Scene 脚本重载时调用。 */
    install(): void {
        const constructor = Laya.Scene as HookedScene;
        if (!constructor || constructor[openHookKey]) return;
        const state: OpenHookState = { original: constructor.open, service: this };
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
}
