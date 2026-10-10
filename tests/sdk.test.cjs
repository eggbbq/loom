const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { load } = require('./address-mapping-harness.cjs');
const source = path.resolve('assets/plugins/loom.sdk');

test('SDK generator creates project-owned TS, preserves edits and UUIDs, and accepts unbound CLI calls', () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-sdk-'));
    const globals = {
        IEditorEnv: { regClass: () => type => type, onLoad() {}, require },
        EditorEnv: { projectPath: project, assetMgr: {
            getAsset: () => ({ file: 'loom.sdk.ts.txt' }), getFullPath: () => path.join(source, 'editorResources/loom.sdk/loom.sdk.ts.txt'),
            flushChanges: () => { throw Error('Lifecycle must not wait for asset imports'); },
        } },
    };
    const { LoomSDKPlugin: plugin } = load(path.join(source, 'editor/sdk-plugin.ts'), globals);
    const generate = plugin.generate;
    try {
        assert.equal(generate.call(undefined).created, true);
        const adapter = path.join(project, 'src/loom/loom.sdk.ts');
        const template = path.join(project, 'assets/editorResources/loom.sdk/loom.sdk.ts.txt');
        const config = path.join(project, 'assets/editorResources/loom.sdk/config.json');
        const meta = fs.readFileSync(adapter + '.meta', 'utf8');
        const bundle = path.join(project, 'src/loom/loom.sdk.bundledef');
        const bundleSource = fs.readFileSync(bundle, 'utf8');
        assert.equal(JSON.parse(bundleSource).loadBeforeMain, true);
        assert.equal(JSON.parse(bundleSource).entries[0], 'res://' + JSON.parse(fs.readFileSync(adapter.replace(/\.ts$/, '.entry.ts.meta'), 'utf8')).uuid);
        assert.equal(fs.readFileSync(adapter, 'utf8'), fs.readFileSync(template, 'utf8'));
        assert.ok(fs.readFileSync(adapter.replace(/\.ts$/, '.entry.ts'), 'utf8').includes('class LoomSDKAdapterEntry'));
        for (const file of ['loom.sdk.d.ts', 'loom.wechat.js', 'loom.douyin.js']) {
            const target = path.join(project, 'src/loom', file);
            assert.equal(fs.readFileSync(target, 'utf8'), fs.readFileSync(path.join(source, 'editorResources/loom.sdk', file + '.txt'), 'utf8'));
            if (file.endsWith('.js')) assert.equal(JSON.parse(fs.readFileSync(target + '.meta', 'utf8')).importer.import, false);
        }
        const native = path.join(project, 'src/loom/loom.wechat.js');
        fs.appendFileSync(native, '\n// customized native SDK\n');
        const nativeSource = fs.readFileSync(native, 'utf8'), nativeMeta = fs.readFileSync(native + '.meta', 'utf8');
        assert.ok(!fs.existsSync(adapter.replace(/\.ts$/, '.js')));
        fs.appendFileSync(adapter, '\n// customized project adapter\n');
        const edited = fs.readFileSync(adapter, 'utf8');
        fs.appendFileSync(template, '\n// customized project template\n');
        const customConfig = '{ "output": "src/loom/loom.sdk.ts", "custom": true }\n';
        fs.writeFileSync(config, customConfig);
        plugin.onLoad();
        assert.equal(generate().created, false);
        assert.equal(fs.readFileSync(adapter, 'utf8'), edited);
        assert.equal(fs.readFileSync(config, 'utf8'), customConfig);
        assert.equal(fs.readFileSync(adapter + '.meta', 'utf8'), meta);
        assert.equal(fs.readFileSync(bundle, 'utf8'), bundleSource);
        assert.equal(fs.readFileSync(native, 'utf8'), nativeSource);
        assert.equal(fs.readFileSync(native + '.meta', 'utf8'), nativeMeta);
        fs.unlinkSync(adapter); generate();
        assert.ok(fs.readFileSync(adapter, 'utf8').includes('customized project template'));
        assert.equal(fs.readFileSync(adapter + '.meta', 'utf8'), meta);
        for (const output of ['../outside.ts', '/tmp/outside.ts', 'src/../outside.ts', 'src/a.d.ts', 'assets/a.ts']) {
            fs.writeFileSync(config, JSON.stringify({ output }));
            assert.throws(() => generate(), /Invalid config.output/);
        }
        fs.writeFileSync(config, JSON.stringify({ output: 'src\\custom\\sdk.ts' }));
        assert.equal(generate().output, 'src/custom/sdk.ts');
        const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-sdk-outside-'));
        try {
            fs.symlinkSync(outside, path.join(project, 'src/link'));
            fs.writeFileSync(config, JSON.stringify({ output: 'src/link/sdk.ts' }));
            assert.throws(() => generate(), /escapes project/);
            assert.ok(!fs.existsSync(path.join(outside, 'sdk.ts')));
        } finally { fs.rmSync(outside, { recursive: true, force: true }); }
        // Editor-only resources may be absent from the Scene asset database.
        fs.unlinkSync(template);
        globals.EditorEnv.assetMgr.getAsset = id => id === '9c595c89-6ef3-42ee-9601-4b6be51a933f' ? { file: 'editor/sdk-plugin.d.ts' } : undefined;
        globals.EditorEnv.assetMgr.getFullPath = () => path.join(source, 'editor/sdk-plugin.d.ts');
        fs.writeFileSync(config, JSON.stringify({ output: 'src/loom/loom.sdk.ts' }));
        assert.equal(generate().created, false);
        assert.equal(fs.readFileSync(template, 'utf8'), fs.readFileSync(path.join(source, 'editorResources/loom.sdk/loom.sdk.ts.txt'), 'utf8'));
    } finally { fs.rmSync(project, { recursive: true, force: true }); }
});

