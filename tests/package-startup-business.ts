// Deliberately no imports: this is ordinary business code evaluated at module load.
const startupNamespaces = typeof loom === "undefined" ? {} : {
    core: !!loom.ModuleBase,
    address: !!loom.address?.load,
    bt: !!loom.BTBuilder,
    i18n: !!loom.i18n?.gettext,
    ui: !!loom.ui?.open,
    pathfinding: !!loom.AStarGrid,
};
const startupErrors: string[] = [];
for (const name of ["core", "address", "bt", "i18n", "ui", "pathfinding"]) {
    if (!startupNamespaces[name as keyof typeof startupNamespaces]) startupErrors.push(`${name} unavailable at business module evaluation`);
}
try {
    const bt = new loom.BTBuilder();
    const runner = new loom.BTRunner(bt.condition(() => true), {});
    if (runner.tick(0.1) !== loom.BTStatus.Success) throw new Error("early BT execution failed");
    const grid = new loom.AStarGrid({ width: 2, height: 2, walkable: new Uint8Array(4).fill(1) });
    if (!grid.findPath({ x: 0, y: 0 }, { x: 1, y: 1 }).reachedTarget) throw new Error("early pathfinding failed");
    loom.i18n.settext({ startup: "ready" });
    if (loom.i18n.gettext("startup") !== "ready") throw new Error("early translation failed");
} catch (error) {
    startupErrors.push(String(error));
}
(window as any).__loomPackageStartup = { ready: startupErrors.length === 0, namespaces: startupNamespaces, errors: startupErrors };

@Laya.regClass()
export class PackageStartupBusiness extends Laya.Script {}
