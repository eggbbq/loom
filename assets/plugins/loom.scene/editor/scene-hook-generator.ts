const HOOK_OUTPUT = "src/loom/scene/scene-hook.ts";
const HOOK_TEMPLATE_ID = "358064e9-7050-4fa1-9219-7dafa483d020";
const GENERATOR_ID = "23b09a8a-d8e4-49b9-b7cb-9a359fdefa5a";

/** Scene 进程：生成可自行修改的项目钩子，不等待资源导入。 */
@IEditorEnv.regClass()
export class LoomSceneHookGenerator {
    @IEditorEnv.onLoad
    static onLoad(): void {
        try { LoomSceneHookGenerator.generate(); }
        catch (error) { console.error("[LoomScene]", error); }
    }

    private static templatePath(): string {
        const path = IEditorEnv.require("path");
        const template = EditorEnv.assetMgr.getAsset(HOOK_TEMPLATE_ID);
        if (template) return EditorEnv.assetMgr.getFullPath(template);
        const script = EditorEnv.assetMgr.getAsset(GENERATOR_ID);
        if (!script) throw new Error("[LoomScene] Missing hook template");
        return path.join(path.dirname(path.dirname(EditorEnv.assetMgr.getFullPath(script))), "editorResources/loom.scene/scene-hook.ts.txt");
    }

    private static ensureMeta(file: string): string {
        const fs = IEditorEnv.require("fs"), crypto = IEditorEnv.require("crypto");
        if (!fs.existsSync(file + ".meta"))
            fs.writeFileSync(file + ".meta", JSON.stringify({ uuid: crypto.randomUUID() }, null, 2) + "\n", { flag: "wx" });
        const meta = JSON.parse(fs.readFileSync(file + ".meta", "utf8"));
        if (typeof meta.uuid !== "string" || !meta.uuid) throw new Error("[LoomScene] Metadata is missing its UUID");
        return meta.uuid;
    }

    static generate(): { created: boolean; output: string } {
        const fs = IEditorEnv.require("fs"), path = IEditorEnv.require("path");
        const hook = path.join(EditorEnv.projectPath, HOOK_OUTPUT);
        let ancestor = path.dirname(hook);
        while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
        const project = fs.realpathSync(EditorEnv.projectPath);
        const realAncestor = fs.realpathSync(ancestor);
        if (realAncestor !== project && !realAncestor.startsWith(project + path.sep))
            throw new Error("[LoomScene] Output escapes project");
        fs.mkdirSync(path.dirname(hook), { recursive: true });
        const created = !fs.existsSync(hook);
        if (created) fs.writeFileSync(hook, fs.readFileSync(LoomSceneHookGenerator.templatePath(), "utf8"), { flag: "wx" });
        LoomSceneHookGenerator.ensureMeta(hook);
        console.log(`[LoomScene] ${created ? "Generated" : "Preserved"}: ${HOOK_OUTPUT}`);
        return { created, output: HOOK_OUTPUT };
    }
}
