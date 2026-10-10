# Loom I18n

标准 LayaAir 3.4.1 运行时插件，包名 `loom.i18n`。从 Mistedge 的 `src/loom/i18n` 移植，独立提供语言偏好保存、翻译字典查询与语言对象刷新，不依赖游戏的全局 `lang`、Luban、Module 或其他插件。

## 安装与使用

执行 `./build.sh loom.i18n`，通过目标工程包管理器安装 `release/plugins/loom.i18n.layapkg`。安装包包含 Runtime/Scene JS 与 `.d.ts`，分别提供执行代码和类型提示。

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

`editor/i18n-plugin.ts` 在原生 `onCollectAssets` 中收集模块入口，确保仅使用全局 API、没有运行时 import 的消费工程也能发布服务。该钩子不创建配置、不扫描游戏文案。

`index.ts` 显式加载 `I18n` 和 `LangBase`，立即将 `I18n.inst` 挂载到 `loom.i18n`。运行时类不需要注册装饰器；Scene 用户脚本加载/重载后恢复同一服务实例，保留其他 loom 成员。

TypeScript 通过包的 `index.d.ts` 提供导出与全局声明；也可以在工程 `tsconfig.json` 的 `include` 中追加 `"./library/packages/*/index.d.ts"`，不在业务脚本中导入。在工程已有全局声明中使用 `import type {} from "~/packages/loom.i18n"` 即可包含插件类型；框架自身通过 `LoomGlobal` 接口合并 API，并声明 `var loom: LoomGlobal`。首次安装后如编辑器保留旧缓存，重启 TypeScript 服务。

旧代码里的自动汇总各模块语言定义、自动加载 UI/配置字典和预制体文本适配尚未实现，本插件不增加这些流程。没有编辑器设置或菜单，因此无需创建 editorResources 配置。

## 验证

`npm test` 验证字典替换、键回退、持久化、反复翻译、绑定释放和框架对象保留。`npm run verify:i18n` 在没有插件源码副本的消费工程安装真实产物，验证 Scene API、包导入实例身份与 Web 发布入口。

MIT，见 LICENSE。

默认构建输出预编译 JS、`.d.ts` 与资源的独立 `.layapkg`。Runtime JS 在业务脚本之前自动加载；Scene 在用户脚本加载/重载后恢复挂载。类型配置可在 `tsconfig.json` 的 `include` 中追加 `"./library/packages/*/index.d.ts"`。构建结构、依赖顺序和源码版选择见仓库的 [安装与构建指南](../../../docs/plugin-distribution.md)，实际验证见 [JS 安装包验证](../../../docs/js-plugin-verification.md)。
