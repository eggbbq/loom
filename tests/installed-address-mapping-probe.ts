import { address } from "~/packages/loom.address";

/** 只由隔离消费工程的 CLI --script-file 加载，不随插件分发。 */
@IEditorEnv.regClass()
export class InstalledAddressMappingProbe {
    static async verify(): Promise<void> {
        if (loom.address !== address) throw new Error("Package import created a second address service");
        const addresses: Record<string, string> = await loom.address.load();
        if (loom.address.data !== addresses) throw new Error("Runtime did not retain the loaded mapping");
        if (addresses.apple !== "resources/icons/apple.png" || addresses.hero !== "portraits/hero.png"
            || Object.keys(addresses).length !== 2) throw new Error("Installed runtime returned incorrect addresses");
        if (Laya.loader.getRes("resources/address.json", Laya.Loader.JSON)) throw new Error("Runtime did not release mapping JSON");
        const again = await loom.address.load("resources/address.json");
        if (again.apple !== addresses.apple) throw new Error("Repeated runtime load failed");
        console.log("Installed runtime: package import, native JSON loading, expansion and cache release passed.");
    }
}