function adapterRuntime(native = {}, gameGlobal = false) {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-sdk-runtime-'));
    const { LoomSDKPlugin: generator } = load(path.join(source, 'editor/sdk-plugin.ts'), {
        IEditorEnv: { regClass: () => type => type, onLoad() {}, require },
        EditorEnv: { projectPath: project, assetMgr: {
            getAsset: () => ({}), getFullPath: () => path.join(source, 'editorResources/loom.sdk/loom.sdk.ts.txt'),
        } },
    });
    generator.generate();
    const reloads = [], initializers = [], shared = { custom: true };
    const window = { loom: shared, __sdk: native };
    const globals = { window, __sdk: native,
        Laya: { regClass: () => type => type, addBeforeInitCallback: fn => initializers.push(fn) },
        IEditorEnv: { onUserScriptsLoad: (owner, name) => reloads.push(() => owner[name]()) },
    };
    if (gameGlobal) globals.GameGlobal = { loom: shared, __sdk: native };
    try {
        const core = load(path.join(project, 'src/loom/loom.sdk.ts'), globals);
        const api = load(path.join(project, 'src/loom/loom.sdk.entry.ts'), globals, { './loom.sdk': core });
        return { ...api, shared, window, reloads, initializers };
    } finally { fs.rmSync(project, { recursive: true, force: true }); }
}

test('SDK template matches platform source and generated Laya entry restores the same adapter', () => {
    assert.equal(fs.readFileSync(path.join(source, 'editorResources/loom.sdk/loom.sdk.ts.txt'), 'utf8'), fs.readFileSync('platform/src/loom.sdk.ts', 'utf8'));
    for (const gameGlobal of [false, true]) {
        let config, loggedIn = false;
        const launch = { scene: '0012', query: {} };
        const native = {
            platform: 'douyin',
            init(value) { assert.equal(this, native); config = value; },
            login(options) { assert.equal(this, native); options.success(); },
            getLaunchOptionsSync() { return launch; },
        };
        const env = adapterRuntime(native, gameGlobal), { sdk } = env;
        assert.equal(env.shared.sdk, sdk);
        const settings = { appid: 'platform', debug: false };
        sdk.init(settings);
        assert.equal(config, settings);
        sdk.login({ success() { loggedIn = true; }, fail: assert.fail });
        assert.equal(loggedIn, true);
        assert.equal(sdk.platform, 'douyin');
        assert.equal(sdk.getLaunchOptionsSync(), launch);
        env.window.loom = {};
        env.initializers[0]();
        assert.equal(env.window.loom.sdk, sdk);
        env.window.loom.sdk = null;
        env.reloads[0]();
        assert.equal(env.window.loom.sdk, sdk);
        assert.equal(env.shared.custom, true);
    }
});

