// Invoked by npm run verify:collector against a freshly installed, isolated consumer.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const consumer = process.argv[2];
assert.ok(consumer, 'provide the isolated consumer project path');
const name = 'loom.atlas';
const bundles = path.join(consumer, 'library/packages/build');

async function checkSceneBootstrap() {
    const file = path.join(bundles, `${name}.scene.js`);
    const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'collector-bootstrap-'));
    const configPath = path.join(projectPath, 'assets/editorResources/manual-atlas-collector/config.json');
    let onLoad;
    let onUnload;
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
        console,
        Laya: { regClass: () => type => type, addBeforeInitCallback() {}, timer: { clear() {} } },
        IEditorEnv: {
            regClass: () => type => type, regBuildPlugin: () => type => type,
            onLoad: (type, key) => { onLoad = () => type[key](); },
            onUnload: (type, key) => { onUnload = () => type[key](); },
            require: module => require(`node:${module}`),
            utils: {
                readJsonAsync: async file => JSON.parse(await fs.promises.readFile(file, 'utf8')),
                writeJsonAsync: async (file, data) => fs.promises.writeFile(file, JSON.stringify(data)),
            },
        },
        EditorEnv: { projectPath, assetMgr: {
            toFullPath: file => path.join(projectPath, 'assets', file),
            onAssetChanged: { add() {}, remove() {} },
        } },
        window: { __setBundle_: (id, exports) => {
            assert.equal(id, name);
            assert.ok(exports.ManualAtlasCollectorPlugin);
        } },
    }, { filename: file });
    try {
        assert.equal(typeof onLoad, 'function');
        await onLoad();
        const created = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        assert.deepEqual(created.atlases, []);
        assert.ok(Array.isArray(created.__doc__) && created.__doc__.some(line => line.includes('UUID')));
        await onUnload();
        const existing = '{"atlases":[],"projectSetting":"keep"}\n';
        fs.writeFileSync(configPath, existing);
        await onLoad();
        assert.equal(fs.readFileSync(configPath, 'utf8'), existing);
        await onUnload();
    } finally {
        fs.unwatchFile(configPath);
        fs.rmSync(projectPath, { recursive: true, force: true });
    }
}

async function checkRuntimeEntry() {
    const file = path.join(bundles, `${name}.js`);
    const payload = JSON.parse(fs.readFileSync(path.join(consumer, 'bin/manual-atlas-collector.json'), 'utf8'));
    assert.ok(!payload.error && payload.atlases.length === 1);
    let beforeInit;
    let fetches = 0;
    const mappings = [];
    const Laya = {
        regClass: () => type => type, LayaEnv: { isPreview: false },
        addBeforeInitCallback: callback => { beforeInit = callback; },
        loader: { fetch: async url => {
            assert.equal(url, 'manual-atlas-collector.json');
            fetches++;
            return payload;
        } },
        Loader: { preLoadedMap: {} }, URL: { formatURL: url => url },
        AtlasInfoManager: { addAtlas: (...args) => mappings.push(args) },
    };
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
        Laya, console, window: { __setBundle_: (id, exports) => {
            assert.equal(id, name);
            assert.ok(exports.ManualAtlasCollectorRuntime);
        } },
    }, { filename: file });
    assert.equal(typeof beforeInit, 'function');
    await beforeInit();
    assert.equal(fetches, 0);
    Laya.LayaEnv.isPreview = true;
    await beforeInit();
    assert.equal(fetches, 1);
    assert.equal(mappings.length, 1);
    assert.equal(mappings[0][2].length, 2);
    assert.equal(Laya.Loader.preLoadedMap[payload.atlases[0].url], payload.atlases[0].description);
}

(async () => {
    await checkSceneBootstrap();
    await checkRuntimeEntry();
    console.log('Installed collector: config initialization and automatic preview registration passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
