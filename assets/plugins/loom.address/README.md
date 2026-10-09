# Loom Address

标准 LayaAir 3.4.1 插件，包名 `loom.address`。以资源文件名作为短键，生成地址映射，并提供运行时加载 API。无需 Python、npm 运行时依赖或外部文件观察器。安装包包含预编译的编辑器与运行时 JS 及类型声明，保留 CLI 注册名、组件 UUID 和 Preview/发布入口。

## 安装与配置

执行 `./build.sh loom.address`，在目标工程的包管理器安装 `release/plugins/loom.address-1.1.2.layapkg`。首次加载自动生成 **`assets/editorResources/address-mapping-watcher/config.json`**；升级、脚本重载和重新安装均保留已有配置。

默认 `watchDirs` 为空，不生成或改写任何映射。通过工具菜单“资源地址映射：配置”打开文件，填入目标工程的目录：

```json
{
  "watchDirs": ["resources/icons", "resources/portraits"],
  "extensions": [".png", ".jpg", ".jpeg", ".webp"],
  "output": "resources/address.json",
  "debounceMs": 600,
  "runOnStart": true,
  "pretty": false
}
```

路径相对 `assets`；兼容 `assets/` 前缀和 Windows 分隔符，但不能填写绝对路径、`..`、包路径、插件源码或 `editorResources`。所有目录递归扫描并使用同一扩展名列表。重叠目录中的文件只收集一次；缺失目录暂时跳过，之后创建目录时原生事件会重新生成。`watchDirs: []` 停止观察并保留已有输出。改动 `output` 后旧文件保留，由项目自行决定是否删除。

保存配置立即生效；工具菜单“资源地址映射：更新”可手动生成。`runOnStart` 只控制 IDE 启动生成，手动命令、资源事件与发布仍会更新。无变化时不写文件。格式化选项在下一次映射内容变化时应用。无效配置会报错并保留上一次输出，修正后恢复。

## 映射协议

```json
{"$path":[["resources/icons",".png"],["resources/portraits",".jpg"]],"apple":0,"hero":1}
```

`$path` 保存目录和扩展名，数值指向对应项；如 `apple` 对应 `resources/icons/apple.png`。沿用原工具的扩展名小写、区分短键大小写的行为。建议资源扩展名实际使用小写。目录按配置顺序扫描，目录内按完整路径排序；同名短键保留第一项，在控制台列出全部冲突。`$path` 是保留键，同名资源报错，避免破坏协议。隐藏目录/文件、输出本身、子资源、包内与内置资源不进入映射。

## 运行时加载

```ts
const addresses: Record<string, string> = await loom.address.load();
const apple = addresses.apple; // resources/icons/apple.png
```

方法签名为 `loom.address.load(address = "resources/address.json"): Promise<Record<string, string>>`。输出路径可作为参数传入，例如 `await loom.address.load("data/icons.json")`；运行时不读取编辑器配置。加载与解析完成后释放 JSON 资源，返回展开后的字典，并将同一字典保存到 `loom.address.data`，供后续插件直接读取、复用已加载的数据；首次加载前 `data` 为 `undefined`。不调用 `setGetAddress`，不预加载字典中的图片。无效映射或索引使 Promise 拒绝，保留上一次成功加载的数据；空 `$path` 返回空字典。调用方可保存返回值或读取 `data`，自行执行 `addresses[key] ?? key` 等回退。

源码入口 `index.ts` 负责全局挂载与重载恢复；`runtime/address-mapping-runtime.ts` 中的类负责加载与解析。安装包由 `loom.address.runtime.js` 执行挂载，业务顶层可访问 API；加载资源的 `loom.address.load()` 应在引擎初始化后调用。全局 API 包含加载方法 `load` 和最近一次加载结果 `data`。挂载保留已有 loom 框架及其他成员；Scene 进程在脚本加载后注册，并在脚本重载后恢复命名空间。安装包的 `index.d.ts` 引用运行时声明；已有 loom 框架可使用 `interface LoomGlobal extends LoomApi {}` 合并自己的 API 类型，避免重复声明全局 loom 变量。

## CLI 与发布

在安装了插件的工程中运行：

```sh
layaair --version=3.4.1 run -p /path/to/project --script=LoomAddressMappingPlugin.runNow
layaair --version=3.4.1 run -p /path/to/project --script=LoomAddressMappingPlugin.check
```

`check` 仅检查映射数据是否一致，不修改输出；过期时返回非零退出码。CLI 加载不会自动生成映射，因此校验不会被启动写入掩盖。首次执行仍会创建缺失的项目配置。发布钩子在资源收集之前更新输出，并把映射与匹配资源加入导出集合，支持观察 `resources` 之外的资源目录。项目自身的导出路径变更、压缩、分包规则仍应与运行时加载协议兼容。

当前 CLI 3.4.1 在部分新消费工程中使用 `--skip-package-install` 会丢失包资源根并报告 `getAllAssetsInDir(null)` 编译错误；省略该选项走正常包协调可避免。当前 JS 分发流程保留官方编译器的类注册名，已实际验证预编译后的 CLI 方法及 UI 到 Scene 的调用。

## 源码进程分工与事件

- `address-mapping-plugin.ts`：Scene 注册、加载/卸载生命周期、`assetMgr.onAssetChanged`、`Laya.timer` 合并事件、串行生成、CLI 与发布钩子。所有路径通过 `assetMgr.toFullPath` 转成绝对路径；读写使用 `IEditorEnv.utils` 和资源数据库。
- `address-mapping-editor.ts`：UI 原生菜单与中英文翻译；用 `assetDb.onAssetChanged` 监听配置并通过 `Editor.scene.runScript` 转发。`editorResources` 不保证存在于 Scene 资源库，因此两个进程分别观察。
- `editor/address-mapping.ts`：共用配置校验与映射算法，不注册运行时入口。
- `runtime/address-mapping-runtime.ts`：实现全局 API 安装、原生 Loader 加载和映射展开，由 `index.ts` 显式调用安装并处理重载恢复，供 Preview 与发布中的业务脚本调用。

移动事件不提供旧路径，因此任意资源移动都会重新扫描，覆盖资源移出观察目录和父目录重命名。启动生成通过计时器在加载钩子返回后执行，避免 IDE 在资源导入/热重载时互相等待。卸载移除监听、清理计时器并取消旧一轮排队任务；已开始的任务在异步等待后检查是否已卸载，不阻塞资源导入。输出事件被过滤，不会递归触发生成。

测试：`npm test`；安装验证：`npm run verify:address-mapping`。测试和演示资源不随插件分发。

MIT，见 LICENSE。

默认构建输出预编译 JS、`.d.ts` 与资源的独立 `.layapkg`。Runtime JS 在业务脚本之前自动加载；Scene 在用户脚本加载/重载后恢复挂载。类型配置可在 `tsconfig.json` 的 `include` 中追加 `"./library/packages/*/index.d.ts"`。构建结构、依赖顺序和源码版选择见仓库的 [安装与构建指南](../../../docs/plugin-distribution.md)，实际验证见 [JS 安装包验证](../../../docs/js-plugin-verification.md)。
