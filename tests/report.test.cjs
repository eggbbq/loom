const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { load } = require('./address-mapping-harness.cjs');

test('report forwards variadic arguments to injected functions and observes replacement/removal', () => {
    const inherited = { inherited() { throw Error('inherited channel invoked'); } };
    const window = Object.create(inherited);
    const { report } = load(path.join(__dirname, '../assets/plugins/loom.report/runtime/report.ts'), { window });
    const data = { userId: '123' };
    const callback = () => {};
    const calls = [];
    assert.equal(report.to('analytics', 'login', data), false);
    window.analytics = function (...args) { calls.push({ receiver: this, args }); };
    assert.equal(report.to('analytics', 'login', data, undefined, callback, 0, false, null), true);
    assert.equal(calls[0].receiver, window);
    assert.deepEqual(calls[0].args, ['login', data, undefined, callback, 0, false, null]);
    assert.equal(calls[0].args[1], data);
    assert.equal(calls[0].args[3], callback);
    report.to('analytics');
    assert.equal(calls[1].args.length, 0);
    window.analytics = value => calls.push(value);
    report.to('analytics', data);
    assert.equal(calls[2], data);
    delete window.analytics;
    assert.equal(report.to('analytics', data), false);
    for (const value of [null, 42, 'sdk', { report() { throw Error('object channel invoked'); } }]) {
        window.analytics = value;
        assert.equal(report.to('analytics', data), false);
    }
    assert.equal(report.to('inherited', data), false);
    assert.equal(report.to('toString', data), false);
});

test('report contains lookup, invocation and Promise/thenable errors', async () => {
    const warnings = [];
    const logger = { warn: (...args) => warnings.push(args) };
    const window = {};
    const { report } = load(path.join(__dirname, '../assets/plugins/loom.report/runtime/report.ts'), { window, console: logger });
    const failure = Error('SDK failed');
    Object.defineProperty(window, 'getter', { get() { throw failure; } });
    assert.equal(report.to('getter'), false);
    window.sync = () => { throw failure; };
    assert.equal(report.to('sync', { privateData: 'must not be logged' }), false);
    window.badResult = () => Object.defineProperty({}, 'then', { get() { throw failure; } });
    assert.equal(report.to('badResult'), false);
    window.async = () => Promise.reject(failure);
    assert.equal(report.to('async'), true);
    window.thenable = () => ({ then(_resolve, reject) { reject(failure); } });
    assert.equal(report.to('thenable'), true);
    window.badThenable = () => ({ then() { throw failure; } });
    assert.equal(report.to('badThenable'), true);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(warnings.map(([message]) => message).sort(), ['getter', 'sync', 'badResult', 'async', 'thenable', 'badThenable']
        .map(channel => `[report] "${channel}" failed:`).sort());
    assert.ok(warnings.every(args => args.length === 2 && args[1] === failure));

    window.healthy = () => {};
    assert.equal(report.to('healthy'), true, 'later events still forward after failures');
});

test('enabled gates lookup/forwarding while debug independently controls console traces', () => {
    const logs = [];
    let reads = 0;
    const calls = [];
    const window = {};
    Object.defineProperty(window, 'analytics', { get() {
        reads++;
        return (...args) => calls.push(args);
    } });
    const { report } = load(path.join(__dirname, '../assets/plugins/loom.report/runtime/report.ts'), {
        window, console: { log: (...args) => logs.push(args), warn() {} },
    });
    assert.equal(report.enabled, true);
    assert.equal(report.debug, false);
    const data = { event: 'login' };
    assert.equal(report.to('analytics', data), true);
    assert.equal(logs.length, 0);
    report.enabled = false;
    report.debug = true;
    assert.equal(report.to('analytics', data), false);
    assert.equal(reads, 1, 'disabled calls must not even read the SDK channel');
    assert.equal(calls.length, 1);
    assert.equal(logs.length, 0);
    report.enabled = true;
    const to = report.to;
    assert.equal(to('analytics', 'login', data), true, 'detached method shares singleton settings');
    assert.equal(logs.length, 1);
    assert.deepEqual(logs[0], ['[report] "analytics"', 'login', data]);
    assert.equal(logs[0][2], data);
    report.debug = false;
    assert.equal(report.to('analytics'), true);
    assert.equal(logs.length, 1);
    assert.equal(calls.length, 3, 'turning debug off must keep forwarding');
});

test('report mounts before initialization and recovers on Scene reload while preserving other APIs', () => {
    const host = { sdk: {}, core: {} };
    const window = { loom: host };
    const callbacks = [];
    let reload;
    const globals = { window, Laya: { regClass: () => type => type, addBeforeInitCallback: fn => callbacks.push(fn) },
        IEditorEnv: { onUserScriptsLoad: (target, key) => { reload = () => target[key](); } } };
    const api = load(path.join(__dirname, '../assets/plugins/loom.report/runtime/report.ts'), globals);
    const entry = load(path.join(__dirname, '../assets/plugins/loom.report/index.ts'), globals, { './runtime/report': api });
    assert.equal(host.report, entry.report);
    host.report.enabled = false;
    host.report.debug = true;
    callbacks.forEach(fn => fn());
    assert.equal(window.loom, host);
    assert.ok(host.sdk && host.core);
    window.loom = { other: {} };
    reload();
    assert.equal(window.loom.report, api.report);
    assert.equal(window.loom.report.enabled, false);
    assert.equal(window.loom.report.debug, true);
    assert.ok(window.loom.other);
});
