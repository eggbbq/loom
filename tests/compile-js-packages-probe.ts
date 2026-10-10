@IEditorEnv.regClass()
export class CompileJSPackagesProbe {
    static verify(): void {
        const members = { core: "ModuleBase", address: "address", bt: "BTBuilder", i18n: "i18n", ui: "ui", pathfinding: "AStarGrid", report: "report" };
        for (const [name, member] of Object.entries(members)) {
            if (!(window.loom as any)?.[member]) throw new Error(`Source package ${name} was not loaded`);
        }
        console.log("Official package JS compilation completed.");
    }
}
