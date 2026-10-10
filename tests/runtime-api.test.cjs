const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { load } = require('./address-mapping-harness.cjs');

test('public runtime exports have distinct names across independently installable packages', () => {
    const ts = require('typescript');
    const files = ['core', 'bt', 'pathfinding', 'ui', 'i18n'].map(name =>
        path.join(__dirname, `../assets/plugins/loom.${name}/runtime/${name}-api.ts`));
    files.push(path.join(__dirname, '../assets/plugins/loom.address/runtime/address-api.ts'));
    const program = ts.createProgram(files, { target: ts.ScriptTarget.ES2020, moduleResolution: ts.ModuleResolutionKind.Node10 });
    const checker = program.getTypeChecker();
    const owners = new Map();
    for (const file of files) {
        const source = program.getSourceFile(file);
        for (const symbol of checker.getExportsOfModule(checker.getSymbolAtLocation(source))) {
            const value = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
            if (!(value.flags & ts.SymbolFlags.Value)) continue;
            assert.equal(owners.has(symbol.name), false, `${symbol.name} exported by both ${owners.get(symbol.name)} and ${file}`);
            owners.set(symbol.name, file);
        }
    }
});

test('runtime installers merge direct exports, preserve the host and restore APIs in either order', () => {
    const host = { tables: {}, i18n: {} };
    const window = { loom: host };
    const plugins = [
        ['core', { ModuleBase: class {}, mods: {}, formatf: {} }],
        ['bt', { BTBuilder: class {}, BTStatus: {} }],
        ['pathfinding', { AStarGrid: class {}, astar: {} }],
        ['ui', { UIPanel: class {}, UISoundIgnore: class {}, ui: { open() {} } }],
    ];
    const installers = plugins.map(([name, api]) => {
        const callbacks = [];
        let reload;
        const entry = load(path.join(__dirname, `../assets/plugins/loom.${name}/index.ts`), {
            window,
            Laya: { regClass: () => type => type, addBeforeInitCallback: fn => callbacks.push(fn) },
            IEditorEnv: { onUserScriptsLoad: (target, key) => { reload = target[key]; } },
        }, { [`./runtime/${name}-api`]: api });
        assert.equal(callbacks.length, 1);
        assert.equal(reload, callbacks[0]);
        for (const [key, value] of Object.entries(api)) {
            assert.equal(host[key], value, 'entry must mount before engine initialization');
            assert.equal(entry[key], value, 'package imports must expose the same API');
        }
        // Engine callbacks do not bind a receiver.
        return { install: callbacks[0], api, name };
    });
    for (const order of [installers, [...installers].reverse()]) {
        for (const { install, api } of order) {
            install.call(undefined);
            assert.equal(window.loom, host);
            for (const [key, value] of Object.entries(api)) assert.equal(host[key], value);
        }
    }
    assert.ok(host.tables && host.i18n);
    assert.equal(host.core, undefined);
    assert.equal(host.bt, undefined);
    assert.equal(host.pathfinding, undefined);
    assert.equal(window.format, host.formatf);
    for (const { install, api } of installers) {
        const replacement = window.loom = { tables: host.tables };
        install.call({});
        assert.equal(window.loom, replacement);
        for (const [key, value] of Object.entries(api)) assert.equal(replacement[key], value);
        const key = Object.keys(api)[0];
        replacement[key] = {};
        install.call(undefined);
        assert.equal(replacement[key], api[key], 'reinstall must replace a stale API');
    }
});

test('UI install hooks only GButton.onClick once and forwards the original registration', () => {
    class GWidget {
        onClick(...args) { this.registrations = (this.registrations ?? 0) + 1; this.registration = args; return 'original-result'; }
    }
    class GButton extends GWidget {
        sound = '';
        getComponent(type) { return this.ignore instanceof type ? this.ignore : null; }
    }
    class UISoundIgnore {}
    const original = GWidget.prototype.onClick;
    const window = {};
    const callbacks = [];
    let reload;
    const ui = { defaultButtonSound: 'default.wav' };
    load(path.join(__dirname, '../assets/plugins/loom.ui/index.ts'), {
        window,
        Laya: { GButton, regClass: () => type => type, addBeforeInitCallback: fn => callbacks.push(fn) },
        IEditorEnv: { onUserScriptsLoad: (target, key) => { reload = target[key]; } },
    }, { './runtime/ui-api': { UISoundIgnore, ui } });
    const wrapped = GButton.prototype.onClick;
    assert.notEqual(wrapped, original);
    assert.equal(GWidget.prototype.onClick, original, 'non-button widgets must remain unchanged');
    for (let iteration = 0; iteration < 100; iteration++) { callbacks[0](); reload(); }
    assert.equal(GButton.prototype.onClick, wrapped, 'install must not stack wrappers');
    assert.equal(GButton.prototype[Symbol.for('loom.ui.GButton.onClick.sound')].original, original,
        'repeated install must retain the engine method rather than another wrapper');
    const button = new GButton();
    const listener = () => {};
    assert.equal(button.onClick(listener), 'original-result');
    assert.equal(button.registrations, 1, 'one onClick call must invoke the engine registration exactly once');
    assert.deepEqual(button.registration, [listener]);
    assert.equal(button.sound, 'default.wav');
    ui.defaultButtonSound = 'next.wav';
    const caller = {}, args = ['payload'];
    button.onClick(caller, listener, args);
    assert.deepEqual(button.registration, [caller, listener, args]);
    assert.equal(button.registration[2], args, 'argument array identity must survive forwarding');
    assert.equal(button.sound, 'default.wav', 'an existing sound must not be replaced');
    const delayed = new GButton();
    delayed.onClick(listener);
    assert.equal(delayed.sound, 'next.wav', 'later registrations must use the current global default');
    button.ignore = new UISoundIgnore();
    button.onClick(listener);
    assert.equal(button.sound, '', 'ignore must suppress even an existing native sound');
});
