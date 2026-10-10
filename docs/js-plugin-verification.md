# 预编译 JS 安装包验证

在 LayaAir CLI 3.4.1、TypeScript 5.9.3、macOS Chromium 下，七个插件均已生成 JS 安装包，并通过独立安装、原生功能探针与 Web 发布验证。此流程已成为 `./build.sh` 与 `npm run build` 的默认构建方式。

具体操作、类型配置和生成目录说明见 [安装与构建指南](plugin-distribution.md)。本页记录实际验证范围和结果。

## 分发结构

源码继续放在 `assets/plugins/loom.<name>/`，使用 TS 开发。`npm run build` 先在 temp 隔离目录导出源码中间包，再在隔离消费工程通过官方编译器得到 Runtime、Scene、UI 三套 JS，以及 tsc 生成的 `.d.ts`。

安装包包含：

- `loom.<name>.runtime.js` 及 JS 插件 `.meta`：自动加载、仅用于 Preview/游戏，并用 references 声明依赖。
- `build~/bundle.scene.js`、`build~/bundle.editor.js`：编辑器分别加载，保留注册名与组件属性描述。
- `.d.ts` 与原脚本 UUID：供类型检查和组件资产定位；运行时同时注册发布资源使用的压缩 UUID。
- JS 导出桥接文件与资源、README、许可证：公开包入口的导入对象与全局对象保持身份一致。

包中没有实现 `.ts`，引擎 Laya 作为环境全局使用，没有把整个引擎打入插件。UI/Scene 的 Node 代码与 Runtime 分开。

## 已完成检查

| 插件 | 原生安装后的功能检查 |
| --- | --- |
| address | 默认配置创建、保留已有配置、UI 菜单调用 Scene、CLI 生成/校验、过期检测、原生 JSON 加载、映射与资源发布；安装后资源导入期间的加载/卸载回归 |
| atlas | 默认配置创建与保留、Scene 图集注册、图集/整图/fileconfig 发布 |
| bt | 所有公开类、原生组件、等待/上下文/重置、选择器抢占、并行中止 |
| core | Scope/token 生命周期、消息请求、Node 扩展、存档、对象池、协程取消、HTTP 公开 API |
| i18n | 存储、服务与类引用一致性、字典替换、重复手动翻译 |
| pathfinding | core 依赖与导入身份、固定网格/跨 chunk/负坐标、动态障碍、最近可达、平滑、Scene 烘焙、UI 资源库写入 |
| ui | 面板导航/缓存/生命周期/提示；Chromium 中真实 Preview/Web prefab UUID 绑定、打开/刷新/关闭 |
| tables | 仅安装 JS 包后创建项目模板；schema 后生成时创建适配器；自定义模板、UUID 保留、Scene 恢复同一实例；Chromium 中官方 Preview/Web 业务顶层零 import 访问实例 |

每个包另行检查：无实现 TS、UUID 无重复、TypeScript 公开 API 声明能正常编译且拒绝不存在的成员、独立 Web 构建。core/bt/ui 的代表性组件在原生编辑器类型注册表中保留原始 UUID 与描述。

正序和倒序清单中，**Scene、官方 Preview、Web 都在零 import 的业务模块顶层之前提供六个包的 loom API**。Core、BT、Pathfinding 和 UI 的公开类与工具直接挂载到 `loom`，服务通过 `loom.address`、`loom.i18n`、`loom.ui` 访问。atlas 不提供 loom.atlas，但参与加载与资源发布。两种浏览器页面均断言全部 runtime.js 在业务 bundle 之前，core 在 pathfinding 之前。真实页面没有脚本重排。类型通过 include 的 index.d.ts 提供。

`tables` 是后加入的项目适配插件，使用独立的 `verify:tables` 验证：包不引用项目 schema，安装后生成的 TS 和 `loadBeforeMain` bundle 将 `Tables` 实例挂到 `loom.tables`；准确的全局类型来自项目适配器。验证使用实际安装包、消费工程生成的表代码和官方脚本加载顺序，不加载表数据。此前七包的正序/倒序验证记录不代表存在 schema 时的 Tables 适配器验证；全量 JS 功能验证另行调用此安装测试。

