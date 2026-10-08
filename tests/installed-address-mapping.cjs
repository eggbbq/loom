const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { environment } = require('./address-mapping-harness.cjs');

async function run() {
    const consumer = process.argv[2], name = 'loom.address';
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'installed-address-'));
    const env = environment(project);
    const hooks = {};
    const classes = {};
    env.globals.IEditorEnv.onLoad = (type, key) => hooks.load = () => type[key]();
    env.globals.IEditorEnv.onUnload = (type, key) => hooks.unload = () => type[key]();
    env.globals.IEditorEnv.onUserScriptsLoad = (target, key) => hooks.scriptsLoad = () => target[key]();
    env.globals.IEditor.onLoad = (type, key) => hooks.uiLoad = () => type[key]();
    env.globals.IEditor.onUnload = (type, key) => hooks.uiUnload = () => type[key]();
    env.globals.window = { __setBundle_: (id, exports) => { assert.equal(id, name); Object.assign(classes, exports); } };
    try {
        for (const kind of ['scene', 'editor']) {
            const file = path.join(consumer, 'library/packages/build', `${name}.${kind}.js`);
            vm.runInNewContext(fs.readFileSync(file, 'utf8'), env.globals, { filename: file });
        }
        env.plugin = classes.LoomAddressMappingPlugin;
        assert.equal(typeof hooks.load, 'function'); assert.equal(typeof hooks.uiLoad, 'function');
        await hooks.load(); hooks.uiLoad();
        assert.equal(typeof hooks.scriptsLoad, 'function');
        hooks.scriptsLoad();
        assert.equal(typeof env.globals.window.loom?.address.load, 'function');
        const reloadedHost = { framework: {}, tb: {} };
        env.globals.window.loom = reloadedHost;
        hooks.scriptsLoad();
        assert.equal(env.globals.window.loom, reloadedHost);
        assert.equal(typeof reloadedHost.address.load, 'function', 'script reload must restore the runtime API');
        assert.ok(reloadedHost.tb);
        const config = env.full('editorResources/address-mapping-watcher/config.json');
        assert.deepEqual(JSON.parse(fs.readFileSync(config)).watchDirs, []);
        env.register('icons', 0); env.register('icons/apple.png');
        await env.changeConfig({ watchDirs: ['icons'], debounceMs: 0 });
        const output = env.full('resources/address.json');
        assert.equal(JSON.parse(fs.readFileSync(output)).apple, 0);
        delete env.assets['icons/apple.png']; env.register('elsewhere/apple.png'); env.emit('elsewhere/apple.png', 3);
        await env.tick(); assert.ok(!('apple' in JSON.parse(fs.readFileSync(output))));
        const original = fs.readFileSync(config, 'utf8'); await hooks.unload(); hooks.uiUnload();
        await hooks.load(); assert.equal(fs.readFileSync(config, 'utf8'), original);
        await hooks.unload(); assert.equal(env.sceneListeners.size, 0); assert.equal(env.uiListeners.size, 0);
        let loads = 0, clears = 0;
        const host = { framework: {}, tb: {} };
        const runtimeGlobals = {
            get loom() { return this.window.loom; },
            Laya: { regClass: () => type => type, addBeforeInitCallback: fn => { fn(); }, Loader: { JSON: 'json' }, loader: {
                load: async url => { loads++; return { data: JSON.parse(fs.readFileSync(path.join(consumer, 'release/web', url), 'utf8')) }; },
                clearRes: () => { clears++; },
            } },
            window: { loom: host, __setBundle_: env.globals.window.__setBundle_ },
        };
        const runtime = path.join(consumer, 'library/packages/build', `${name}.js`);
        vm.runInNewContext(fs.readFileSync(runtime, 'utf8'), runtimeGlobals, { filename: runtime });
        assert.equal(typeof runtimeGlobals.window.loom?.address.load, 'function', 'installed runtime must install the public namespace');
        assert.equal(runtimeGlobals.window.loom, host, 'runtime must preserve the host framework');
        assert.ok(host.tb, 'runtime must preserve other loom members');
        const addresses = await runtimeGlobals.window.loom.address.load();
        assert.equal(host.address.data, addresses);
        assert.deepEqual(JSON.parse(JSON.stringify(addresses)), { apple: 'resources/icons/apple.png', hero: 'portraits/hero.png' });
        assert.equal(loads, 1); assert.equal(clears, 1);
        console.log('Installed bundles: load hooks, config initialization/preservation, UI config forwarding and asset events passed.');
    } finally { if (hooks.unload) await hooks.unload(); if (hooks.uiUnload) hooks.uiUnload(); fs.rmSync(project, { recursive: true, force: true }); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
