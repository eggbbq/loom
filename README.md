# loom.kits

用于开发、验证和分发 LayaAir IDE 插件与工程工具的独立项目。工程由官方 **3D empty project** 模板创建，当前版本为 **LayaAir 3.4.1**。

## 开始开发

用 LayaAir IDE 打开 `loom.kits.laya`。插件源码放在 `assets/plugins/loom.<插件名>/`，IDE 会编译并加载注册过的 UI、Scene 和运行时脚本。本项目直接使用源码开发，不再安装同一插件的发行包。

```sh
./build.sh
```

`build.sh` 自动安装锁定的构建依赖，执行 TypeScript 检查和测试，再导出所有插件。只构建一个插件用 `./build.sh loom.atlas`。脚本可以从任意工作目录调用。

Node.js 要求 20 或更新版本。安装官方 LayaAir CLI 后，执行 `layaair install 3.4.1` 安装本项目所需版本；旧 CLI 3.4.0 缺少安装包导出命令。脚本会从 PATH 或 `~/.layaair/` 查找 CLI，也可通过 `LAYAAIR_CLI` 指定可执行文件的绝对路径。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `./build.sh` | 安装依赖并构建所有插件 |
| `./build.sh loom.atlas` | 安装依赖并构建指定插件 |
| `npm run list:plugins` | 列出插件包 |
| `npm run check` | TypeScript 检查 |
| `npm test` | 插件功能测试 |
| `npm run build` | 检查、测试并导出所有插件安装包 |
| `npm run build -- loom.atlas` | 只导出指定插件；仍执行项目检查与测试 |
| `npm run verify:collector` | 在隔离工程中安装产物，验证实际包入口和资源导出 |
| `npm run verify:address-mapping` | 在隔离工程中安装产物，验证配置、CLI 与映射资源导出 |
| `npm run build:web` | 构建开发工程的 Web 演示，用于验证资源导出 |
| `npm run preview` | 启动官方 CLI 预览服务器 |

安装包输出为 `release/plugins/<包名>-<版本>.layapkg`。构建脚本调用官方 `export-installable-package`，按插件 `package.json` 中的版本命名；脚本不执行远程发布。CLI 命令均指定当前工程并使用 `--skip-package-install`，避免构建时改动插件依赖。

## 目录

```text
assets/
  plugins/                 插件源码，每个子目录是一个独立安装包
  examples/                插件演示资源，不进入插件包
  editorResources/         开发工程的配置，不进入插件包
src/                       标准工程的运行时脚本
engine/types/              官方模板提供的引擎与编辑器声明
scripts/                   通用 CLI 调用和插件构建脚本
tests/                     插件功能测试
release/plugins/           生成的安装包，Git 忽略
```

## 添加插件

1. 在 `assets/plugins/loom.<插件名>/` 创建源码和 `package.json`，包名采用 **`loom.<插件名>`**，版本采用语义版本。
2. 用 `@IEditor.*` 注册 UI 脚本，用 `@IEditorEnv.*` 注册 Scene/构建脚本。需要独立执行的包运行时入口用 `@Laya.regClass()` 注册，不能仅依靠顶层副作用。
3. 将测试放入 `tests/`，示例放入 `assets/examples/<插件名>/`。保留脚本 `.meta` 的 UUID。
4. 执行 `npm run build -- loom.<插件名>`，在目标项目通过包管理器安装产物。

构建脚本自动发现 `assets/plugins` 下的插件目录，无需为每个插件复制构建脚本。每个插件必须自包含，不能依赖 Mistedge 或本仓库其他插件的隐式全局状态。

## 当前插件

- [Manual Atlas Collector](assets/plugins/loom.atlas/README.md)：手工图集收集器，将所选 `.atlas` 接入编辑器、预览与发布资源索引。
- [Address Mapping Watcher](assets/plugins/loom.address/README.md)：通过原生资源事件维护短键地址映射，支持多目录配置、CLI 校验和发布收集。

## 许可证

MIT，见 [LICENSE](LICENSE)。插件包各自携带许可证。
