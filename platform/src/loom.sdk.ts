

// SDK 类型（构建脚本从这里提取声明）。
export type IENV = Record<string, unknown> & {
    appid: string;
    interstitialAdUnitId?: string;
    rewardedVideoAdUnitId?: string;
    debug: boolean;
    share?: ShareOptions;
};


export type Platform = "wechat" | "douyin";

export interface ShareOptions {
    title?: string;
    imageUrl?: string;
    imageUrlId?: string;
    /** 抖音审核通过的分享素材模板。 */
    templateId?: string;
    desc?: string;
    /** key1=value1&key2=value2，值由调用方进行 URL 编码。 */
    query?: string;
}

/** 小游戏启动参数，保留平台原生返回值。 */
export interface LaunchOptions {
    /** 微信为数值，抖音为字符串（保留前导零）。 */
    scene: number | string;
    /** 抖音入口来源标记。 */
    launch_from?: string;
    location?: string;
    showFrom?: number;
    extra?: Record<string, unknown>;
    query: Record<string, string>;
    referrerInfo?: {
        appId?: string;
        extraData?: unknown;
    };
    shareTicket?: string;
    hostExtraData?: string;
    chatType?: number;
}

export interface LoginOptions {
    /** 微信登录超时，单位毫秒。 */
    timeout?: number;
    success: () => void;
    fail: () => void;
}

export interface UserInfo {
    nickName: string;
    avatarUrl: string;
    language?: string;
}

export interface GetUserInfoOptions {
    lang?: "en" | "zh_CN" | "zh_TW";
    success: (userInfo: UserInfo) => void;
    fail: () => void;
}

export interface GetSettingOptions {
    success: (result: { authSetting: Record<string, boolean | undefined> }) => void;
    fail: () => void;
}

export interface UserInfoButtonStyle {
    /** 屏幕逻辑像素坐标及尺寸。 */
    left: number;
    top: number;
    width: number;
    height: number;
    backgroundColor?: string;
    color?: string;
    fontSize?: number;
    lineHeight?: number;
    textAlign?: "left" | "center" | "right";
    borderColor?: string;
    borderWidth?: number;
    borderRadius?: number;
}

export interface CreateUserInfoButtonOptions extends GetUserInfoOptions {
    type?: "text" | "image";
    text?: string;
    image?: string;
    style: UserInfoButtonStyle;
}

export interface UserInfoButton {
    show(): void;
    hide(): void;
    /** 销毁后不再触发回调，重复销毁无副作用。 */
    destroy(): void;
}

export interface NavigateToSidebarOptions {
    /** 仅表示跳转成功，不表示已从侧边栏返回游戏。 */
    success: () => void;
    fail: () => void;
}

export interface AdCallbacks {
    /** 插屏广告关闭时调用。 */
    success: () => void;
    /** 参数、环境、加载或展示失败时调用，原生错误原样传递。 */
    fail: (error: unknown) => void;
}

export interface RewardedVideoCallbacks {
    /** 完整观看后调用，无回调参数。 */
    success: () => void;
    /** 未完整观看或调用失败时调用，详情由 SDK 输出日志。 */
    fail: () => void;
}

/** 统一接口；新增能力时，先在这里定义契约，再实现各平台适配。 */
export interface MiniGameSDK {
    readonly platform: Platform;
    /** 平台配置统一从全局 $env 读取。 */
    init($env?: IENV): void;
    /** 同步获取本次冷启动参数，可在 init 前调用。 */
    getLaunchOptionsSync(): LaunchOptions;
    login(options: LoginOptions): void;
    /** 获取用户资料；抖音需先登录，首次调用可能请求授权。不返回 Promise。 */
    getUserInfo(options: GetUserInfoOptions): void;
    getSetting(options: GetSettingOptions): void;
    /** 返回按钮控制对象；同步创建失败返回 undefined，异步创建失败通过 fail 通知。 */
    createUserInfoButton(options: CreateUserInfoButtonOptions): UserInfoButton | undefined;
    /** 仅通过 success / fail 回调通知结果，不返回 Promise。 */
    showInterstitialAd(options: AdCallbacks): void;
    showRewardedVideoAd(options: RewardedVideoCallbacks): void;
    /** 仅发起分享，不提供分享成功或取消的判定。 */
    shareAppMessage(options?: ShareOptions): void;
    /** 跳转抖音侧边栏，微信端调用 fail。 */
    navigateToSidebar(options: NavigateToSidebarOptions): void;
    /** 判断最近一次进入来源是否为侧边栏；微信恒为 false。 */
    isFromSidebar(): boolean;

}