## 命令

```sh
./build.sh
npm run verify:js -- --skip-build
npm run verify:startup -- --skip-build
```

默认产物在 `release/plugins/`；完整机器结果在 `temp/verification-logs/js-plugin-functions.json` 与 `js-package-startup.json`。去掉 `--skip-build` 可先重新构建。使用 `KEEP_JS_BUILD=1`、`KEEP_JS_VERIFY=1`、`KEEP_STARTUP_VERIFY=1` 可保留相应隔离工程。

单插件验证可执行 `npm run verify:pathfinding -- --skip-build` 等命令，结果文件名为 `js-plugin-functions-loom.pathfinding.json`。`npm run verify:js:startup` 保留为默认启动验证的同义命令。

另外建立了 `/Users/graylian/workspace/loom-js-demo`，七个包通过 GitHub Release 下载直链安装，业务 TS 无插件 import，提供真实资源、图集、BT/A*、Core、I18n 和 UI 交互。

## IDE 内预览与热重载

2026-10-09 在 LayaAir IDE 3.4.1 的实际窗口中复现了旧版 Address 在资源导入/包重载期间阻塞预览的问题：资源导入等待插件 `onLoad` 返回，`onLoad` 又等待 `assetMgr.flushChanges()` 完成。CLI 不执行 IDE 的启动生成，因此先前的 CLI Preview/Web 检查没有覆盖这一情况。

`loom.address` 1.1.2 将启动生成延后到生命周期钩子返回以后执行；卸载不等待依赖当前导入的旧任务，并通过加载轮次取消旧任务。回归同时检查源码和实际安装的 Scene JS：旧版会超时，新版加载/卸载返回，旧任务取消，新一轮继续生成。

Demo 在 IDE 内完成播放、原生“重新载入所有插件”后再次播放，并实际点击验证了 BT/A* 移动、计数保存、语言切换、UIPanel 加载/刷新/关闭以及图片/图集显示。此项与 CLI 启动验证分别记录，不以 CLI 的通过结果代替 IDE 内预览。

## 范围

这是上述功能和环境的实际验证，不代表所有 Laya 平台、IDE 图形操作与内部深层模块导入都已穷举。推荐使用公开包入口或 loom 全局 API；未承诺每个内部文件都作为可稳定导入的分发接口。API 已挂载不代表资源和业务服务的异步初始化已经完成。

相比源码版 Web 合并流程，这个流程利用独立 JS 插件加载顺序解决了业务顶层访问时机问题，仍然用独立 `.layapkg` 管理安装与依赖。

单插件构建使用 `./build.sh loom.bt` 或 `npm run build -- loom.bt`，会同时导出显式依赖。`npm run build:js` 保留为默认 JS 构建的同义命令。需要源码包时执行 `npm run build:source`，输出在 `release/plugins/source/`。源码包仅供显式选择，不覆盖默认 JS 分发文件。

## HTTP 安装验证

`npm run verify:remote -- --local --skip-build` 用本地 HTTP 服务提供最终 `.layapkg`，消费工程的清单只填写 HTTP URL，不放入本地安装包副本。验证正序/倒序清单下七个包下载、原生 Scene 加载、TypeScript 类型、官方 Preview 与 Web 的业务顶层调用。

Release 发布后，`npm run verify:remote -- --skip-build` 从生成清单中的真实下载地址重复同一验证。机器结果在 `temp/verification-logs/remote-js-package-startup.json`；后执行的检查会更新该报告。发布与安装操作见 [安装与构建指南](plugin-distribution.md)。

CLI 验证使用仓库提供的 `.layapkg` 下载兼容层，绕过 CLI 3.4.1 Happy DOM 对 GitHub Release 的额外跨域预检；官方包管理器继续执行解析、安装和编译。此结果不表示未加兼容层的原生 CLI 可以直接从 GitHub Release 下载。
