const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { load } = require('./address-mapping-harness.cjs');

test('i18n preserves language preferences, replaces dictionaries and manually refreshes language objects', () => {
    const storage = new Map();
    const callbacks = [];
    let reload;
    const host = { framework: {}, address: {} };
    const window = { loom: host };
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
    const { i18n } = load(path.join(root, 'i18n-service.ts'), globals);
    const { LangBase } = load(path.join(root, 'lang-base.ts'), globals, { './i18n-service': { i18n } });
    const api = { i18n, LangBase };
    const entry = load(path.join(root, '../index.ts'), globals, { './runtime/i18n-api': api });
    assert.equal(entry.i18n, i18n);
    assert.equal(entry.LangBase, LangBase);
    assert.equal(window.loom.LangBase, LangBase);
    assert.equal(window.loom.i18n, i18n, 'module entry mounts before engine initialization');
    callbacks.forEach(fn => fn());
    assert.equal(window.loom, host);
    assert.ok(host.address);
    assert.equal(host.i18n, i18n);
    assert.equal(host.i18n.lang, 'en');
    host.i18n.lang = 'zh';
    assert.equal(storage.get('i18n.lang'), 'zh');
    assert.equal(host.i18n.lang, 'zh');
    class Lang extends LangBase { ok = '确定'; cancel = '取消'; count = 1; }
    const lang = new Lang();
    assert.equal(host.i18n.bind, undefined);
    assert.equal(lang.ok, '确定', 'preserve defaults until a dictionary is supplied');
    const textMap = { ok: 'OK', cancel: 'Cancel', empty: '', constructor: 'Constructor' };
    host.i18n.settext(textMap);
    textMap.ok = 'Changed outside the plugin';
    assert.equal(lang.ok, '确定', 'dictionary replacement must not refresh objects automatically');
    lang.translate();
    assert.equal(lang.ok, 'OK');
    assert.equal(lang.cancel, 'Cancel');
    assert.equal(lang.count, 1);
    assert.equal(host.i18n.gettext('ok'), 'OK');
    assert.equal(host.i18n.gettext('missing'), 'missing');
    assert.equal(host.i18n.gettext('empty'), 'empty');
    assert.equal(host.i18n.gettext('constructor'), 'Constructor');
    host.i18n.settext({ ok: '确定' });
    lang.translate();
    assert.equal(lang.ok, '确定');
    assert.equal(lang.cancel, 'cancel', 'a new dictionary replaces the previous dictionary');
    lang.translate(); lang.translate();
    assert.equal(lang.ok, '确定', 'repeated translation must not corrupt an internal keys cache');
    assert.equal(host.i18n.gettext('constructor'), 'constructor');
    assert.equal(host.i18n.gettext('__proto__'), '__proto__');
    const late = new Lang();
    late.translate();
    assert.equal(late.ok, '确定');
    assert.equal(late.cancel, 'cancel');

    host.i18n.settext({ ok: 'Updated' });
    assert.equal(lang.ok, '确定');
    assert.equal(late.ok, '确定');
    assert.equal(window.lang, undefined, 'standalone package must not create or require a game language global');
    window.loom = { framework: {} };
    reload();
    assert.equal(window.loom.i18n, i18n, 'Scene script reload must preserve the service instance');
    assert.equal(window.loom.i18n.gettext('ok'), 'Updated');
});
