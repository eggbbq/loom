import type {
  NavigateToSidebarOptions,
  LaunchOptions,
  LoginOptions,
  GetUserInfoOptions,
  GetSettingOptions,
  CreateUserInfoButtonOptions,
  UserInfoButton,
  AdCallbacks,
  RewardedVideoCallbacks,
  ShareOptions,
  IENV,
} from "./loom.sdk";

let initialized = false;
let adBusy = false;
declare const $env: IENV;

function init(): void {
  if (adBusy) throw new Error("广告运行期间不能重新初始化。");
  if (typeof $env === "undefined" || $env === null) {
    throw new Error("请先提供全局 $env 配置。");
  }
  initialized = true;
}

function getLaunchOptionsSync(): LaunchOptions {
  return wx.getLaunchOptionsSync();
}

function login(options: LoginOptions): void {
  let settled = false;
  const fail = (error: unknown) => {
    if (settled) return;
    settled = true;
    console.error("[loom.sdk] 登录失败。", error);
    options.fail();
  };

  try {
    requireInitialized();
    if (options.timeout !== undefined && (!Number.isFinite(options.timeout) || options.timeout <= 0)) {
      throw new Error("登录 timeout 必须是正数。");
    }
    wx.login({
      timeout: options.timeout,
      success(result) {
        if (settled) return;
        if (!result.code) {
          fail(new Error("微信登录未返回 code。"));
          return;
        }
        settled = true;
        console.log("[loom.sdk] 微信登录成功。");
        options.success();
      },
      fail,
    });
  } catch (error) {
    // 用户回调中的异常正常抛出，不再触发另一结果回调。
    if (settled) throw error;
    fail(error);
  }
}

function getUserInfo(options: GetUserInfoOptions): void {
  let settled = false;
  const fail = (error: unknown) => {
    if (settled) return;
    settled = true;
    console.error("[loom.sdk] 获取用户信息失败。", error);
    options.fail();
  };

  try {
    requireInitialized();
    wx.getUserInfo({
      lang: options.lang,
      withCredentials: false,
      success(result) {
        if (settled) return;
        if (!result.userInfo) {
          fail(new Error("微信未返回 userInfo。"));
          return;
        }
        settled = true;
        console.log("[loom.sdk] 获取用户信息成功。");
        options.success(result.userInfo);
      },
      fail,
    });
  } catch (error) {
    if (settled) throw error;
    fail(error);
  }
}

function getSetting(options: GetSettingOptions): void {
  let settled = false;
  const fail = (error: unknown) => {
    if (settled) return;
    settled = true;
    console.error("[loom.sdk] 查询授权状态失败。", error);
    options.fail();
  };
  try {
    requireInitialized();
    wx.getSetting({
      success(result) {
        if (settled) return;
        if (!result.authSetting) {
          fail(new Error("微信未返回 authSetting。"));
          return;
        }
        settled = true;
        options.success({ authSetting: { ...result.authSetting } });
      },
      fail,
    });
  } catch (error) {
    if (settled) throw error;
    fail(error);
  }
}

function createUserInfoButton(options: CreateUserInfoButtonOptions): UserInfoButton | undefined {
  let native: WechatMinigame.UserInfoButton | undefined;
  let destroyed = false;
  const onTap = (result: WechatMinigame.OnTapListenerResult) => {
    if (destroyed) return;
    if (result.userInfo) {
      options.success(result.userInfo);
    } else {
      console.warn("[loom.sdk] 用户未授权或授权失败。", result.errMsg);
      options.fail();
    }
  };
  try {
    requireInitialized();
    const { style } = options;
    if (!style || ![style.left, style.top, style.width, style.height].every(Number.isFinite)
      || style.width <= 0 || style.height <= 0) {
      throw new Error("请提供有效的按钮位置和正数尺寸。");
    }
    if (options.type === "image" && !options.image) {
      throw new Error("图片按钮需要 image。");
    }
    native = wx.createUserInfoButton({
      type: options.type ?? "text",
      text: options.text ?? "授权头像昵称",
      image: options.image,
      lang: options.lang,
      withCredentials: false,
      style: { backgroundColor: "#07c160", ...style },
    });
    native.onTap(onTap);
  } catch (error) {
    destroyed = true;
    if (native) {
      try { native.offTap(onTap); } catch { /* 继续销毁实例。 */ }
      try { native.destroy(); } catch { /* 保留原始错误。 */ }
    }
    console.error("[loom.sdk] 创建用户授权按钮失败。", error);
    options.fail();
    return undefined;
  }
  const button = native;
  return {
    show() { if (!destroyed) button.show(); },
    hide() { if (!destroyed) button.hide(); },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      try { button.offTap(onTap); } finally { button.destroy(); }
    },
  };
}

