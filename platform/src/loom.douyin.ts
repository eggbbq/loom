// #region 抖音原生API定义
/** 本适配器使用的抖音原生 API 子集，按官方小游戏文档定义。 */
interface NativeCallbacks<T> {
  success(result: T): void;
  fail(error: unknown): void;
}

interface InteractiveButton extends UserInfoButton {
  onTap(listener: () => void): void;
}

/** 本适配器使用的抖音原生 API 子集，按官方小游戏文档定义。 */
declare const tt: {
  onShow(listener: (options: LaunchOptions) => void): void;
  navigateToScene(options: NativeCallbacks<void> & { scene: "sidebar" }): void;
  getLaunchOptionsSync(): LaunchOptions;
  login(options: NativeCallbacks<{ code?: string; anonymousCode?: string }> & { force: boolean }): void;
  getUserInfo(options: NativeCallbacks<{ userInfo?: UserInfo }> & { withCredentials: boolean }): void;
  getSetting(options: NativeCallbacks<{ authSetting?: Record<string, boolean | undefined> }>): void;
  createInteractiveButton(options: NativeCallbacks<InteractiveButton> & {
    type: "text" | "image"; text?: string; image?: string;
    style: Omit<UserInfoButtonStyle, "color"> & { textColor: string };
  }): void;
  createInterstitialAd(options: { adUnitId: string }): AdInstance<void>;
  createRewardedVideoAd(options: { adUnitId: string }): AdInstance<{ isEnded?: boolean; count?: number } | undefined>;
  shareAppMessage(options: { title?: string; query?: string; templateId?: string; desc?: string; fail(error: unknown): void }): void;
};

//#endregion

import type {
  NavigateToSidebarOptions,
  LaunchOptions,
  LoginOptions,
  GetUserInfoOptions,
  GetSettingOptions,
  CreateUserInfoButtonOptions,
  UserInfoButton,
  UserInfo,
  UserInfoButtonStyle,
  AdCallbacks,
  RewardedVideoCallbacks,
  ShareOptions,
  IENV,
} from "./loom.sdk";

let initialized = false;
let adBusy = false;
declare const $env: IENV;

let latestEntry: LaunchOptions | undefined;

// 脚本加载时立即监听，避免错过冷启动及初始化前的热启动事件。
tt.onShow((options) => {
  // 普通前后台切换不是新的入口，保留上一次实际进入来源。
  if (options.showFrom !== 0) latestEntry = options;
});

function init(): void {
  if (adBusy) throw new Error("广告运行期间不能重新初始化。");
  if (typeof $env === "undefined" || $env === null) throw new Error("请先提供全局 $env 配置。");
  initialized = true;
}

