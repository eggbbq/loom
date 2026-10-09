/** 地址映射运行时实现；由模块 index.ts 挂载 loom.address。 */
export class LoomAddressMappingRuntime {
    /** 加载并展开映射，完成后释放 JSON 资源。 */
    static async load(address: string = "resources/address.json"): Promise<Record<string, string>> {
        const resource = await Laya.loader.load(address, Laya.Loader.JSON) as Laya.TextResource;
        try {
            const addresses = LoomAddressMappingRuntime.expand(resource?.data, address);
            loom.address.data = addresses;
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

    static install(): void {
        window.loom ??= {} as LoomGlobal;
        window.loom.address = { load: LoomAddressMappingRuntime.load, data: undefined };
    }


}

declare global {
    interface LoomGlobal {
        address: {
            /** 最近一次成功加载的映射数据，供后续插件直接读取；键为资源名，值为完整资源路径。 */
            data: Record<string, string> | undefined;
            load: (address?: string) => Promise<Record<string, string>>;
        };
    }

    var loom: LoomGlobal;
}
