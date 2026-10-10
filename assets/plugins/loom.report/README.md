# Loom Report

独立 LayaAir 3.4.1 运行时插件，包名 `loom.report`。业务统一调用 `loom.report.to(channel: string, ...args: any[])`；插件根据通道名查找 `window[channel]` 函数，将所有参数按原顺序传入。外部 SDK 适配器负责数据转换、SDK 调用和初始化；插件捕获转发异常。更换 SDK 时业务调用保持一致。

## 业务调用

```ts
loom.report.enabled = true; // 默认开启 SDK 转发
loom.report.debug = false;  // 默认关闭控制台调试日志

loom.report.to("analytics", { event: "level_complete", level: 3, duration: 42 });
loom.report.to("metrics", "level_complete", { level: 3, duration: 42 });
```

`enabled = false` 时直接返回 `false`，不查找或调用通道，不缓存或补发；重新开启只影响后续调用，不取消已发出的异步请求。`debug = true` 时打印启用状态下每次调用的通道名和参数，包括缺失通道的调用；关闭调试日志不影响上报。异常警告始终保留。两个开关由全局 API 与模块导出的服务共享，引擎初始化和安装包的 Scene 脚本重载不会重置它们。

## SDK 适配器注入

```ts
// 假设 analyticsSDK 已由宿主加载。通道函数可以放在独立的平台或 SDK 适配器中。
const channels = window as unknown as Record<string, unknown>;
channels.analytics = (data: { event: string; level: number; duration: number }) => {
    const { event, ...properties } = data;
    return analyticsSDK.track(event, properties);
};

// 可以注册多个通道，业务用通道名选择转发目标。
channels.metrics = (...args: any[]) => metricsSDK.report(...args);
loom.report.to("metrics", "login", { userId: "123" });

// 替换函数即可切换适配器；删除属性即可停用通道。
delete channels.analytics;
```

通道仅支持直接注册在 `window` 上的函数，不支持对象或点分路径。每次调用都重新查找函数，支持延迟注入和替换；函数的 `this` 为 `window`。SDK 方法需要原对象作为 `this` 时，在适配器内调用 `sdk.track(data)` 或注册 `sdk.track.bind(sdk)`。

参数数量与类型不限，也可以不传参数；对象保留原引用，插件不克隆、不修改。调用返回 `boolean`：转发关闭、没有通道、属性不是函数或发生同步异常时返回 `false`；同步调用完成后返回 `true`，仅表示已转发，不代表 SDK 上报成功。未注入期间的数据直接丢弃，不排队或重试。

通道查找、函数调用和返回值检查均有异常捕获；返回的 Promise/thenable 拒绝也会被处理。异常使用 `console.warn` 输出通道名与错误，不输出埋点参数。接口保持同步，异步失败不会改变已经返回的 `true`。适配器必须返回 SDK 的 Promise，插件才能处理其拒绝；适配器内部定时器、事件回调或未返回的异步任务仍需由适配器自行捕获。

可选的模块调用与适配器类型：

```ts
import { report, type ReportChannel } from "~/packages/loom.report";

const adapter: ReportChannel = (...args) => analyticsSDK.track(...args);
(window as unknown as Record<string, unknown>).analytics = adapter;
report.to("analytics", "login", { userId: "123" });
```

## 安装与验证

执行 `./build.sh loom.report`，在目标工程安装 `release/plugins/loom.report.layapkg`。插件无其他 Loom 包依赖，不包含外部 SDK。默认安装包提供预编译 Runtime/Scene JS 与类型声明，Runtime 在业务脚本之前挂载 `loom.report`，Scene 脚本重载时恢复挂载，并保留其他 `loom` 成员。

使用全局 API 的 TypeScript 工程在 `tsconfig.json` 的 `include` 中追加 `"./library/packages/*/index.d.ts"`。执行 `npm run verify:report` 验证独立安装、原生 Scene 调用、模块与全局服务一致、转发/调试开关、异常捕获、类型声明及 Web 发布；`npm run verify:startup -- --skip-build` 验证全部插件正序/倒序安装时 Scene、官方 Preview 和 Web 的业务顶层零 import 调用。

进程：`runtime/report.ts` 与 `index.ts` 为运行时/Scene 入口；`editor/report-plugin.ts` 为 Scene 发布钩子。安装和发布指南见 [仓库文档](../../../docs/plugin-distribution.md)。