test('SDK generator migrates customized legacy template and its UUID without replacing existing adapters', () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-sdk-legacy-'));
    try {
        const folder = path.join(project, 'assets/editorResources/loom.sdk');
        fs.mkdirSync(folder, { recursive: true });
        const old = path.join(folder, 'sdk.txt'), next = path.join(folder, 'loom.sdk.ts.txt');
        const content = fs.readFileSync('platform/src/loom.sdk.ts', 'utf8') + '\n// user template\n';
        fs.writeFileSync(old, content);
        fs.writeFileSync(old + '.meta', '{"uuid":"project-template-id"}\n');
        const { LoomSDKPlugin: generator } = load(path.join(source, 'editor/sdk-plugin.ts'), {
            IEditorEnv: { regClass: () => type => type, onLoad() {}, require },
            EditorEnv: { projectPath: project, assetMgr: { getAsset: () => ({}), getFullPath: () => path.join(source, 'editorResources/loom.sdk/loom.sdk.ts.txt') } },
        });
        generator.generate();
        assert.equal(fs.readFileSync(next, 'utf8'), content);
        assert.equal(JSON.parse(fs.readFileSync(next + '.meta', 'utf8')).uuid, 'project-template-id');
        assert.equal(fs.existsSync(old), false);
        assert.ok(fs.readFileSync(path.join(project, 'src/loom/loom.sdk.ts'), 'utf8').startsWith(content));
        fs.writeFileSync(old, '// another legacy template');
        generator.generate();
        assert.equal(fs.readFileSync(next, 'utf8'), content);
        assert.equal(fs.readFileSync(old, 'utf8'), '// another legacy template');
        // The previous shipped template already has its own Laya entry and singleton.
        const legacyAdapter = fs.readFileSync(fs.existsSync('src/loom/loom.sdk.ts') ? 'src/loom/loom.sdk.ts' : 'src/loom/sdk.ts', 'utf8');
        fs.writeFileSync(next, legacyAdapter);
        fs.unlinkSync(path.join(project, 'src/loom/loom.sdk.ts'));
        generator.generate();
        assert.equal(fs.readFileSync(path.join(project, 'src/loom/loom.sdk.ts'), 'utf8'), legacyAdapter);
    } finally { fs.rmSync(project, { recursive: true, force: true }); }
});


test('SDK generator migrates the old default adapter and bundle with stable UUIDs', () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-sdk-path-'));
    try {
        const folder = path.join(project, 'src/loom');
        fs.mkdirSync(folder, { recursive: true });
        const adapter = fs.readFileSync(fs.existsSync('src/loom/loom.sdk.ts') ? 'src/loom/loom.sdk.ts' : 'src/loom/sdk.ts', 'utf8');
        fs.writeFileSync(path.join(folder, 'sdk.ts'), adapter);
        fs.writeFileSync(path.join(folder, 'sdk.ts.meta'), '{"uuid":"existing-adapter"}');
        const bundle = '{"entries":["res://existing-adapter"],"loadBeforeMain":true}';
        fs.writeFileSync(path.join(folder, 'sdk.bundledef'), bundle);
        fs.writeFileSync(path.join(folder, 'sdk.bundledef.meta'), '{"uuid":"existing-bundle"}');
        const config = path.join(project, 'assets/editorResources/loom.sdk/config.json');
        fs.mkdirSync(path.dirname(config), { recursive: true });
        fs.writeFileSync(config, '{"output":"src/loom/sdk.ts","custom":true}');
        const { LoomSDKPlugin: generator } = load(path.join(source, 'editor/sdk-plugin.ts'), {
            IEditorEnv: { regClass: () => type => type, onLoad() {}, require },
            EditorEnv: { projectPath: project, assetMgr: { getAsset: () => ({}), getFullPath: () => path.join(source, 'editorResources/loom.sdk/loom.sdk.ts.txt') } },
        });
        assert.equal(generator.generate().created, false);
        assert.equal(fs.readFileSync(path.join(folder, 'loom.sdk.ts'), 'utf8'), adapter);
        assert.equal(JSON.parse(fs.readFileSync(path.join(folder, 'loom.sdk.ts.meta'), 'utf8')).uuid, 'existing-adapter');
        assert.equal(fs.readFileSync(path.join(folder, 'loom.sdk.bundledef'), 'utf8'), bundle);
        assert.equal(JSON.parse(fs.readFileSync(path.join(folder, 'loom.sdk.bundledef.meta'), 'utf8')).uuid, 'existing-bundle');
        assert.equal(fs.existsSync(path.join(folder, 'sdk.ts')), false);
        assert.equal(JSON.parse(fs.readFileSync(config, 'utf8')).custom, true);
    } finally { fs.rmSync(project, { recursive: true, force: true }); }
});
