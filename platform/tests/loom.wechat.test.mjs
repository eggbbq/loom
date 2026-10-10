import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

function loadSDK(native, platform = "wechat", env = { ...config }) {
  const context = { $env: env };
  if (native !== undefined) context[platform === "wechat" ? "wx" : "tt"] = native;
  runInNewContext(readFileSync(new URL(`../dist/loom.${platform}.js`, import.meta.url), "utf8"), context);
  return context.__sdk;
}

test("平台脚本挂载 __sdk，不创建宿主的 $env", () => {
  for (const platform of ["wechat", "douyin"]) {
    const source = readFileSync(new URL(`../dist/loom.${platform}.js`, import.meta.url), "utf8");
    for (const useGameGlobal of [false, true]) {
      const context = useGameGlobal ? { GameGlobal: {} } : {};
      if (platform === "douyin") context.tt = { onShow() {} };
      runInNewContext(`(function () { ${source}\n})();`, context);
      const target = useGameGlobal ? context.GameGlobal : context;
      assert.equal(target.__sdk.platform, platform);
      assert.deepEqual(Object.keys(target).filter(key => key !== "tt"), ["__sdk"]);
      if (useGameGlobal) assert.deepEqual(Object.keys(context).filter(key => key !== "tt"), ["GameGlobal"]);
    }
  }
});

