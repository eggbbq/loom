import { I18n } from "./runtime/I18n";
export { I18n } from "./runtime/I18n";
export { LangBase } from "./runtime/lang-base";
export type { ITranslate } from "./runtime/types";

// 包入口加载时立即挂载；业务顶层调用的顺序仍取决于目标平台的编译结果。
I18n.install();
Laya.addBeforeInitCallback(I18n.install);
if (typeof IEditorEnv !== "undefined") {
    IEditorEnv.onUserScriptsLoad(I18n, "install");
}

// 让 IDE 与安装包编译器发现入口，保留顶层挂载代码。
@Laya.regClass()
export class LoomI18nPackageEntry {}