function getLaunchOptionsSync(): LaunchOptions {
  return tt.getLaunchOptionsSync();
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
    tt.login({
      force: true,
      success(result) {
        if (settled) return;
        if (!result.code) {
          fail(new Error("抖音登录未返回 code。"));
          return;
        }
        settled = true;
        console.log("[loom.sdk] 抖音登录成功。");
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
    tt.getUserInfo({
      withCredentials: false,
      success(result) {
        if (settled) return;
        if (!result.userInfo) {
          fail(new Error("抖音未返回 userInfo。"));
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
    tt.getSetting({
      success(result) {
        if (settled) return;
        if (!result.authSetting) {
          fail(new Error("抖音未返回 authSetting。"));
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

// 抖音按钮异步创建；先返回控制对象，原生按钮就绪后应用显隐状态。
function createUserInfoButton(options: CreateUserInfoButtonOptions): UserInfoButton | undefined {
  let native: InteractiveButton | undefined;
  let destroyed = false;
  let visible = true;
  let requesting = false;
  const fail = (error: unknown) => {
    if (destroyed) return;
    destroyed = true;
    native?.destroy();
    console.error("[loom.sdk] 创建用户授权按钮失败。", error);
    options.fail();
  };
  const onTap = () => {
    if (destroyed || requesting) return;
    requesting = true;
    getUserInfo({
      success(userInfo) {
        requesting = false;
        if (!destroyed) options.success(userInfo);
      },
      fail() {
        requesting = false;
        if (!destroyed) options.fail();
      },
    });
  };
  try {
    requireInitialized();
    const { style } = options;
    if (!style || ![style.left, style.top, style.width, style.height].every(Number.isFinite)
      || style.width <= 0 || style.height <= 0) {
      throw new Error("请提供有效的按钮位置和正数尺寸。");
    }
    const { color, ...nativeStyle } = style;
    tt.createInteractiveButton({
      type: options.type ?? "text",
      text: options.text ?? "授权头像昵称",
      image: options.image,
      style: {
        fontSize: 16, backgroundColor: "#07c160", borderColor: "#07c160",
        borderWidth: 0, borderRadius: 4, textAlign: "center", lineHeight: style.height,
        ...nativeStyle, textColor: color ?? "#ffffff",
      },
      success(button) {
        if (destroyed) { button.destroy(); return; }
        native = button;
        try {
          button.onTap(onTap);
          if (visible) button.show(); else button.hide();
        } catch (error) { fail(error); }
      },
      fail,
    });
  } catch (error) {
    if (destroyed) throw error;
    fail(error);
    return undefined;
  }
  if (destroyed) return undefined;
  return {
    show() { if (!destroyed) { visible = true; native?.show(); } },
    hide() { if (!destroyed) { visible = false; native?.hide(); } },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      // 抖音 destroy 会移除按钮监听，也处理创建完成前被销毁的情况。
      native?.destroy();
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
    await showAd(tt.createInterstitialAd({ adUnitId }));
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
    const result = await showAd<{ isEnded?: boolean; count?: number } | undefined>(
      tt.createRewardedVideoAd({ adUnitId }),
    );
    return typeof result?.count === "number" ? result.count > 0 : result?.isEnded === true;
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
  const options = latestEntry ?? tt.getLaunchOptionsSync();
  if (options.launch_from || options.location) {
    return options.launch_from === "homepage"
      && (options.location === "sidebar_card" || options.location === "homepage_expand");
  }
  // 场景值 = 宿主前缀 + 四位场景 ID；不限定为单个 021036。
  const scene = String(options.scene ?? "").padStart(6, "0");
  const id = scene.slice(-4);
  if (id === "1036" || id === "1042") return true;
  // 头条及头条极速版的 1001 是搜索页最近使用，并非侧边栏。
  return id === "1001" && !["01", "06"].includes(scene.slice(0, -4));
}

function navigateToSidebar(options: NavigateToSidebarOptions): void {
  let settled = false;
  const fail = (error: unknown) => {
    if (settled) return;
    settled = true;
    console.error("[loom.sdk] 跳转侧边栏失败。", error);
    options.fail();
  };
  try {
    requireInitialized();
    tt.navigateToScene({
      scene: "sidebar",
      success() {
        if (settled) return;
        settled = true;
        console.log("[loom.sdk] 跳转侧边栏成功。");
        options.success();
      },
      fail,
    });
  } catch (error) {
    if (settled) throw error;
    fail(error);
  }
}

function shareAppMessage(options: ShareOptions = {}): void {
  requireInitialized();
  const defaults = $env.share;
  const { title, query, templateId, desc } = { ...defaults, ...options };
  tt.shareAppMessage({ title, query, templateId, desc,
    fail(error) { console.error("[loom.sdk] 分享失败。", error); },
  });
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
  destroy(): void | Promise<unknown>;
}

function showAd<T>(ad: AdInstance<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = async () => {
      // 某一步清理失败也继续释放其余资源，不覆盖原始广告结果。
      for (const release of [
        () => ad.offClose(onClose),
        () => ad.offError(onError),
        () => ad.destroy(),
      ]) {
        try { await release(); } catch (error) { console.warn("[loom.sdk] 广告清理失败。", error); }
      }
    };
    const onClose = (result: T) => {
      if (settled) return;
      settled = true;
      void cleanup().then(() => resolve(result));
    };
    const onError = (error: unknown) => {
      if (settled) return;
      settled = true;
      void cleanup().then(() => reject(error));
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
  platform: "douyin",
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
