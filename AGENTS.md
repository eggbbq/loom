# loom.kits 协作规则

本仓库专门维护 LayaAir IDE 插件和工程工具。修改前阅读根 README 与对应插件 README；编辑器 API 以 `engine/types/editor.d.ts`、`editor-env.d.ts` 和 `LayaAir.d.ts` 为准。

- 插件源码统一放在 `assets/plugins/<插件名>/`，包名统一为 `loom.kits.<插件名>`。
- 每个插件目录直接包含 `package.json`、README 与许可证，构建产物输出至 `release/plugins/`。
- UI、Scene、Preview 进程分别使用对应 API；Node.js API 只用于 UI/Scene。
- 保留 `.meta` UUID；重命名脚本时同步移动 `.meta`。
- 项目配置放在 `assets/editorResources/<插件名>/`；首次加载可创建默认配置，不能覆盖已有配置。
- 插件必须能独立安装；不要引入 Mistedge 的资源、业务代码、配置 UUID 或绝对路径。
- 演示资源放在 `assets/examples/`，测试放在 `tests/`，不随插件安装包分发。
- 包运行时入口必须验证安装后的执行结果，不能只验证源码模式；仅有顶层副作用的脚本可能被安装包编译器忽略。
- CLI / `runScript` 调用的注册类静态入口不能依赖 `this` 指向类，必须显式引用类名；已由 Address Mapping 的实际安装调用验证。
- 使用官方 CLI 的 `export-installable-package`，不将普通资源包当作安装包。含运行时脚本的目录不要用仅生成 UI/Scene 的 `precompile`。
- 新插件通过通用构建脚本自动发现。完成变更后运行 `npm run build`；涉及资源导出时另行验证 `npm run build:web`。
- 保持标准 Laya 工程结构，缓存和构建产物不入库。发布到远程仓库或商店按用户明确要求执行。
