# Loom Core

独立 LayaAir 3.4.1 核心运行时插件，提供 core API：Module/Scope/token、Notifier、存档同步、协程、状态机、CameraRef、向量池、HTTP/RPC 与格式化、数组、数学、时间和 UI 工具。保留组件脚本 UUID，不包含业务资源或项目配置。

```ts
import { ModuleBase, ModuleScope, moduleToken, Notifier } from "~/packages/loom.core";

const notifier = new loom.core.Notifier();
const manager = loom.core.mods;
const offset = loom.core.pool.v3.rent(1, 0, 2);
loom.core.pool.v3.release(offset);
```

包入口导出全部 API；全局 `loom.core` 与包导出共享同一组类和单例。入口加载时挂载，也处理引擎初始化与编辑器脚本重载；构建插件收集入口。其他插件和工程可以继续向同一 `loom` 对象添加自己的命名空间，宿主不要用同名 `globalName: "loom"` 脚本包覆盖它。

保留 Node 的 `_uid`、`_data`、`setData` 扩展和原 `setData` 事件协议，安装幂等。存档通过原生 `Laya.LocalStorage` 读写，用户键、版本号和同步策略不变。`$env` 可由宿主设置；缺失时只建立关闭框架日志的默认值，不写入业务 appid 等配置。`format` 兼容别名指向 `loom.core.formatf`。

不依赖其他 Loom 插件。安装不启动 Scope、网络或存档同步。构建 `./build.sh loom.core`；`npm run verify:core` 检查隔离安装的原生存储、节点扩展、模块生命周期、消息、协程和发布入口。池使用说明见 [runtime/pool/README.md](runtime/pool/README.md)。

默认构建输出预编译 JS、`.d.ts` 与资源的独立 `.layapkg`。Runtime JS 在业务脚本之前自动加载；Scene 在用户脚本加载/重载后恢复挂载。类型配置可在 `tsconfig.json` 的 `include` 中追加 `"./library/packages/*/index.d.ts"`。构建结构、依赖顺序和源码版选择见仓库的 [安装与构建指南](../../../docs/plugin-distribution.md)，实际验证见 [JS 安装包验证](../../../docs/js-plugin-verification.md)。
