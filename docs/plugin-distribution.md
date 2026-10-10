# 插件安装与构建

默认分发方式是每个插件一个独立的预编译 JS `.layapkg`。仓库中继续使用 TypeScript 开发；目标工程安装 JS、类型声明和资源，可独立升级、卸载插件。

## 构建与安装

在仓库根目录执行：

```sh
./build.sh                 # 安装锁定依赖，检查、测试并构建全部插件
./build.sh loom.address    # 构建指定插件
./build.sh loom.pathfinding # 同时输出依赖的 loom.core
```

产物为 `release/plugins/<包名>.layapkg`。在目标工程的 LayaAir 包管理器中选择这些安装包；依赖包也需要可供安装。脚本只生成本地产物，不发布到远程仓库或商店。

构建同时生成 `manifest.json`、`distribution.json` 和 `SHA256SUMS`；单插件构建的清单仅包含该插件及其依赖，不混入目录中已有的其他安装包。

已经执行过 `npm ci` 时，可以使用 `npm run build` 或 `npm run build -- loom.bt`。`npm run build:js` 是默认构建的同义命令。Node.js 要求 20 或更新版本，官方 LayaAir CLI 使用 3.4.1。

包管理器显示名称统一使用 `Loom Address`、`Loom Atlas`、`Loom BT`、`Loom Core`、`Loom I18n`、`Loom Pathfinding`、`Loom Report`、`Loom SDK`、`Loom UI`。程序包标识仍为 `loom.address` 等；项目配置目录与包名一致，例如 `assets/editorResources/loom.address/`、`loom.atlas/`。首次加载创建缺失的默认配置，重载和升级保留已有配置；Address 和 Atlas 会将旧配置复制到新目录，旧文件及 UUID 保留为备份，新路径已有配置时不覆盖。

## 远程安装与发布

GitHub 仓库保存源码，GitHub Releases 附件保存构建后的 `.layapkg`。消费工程通过 HTTP(S) 下载直链安装，保持独立插件管理。当前默认 Release 标签为仓库版本 `v0.4.1`；插件自己的版本仍分别取自各插件 `package.json`。

文件名固定为 `<包名>.layapkg`，版本仍保留在包内 `package.json` 和 `distribution.json`，用于包管理器及依赖解析。不同 Release tag 产生不同 URL，例如 `/download/v0.3.0/loom.bt.layapkg` 与 `/download/v0.4.1/loom.bt.layapkg`。本地每次构建不会自动生成 tag；同一个 tag 下重复构建得到相同 URL。已有 v0.1.1 Release 保留原带版本号附件，新文件名从后续发布开始使用。

将生成的 `release/plugins/manifest.json` 的依赖项合并到游戏工程的 `packages/manifest.json`，保留已有依赖。发布 `v0.4.1` 后，只安装 BT 的例子：

```json
{
  "dependencies": {
    "loom.bt": "https://github.com/eggbbq/loom/releases/download/v0.4.1/loom.bt.layapkg"
  }
}
```

需要 pathfinding 时，同时加入生成清单中的 `loom.pathfinding` 和 `loom.core` URL。只填写插件版本号会走 Laya 资源商店解析，因此私有分发的依赖也要明确填写直链。类型配置和全局 API 用法与本地安装一致。

**CLI 3.4.1 兼容说明：** 原生 CLI 使用 Happy DOM 的 fetch，连普通跨域 GET 也发送 OPTIONS 预检；GitHub Release URL 不接受这种请求。本仓库 `scripts/laya.mjs` 的 CLI 包装流程预加载一个仅用于 `.layapkg` HTTP(S) 下载的 curl 兼容层，其余资源请求继续走原有实现。包依赖解析、提取、安装、Scene 加载和编译仍由官方 CLI 完成，IDE 和引擎文件不修改。

通过包装脚本安装并构建消费工程：

```sh
node /path/to/loom/scripts/laya.mjs build web --project /path/to/game
```

