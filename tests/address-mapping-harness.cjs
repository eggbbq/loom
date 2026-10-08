const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

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
