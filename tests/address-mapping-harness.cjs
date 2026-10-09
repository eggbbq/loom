const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');

exports.load = function load(file, globals, imports = {}) {
    const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, experimentalDecorators: true },
    }).outputText;
    const result = {};
    const context = { exports: result, console, require: id => imports[id], ...globals };
    // 浏览器中的全局 loom 与 window.loom 是同一属性。
    if (context.window) Object.defineProperty(context, 'loom', {
        get: () => context.window.loom,
        set: value => { context.window.loom = value; },
    });
    vm.runInNewContext(output, context, { filename: file });
    return result;
};

exports.environment = function environment(project) {
    const assets = {}, sceneListeners = new Set(), uiListeners = new Set(), timers = new Map(), writes = new Map();
    const full = file => path.join(project, 'assets', file);
    const kinds = { Folder: 0, Image: 1, Json: 2 };
    const flags = { SubAsset: 2, Internal: 256, Memory: 512, Temp: 4096, PackageLike: 139264, BuiltIn: 65536 };
    const delegate = listeners => ({ add(fn, target) { listeners.add({ fn, target }); }, remove(fn, target) {
        for (const item of listeners) if (item.fn === fn && item.target === target) listeners.delete(item);
    } });
    const register = (file, type = kinds.Image) => assets[file] = { id: file, file, type, flags: 0 };
    const globals = {
        window: {},
        Laya: { regClass: () => type => type, addBeforeInitCallback() {}, timer: {
            once(_delay, owner, fn) { timers.set(fn, owner); }, clear(_owner, fn) { timers.delete(fn); },
        } },
        IEditorEnv: {
            regClass: () => type => type, regBuildPlugin: () => type => type, onLoad() {}, onUnload() {}, onUserScriptsLoad() {},
            AssetType: kinds, AssetFlags: flags, AssetChangedFlag: { Modified: 0, New: 1, Deleted: 2, Moved: 3 },
            utils: {
                fileExists: async file => fs.existsSync(file),
                readJsonAsync: async (file, silent) => { try { return JSON.parse(await fs.promises.readFile(file, 'utf8')); } catch (error) { if (!silent) throw error; return null; } },
                writeJsonAsync: async (file, data, space) => fs.promises.writeFile(file, JSON.stringify(data, null, space)),
                scheduleFileWrite: (file, data) => writes.set(file, data),
                flushFileWrites: async file => { await fs.promises.writeFile(file, writes.get(file)); writes.delete(file); },
            },
        },
        EditorEnv: { cliMode: false, assetMgr: {
            allAssets: assets, toFullPath: full, getAsset: file => assets[file], flushChanges: async () => {},
            createFolder: async file => { await fs.promises.mkdir(full(file), { recursive: true }); return register(file, kinds.Folder); },
            createFile: async file => register(file, kinds.Json), onAssetChanged: delegate(sceneListeners),
        } },
        IEditor: { regClass: () => type => type, onLoad() {}, onUnload() {}, menu: () => () => {} },
        gui: { Translations: { create: () => ({ setContent() { return this; }, t: key => key }) } },
        Editor: { assetDb: { onAssetChanged: delegate(uiListeners) }, scene: { runScript: async name => {
            return env.plugin[name.split('.')[1]]();
        } }, showToast() {}, openFile() {} },
    };
    const env = {
        globals, assets, timers, sceneListeners, uiListeners, full, register,
        emit(file, flag, type = kinds.Image) { const asset = assets[file] || { file, type, flags: 0 }; for (const item of sceneListeners) item.fn.call(item.target, asset, flag); },
        async tick() { const pending = [...timers]; timers.clear(); for (const [fn, owner] of pending) fn.call(owner); await env.plugin.queue; },
        async changeConfig(config) {
            fs.writeFileSync(full('editorResources/address-mapping-watcher/config.json'), JSON.stringify(config));
            for (const item of uiListeners) item.fn.call(item.target, 'config', 'editorResources/address-mapping-watcher/config.json');
            await env.plugin.queue;
        },
    };
    return env;
};

// IDE imports wait for lifecycle hooks; flushChanges waits for that same import.
// Exercise both sides of this cycle, including an in-flight generation at unload.
exports.verifyReloadLifecycle = async function verifyReloadLifecycle(env) {
    const plugin = env.plugin, assetMgr = env.globals.EditorEnv.assetMgr;
    const configPath = env.full('editorResources/address-mapping-watcher/config.json');
    const output = env.full('resources/lifecycle.json');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({ watchDirs: ['resources/icons'], output: 'resources/lifecycle.json', debounceMs: 0, runOnStart: true }));
    env.register('resources/icons', 0); env.register('resources/icons/apple.png');
    const originalFlush = assetMgr.flushChanges;
    let importing = true, finishImport, notifyFlush, flushes = 0;
    let imported = new Promise(resolve => finishImport = () => { importing = false; resolve(); });
    assetMgr.flushChanges = async () => { flushes++; notifyFlush?.(); if (importing) await imported; };
    const bounded = async promise => {
        let timer;
        try { return await Promise.race([promise, new Promise((_, reject) => timer = setTimeout(() => reject(Error('Lifecycle blocked by asset import')), 1000))]); }
        finally { clearTimeout(timer); }
    };
    try {
        await bounded(plugin.onLoad());
        assert.equal(flushes, 0, 'onLoad must return before waiting for resource imports');
        assert.equal(env.timers.size, 1, 'IDE startup generation must remain scheduled');
        finishImport(); await env.tick();
        assert.equal(JSON.parse(fs.readFileSync(output)).apple, 0);

        importing = true;
        imported = new Promise(resolve => finishImport = () => { importing = false; resolve(); });
        const waiting = new Promise(resolve => notifyFlush = resolve);
        env.register('resources/icons/new.png');
        const oldTask = plugin.runNow();
        await bounded(waiting);
        await bounded(plugin.onUnload());
        await bounded(plugin.onLoad());
        finishImport(); await oldTask;
        assert.ok(!('new' in JSON.parse(fs.readFileSync(output))), 'unloaded generation must not write after import resumes');
        await env.tick();
        assert.equal(JSON.parse(fs.readFileSync(output)).new, 0, 'reloaded plugin must resume startup generation');
    } finally {
        finishImport(); await plugin.onUnload(); assetMgr.flushChanges = originalFlush;
    }
};