显式指定 `--project` 时，包装脚本允许官方 CLI 协调目标工程的包；首次安装不要使用 `--skip-package-install`。不指定目标工程时，原有命令仍在本仓库运行并跳过包安装。这个兼容层不进入插件安装包；编辑器包管理器的图形操作需要在相应 IDE 环境验证。

发布步骤：

```sh
./build.sh
npm run verify:js -- --skip-build
npm run verify:remote -- --local --skip-build
npm run build:web
# 提交并推送源码后：
npm run release
npm run verify:remote -- --skip-build
```

`npm run release` 上传已经构建和验证的全部插件，不重新构建。脚本检查工作区干净、当前提交已推送到 origin、清单和安装包校验值一致；先创建 Release 草稿，上传所有插件安装包及三个清单/校验附件，全部完成后发布。同名 Release 已存在时拒绝覆盖，避免改变固定版本 URL 的内容。

发布认证使用 `GH_TOKEN` / `GITHUB_TOKEN`，也可使用已经配置的 GitHub Git credential helper；需要仓库 Contents 写权限。令牌不会写入文件或命令参数。发布工具使用 Git 和 curl，不要求安装 GitHub CLI。

后续版本可更新仓库 `package.json` 的版本，或在构建时指定标签：

```sh
LOOM_RELEASE_TAG=v0.4.1 ./build.sh
```

也可通过 `LOOM_RELEASE_REPOSITORY=owner/repo` 改变构建清单中的 GitHub 仓库，或用 `LOOM_PACKAGE_BASE_URL=https://your-server.example/plugins/v0.4.1` 生成其他服务器的下载直链。GitHub 发布脚本要求清单仓库与 origin 一致；自有服务器的附件上传由对应部署流程完成。

升级时修改消费工程中的版本 URL。清单中的 URL 指向具体 Release，发布新版本不会自动替换游戏已选择的版本。`.git` 地址、仓库网页和 GitHub 自动生成的源码 ZIP 不能替代安装包直链。

## 全局 API 与类型

安装完成后，在消费工程的 `tsconfig.json` 中保留原有配置，并在 `include` 中追加包入口声明。标准工程示例：

```json
{
  "include": [
    "./assets",
    "./src",
    "./engine",
    "./library/packages/*/index.d.ts"
  ]
}
```

这一步提供 TypeScript 类型，不引入运行时脚本。已有 `compilerOptions` 和其他 `include` 项目应保留；首次安装后类型提示未刷新时，重启 TypeScript 服务。

每个包在 `index.ts` 中使用一个 `install()` 函数完成 API 挂载，并注册引擎初始化与 Scene 用户脚本重载回调。保留入口注册标记供安装包编译器收集代码，无需额外的运行时包装类。

默认 JS 包允许业务模块顶层直接访问已经挂载的 API：

```ts
const builder = new loom.BTBuilder();
const notifier = new loom.Notifier();
const offset = loom.pool.v3.rent(1, 0, 2);
loom.pool.v3.release(offset);
```

Core、BT、Pathfinding 和 UI 的公开类、枚举与工具直接挂载到 `loom`，不再使用 `loom.core`、`loom.bt`、`loom.pathfinding` 层级；`loom.address` 提供 `load` 和 `data`；`loom.i18n` 是翻译服务对象；`loom.ui` 是 UIManager 实例；`loom.report.to(channel, ...args)` 将业务数据转发到 window 上注册的 SDK 适配器函数。Atlas 自动接入子图映射和资源收集，没有 `loom.atlas` 命名空间。

公开包入口仍支持显式导入，适合使用局部名称、继承类或引用类型：

```ts
import { BTBuilder } from "~/packages/loom.bt";
import { LangBase } from "~/packages/loom.i18n";
import { UIPanel, UITipsManager } from "~/packages/loom.ui";
```

沿用标准工程的 `~/packages/*` 路径映射。`LangBase`、`UIPanel`、`UITipsManager` 等包导出不等于翻译/UI 单例的成员；应按各插件 README 使用。以公开包入口为稳定导入接口，不依赖内部文件的深层路径。

## 加载与启动顺序

