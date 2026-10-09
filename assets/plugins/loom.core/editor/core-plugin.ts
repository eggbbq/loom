@IEditorEnv.regClass()
@IEditorEnv.regBuildPlugin("*")
export class LoomCorePlugin implements IEditorEnv.IBuildPlugin {
    onCollectAssets(_task: IEditorEnv.IBuildTask, assets: Set<IEditorEnv.IAssetInfo>): void {
        const entry = EditorEnv.assetMgr.getAsset("6c98a599-ea06-46fb-897e-b9ba2be8e695");
        if (!entry) throw new Error("[LoomCore] Missing runtime entry");
        assets.add(entry);
    }
}