function showInterstitialAd(options: AdCallbacks): void {
  const adUnitId = $env.interstitialAdUnitId;
  if (!adUnitId) {
    options.fail(new Error("未配置插屏广告 ID。"));
    return;
  }
  void withAdLock(async () => {
    requireInitialized();
    await showAd(wx.createInterstitialAd({ adUnitId }));
  }).then(() => options.success(), (error: unknown) => options.fail(error));
}

function showRewardedVideoAd(options: RewardedVideoCallbacks): void {
  const adUnitId = $env.rewardedVideoAdUnitId;
  if (!adUnitId) {
    console.warn("[loom.sdk] 未配置激励视频广告 ID。");
    options.fail();
    return;
  }
  void withAdLock(async () => {
    requireInitialized();
    const result = await showAd<WechatMinigame.RewardedVideoAdOnCloseListenerResult | undefined>(
      wx.createRewardedVideoAd({ adUnitId, multiton: true }),
    );
    return result?.isEnded === true;
  }).then((completed) => {
    if (completed) {
      console.log("[loom.sdk] 激励视频完整观看。");
      options.success();
    } else {
      console.warn("[loom.sdk] 激励视频未完整观看或缺少完成状态。");
      options.fail();
    }
  }, (error: unknown) => {
    console.error("[loom.sdk] 激励视频调用失败。", error);
    options.fail();
  });
}

function isFromSidebar(): boolean {
  return false;
}

function navigateToSidebar(options: NavigateToSidebarOptions): void {
  console.warn("[loom.sdk] 微信不支持跳转抖音侧边栏。");
  options.fail();
}

function shareAppMessage(options: ShareOptions = {}): void {
  requireInitialized();
  const defaults = $env.share;
  wx.shareAppMessage({ ...defaults, ...options });
}

function requireInitialized(): void {
  if (!initialized) throw new Error("请先调用 __sdk.init()。");
}

async function withAdLock<T>(run: () => Promise<T>): Promise<T> {
  if (adBusy) throw new Error("已有广告正在加载或展示，请等待关闭。");
  adBusy = true;
  try {
    return await run();
  } finally {
    adBusy = false;
  }
}

/** 两种广告共用的生命周期：加载、展示、关闭/失败、清理。 */
interface AdInstance<T> {
  load(): Promise<unknown>;
  show(): Promise<unknown>;
  onClose(listener: (result: T) => void): void;
  offClose(listener: (result: T) => void): void;
  onError(listener: (error: unknown) => void): void;
  offError(listener: (error: unknown) => void): void;
  destroy(): void;
}

function showAd<T>(ad: AdInstance<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      // 某一步清理失败也继续释放其余资源，不覆盖原始广告结果。
      for (const release of [
        () => ad.offClose(onClose),
        () => ad.offError(onError),
        () => ad.destroy(),
      ]) {
        try { release(); } catch { /* 原生实例可能已经销毁。 */ }
      }
    };
    const onClose = (result: T) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    const onError = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    try {
      ad.onError(onError);
      ad.onClose(onClose);
      // 明确 load 后 show；加载错误后不再继续展示或自动重试。
      void Promise.resolve().then(() => {
        if (!settled) return ad.load();
      }).then(() => {
        if (!settled) return ad.show();
      }).catch(onError);
    } catch (error) {
      onError(error);
    }
  });
}

(typeof GameGlobal !== "undefined" ? GameGlobal : globalThis).__sdk = {
  platform: "wechat",
  init,
  getLaunchOptionsSync,
  login,
  getUserInfo,
  getSetting,
  createUserInfoButton,
  showInterstitialAd,
  showRewardedVideoAd,
  shareAppMessage,
  navigateToSidebar,
  isFromSidebar,
};
