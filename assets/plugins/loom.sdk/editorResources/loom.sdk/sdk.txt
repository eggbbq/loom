// 由 loom.sdk 生成。此文件属于项目，可自由修改；插件不会覆盖已有文件。
/** 项目可自行修改的统一 SDK 契约。 */
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
    /** 平台配置由项目传入，或从全局 $env / env 读取。 */
    init($env: IENV): void;
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

declare const GameGlobal: SDKHost | undefined;

type SDKHost = {
    __sdk?: Partial<MiniGameSDK>;
    minisdk?: Partial<MiniGameSDK> | { sdk?: Partial<MiniGameSDK> };
    $env?: IENV;
    env?: IENV;
    loom?: Loom;
};

function host(): SDKHost {
    return (typeof GameGlobal !== "undefined" ? GameGlobal
        : typeof window !== "undefined" ? window : globalThis) as SDKHost;
}

/** 与参考适配器一致：业务回调异常不进入第三方 SDK 的调用栈。 */
function notify<T extends unknown[]>(callback: (...args: T) => void, ...args: T): void {
    try { callback(...args); }
    catch (error) { console.error("[LoomSDK] Callback failed", error); }
}

/** 项目拥有的适配层；可在这里替换成自己的微信、抖音或其他第三方实现。 */
export class LoomSDKAdapter {
    private implementation?: Partial<MiniGameSDK>;

    get sdk(): Partial<MiniGameSDK> {
        if (this.implementation) return this.implementation;
        const root = host(), globals = globalThis as SDKHost;
        const candidate = root.__sdk ?? globals.__sdk ?? root.minisdk ?? globals.minisdk;
        if (candidate === this) return {};
        const value = candidate && "sdk" in candidate ? candidate.sdk : candidate;
        return value && value !== this ? value as Partial<MiniGameSDK> : {};
    }

    get platform(): Platform | "unknown" { return this.sdk.platform ?? "unknown"; }

    /** 注入遵循 MiniGameSDK 契约的第三方 SDK；不改写第三方全局对象。 */
    use(implementation: Partial<MiniGameSDK>): void {
        if (implementation === this) throw new Error("[LoomSDK] Cannot use the adapter as its own implementation");
        this.implementation = implementation;
    }

    init(config?: IENV, implementation?: Partial<MiniGameSDK>): void {
        if (implementation) this.use(implementation);
        const root = host(), globals = globalThis as SDKHost;
        config = config ?? root.$env ?? root.env ?? globals.$env ?? globals.env ?? { appid: "", debug: false };
        // platform 的实现读取全局 $env；旧 minisdk 实现仍可接收配置参数。
        root.$env = config;
        globals.$env = config;
        this.sdk.init?.(config);
    }

    getLaunchOptionsSync(): LaunchOptions {
        return this.sdk.getLaunchOptionsSync?.() ?? { scene: "", query: {} };
    }

    login(options: LoginOptions): void {
        const sdk = this.sdk;
        if (!sdk.login) { notify(options.success); return; }
        sdk.login({ ...options, success: () => notify(options.success), fail: () => notify(options.fail) });
    }

    getUserInfo(options: GetUserInfoOptions): void {
        const sdk = this.sdk;
        if (!sdk.getUserInfo) { notify(options.success, { nickName: "", avatarUrl: "" }); return; }
        sdk.getUserInfo({ ...options, success: value => notify(options.success, value), fail: () => notify(options.fail) });
    }

    getSetting(options: GetSettingOptions): void {
        const sdk = this.sdk;
        if (!sdk.getSetting) { notify(options.success, { authSetting: {} }); return; }
        sdk.getSetting({ ...options, success: value => notify(options.success, value), fail: () => notify(options.fail) });
    }

    createUserInfoButton(options: CreateUserInfoButtonOptions): UserInfoButton | undefined {
        const sdk = this.sdk;
        if (!sdk.createUserInfoButton) { notify(options.success, { nickName: "", avatarUrl: "" }); return; }
        return sdk.createUserInfoButton({ ...options, success: value => notify(options.success, value), fail: () => notify(options.fail) });
    }

    showInterstitialAd(options: AdCallbacks): void {
        // TODO: 在调用前暂停游戏，在 success / fail 中恢复游戏。
        const sdk = this.sdk;
        if (!sdk.showInterstitialAd) { notify(options.success); return; }
        sdk.showInterstitialAd({ ...options, success: () => notify(options.success), fail: error => notify(options.fail, error) });
    }

    showRewardedVideoAd(options: RewardedVideoCallbacks): void {
        // TODO: 在调用前暂停游戏，在 success / fail 中恢复游戏。
        const sdk = this.sdk;
        if (!sdk.showRewardedVideoAd) { notify(options.success); return; }
        sdk.showRewardedVideoAd({ ...options, success: () => notify(options.success), fail: () => notify(options.fail) });
    }

    shareAppMessage(options: ShareOptions = {}): void { this.sdk.shareAppMessage?.(options); }

    navigateToSidebar(options: NavigateToSidebarOptions): void {
        const sdk = this.sdk;
        if (!sdk.navigateToSidebar) { notify(options.success); return; }
        sdk.navigateToSidebar({ ...options, success: () => notify(options.success), fail: () => notify(options.fail) });
    }

    isFromSidebar(): boolean { return this.sdk.isFromSidebar?.() ?? false; }
}

export const sdk = host().loom?.sdk ?? new LoomSDKAdapter();

function install(): void {
    const root = host();
    const shared = root.loom ?? (typeof window !== "undefined" ? window.loom : undefined)
        ?? (globalThis as SDKHost).loom ?? {} as Loom;
    shared.sdk = sdk;
    root.loom = shared;
    (globalThis as SDKHost).loom = shared;
    if (typeof window !== "undefined") window.loom = shared;
}

install();
Laya.addBeforeInitCallback(install);
if (typeof IEditorEnv !== "undefined") IEditorEnv.onUserScriptsLoad({ install }, "install");

declare global {
    interface Loom { sdk: LoomSDKAdapter; }
    var loom: Loom;
}

// 让官方编译器收集顶层挂载，sdk.bundledef 保证早于业务主包执行。
@Laya.regClass()
export class LoomSDKAdapterEntry {
    static install(): void { install(); }
}
