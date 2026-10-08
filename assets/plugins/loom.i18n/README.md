# Loom I18n

标准 LayaAir 3.4.1 运行时插件，包名 `loom.i18n`。从 Mistedge 的 `src/loom/i18n` 移植，独立提供语言偏好保存、翻译字典查询与语言对象刷新，不依赖游戏的全局 `lang`、Luban、Module 或其他插件。

## 安装与使用

执行 `./build.sh loom.i18n`，通过目标工程包管理器安装 `release/plugins/loom.i18n-1.0.0.layapkg`。保留运行时源码，不使用仅导出 UI/Scene 的 `precompile`。

```ts
loom.i18n.lang = "zh";
loom.i18n.settext({ ok: "确定", cancel: "取消" });
const text = loom.i18n.gettext("ok"); // 确定
```

`lang` 使用原生 `Laya.LocalStorage`，沿用 `i18n.lang` 键和默认 `en`。修改语言偏好只保存选择；调用方加载相应字典后交给 `settext`，插件不自动选择、下载或打包语言资源。`settext` 替换并复制字典，后续修改原对象不影响翻译；缺失键和空译文沿用原代码行为，返回键名。

## 语言对象

```ts
import { LangBase } from "~/packages/loom.i18n";

class Lang extends LangBase {
    ok = "确定";
    cancel = "取消";
}
const lang = new Lang();
const unbind = loom.i18n.bind(lang);
loom.i18n.settext({ ok: "OK", cancel: "Cancel" }); // 自动更新 lang 字段
unbind(); // 所属模块停止时解除绑定
```

`translate()` 使用对象自身可枚举的字符串字段名作为键；数字、方法与继承字段不参与翻译。重复替换字典和直接调用 `translate()` 均可用，不会把内部缓存误当成字段。首次设置字典前，`bind` 保留对象的默认文案；已有字典时，新绑定的对象立即翻译。相同对象只有一份绑定，返回的解除函数可重复调用。

保留导出的 `I18n`、`I18n.inst`、`LangBase`、`ITranslate`，全局 `loom.i18n` 与 `I18n.inst` 为同一个实例。使用 Luban 时由项目执行 `setGettext(key => loom.i18n.gettext(key))`，不把生成代码或回调写入插件。

## 运行时与类型

`editor/i18n-plugin.ts` 在原生 `onCollectAssets` 中收集两个运行时脚本，确保仅使用全局 API、没有运行时 import 的消费工程也能发布服务。该钩子不创建配置、不扫描游戏文案。

`runtime/I18n.ts` 和 `runtime/lang-base.ts` 使用 `@Laya.regClass()`，确保安装包生成运行时入口。插件在 Laya 初始化回调中扩展最终的 loom 框架对象，Scene 在用户脚本加载/重载后恢复服务；保留其他 loom 成员。调用全局 API 应在引擎初始化后进行；定义 Lang 子类时使用包导入，避免依赖尚未安装的全局对象。

TypeScript 通过包的 `index.ts` 提供导出与全局声明。在工程已有全局声明中使用 `import type {} from "~/packages/loom.i18n"` 即可包含插件类型；框架自身通过 `LoomGlobal` 接口合并 API，并声明 `var loom: LoomGlobal`。首次安装后如编辑器保留旧缓存，重启 TypeScript 服务。

旧代码里的自动汇总各模块语言定义、自动加载 UI/配置字典和预制体文本适配尚未实现，本插件不增加这些流程。没有编辑器设置或菜单，因此无需创建 editorResources 配置。

## 验证

`npm test` 验证字典替换、键回退、持久化、反复翻译、绑定释放和框架对象保留。`npm run verify:i18n` 在没有插件源码副本的消费工程安装真实产物，验证 Scene API、包导入实例身份与 Web 发布入口。

MIT，见 LICENSE。
