const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { load } = require('./address-mapping-harness.cjs');

const runtimeDir = path.join(__dirname, '../assets/plugins/loom.scene/runtime');
const entryFile = path.join(__dirname, '../assets/plugins/loom.scene/index.ts');
function loadRuntime(globals) {
    const hook = load(path.join(runtimeDir, 'scene-hook.ts'), globals);
    const manager = load(path.join(runtimeDir, 'scene-manager.ts'), globals, { './scene-hook': hook });
    return load(path.join(runtimeDir, 'scene-api.ts'), globals, { './scene-hook': hook, './scene-manager': manager });
}
function environment(native, useDefaults = false) {
    const calls = [];
    const opened = { name: 'Scene' };
    const promise = Promise.resolve(opened);
    const original = native ?? function (...args) { calls.push({ receiver: this, args }); return promise; };
    const loading = [];
    const Scene = { open: original, showLoadingPage: url => loading.push(['show', url]),
        hideLoadingPage: () => loading.push(['hide']) };
    const globals = { window: {}, Laya: { Scene } };
    const api = loadRuntime(globals);
    api.scene.install();
    if (!useDefaults) api.scene.hooks = {};
    return { api, calls, opened, promise, original, Scene, globals, loading };
}

test('scene waits for the hook before the native call and preserves arguments and receiver', async () => {
    const env = environment();
    let finish;
    const gate = new Promise(resolve => { finish = resolve; });
    const param = { level: 1 };
    const complete = {}, progress = {};
    const receiver = { custom: true };
    let hooks = 0;
    env.api.scene.hooks.beforeOpen = async function (url, value) {
        assert.equal(this, env.api.scene.hooks);
        assert.equal(url, 'Battle.ls');
        assert.equal(value, param);
        hooks++;
        await gate;
        value.prepared = true;
    };
    const pending = env.Scene.open.call(receiver, 'Battle.ls', false, param, complete, progress);
    await Promise.resolve();
    assert.equal(hooks, 1);
    assert.equal(env.calls.length, 0, 'native loading must not start while the hook is pending');
    finish();
    assert.equal(await pending, env.opened);
    assert.equal(env.calls.length, 1);
    assert.equal(env.calls[0].receiver, receiver);
    assert.deepEqual(env.calls[0].args, ['Battle.ls', false, param, complete, progress]);
    assert.equal(env.calls[0].args[2], param);
    assert.equal(param.prepared, true);
});

test('scene handles both open overloads, absent/null parameters and hook replacement/clearing', async () => {
    const env = environment();
    const received = [];
    const callback = () => {};
    const progress = () => {};
    env.api.scene.hooks.beforeOpen = (...args) => { received.push(args); };
    await env.Scene.open('Home.ls', true, callback, progress);
    await env.Scene.open('Home.ls');
    await env.Scene.open('Home.ls', true, null);
    assert.deepEqual(received, [['Home.ls', undefined], ['Home.ls', undefined], ['Home.ls', null]]);
    assert.deepEqual(env.calls[0].args, ['Home.ls', true, callback, progress]);
    assert.deepEqual(env.calls[1].args, ['Home.ls']);
    let replacement = 0;
    env.api.scene.hooks.beforeOpen = () => { replacement++; };
    await env.Scene.open('Next.ls');
    assert.equal(replacement, 1);
    env.api.scene.hooks.beforeOpen = undefined;
    assert.equal(env.Scene.open('Direct.ls'), env.promise, 'no hook must retain the native Promise');
    assert.equal(env.calls.length, 5, 'no hook must invoke native synchronously');
});

test('scene rejects hook failures without loading and propagates native failures', async () => {
    const failure = Error('prepare failed');
    const env = environment();
    for (const hook of [() => { throw failure; }, () => Promise.reject(failure),
        () => ({ then(_resolve, reject) { reject(failure); } })]) {
        env.api.scene.hooks.beforeOpen = hook;
        await assert.rejects(env.Scene.open('Blocked.ls'), error => error === failure);
    }
    assert.equal(env.calls.length, 0);
    env.api.scene.hooks.beforeOpen = () => {};
    assert.equal(await env.Scene.open('Healthy.ls'), env.opened);
    const broken = environment(() => Promise.reject(failure));
    broken.api.scene.hooks.beforeOpen = async () => {};
    await assert.rejects(broken.Scene.open('Missing.ls'), error => error === failure);
    const thrown = environment(() => { throw failure; });
    assert.throws(() => thrown.Scene.open('Missing.ls'), error => error === failure);
    thrown.api.scene.hooks.beforeOpen = () => {};
    await assert.rejects(thrown.Scene.open('Missing.ls'), error => error === failure);
});

