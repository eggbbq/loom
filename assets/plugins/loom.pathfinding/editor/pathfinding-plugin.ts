@IEditorEnv.regClass()
@IEditorEnv.regBuildPlugin("*")
export class LoomPathfindingPlugin implements IEditorEnv.IBuildPlugin {
    onCollectAssets(_task: IEditorEnv.IBuildTask, assets: Set<IEditorEnv.IAssetInfo>): void {
        const entry = EditorEnv.assetMgr.getAsset("da657d4d-fcaf-46af-944c-ffa3944e84e1");
        if (!entry) throw new Error("[LoomPathfinding] Missing runtime entry");
        assets.add(entry);
    }
}
