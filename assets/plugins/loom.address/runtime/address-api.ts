/** 地址映射服务；导入与全局访问共享同一实例。 */
export const address = {
    /** 加载并展开映射，完成后释放 JSON 资源。 */
    async load(url: string = "resources/address.json"): Promise<Record<string, string>> {
        const resource = await Laya.loader.load(url, Laya.Loader.JSON) as Laya.TextResource;
        try {
            const addresses = expand(resource?.data, url);
            address.data = addresses;
            return addresses;
        } finally {
            Laya.loader.clearRes(url, resource);
        }
    },
    data: undefined as Record<string, string> | undefined,
};

function expand(data: unknown, address: string): Record<string, string> {
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