test('scene snapshots the current hook per call without serializing unrelated opens', async () => {
    const env = environment();
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    env.api.scene.hooks.beforeOpen = () => gate;
    const slow = env.Scene.open('Slow.ls');
    const newer = [];
    env.api.scene.hooks.beforeOpen = url => { newer.push(url); };
    await env.Scene.open('Fast.ls');
    assert.deepEqual(newer, ['Fast.ls']);
    assert.deepEqual(env.calls.map(call => call.args[0]), ['Fast.ls']);
    env.api.scene.hooks.beforeOpen = undefined;
    release();
    await slow;
    assert.deepEqual(env.calls.map(call => call.args[0]), ['Fast.ls', 'Slow.ls']);
});

test('scene accepts whole hook objects and preserves the in-flight object and default identity', async () => {
    const env = environment(undefined, true);
    const service = env.api.scene;
    const defaults = service.hooks;
    assert.equal('defaultHooks' in service, false, 'default object is only exposed through hooks');
    assert.equal(service.hooks, defaults);
    assert.ok(defaults instanceof env.api.SceneHook);
    assert.equal(service, env.api.SceneManager.inst);
    const defaultBefore = defaults.beforeOpen, defaultAfter = defaults.afterOpen;
    assert.equal(await env.Scene.open('Default.ls'), env.opened);
    assert.deepEqual(env.loading, [['show', 'Default.ls'], ['hide']]);
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const steps = [];
    class CustomHooks extends env.api.SceneHook {
        async beforeOpen(url) {
            assert.equal(this, custom);
            steps.push(`before:${url}`);
            await gate;
        }
        afterOpen(url, _param, opened) {
            assert.equal(this, custom);
            assert.equal(opened, env.opened);
            steps.push(`after:${url}`);
        }
    }
    const custom = new CustomHooks();
    service.hooks = custom;
    assert.equal(service.hooks, custom, 'injected object must not be cloned');
    const pending = env.Scene.open('Slow.ls');
    service.hooks = { afterOpen(url) { steps.push(`next:${url}`); } };
    await env.Scene.open('Next.ls');
    release();
    await pending;
    assert.deepEqual(steps, ['before:Slow.ls', 'next:Next.ls', 'after:Slow.ls']);
    assert.equal(defaults.beforeOpen, defaultBefore);
    assert.equal(defaults.afterOpen, defaultAfter);
    service.hooks = defaults;
    assert.equal(await env.Scene.open('Restored.ls'), env.opened);
    defaults.beforeOpen = url => { steps.push(`default:${url}`); };
    await env.Scene.open('ConfiguredDefault.ls');
    assert.equal(steps.at(-1), 'default:ConfiguredDefault.ls');
    service.hooks = {};
    assert.equal(env.Scene.open('Empty.ls'), env.promise);
});

test('default scene hooks wait for optional UI closure and continue when it fails', async () => {
    const env = environment(undefined, true);
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const ui = { async closeAll() { assert.equal(this, ui); await gate; } };
    env.globals.window.loom = { ui };
    const pending = env.Scene.open('Game.ls');
    await Promise.resolve();
    assert.equal(env.calls.length, 0);
    assert.deepEqual(env.loading, []);
    release();
    await pending;
    assert.deepEqual(env.loading, [['show', 'Game.ls'], ['hide']]);

    const failure = Error('UI close failed');
    const errors = [];
    // 用独立模块环境收集默认钩子的日志，不改动其他测试的 console。
    const hook = load(path.join(runtimeDir, 'scene-hook.ts'), { ...env.globals,
        console: { error: (...args) => errors.push(args) } });
    env.api.scene.hooks = new hook.SceneHook();
    for (const closeAll of [() => { throw failure; }, () => Promise.reject(failure)]) {
        ui.closeAll = closeAll;
        assert.equal(await env.Scene.open('Continue.ls'), env.opened);
    }
    assert.equal(errors.length, 2);
    assert.ok(errors.every(args => args[1] === failure));
    // 非函数配置与未安装 UI 同样不阻止加载。
    ui.closeAll = true;
    assert.equal(await env.Scene.open('NoUI.ls'), env.opened);
});

