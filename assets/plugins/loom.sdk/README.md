# Loom SDK

独立 LayaAir 3.4.1 编辑器插件，包名 `loom.sdk`。向项目生成默认 TypeScript 适配器，用于接入微信、抖音小游戏等第三方 SDK。适配器属于项目，接口、环境配置、广告逻辑和平台差异均可自行修改；插件不内置第三方 SDK，也不提供 SDK Runtime JS。

## 安装与生成

执行 `./build.sh loom.sdk`，在目标工程的包管理器安装 `release/plugins/loom.sdk.layapkg`。首次加载将包内 `.txt` 文件复制到项目 `src/loom/`，只去掉最后的 `.txt`：

| 包内文本资源 | 项目文件 |
| --- | --- |
| `loom.sdk.ts.txt` | `src/loom/loom.sdk.ts` |
| `loom.sdk.d.ts.txt` | `src/loom/loom.sdk.d.ts` |
| `loom.wechat.js.txt` | `src/loom/loom.wechat.js` |
| `loom.douyin.js.txt` | `src/loom/loom.douyin.js` |

同时创建：

- `src/loom/loom.sdk.entry.ts`：独立 Laya 注册入口，导入适配器并挂载全局 `loom.sdk`。
- `src/loom/loom.sdk.bundledef`：独立脚本包，在业务主包之前加载，支持业务顶层零 import 调用。
- `assets/editorResources/loom.sdk/config.json`：生成路径配置，默认 `{ "output": "src/loom/loom.sdk.ts" }`。
- `assets/editorResources/loom.sdk/loom.sdk.ts.txt`：项目自己的适配器模板。

所有源码、声明和平台 JS 文件只在缺失时复制，内容保持原样。原生平台 JS 的 `.meta` 默认关闭自动导入，由小游戏入口选择加载微信或抖音脚本。重新生成、重载、升级和重新安装均不覆盖已有适配器、模板、配置、脚本包与 `.meta` UUID。直接修改 `src/loom/loom.sdk.ts` 即可定制；修改模板仅影响之后的新建适配器。若要重新从模板复制，删除适配器 `.ts`，保留 `.meta`、`.entry.ts` 与 `.bundledef`，再执行生成菜单。

生成的 TS 在下一次 Laya 脚本编译时生效。IDE 会在文件创建后重新编译；CLI 工程请先执行下方 `LoomSDKPlugin.generate` 命令，再编译或运行使用 `loom.sdk` 的业务代码。首次安装的生成阶段不提供 SDK 运行时占位对象。

工具菜单提供“SDK：生成适配器”“SDK：打开适配器”“SDK：打开模板”“SDK：配置”，支持中英文。路径相对项目根目录，只允许 `src/` 下的 `.ts` 文件。改变生成路径前，请同步迁移原适配器、脚本包和各自 `.meta`，避免两个适配器同时挂载；插件不自动删除旧文件。不要为脚本包设置 `globalName: "loom"`。

## 调用与接入

```ts
loom.sdk.init(); // 默认使用 create() 时读取的全局 $env / env

loom.sdk.init({ appid: "your-app-id", debug: false });

loom.sdk.login({
    success: () => console.log("logged in"),
    fail: () => console.log("login failed"),
});
```

包内 `editorResources/loom.sdk/loom.sdk.ts.txt` 与 [platform/src/loom.sdk.ts](../../../platform/src/loom.sdk.ts) 内容完全一致。`npm run build` 和 `npm run build:source` 在构建前从平台源码同步包内默认模板；项目自己的模板与已生成适配器不会被同步覆盖。`sh platform/scripts/build.sh` 还会将所有平台构建产物以“完整原名 + `.txt`”复制至同一资源目录，包括 `loom.sdk.d.ts.txt`、`loom.wechat.js.txt` 和 `loom.douyin.js.txt`；包内这些文件是编辑器文本资源，安装后才还原为项目中的源码；平台 JS 不自动执行，由项目选择引入。

生成器将模板原样复制到项目 TS，并在独立 `.entry.ts` 中提供 Laya 注册入口、`create()` 调用与加载/重载恢复代码。独立平台工程不依赖 Laya。默认实现通过全局 `__sdk` 接入微信、抖音平台代码，平台脚本应先于生成的适配器加载。`init(config)` 将配置写入宿主与 `globalThis.$env`；不传参数时使用 `create()` 时取得的 `$env / env`，缺失时采用空 appid 与 debug: false。项目可按需要修改生成的代码。

旧默认适配器 `src/loom/sdk.ts` 会连同 `.meta` 和脚本包迁移为 `loom.sdk.ts`，保持定制内容与 UUID；已有目标文件时不覆盖。自定义 `config.output` 继续有效，其他文本资源仍还原到 `src/loom/`。

旧项目使用 `assets/editorResources/loom.sdk/sdk.txt` 或 `loom.sdk.txt` 时，首次加载将其及 `.meta` 重命名为 `loom.sdk.ts.txt`，保留内容和 UUID。新旧名称都存在时优先使用新文件，不覆盖任何已有文件或生成的适配器。

默认能力包括启动参数、登录、用户资料、授权设置、用户信息按钮、插屏广告、激励视频、分享、抖音侧边栏跳转与来源判断。保留 `scene` 的数字/字符串原值和原生插屏错误；分享不判断成功或取消，广告暂停/恢复游戏留给项目实现。方法调用保持第三方对象的 `this`；业务回调异常由适配器隔离。

与参考适配器一致，缺少方法时使用预览回退：回调类方法默认成功，用户资料与设置返回空数据，启动参数返回空场景与 query，侧边栏来源为 false，分享无操作。激励视频缺失也会执行成功回调，项目正式接入时应按业务需要修改此回退。第三方已提供的方法返回失败时会转发失败，不用回退覆盖。

生成代码自带 `Loom` 声明合并，不需要通过包声明给运行时占位。项目的 `tsconfig.json` 应包含 `src/`。适配器保留已有 Loom 成员，在引擎初始化和 Scene 脚本重载后恢复同一服务对象。SDK 初始化由业务调用，插件不自动初始化。

## CLI、构建与进程

```sh
layaair --version=3.4.1 run -p /path/to/project --script=LoomSDKPlugin.generate
npm run verify:sdk
```

`index.ts` 保留 Scene 注册入口；`editor/sdk-plugin.ts` 在 Scene 进程生成文件；`editor/sdk-editor.ts` 在 UI 进程注册原生菜单；包内 `editorResources/loom.sdk/loom.sdk.ts.txt` 是编辑器专用的纯文本 TypeScript 模板，只有复制到项目后才编译进 Preview/Web。生成过程使用同步 Node 文件操作，不等待资源导入，不引入运行时 Node 依赖。

默认安装包仅包含预编译 Scene/UI 编辑器代码、声明、文本资源、README 与许可证。包内 `loom.runtime: false` 告知通用构建脚本不输出 Runtime JS 或运行时模块桥接。`npm run build:source` 仍可输出显式源码版。生成文件继续留在项目中，卸载插件不删除项目适配器。

测试：`npm test`。实际安装验证：`npm run verify:sdk`，覆盖 CLI 生成、项目修改保留、UUID、TypeScript 声明、Scene 与官方 Preview/Web 的业务顶层 `loom.sdk.init()` 调用。测试不随插件分发。

MIT，见 LICENSE。
