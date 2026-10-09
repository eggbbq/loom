@IEditorEnv.regClass()
export class CompileJSPackagesProbe {
    static verify(): void {
        for (const name of ["core", "address", "bt", "i18n", "ui", "pathfinding"]) {
            if (!(window.loom as any)?.[name]) throw new Error(`Source package ${name} was not loaded`);
        }
        console.log("Official package JS compilation completed.");
    }
}
