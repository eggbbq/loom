@IEditorEnv.regClass()
@IEditorEnv.regBuildPlugin("*")
export class LoomBTPlugin implements IEditorEnv.IBuildPlugin {
    onCollectAssets(_task: IEditorEnv.IBuildTask, assets: Set<IEditorEnv.IAssetInfo>): void {
        const entry = EditorEnv.assetMgr.getAsset("c401acd0-a68e-4a95-bcaf-508c91791250");
        if (!entry) throw new Error("[LoomBT] Missing runtime entry");
        assets.add(entry);
    }
}
