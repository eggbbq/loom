/** 全局 API 无需业务运行时 import，发布时仍收集完整 UI 入口。 */
@IEditorEnv.regClass()
@IEditorEnv.regBuildPlugin("*")
export class LoomUIPlugin implements IEditorEnv.IBuildPlugin {
    onCollectAssets(_task: IEditorEnv.IBuildTask, assets: Set<IEditorEnv.IAssetInfo>): void {
        const asset = EditorEnv.assetMgr.getAsset("ed3b6a7c-65eb-44ae-9cd0-fbb4e295220a");
        if (!asset) throw new Error("[LoomUI] Missing runtime entry");
        assets.add(asset);
    }
}
