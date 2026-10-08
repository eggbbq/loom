@IEditorEnv.regClass()
@IEditorEnv.regBuildPlugin("*")
export class LoomPathfindingPlugin implements IEditorEnv.IBuildPlugin {
    onCollectAssets(_task: IEditorEnv.IBuildTask, assets: Set<IEditorEnv.IAssetInfo>): void {
        const entry = EditorEnv.assetMgr.getAsset("fb977ce9-dd9b-480e-9f4b-d353b049d870");
        if (!entry) throw new Error("[LoomPathfinding] Missing runtime entry");
        assets.add(entry);
    }
}
