/** SDK 适配器注册到 window[channel] 的函数。参数由业务与适配器约定。 */
export type ReportChannel = (...args: any[]) => unknown;

/** 全局与模块导出共享同一个服务；初始化和 Scene 重载不重置开关。 */
export const report = {
    /** 是否向 SDK 转发埋点。关闭后不查找通道，不排队。 */
    enabled: true,
    /** 是否打印通道和调用参数；不影响 SDK 转发或异常捕获。 */
    debug: false,

    /**
     * 将所有参数按原顺序转发给 window[channel]。
     * 已关闭、未注入函数或同步异常时返回 false；同步调用完成后返回 true。
     * 捕获同步异常及返回的 Promise/thenable 拒绝，记录警告，不打断业务。
     */
    to(channel: string, ...args: any[]): boolean {
        if (!report.enabled) return false;
        if (report.debug) {
            console.log(`[report] "${channel}"`, ...args);
        }
        try {
            if (!Object.prototype.hasOwnProperty.call(window, channel)) return false;
            const forward = (window as unknown as Record<string, unknown>)[channel];
            if (typeof forward !== "function") return false;
            const result = forward.apply(window, args);
            if (result != null && typeof result.then === "function") {
                Promise.resolve(result).catch(error => console.warn(`[report] "${channel}" failed:`, error));
            }
            return true;
        } catch (error) {
            console.warn(`[report] "${channel}" failed:`, error);
            return false;
        }
    },
};
