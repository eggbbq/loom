export { LoomSDKPlugin } from "./editor/sdk-plugin";

// 编辑器包也保留入口注册标记；运行时由生成到项目的 sdk.ts 提供。
@IEditorEnv.regClass()
export class LoomSDKPackageEntry {}
