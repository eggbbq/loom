import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';

const { outputFiles } = await build({
  entryPoints: [new URL('../src/loom.sdk.ts', import.meta.url).pathname],
  bundle: true, format: 'iife', globalName: 'client', write: false,
});
function setup(native, separate = false) {
  const host = { __sdk: native, loom: { existing: true } };
  const context = separate ? { GameGlobal: host } : host;
  context.console = { error() {} };
  runInNewContext(outputFiles[0].text, context);
  return { sdk: context.client.create(), host, context };
}
const methods = ['login', 'getUserInfo', 'getSetting', 'createUserInfoButton',
  'showInterstitialAd', 'showRewardedVideoAd', 'navigateToSidebar'];

test('没有 SDK 或对应方法时，无配置也能安装，所有回调接口成功', () => {
  for (const native of [undefined, {}]) {
    const { sdk } = setup(native);
    assert.doesNotThrow(() => sdk.init());
    for (const method of methods) {
      const successes = [];
      assert.equal(sdk[method]({ success: (...args) => successes.push(args), fail() { assert.fail(); } }), undefined);
      assert.equal(successes.length, 1);
      const args = successes[0];
      if (method === 'getUserInfo' || method === 'createUserInfoButton') {
        assert.equal(args[0].nickName, '');
        assert.equal(args[0].avatarUrl, '');
      } else if (method === 'getSetting') {
        assert.equal(Object.keys(args[0].authSetting).length, 0);
      } else assert.equal(args.length, 0);
    }
    assert.equal(sdk.platform, 'unknown');
    assert.equal(sdk.isFromSidebar(), false);
    assert.equal(Object.keys(sdk.getLaunchOptionsSync().query).length, 0);
    assert.doesNotThrow(() => sdk.shareAppMessage());
  }
});

test('保留平台 this、正常失败和全局覆盖，重复安装不叠加包装', () => {
  const error = { code: 1 };
  const native = { platform: 'wechat', showInterstitialAd(o) {
    assert.equal(this, native);
    o.fail(error);
  } };
  for (const separate of [false, true]) {
    const { sdk, host, context } = setup(native, separate);
    assert.equal(host.loom.sdk, sdk);
    assert.equal(host.loom.existing, true);
    assert.equal(context.loom, host.loom);
    assert.equal(context.client.create().sdk, native);
    let failures = 0;
    sdk.showInterstitialAd({ success() { assert.fail(); }, fail(e) { assert.equal(e, error); failures++; } });
    assert.equal(failures, 1);
  }
});

test('平台调用异常由平台负责，包装层不捕获或转成回调', () => {
  const error = new Error('native');
  const native = Object.fromEntries(methods.map(method => [method, () => { throw error; }]));
  const { sdk } = setup(native);
  for (const method of methods) {
    const failures = [];
    assert.throws(() => sdk[method]({ success() { assert.fail(); }, fail: (...args) => failures.push(args) }), actual => actual === error);
    assert.deepEqual(failures, []);
  }
});

test('同步及异步业务回调抛错均被隔离，不引发第二次结果通知', () => {
  let callbacks;
  const { sdk } = setup({ login(o) { callbacks = o; } });
  let successes = 0, failures = 0;
  sdk.login({ success() { successes++; throw Error('user'); }, fail() { failures++; throw Error('user'); } });
  assert.doesNotThrow(() => callbacks.success());
  assert.doesNotThrow(() => callbacks.fail());
  assert.equal(successes, 1);
  assert.equal(failures, 1);
  const sync = setup({ login(o) { o.success(); } }).sdk;
  failures = 0;
  assert.doesNotThrow(() => sync.login({ success() { throw Error('user'); }, fail() { failures++; } }));
  assert.equal(failures, 0);
  assert.doesNotThrow(() => setup().sdk.login({ success() { throw Error('fallback'); }, fail() { assert.fail(); } }));
});

test('同步接口直接透传，按钮控制对象原样返回', () => {
  const error = new Error('native');
  const throws = () => { throw error; };
  const nativeButton = { show() {}, hide() {}, destroy() {} };
  const { sdk } = setup({ init: throws, getLaunchOptionsSync: throws, isFromSidebar: throws,
    shareAppMessage: throws, createUserInfoButton() { return nativeButton; } });
  for (const method of ['init', 'getLaunchOptionsSync', 'isFromSidebar', 'shareAppMessage']) {
    assert.throws(() => sdk[method](), actual => actual === error);
  }
  assert.equal(sdk.createUserInfoButton({ success() {}, fail() {} }), nativeButton);
});
