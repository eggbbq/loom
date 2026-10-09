# loom

用于开发、验证和分发 LayaAir IDE 插件与工程工具的独立项目。工程由官方 **3D empty project** 模板创建，当前版本为 **LayaAir 3.4.1**。

## 开始开发

用 LayaAir IDE 打开 `loom.laya`。每个插件独立维护在 `assets/plugins/loom.<插件名>/`，各自拥有 `package.json`、入口、README 与许可证，并分别导出为可安装的 `.layapkg`。

```sh
./build.sh
```

`build.sh` 自动安装锁定的构建依赖，执行 TypeScript 检查和测试，再导出预编译 JS 安装包（含 Runtime/Scene/UI JS、类型声明和资源）。只构建一个插件用 `./build.sh loom.atlas`；需要其他插件时同时输出显式依赖。脚本可以从任意工作目录调用。

Node.js 要求 20 或更新版本。安装官方 LayaAir CLI 后，执行 `layaair install 3.4.1` 安装本项目所需版本；旧 CLI 3.4.0 缺少安装包导出命令。脚本会从 PATH 或 `~/.layaair/` 查找 CLI，也可通过 `LAYAAIR_CLI` 指定可执行文件的绝对路径。

## 在其他工程中安装

执行 `npm run build`，在目标工程的包管理器中分别安装需要的 `release/plugins/loom.<插件名>-<版本>.layapkg`。插件之间通过 `pluginDependencies` 声明真实依赖，不使用统一的 `loom.bundledef` 或源码复制入口。

构建同时生成 `release/plugins/manifest.json`（远程安装 URL）、`distribution.json`（各插件版本与校验值）和 `SHA256SUMS`。默认下载地址为本仓库 GitHub Releases 的 `v0.1.1`；可用 `LOOM_RELEASE_TAG` 指定新的发布标签。安装包上传到 Release 附件，构建产物继续由 Git 忽略。

在消费工程的 `packages/manifest.json` 中合并所需插件的依赖项，例如：

```json
{
  "dependencies": {
    "loom.bt": "https://github.com/eggbbq/loom/releases/download/v0.1.1/loom.bt-1.0.0.layapkg"
  }
}
```

