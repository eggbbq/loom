# Loom UI

独立 LayaAir 3.4.1 UI 运行时插件。包含面板队列、生命周期代理、导航、缓存、动画、关闭按钮和提示管理器。安装包保留原脚本 UUID；项目自行提供面板和提示预制体。

```ts
import { UILife, UIPanel, UITipsManager } from "~/packages/loom.ui";

const panel = await loom.ui.open("resources/ui/MyPanel.lh", { id: 1 }, false);
await loom.ui.close(panel, false);
await loom.ui.closeAll();
loom.ui.disposeOnSceneChanged();

const tips = new UITipsManager("resources/ui/MyTips.lh");
await tips.text("保存成功");
```

`loom.ui` 与包导出的 `UIManager.inst` 是同一对象。支持 `open(address/entity/UIPanel, data?, tween?)`、`close`、`closeExcept`、`find`、`waitPanelOptionComplete`。模块入口在加载时立即挂载，并在引擎初始化和编辑器脚本重载时恢复；构建插件收集入口，使只有全局 API 的工程也能发布。

面板根节点必须是 `Laya.GWidget`，并挂载 `UIPanel`；实际面板类通过 prefab 的 `_$runtime` 绑定。组件代理 `onInit`、`refresh`、`onShow/onShown`、`onHide/onHidden`、动画与销毁回调。`UILife.Temp` 关闭后销毁，`Scene` 场景切换时释放，`Persistent` 保留；`HideOther` 暂停同层面板，`Ignore` 不参与该导航。原公开枚举 `UIAnimtion` 名称保持兼容。

`UIFrame` 首次打开时创建，支持场景中已有的 `UIFrame` 组件。`UICloseButton` 查找祖先面板。无需项目业务服务或其他 Loom 插件。

`UITipsManager` 默认为 `resources/ui/Tips.lh`；`UIToolTipsManager` 默认为 `resources/ui/Tooltips.lh`，构造器可配置地址。根节点使用 `GWidget`，插件同时写入 `data`、兼容字段 `_data`，并发送原 `setData` 事件。提示 prefab 自行实现显示与移除；文字提示移除后池化复用，悬浮提示复用单实例。安装时不生成业务资源或项目配置。

构建：`./build.sh loom.ui`。安装验证：`npm run verify:ui`；测试和示例不进入安装包。

安装验证还会使用原生 Chromium 和 Laya 引擎执行 Preview 与 Web 产物，验证真实 prefab 的 UUID 绑定、打开、缓存刷新和关闭。默认使用 macOS Google Chrome；其他平台通过 `CHROME_BIN` 指定 Chromium 可执行文件。

默认构建输出预编译 JS、`.d.ts` 与资源的独立 `.layapkg`。Runtime JS 在业务脚本之前自动加载；Scene 在用户脚本加载/重载后恢复挂载。类型配置可在 `tsconfig.json` 的 `include` 中追加 `"./library/packages/*/index.d.ts"`。构建结构、依赖顺序和源码版选择见仓库的 [安装与构建指南](../../../docs/plugin-distribution.md)，实际验证见 [JS 安装包验证](../../../docs/js-plugin-verification.md)。
