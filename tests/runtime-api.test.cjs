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
        ['ui', { UIPanel: class {}, ui: { open() {} } }],
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
