import { LoomAddressMappingRuntime } from "./runtime/address-mapping-runtime";
export * from "./runtime/address-mapping-runtime";

// 包入口加载时立即挂载；业务顶层调用的顺序仍取决于目标平台的编译结果。
LoomAddressMappingRuntime.install();
Laya.addBeforeInitCallback(LoomAddressMappingRuntime.install);
if (typeof IEditorEnv !== "undefined") {
    IEditorEnv.onUserScriptsLoad(LoomAddressMappingRuntime, "install");
}

// 让 IDE 与安装包编译器发现入口，保留顶层挂载代码。
@Laya.regClass()
export class LoomAddressPackageEntry {}
