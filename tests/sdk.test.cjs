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
            getAsset: () => ({ file: 'sdk.txt' }), getFullPath: () => path.join(source, 'editorResources/loom.sdk/sdk.txt'),
            flushChanges: () => { throw Error('Lifecycle must not wait for asset imports'); },
        } },
    };
    const { LoomSDKPlugin: plugin } = load(path.join(source, 'editor/sdk-plugin.ts'), globals);
    const generate = plugin.generate;
    try {
        assert.equal(generate.call(undefined).created, true);
        const adapter = path.join(project, 'src/loom/sdk.ts');
        const template = path.join(project, 'assets/editorResources/loom.sdk/sdk.txt');
        const config = path.join(project, 'assets/editorResources/loom.sdk/config.json');
        const meta = fs.readFileSync(adapter + '.meta', 'utf8');
        const bundle = path.join(project, 'src/loom/sdk.bundledef');
        const bundleSource = fs.readFileSync(bundle, 'utf8');
        assert.equal(JSON.parse(bundleSource).loadBeforeMain, true);
        assert.equal(JSON.parse(bundleSource).entries[0], 'res://' + JSON.parse(meta).uuid);
        assert.equal(fs.readFileSync(adapter, 'utf8'), fs.readFileSync(template, 'utf8'));
        assert.ok(!fs.existsSync(adapter.replace(/\.ts$/, '.js')));
        fs.appendFileSync(adapter, '\n// customized project adapter\n');
        const edited = fs.readFileSync(adapter, 'utf8');
        fs.appendFileSync(template, '\n// customized project template\n');
        const customConfig = '{ "output": "src/loom/sdk.ts", "custom": true }\n';
        fs.writeFileSync(config, customConfig);
        plugin.onLoad();
        assert.equal(generate().created, false);
        assert.equal(fs.readFileSync(adapter, 'utf8'), edited);
        assert.equal(fs.readFileSync(config, 'utf8'), customConfig);
        assert.equal(fs.readFileSync(adapter + '.meta', 'utf8'), meta);
        assert.equal(fs.readFileSync(bundle, 'utf8'), bundleSource);
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
        fs.writeFileSync(config, JSON.stringify({ output: 'src/loom/sdk.ts' }));
        assert.equal(generate().created, false);
        assert.equal(fs.readFileSync(template, 'utf8'), fs.readFileSync(path.join(source, 'editorResources/loom.sdk/sdk.txt'), 'utf8'));
    } finally { fs.rmSync(project, { recursive: true, force: true }); }
});

function adapterRuntime(gameGlobal = false) {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-sdk-runtime-'));
    const file = path.join(project, 'sdk.ts');
    fs.copyFileSync(path.join(source, 'editorResources/loom.sdk/sdk.txt'), file);
    const reloads = [], initializers = [], shared = { custom: true };
    const window = { loom: shared };
    const globals = { window,
        Laya: { regClass: () => type => type, addBeforeInitCallback: fn => initializers.push(fn) },
        IEditorEnv: { onUserScriptsLoad: (owner, name) => reloads.push(() => owner[name]()) },
    };
    if (gameGlobal) globals.GameGlobal = { loom: shared };
    try {
        const api = load(file, globals);
        return { ...api, shared, window, root: gameGlobal ? globals.GameGlobal : window, reloads, initializers };
    } finally { fs.rmSync(project, { recursive: true, force: true }); }
}

test('SDK adapter resolves late-loaded third-party SDK, keeps method receivers and forwards failures and native data', () => {
    for (const gameGlobal of [false, true]) {
        const env = adapterRuntime(gameGlobal), { sdk } = env;
        assert.equal(env.shared.sdk, sdk);
        assert.equal(sdk.platform, 'unknown');
        let fallback = 0;
        sdk.login({ success: () => fallback++, fail: assert.fail });
        sdk.showRewardedVideoAd({ success: () => fallback++, fail: assert.fail });
        assert.equal(fallback, 2, 'preserves reference preview fallbacks');
        const error = { errCode: 1 }, launch = { scene: '0012', query: { from: 'sidebar' } };
        const button = { show() {}, hide() {}, destroy() {} };
        const native = {
            platform: 'douyin',
            init(config) { assert.equal(this, native); this.config = config; },
            getLaunchOptionsSync() { assert.equal(this, native); return launch; },
            login(options) { assert.equal(this, native); options.fail(); },
            getUserInfo(options) { options.success({ nickName: 'user', avatarUrl: 'url' }); },
            getSetting(options) { options.success({ authSetting: { 'scope.userInfo': true } }); },
            createUserInfoButton() { return button; },
            showInterstitialAd(options) { options.fail(error); },
            showRewardedVideoAd(options) { options.fail(); },
            shareAppMessage(options) { this.share = options; },
            navigateToSidebar(options) { options.success(); },
            isFromSidebar() { return true; },
        };
        env.root.minisdk = { sdk: native };
        const globalEnv = { appid: 'app', debug: true };
        env.root.$env = globalEnv;
        sdk.init(); assert.equal(native.config, globalEnv);
        assert.equal(sdk.platform, 'douyin');
        assert.equal(sdk.getLaunchOptionsSync(), launch);
        let failed = 0;
        const options = { success: assert.fail, fail: () => failed++ };
        sdk.login(options); assert.equal(failed, 1);
        assert.equal(options.success, assert.fail, 'does not mutate caller options');
        sdk.showInterstitialAd({ success: assert.fail, fail: value => assert.equal(value, error) });
        sdk.showRewardedVideoAd({ success: assert.fail, fail: () => failed++ });
        assert.equal(failed, 2);
        sdk.getUserInfo({ success: value => assert.equal(value.nickName, 'user'), fail: assert.fail });
        sdk.getSetting({ success: value => assert.equal(value.authSetting['scope.userInfo'], true), fail: assert.fail });
        assert.equal(sdk.createUserInfoButton({ style: { left: 0, top: 0, width: 10, height: 10 }, success() {}, fail: assert.fail }), button);
        const share = { title: 'share', templateId: 'template' };
        sdk.shareAppMessage(share); assert.equal(native.share, share);
        sdk.navigateToSidebar({ success() {}, fail: assert.fail });
        assert.equal(sdk.isFromSidebar(), true);
        const explicit = { platform: 'wechat', init(config) { this.config = config; } };
        sdk.init(globalEnv, explicit); assert.equal(sdk.sdk, explicit); assert.equal(explicit.config, globalEnv);
        assert.equal(env.root.$env, globalEnv);
        assert.equal(env.root.minisdk.sdk, native, 'third-party global is preserved');
        assert.throws(() => sdk.use(sdk), /own implementation/);
        delete env.root.loom.sdk;
        env.reloads[0](); assert.equal(env.root.loom.sdk, sdk);
        env.initializers[0](); assert.equal(env.root.loom.sdk, sdk);
        assert.equal(env.shared.custom, true);
    }
});

test('SDK adapter connects platform __sdk and supplies its global environment', () => {
    const env = adapterRuntime(true), config = { appid: 'platform', debug: false };
    const native = { platform: 'wechat', init() { assert.equal(this, native); } };
    env.root.__sdk = native;
    assert.equal(env.sdk.sdk, native);
    env.sdk.init(config);
    assert.equal(env.root.$env, config);
    assert.equal(env.sdk.platform, 'wechat');
    env.root.__sdk = env.sdk;
    assert.equal(env.sdk.platform, 'unknown', 'self-alias does not recurse');
});
