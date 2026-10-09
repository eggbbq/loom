@IEditorEnv.regClass()
export class PackageStartupSceneProbe {
    static verify(): void {
        const startup = (window as any).__loomPackageStartup;
        if (!startup) throw new Error("Business module was not evaluated");
        console.log("PACKAGE_STARTUP_SCENE=" + JSON.stringify({ ...startup,
            packageBundles: EditorEnv.extensionManager.getPackageBundles(),
            jsPlugins: Array.from(EditorEnv.extensionManager.getJsPlugins().keys()) }));
    }
}
