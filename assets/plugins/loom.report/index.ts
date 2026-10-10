import { report } from "./runtime/report";
export { report } from "./runtime/report";
export type { ReportChannel } from "./runtime/report";

function install(): void {
    Object.assign(window.loom ??= {} as Loom, { report });
}

install();
Laya.addBeforeInitCallback(install);

if (typeof IEditorEnv !== "undefined") {
    IEditorEnv.onUserScriptsLoad({ install }, "install");
}

declare global {
    interface Loom {
        report: typeof report;
    }
    var loom: Loom;
}

// 保留安装包编译器需要的入口注册标记。
@Laya.regClass()
export class LoomReportPackageEntry {}
