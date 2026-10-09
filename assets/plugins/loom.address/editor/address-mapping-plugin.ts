import { AddressMappingConfig, CONFIG_PATH, collectMapping, defaultConfig, parseConfig, within } from "./address-mapping";
import "../index";

/** Scene 进程：资源数据库、原生文件工具、CLI 和发布共用同一条生成链路。 */
@IEditorEnv.regClass()
@IEditorEnv.regBuildPlugin("*")
export class LoomAddressMappingPlugin implements IEditorEnv.IBuildPlugin {
    private static config: AddressMappingConfig;
    private static queue: Promise<unknown> = Promise.resolve();
    private static active = false;

    @IEditorEnv.onLoad
    static async onLoad(): Promise<void> {
        LoomAddressMappingPlugin.active = true;
        EditorEnv.assetMgr.onAssetChanged.add(LoomAddressMappingPlugin.onAssetChanged, LoomAddressMappingPlugin);
        try {
            await LoomAddressMappingPlugin.enqueue(async () => { await LoomAddressMappingPlugin.ensureConfig(); LoomAddressMappingPlugin.config = await LoomAddressMappingPlugin.readConfig(); });
            if (!EditorEnv.cliMode && LoomAddressMappingPlugin.config.runOnStart) await LoomAddressMappingPlugin.runNow();
        } catch (error) { console.error("[AddressMapping]", error); }
    }

    @IEditorEnv.onUnload
    static async onUnload(): Promise<void> {
        LoomAddressMappingPlugin.active = false;
        EditorEnv.assetMgr.onAssetChanged.remove(LoomAddressMappingPlugin.onAssetChanged, LoomAddressMappingPlugin);
        Laya.timer.clear(LoomAddressMappingPlugin, LoomAddressMappingPlugin.generateScheduled);
        await LoomAddressMappingPlugin.queue.catch(() => {});
    }

    private static enqueue<T>(action: () => Promise<T>): Promise<T> {
        const next = LoomAddressMappingPlugin.queue.catch(() => {}).then(action);
        LoomAddressMappingPlugin.queue = next;
        return next;
    }

    static runNow(): Promise<{ changed: boolean; count: number }> {
        return LoomAddressMappingPlugin.enqueue(() => LoomAddressMappingPlugin.generate(false));
    }

    /** CLI 校验：不写输出，过期时抛错使 CLI 返回非零退出码。 */
    static check(): Promise<{ changed: boolean; count: number }> {
        return LoomAddressMappingPlugin.enqueue(() => LoomAddressMappingPlugin.generate(true));
    }

    /** UI 进程转发 editorResources 配置通知；此目录不保证进入 Scene 资源库。 */
    static reloadConfig(): Promise<{ changed: boolean; count: number }> {
        Laya.timer.clear(LoomAddressMappingPlugin, LoomAddressMappingPlugin.generateScheduled);
        return LoomAddressMappingPlugin.runNow();
    }

    private static async ensureConfig(): Promise<void> {
        const fullPath = EditorEnv.assetMgr.toFullPath(CONFIG_PATH);
        if (await IEditorEnv.utils.fileExists(fullPath)) return;
        await EditorEnv.assetMgr.createFolder(CONFIG_PATH.substring(0, CONFIG_PATH.lastIndexOf("/")));
        await IEditorEnv.utils.writeJsonAsync(fullPath, defaultConfig(), 2);
    }

    private static async readConfig(): Promise<AddressMappingConfig> {
        return parseConfig(await IEditorEnv.utils.readJsonAsync(EditorEnv.assetMgr.toFullPath(CONFIG_PATH)));
    }

    private static sources(): IEditorEnv.IAssetInfo[] {
        const excluded = IEditorEnv.AssetFlags.SubAsset | IEditorEnv.AssetFlags.Internal | IEditorEnv.AssetFlags.Memory
            | IEditorEnv.AssetFlags.Temp | IEditorEnv.AssetFlags.PackageLike | IEditorEnv.AssetFlags.BuiltIn;
        return Object.values(EditorEnv.assetMgr.allAssets).filter(asset => !(asset.flags & excluded)
            && asset.type !== IEditorEnv.AssetType.Folder && !asset.file.startsWith("~/")
            && !asset.file.split("/").includes("editorResources"));
    }

