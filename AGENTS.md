# loom.kits 协作规则

本仓库专门维护 LayaAir IDE 插件和工程工具。修改前阅读根 README 与对应插件 README；编辑器 API 以 `engine/types/editor.d.ts`、`editor-env.d.ts` 和 `LayaAir.d.ts` 为准。

- 插件源码统一放在 `assets/plugins/loom.<插件名>/`，包名统一为 `loom.<插件名>`。
- 每个插件目录直接包含 `package.json`、README 与许可证，构建产物输出至 `release/plugins/`。
- 默认构建分发预编译 Runtime/Scene/UI JS、类型声明和资源；源码继续用 TS 开发。源码版通过 `npm run build:source` 显式输出至 `release/plugins/source/`，编译中间包留在 temp 隔离目录。
- JS 构建同时生成远程安装清单与 SHA-256 校验文件；安装包通过 GitHub Releases 附件分发，生成目录不入库。发布前验证实际 HTTP 安装，发布仍按用户明确要求执行。
- UI、Scene、Preview 进程分别使用对应 API；Node.js API 只用于 UI/Scene。
- 保留 `.meta` UUID；重命名脚本时同步移动 `.meta`。
- 项目配置放在 `assets/editorResources/<插件名>/`；首次加载可创建默认配置，不能覆盖已有配置。
- 插件必须能独立安装；不要引入 Mistedge 的资源、业务代码、配置 UUID 或绝对路径。
- 演示资源放在 `assets/examples/`，测试放在 `tests/`，不随插件安装包分发。
- 包运行时入口必须验证安装后的执行结果，不能只验证源码模式；每个包的 index.ts 保留注册入口标记，避免纯顶层副作用被安装包编译器忽略；启动顺序需要验证业务无 import 的顶层执行。
- CLI / `runScript` 调用的注册类静态入口不能依赖 `this` 指向类，必须显式引用类名；已由 Address Mapping 的实际安装调用验证。
- 使用官方 CLI 的 `export-installable-package`，不将普通资源包当作安装包。含运行时脚本的目录不要用仅生成 UI/Scene 的 `precompile`。
- 新插件通过通用构建脚本自动发现。完成变更后运行 `npm run build`；涉及资源导出时另行验证 `npm run build:web`。
- 保持标准 Laya 工程结构，缓存和构建产物不入库。发布到远程仓库或商店按用户明确要求执行。
