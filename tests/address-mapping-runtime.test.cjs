const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { load } = require('./address-mapping-harness.cjs');

test('runtime loads and expands mappings, preserves special keys and releases the JSON resource', async () => {
    let data = { $path: [['icons', '.png'], ['', '.jpg']], apple: 0, hero: 1, constructor: 0 };
    Object.defineProperty(data, '__proto__', { value: 0, enumerable: true });
    let resource;
    const cleared = [];
    let requested;
    let initialize;
    const existing = { framework: {}, tb: {} };
    const window = { loom: existing };
    const globals = {
        window,
        Laya: {
            addBeforeInitCallback: fn => { initialize = fn; },
            regClass: () => type => type, Loader: { JSON: 'json' },
            loader: {
                load: async (url, type) => { requested = [url, type]; return resource = { data }; },
                clearRes: (url, value) => { assert.equal(value, resource); cleared.push(url); },
            },
        },
    };
    const runtimeDir = path.join(__dirname, '../assets/plugins/loom.address/runtime');
    const runtime = load(path.join(runtimeDir, 'address-mapping-runtime.ts'), globals);
    load(path.join(runtimeDir, '../index.ts'), globals, { './runtime/address-mapping-runtime': runtime });
    assert.equal(typeof window.loom.address.load, 'function', 'module entry mounts before engine initialization');
    initialize();
    assert.equal(window.loom, existing); assert.ok(existing.framework); assert.ok(existing.tb);
    assert.equal('kits' in window.loom, false, 'API must use loom.address directly');
    assert.deepEqual(Object.keys(window.loom.address), ['load', 'data']);
    assert.equal(window.loom.address.data, undefined);
    assert.equal(window.loom.address.load, runtime.LoomAddressMappingRuntime.load);
    const addresses = await window.loom.address.load.call({});
    assert.equal(window.loom.address.data, addresses);
    assert.deepEqual(requested, ['resources/address.json', 'json']);
    assert.deepEqual(JSON.parse(JSON.stringify(addresses)), {
        apple: 'icons/apple.png', hero: 'hero.jpg', constructor: 'icons/constructor.png', ['__proto__']: 'icons/__proto__.png',
    });
    assert.deepEqual(cleared, ['resources/address.json']);
    data = { $path: [] };
    assert.deepEqual(JSON.parse(JSON.stringify(await window.loom.address.load('custom/empty.json'))), {});
    const lastMapping = window.loom.address.data;
    assert.equal(cleared.at(-1), 'custom/empty.json');
    for (data of [null, [], {}, { $path: 'bad' }, { $path: [['icons', 1]] }, { $path: [], apple: 0 }, { $path: [['icons', '.png']], apple: '0' }, { $path: [['icons', '.png']], apple: -1 }]) {
        await assert.rejects(window.loom.address.load(), /Invalid/);
        assert.equal(window.loom.address.data, lastMapping, 'invalid loads must preserve the previous mapping');
        assert.equal(cleared.at(-1), 'resources/address.json', 'invalid mappings must release the resource too');
    }
});
