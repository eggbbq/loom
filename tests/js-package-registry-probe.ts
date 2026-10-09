@IEditorEnv.regClass()
export class JSPackageRegistryProbe {
    static verify(): void {
        const ids = [
            ["loom.core", "2f4ae248-882b-43e7-a130-192648a384e4"],
            ["loom.bt", "3d6c8aef-7da9-4fb5-94d2-c751e7c3c3ec"],
            ["loom.ui", "b0c345c4-9c3a-4c6a-883b-f6b19d06102f"],
        ];
        for (const [name, id] of ids) {
            if (!EditorEnv.assetMgr.getAsset("~/packages/" + name)) continue;
            const cls = Laya.ClassUtils.getClass(id);
            const asset = EditorEnv.assetMgr.getAsset(id);
            if (!cls || !asset || !asset.file.endsWith(".d.ts")) throw new Error(`Component registration lost: ${name}`);
            const descriptor = EditorEnv.typeRegistry.getTypeOfClass(cls);
            if (!descriptor || descriptor.name !== id) throw new Error(`Editor type metadata lost: ${name}`);
        }
        console.log("JS registry: original component UUIDs, declaration assets and editor type metadata passed.");
    }
}
