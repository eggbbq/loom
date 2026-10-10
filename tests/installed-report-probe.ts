import { report } from "~/packages/loom.report";

/** 仅在隔离消费工程运行，验证真实安装包。 */
@IEditorEnv.regClass()
export class InstalledReportProbe {
    static async verify(): Promise<void> {
        if (loom.report !== report) throw new Error("Global report differs from package export");
        const channels = window as unknown as Record<string, unknown>;
        const name = "__loomInstalledReportChannel";
        const payload = { event: "login" };
        const callback = () => {};
        const received: any[][] = [];
        const savedEnabled = report.enabled;
        const savedDebug = report.debug;
        try {
            report.enabled = true;
            report.debug = false;
            if (loom.report.to(name, payload) !== false) throw new Error("Missing channel was forwarded");
            channels[name] = function (...args: any[]) {
                if (this !== window) throw new Error("Window receiver lost");
                received.push(args);
            };
            if (!loom.report.to(name, "login", payload, undefined, callback)) throw new Error("Injected channel unavailable");
            if (received[0].length !== 4 || received[0][0] !== "login" || received[0][1] !== payload
                || received[0][2] !== undefined || received[0][3] !== callback) throw new Error("Argument identity/order lost");
            report.to(name);
            if (received[1].length !== 0) throw new Error("Zero arguments not preserved");
            const log = console.log;
            const logs: unknown[][] = [];
            console.log = (...args: unknown[]) => { logs.push(args); };
            try {
                loom.report.enabled = false;
                report.debug = true;
                if (report.to(name, payload) !== false || received.length !== 2 || logs.length !== 0)
                    throw new Error("Disabled service still forwarded/logged");
                report.enabled = true;
                loom.report.to(name, "debug", payload);
                if (logs.length !== 1 || logs[0][1] !== "debug" || logs[0][2] !== payload)
                    throw new Error("Debug trace lost arguments");
                loom.report.debug = false;
                report.to(name);
                if (logs.length !== 1 || received.length !== 4) throw new Error("Debug off stopped forwarding");
            } finally {
                console.log = log;
                report.enabled = true;
                report.debug = false;
            }
            let replacement = false;
            channels[name] = () => { replacement = true; };
            loom.report.to(name);
            if (!replacement) throw new Error("Adapter replacement ignored");
            channels[name] = { report: () => { throw new Error("Object channel called"); } };
            if (loom.report.to(name) !== false) throw new Error("Non-function channel accepted");
            const warnings: unknown[][] = [];
            const warn = console.warn;
            const failure = new Error("Expected installed SDK failure");
            console.warn = (...args: unknown[]) => { warnings.push(args); };
            try {
                channels[name] = () => { throw failure; };
                if (loom.report.to(name) !== false) throw new Error("Synchronous failure not contained");
                channels[name] = () => Promise.reject(failure);
                if (loom.report.to(name) !== true) throw new Error("Async forwarding return changed");
                channels[name] = () => ({ then() { throw failure; } });
                if (loom.report.to(name) !== true) throw new Error("Thenable forwarding return changed");
                await new Promise(resolve => setTimeout(resolve, 0));
                if (warnings.length !== 3 || warnings.some(args => args[1] !== failure))
                    throw new Error("Installed exception capture failed");
            } finally {
                console.warn = warn;
            }
            console.log("Installed report: shared service, enabled/debug switches, variadic forwarding, injection and sync/async exception capture passed.");
        } finally {
            report.enabled = savedEnabled;
            report.debug = savedDebug;
            delete channels[name];
        }
    }
}
