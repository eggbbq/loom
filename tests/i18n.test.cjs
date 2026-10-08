const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { load } = require('./address-mapping-harness.cjs');

test('i18n preserves language preferences, replaces dictionaries and releases language bindings', () => {
    const storage = new Map();
    const callbacks = [];
    let reload;
    const window = {};
    const globals = {
        window,
        Laya: {
            regClass: () => type => type,
            addBeforeInitCallback: fn => callbacks.push(fn),
            LocalStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
        },
        IEditorEnv: { onUserScriptsLoad: (target, key) => { reload = () => target[key](); } },
    };
    const root = path.join(__dirname, '../assets/plugins/loom.i18n/runtime');
    const { I18n } = load(path.join(root, 'I18n.ts'), globals);
    const { LangBase } = load(path.join(root, 'lang-base.ts'), globals, { './I18n': { I18n } });
    assert.equal(window.loom, undefined, 'allow the host framework to load before installing the namespace');
    const host = { framework: {}, address: {} };
    window.loom = host;
    callbacks.forEach(fn => fn());
    assert.equal(window.loom, host);
    assert.ok(host.address);
    assert.equal(host.i18n, I18n.inst);
    assert.equal(host.i18n.lang, 'en');
    host.i18n.lang = 'zh';
    assert.equal(storage.get('i18n.lang'), 'zh');
    assert.equal(host.i18n.lang, 'zh');
    class Lang extends LangBase { ok = '确定'; cancel = '取消'; count = 1; }
    const lang = new Lang();
    const unbind = host.i18n.bind(lang);
    assert.equal(lang.ok, '确定', 'preserve defaults until a dictionary is supplied');
    const textMap = { ok: 'OK', cancel: 'Cancel', empty: '', constructor: 'Constructor' };
    host.i18n.settext(textMap);
    textMap.ok = 'Changed outside the plugin';
    assert.equal(lang.ok, 'OK');
    assert.equal(lang.cancel, 'Cancel');
    assert.equal(lang.count, 1);
    assert.equal(host.i18n.gettext('ok'), 'OK');
    assert.equal(host.i18n.gettext('missing'), 'missing');
    assert.equal(host.i18n.gettext('empty'), 'empty');
    assert.equal(host.i18n.gettext('constructor'), 'Constructor');
    host.i18n.settext({ ok: '确定' });
    assert.equal(lang.ok, '确定');
    assert.equal(lang.cancel, 'cancel', 'a new dictionary replaces the previous dictionary');
    lang.translate(); lang.translate();
    assert.equal(lang.ok, '确定', 'repeated translation must not corrupt an internal keys cache');
    assert.equal(host.i18n.gettext('constructor'), 'constructor');
    assert.equal(host.i18n.gettext('__proto__'), '__proto__');
    const late = new Lang();
    const releaseLate = host.i18n.bind(late);
    assert.equal(late.ok, '确定');
    assert.equal(late.cancel, 'cancel');
    unbind(); unbind(); releaseLate();
    host.i18n.settext({ ok: 'Unbound' });
    assert.equal(lang.ok, '确定');
    assert.equal(late.ok, '确定');
    assert.equal(window.lang, undefined, 'standalone package must not create or require a game language global');
    window.loom = { framework: {} };
    reload();
    assert.equal(window.loom.i18n, I18n.inst, 'Scene script reload must preserve the service instance');
    assert.equal(window.loom.i18n.gettext('ok'), 'Unbound');
});
