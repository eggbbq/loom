const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const consumer = process.argv[2];
assert.ok(consumer, 'provide the isolated consumer project path');
function check(file, scene) {
    const callbacks = [];
    const reloads = [];
    const classes = {};
    const storage = new Map();
    const host = { framework: {}, i18n: {}, address: {}, tb: {} };
    const window = { loom: host, __setBundle_: (name, exports) => { assert.equal(name, 'loom.i18n'); Object.assign(classes, exports); } };
    const context = {
        window, console,
        Laya: {
            regClass: () => type => type, addBeforeInitCallback: callback => callbacks.push(callback),
            LocalStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
        },
    };
    if (scene) context.IEditorEnv = {
        regClass: () => type => type, regBuildPlugin: () => type => type,
        onUserScriptsLoad: (target, key) => reloads.push(() => target[key]()),
    };
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
    assert.ok(window.loom.i18n, 'I18n must mount during module evaluation');
    assert.equal(callbacks.length, 1);
    callbacks[0]();
    assert.equal(window.loom, host);
    assert.ok(host.address && host.tb);
    const service = host.i18n;
    assert.ok(service, 'actual installed/published entry must mount the service');
    if (scene) {
        assert.equal(classes.i18n, service);
        class Lang extends classes.LangBase { ok = '确定'; cancel = '取消'; }
        const lang = new Lang();
        assert.equal(classes.LangBase, host.LangBase);
        service.settext({ ok: 'OK' });
        service.settext({ ok: 'Okay' });
        lang.translate();
        assert.equal(lang.ok, 'Okay');
        assert.equal(lang.cancel, 'cancel');
        assert.equal(reloads.length, 1);
        window.loom = { framework: {} };
        reloads[0]();
        assert.equal(window.loom.i18n, service);
    }
    service.settext({ ok: 'Confirmed' });
    assert.equal(service.gettext('ok'), 'Confirmed');
    assert.equal(service.gettext('missing'), 'missing');
    service.lang = 'zh';
    assert.equal(storage.get('i18n.lang'), 'zh');
}
check(path.join(consumer, 'library/packages/build/loom.i18n.scene.js'), true);
check(path.join(consumer, 'library/packages/build/loom.i18n.js'), false);
check(path.join(consumer, 'release/web/js/bundle.js'), false);
console.log('Installed Scene, Preview and published runtime entries preserve the framework and expose loom.i18n.');
