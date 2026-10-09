export * from "./runtime/manual-atlas-collector-runtime";

// 让 IDE 与安装包编译器发现入口，保留顶层挂载代码。
@Laya.regClass()
export class LoomAtlasPackageEntry {}
