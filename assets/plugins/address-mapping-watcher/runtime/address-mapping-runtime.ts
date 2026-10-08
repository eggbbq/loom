/** 注册安装包运行时入口，并提供 loom.kits.address.load。 */
@Laya.regClass()
export class LoomAddressMappingRuntime {
    /** 加载并展开映射，完成后释放 JSON 资源。 */
    static async load(address: string = "resources/address.json"): Promise<Record<string, string>> {
        const resource = await Laya.loader.load(address, Laya.Loader.JSON) as Laya.TextResource;
        try {
            const addresses = LoomAddressMappingRuntime.expand(resource?.data, address);
            loom.kits.address.data = addresses;
            return addresses;
        } finally {
            Laya.loader.clearRes(address, resource);
        }
    }

    private static expand(data: unknown, address: string): Record<string, string> {
        if (!data || typeof data !== "object" || Array.isArray(data) || !("$path" in data) || !Array.isArray(data.$path)
            || data.$path.some((entry: unknown) => !Array.isArray(entry) || entry.length !== 2
                || typeof entry[0] !== "string" || typeof entry[1] !== "string")) {
            throw new Error(`[AddressMapping] Invalid mapping: ${address}`);
        }
        const paths: string[][] = data.$path;
        const addresses: Record<string, string> = {};
        for (const [key, index] of Object.entries(data)) {
            if (key === "$path") continue;
            if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= paths.length) {
                throw new Error(`[AddressMapping] Invalid path index for ${key}: ${address}`);
            }
            const [directory, extension] = paths[index];
            Object.defineProperty(addresses, key, {
                value: `${directory ? directory + "/" : ""}${key}${extension}`,
                enumerable: true, configurable: true, writable: true,
            });
        }
        return addresses;
    }

    private static install(): void {
        const root = window.loom ??= {} as LoomGlobal;
        root.kits ??= {} as LoomKits;
        root.kits.address = { load: LoomAddressMappingRuntime.load, data: undefined };
    }

    static {
        // 全部脚本加载后挂载，保留工程随后创建的 loom 框架对象。
        Laya.addBeforeInitCallback(LoomAddressMappingRuntime.install);
        // Scene 首次加载和业务脚本重载后恢复 API。
        if (typeof IEditorEnv !== "undefined") {
            IEditorEnv.onUserScriptsLoad(LoomAddressMappingRuntime, "install");
        }
    }
}

declare global {
    interface LoomKits {
        address: {
            /** 最近一次成功加载的映射数据，供后续插件直接读取；键为资源名，值为完整资源路径。 */
            data: Record<string, string> | undefined;
            load: (address?: string) => Promise<Record<string, string>>;
        };
    }
    interface LoomGlobal { kits: LoomKits; }
    var loom: LoomGlobal;
}
