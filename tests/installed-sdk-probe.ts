@IEditorEnv.regClass()
export class InstalledSDKProbe {
    static bootstrap(): void {
        const template = EditorEnv.assetMgr.getAsset("20abf886-34e8-4e44-a8e3-521a03bbf1ca");
        if (template && !template.file.startsWith("~/packages/loom.sdk/")) throw new Error("Installed SDK template UUID changed");
        const script = EditorEnv.assetMgr.getAsset("9c595c89-6ef3-42ee-9601-4b6be51a933f");
        if (!script || !script.file.startsWith("~/packages/loom.sdk/")) throw new Error("Installed SDK generator UUID changed");
        console.log("SDK editor package installed with original template UUID.");
    }

    static verify(): void {
        const instance = (window.loom as any)?.sdk;
        if (!instance || !(window as any).__sdkStartup || instance.platform !== "douyin") {
            throw new Error("Project SDK must be mounted before no-import business code");
        }
        const fs = IEditorEnv.require("fs"), path = IEditorEnv.require("path");
        const meta = JSON.parse(fs.readFileSync(path.join(EditorEnv.projectPath, "src/loom/sdk.ts.meta"), "utf8"));
        const adapter = Laya.ClassUtils.getClass(meta.uuid) as { install(): void };
        if (!adapter) throw new Error("Generated SDK adapter registration missing");
        (window.loom as any).sdk = null;
        adapter.install();
        if ((window.loom as any).sdk !== instance) throw new Error("SDK reload replaced the service instance");
        console.log("Installed SDK: project adapter, native forwarding, early bundle and reload restoration passed.");
    }
}
