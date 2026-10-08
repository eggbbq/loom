const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { load, environment } = require('./address-mapping-harness.cjs');
const root = path.join(__dirname, '../assets/plugins/address-mapping-watcher/editor');
const core = load(path.join(root, 'address-mapping.ts'), {});
const plain = value => JSON.parse(JSON.stringify(value));

test('protocol, directory order, overlap, hidden files, output exclusion and unsafe keys', () => {
    const config = core.parseConfig({ watchDirs: ['assets/resources/b', 'resources/a', 'resources/b/nested'], extensions: ['PNG', '.jpg'] });
    const files = ['resources/a/apple.png', 'resources/b/z.png', 'resources/b/apple.jpg', 'resources/b/nested/__proto__.png', 'resources/b/.hidden/x.png', 'resources/bb/leak.png'];
    const result = core.collectMapping(config, files.map(file => ({ file })));
    assert.deepEqual(plain(result.mapping), {
        $path: [['resources/b', '.jpg'], ['resources/b/nested', '.png'], ['resources/b', '.png'], ['resources/a', '.png']],
        ['__proto__']: 1, apple: 0, z: 2,
    });
    assert.deepEqual(plain(result.conflicts), { apple: ['resources/b/apple.jpg', 'resources/a/apple.png'] });
    assert.equal(result.files.length, 4);
    assert.throws(() => core.collectMapping(config, [{ file: 'resources/b/$path.png' }]), /reserved key/);
    const jsonConfig = core.parseConfig({ watchDirs: ['resources'], extensions: ['json'] });
    assert.equal(core.collectMapping(jsonConfig, [{ file: jsonConfig.output }]).files.length, 0);
    for (const dir of ['../x', '/tmp/x', 'C:\\tmp', '~/packages/x', 'editorResources/x', 'plugins/x']) assert.throws(() => core.parseConfig({ watchDirs: [dir] }));
    assert.throws(() => core.parseConfig({ watchDirs: [], extensions: [] }));
    assert.throws(() => core.parseConfig({ watchDirs: [], debounceMs: -1 }));
});

test('native lifecycle, configuration events, moves, deletes, coalescing, check and export', async () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'address-mapping-'));
    const env = environment(project);
    const runtime = load(path.join(root, '../runtime/address-mapping-runtime.ts'), env.globals);
    const { LoomAddressMappingPlugin: Plugin } = load(path.join(root, 'address-mapping-plugin.ts'), env.globals, {
        './address-mapping': core, '../runtime/address-mapping-runtime': runtime,
    });
    const { LoomAddressMappingEditor: UI } = load(path.join(root, 'address-mapping-editor.ts'), env.globals, { './address-mapping': core });
    env.plugin = Plugin;
    const configPath = env.full(core.CONFIG_PATH), output = env.full('resources/address.json');
    const read = () => JSON.parse(fs.readFileSync(output, 'utf8'));
    try {
        await Plugin.onLoad(); UI.onLoad();
        assert.deepEqual(JSON.parse(fs.readFileSync(configPath)).watchDirs, []);
        assert.ok(!fs.existsSync(output), 'empty configuration must not overwrite consumer output');
        env.register('resources/icons', 0); env.register('resources/icons/apple.png'); env.register('portraits', 0); env.register('portraits/hero.jpg');
        await env.changeConfig({ watchDirs: ['resources/icons', 'portraits'], debounceMs: 0 });
        assert.deepEqual(read(), { $path: [['resources/icons', '.png'], ['portraits', '.jpg']], apple: 0, hero: 1 });
        const mtime = fs.statSync(output).mtimeMs;
        // Scene/CLI invokes public methods with a different receiver.
        await Plugin.runNow.call({}); await Plugin.check.call({});
        assert.equal(fs.statSync(output).mtimeMs, mtime, 'unchanged output must not be rewritten');
        env.register('resources/icons/chest.png'); env.emit('resources/icons/chest.png', 1); env.emit('resources/icons/chest.png', 0);
        assert.equal(env.timers.size, 1, 'event bursts coalesce');
        await assert.rejects(Plugin.check(), /needs update/);
        assert.ok(!('chest' in read()));
        await env.tick(); assert.equal(read().chest, 0);
        delete env.assets['resources/icons/chest.png']; env.register('outside/chest.png'); env.emit('outside/chest.png', 3);
        await env.tick(); assert.ok(!('chest' in read()), 'moving out must remove stale key');
        delete env.assets['portraits/hero.jpg']; env.emit('portraits/hero.jpg', 2); await env.tick(); assert.ok(!('hero' in read()));
        env.emit('resources/address.json', 0); assert.equal(env.timers.size, 0, 'output must not trigger a feedback loop');
        await env.changeConfig({ watchDirs: ['future'] });
        env.register('future', 0); env.register('future/new.png'); env.emit('future', 1, 0); await env.tick(); assert.equal(read().new, 0);
        const before = fs.readFileSync(output, 'utf8');
        fs.writeFileSync(configPath, '{ invalid json'); await assert.rejects(Plugin.runNow()); assert.equal(fs.readFileSync(output, 'utf8'), before);
        await env.changeConfig({ watchDirs: ['future'] });
        const build = new Plugin(); await build.onStart(); const selected = new Set(); await build.onCollectAssets({}, selected);
        assert.deepEqual([...selected].map(asset => asset.file), ['resources/address.json', 'future/new.png']);
        env.emit('future/new.png', 0); await Plugin.onUnload(); UI.onUnload();
        assert.equal(env.sceneListeners.size, 0); assert.equal(env.uiListeners.size, 0); assert.equal(env.timers.size, 0);
        const existing = fs.readFileSync(configPath, 'utf8'); await Plugin.onLoad(); assert.equal(fs.readFileSync(configPath, 'utf8'), existing); await Plugin.onUnload();
        env.globals.EditorEnv.cliMode = 'run'; fs.rmSync(output); await Plugin.onLoad();
        assert.ok(!fs.existsSync(output), 'CLI initialization must not mask stale output during check');
        await assert.rejects(Plugin.check(), /needs update/); await Plugin.onUnload();
    } finally { await Plugin.onUnload(); UI.onUnload(); fs.rmSync(project, { recursive: true, force: true }); }
});
