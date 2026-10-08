@IEditorEnv.regClass()
@IEditorEnv.regBuildPlugin("*")
export class LoomCorePlugin implements IEditorEnv.IBuildPlugin {
    onCollectAssets(_task: IEditorEnv.IBuildTask, assets: Set<IEditorEnv.IAssetInfo>): void {
        const entry = EditorEnv.assetMgr.getAsset("327af950-ff03-42de-8473-a28f1a068469");
        if (!entry) throw new Error("[LoomCore] Missing runtime entry");
        assets.add(entry);
    }
}
