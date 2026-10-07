// Run: npm test
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const os = require('node:os');
const sourceRoot = path.join(__dirname, '../assets/plugins/manual-atlas-collector');

function load(file, globals) {
    const { outputText } = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, experimentalDecorators: true },
    });
    const exports = {};
    vm.runInNewContext(outputText, { exports, console, ...globals }, { filename: file });
    return exports;
}

const atlas = { id: 'atlas-id', file: 'textures/items.atlas', type: 'atlas' };
const image = { id: 'image-id', file: 'textures/items.png', type: 'image' };
const image2 = { id: 'image2-id', file: 'textures/items2.png', type: 'image' };
const second = { id: 'second-id', file: 'textures/second.atlas', type: 'atlas' };
const assets = [atlas, image, image2, second];
let configExists = true;
let config = { __doc__: ['Usage notes are ignored by atlas collection.'], atlases: ['res://atlas-id', atlas.file] };
let descriptions = {
    [atlas.file]: { frames: { internal: { filename: 'bag.png' }, 'chest.png': {} }, meta: { image: 'items.png,items2.png', prefix: 'icons/' } },
    [second.file]: { frames: { 'bag.png': {} }, meta: { image: 'items.png', prefix: 'icons/' } },
};
const identity = () => type => type;
const sceneMappings = [];
const sceneLaya = {
    regClass: identity, addBeforeInitCallback() {},
    Loader: { preLoadedMap: {} }, URL: { formatURL: url => `scene/${url}` },
    AtlasInfoManager: { addAtlas: (...args) => sceneMappings.push(args) },
};
const previewModule = load(path.join(sourceRoot, 'runtime/manual-atlas-collector-runtime.ts'), { Laya: sceneLaya });
let writtenPreview;
const { ManualAtlasCollectorPlugin: Plugin } = load(path.join(sourceRoot, 'manual-atlas-collector-plugin.ts'), {
    require: id => { assert.equal(id, './runtime/manual-atlas-collector-runtime'); return previewModule; },
    IEditorEnv: {
        regClass: identity, regBuildPlugin: identity, onLoad() {}, onUnload() {},
        AssetType: { Atlas: 'atlas', Image: 'image' }, AssetExportConfigType: { Atlas: 1 },
        require: name => {
            if (name === 'fs') return { promises: { mkdir: async () => {}, rename: async () => {} }, existsSync: file => {
                assert.equal(file, 'editorResources/manual-atlas-collector/config.json');
                return configExists;
            } };
            assert.equal(name, 'path');
            return path;
        },
        utils: {
            readJsonAsync: async file => file.endsWith('config.json') ? config : descriptions[file],
            writeJsonAsync: async (file, data) => { writtenPreview = data; },
        },
    },
    EditorEnv: { projectPath: '/project', assetMgr: {
        toFullPath: file => file, getFullPath: asset => asset.file,
        getAsset: ref => assets.find(asset => asset.id === ref || asset.file === ref),
    } },
});
const task = { logger: { debug() {} } };
async function collect() {
    const plugin = new Plugin();
    const selected = new Set();
    await plugin.onCollectAssets(task, selected);
    return { plugin, selected };
}
const plain = value => JSON.parse(JSON.stringify(value));

async function checkConfigInitialization() {
    const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-atlas-config-'));
    const configPath = path.join(projectPath, 'assets/editorResources/manual-atlas-collector/config.json');
    const { ManualAtlasCollectorPlugin: InstalledPlugin } = load(path.join(sourceRoot, 'manual-atlas-collector-plugin.ts'), {
        require: () => previewModule,
        Laya: { timer: { clear() {} } },
        IEditorEnv: {
            regClass: identity, regBuildPlugin: identity, onLoad() {}, onUnload() {},
            AssetType: { Atlas: 'atlas', Image: 'image' },
            require: name => require(`node:${name}`),
            utils: {
                readJsonAsync: async file => JSON.parse(await fs.promises.readFile(file, 'utf8')),
                writeJsonAsync: async (file, data) => fs.promises.writeFile(file, JSON.stringify(data)),
            },
        },
        EditorEnv: { projectPath, assetMgr: {
            toFullPath: file => path.join(projectPath, 'assets', file),
            onAssetChanged: { add() {}, remove() {} },
        } },
    });
    try {
        await InstalledPlugin.onLoad();
        const created = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        assert.deepEqual(created.atlases, [],
            'first package load must create the missing project directory and empty config');
        assert.ok(Array.isArray(created.__doc__) && created.__doc__.some(line => line.includes('UUID')),
            'new configs must include usage instructions under __doc__');
        assert.deepEqual(JSON.parse(fs.readFileSync(path.join(projectPath, 'bin/manual-atlas-collector.json'), 'utf8')), { atlases: [] });
        await InstalledPlugin.onUnload();
        const existing = '{ "atlases": [], "custom": "preserve formatting and project settings" }\n';
        fs.writeFileSync(configPath, existing);
        await InstalledPlugin.onLoad();
        assert.equal(fs.readFileSync(configPath, 'utf8'), existing, 'reloading/upgrading must preserve existing config bytes');
        await InstalledPlugin.onUnload();
        fs.rmSync(configPath);
        await Promise.all([InstalledPlugin.ensureProjectConfig(), InstalledPlugin.ensureProjectConfig()]);
        assert.deepEqual(JSON.parse(fs.readFileSync(configPath, 'utf8')), created, 'concurrent initialization must safely create one documented config');
        fs.writeFileSync(configPath, 'invalid json');
        await InstalledPlugin.ensureProjectConfig();
        assert.equal(fs.readFileSync(configPath, 'utf8'), 'invalid json', 'existing invalid config must remain available for user correction');
        fs.rmSync(path.dirname(configPath), { recursive: true });
        fs.writeFileSync(path.dirname(configPath), 'directory blocked by a file');
        await assert.rejects(InstalledPlugin.ensureProjectConfig(), error => error.code === 'EEXIST' || error.code === 'ENOTDIR',
            'filesystem errors must not be treated as an existing config');
    } finally {
        fs.unwatchFile(configPath);
        fs.rmSync(projectPath, { recursive: true, force: true });
    }
}

