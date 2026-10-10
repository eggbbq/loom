/** 显式收集模块入口，支持业务仅使用全局 loom.report 的发布方式。 */
@IEditorEnv.regClass()
@IEditorEnv.regBuildPlugin("*")
export class LoomReportPlugin implements IEditorEnv.IBuildPlugin {
    onCollectAssets(_task: IEditorEnv.IBuildTask, assets: Set<IEditorEnv.IAssetInfo>): void {
        const entry = EditorEnv.assetMgr.getAsset("6496b51e-1dd9-4499-9d07-184c05552fbc");
        if (!entry) throw new Error("[LoomReport] Missing module entry");
        assets.add(entry);
    }
}
