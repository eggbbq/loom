interface AtlasPreviewEntry {
    url: string;
    description: {
        frames: Record<string, { filename?: string }>;
        meta?: { prefix?: string };
    };
}

/** 图集运行时实现；由模块入口加载，同时供 Scene 插件直接调用。 */
export class ManualAtlasCollectorRuntime {
    static register(entries: AtlasPreviewEntry[]): void {
        for (const { url, description } of entries) {
            const prefix = description.meta?.prefix ?? url.substring(0, url.lastIndexOf(".")) + "/";
            const frames = Object.entries(description.frames).map(([name, frame]) => frame.filename || name);
            Laya.Loader.preLoadedMap[Laya.URL.formatURL(url)] = description;
            Laya.AtlasInfoManager.addAtlas(url, prefix, frames);
            console.log(`[ManualAtlasCollector] 映射注册：${url} -> ${prefix} (${frames.length} frames)`);
        }
    }

    static async initialize(): Promise<void> {
        // IDE 在 bundle 执行后、调用 Laya.init 前才设置预览标记；编辑视图由 Scene 插件直接注册。
        if (!Laya.LayaEnv.isPreview) return;
        const payload: { atlases: AtlasPreviewEntry[]; error?: string } = await Laya.loader.fetch("manual-atlas-collector.json", "json");
        if (!payload || payload.error) throw new Error(`[ManualAtlasCollector] 预览映射初始化失败：${payload?.error ?? "编辑器插件未提供图集描述"}`);
        this.register(payload.atlases);
    }
}

Laya.addBeforeInitCallback(() => ManualAtlasCollectorRuntime.initialize());
