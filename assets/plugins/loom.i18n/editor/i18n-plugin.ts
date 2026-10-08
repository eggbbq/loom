/** 显式收集运行时入口，使只调用全局 API 的工程也能发布翻译服务。 */
@IEditorEnv.regClass()
@IEditorEnv.regBuildPlugin("*")
export class LoomI18nPlugin implements IEditorEnv.IBuildPlugin {
    onCollectAssets(_task: IEditorEnv.IBuildTask, assets: Set<IEditorEnv.IAssetInfo>): void {
        for (const uuid of ["d81c3142-f589-491d-87ba-83bde906ef53", "2f1d9103-cdbc-4d9c-8063-41b5edf8ae67"]) {
            const asset = EditorEnv.assetMgr.getAsset(uuid);
            if (!asset) throw new Error(`[LoomI18n] Missing runtime script: ${uuid}`);
            assets.add(asset);
        }
    }
}
