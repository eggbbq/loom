const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const consumer = process.argv[2];
for (const [file, scene] of [['library/packages/build/loom.ui.scene.js', true], ['library/packages/build/loom.ui.js', false], ['release/web/js/bundle.js', false]]) {
    const callbacks = [], reloads = [], exports = {};
    const window = { __setBundle_: (name, values) => Object.assign(exports, values) };
    const ctx = { window, console, setTimeout, clearTimeout, Laya: {
        Script: class {}, GWidget: class {}, regClass: () => type => type,
        property: () => () => {}, runInEditor: type => type,
        addBeforeInitCallback: callback => callbacks.push(callback),
    } };
    if (scene) ctx.IEditorEnv = {
        regClass: () => type => type, regBuildPlugin: () => type => type,
        onUserScriptsLoad: (type, key) => reloads.push(() => type[key]()),
    };
    vm.runInNewContext(fs.readFileSync(path.join(consumer, file), 'utf8'), ctx, { filename: file });
    assert.equal(window.loom, undefined, 'defer registration until framework is ready');
    const host = { framework: {}, i18n: {}, address: {} };
    window.loom = host;
    assert.equal(callbacks.length, 1);
    callbacks[0]();
    assert.equal(window.loom, host);
    assert.ok(host.ui && typeof host.ui.open === 'function');
    if (scene) {
        assert.equal(exports.UIManager.inst, host.ui);
        for (const name of ['UIPanel', 'UIFrame', 'UICloseButton', 'UILayer', 'UILife', 'UINavMode', 'UIAnimtion', 'UITipsManager', 'UIToolTipsManager', 'findUIEntityInParent']) assert.ok(exports[name], `missing export ${name}`);
        const ui = host.ui;
        window.loom = {};
        assert.equal(reloads.length, 1);
        reloads[0]();
        assert.equal(window.loom.ui, ui);
    }
}
console.log('Installed Scene/Preview and published Web bundles expose loom.ui and retain every package API.');