async function run() {
    await checkConfigInitialization();
    const buildTask = { config: { ignoreFilesInBin: ['existing.txt'] } };
    new Plugin().onSetup(buildTask);
    assert.deepEqual(buildTask.config.ignoreFilesInBin, ['existing.txt', 'manual-atlas-collector.json', 'manual-atlas-collector.json.tmp'], 'preview data must be excluded while preserving project exclusions');
    let { plugin, selected } = await collect();
    assert.deepEqual([...selected], [atlas, image, image2], 'UUID/path duplicates must collect one atlas and all image pages');
    let info = { outPath: 'renamed/items.atlas' };
    plugin.onBeforeExportAssets(task, new Map([[atlas, info]]));
    assert.deepEqual(plain(info.config), { t: 1, prefix: 'icons/', frames: ['bag.png', 'chest.png'] });

    delete descriptions[atlas.file].meta.prefix;
    ({ plugin } = await collect());
    info = { outPath: 'renamed/items.atlas' };
    plugin.onBeforeExportAssets(task, new Map([[atlas, info]]));
    assert.equal(info.config.prefix, 'renamed/items/', 'default prefix must follow the exported atlas path');
    config = { atlases: [] };
    assert.equal((await collect()).selected.size, 0, 'an empty selection must register no atlases');
    configExists = false;
    assert.equal((await collect()).selected.size, 0, 'a newly installed package without project config must register no atlases');
    configExists = true;
    config = { atlases: ['unknown.atlas'] };
    await assert.rejects(collect, /找不到手工图集/);
    config = { atlases: [image.file] };
    await assert.rejects(collect, /找不到手工图集/);
    config = { atlases: [atlas.file] };
    descriptions[atlas.file].meta.image = 'missing.png';
    await assert.rejects(collect, /找不到图集整图/);
    descriptions[atlas.file].meta = { image: 'items.png', prefix: 'icons/' };
    config = { atlases: [atlas.file, second.file] };
    ({ plugin } = await collect());
    assert.throws(() => plugin.onBeforeExportAssets(task, new Map([
        [atlas, { outPath: atlas.file }], [second, { outPath: second.file }],
    ])), /子图路径冲突/);

    config = { atlases: [atlas.file] };
    await Plugin.writePreview();
    assert.equal(writtenPreview.atlases.length, 1);
    assert.equal(sceneLaya.Loader.preLoadedMap[`scene/${atlas.file}`], descriptions[atlas.file]);
    assert.deepEqual(plain(sceneMappings), [[atlas.file, 'icons/', ['bag.png', 'chest.png']]],
        'the editor must register atlas mappings immediately after package loading, without beforeInit running');

    // Preview's isPreview flag is set only AFTER scripts are evaluated in the actual IDE.
    let beforeInit;
    let fetches = 0;
    let payload = { atlases: [{ url: atlas.file, description: descriptions[atlas.file] }] };
    const mappings = [];
    const Laya = {
        regClass: identity,
        LayaEnv: { isPreview: false }, addBeforeInitCallback: callback => beforeInit = callback,
        loader: { fetch: async () => { fetches++; return payload; } },
        Loader: { preLoadedMap: {} }, URL: { formatURL: url => `base/${url}` },
        AtlasInfoManager: { addAtlas: (...args) => mappings.push(args) },
    };
    load(path.join(sourceRoot, 'runtime/manual-atlas-collector-runtime.ts'), { Laya });
    assert.equal(typeof beforeInit, 'function');
    await beforeInit();
    assert.equal(fetches, 0, 'published initialization must not request preview metadata');
    Laya.LayaEnv.isPreview = true;
    await beforeInit();
    assert.equal(fetches, 1);
    assert.equal(Laya.Loader.preLoadedMap[`base/${atlas.file}`], payload.atlases[0].description);
    assert.deepEqual(plain(mappings), [[atlas.file, 'icons/', ['bag.png', 'chest.png']]]);
    payload = { atlases: [], error: 'invalid selection' };
    await assert.rejects(beforeInit, /invalid selection/, 'invalid preview config must block initialization');
    console.log('Manual atlas selection, export config, and preview initialization tests passed.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