// impl

declare const GameGlobal: any;

/** 安装全局包装。缺少能力时默认成功，仅捕获业务回调中的异常。 */
export function create(env?: IENV) {
    const host = (typeof GameGlobal !== "undefined" ? GameGlobal : globalThis) as any;
    const sdk: Partial<MiniGameSDK> = host.__sdk ?? host.loom?.sdk?.sdk ?? {};
    env = env ?? host.$env ?? host.env ?? (globalThis as any).$env ?? (globalThis as any).env
        ?? { appid: "", debug: false };

    const adapter = {
        sdk,
        platform: sdk.platform ?? "unknown",

        init(config: IENV = env!): void {
            host.$env = config;
            (globalThis as any).$env = config;
            sdk.init?.(config);
        },

        getLaunchOptionsSync(): LaunchOptions {
            return sdk.getLaunchOptionsSync?.() ?? { scene: "", query: {} };
        },

        login(options: LoginOptions): void {
            if (!sdk.login) {
                try { options.success(); } catch {}
                return;
            }
            sdk.login({
                ...options,
                success() {
                    try { options.success(); } catch {}
                },
                fail() {
                    try { options.fail(); } catch {}
                },
            });
        },

        getUserInfo(options: GetUserInfoOptions): void {
            if (!sdk.getUserInfo) {
                try { options.success({ nickName: "", avatarUrl: "" }); } catch {}
                return;
            }
            sdk.getUserInfo({
                ...options,
                success(userInfo) {
                    try { options.success(userInfo); } catch {}
                },
                fail() {
                    try { options.fail(); } catch {}
                },
            });
        },

        getSetting(options: GetSettingOptions): void {
            if (!sdk.getSetting) {
                try { options.success({ authSetting: {} }); } catch {}
                return;
            }
            sdk.getSetting({
                ...options,
                success(result) {
                    try { options.success(result); } catch {}
                },
                fail() {
                    try { options.fail(); } catch {}
                },
            });
        },

        createUserInfoButton(options: CreateUserInfoButtonOptions): UserInfoButton | undefined {
            if (!sdk.createUserInfoButton) {
                try { options.success({ nickName: "", avatarUrl: "" }); } catch {}
                return;
            }
            return sdk.createUserInfoButton({
                ...options,
                success(userInfo) {
                    try { options.success(userInfo); } catch {}
                },
                fail() {
                    try { options.fail(); } catch {}
                },
            });
        },

        showInterstitialAd(options: AdCallbacks): void {
            // TODO: 在调用前暂停游戏，在 success / fail 中恢复游戏。
            if (!sdk.showInterstitialAd) {
                try { options.success(); } catch {}
                return;
            }
            sdk.showInterstitialAd({
                ...options,
                success() {
                    try { options.success(); } catch {}
                },
                fail(error) {
                    try { options.fail(error); } catch {}
                },
            });
        },

        showRewardedVideoAd(options: RewardedVideoCallbacks): void {
            // TODO: 在调用前暂停游戏，在 success / fail 中恢复游戏。
            if (!sdk.showRewardedVideoAd) {
                try { options.success(); } catch {}
                return;
            }
            sdk.showRewardedVideoAd({
                ...options,
                success() {
                    try { options.success(); } catch {}
                },
                fail() {
                    try { options.fail(); } catch {}
                },
            });
        },

        navigateToSidebar(options: NavigateToSidebarOptions): void {
            if (!sdk.navigateToSidebar) {
                try { options.success(); } catch {}
                return;
            }
            sdk.navigateToSidebar({
                ...options,
                success() {
                    try { options.success(); } catch {}
                },
                fail() {
                    try { options.fail(); } catch {}
                },
            });
        },

        isFromSidebar(): boolean {
            return sdk.isFromSidebar?.() ?? false;
        },

        shareAppMessage(options: ShareOptions = {}): void {
            sdk.shareAppMessage?.(options);
        },
    };

    host.loom = host.loom ?? {};
    host.loom.sdk = adapter;
    (globalThis as any).loom = host.loom;
    return adapter;
}

/** 客户端模板自带全局类型，复制 TS 文件即可使用 loom.sdk。 */
declare global {
    interface Loom {
        sdk: ReturnType<typeof create>;
    }
    var loom: Loom;
}
