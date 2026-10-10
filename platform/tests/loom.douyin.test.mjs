import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const env = { appid: 'tt-test', debug: false, interstitialAdUnitId: 'interstitial', rewardedVideoAdUnitId: 'rewarded' };
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup(tt, config = { ...env }) {
  const logs = [];
  tt.onShow ??= () => {};
  const context = { tt, $env: config, console: {
    log: (...args) => logs.push(args), warn: (...args) => logs.push(args), error: (...args) => logs.push(args),
  } };
  runInNewContext(readFileSync(new URL('../dist/loom.douyin.js', import.meta.url), 'utf8'), context);
  return { sdk: context.__sdk, context, logs };
}
function call(sdk, method, extra = {}) {
  return new Promise((resolve, reject) => {
    assert.equal(sdk[method]({ ...extra, success: resolve, fail: reject }), undefined);
  });
}
function ad(overrides = {}) {
  const closes = new Set(), errors = new Set();
  return {
    closes, errors, destroyed: 0, shown: 0,
    onClose(fn) { closes.add(fn); }, offClose(fn) { closes.delete(fn); },
    onError(fn) { errors.add(fn); }, offError(fn) { errors.delete(fn); },
    async load() {}, async show() { this.shown++; },
    async destroy() { this.destroyed++; },
    close(result) { for (const fn of closes) fn(result); },
    error(result) { for (const fn of errors) fn(result); },
    ...overrides,
  };
}
function button() {
  return {
    listener: undefined, hidden: 0, shown: 0, destroyed: 0,
    onTap(fn) { this.listener = fn; }, show() { this.shown++; }, hide() { this.hidden++; },
    destroy() { this.destroyed++; this.listener = undefined; },
  };
}
const style = { left: 20, top: 50, width: 160, height: 40, color: '#123456' };

test('抖音启动参数保留字符串 scene 和扩展数据，直接注入全局', () => {
  const launch = { scene: '021020', query: { source: 'invite' }, extra: { launch_from: 'desktop' } };
  const tt = { getLaunchOptionsSync() { assert.equal(this, tt); return launch; } };
  const { sdk, context } = setup(tt);
  assert.equal(sdk.platform, 'douyin');
  assert.equal(sdk.getLaunchOptionsSync(), launch);
  assert.equal('wx' in context, false);
});

test('登录使用 force，不传微信 timeout；成功与失败均无回调参数', async () => {
  const tt = { login(options) {
    assert.equal(this, tt);
    assert.equal(options.force, true);
    assert.equal('timeout' in options, false);
    options.success({ code: 'code' });
    options.fail({ errMsg: 'late failure' });
  } };
  const { sdk } = setup(tt);
  sdk.init();
  assert.equal(await call(sdk, 'login', { timeout: 1000 }), undefined);
  for (const login of [o => o.success({ anonymousCode: 'anonymous' }), o => o.fail({ errMsg: 'cancel' }), () => { throw new Error('error'); }]) {
    const { sdk } = setup({ login });
    sdk.init();
    await assert.rejects(call(sdk, 'login'), e => e === undefined);
  }
});

test('用户信息和授权查询直接使用 tt，查询保留未询问状态', async () => {
  const userInfo = { nickName: '玩家', avatarUrl: '' };
  const tt = {
    getUserInfo(o) {
      assert.equal(this, tt);
      assert.equal(o.withCredentials, false);
      assert.equal('lang' in o, false);
      o.success({ userInfo });
    },
    getSetting(o) { o.success({ authSetting: { 'scope.userInfo': false } }); },
  };
  const { sdk } = setup(tt);
  sdk.init();
  assert.equal(await call(sdk, 'getUserInfo', { lang: 'en' }), userInfo);
  const result = await call(sdk, 'getSetting');
  assert.equal(result.authSetting['scope.userInfo'], false);
  assert.equal(result.authSetting['scope.camera'], undefined);
});