// 仅测试侧将回调转为可等待的结果，同时验证公开接口不返回 Promise。
function callAd(sdk, method, options = {}) {
  let resolveResult;
  let rejectResult;
  const result = new Promise((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  const returned = sdk[method]({ ...options, success: resolveResult, fail: rejectResult });
  assert.equal(returned, undefined);
  return result;
}

function mockAd(overrides = {}) {
  const closeListeners = new Set();
  const errorListeners = new Set();
  return {
    closeListeners, errorListeners,
    destroyed: 0,
    shown: 0,
    loaded: 0,
    async load() { this.loaded++; },
    async show() { this.shown++; },
    destroy() { this.destroyed++; },
    onClose(listener) { closeListeners.add(listener); },
    offClose(listener) { closeListeners.delete(listener); },
    onError(listener) { errorListeners.add(listener); },
    offError(listener) { errorListeners.delete(listener); },
    close(result) { for (const listener of closeListeners) listener(result); },
    error(result) { for (const listener of errorListeners) listener(result); },
    ...overrides,
  };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));
const config = { interstitialAdUnitId: "interstitial", rewardedVideoAdUnitId: "rewarded" };

function assertReleased(ad) {
  assert.equal(ad.destroyed, 1);
  assert.equal(ad.closeListeners.size, 0);
  assert.equal(ad.errorListeners.size, 0);
}

test("业务能力要求先初始化，初始化不校验广告 ID", async () => {
  const env = { interstitialAdUnitId: "id" };
  const sdk = loadSDK({}, "wechat", env);
  await assert.rejects(callAd(sdk, "login"), (error) => error === undefined);
  await assert.rejects(callAd(sdk, "showInterstitialAd"), { name: "Error", message: "请先调用 __sdk.init()。" });
  assert.throws(() => sdk.shareAppMessage(), { name: "Error", message: "请先调用 __sdk.init()。" });
  env.rewardedVideoAdUnitId = " ";
  assert.doesNotThrow(() => sdk.init());
  delete env.rewardedVideoAdUnitId;
  sdk.init();
  await assert.rejects(callAd(sdk, "login"), (error) => error === undefined);
  await assert.rejects(callAd(sdk, "showRewardedVideoAd"), (error) => error === undefined);
  env.rewardedVideoAdUnitId = "id";
  await assert.rejects(callAd(sdk, "showRewardedVideoAd"), (error) => error === undefined);
});

test("登录保留原生上下文，透传 timeout 并调用无参数 success", async () => {
  const native = { login(options) {
    assert.equal(this, native);
    assert.equal(options.timeout, 3000);
    options.success({ code: "wx-code", errMsg: "login:ok" });
  } };
  const sdk = loadSDK(native);
  sdk.init();
  assert.equal(await callAd(sdk, "login", { timeout: 3000 }), undefined);
  await assert.rejects(callAd(sdk, "login", { timeout: -1 }), (error) => error === undefined);
});

test("登录原生失败、同步异常和空 code 均调用无参数 fail", async () => {
  const error = { errMsg: "login:fail" };
  for (const login of [(o) => o.fail(error), () => { throw error; }]) {
    const sdk = loadSDK({ login });
    sdk.init();
    await assert.rejects(callAd(sdk, "login"), (actual) => actual === undefined);
  }
  const sdk = loadSDK({ login: (o) => o.success({ code: "" }) });
  sdk.init();
  await assert.rejects(callAd(sdk, "login"), (error) => error === undefined);
});

test("插屏等待关闭才完成，阻止跨广告并发，结束后可再次调用", async () => {
  const ads = [];
  const sdk = loadSDK({ createInterstitialAd(options) {
    assert.equal(options.adUnitId, "interstitial");
    const ad = mockAd();
    ads.push(ad);
    return ad;
  }, createRewardedVideoAd() { throw new Error("不应创建并发广告"); } });
  sdk.init();
  const pending = callAd(sdk, "showInterstitialAd");
  let resolved = false;
  void pending.then(() => { resolved = true; });
  await tick();
  assert.equal(ads[0].loaded, 1);
  assert.equal(ads[0].shown, 1);
  assert.equal(resolved, false);
  await assert.rejects(callAd(sdk, "showRewardedVideoAd"), (error) => error === undefined);
  assert.throws(() => sdk.init(), { name: "Error", message: "广告运行期间不能重新初始化。" });
  ads[0].close();
  await pending;
  assertReleased(ads[0]);
  const next = callAd(sdk, "showInterstitialAd");
  await tick();
  ads[1].close();
  await next;
  assertReleased(ads[1]);
});

test("激励视频完整观看调用 success，否则调用 fail，回调无参数", async () => {
  for (const result of [{ isEnded: true }, { isEnded: false }, undefined, {}]) {
    const ad = mockAd();
    const sdk = loadSDK({ createRewardedVideoAd(options) {
      assert.equal(options.adUnitId, "rewarded");
      assert.equal(options.multiton, true);
      return ad;
    } });
    sdk.init();
    const pending = callAd(sdk, "showRewardedVideoAd");
    await tick();
    ad.close(result);
    if (result?.isEnded === true) {
      assert.equal(await pending, undefined);
    } else {
      await assert.rejects(pending, (error) => error === undefined);
    }
    assertReleased(ad);
  }
});

test("加载、展示与事件错误均释放广告且保留原生错误", async () => {
  const error = { errCode: 1004, errMsg: "无广告" };
  for (const mode of ["load", "show", "event", "sync", "create"]) {
    const ad = mockAd({
      load() {
        if (mode === "sync") throw error;
        if (mode === "event") this.error(error);
        return mode === "load" ? Promise.reject(error) : Promise.resolve();
      },
      show() { return Promise.reject(error); },
    });
    const sdk = loadSDK({ createInterstitialAd() {
      if (mode === "create") throw error;
      return ad;
    } });
    sdk.init();
    await assert.rejects(callAd(sdk, "showInterstitialAd"), (actual) => actual === error);
    if (mode !== "create") assertReleased(ad);
    // 失败也释放并发锁，允许重新初始化。
    sdk.init();
  }
});

test("加载尚未完成时出错，迟到的加载成功不会再展示", async () => {
  let finishLoad;
  const ad = mockAd({ load: () => new Promise((resolve) => { finishLoad = resolve; }) });
  const sdk = loadSDK({ createInterstitialAd: () => ad });
  sdk.init();
  const pending = callAd(sdk, "showInterstitialAd");
  const rejected = assert.rejects(pending, /failed/);
  await tick();
  ad.error(new Error("failed"));
  await rejected;
  finishLoad();
  await tick();
  assert.equal(ad.shown, 0);
  assertReleased(ad);
});

test("主动分享读取全局默认配置，单次内容覆盖不修改全局", () => {
  let received;
  const env = { share: { title: "默认标题", query: "from=menu" } };
  const sdk = loadSDK({ shareAppMessage: (options) => { received = options; } }, "wechat", env);
  sdk.init();
  assert.equal(sdk.shareAppMessage({ query: "from=button" }), undefined);
  assert.equal(received.title, "默认标题");
  assert.equal(received.query, "from=button");
  assert.equal(env.share.query, "from=menu");
  env.share.title = "更新标题";
  sdk.shareAppMessage();
  assert.equal(received.title, "更新标题");
  delete env.share;
  sdk.shareAppMessage();
  assert.equal(received.title, undefined);
});

test("保留宿主 $env，替换全局对象后读取新的广告位", async () => {
  const original = { appid: "wx-test", debug: true, ...config };
  const ads = [];
  const ids = [];
  const context = { $env: original, wx: {
    createInterstitialAd({ adUnitId }) {
      ids.push(adUnitId);
      const ad = mockAd();
      ads.push(ad);
      return ad;
    },
  } };
  runInNewContext(readFileSync(new URL("../dist/loom.wechat.js", import.meta.url), "utf8"), context);
  assert.equal(context.$env, original);
  assert.equal(context.$env.appid, "wx-test");
  const sdk = context.__sdk;
  sdk.init();
  const first = callAd(sdk, "showInterstitialAd");
  await tick();
  ads[0].close();
  await first;
  context.$env = { appid: "wx-new", debug: false, interstitialAdUnitId: "new-id" };
  const second = callAd(sdk, "showInterstitialAd");
  await tick();
  ads[1].close();
  await second;
  assert.deepEqual(ids, ["interstitial", "new-id"]);
  context.$env.interstitialAdUnitId = "";
  await assert.rejects(callAd(sdk, "showInterstitialAd"), { name: "Error", message: "未配置插屏广告 ID。" });
});


test("广告重复事件只触发一次回调，回调前已释放资源和并发锁", async () => {
  for (const method of ["showInterstitialAd", "showRewardedVideoAd"]) {
    const ad = mockAd();
    const sdk = loadSDK({ createInterstitialAd: () => ad, createRewardedVideoAd: () => ad });
    sdk.init();
    let successes = 0;
    let failures = 0;
    assert.equal(sdk[method]({
      success() {
        successes++;
        assertReleased(ad);
        sdk.init();
      },
      fail() { failures++; },
    }), undefined);
    await tick();
    const close = [...ad.closeListeners][0];
    const error = [...ad.errorListeners][0];
    close({ isEnded: true });
    close({ isEnded: true });
    error({ errMsg: "late error" });
    await tick();
    assert.equal(successes, 1);
    assert.equal(failures, 0);
  }
});


test("初始化要求宿主提供全局 $env，加载后可补充配置", () => {
  const context = { wx: {} };
  runInNewContext(readFileSync(new URL("../dist/loom.wechat.js", import.meta.url), "utf8"), context);
  assert.equal("$env" in context, false);
  assert.throws(() => context.__sdk.init(), { name: "Error", message: "请先提供全局 $env 配置。" });
  context.$env = { appid: "wx-test", debug: false };
  assert.doesNotThrow(() => context.__sdk.init());
});


test("激励视频错误只通过无参数 fail 通知，原生详情记录到日志", async () => {
  const logs = [];
  const nativeError = { errCode: 1004, errMsg: "无广告" };
  const context = {
    $env: { ...config },
    console: { error: (...args) => logs.push(args) },
    wx: { createRewardedVideoAd() { throw nativeError; } },
  };
  runInNewContext(readFileSync(new URL("../dist/loom.wechat.js", import.meta.url), "utf8"), context);
  context.__sdk.init();
  let successes = 0;
  const failures = [];
  assert.equal(context.__sdk.showRewardedVideoAd({
    success() { successes++; },
    fail(...args) { failures.push(args); },
  }), undefined);
  await tick();
  assert.equal(successes, 0);
  assert.deepEqual(failures, [[]]);
  assert.equal(logs.length, 1);
  assert.equal(logs[0][1], nativeError);
});


test("登录重复结果只通知一次，失败详情记录在 SDK 日志中", () => {
  for (const succeeded of [true, false]) {
    const logs = [];
    const error = { errMsg: "login:fail" };
    const context = {
      $env: { ...config },
      console: { log: (...args) => logs.push(args), error: (...args) => logs.push(args) },
      wx: { login(options) {
        if (!succeeded) options.fail(error);
        options.success({ code: "code" });
        options.fail(error);
      } },
    };
    runInNewContext(readFileSync(new URL("../dist/loom.wechat.js", import.meta.url), "utf8"), context);
    context.__sdk.init();
    const calls = [];
    assert.equal(context.__sdk.login({
      success: (...args) => calls.push(["success", args]),
      fail: (...args) => calls.push(["fail", args]),
    }), undefined);
    assert.deepEqual(calls, [[succeeded ? "success" : "fail", []]]);
    assert.equal(logs.length, 1);
    if (!succeeded) assert.equal(logs[0][1], error);
  }
});


test("启动参数在初始化前同步读取，保留原生字段和调用上下文", () => {
  const result = {
    scene: 1007,
    query: { from: "invite", player: "123" },
    referrerInfo: { appId: "source", extraData: { level: 2 } },
    shareTicket: "ticket",
    platformExtra: "保留扩展字段",
  };
  const native = { getLaunchOptionsSync() {
    assert.equal(this, native);
    return result;
  } };
  const sdk = loadSDK(native);
  assert.equal(sdk.getLaunchOptionsSync(), result);
  result.referrerInfo = undefined;
  result.query = {};
  assert.equal(sdk.getLaunchOptionsSync(), result);
});

test("启动参数原生报错直接抛出", () => {
  const error = new Error("native failure");
  const sdk = loadSDK({ getLaunchOptionsSync() { throw error; } });
  assert.throws(() => sdk.getLaunchOptionsSync(), (actual) => actual === error);
});


test("用户信息通过 success 返回，保留上下文且不请求加密凭证", async () => {
  const userInfo = { nickName: "玩家", avatarUrl: "https://example.com/avatar.png" };
  const native = { getUserInfo(options) {
    assert.equal(this, native);
    assert.equal(options.lang, "zh_CN");
    assert.equal(options.withCredentials, false);
    options.success({ userInfo });
    options.fail({ errMsg: "late failure" });
  } };
  const sdk = loadSDK(native);
  sdk.init();
  assert.equal(await callAd(sdk, "getUserInfo", { lang: "zh_CN" }), userInfo);
});

test("用户信息未初始化、缺少 API、拒绝授权、空结果及同步异常均调用 fail", async () => {
  await assert.rejects(callAd(loadSDK({}), "getUserInfo"), (error) => error === undefined);
  const error = { errMsg: "getUserInfo:fail auth deny" };
  for (const native of [
    {},
    { getUserInfo: (o) => o.fail(error) },
    { getUserInfo: (o) => o.success({}) },
    { getUserInfo() { throw error; } },
  ]) {
    const sdk = loadSDK(native);
    sdk.init();
    await assert.rejects(callAd(sdk, "getUserInfo"), (actual) => actual === undefined);
  }
});

test("用户信息回调只触发一次，用户回调异常不会变成接口失败", () => {
  const info = { nickName: "玩家", avatarUrl: "" };
  const sdk = loadSDK({ getUserInfo(o) { o.success({ userInfo: info }); o.success({ userInfo: info }); } });
  sdk.init();
  let count = 0;
  sdk.getUserInfo({ success() { count++; }, fail() { assert.fail("不应失败"); } });
  assert.equal(count, 1);
  const error = new Error("user callback");
  assert.throws(() => sdk.getUserInfo({
    success() { throw error; }, fail() { assert.fail("不应触发 fail"); },
  }), (actual) => actual === error);
});

test("授权查询保留 true、false 和未询问状态，查询失败不伪装成未授权", async () => {
  for (const authSetting of [{ 'scope.userInfo': true }, { 'scope.userInfo': false }, {}]) {
    const native = { getSetting(options) {
      assert.equal(this, native);
      options.success({ authSetting });
    } };
    const sdk = loadSDK(native);
    sdk.init();
    const result = await callAd(sdk, "getSetting");
    assert.equal(result.authSetting['scope.userInfo'], authSetting['scope.userInfo']);
  }
  for (const native of [{}, { getSetting(o) { o.fail({ errMsg: 'fail' }); } }, { getSetting(o) { o.success({}); } }]) {
    const sdk = loadSDK(native);
    sdk.init();
    await assert.rejects(callAd(sdk, "getSetting"), (error) => error === undefined);
  }
  await assert.rejects(callAd(loadSDK({}), "getSetting"), (error) => error === undefined);
});

function mockUserInfoButton() {
  const listeners = new Set();
  return {
    listeners,
    shown: 0, hidden: 0, destroyed: 0,
    onTap(listener) { listeners.add(listener); },
    offTap(listener) { listeners.delete(listener); },
    show() { this.shown++; },
    hide() { this.hidden++; },
    destroy() { this.destroyed++; },
    tap(result) { for (const listener of listeners) listener(result); },
  };
}
const buttonStyle = { left: 100, top: 200, width: 200, height: 40 };

test("授权按钮透传样式、拒绝后可重试，游戏控制显隐和销毁", () => {
  const nativeButton = mockUserInfoButton();
  const native = { createUserInfoButton(options) {
    assert.equal(this, native);
    assert.equal(options.type, 'text');
    assert.equal(options.text, '授权');
    assert.equal(options.style.left, 100);
    assert.equal(options.style.backgroundColor, '#07c160');
    assert.equal(options.withCredentials, false);
    return nativeButton;
  } };
  const sdk = loadSDK(native);
  sdk.init();
  const info = { nickName: '玩家', avatarUrl: '' };
  let failures = 0;
  const results = [];
  const button = sdk.createUserInfoButton({
    text: '授权', style: buttonStyle,
    success(result) { results.push(result); },
    fail(...args) { assert.equal(args.length, 0); failures++; },
  });
  button.hide();
  button.show();
  assert.equal(nativeButton.hidden, 1);
  assert.equal(nativeButton.shown, 1);
  nativeButton.tap({ errMsg: 'auth deny' });
  nativeButton.tap({ userInfo: info });
  assert.equal(failures, 1);
  assert.deepEqual(results, [info]);
  const lateListener = [...nativeButton.listeners][0];
  button.destroy();
  button.destroy();
  button.show();
  button.hide();
  lateListener({ userInfo: info });
  assert.equal(results.length, 1);
  assert.equal(nativeButton.destroyed, 1);
  assert.equal(nativeButton.listeners.size, 0);
  assert.equal(nativeButton.shown, 1);
  assert.equal(nativeButton.hidden, 1);
});

test("授权按钮创建失败通过 fail 通知，监听注册失败清理实例", () => {
  for (const mode of ['uninitialized', 'unsupported', 'style', 'image', 'create', 'listen']) {
    const nativeButton = mockUserInfoButton();
    if (mode === 'listen') nativeButton.onTap = () => { throw new Error('listen failed'); };
    const sdk = loadSDK(mode === 'unsupported' ? {} : { createUserInfoButton() {
      if (mode === 'create') throw new Error('create failed');
      return nativeButton;
    } });
    if (mode !== 'uninitialized') sdk.init();
    let failures = 0;
    const button = sdk.createUserInfoButton({
      type: mode === 'image' ? 'image' : 'text',
      style: { ...buttonStyle, width: mode === 'style' ? 0 : 200 },
      success() { assert.fail('不应成功'); },
      fail() { failures++; },
    });
    assert.equal(button, undefined);
    assert.equal(failures, 1);
    if (mode === 'listen') assert.equal(nativeButton.destroyed, 1);
  }
});



test("未配置广告 ID 时立即 fail，不创建广告或占用并发锁", () => {
  for (const id of [undefined, ""]) {
    const sdk = loadSDK({
      createInterstitialAd() { assert.fail("不应创建广告"); },
      createRewardedVideoAd() { assert.fail("不应创建广告"); },
    }, "wechat", { interstitialAdUnitId: id, rewardedVideoAdUnitId: id });
    sdk.init();
    for (const method of ["showInterstitialAd", "showRewardedVideoAd"]) {
      let failures = 0;
      assert.equal(sdk[method]({ success() { assert.fail("不应成功"); }, fail() { failures++; } }), undefined);
      assert.equal(failures, 1);
      assert.doesNotThrow(() => sdk.init());
    }
  }
});

test("微信侧边栏跳转通过 fail 报告不支持", () => {
  const sdk = loadSDK({});
  let failures = 0;
  assert.equal(sdk.navigateToSidebar({ success() { assert.fail(); }, fail() { failures++; } }), undefined);
  assert.equal(failures, 1);
});


test("微信侧边栏来源判断固定返回 false", () => {
  assert.equal(loadSDK({}).isFromSidebar(), false);
});
