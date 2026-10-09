/** 显式收集模块入口，使安装包仅使用全局 API 时也能发布。 */
@IEditorEnv.regClass()
@IEditorEnv.regBuildPlugin("*")
export class LoomI18nPlugin implements IEditorEnv.IBuildPlugin {
    onCollectAssets(_task: IEditorEnv.IBuildTask, assets: Set<IEditorEnv.IAssetInfo>): void {
        const entry = EditorEnv.assetMgr.getAsset("de0b14e9-4acf-4ecb-beba-e3dd7860478a");
        if (!entry) throw new Error("[LoomI18n] Missing module entry");
        assets.add(entry);
    }
}