test('异步按钮就绪前隐藏，点击才获取资料，抑制重复点击和销毁后回调', () => {
  let create, user;
  const native = button();
  const { sdk } = setup({ createInteractiveButton(o) { create = o; }, getUserInfo(o) { user = o; } });
  sdk.init();
  let success = 0, failed = 0;
  const control = sdk.createUserInfoButton({ style, success() { success++; }, fail() { failed++; } });
  assert.equal(create.style.textColor, '#123456');
  assert.equal('color' in create.style, false);
  assert.equal(user, undefined);
  control.hide();
  create.success(native);
  assert.equal(native.hidden, 1);
  native.listener();
  const pending = user;
  native.listener();
  assert.equal(user, pending);
  user.fail({ errMsg: 'deny' });
  assert.equal(failed, 1);
  native.listener();
  user.success({ userInfo: { nickName: '玩家', avatarUrl: '' } });
  assert.equal(success, 1);
  native.listener();
  control.destroy();
  user.success({ userInfo: {} });
  assert.equal(success, 1);
  control.destroy();
  assert.equal(native.destroyed, 1);
});

test('按钮创建前销毁会清理迟到实例，异步创建失败仅通知一次', () => {
  let create;
  const { sdk } = setup({ createInteractiveButton(o) { create = o; } });
  sdk.init();
  let failures = 0;
  const options = { style, success() { assert.fail(); }, fail() { failures++; } };
  const first = sdk.createUserInfoButton(options);
  first.destroy();
  const late = button();
  create.success(late);
  assert.equal(late.destroyed, 1);
  assert.equal(late.listener, undefined);
  const second = sdk.createUserInfoButton(options);
  create.fail({ errMsg: 'error' });
  create.fail({ errMsg: 'repeat' });
  assert.equal(failures, 1);
  second.show();
  second.destroy();
});

test('抖音激励视频不传 multiton，count 优先，完整观看才成功', async () => {
  for (const [result, complete] of [[{ count: 1, isEnded: false }, true], [{ count: 0, isEnded: true }, false], [{ isEnded: true }, true], [{ isEnded: false }, false], [undefined, false]]) {
    const instance = ad();
    const { sdk } = setup({ createRewardedVideoAd(options) {
      assert.deepEqual(Object.keys(options), ['adUnitId']);
      assert.equal(options.adUnitId, 'rewarded');
      return instance;
    } });
    sdk.init();
    const pending = call(sdk, 'showRewardedVideoAd');
    const checked = complete ? pending : assert.rejects(pending, e => e === undefined);
    await tick();
    instance.close(result);
    await checked;
    assert.equal(instance.destroyed, 1);
    assert.equal(instance.closes.size, 0);
    assert.equal(instance.errors.size, 0);
  }
});

test('等待异步广告销毁后才释放并发锁和通知结果', async () => {
  let finishDestroy;
  const instance = ad({ destroy() { return new Promise(resolve => { finishDestroy = resolve; }); } });
  const { sdk } = setup({ createInterstitialAd: () => instance });
  sdk.init();
  let success = false;
  const pending = call(sdk, 'showInterstitialAd').then(() => { success = true; });
  await tick();
  instance.close();
  await tick();
  assert.equal(success, false);
  await assert.rejects(call(sdk, 'showInterstitialAd'), /已有广告/);
  finishDestroy();
  await pending;
  assert.doesNotThrow(() => sdk.init());
});

test('广告错误原样交给插屏 fail，清理失败不覆盖原始错误', async () => {
  const error = { errNo: 1004, errMsg: 'no ad' };
  const instance = ad({ async load() { throw error; }, async destroy() { throw new Error('destroy failed'); } });
  const { sdk, logs } = setup({ createInterstitialAd: () => instance });
  sdk.init();
  await assert.rejects(call(sdk, 'showInterstitialAd'), actual => actual === error);
  assert.equal(instance.shown, 0);
  assert.ok(logs.length);
  sdk.init();
});

test('缺少广告 ID 立即失败；分享仅映射抖音支持的字段', () => {
  let share;
  const { sdk } = setup({ shareAppMessage(o) { share = o; } }, { share: { title: '标题', templateId: 'template', imageUrlId: 'wx-only', imageUrl: 'wx.png' } });
  sdk.init();
  for (const method of ['showInterstitialAd', 'showRewardedVideoAd']) {
    let failed = false;
    assert.equal(sdk[method]({ success() { assert.fail(); }, fail() { failed = true; } }), undefined);
    assert.equal(failed, true);
  }
  sdk.shareAppMessage({ query: 'from=invite', desc: '描述' });
  assert.equal(share.templateId, 'template');
  assert.equal(share.query, 'from=invite');
  assert.equal('imageUrlId' in share, false);
  assert.equal('imageUrl' in share, false);
});

