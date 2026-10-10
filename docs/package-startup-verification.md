# 源码安装包启动顺序验证

验证环境：LayaAir CLI 3.4.1、TypeScript 5.9.3、macOS Google Chrome。验证使用本仓库实际导出的七个独立安装包，没有把插件源码复制到消费工程，也没有统一 `loom.bundledef`、业务 runtime import 或手动初始化调用。

本页记录源码版安装包的历史验证。当前默认构建已切换至独立预编译 JS 分发，结果见 [JS 安装包验证](js-plugin-verification.md)；源码包输出在 `release/plugins/source/`。

## 结论

**源码版安装包的 Web 合并流程不能保证在业务模块执行前挂载 `loom.xxx`。** Scene 和官方预览满足这个条件；源码版 Web 发布把插件与业务合并进 `bundle.js`，本次测试中业务模块先执行。当前默认 JS 安装包采用独立 Runtime JS，已通过这一检查。

| 检查 | 包清单正序 | 包清单倒序 |
| --- | --- | --- |
| Scene：业务模块顶层零 import | 通过 | 通过 |
| 官方预览页面：业务模块顶层零 import | 通过 | 通过 |
| Web 发布页面：业务模块顶层零 import | 失败 | 失败 |
| TypeScript：通过 include 识别全局类型 | 通过 | 通过 |
| address 自动创建编辑器配置 | 通过 | 通过 |

预览的官方 HTML 把 `js/packages/loom.*.js` 放在 `js/bundles/bundle.js` 之前。Web HTML 只加载合并后的 `js/bundle.js`，没有独立的插件脚本标签。

Web 业务顶层记录的是 `ReferenceError: loom is not defined`，随后同一页面中的六个全局命名空间全部挂载成功。这证明失败发生在挂载时机，而非包未安装或入口未被收集。两种清单中，合并产物的业务代码字符偏移为 699，BT 挂载调用偏移为 15697；这些偏移仅用于记录本次产物，不作为验证断言。

因此，入口注册标记、发布钩子收集入口和初始化回调可以保证 API 被包含并在之后可用，却不足以保证如下顶层代码的执行时机：

```ts
const bt = new loom.BTBuilder();
```

这个结论针对本次 3.4.1 的源码版 Web 合并流程，不推断预编译 JS 分发、其他 LayaAir 版本、小游戏平台或自定义构建配置。插件数据的异步加载完成顺序也不属于这次 API 挂载验证。

## 验证方法

`tests/package-startup-business.ts` 在模块顶层检查 `core`、`address`、`bt`、`i18n`、`ui`、`pathfinding`，并立即构造 BT、执行 A* 和查询翻译。`atlas` 没有 `loom.atlas` 命名空间，但作为实际安装包一同参与安装与构建。业务探针捕获早期失败并保存快照，使脚本可以继续执行，从而区分“顶层不可用”和“之后也未挂载”。

消费工程仅包含业务探针及正常项目设置。`CompilerSettings.entries` 指定业务脚本，TypeScript `include` 追加 `./library/packages/*/index.ts`；声明包含不建立运行时依赖。

Scene 使用官方 CLI 执行验证入口。预览启动官方 CLI 预览服务器，在原始页面的脚本顺序上运行 Chromium。Web 使用官方发布的 `index.html` 和 `js/index.js`。浏览器验证仅加入结果观察脚本，没有重排页面中的插件、主脚本或引擎脚本。

## 重复执行

```sh
npm run verify:source:startup
```

命令重新构建七个安装包，在两个隔离工程中测试正序和倒序清单，并把完整结果写入 `temp/verification-logs/package-startup.json`。**当前退出码为 1，明确表示 Web 未满足“业务顶层之前已挂载”的条件；不是包导出或验证工具执行失败。**

已有最新安装包时，可以跳过重复导出：

```sh
npm run verify:source:startup -- --skip-build
```

默认清理隔离工程。设置 `KEEP_STARTUP_VERIFY=1` 可保留生成的 HTML、合并脚本和消费工程；其他平台通过 `CHROME_BIN` 指定 Chromium 可执行文件。

## 使用边界

使用源码版 `.layapkg` 时，业务模块顶层需要使用插件类，应显式导入相应包；引擎初始化后的全局调用可继续使用。

当前默认的 JS 分发流程已通过独立 Runtime JS 实现先挂载 API、再执行业务，并完成顶层零 import 验证。新工程按 [安装与构建指南](plugin-distribution.md) 使用默认产物；本页保留源码版的测试结果供选择分发方式时参考。
