const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { load } = require('./address-mapping-harness.cjs');
const source = path.resolve('assets/plugins/loom.scene');

function generator(project) {
    return load(path.join(source, 'editor/scene-hook-generator.ts'), {
        IEditorEnv: { regClass: () => type => type, onLoad() {}, require },
        EditorEnv: { projectPath: project, assetMgr: {
            getAsset: id => id === '358064e9-7050-4fa1-9219-7dafa483d020' ? { file: '~/packages/loom.scene/editorResources/loom.scene/scene-hook.ts.txt' }
                : { file: '~/packages/loom.scene/editor/scene-hook-generator.d.ts' },
            getFullPath: asset => path.join(source, asset.file.replace('~/packages/loom.scene/', '')),
            flushChanges: () => { throw Error('Lifecycle must not wait for imports'); },
        } },
    }).LoomSceneHookGenerator;
}

test('scene hook generator preserves project code and UUID without registering hooks across regeneration', () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-scene-'));
    try {
        const plugin = generator(project), generate = plugin.generate;
        assert.equal(generate.call(undefined).created, true);
        const hook = path.join(project, 'src/loom/scene/scene-hook.ts');
        assert.equal(fs.readFileSync(hook, 'utf8'), fs.readFileSync(path.join(source, 'editorResources/loom.scene/scene-hook.ts.txt'), 'utf8'));
        assert.deepEqual(fs.readdirSync(path.dirname(hook)).sort(), ['scene-hook.ts', 'scene-hook.ts.meta']);
        assert.ok(fs.readFileSync(hook, 'utf8').includes('implements loom.ISceneHook'));
        assert.doesNotMatch(fs.readFileSync(hook, 'utf8'), /@Laya\.regClass|\bimport\b|^\s*SceneHook\.register\(/m);
        fs.appendFileSync(hook, '\n// project modification\n');
        const files = [hook, hook + '.meta'];
        const copies = files.map(file => fs.readFileSync(file, 'utf8'));
        plugin.onLoad();
        assert.equal(generate().created, false);
        files.forEach((file, i) => assert.equal(fs.readFileSync(file, 'utf8'), copies[i]));
        fs.unlinkSync(hook);
        assert.equal(generate().created, true);
        assert.equal(fs.readFileSync(hook + '.meta', 'utf8'), copies[1]);
    } finally { fs.rmSync(project, { recursive: true, force: true }); }
});

test('project hook register is an explicit call and replaces hooks only when requested', () => {
    const scene = { hooks: {} };
    const original = scene.hooks;
    const { SceneHook } = load(path.join(source, 'editorResources/loom.scene/scene-hook.ts.txt'), { loom: { scene } });
    assert.equal(scene.hooks, original, 'loading the class does not register it');
    const register = SceneHook.register;
    register.call(undefined);
    assert.ok(scene.hooks instanceof SceneHook);
    const registered = scene.hooks;
    assert.equal(typeof registered.beforeOpen, 'function');
    assert.equal(typeof registered.afterOpen, 'function');
    SceneHook.register();
    assert.ok(scene.hooks instanceof SceneHook);
    assert.notEqual(scene.hooks, registered, 'explicit re-registration constructs a fresh instance');
});