test('侧边栏跳转固定 scene，成功回调无参数且仅调用一次', () => {
  const tt = { navigateToScene(o) {
    assert.equal(this, tt);
    assert.equal(o.scene, 'sidebar');
    o.success({ errMsg: 'ok' });
    o.fail({ errMsg: 'late error' });
  } };
  const { sdk } = setup(tt);
  sdk.init();
  const calls = [];
  assert.equal(sdk.navigateToSidebar({ success: (...args) => calls.push(args), fail() { assert.fail(); } }), undefined);
  assert.deepEqual(calls, [[]]);
});

test('侧边栏未初始化、原生失败和同步异常均通过 fail 通知并记录日志', () => {
  for (const mode of ['uninitialized', 'fail', 'throw']) {
    const error = { errMsg: 'navigateToScene:fail' };
    const { sdk, logs } = setup({ navigateToScene(o) {
      if (mode === 'throw') throw error;
      o.fail(error);
      o.fail(error);
    } });
    if (mode !== 'uninitialized') sdk.init();
    const failures = [];
    assert.equal(sdk.navigateToSidebar({ success() { assert.fail(); }, fail: (...args) => failures.push(args) }), undefined);
    assert.deepEqual(failures, [[]]);
    assert.equal(logs.length, 1);
    if (mode !== 'uninitialized') assert.equal(logs[0][1], error);
  }
});


test('侧边栏识别覆盖多个场景和宿主前缀，排除非侧边栏入口', () => {
  for (const scene of ['021001', '101001', '231001', '021036', '101036', '181036', '261036', '021042', 21036]) {
    const { sdk } = setup({ getLaunchOptionsSync: () => ({ scene, query: {} }) });
    assert.equal(sdk.isFromSidebar(), true, String(scene));
  }
  for (const scene of ['', undefined, '011001', '061001', '021002', '021020', '023001', '024001']) {
    const { sdk } = setup({ getLaunchOptionsSync: () => ({ scene, query: {} }) });
    assert.equal(sdk.isFromSidebar(), false, String(scene));
  }
});

test('明确来源标记优先于场景，覆盖侧边栏高价值区', () => {
  for (const [fields, expected] of [
    [{ launch_from: 'homepage', location: 'sidebar_card' }, true],
    [{ launch_from: 'homepage', location: 'homepage_expand' }, true],
    [{ launch_from: 'other', location: 'sidebar_card' }, false],
    [{ launch_from: 'homepage', location: 'other' }, false],
  ]) {
    const { sdk } = setup({ getLaunchOptionsSync: () => ({ scene: '021036', query: {}, ...fields }) });
    assert.equal(sdk.isFromSidebar(), expected);
  }
});

test('加载时监听 onShow，热启动更新来源，普通切后台保留来源，重复 init 不重复监听', () => {
  let onShow, listeners = 0;
  const cold = { scene: '023001', query: {} };
  const { sdk } = setup({
    onShow(listener) { onShow = listener; listeners++; },
    getLaunchOptionsSync: () => cold,
  });
  assert.equal(listeners, 1);
  assert.equal(sdk.isFromSidebar(), false);
  onShow({ scene: '101036', query: {}, showFrom: 10 });
  assert.equal(sdk.isFromSidebar(), true);
  assert.equal(sdk.getLaunchOptionsSync(), cold);
  onShow({ scene: '', query: {}, showFrom: 0 });
  assert.equal(sdk.isFromSidebar(), true);
  sdk.init(); sdk.init();
  assert.equal(listeners, 1);
  onShow({ scene: '024001', query: {}, showFrom: 10 });
  assert.equal(sdk.isFromSidebar(), false);
  onShow({ scene: '', query: {} });
  assert.equal(sdk.isFromSidebar(), false);
});
