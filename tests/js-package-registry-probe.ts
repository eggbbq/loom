@IEditorEnv.regClass()
export class JSPackageRegistryProbe {
    static verify(): void {
        const ids = [
            ["loom.bt", "3d6c8aef-7da9-4fb5-94d2-c751e7c3c3ec"],
            ["loom.core", "b1fa31d2-9dba-4522-8ac3-b972a03314b0"],
            ["loom.core", "2f4ae248-882b-43e7-a130-192648a384e4"],
            ["loom.core", "9a8881a0-dd42-4cae-98f0-3a0392f540db"],
            ["loom.pathfinding", "0e81abc2-1d66-4653-99a9-5e28ae9fcad7"],
            ["loom.pathfinding", "a63605c7-a0af-4a36-adbf-61ef6a243d2d"],
            ["loom.pathfinding", "b054411d-7930-4d79-a953-be0218017166"],
            ["loom.pathfinding", "8dde5e84-8942-42df-a107-c970186a8774"],
            ["loom.pathfinding", "193cbd3d-353d-4b73-a473-a12c384abb31"],
            ["loom.pathfinding", "64e8ca54-18f9-4afb-a3d3-08571c8ad5b8"],
            ["loom.pathfinding", "78a886bc-389d-4dd8-871a-1eae8078ea84"],
            ["loom.pathfinding", "72b77865-273b-4fbf-a7d0-b861628a0732"],
            ["loom.pathfinding", "d2eb6c74-4569-4279-8120-d6e5a59979ca"],
            ["loom.pathfinding", "ea66e0cb-f7e6-458d-9f96-5c00a98c269c"],
            ["loom.pathfinding", "c1f29d65-b0a3-414c-89b9-20cae205df2c"],
            ["loom.ui", "f532ed24-bbc8-4ba4-977f-859ace412526"],
            ["loom.ui", "32cdfef6-44bf-4a87-8225-1fb11b3c85a4"],
            ["loom.ui", "b0c345c4-9c3a-4c6a-883b-f6b19d06102f"],
            ["loom.ui", "eb88d8e2-4e80-4d1e-8b55-daf031159a76"],
        ];
        for (const [name, id] of ids) {
            if (!EditorEnv.assetMgr.getAsset("~/packages/" + name)) continue;
            const cls = Laya.ClassUtils.getClass(id);
            const asset = EditorEnv.assetMgr.getAsset(id);
            if (!cls || !asset || !asset.file.endsWith(".d.ts")) throw new Error(`Component registration lost: ${name}`);
            const descriptor = EditorEnv.typeRegistry.getTypeOfClass(cls);
            if (!descriptor || descriptor.name !== id) throw new Error(`Editor type metadata lost: ${name}`);
            const menu = "loom/" + name.slice("loom.".length);
            if (descriptor.menu !== menu) throw new Error(`Component menu lost: ${name}/${id}, expected ${menu}, got ${descriptor.menu}`);
        }
        console.log("JS registry: original component UUIDs, declaration assets, editor type metadata and component menus passed.");
    }
}
