const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const consumer = process.argv[2];
for (const [file, scene] of [['library/packages/build/loom.core.scene.js', true], ['library/packages/build/loom.core.js', false], ['release/web/js/bundle.js', false]]) {
    const callbacks = [], reloads = [], exports = {}, storage = new Map();
    class Node { event(type, value) { this.lastEvent = [type, value]; } }
    class Vector { setValue(x, y, z) { Object.assign(this, { x, y, z }); } }
    const host = { ui: {}, bt: {}, i18n: {} };
    const ctx = { console, setTimeout, clearTimeout,
        __setBundle_: (_name, values) => Object.assign(exports, values), loom: host,
        Laya: { Node, Script: class {}, Camera: class {}, Vector2: Vector, Vector3: Vector,
            regClass: () => type => type, property: () => () => {},
            addBeforeInitCallback: callback => callbacks.push(callback),
            LocalStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
        },
    };
    ctx.window = ctx;
    if (scene) ctx.IEditorEnv = { regClass: () => type => type, regBuildPlugin: () => type => type, onUserScriptsLoad: (type, key) => reloads.push(() => type[key]()) };
    vm.runInNewContext(fs.readFileSync(path.join(consumer, file), 'utf8'), ctx, { filename: file });
    assert.equal(ctx.loom, host);
    assert.ok(host.core, 'core must be ready before business class/token initialization');
    assert.equal(callbacks.length, 1); callbacks[0]();
    const api = host.core;
    for (const name of ['ModuleBase', 'ModuleScope', 'ModuleManager', 'moduleToken', 'mods', 'Notifier', 'msg', 'ArchiveSystem', 'UserArchiveSyncData', 'CoroutineRunner', 'CoroutineComponent', 'WaitForSeconds', 'CameraRef', 'StateManagerComponent', 'gpool', 'Http', 'HttpError', 'RPCChannel', 'mathf', 'uif', 'formatf', 'arrayf', 'uuidV4']) assert.ok(api[name], `missing ${name}`);
    assert.equal(api.moduleToken('same-token'), 'same-token');
    assert.equal(ctx.format, api.formatf);
    const node = new Node(); node.setData('hello'); assert.equal(node._data, 'hello'); assert.deepEqual(node.lastEvent, ['setData', 'hello']);
    const archive = new api.ArchiveSystem(); archive.setUserId('user'); archive.write('key', 'saved');
    assert.equal(storage.get('user:key'), 'saved'); assert.equal(storage.get('user:key.version'), '1');
    assert.equal(archive.read('key'), 'saved');
    if (scene) { assert.equal(exports.ModuleBase, api.ModuleBase); ctx.loom = {}; reloads[0](); assert.equal(ctx.loom.core, api); }
}
console.log('Installed Scene/Preview and published Web entries provide early loom.core, native storage protocol and all public APIs.');
