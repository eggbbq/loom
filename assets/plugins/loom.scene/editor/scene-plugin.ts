/** 显式收集模块入口，支持业务仅使用全局 loom.scene 的发布方式。 */
@IEditorEnv.regClass()
@IEditorEnv.regBuildPlugin("*")
export class LoomScenePlugin implements IEditorEnv.IBuildPlugin {
    onCollectAssets(_task: IEditorEnv.IBuildTask, assets: Set<IEditorEnv.IAssetInfo>): void {
        const entry = EditorEnv.assetMgr.getAsset("c09e3a44-0be1-48c7-844d-7444b44b1b86");
        if (!entry) throw new Error("[LoomScene] Missing module entry");
        assets.add(entry);
    }
}
