import type { ISceneHook } from "./scene-types";

export interface SceneService {
    /** 当前钩子对象；可整体替换，不克隆或合并。 */
    hooks: ISceneHook;
}

const managerKey = Symbol.for("loom.scene.SceneManager");
type ManagedScene = typeof Laya.Scene & { [managerKey]?: SceneManager };

export class SceneManager implements SceneService {
    // 保留已安装的实例和钩子，避免 Scene 包重载丢失业务注册或叠加包装。
    static readonly inst: SceneManager = SceneManager.sharedInstance();

    private _hooks: ISceneHook = {};

    private constructor() {}

    get hooks(): ISceneHook {
        return this._hooks;
    }

    set hooks(value: ISceneHook) {
        this._hooks = value;
    }

    private static sharedInstance(): SceneManager {
        const constructor = Laya.Scene as ManagedScene;
        const installed = constructor?.[managerKey];
        if (installed) return installed;
        const manager = new SceneManager();
        if (constructor) Object.defineProperty(constructor, managerKey, { value: manager });
        return manager;
    }
}
