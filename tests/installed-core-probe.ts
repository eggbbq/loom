import { ModuleBase, ModuleManager, ModuleScope, moduleToken, Notifier, msg, ArchiveSystem, CoroutineRunner, WaitForSeconds, pool, CameraRef, Http } from "~/packages/loom.core";

function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

@IEditorEnv.regClass()
export class InstalledCoreProbe {
    static async verify(): Promise<void> {
        check(loom.ModuleBase === ModuleBase && loom.CameraRef === CameraRef && loom.pool === pool, "Core class or singleton identity differs");
        const calls: string[] = [];
        const token = moduleToken<{ name: string }>("probe:core");
        class Probe extends ModuleBase {
            static readonly TOKEN = token;
            name = "probe";
            protected onInit() { calls.push("init"); }
            protected onAdd() { check(this.mods.get(token) === this, "Module not registered before onAdd"); calls.push("add"); }
            protected onStart() { calls.push("start"); }
            protected onStop() { calls.push("stop"); }
            protected onDispose() { calls.push("dispose"); }
        }
        const manager = new ModuleManager(), scope = new ModuleScope(manager);
        scope.register(Probe);
        await scope.start();
        check(manager.get(token)?.name === "probe", "Token lookup failed");
        await scope.stop();
        check(calls.join() === "init,add,start,stop,dispose" && !manager.has(token), "Scope lifecycle/unregister failed");
        const notifier = new Notifier(), message = msg<number, number>("probe:request");
        const listener = (value: number) => value * 2;
        notifier.on(message, listener);
        check(await notifier.request(message, 21) === 42, "Native notifier request failed");
        notifier.off(message, listener);
        check(await notifier.request(message, 21) === undefined, "Notifier unbind failed");
        const node = new Laya.GWidget();
        let data;
        node.on("setData", value => data = value);
        node.setData("value");
        check(node._data === "value" && data === "value", "Native Node extension/event failed");
        node.destroy();
        const vector = pool.v3.rent(1, 2, 3); pool.v3.release(vector);
        check(pool.v3.rent(4, 5, 6) === vector && vector.x === 4 && vector.z === 6, "Native vector pool failed");
        pool.v3.release(vector);
        const archive = new ArchiveSystem(); archive.setUserId("loom-core-probe");
        const key = "loom-core-probe:value", saved = Laya.LocalStorage.getItem(key), version = Laya.LocalStorage.getItem(key + ".version");
        try {
            archive.write("value", "saved");
            const reload = new ArchiveSystem(); reload.setUserId("loom-core-probe");
            check(reload.read("value") === "saved", "Native archive persistence failed");
        } finally {
            if (saved === null) Laya.LocalStorage.removeItem(key); else Laya.LocalStorage.setItem(key, saved);
            if (version === null) Laya.LocalStorage.removeItem(key + ".version"); else Laya.LocalStorage.setItem(key + ".version", version);
        }
        let progressed = 0;
        const runner = new CoroutineRunner();
        const co = runner.start(function* () { progressed++; yield new WaitForSeconds(0.2); progressed++; yield null; progressed++; });
        runner.update(0.1); check(progressed === 1, "Coroutine wait failed");
        runner.update(0.2); check(progressed === 2, "Coroutine progression failed");
        check(runner.stop(co) && co.done && !co.running, "Coroutine cancellation failed");
        runner.update(1); check(progressed === 2, "Stopped coroutine continued executing");
        check(Http.parseHeaders("X-Test: native\r\n")["x-test"] === "native", "HTTP API missing");
        console.log("Installed core: package identity, Scope/token lifecycle, notifier requests, native Node extensions/storage/pools, coroutine cancellation and HTTP exports passed.");
    }
}
