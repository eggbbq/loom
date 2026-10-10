const CONFIG = "assets/editorResources/loom.sdk/config.json";
const TEMPLATE = "assets/editorResources/loom.sdk/loom.sdk.ts.txt";
const DEFAULT_OUTPUT = "src/loom/loom.sdk.ts";
const LEGACY_TEMPLATES = ["assets/editorResources/loom.sdk/loom.sdk.txt", "assets/editorResources/loom.sdk/sdk.txt"];
// 复制的源码保持原样；Laya 注册与启动放在独立入口。
const LAYA_BOOTSTRAP = `import { create } from __SDK_IMPORT__;
declare const GameGlobal: any;

// Laya 项目入口：在业务脚本之前安装，重载时恢复同一服务实例。
export const sdk = create();
function installLoomSDK(): void {
    const host = (typeof GameGlobal !== "undefined" ? GameGlobal : (globalThis as any).window ?? globalThis) as any;
    const shared = host.loom ?? (globalThis as any).loom ?? {};
    shared.sdk = sdk;
    host.loom = shared;
    (globalThis as any).loom = shared;
}
installLoomSDK();
Laya.addBeforeInitCallback(installLoomSDK);
if (typeof IEditorEnv !== "undefined") IEditorEnv.onUserScriptsLoad({ installLoomSDK }, "installLoomSDK");

@Laya.regClass()
export class LoomSDKAdapterEntry {
    static install(): void { installLoomSDK(); }
}
`;
const TEMPLATE_ID = "20abf886-34e8-4e44-a8e3-521a03bbf1ca";
const GENERATOR_ID = "9c595c89-6ef3-42ee-9601-4b6be51a933f";

/** Scene 进程：安装时将文本资源还原为项目自己的源码。 */
@IEditorEnv.regClass()
export class LoomSDKPlugin {
    @IEditorEnv.onLoad
    static onLoad(): void {
        try { LoomSDKPlugin.generate(); }
        catch (error) { console.error("[LoomSDK]", error); }
    }

    static packageResources(): string {
        const path = IEditorEnv.require("path");
        const asset = EditorEnv.assetMgr.getAsset(TEMPLATE_ID);
        if (asset) return path.dirname(EditorEnv.assetMgr.getFullPath(asset));
        const script = EditorEnv.assetMgr.getAsset(GENERATOR_ID);
        if (!script) throw new Error("[LoomSDK] Missing package adapter template");
        return path.join(path.dirname(path.dirname(EditorEnv.assetMgr.getFullPath(script))), "editorResources/loom.sdk");
    }

    static ensureProjectFiles(): { config: string; template: string } {
        const fs = IEditorEnv.require("fs"), path = IEditorEnv.require("path");
        const config = path.join(EditorEnv.projectPath, CONFIG);
        const template = path.join(EditorEnv.projectPath, TEMPLATE);
        fs.mkdirSync(path.dirname(config), { recursive: true });
        if (!fs.existsSync(config)) fs.writeFileSync(config, JSON.stringify({ output: DEFAULT_OUTPUT }, null, 2) + "\n", { flag: "wx" });
        if (!fs.existsSync(template)) {
            const legacy = LEGACY_TEMPLATES.map(file => path.join(EditorEnv.projectPath, file)).find(file => fs.existsSync(file));
            if (legacy) {
                fs.renameSync(legacy, template);
                if (fs.existsSync(legacy + ".meta") && !fs.existsSync(template + ".meta")) fs.renameSync(legacy + ".meta", template + ".meta");
            }
        }
        if (!fs.existsSync(template)) fs.copyFileSync(path.join(LoomSDKPlugin.packageResources(), "loom.sdk.ts.txt"), template, fs.constants.COPYFILE_EXCL);
        return { config: CONFIG, template: TEMPLATE };
    }

    static safeOutput(fullPath: string): void {
        const fs = IEditorEnv.require("fs"), path = IEditorEnv.require("path");
        let ancestor = path.dirname(fullPath);
        while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
        const project = fs.realpathSync(EditorEnv.projectPath);
        const realAncestor = fs.realpathSync(ancestor);
        if (realAncestor !== project && !realAncestor.startsWith(project + path.sep)) throw new Error("[LoomSDK] Output escapes project");
    }

    static ensureMeta(file: string): string {
        const fs = IEditorEnv.require("fs"), crypto = IEditorEnv.require("crypto");
        if (!fs.existsSync(file + ".meta")) {
            const meta = file.endsWith(".js") ? { uuid: crypto.randomUUID(), importer: { import: false } } : { uuid: crypto.randomUUID() };
            fs.writeFileSync(file + ".meta", JSON.stringify(meta, null, 2) + "\n", { flag: "wx" });
        }
        const meta = JSON.parse(fs.readFileSync(file + ".meta", "utf8"));
        if (typeof meta.uuid !== "string" || !meta.uuid) throw new Error("[LoomSDK] Metadata is missing its UUID");
        return meta.uuid;
    }

