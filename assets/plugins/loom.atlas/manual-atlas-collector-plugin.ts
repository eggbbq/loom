import { ManualAtlasCollectorRuntime } from "./runtime/manual-atlas-collector-runtime";

interface AtlasDescription {
    frames: Record<string, { filename?: string }>;
    meta?: { prefix?: string; image?: string };
}

interface AtlasEntry {
    asset: IEditorEnv.IAssetInfo;
    description: AtlasDescription;
    frames: string[];
    images: IEditorEnv.IAssetInfo[];
}

/** 发布时将所选手工图集加入资源配置，预览时提供同一份描述信息。 */
@IEditorEnv.regClass()
@IEditorEnv.regBuildPlugin("*")
export class ManualAtlasCollectorPlugin implements IEditorEnv.IBuildPlugin {
    private static readonly CONFIG_PATH = "editorResources/manual-atlas-collector/config.json";
    private static readonly CONFIG_DOC = [
        "手工图集收集器：将所选 .atlas 接入编辑器、预览和发布流程，纹理按需加载。",
        "atlases 是图集引用数组，支持图集 UUID、res://<图集 UUID> 或相对 assets 的路径。",
        "路径示例：resources/ui/items.atlas；UUID 示例：xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx。",
        "只填写 .atlas 图集，不填写整图或子图；子图名称、前缀和整图路径从图集文件读取。",
        "atlases 为空数组时不收集任何手工图集；插件不会自动选择项目中的全部图集。",
        "保存配置后重新运行预览；发布时执行完整资源构建，仅重新编译脚本不会更新图集索引。",
        "无需在业务入口 import 插件；更新和重新加载插件会保留已有配置。",
        "__doc__ 仅用于使用说明，修改或删除此属性不影响图集收集。",
    ];
    private static readonly PREVIEW_FILE = "bin/manual-atlas-collector.json";
    private static previewRefresh: Promise<void> = Promise.resolve();
    private static readonly onConfigChanged = (): void => { void ManualAtlasCollectorPlugin.refreshPreview(); };
    private entries: AtlasEntry[] = [];

    onSetup(task: IEditorEnv.IBuildTask): void {
        // IDE 默认复制 bin；预览描述不能作为第二份图集数据进入发布包。
        task.config.ignoreFilesInBin ??= [];
        task.config.ignoreFilesInBin.push("manual-atlas-collector.json", "manual-atlas-collector.json.tmp");
    }

    @IEditorEnv.onLoad
    static async onLoad(): Promise<void> {
        await this.ensureProjectConfig();
        await this.refreshPreview();
        EditorEnv.assetMgr.onAssetChanged.add(this.onAssetChanged, this);
        // editorResources 配置不一定进入 Scene 资源库；同时监听不存在的文件，支持安装后首次创建配置。
        IEditorEnv.require("fs").watchFile(EditorEnv.assetMgr.toFullPath(this.CONFIG_PATH), { interval: 1000 }, this.onConfigChanged);
    }

    @IEditorEnv.onUnload
    static async onUnload(): Promise<void> {
        EditorEnv.assetMgr.onAssetChanged.remove(this.onAssetChanged, this);
        IEditorEnv.require("fs").unwatchFile(EditorEnv.assetMgr.toFullPath(this.CONFIG_PATH), this.onConfigChanged);
        Laya.timer.clear(this, this.refreshPreview);
        await this.previewRefresh.catch(() => {});
        await IEditorEnv.require("fs").promises.rm(`${EditorEnv.projectPath}/${this.PREVIEW_FILE}`, { force: true });
    }

    async onCollectAssets(task: IEditorEnv.IBuildTask, assets: Set<IEditorEnv.IAssetInfo>): Promise<void> {
        const entry = EditorEnv.assetMgr.getAsset("6fbeb86f-2e39-49d3-a401-079230ffd738");
        if (entry) assets.add(entry);
        this.entries = await ManualAtlasCollectorPlugin.readEntries();
        for (const entry of this.entries) {
            assets.add(entry.asset);
            for (const image of entry.images) assets.add(image);
        }
        task.logger.debug(`[ManualAtlasCollector] 已收集 ${this.entries.length} 个手工图集`);
    }

    onBeforeExportAssets(task: IEditorEnv.IBuildTask, exportInfoMap: Map<IEditorEnv.IAssetInfo, IEditorEnv.IAssetExportInfo>): void {
        const owners = new Map<string, string>();
        for (const entry of this.entries) {
            const info = exportInfoMap.get(entry.asset);
            if (!info) throw new Error(`[ManualAtlasCollector] 图集没有导出信息：${entry.asset.file}`);
            const prefix = ManualAtlasCollectorPlugin.getPrefix(entry.description, info.outPath);
            ManualAtlasCollectorPlugin.checkFrameOwners(owners, prefix, entry.frames, info.outPath);
            info.config = { t: IEditorEnv.AssetExportConfigType.Atlas, prefix, frames: entry.frames };
            task.logger.debug(`[ManualAtlasCollector] 加入 fileconfig：${info.outPath}（${entry.frames.length} 个子图）`);
        }
    }

