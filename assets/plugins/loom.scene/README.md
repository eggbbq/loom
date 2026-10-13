# Loom Scene

独立 LayaAir 3.4.1 运行时插件，包名 `loom.scene`。自动拦截静态 `Laya.Scene.open`：先等待 `loom.scene.hooks.beforeOpen`，调用原生方法，再等待 `loom.scene.hooks.afterOpen`。可用于异步初始化、场景准入检查、按场景准备 Loading 界面和打开后的业务处理。

## 使用

`hooks` 是读写属性，初始值就是 `SceneHook` 类的实例，无需额外设置。可以直接修改默认对象的回调，也可以整体注入业务自己的对象。插件保留对象引用，不克隆或合并。`ISceneHook` 接口中的两个钩子均可选。默认 `SceneHook.beforeOpen` 先等待已安装的 `loom.ui.closeAll()`，随后调用 `Laya.Scene.showLoadingPage(url)`；`afterOpen` 调用 `Laya.Scene.hideLoadingPage()`。未安装 UI 时跳过关闭；关闭失败记录错误并继续打开场景。你可以在 `runtime/scene-hook.ts` 中修改实现，或整体注入自己的对象。赋值空对象 `{}` 时直接透传原生调用。

安装后在首次打开场景之前注入对象，业务无需 import：

```ts
loom.scene.hooks = {
    async beforeOpen(url, param) {
        // 以下函数由业务实现；返回 Promise 才能等待准备完成。
        await prepareScene(url, param);
    },
    async afterOpen(url, param, openedScene) {
        await finishSceneOpen(url, param, openedScene);
    },
};

// beforeOpen → 原生加载/打开/complete → afterOpen → Promise 完成。
const opened = await Laya.Scene.open("Battle.ls", true, { level: 1 });

// 整体换成空对象，关闭两个钩子。
loom.scene.hooks = {};
```

也可以直接配置初始默认对象或修改当前对象的单个回调：

```ts
loom.scene.hooks.beforeOpen = async (url, param) => {
    await prepareScene(url, param);
};
// 如需恢复某个对象，在替换前保留它的引用即可。
const savedHooks = loom.scene.hooks;
loom.scene.hooks = {};
loom.scene.hooks = savedHooks;
```

也可以用类实现业务钩子：

```ts
import { scene, SceneHook } from "~/packages/loom.scene";

class GameSceneHook extends SceneHook {
    async beforeOpen(url: string, param: any): Promise<void> {
        await prepareScene(url, param);
    }

    async afterOpen(url: string, param: any, openedScene: Laya.Scene): Promise<void> {
        await finishSceneOpen(url, param, openedScene);
    }
}

const hooks = new GameSceneHook();
scene.hooks = hooks;
// scene.hooks === hooks
// scene === loom.scene
```

## 执行约定

- `beforeOpen(url, param)` 支持同步函数及 Promise/thenable；钩子的 `this` 为 `scene.hooks`。未传打开参数时收到 `undefined`，显式传入 `null` 时保留 `null`。
- `afterOpen(url, param, openedScene)` 在原生 open 的 Promise 完成后执行，接收相同的路径/参数以及已打开的场景实例；同样支持同步函数与 Promise/thenable，`this` 为 `scene.hooks`。调用者的 `await Laya.Scene.open(...)` 会等待它完成。
- 支持原生两种重载。`Laya.Scene.open(url, closeOther, complete, progress)` 的第三个函数参数视为完成回调，钩子的 `param` 为 `undefined`；`Laya.Scene.open(url, closeOther, param, complete, progress)` 正常接收打开参数。
- 路径、closeOther、打开参数、完成回调、进度回调和调用接收者按原样透传。参数对象保留原引用；钩子对对象内容的修改会传给原生方法。钩子返回值不用于替换路径或参数。
- beforeOpen 同步抛错或异步拒绝时，返回的 Promise 以该错误拒绝，原生 open 与 afterOpen 都不执行，完成回调不调用。原生加载/打开/complete 失败也继续传播，不执行 afterOpen。
- afterOpen 抛错或拒绝时，返回的 Promise 拒绝，但场景已经打开，不自动关闭或回滚。原生 complete 回调在 afterOpen 之前执行；需要等待全部业务处理时使用返回的 Promise。引擎不会额外等待 onOpened/complete 内部未返回到原生 Promise 的异步任务。
- 每次调用读取当前 hooks 对象及 beforeOpen/afterOpen 各一次；整体替换对象或修改/清除回调仅影响后续调用，不取消已经等待中的任务。等待中的调用继续使用原对象和原回调，钩子的 `this` 也为原对象。不自动串行化并发场景打开。
- 钩子内部不要再次调用 `Laya.Scene.open`，否则会重新进入钩子。加载准备资源可使用 `Laya.loader.load`。
- 仅拦截静态 `Laya.Scene.open`。直接调用实例 `scene.open()`、手动创建节点或 IDE 编辑场景切换不在此接口范围内。

默认钩子调用 Loading 的显示/隐藏方法，但不创建 Loading 页面。业务需要先执行 `Laya.Scene.setLoadingPage(page)`，没有设置时这两个方法不显示任何内容。显示在关闭 UI 完成后才开始安排；显示和隐藏均沿用引擎默认的 500ms 延迟，open 的 Promise 不等待这段隐藏延迟。

`showLoadingPage(url)` 的第一个参数是传给 Loading 场景 `onOpened` 的数据，不是 Loading 资源地址。LayaAir 3.4.1 原生 `_load` 会再次调用无参数的 `showLoadingPage()`，清除前一次显示计时，因此不能依靠默认钩子保证 Loading 收到 url。按目标场景选择 Loading 时，应在自定义 beforeOpen 中根据 url 调用 `setLoadingPage(page)`，将业务数据预先写入页面。

原生加载失败时不执行 afterOpen，插件不提供额外的失败清理；业务有自定义 Loading 状态时，在调用端捕获 open 的拒绝并清理。整体替换 hooks 后，默认的 UI 关闭和 Loading 调用也随之被替换。

## 安装与验证

执行 `./build.sh loom.scene`，在目标工程安装 `release/plugins/loom.scene.layapkg`。插件无其他 Loom 包依赖，无项目配置或演示资源。默认安装包提供预编译 Runtime/Scene JS 与类型声明；Runtime 在业务脚本前挂载服务，重复初始化和 Scene 用户脚本重载不会叠加包装，当前注入对象继续保留。

使用全局 API 的 TypeScript 工程在 `tsconfig.json` 的 `include` 中追加 `"./library/packages/*/index.d.ts"`。`npm run verify:scene -- --skip-build` 验证真实安装、加载前/打开后的异步等待顺序、回调/参数透传、错误传播及独立 Web 构建；`npm run verify:startup -- --skip-build` 验证全部包正序/倒序下 Scene、官方 Preview 和 Web 的业务顶层零 import 调用。

## 源码结构

- `runtime/scene-hook.ts`：`ISceneHook` 接口与默认 `SceneHook` 类，填充 beforeOpen/afterOpen 的位置。
- `runtime/scene-manager.ts`：`SceneManager` 单例，管理 hooks 读写和原生 open 拦截。
- `runtime/scene-api.ts`：统一导出类与接口，提供 `scene = SceneManager.inst`。
- `index.ts`：全局挂载、初始化/重载注册与安装包入口标记。
- `editor/scene-plugin.ts`：构建时收集运行时入口。

进程：`runtime/` 与 `index.ts` 用于 Runtime/Scene；`editor/scene-plugin.ts` 是 Scene 发布收集钩子。安装指南见 [仓库文档](../../../docs/plugin-distribution.md)。
