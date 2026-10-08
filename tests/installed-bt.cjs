const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const consumer = process.argv[2];
for (const [file, scene] of [['library/packages/build/loom.bt.scene.js', true], ['library/packages/build/loom.bt.js', false], ['release/web/js/bundle.js', false]]) {
    const callbacks = [], reloads = [], exports = {};
    const window = { __setBundle_: (_name, values) => Object.assign(exports, values) };
    const ctx = { window, console, Laya: { Script: class {}, regClass: () => type => type, property: () => () => {}, addBeforeInitCallback: callback => callbacks.push(callback) } };
    if (scene) ctx.IEditorEnv = { regClass: () => type => type, regBuildPlugin: () => type => type, onUserScriptsLoad: (type, key) => reloads.push(() => type[key]()) };
    vm.runInNewContext(fs.readFileSync(path.join(consumer, file), 'utf8'), ctx, { filename: file });
    assert.equal(window.loom, undefined);
    const host = { framework: {}, ui: {}, i18n: {} };
    window.loom = host;
    assert.equal(callbacks.length, 1); callbacks[0]();
    assert.equal(window.loom, host);
    const api = host.bt;
    for (const name of ['BTAction', 'BTBuilder', 'BTComponent', 'BTCondition', 'BTNode', 'BTParallel', 'BTParallelMode', 'BTRunner', 'BTSelector', 'BTSequence', 'BTStatus', 'BTWait']) assert.ok(api[name], `missing ${name}`);
    const runner = new api.BTRunner(new api.BTBuilder().wait(0.2), {});
    assert.equal(runner.tick(0.1), api.BTStatus.Running);
    assert.equal(runner.tick(0.1), api.BTStatus.Success);
    if (scene) {
        assert.equal(exports.BTBuilder, api.BTBuilder);
        window.loom = {}; reloads[0](); assert.equal(window.loom.bt, api);
    }
}
console.log('Installed Scene/Preview and published Web bundles execute loom.bt with every public API.');
