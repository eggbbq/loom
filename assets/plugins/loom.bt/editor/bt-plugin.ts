@IEditorEnv.regClass()
@IEditorEnv.regBuildPlugin("*")
export class LoomBTPlugin implements IEditorEnv.IBuildPlugin {
    onCollectAssets(_task: IEditorEnv.IBuildTask, assets: Set<IEditorEnv.IAssetInfo>): void {
        const entry = EditorEnv.assetMgr.getAsset("99fce6ca-3d7f-4c9b-9e17-4dfcea258686");
        if (!entry) throw new Error("[LoomBT] Missing runtime entry");
        assets.add(entry);
    }
}