    private static async generate(check: boolean): Promise<{ changed: boolean; count: number }> {
        await LoomAddressMappingPlugin.ensureConfig();
        // 验证失败保留已有映射，事件仍监听，下一次配置修正可恢复。
        const config = await LoomAddressMappingPlugin.readConfig();
        LoomAddressMappingPlugin.config = config;
        if (!config.watchDirs.length) return { changed: false, count: 0 };
        await EditorEnv.assetMgr.flushChanges();
        for (const dir of config.watchDirs) {
            const asset = EditorEnv.assetMgr.getAsset(dir);
            if (asset && asset.type !== IEditorEnv.AssetType.Folder) throw new Error(`Address Mapping: watch directory is a file: ${dir}`);
            if (!asset) console.warn(`[AddressMapping] Missing watch directory: ${dir}`);
        }
        const result = collectMapping(config, LoomAddressMappingPlugin.sources());
        for (const [key, files] of Object.entries(result.conflicts)) console.error(`[AddressMapping] Key conflict ${key}:\n${files.join("\n")}`);
        const fullPath = EditorEnv.assetMgr.toFullPath(config.output);
        const exists = await IEditorEnv.utils.fileExists(fullPath);
        const previous = exists ? await IEditorEnv.utils.readJsonAsync(fullPath, true) : null;
        const changed = JSON.stringify(previous) !== JSON.stringify(result.mapping);
        if (check && changed) throw new Error(`Address Mapping: output needs update: ${config.output}`);
        if (changed) {
            const slash = config.output.lastIndexOf("/");
            if (slash >= 0) await EditorEnv.assetMgr.createFolder(config.output.substring(0, slash));
            IEditorEnv.utils.scheduleFileWrite(fullPath, JSON.stringify(result.mapping, null, config.pretty ? 2 : 0) + (config.pretty ? "\n" : ""), 0);
            await IEditorEnv.utils.flushFileWrites(fullPath);
            // 让首次生成的输出立即成为可发布资源，不等待外部文件通知。
            await EditorEnv.assetMgr.createFile(config.output);
            await EditorEnv.assetMgr.flushChanges();
        }
        const count = Object.keys(result.mapping).length - 1;
        console.log(`[AddressMapping] ${changed ? "Updated" : "Up to date"}: ${config.output} (${count})`);
        return { changed, count };
    }

    private static onAssetChanged(asset: IEditorEnv.IAssetInfo, flag: IEditorEnv.AssetChangedFlag): void {
        if (!LoomAddressMappingPlugin.active || EditorEnv.cliMode === "run") return;
        if (asset.file === CONFIG_PATH) { LoomAddressMappingPlugin.schedule(); return; }
        if (!LoomAddressMappingPlugin.config || asset.file === LoomAddressMappingPlugin.config.output || asset.file.split("/").includes("editorResources")) return;
        // Moved 不含旧路径；任何移动都重算，覆盖移出观察目录和父目录改名。
        if (flag === IEditorEnv.AssetChangedFlag.Moved || LoomAddressMappingPlugin.config.watchDirs.some(dir => within(asset.file, dir) || within(dir, asset.file))) LoomAddressMappingPlugin.schedule();
    }

    private static schedule(): void {
        Laya.timer.clear(LoomAddressMappingPlugin, LoomAddressMappingPlugin.generateScheduled);
        Laya.timer.once(LoomAddressMappingPlugin.config?.debounceMs ?? 600, LoomAddressMappingPlugin, LoomAddressMappingPlugin.generateScheduled);
    }

    private static generateScheduled(): void {
        if (LoomAddressMappingPlugin.active) void LoomAddressMappingPlugin.runNow().catch(error => console.error("[AddressMapping]", error));
    }

    async onStart(): Promise<void> { await LoomAddressMappingPlugin.runNow(); }

    async onCollectAssets(_task: IEditorEnv.IBuildTask, assets: Set<IEditorEnv.IAssetInfo>): Promise<void> {
        const entry = EditorEnv.assetMgr.getAsset("6b1623aa-6a04-40ff-a21c-c9d9a8a12fae");
        if (entry) assets.add(entry);
        const config = LoomAddressMappingPlugin.config;
        if (!config?.watchDirs.length) return;
        const result = collectMapping(config, LoomAddressMappingPlugin.sources());
        for (const file of [config.output, ...result.files]) {
            const asset = EditorEnv.assetMgr.getAsset(file);
            if (asset) assets.add(asset);
        }
    }
}
