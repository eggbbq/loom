# Loom UI

公开类和枚举直接挂载到 `loom`，例如 `loom.UIPanel`、`loom.UILife`；导出的 `ui` 与 `UIManager.inst`、`loom.ui` 是同一实例。

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

## 按钮音效

启动时设置一次默认音频地址：

```ts
loom.ui.defaultButtonSound = "resources/audio/ui-click.mp3";
```

仅针对新 UI 的 `Laya.GButton`。包的 `install()` 包装 `Laya.GButton.prototype.onClick`，每次调用 `button.onClick(...)` 注册回调时先应用声音，随后执行原来的注册方法。列表项等延迟创建的按钮同样适用，不遍历 UI 树、不拦截事件派发、不修改原生 `_click`。优先级如下：

| 配置 | 播放行为 |
| --- | --- |
| 未挂 `UISoundIgnore`，按钮 `Sound` 留空 | 使用 `defaultButtonSound`；默认值留空则静音 |
| 未挂 `UISoundIgnore`，按钮已有 `Sound` | 保留按钮自己的声音 |
| 挂了 `UISoundIgnore` | 静音，即使按钮自身或全局默认值有声音 |

将 `runtime/ui-sound-ignore.ts`（安装包中为对应 `.d.ts` 脚本资源）挂到需要静音的**按钮节点本身**，无需填写属性。特殊音效直接设置按钮原生的 `Sound`。普通按钮无需挂组件、拖拽音频或制作预制体。标记在 `onClick` 注册时检查，不依赖组件生命周期。

`onClick(listener)` 与 `onClick(caller, listener, args?)` 均保持原来的语义，`offClick` 仍能用原回调解绑。重复 install 不会叠加包装，也不添加音效播放监听器；音量继续使用按钮的 `soundVolumeScale`。拦截函数直接在声音为空时执行 `this.sound = loom.ui.defaultButtonSound`，已有声音不改写。初始化时应先设置默认值再注册按钮回调；后续修改默认值只影响之后注册时声音仍为空的按钮。

仅通过 `.on(Laya.Event.CLICK, ...)`、`onMouseClick` 脚本或按钮原生内部监听绑定的按钮，不会触发默认声音或静音处理。动态添加静音组件后，需要再次调用 `onClick` 才会清空按钮声音；移除组件不自动恢复已清空的声音。默认音频及代码赋值的音频需由项目确保包含在发布资源中；按钮 `Sound` 中选择的音频按原生资源引用收集。

`UITipsManager` 默认为 `resources/ui/Tips.lh`；`UIToolTipsManager` 默认为 `resources/ui/Tooltips.lh`，构造器可配置地址。根节点使用 `GWidget`，插件同时写入 `data`、兼容字段 `_data`，并发送原 `setData` 事件。提示 prefab 自行实现显示与移除；文字提示移除后池化复用，悬浮提示复用单实例。安装时不生成业务资源或项目配置。

构建：`./build.sh loom.ui`。安装验证：`npm run verify:ui`；测试和示例不进入安装包。

安装验证还会使用原生 Chromium 和 Laya 引擎执行 Preview 与 Web 产物，验证真实 prefab 的 UUID 绑定、打开、缓存刷新和关闭。JS 安装验证额外通过鼠标输入检查回调顺序、`caller/args` 和解绑，并加载测试 WAV，检查原生音频通道的输出信号、音量与播放完成；无音频设备时使用浏览器静音输出端测量，不替换播放实现。重复安装测试确认 `onClick` 不会叠加包装。默认使用 macOS Google Chrome；其他平台通过 `CHROME_BIN` 指定 Chromium 可执行文件。

默认构建输出预编译 JS、`.d.ts` 与资源的独立 `.layapkg`。Runtime JS 在业务脚本之前自动加载；Scene 在用户脚本加载/重载后恢复挂载。类型配置可在 `tsconfig.json` 的 `include` 中追加 `"./library/packages/*/index.d.ts"`。构建结构、依赖顺序和源码版选择见仓库的 [安装与构建指南](../../../docs/plugin-distribution.md)，实际验证见 [JS 安装包验证](../../../docs/js-plugin-verification.md)。
