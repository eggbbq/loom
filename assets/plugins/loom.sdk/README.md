# Loom SDK

独立 LayaAir 3.4.1 编辑器插件，包名 `loom.sdk`。向项目生成默认 TypeScript 适配器，用于接入微信、抖音小游戏等第三方 SDK。适配器属于项目，接口、环境配置、广告逻辑和平台差异均可自行修改；插件不内置第三方 SDK，也不提供 SDK Runtime JS。

## 安装与生成

执行 `./build.sh loom.sdk`，在目标工程的包管理器安装 `release/plugins/loom.sdk.layapkg`。首次加载生成：

- `src/loom/sdk.ts`：项目运行时适配器、类型契约和全局 `loom.sdk` 挂载。
- `src/loom/sdk.bundledef`：独立脚本包，在业务主包之前加载，支持业务顶层零 import 调用。
- `assets/editorResources/loom.sdk/config.json`：生成路径配置，默认 `{ "output": "src/loom/sdk.ts" }`。
- `assets/editorResources/loom.sdk/sdk.txt`：项目自己的适配器模板。

文件只在缺失时创建。重新生成、重载、升级和重新安装均不覆盖已有适配器、模板、配置、脚本包与 `.meta` UUID。直接修改 `src/loom/sdk.ts` 即可定制；修改模板仅影响之后的新建适配器。若要重新从模板生成，删除适配器 `.ts`，保留 `.meta` 与 `.bundledef`，再执行生成菜单。

生成的 TS 在下一次 Laya 脚本编译时生效。IDE 会在文件创建后重新编译；CLI 工程请先执行下方 `LoomSDKPlugin.generate` 命令，再编译或运行使用 `loom.sdk` 的业务代码。首次安装的生成阶段不提供 SDK 运行时占位对象。

工具菜单提供“SDK：生成适配器”“SDK：打开适配器”“SDK：打开模板”“SDK：配置”，支持中英文。路径相对项目根目录，只允许 `src/` 下的 `.ts` 文件。改变生成路径前，请同步迁移原适配器、脚本包和各自 `.meta`，避免两个适配器同时挂载；插件不自动删除旧文件。不要为脚本包设置 `globalName: "loom"`。

## 调用与接入

```ts
loom.sdk.init(); // 配置默认读取全局 $env / env，缺失时使用空 appid 与 debug: false

loom.sdk.init({ appid: "your-app-id", debug: false });

loom.sdk.login({
    success: () => console.log("logged in"),
    fail: () => console.log("login failed"),
});
```

默认适配器参考 `jigsawdrop-laya/src/sdk` 的 `minisdk` 契约，优先读取 `GameGlobal.__sdk` 或全局 `__sdk`，兼容 `minisdk` 及其 `.sdk` 成员，不改写第三方 SDK 全局。第三方 SDK 应在调用 `init()` 前加载；每次调用动态读取，支持晚于适配器加载。`init(config)` 同时将配置写入宿主和 `globalThis.$env`，兼容本仓库独立 [platform](../../../platform/README.md) 工程读取全局配置的实现。也可显式注入：

```ts
import type { MiniGameSDK } from "./loom/sdk";

const platformSDK: Partial<MiniGameSDK> = {
    platform: "wechat",
    init(config) { /* 初始化项目选择的第三方 SDK */ },
    login(options) { /* 调用第三方实现，完成后执行 success / fail */ },
};
loom.sdk.use(platformSDK);
loom.sdk.init();
// 或 loom.sdk.init(config, platformSDK);
```

微信原生 `wx`、抖音原生 `tt` 的接口与此统一契约不同；项目可修改适配器或通过 `use()` 注入转换后的实现。插件不下载、打包或自动引入平台原生 SDK。

默认能力包括启动参数、登录、用户资料、授权设置、用户信息按钮、插屏广告、激励视频、分享、抖音侧边栏跳转与来源判断。保留 `scene` 的数字/字符串原值和原生插屏错误；分享不判断成功或取消，广告暂停/恢复游戏留给项目实现。方法调用保持第三方对象的 `this`；业务回调异常记录到控制台。

与参考适配器一致，缺少方法时使用预览回退：回调类方法默认成功，用户资料与设置返回空数据，启动参数返回空场景与 query，侧边栏来源为 false，分享无操作。激励视频缺失也会执行成功回调，项目正式接入时应按业务需要修改此回退。第三方已提供的方法返回失败时会转发失败，不用回退覆盖。

生成代码自带 `Loom` 声明合并，不需要通过包声明给运行时占位。项目的 `tsconfig.json` 应包含 `src/`。适配器保留已有 Loom 成员，在引擎初始化和 Scene 脚本重载后恢复同一服务对象。SDK 初始化由业务调用，插件不自动初始化。

## CLI、构建与进程

```sh
layaair --version=3.4.1 run -p /path/to/project --script=LoomSDKPlugin.generate
npm run verify:sdk
```

`index.ts` 保留 Scene 注册入口；`editor/sdk-plugin.ts` 在 Scene 进程生成文件；`editor/sdk-editor.ts` 在 UI 进程注册原生菜单；包内 `editorResources/loom.sdk/sdk.txt` 是编辑器专用的纯文本 TypeScript 模板，只有复制到项目后才编译进 Preview/Web。生成过程使用同步 Node 文件操作，不等待资源导入，不引入运行时 Node 依赖。

默认安装包仅包含预编译 Scene/UI 编辑器代码、声明、模板、README 与许可证。包内 `loom.runtime: false` 告知通用构建脚本不输出 Runtime JS 或运行时模块桥接。`npm run build:source` 仍可输出显式源码版。生成文件继续留在项目中，卸载插件不删除项目适配器。

测试：`npm test`。实际安装验证：`npm run verify:sdk`，覆盖 CLI 生成、项目修改保留、UUID、TypeScript 声明、Scene 与官方 Preview/Web 的业务顶层 `loom.sdk.init()` 调用。测试不随插件分发。

MIT，见 LICENSE。
