# Loom UI

独立 LayaAir 3.4.1 UI 运行时插件，提供面板队列、层级、导航、生命周期、动画、按钮音效、文字提示、悬浮提示和确认对话框。项目自行提供预制体，安装包保留脚本 UUID，不生成业务资源或项目配置，也不依赖其他 Loom 插件。

## 公开入口

公开类、枚举和服务直接挂载到 `loom`，可直接使用全局 API，也可从 `~/packages/loom.ui` 导入。两种方式使用相同实例：

| 全局入口 | 包导出 | 单例 |
| --- | --- | --- |
| `loom.ui` | `ui` | `UIManager.inst` |
| `loom.tips` | `tips` | `UITipsManager.inst` |
| `loom.tooltips` | `tooltips` | `UIToolTipsManager.inst` |
| `loom.dialog` | `dialog` | `UIDialogManager.inst` |

```ts
const panel = await loom.ui.open("resources/ui/MyPanel.lh", { id: 1 }, false);
if (panel) await loom.ui.close(panel, false);

await loom.tips.text("保存成功");
await loom.tooltips.text("查看详细说明");
const confirmed = await loom.dialog.confirm("确定继续吗？");
```

可选导入示例：

```ts
import { ui, tips, tooltips, dialog, UILayer, UIPanel } from "~/packages/loom.ui";

await tips.text("保存成功");
await dialog.confirm({ title: "确认", text: "确定继续吗？" });
```

模块入口加载时立即挂载，在引擎初始化和编辑器脚本重载时恢复；构建插件收集入口，业务只使用全局 API 也能发布。TypeScript 工程可在 `tsconfig.json` 的 `include` 中追加 `"./library/packages/*/index.d.ts"`，保留已有条目。

## 面板

预制体根节点必须是 `Laya.GWidget`，挂载 `UIPanel` 组件；项目面板类继承 `GWidget`，通过预制体的 runtime 绑定。管理器将 `open()` 的数据写入根节点 `data`，再调用根节点 `refresh()`。重复打开同一地址会刷新已有面板；缓存面板再次打开时同样刷新。

| 调用 | 行为 |
| --- | --- |
| `open(address / entity / UIPanel, data?, tween?)` | 排队打开面板，返回根节点；打开失败返回 `null` |
| `close(address / entity / UIPanel, tween?)` | 关闭指定面板，等待关闭操作完成 |
| `closeAll()` | 关闭全部面板，取消未完成的加载 |
| `closeExcept(addresses)` | 关闭并取消加载指定地址以外的面板 |
| `find(PanelClass)` | 按根节点类查找已打开面板 |
| `waitPanelOptionComplete()` | 等待当前面板操作队列完成 |
| `disposeOnSceneChanged()` | 释放已关闭的非持久面板缓存；由项目在场景切换时调用 |

在编辑器的 `UIPanel` 组件上配置：

| 属性 | 默认值 | 含义 |
| --- | --- | --- |
| `layer` | `UILayer.Panel` | 所属 UI 层，可选 `Panel`、`Window`、`Pop`、`Guide`、`Top`、`GRoot` |
| `life` | `UILife.Scene` | `Temp` 关闭后销毁；`Scene` 在场景释放时销毁；`Persistent` 保留缓存 |
| `nav` | `UINavMode.Default` | `HideOther` 停用同层其他面板，关闭后恢复；`Ignore` 不参与导航 |
| `anim` | `UIAnimtion.Both` | `None`、`Open`、`Close`、`Both`；公开名称 `UIAnimtion` 保持兼容 |
| `center` | `true` | 打开时居中 |
| `full` | `false` | 打开时填满父层 |
| `modal` | `true` | 预留属性；遮罩和点击遮罩关闭仍由项目预制体实现 |

`open/close` 的 `tween` 默认为 `true`，传 `false` 可关闭本次动画。`UIPanel` 默认缩放根节点，根节点存在 `content` 时缩放该控件；项目可以实现 `onOpenAnimation(doTween)`、`onCloseAnimation(doTween)`，返回动画完成的 Promise。

根节点可实现 `onInit`、`refresh`、`onShow`、`onShown`、`onHide`、`onHidden`、`onDispose`、`onPutBackend` 和 `onBackFront`，由 `UIPanel` 代理调用。关闭按钮挂 `UICloseButton`，会查找祖先面板并关闭。`UIFrame` 首次打开时创建，也支持场景中已有的 `UIFrame` 组件。

场景切换前先等待关闭，再释放缓存：

```ts
await loom.ui.closeAll();
loom.ui.disposeOnSceneChanged();
```

## 文字提示与悬浮提示

```ts
await loom.tips.text("保存成功");
await loom.tooltips.text({ text: "道具说明", pos: { x: 100, y: 200 } });

// 自定义预制体地址。
const tips = new loom.UITipsManager("resources/ui/MyTips.lh");
const tooltips = new loom.UIToolTipsManager("resources/ui/MyTooltips.lh");
await tips.text("保存成功");
await tooltips.text("道具说明");
```

