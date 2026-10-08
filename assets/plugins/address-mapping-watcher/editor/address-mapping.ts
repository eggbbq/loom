export const CONFIG_PATH = "editorResources/address-mapping-watcher/config.json";

export interface AddressMappingConfig {
    watchDirs: string[];
    extensions: string[];
    output: string;
    debounceMs: number;
    runOnStart: boolean;
    pretty: boolean;
}

export function defaultConfig(): AddressMappingConfig & { __doc__: string[] } {
    return {
        __doc__: [
            "watchDirs: 观察并递归扫描的目录列表，路径相对 assets，例如 resources/icons。空数组不生成映射。",
            "extensions: 所有观察目录使用的扩展名列表，大小写不敏感。",
            "output: 相对 assets 的 JSON 输出路径；保持 $path + 文件名索引格式。",
            "debounceMs: 原生资源事件合并时间（毫秒）。runOnStart: IDE 加载时生成。pretty: 格式化 JSON。",
            "保存配置自动生效；移动、删除、新增目录均由 Laya 资源数据库通知，不使用文件轮询。",
            "重名保留配置目录顺序、目录内路径排序后的第一项，并在控制台列出所有冲突。",
            "插件更新和重新加载保留此配置；CLI 的 runNow/check 与发布使用同一份配置。",
        ],
        watchDirs: [], extensions: [".png", ".jpg", ".jpeg", ".webp"],
        output: "resources/address.json", debounceMs: 600, runOnStart: true, pretty: false,
    };
}

/** 仅接受项目 assets 下的真实路径，避免包、别名和编辑器资源混入运行时地址。 */
export function assetPath(value: unknown): string {
    if (typeof value !== "string") throw new Error("Address Mapping: expected an assets-relative path");
    const result = value.replace(/\\/g, "/").replace(/^assets\//, "").replace(/\/$/, "");
    if (!result || result.split("/").some(part => !part || part.startsWith(".") || part === "~")
        || /[:?#]/.test(result) || result.startsWith("/")
        || result.split("/").includes("editorResources") || result === "plugins" || result.startsWith("plugins/")) {
        throw new Error(`Address Mapping: invalid project asset path: ${value}`);
    }
    return result;
}

export function parseConfig(value: any): AddressMappingConfig {
    const base = defaultConfig();
    if (!value || !Array.isArray(value.watchDirs)) throw new Error("Address Mapping: watchDirs must be an array");
    const extensions: unknown = value.extensions ?? base.extensions;
    if (!Array.isArray(extensions) || !extensions.length || extensions.some(ext => typeof ext !== "string" || !/^\.?[a-z0-9]+$/i.test(ext))) {
        throw new Error("Address Mapping: extensions must be a non-empty extension list");
    }
    const output = assetPath(value.output ?? base.output);
    if (!output.endsWith(".json")) throw new Error("Address Mapping: output must end in .json");
    const debounceMs = value.debounceMs ?? base.debounceMs;
    if (!Number.isFinite(debounceMs) || debounceMs < 0 || debounceMs > 60000) throw new Error("Address Mapping: debounceMs must be between 0 and 60000");
    for (const name of ["runOnStart", "pretty"] as const) {
        if (value[name] !== undefined && typeof value[name] !== "boolean") throw new Error(`Address Mapping: ${name} must be boolean`);
    }
    return {
        watchDirs: [...new Set<string>(value.watchDirs.map(assetPath))],
        extensions: [...new Set<string>(extensions.map(ext => "." + ext.replace(/^\./, "").toLowerCase()))],
        output, debounceMs, runOnStart: value.runOnStart ?? base.runOnStart, pretty: value.pretty ?? base.pretty,
    };
}

export function within(file: string, directory: string): boolean {
    return file === directory || file.startsWith(directory + "/");
}

export interface AddressSource { file: string; }
export interface MappingResult {
    mapping: { $path: string[][]; [key: string]: number | string[][] };
    conflicts: Record<string, string[]>;
    files: string[];
}

function compare(a: string, b: string): number {
    const x = a.toLowerCase(), y = b.toLowerCase();
    return x < y ? -1 : x > y ? 1 : a < b ? -1 : a > b ? 1 : 0;
}

export function collectMapping(config: AddressMappingConfig, sources: ReadonlyArray<AddressSource>): MappingResult {
    const files: string[] = [], visited = new Set<string>();
    for (const dir of config.watchDirs) {
        for (const { file } of sources.filter(asset => within(asset.file, dir)).sort((a, b) => compare(a.file, b.file))) {
            if (visited.has(file) || file === config.output || file.split("/").some(part => part.startsWith("."))) continue;
            if (!config.extensions.includes(file.substring(file.lastIndexOf(".")).toLowerCase())) continue;
            visited.add(file);
            files.push(file);
        }
    }
    const paths: string[][] = [], pathIndexes = new Map<string, number>();
    const keys = new Map<string, number>(), addresses = new Map<string, string>();
    const conflicts: Record<string, string[]> = Object.create(null);
    for (const file of files) {
        const slash = file.lastIndexOf("/"), dot = file.lastIndexOf(".");
        const key = file.substring(slash + 1, dot), dir = slash < 0 ? "" : file.substring(0, slash);
        const extension = file.substring(dot).toLowerCase();
        // $path 是协议保留字段，旧 Python 实现会被同名文件破坏，必须明确报错。
        if (key === "$path") throw new Error(`Address Mapping: reserved key $path: ${file}`);
        const pathKey = JSON.stringify([dir, extension]);
        if (!pathIndexes.has(pathKey)) { pathIndexes.set(pathKey, paths.length); paths.push([dir, extension]); }
        if (keys.has(key)) { (conflicts[key] ??= [addresses.get(key)]).push(file); continue; }
        keys.set(key, pathIndexes.get(pathKey));
        addresses.set(key, file);
    }
    const mapping: MappingResult["mapping"] = { $path: paths };
    for (const key of [...keys.keys()].sort(compare)) {
        Object.defineProperty(mapping, key, { value: keys.get(key), enumerable: true });
    }
    return { mapping, conflicts, files };
}