安装全部插件可使用 Release 附件中的 [manifest.json](https://github.com/eggbbq/loom/releases/download/v0.1.1/manifest.json)，保留工程已有依赖。需要 core 的 pathfinding 应同时添加两包的 URL。首次安装不要使用 `--skip-package-install`。Git 仓库地址不作为安装源。

CLI 3.4.1 的 Happy DOM 会对跨域下载额外发送 OPTIONS 请求，GitHub Release 不接受该预检。本仓库的 CLI 包装脚本仅对 `.layapkg` 下载使用 curl，保留官方安装与编译流程；例如 `node scripts/laya.mjs build web --project /path/to/game` 可协调目标工程中的远程包。此兼容层只用于 CLI，不随插件分发，也不修改 IDE 或引擎文件。

完整步骤、全局调用示例、可选 import、加载顺序以及 `build~/` 和 `library/packages/build/` 的区别见 [安装与构建指南](docs/plugin-distribution.md)。

各包以独立 JS 插件方式加载并挂载 `loom.xxx`，保留编辑器重载恢复。Runtime JS 在 Laya 引擎之后、业务脚本之前执行，插件依赖同时通过 `pluginDependencies` 和 JS 插件 `.meta.references` 声明。在 LayaAir 3.4.1 的 Scene、官方预览和 Web 中，正序/倒序清单均通过业务顶层零 import 访问验证。API 挂载与资源、服务的异步初始化分别处理。完整验证见 [JS 安装包验证](docs/js-plugin-verification.md)。

需要只使用全局 API 的 TypeScript 工程，可在 `tsconfig.json` 的 `include` 中追加 `"./library/packages/*/index.d.ts"`，保留原有条目。这只包含类型声明，不改变运行时执行顺序。工程不要设置 `globalName: "loom"` 覆盖共享全局对象。

源码继续使用 TS 开发；每个 `index.ts` 保留 `@Laya.regClass()` 入口标记，让官方编译器收集顶层挂载代码。最终安装包包含预编译 JS 与 `.d.ts`，不分发实现 `.ts`。

需要源码版时显式执行 `npm run build:source`，输出至 `release/plugins/source/`。同名源码版与 JS 版应二选一安装。源码版默认 Web 合并流程的历史限制见 [源码安装包启动顺序验证](docs/package-startup-verification.md)。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `./build.sh` | 安装依赖并构建所有插件 |
| `./build.sh loom.atlas` | 安装依赖并构建指定插件 |
| `npm run list:plugins` | 列出插件包 |
| `npm run check` | TypeScript 检查 |
| `npm test` | 插件功能测试 |
| `npm run build` | 检查、测试并导出所有 JS 插件安装包 |
| `npm run build -- loom.atlas` | 导出指定 JS 插件及其显式依赖；仍执行项目检查与测试 |
| `npm run verify:collector` | 在隔离工程中安装产物，验证实际包入口和资源导出 |
| `npm run verify:address-mapping` | 在隔离工程中安装产物，验证配置、CLI 与映射资源导出 |
| `npm run verify:i18n` | 在隔离工程中安装产物，验证翻译服务与 Web 运行时入口 |
| `npm run verify:ui` | 在隔离工程中安装产物，验证面板导航、缓存、生命周期与提示复用 |
| `npm run verify:bt` | 验证独立行为树安装、原生组件和发布入口 |
| `npm run verify:pathfinding` | 验证寻路、动态障碍、平滑、Scene 烘焙及 core 依赖 |
| `npm run verify:core` | 验证模块、消息、存档、节点扩展、协程及发布入口 |
| `npm run verify:startup` | 验证默认 JS 包正序/倒序下 Scene、官方预览与 Web 的业务顶层零 import 调用 |
| `npm run verify:remote -- --local --skip-build` | 经本地 HTTP 下载实际安装包，验证远程安装和顶层启动 |
| `npm run verify:remote -- --skip-build` | 从构建清单中的真实 Release URL 安装并验证 |
| `npm run release` | 将已构建的全部插件与清单发布到 GitHub Releases；要求代码已提交并推送 |
| `npm run build:js` | 与默认 build 相同，导出预编译 JS 安装包 |
| `npm run build:source` | 显式导出源码包至 release/plugins/source/ |
| `npm run verify:js` | 验证 JS 包独立安装、原生功能、类型和 Web 发布 |
| `npm run verify:js:startup` | 验证 JS 包正序/倒序清单下 Scene、官方预览与 Web 的顶层零 import 调用 |
| `npm run build:web` | 构建开发工程的 Web 演示，用于验证资源导出 |
| `npm run preview` | 启动官方 CLI 预览服务器 |

安装包输出为 `release/plugins/<包名>-<版本>.layapkg`。构建脚本调用官方 `export-installable-package`，按插件 `package.json` 中的版本命名；脚本不执行远程发布。导出命令指定当前工程并使用 `--skip-package-install`。JS 编译所需的源码包在 temp 隔离目录内生成和安装，构建结束后清理；不会将这些源码中间包放入默认分发目录。源码验证命令保留为 `verify:source:<名称>`；`verify:source:startup` 的历史 Web 失败预期保持不变。

安装包已构建时，可用 `npm run verify:startup -- --skip-build` 或 `npm run verify:address-mapping -- --skip-build` 验证现有产物；`npm run verify:js -- --skip-build` 验证全部 JS 插件。直接调用 npm 命令前先执行 `npm ci`。

## 目录

```text
assets/
  plugins/
    loom.address/          独立 address 插件
    loom.bt/               独立 BT 插件
    loom.core/             独立 core 插件
    loom.ui/ ...           其他独立插件
  examples/                插件演示资源，不进入插件包
  editorResources/         开发工程的配置，不进入插件包
src/                       标准工程的运行时脚本
engine/types/              官方模板提供的引擎与编辑器声明
scripts/                   通用 CLI 调用和插件构建脚本
tests/                     插件功能测试
release/plugins/           生成的安装包，Git 忽略
```

## 添加插件

1. 在 `assets/plugins/loom.<插件名>/` 创建源码、`index.ts` 和 `package.json`，包名采用 **`loom.<插件名>`**，版本采用语义版本。
2. 用 `@IEditor.*` 注册 UI 脚本，用 `@IEditorEnv.*` 注册 Scene/构建脚本。在包 `index.ts` 中挂载自己的 `loom.xxx`，保留注册入口标记和编辑器重载回调。发布钩子必须收集入口，并验证实际安装后的执行结果。
3. 将测试放入 `tests/`，示例放入 `assets/examples/<插件名>/`。保留脚本 `.meta` 的 UUID。
4. 执行 `npm run build -- loom.<插件名>`，在目标项目通过包管理器安装产物。

构建脚本自动发现 `assets/plugins` 下带 `package.json` 的模块目录，无需为每个插件复制构建脚本。每个插件必须自包含，不能依赖 Mistedge 或本仓库其他插件的隐式全局状态。

## 当前插件

- [Loom Address](assets/plugins/loom.address/README.md)（`loom.address`）：按资源文件名生成短键地址映射，支持多目录配置、资源事件更新、CLI 校验与发布收集，并提供 `loom.address.load()` 和 `loom.address.data` 运行时 API。
- [Loom Atlas](assets/plugins/loom.atlas/README.md)（`loom.atlas`）：将外部或手工制作的 `.atlas` 接入编辑视图、预览与发布，注册子图映射并收集图集及整图资源。
- [Loom BT](assets/plugins/loom.bt/README.md)（`loom.bt`）：代码式行为树、动作生命周期和 Laya 组件驱动。
- [Loom Core](assets/plugins/loom.core/README.md)（`loom.core`）：模块、消息、存档、协程、状态机、网络和原生 Laya 工具。
- [Loom I18n](assets/plugins/loom.i18n/README.md)（`loom.i18n`）：语言偏好持久化、翻译字典替换与查询，以及语言对象绑定、自动刷新和解除绑定。
- [Loom Pathfinding](assets/plugins/loom.pathfinding/README.md)（`loom.pathfinding`）：网格与区块 A*、编辑器烘焙、动态障碍、移动 Agent 和路径平滑；声明依赖 loom.core。
- [Loom UI](assets/plugins/loom.ui/README.md)（`loom.ui`）：面板管理、导航、生命周期代理、动画、关闭按钮和可配置提示。

## 许可证

MIT，见 [LICENSE](LICENSE)。插件包各自携带许可证。
