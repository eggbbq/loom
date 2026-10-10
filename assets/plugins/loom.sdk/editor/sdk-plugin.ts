const CONFIG = "assets/editorResources/loom.sdk/config.json";
const TEMPLATE = "assets/editorResources/loom.sdk/sdk.txt";
const TEMPLATE_ID = "20abf886-34e8-4e44-a8e3-521a03bbf1ca";
const GENERATOR_ID = "9c595c89-6ef3-42ee-9601-4b6be51a933f";

/** Scene 进程：只生成项目源码，不挂载任何 SDK 运行时实现。 */
@IEditorEnv.regClass()
export class LoomSDKPlugin {
    @IEditorEnv.onLoad
    static onLoad(): void {
        // 不等待资源导入，避免生命周期钩子与 flushChanges 相互等待。
        try { LoomSDKPlugin.generate(); }
        catch (error) { console.error("[LoomSDK]", error); }
    }

    static ensureProjectFiles(): { config: string; template: string } {
        const fs = IEditorEnv.require("fs"), path = IEditorEnv.require("path");
        const config = path.join(EditorEnv.projectPath, CONFIG);
        const template = path.join(EditorEnv.projectPath, TEMPLATE);
        fs.mkdirSync(path.dirname(config), { recursive: true });
        if (!fs.existsSync(config)) fs.writeFileSync(config, JSON.stringify({ output: "src/loom/sdk.ts" }, null, 2) + "\n", { flag: "wx" });
        if (!fs.existsSync(template)) {
            const asset = EditorEnv.assetMgr.getAsset(TEMPLATE_ID);
            // editorResources 不一定在 Scene 资源库中；从注册脚本定位自包含包资源。
            const script = asset ? null : EditorEnv.assetMgr.getAsset(GENERATOR_ID);
            if (!asset && !script) throw new Error("[LoomSDK] Missing package adapter template");
            const packageTemplate = asset ? EditorEnv.assetMgr.getFullPath(asset)
                : path.join(path.dirname(path.dirname(EditorEnv.assetMgr.getFullPath(script))), "editorResources/loom.sdk/sdk.txt");
            fs.writeFileSync(template, fs.readFileSync(packageTemplate, "utf8"), { flag: "wx" });
        }
        return { config: CONFIG, template: TEMPLATE };
    }

    static generate(): { created: boolean; output: string } {
        const fs = IEditorEnv.require("fs"), path = IEditorEnv.require("path");
        const crypto = IEditorEnv.require("crypto");
        LoomSDKPlugin.ensureProjectFiles();
        const config = JSON.parse(fs.readFileSync(path.join(EditorEnv.projectPath, CONFIG), "utf8"));
        const output = typeof config.output === "string" ? config.output.replace(/\\/g, "/") : "";
        if (!/^src\/(?:[\w.-]+\/)*[\w.-]+\.ts$/.test(output) || output.endsWith(".d.ts")
            || output.split("/").some((part: string) => part === "." || part === "..")) {
            throw new Error("[LoomSDK] Invalid config.output: expected a .ts file inside src/");
        }
        const fullPath = path.join(EditorEnv.projectPath, output);
        // 防止项目目录中的符号链接把生成文件写到项目外。
        let ancestor = path.dirname(fullPath);
        while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
        const project = fs.realpathSync(EditorEnv.projectPath);
        const realAncestor = fs.realpathSync(ancestor);
        if (realAncestor !== project && !realAncestor.startsWith(project + path.sep)) throw new Error("[LoomSDK] Output escapes project");
        const bundlePath = fullPath.replace(/\.ts$/, ".bundledef");
        const created = !fs.existsSync(fullPath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        if (created) {
            const source = fs.readFileSync(path.join(EditorEnv.projectPath, TEMPLATE), "utf8");
            if (!source.trim()) throw new Error("[LoomSDK] Adapter template is empty");
            fs.writeFileSync(fullPath, source, { flag: "wx" });
        }
        if (!fs.existsSync(fullPath + ".meta")) {
            fs.writeFileSync(fullPath + ".meta", JSON.stringify({ uuid: crypto.randomUUID() }, null, 2) + "\n", { flag: "wx" });
        }
        const meta = JSON.parse(fs.readFileSync(fullPath + ".meta", "utf8"));
        if (typeof meta.uuid !== "string" || !meta.uuid) throw new Error("[LoomSDK] Adapter metadata is missing its UUID");
        if (!fs.existsSync(bundlePath)) {
            fs.writeFileSync(bundlePath, JSON.stringify({
                entries: [`res://${meta.uuid}`], loadBeforeMain: true,
                allowLoadInEditor: true, allowLoadInRuntime: true, autoLoad: true,
            }, null, 2) + "\n", { flag: "wx" });
        }
        if (!fs.existsSync(bundlePath + ".meta")) {
            fs.writeFileSync(bundlePath + ".meta", JSON.stringify({ uuid: crypto.randomUUID() }, null, 2) + "\n", { flag: "wx" });
        }
        console.log(`[LoomSDK] ${created ? "Generated" : "Preserved"}: ${output}`);
        return { created, output };
    }
}