    /** 初次加载时生成项目配置；排他创建保证已有配置不会被更新或重载覆盖。 */
    private static async ensureProjectConfig(): Promise<void> {
        const fs = IEditorEnv.require("fs");
        const path = IEditorEnv.require("path");
        const configPath = EditorEnv.assetMgr.toFullPath(this.CONFIG_PATH);
        await fs.promises.mkdir(path.dirname(configPath), { recursive: true });
        try {
            await fs.promises.writeFile(configPath, JSON.stringify({ __doc__: this.CONFIG_DOC, atlases: [] }, null, 2) + "\n", { flag: "wx" });
        } catch (error) {
            if ((error as { code?: string }).code !== "EEXIST") throw error;
        }
    }

    private static async readEntries(): Promise<AtlasEntry[]> {
        const configPath = EditorEnv.assetMgr.toFullPath(this.CONFIG_PATH);
        if (!IEditorEnv.require("fs").existsSync(configPath)) return [];
        const config = await IEditorEnv.utils.readJsonAsync(configPath);
        if (!config || !Array.isArray(config.atlases)) throw new Error("[ManualAtlasCollector] 配置必须包含 atlases 数组");
        const entries: AtlasEntry[] = [];
        const selected = new Set<string>();
        const path = IEditorEnv.require("path");
        for (const reference of config.atlases) {
            if (typeof reference !== "string") throw new Error("[ManualAtlasCollector] atlases 的每一项必须是图集路径或 UUID");
            const asset = EditorEnv.assetMgr.getAsset(reference.replace(/^res:\/\//, ""));
            if (!asset || asset.type !== IEditorEnv.AssetType.Atlas) throw new Error(`[ManualAtlasCollector] 找不到手工图集：${reference}`);
            if (selected.has(asset.id)) continue;
            selected.add(asset.id);
            const description: AtlasDescription = await IEditorEnv.utils.readJsonAsync(EditorEnv.assetMgr.getFullPath(asset));
            if (!description?.frames || Array.isArray(description.frames)) throw new Error(`[ManualAtlasCollector] 图集缺少 frames：${asset.file}`);
            const frames = Object.entries(description.frames).map(([name, frame]) => frame.filename || name);
            const imagePaths = description.meta?.image ? description.meta.image.split(",") : [asset.file.replace(/\.atlas$/, ".png")];
            const images = imagePaths.map(imagePath => {
                const reference = description.meta?.image && !imagePath.startsWith("res://")
                    ? path.posix.join(path.posix.dirname(asset.file), imagePath) : imagePath.replace(/^res:\/\//, "");
                const image = EditorEnv.assetMgr.getAsset(reference);
                if (!image || image.type !== IEditorEnv.AssetType.Image) throw new Error(`[ManualAtlasCollector] 找不到图集整图：${reference}`);
                return image;
            });
            entries.push({ asset, description, frames, images });
        }
        return entries;
    }

    private static getPrefix(description: AtlasDescription, url: string): string {
        return description.meta?.prefix ?? url.substring(0, url.lastIndexOf(".")) + "/";
    }

    private static checkFrameOwners(owners: Map<string, string>, prefix: string, frames: string[], atlas: string): void {
        for (const frame of frames) {
            const url = prefix + frame;
            if (owners.has(url)) throw new Error(`[ManualAtlasCollector] 子图路径冲突：${url}（${owners.get(url)} 与 ${atlas}）`);
            owners.set(url, atlas);
        }
    }

    private static onAssetChanged(asset: IEditorEnv.IAssetInfo): void {
        if (asset.type === IEditorEnv.AssetType.Atlas) Laya.timer.callLater(this, this.refreshPreview);
    }

    private static refreshPreview(): Promise<void> {
        // 资源通知可能连续到达，串行写入以免临时文件相互覆盖。
        this.previewRefresh = this.previewRefresh.catch(() => {}).then(() => this.writePreview());
        return this.previewRefresh;
    }

    private static async writePreview(): Promise<void> {
        let payload: { atlases: Array<{ url: string; description: AtlasDescription }>; error?: string };
        try {
            const entries = await this.readEntries();
            const owners = new Map<string, string>();
            for (const entry of entries) this.checkFrameOwners(owners, this.getPrefix(entry.description, entry.asset.file), entry.frames, entry.asset.file);
            payload = { atlases: entries.map(entry => ({ url: entry.asset.file, description: entry.description })) };
            // 安装包在引擎初始化后加载；编辑视图需要直接注册，不能等待 beforeInit 回调。
            ManualAtlasCollectorRuntime.register(payload.atlases);
        } catch (error) {
            payload = { atlases: [], error: String(error) };
            console.error("[ManualAtlasCollector] 预览图集配置无效", error);
        }
        const fs = IEditorEnv.require("fs");
        const folder = `${EditorEnv.projectPath}/bin`;
        await fs.promises.mkdir(folder, { recursive: true });
        const file = `${EditorEnv.projectPath}/${this.PREVIEW_FILE}`;
        await IEditorEnv.utils.writeJsonAsync(`${file}.tmp`, payload, 0);
        await fs.promises.rename(`${file}.tmp`, file);
    }
}