Preview 和 Web 先加载 Laya 引擎，再加载插件 Runtime JS，最后执行业务 bundle。Scene 使用单独的编辑器编译产物，在用户脚本加载或重载后恢复全局挂载。LayaAir 3.4.1 的 Scene、官方预览和 Web 已通过正序、倒序包清单下业务顶层零 import 验证，详见 [验证记录](js-plugin-verification.md)。

插件之间的真实依赖写入 `package.json` 的 `pluginDependencies`；构建脚本将依赖同时写入 Runtime JS 的 `.meta.references`。目前 `loom.pathfinding` 依赖 `loom.core`，保证 core 先加载。无依赖的包不要求固定先后顺序，不应通过包清单排列或文件名控制启动。

API 挂载完成后，资源加载和业务服务初始化仍由项目安排。例如在引擎初始化后调用 `await loom.address.load()`，再把结果交给需要地址数据的服务；UI 预制体、翻译字典和导航数据也按项目流程加载。

`loom.tables` 连接消费工程生成的 schema，采用项目适配器：Scene 插件从 `tables.txt` 生成 `src/loom/tables.ts`，配套 `tables.bundledef` 设置 `loadBeforeMain`，在业务 bundle 前挂载 `Tables` 实例。包本身不包含项目表结构，API 类型由生成的 TS 提供。安装时 schema 尚不存在会等待外部生成；数据加载仍由项目安排。项目模板与手工修改的适配器保留，详见 [Loom Tables](../assets/plugins/loom.tables/README.md)。

## build 目录分别做什么

安装包内容示意：

```text
loom.<name>/
  package.json
  README.md / LICENSE
  loom.<name>.runtime.js       Preview/游戏运行代码及自动加载元数据
  index.js / index.d.ts        公开导出桥接与类型入口
  runtime/ ...                 类型声明、导出桥接及原脚本 UUID
  build~/
    bundle.scene.js            Scene 进程代码
    bundle.editor.js           UI 进程代码，仅需要 UI 的包提供
```

`build~/` 是构建脚本放入安装包的编辑器预编译目录，其中 JS 由官方编译器生成。它不包含完整游戏 Runtime，因此 Runtime JS 单独打包。安装包保留组件 UUID、注册名和编辑器属性描述，目标工程无需插件实现 `.ts`。

消费工程的 `library/packages/build/` 是 Laya 自动生成的包编译与加载缓存，与包内的 `build~/` 用途不同。`library/`、`temp/`、`release/` 都是生成目录，不修改其中的文件作为长期源码。要修改插件，编辑本仓库 `assets/plugins/loom.<name>/` 后重新构建、安装产物。

构建所需的源码中间包在 `temp/` 隔离目录内生成和安装，成功后清理。默认 `release/plugins/` 保留最终 JS 安装包；不会同时输出一套源码中间包。

## 验证与源码版

```sh
npm run verify:js -- --skip-build          # 所有 JS 包的独立安装与功能
npm run verify:tables -- --skip-build     # 安装包生成适配器及主脚本前挂载
npm run verify:startup -- --skip-build     # 正序/倒序顶层访问
npm run verify:remote -- --local --skip-build # 发布前：本地 HTTP 下载与安装
npm run verify:remote -- --skip-build      # 发布后：真实 Release 下载与安装
npm run verify:address-mapping -- --skip-build # 单个插件
npm run build:web                         # 开发工程资源导出
```

`--skip-build` 使用现有产物；省略它会先构建。全量结果位于 `temp/verification-logs/js-plugin-functions.json` 与 `js-package-startup.json`，单插件功能结果文件名带有包名。测试和示例不进入安装包。

需要源码版时显式执行 `npm run build:source` 或 `npm run build:source -- loom.bt`，输出到 `release/plugins/source/`。同名 JS 版、源码版与直接放入工程的源码应选择一种接入。源码版的 Web 合并流程曾出现业务顶层先于全局挂载执行，详见 [历史验证](package-startup-verification.md)。

当前自动加载与原生功能验证覆盖 LayaAir 3.4.1 的 Scene、官方 Preview 和 Web；其他引擎版本或小游戏发布目标需要在相应环境中验证。
