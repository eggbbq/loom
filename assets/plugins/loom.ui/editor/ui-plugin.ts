/** 全局 API 无需业务运行时 import，发布时仍收集完整 UI 入口。 */
@IEditorEnv.regClass()
@IEditorEnv.regBuildPlugin("*")
export class LoomUIPlugin implements IEditorEnv.IBuildPlugin {
    onCollectAssets(_task: IEditorEnv.IBuildTask, assets: Set<IEditorEnv.IAssetInfo>): void {
        const asset = EditorEnv.assetMgr.getAsset("b82b660b-de69-4a88-bf69-e34db634fd76");
        if (!asset) throw new Error("[LoomUI] Missing runtime entry");
        assets.add(asset);
    }
}