    static generate(): { created: boolean; output: string; files: string[] } {
        const fs = IEditorEnv.require("fs"), path = IEditorEnv.require("path");
        LoomSDKPlugin.ensureProjectFiles();
        const configPath = path.join(EditorEnv.projectPath, CONFIG);
        const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
        // 默认文件名升级：移动已有适配器及其元数据，保留项目定制实现。
        if (config.output === "src/loom/sdk.ts") {
            const old = path.join(EditorEnv.projectPath, config.output), next = path.join(EditorEnv.projectPath, DEFAULT_OUTPUT);
            const pairs = [[old, next], [old + ".meta", next + ".meta"], [old.replace(/\.ts$/, ".bundledef"), next.replace(/\.ts$/, ".bundledef")], [old.replace(/\.ts$/, ".bundledef.meta"), next.replace(/\.ts$/, ".bundledef.meta")]];
            if (pairs.every(([, destination]) => !fs.existsSync(destination))) {
                for (const [from, to] of pairs) {
                    LoomSDKPlugin.safeOutput(to);
                    if (fs.existsSync(from)) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.renameSync(from, to); }
                }
                config.output = DEFAULT_OUTPUT;
                fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
            }
        }
        const output = typeof config.output === "string" ? config.output.replace(/\\/g, "/") : "";
        if (!/^src\/(?:[\w.-]+\/)*[\w.-]+\.ts$/.test(output) || output.endsWith(".d.ts")
            || output.split("/").some((part: string) => part === "." || part === "..")) throw new Error("[LoomSDK] Invalid config.output: expected a .ts file inside src/");
        const fullPath = path.join(EditorEnv.projectPath, output);
        LoomSDKPlugin.safeOutput(fullPath);
        const created = !fs.existsSync(fullPath), files: string[] = [];
        const resources = LoomSDKPlugin.packageResources();
        const copy = (folder: string, relative = ""): void => {
            for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
                const name = relative + entry.name;
                if (entry.isDirectory()) { copy(path.join(folder, entry.name), name + "/"); continue; }
                if (!entry.isFile() || !name.endsWith(".txt")) continue;
                const target = name === "loom.sdk.ts.txt" ? fullPath : path.join(EditorEnv.projectPath, "src/loom", name.slice(0, -4));
                LoomSDKPlugin.safeOutput(target);
                fs.mkdirSync(path.dirname(target), { recursive: true });
                if (!fs.existsSync(target)) {
                    const from = name === "loom.sdk.ts.txt" ? path.join(EditorEnv.projectPath, TEMPLATE) : path.join(folder, entry.name);
                    fs.copyFileSync(from, target, fs.constants.COPYFILE_EXCL);
                }
                LoomSDKPlugin.ensureMeta(target);
                files.push(path.relative(EditorEnv.projectPath, target).replace(/\\/g, "/"));
            }
        };
        copy(resources);
        const adapterSource = fs.readFileSync(fullPath, "utf8");
        if (!adapterSource.trim()) throw new Error("[LoomSDK] Adapter template is empty");
        let entryId = LoomSDKPlugin.ensureMeta(fullPath);
        // 旧版完整模板已有注册入口，继续使用它；原始平台源码用独立入口启动。
        if (!/\bexport\s+class\s+LoomSDKAdapterEntry\b/.test(adapterSource)) {
            const entry = fullPath.replace(/\.ts$/, ".entry.ts");
            LoomSDKPlugin.safeOutput(entry);
            if (!fs.existsSync(entry)) {
                const module = "./" + path.basename(fullPath, ".ts");
                fs.writeFileSync(entry, LAYA_BOOTSTRAP.replace("__SDK_IMPORT__", JSON.stringify(module)), { flag: "wx" });
            }
            entryId = LoomSDKPlugin.ensureMeta(entry);
        }
        const bundlePath = fullPath.replace(/\.ts$/, ".bundledef");
        if (!fs.existsSync(bundlePath)) fs.writeFileSync(bundlePath, JSON.stringify({ entries: [`res://${entryId}`], loadBeforeMain: true,
            allowLoadInEditor: true, allowLoadInRuntime: true, autoLoad: true }, null, 2) + "\n", { flag: "wx" });
        LoomSDKPlugin.ensureMeta(bundlePath);
        console.log(`[LoomSDK] ${created ? "Generated" : "Preserved"}: ${output}; copied project SDK resources`);
        return { created, output, files };
    }
}
