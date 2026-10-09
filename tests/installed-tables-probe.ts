@IEditorEnv.regClass()
export class InstalledTablesProbe {
    static bootstrap(): void {
        const template = EditorEnv.assetMgr.getAsset("83526996-37e1-4476-8b28-6a9db8c18bd6");
        if (!template || !template.file.startsWith("~/packages/loom.tables/")) throw new Error("Installed package template UUID changed");
        console.log("Tables package installed with original template UUID.");
    }

    static verify(): void {
        const instance = (window.loom as any)?.tables;
        if (!instance || instance.constructor.name !== "Tables" || !(window as any).__tablesStartup) {
            throw new Error("Tables must be mounted before no-import business code");
        }
        const fs = IEditorEnv.require("fs"), path = IEditorEnv.require("path");
        const meta = JSON.parse(fs.readFileSync(path.join(EditorEnv.projectPath, "src/loom/tables.ts.meta"), "utf8"));
        const adapter = Laya.ClassUtils.getClass(meta.uuid) as { install(): void };
        if (!adapter) throw new Error("Installed generated adapter registration missing");
        (window.loom as any).tables = null;
        adapter.install();
        if ((window.loom as any).tables !== instance) throw new Error("Adapter replaced the data instance");
        console.log("Installed tables: global instance, early bundle and reload restoration passed.");
    }
}
