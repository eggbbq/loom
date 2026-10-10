// Deliberately no imports: this is ordinary business code evaluated at module load.
const startupNamespaces = typeof loom === "undefined" ? {} : {
    core: !!loom.ModuleBase,
    address: !!loom.address?.load,
    bt: !!loom.BTBuilder,
    i18n: !!loom.i18n?.gettext,
    ui: !!loom.ui?.open,
    pathfinding: !!loom.AStarGrid,
    sdk: !!loom.sdk?.init,
    report: typeof loom.report?.to === "function",
};
const startupErrors: string[] = [];
for (const name of ["core", "address", "bt", "i18n", "ui", "pathfinding", "sdk", "report"]) {
    if (!startupNamespaces[name as keyof typeof startupNamespaces]) startupErrors.push(`${name} unavailable at business module evaluation`);
}
try {
    const channels = window as unknown as Record<string, unknown>;
    const payload = { event: "startup" };
    const callback = () => {};
    let forwarded = false;
    channels.__loomStartupReport = (...args: any[]) => {
        if (args.length !== 4 || args[0] !== "startup" || args[1] !== payload || args[2] !== undefined
            || args[3] !== callback) throw new Error("early report argument forwarding failed");
        forwarded = true;
    };
    try {
        loom.report.enabled = false;
        if (loom.report.to("__loomStartupReport", "startup", payload, undefined, callback) !== false || forwarded)
            throw new Error("early report disabled switch ignored");
        loom.report.enabled = true;
        loom.report.debug = true;
        if (!loom.report.to("__loomStartupReport", "startup", payload, undefined, callback) || !forwarded)
            throw new Error("early report execution failed");
        loom.report.debug = false;
        channels.__loomStartupReport = () => { throw new Error("Expected startup SDK failure"); };
        if (loom.report.to("__loomStartupReport") !== false) throw new Error("early report sync failure escaped");
        channels.__loomStartupReport = () => Promise.reject(new Error("Expected startup SDK rejection"));
        if (loom.report.to("__loomStartupReport") !== true) throw new Error("early report async return changed");
    } finally {
        loom.report.enabled = true;
        loom.report.debug = false;
        delete channels.__loomStartupReport;
    }
    loom.sdk.init();
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