默认地址分别为 `resources/ui/Tips.lh` 和 `resources/ui/Tooltips.lh`。根节点使用 `GWidget`，管理器写入 `data`、兼容字段 `_data`，并发送 `setData` 事件；预制体负责根据这些数据更新内容。这两个提示管理器不通过 `UIPanel.refresh()` 刷新。

文字提示接收字符串，添加到 `GRoot` 后由预制体自行播放动画和移除，移除后进入复用池（最多 10 个）。悬浮提示接收字符串或 `{ text, pos? }`，复用一个实例，通过 `GRoot.showPopup(..., PopupDirection.Up)` 显示；`pos` 传给预制体，管理器不按它设置坐标。`text()` 的 Promise 表示加载与显示调用完成，不等待提示消失。

## 确认对话框

`UIDialogManager` 通过 `UIManager.open/close` 管理挂载了 `UIPanel` 的对话框，负责确认结果和同地址请求队列。默认地址为 `resources/ui/Dialog.lh`。

```ts
const confirmed = await loom.dialog.confirm({
    title: "删除确认",
    text: "确定删除这条记录吗？",
    confirmText: "删除",
    cancelText: "取消",
});
if (confirmed) {
    // 执行删除。
}

// 字符串等价于 { text: "确定继续吗？" }。
await loom.dialog.confirm("确定继续吗？");

// 构造器只配置地址；层级等行为在预制体的 UIPanel 上配置。
const customDialog = new loom.UIDialogManager("resources/ui/MyDialog.lh");
await customDialog.confirm("确定继续吗？", false);

// 在业务事件中取消本管理器当前请求（加载期间也有效）：
// customDialog.close();
```

`confirm(data, tween?)` 返回 `Promise<boolean>`，第二个参数控制本次打开和关闭动画。对象参数的 `text` 必填，`title`、`confirmText`、`cancelText` 可选；按钮默认文案由项目预制体决定。

预制体根节点继承 `GWidget` 并绑定下面这样的 runtime 类，挂载 `UIPanel`，在编辑器中绑定四个控件。将组件 `layer` 配置为需要的层，例如 `UILayer.Pop` 或 `UILayer.Top`；`life`、`nav`、`anim`、`center`、`full` 与普通面板相同。模态遮罩由项目预制体提供。

```ts
import type { UIDialogContext } from "~/packages/loom.ui";

@Laya.regClass()
export class DialogView extends Laya.GWidget {
    @Laya.property(Laya.GTextField)
    titleLabel: Laya.GTextField;

    @Laya.property(Laya.GTextField)
    messageLabel: Laya.GTextField;

    @Laya.property(Laya.GButton)
    confirmButton: Laya.GButton;

    @Laya.property(Laya.GButton)
    cancelButton: Laya.GButton;

    onInit(): void {
        this.confirmButton.onClick(() => (this.data as UIDialogContext).onConfirm());
        this.cancelButton.onClick(() => (this.data as UIDialogContext).onCancel());
    }

    refresh(): void {
        const data = this.data as UIDialogContext;
        this.titleLabel.text = data.title ?? "确认";
        this.messageLabel.text = data.text;
        this.confirmButton.title = data.confirmText ?? "确定";
        this.cancelButton.title = data.cancelText ?? "取消";
    }
}
```

管理器将配置和 `onConfirm/onCancel` 回调放入根节点 `data`，通过 `UIPanel.refresh()` 调用根节点 `refresh()`。每次点击读取当前 `data`，缓存复用时也能处理本次请求；回调在打开动画期间已经有效。

确认返回 `true`；取消、`UIPanel.close()`、`loom.ui.closeAll()`、面板移除或管理器 `close()` 返回 `false`。结果返回前等待关闭操作完成。同一地址的请求依次显示，不同管理器也共享该地址的队列；取消当前请求后，后续请求继续显示。

加载失败、根节点类型错误或缺少 `UIPanel` 时返回 `false`，后续请求可重试。显示完成后也兼容根节点的 `confirm/cancel` 事件；按钮使用 `data` 中的回调可以处理打开动画期间的输入。

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

## 构建与安装验证

构建：`./build.sh loom.ui`。安装验证：`npm run verify:ui`；已构建时可追加 `-- --skip-build`。测试和示例不进入安装包。

验证会安装实际 JS 包，执行 Scene、原生 Chromium Preview 与 Web 产物，检查面板导航、缓存刷新、生命周期、提示复用及确认对话框的结果、队列和取消行为。按钮音效验证通过鼠标输入检查回调顺序、`caller/args` 和解绑，并加载测试 WAV 检查原生音频输出、音量及播放完成。重复安装会检查 `onClick` 包装不叠加。默认使用 macOS Google Chrome；其他平台通过 `CHROME_BIN` 指定 Chromium 可执行文件。

默认构建输出预编译 JS、`.d.ts` 和资源的独立 `.layapkg`。Runtime JS 在业务脚本之前自动加载；Scene 在用户脚本加载/重载后恢复挂载。构建结构、依赖顺序和源码版选择见仓库的 [安装与构建指南](../../../docs/plugin-distribution.md)，实际验证见 [JS 安装包验证](../../../docs/js-plugin-verification.md)。
