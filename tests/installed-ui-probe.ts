import { UIManager, UIFrame, UIPanel, UILife, UINavMode, UILayer, UIAnimtion, UITipsManager, UIToolTipsManager, findUIEntityInParent } from "~/packages/loom.ui";

function check(value: unknown, message: string): asserts value {
    if (!value) throw new Error(message);
}

@IEditorEnv.regClass()
export class InstalledUIProbe {
    static async verify(): Promise<void> {
        check(loom.ui === UIManager.inst, "Package import singleton differs from global API");
        check(UILayer.Panel === "panel" && UIAnimtion.None === 0, "Package barrel omitted enums");
        const ui = loom.ui;
        const load = Laya.loader.load;
        // 原生节点、组件及事件；加载使用受控 prefab 工厂，避免测试依赖业务资源。
        const prefabs = new Map<string, Laya.PrefabImpl>();
        for (const [address, life, nav] of [
            ["a", UILife.Scene, UINavMode.Default], ["b", UILife.Persistent, UINavMode.HideOther],
            ["ignore", UILife.Scene, UINavMode.Ignore], ["temp", UILife.Temp, UINavMode.Default],
        ] as const) {
            const prefab = new Laya.PrefabImpl({ collectResourceLinks: () => [], parse: () => {
                const node = new Laya.GWidget();
                node.name = address;
                const panel = node.addComponent(UIPanel);
                panel.life = life; panel.nav = nav; panel.anim = UIAnimtion.None;
                return node;
            } } as any, {});
            prefabs.set(address, prefab);
        }
        const tipsPrefab = new Laya.PrefabImpl({ collectResourceLinks: () => [], parse: () => new Laya.GWidget() } as any, {});
        let tipsNode: Laya.GWidget;
        const create = tipsPrefab.create.bind(tipsPrefab);
        tipsPrefab.create = (...args: any[]) => tipsNode = create(...args) as Laya.GWidget;
        prefabs.set("tips", tipsPrefab);
        Laya.loader.load = (async (address: string) => prefabs.get(address) ?? null) as typeof load;
        try {
            const a = await ui.open("a", { n: 1 }, false);
            check(a && a.data.n === 1 && a.parent === UIFrame.inst.panel, "Native open/data/layer failed");
            check(findUIEntityInParent(a) === a.getComponent(UIPanel), "Package omitted helper");
            check(await ui.open("a", { n: 2 }, false) === a && a.data.n === 2, "Cache reuse/refresh failed");
            const ignore = await ui.open("ignore", null, false);
            const b = await ui.open("b", null, false);
            check(!a.active && ignore.active && b.active, "HideOther/Ignore navigation failed");
            await ui.close(b, false);
            check(a.active, "Closing navigation did not restore underlying panel");
            const temp = await ui.open("temp", null, false);
            await ui.close(temp.getComponent(UIPanel), false);
            check(temp.destroyed, "Temp lifecycle did not destroy owner");
            await ui.closeAll();
            ui.disposeOnSceneChanged();
            check(a.destroyed && ignore.destroyed && !b.destroyed, "Scene/Persistent lifecycle failed");
            check(await ui.open("b", null, false) === b, "Persistent cache lost");
            await ui.close("b", false);
            check(await ui.open("missing", null, false) === null, "Missing prefab must fail cleanly");
            const tips = new UITipsManager("tips");
            await tips.text("first");
            const first = tipsNode;
            check(first.data === "first" && (first as any)._data === "first", "Tips data protocol failed");
            first.visible = false; first.removeSelf();
            await tips.text("second");
            check(tipsNode === first && first.visible && first.data === "second", "Native REMOVED pooling/reuse failed");
            first.removeSelf();
            const tooltip = new UIToolTipsManager("tips");
            await tooltip.text({ text: "hover" });
            const hovered = tipsNode;
            await tooltip.text("again");
            check(tipsNode === hovered && hovered.data === "again", "Tooltip cache reuse failed");
            hovered.removeSelf();
            console.log("Installed UI: native widgets/components, package exports, panel cache, navigation, lifetimes, tips and tooltip reuse passed.");
        } finally { Laya.loader.load = load; await ui.closeAll(); UIFrame.inst.owner.destroy(); }
    }
}