test('scene waits for afterOpen with the returned instance after native completion', async () => {
    const steps = [];
    const opened = { name: 'Scene' };
    let complete;
    const loaded = new Promise(resolve => { complete = () => { steps.push('complete'); resolve(opened); }; });
    const env = environment(() => { steps.push('native'); return loaded; });
    let finish;
    const gate = new Promise(resolve => { finish = resolve; });
    let started;
    const afterStarted = new Promise(resolve => { started = resolve; });
    const param = { level: 1 };
    const hook = env.api.scene.hooks.afterOpen = async function (url, value, result) {
        assert.equal(this, env.api.scene.hooks);
        assert.equal(url, 'Game.ls');
        assert.equal(value, param);
        assert.equal(result, opened);
        steps.push('after');
        started();
        await gate;
        steps.push('after-ready');
    };
    let settled = false;
    const pending = env.Scene.open('Game.ls', true, param).then(result => { settled = true; return result; });
    assert.deepEqual(steps, ['native'], 'after-only must start native loading synchronously');
    env.api.scene.hooks.afterOpen = () => { throw Error('replacement affected in-flight hook'); };
    complete();
    await afterStarted;
    assert.equal(settled, false, 'open must remain pending until afterOpen finishes');
    assert.deepEqual(steps, ['native', 'complete', 'after']);
    finish();
    assert.equal(await pending, opened);
    assert.deepEqual(steps, ['native', 'complete', 'after', 'after-ready']);
    assert.notEqual(env.api.scene.hooks.afterOpen, hook);
});

test('scene skips afterOpen on before/native failures and propagates after failures', async () => {
    const failure = Error('failed');
    const env = environment();
    let after = 0;
    env.api.scene.hooks.afterOpen = () => { after++; };
    env.api.scene.hooks.beforeOpen = () => { throw failure; };
    await assert.rejects(env.Scene.open('Blocked.ls'), error => error === failure);
    assert.equal(after, 0);
    const broken = environment(() => Promise.reject(failure));
    broken.api.scene.hooks.afterOpen = () => { after++; };
    await assert.rejects(broken.Scene.open('Missing.ls'), error => error === failure);
    assert.equal(after, 0);
    env.api.scene.hooks.beforeOpen = undefined;
    for (const hook of [() => { throw failure; }, () => Promise.reject(failure)]) {
        env.api.scene.hooks.afterOpen = hook;
        await assert.rejects(env.Scene.open('Opened.ls'), error => error === failure);
    }
    assert.equal(env.calls.length, 2, 'after failures happen after successful native opens');
    env.api.scene.hooks.afterOpen = undefined;
    assert.equal(env.Scene.open('Direct.ls'), env.promise);
});

test('scene entry mounts before initialization and retains one wrapper/service across reloads', async () => {
    const env = environment();
    const host = { ui: {} };
    const window = { loom: host };
    const callbacks = [];
    let reload;
    Object.assign(env.globals, { window, IEditorEnv: {
        onUserScriptsLoad: (target, key) => { reload = () => target[key](); },
    } });
    Object.assign(env.globals.Laya, { regClass: () => type => type,
        addBeforeInitCallback: callback => callbacks.push(callback) });
    const entry = load(entryFile, env.globals, { './runtime/scene-api': env.api });
    assert.equal(host.scene, entry.scene);
    assert.equal(host.SceneHook, entry.SceneHook);
    assert.equal(host.SceneManager, entry.SceneManager);
    assert.ok(host.ui);
    const wrapped = env.Scene.open;
    let hooks = 0;
    const injected = { beforeOpen: () => { hooks++; } };
    entry.scene.hooks = injected;
    for (let iteration = 0; iteration < 10; iteration++) { callbacks[0](); reload(); }
    const reloaded = loadRuntime(env.globals);
    assert.equal(reloaded.scene, entry.scene);
    assert.equal(reloaded.scene.hooks, injected);
    load(entryFile, env.globals, { './runtime/scene-api': reloaded });
    assert.equal(env.Scene.open, wrapped, 'reload must not stack wrappers');
    window.loom = { other: {} };
    reload();
    assert.equal(window.loom.scene, entry.scene);
    assert.ok(window.loom.other);
    await env.Scene.open('Game.ls');
    assert.equal(hooks, 1);
    assert.equal(env.calls.length, 1);
});
