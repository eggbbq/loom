import { SceneHook } from "./src/loom/scene/scene-hook";
import { scene, SceneManager, type ISceneHook } from "~/packages/loom.scene";

/** 只在隔离消费工程运行，验证实际安装包与原生资源加载。 */
@IEditorEnv.regClass()
export class InstalledSceneProbe {
    static async verify(): Promise<void> {
        if (loom.scene !== scene || scene !== SceneManager.inst || loom.SceneManager !== SceneManager)
            throw new Error("Global scene/classes differ from package exports");
        const url = "resources/Scene.ls";
        const originalLoad = Laya.loader.load;
        const originalOpened = Laya.Scene.prototype.onOpened;
        const previousUI = (window.loom as any).ui;
        const hadUI = Object.prototype.hasOwnProperty.call(window.loom, "ui");
        const previousHooks = scene.hooks;
        if (previousHooks.beforeOpen || previousHooks.afterOpen || "SceneHook" in window.loom) throw new Error("Project hook must not register automatically");
        SceneHook.register();
        const defaultHooks = scene.hooks;
        if ("defaultHooks" in scene) throw new Error("Default object must only be exposed through hooks");
        if (!(defaultHooks instanceof SceneHook)) throw new Error("Default hooks must be a SceneHook instance");
        const defaultBefore = defaultHooks.beforeOpen;
        const defaultAfter = defaultHooks.afterOpen;
        const opened: Laya.Scene[] = [];
        let loads = 0;
        let receivedParam: any;
        Laya.loader.load = function (...args: any[]) {
            if (args[0] === url) loads++;
            return Reflect.apply(originalLoad, this, args);
        } as typeof Laya.loader.load;
        Laya.Scene.prototype.onOpened = function (param: any): void {
            receivedParam = param;
            return originalOpened.call(this, param);
        };
        try {
            let release!: () => void;
            const gate = new Promise<void>(resolve => { release = resolve; });
            let releaseAfter!: () => void;
            const afterGate = new Promise<void>(resolve => { releaseAfter = resolve; });
            let notifyAfter!: () => void;
            const afterStarted = new Promise<void>(resolve => { notifyAfter = resolve; });
            const payload = { level: 1, prepared: false };
            const steps: string[] = [];
            let completed: Laya.Scene | undefined;
            let settled = false;
            const customHooks: ISceneHook = {
                async beforeOpen(path, param) {
                    if (this !== customHooks || path !== url || param !== payload)
                        throw new Error("Hook object/path/parameter identity lost");
                    steps.push("before");
                    await gate;
                    param.prepared = true;
                    steps.push("prepared");
                },
                async afterOpen(path, param, value) {
                    if (this !== customHooks || path !== url || param !== payload || value !== completed || !value.parent)
                        throw new Error("After hook lost the native opened scene or hook receiver");
                    steps.push("after");
                    notifyAfter();
                    await afterGate;
                    steps.push("after-ready");
                },
            };
            scene.hooks = customHooks;
            if (scene.hooks !== customHooks) throw new Error("Injected hooks object was cloned");
            const pending = Laya.Scene.open(url, false, payload, Laya.Handler.create(null, (value: Laya.Scene) => {
                completed = value;
                steps.push("complete");
            }), Laya.Handler.create(null, () => {}, null, false));
            pending.then(() => { settled = true; }, () => { settled = true; });
            await Promise.resolve();
            if (loads !== 0 || completed || steps.join() !== "before") throw new Error("Native load started before hook resolved");
            scene.hooks = {
                beforeOpen() { throw new Error("Replacement beforeOpen used by pending call"); },
                afterOpen() { throw new Error("Replacement afterOpen used by pending call"); },
            };
            release();
            await Promise.race([afterStarted, pending.then(() => {
                throw new Error("Open completed without waiting for afterOpen");
            })]);
            if (settled || steps.join() !== "before,prepared,complete,after")
                throw new Error("Open resolved before afterOpen finished");
            releaseAfter();
            const result = await pending;
            opened.push(result);
            if (!(result instanceof Laya.Scene) || result.name !== "SceneFixture" || !result.parent)
                throw new Error("Native scene resource did not open");
            if (loads !== 1 || completed !== result || receivedParam !== payload || !payload.prepared
                || steps.join() !== "before,prepared,complete,after,after-ready") throw new Error("Native arguments/callback/order lost");
            scene.hooks = {};

            let hookParam: any = "unread";
            scene.hooks.beforeOpen = (_path, param) => { hookParam = param; };
            let callbackResult: Laya.Scene | undefined;
            const second = await Laya.Scene.open(url, false, value => { callbackResult = value; }, () => {});
            opened.push(second);
            if (hookParam !== undefined || callbackResult !== second) throw new Error("Callback overload changed");

            const failure = new Error("Expected installed beforeOpen rejection");
            const beforeLoads = loads;
            let afterFailure = 0;
            scene.hooks.afterOpen = () => { afterFailure++; };
            for (const hook of [() => { throw failure; }, () => Promise.reject(failure)]) {
                scene.hooks.beforeOpen = hook;
                let rejected: unknown;
                try { opened.push(await Laya.Scene.open(url)); } catch (error) { rejected = error; }
                if (rejected !== failure || loads !== beforeLoads || afterFailure !== 0)
                    throw new Error("Failed hook did not prevent native load/afterOpen");
            }
            scene.hooks.beforeOpen = undefined;
            scene.hooks.afterOpen = (_path, _param, value) => { opened.push(value); throw failure; };
            let rejected: unknown;
            try { await Laya.Scene.open(url, false); } catch (error) { rejected = error; }
            if (rejected !== failure || loads !== beforeLoads + 1 || !opened[opened.length - 1].parent)
                throw new Error("After failure did not preserve the opened scene and reject");
            scene.hooks = defaultHooks;
            let closeUI!: () => void;
            const closeGate = new Promise<void>(resolve => { closeUI = resolve; });
            const optionalUI = { closeAll() {
                if (this !== optionalUI) throw new Error("Optional UI receiver lost");
                return closeGate;
            } };
            (window.loom as any).ui = optionalUI;
            const thirdPending = Laya.Scene.open(url, false, null);
            await Promise.resolve();
            if (loads !== beforeLoads + 1) throw new Error("Default hook did not await UI closure");
            closeUI();
            const third = await thirdPending;
            opened.push(third);
            if (loads !== beforeLoads + 2 || receivedParam !== null) throw new Error("Cleared hooks did not forward natively");
            if (scene.hooks !== defaultHooks
                || defaultHooks.beforeOpen !== defaultBefore || defaultHooks.afterOpen !== defaultAfter)
                throw new Error("Default hooks changed during custom injection");
            delete (window.loom as any).ui;
            opened.push(await Laya.Scene.open(url, false));
            if (loads !== beforeLoads + 3) throw new Error("Default hook requires the UI package");
            console.log("Installed scene: SceneManager singleton, manually injected project SceneHook with optional UI closure/standalone operation, injected hooks identity, asynchronous before/after gates, native loading, parameter/callback overloads and error propagation passed.");
        } finally {
            scene.hooks = previousHooks;
            Laya.loader.load = originalLoad;
            Laya.Scene.prototype.onOpened = originalOpened;
            if (hadUI) (window.loom as any).ui = previousUI;
            else delete (window.loom as any).ui;
            for (const value of opened) value.destroy();
        }
    }
}
