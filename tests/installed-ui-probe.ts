import { UIManager, UIFrame, UIPanel, UISoundIgnore, UILife, UINavMode, UILayer, UIAnimtion, UITipsManager, UIToolTipsManager, findUIEntityInParent } from "~/packages/loom.ui";

function check(value: unknown, message: string): asserts value {
    if (!value) throw new Error(message);
}

@IEditorEnv.regClass()
export class InstalledUIProbe {
    static async verify(): Promise<void> {
        check(loom.ui === UIManager.inst && loom.UIManager === UIManager && loom.UIPanel === UIPanel,
            "Package class or singleton differs from global API");
        check(UILayer.Panel === "panel" && UIAnimtion.None === 0, "Package barrel omitted enums");
        const ui = loom.ui;
        const load = Laya.loader.load;
        const playSound = Laya.SoundManager.playSound;
        const previousDefault = ui.defaultButtonSound;
        const sounds: string[] = [];
        Laya.SoundManager.playSound = ((url: string) => {
            sounds.push(url);
            return { volume: 1 };
        }) as typeof playSound;
        ui.defaultButtonSound = "default-click.wav";
        // 原生节点、组件及事件；加载使用受控 prefab 工厂，避免测试依赖业务资源。
        const prefabs = new Map<string, Laya.PrefabImpl>();
        for (const [address, life, nav] of [
            ["a", UILife.Scene, UINavMode.Default], ["b", UILife.Persistent, UINavMode.HideOther],
            ["ignore", UILife.Scene, UINavMode.Ignore], ["temp", UILife.Temp, UINavMode.Default],
        ] as const) {
            const prefab = new Laya.PrefabImpl({ collectResourceLinks: () => [], parse: () => {
                const node = new Laya.GWidget();
                node.active = false;
                node.name = address;
                const panel = node.addComponent(UIPanel);
                panel.life = life; panel.nav = nav; panel.anim = UIAnimtion.None;
                if (address === "a") {
                    for (const name of ["default", "native", "custom", "muted", "ignored-default"]) {
                        const button = new Laya.GButton();
                        button.name = name;
                        node.addChild(button);
                        if (name === "native" || name === "muted") button.sound = "native-click.wav";
                        if (name === "custom") button.sound = "custom-click.wav";
                        if (name === "muted" || name === "ignored-default") button.addComponent(UISoundIgnore);
                        button.onClick(() => {});
                    }
                }
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
            check(loom.UISoundIgnore === UISoundIgnore, "Package omitted sound ignore marker");
            const button = (name: string) => a.getChildByName(name) as Laya.GButton;
            check(button("default").sound === "default-click.wav", "Unconfigured button did not inherit default");
            check(button("native").sound === "native-click.wav", "Native sound was overwritten");
            check(button("custom").sound === "custom-click.wav", "Custom native sound was overwritten");
            check(!button("muted").sound && !button("ignored-default").sound, "Ignore marker did not mute native/default sound");
            for (const name of ["default", "native", "custom", "muted", "ignored-default"]) button(name).fireClick();
            check(sounds.join(",") === "default-click.wav,native-click.wav,custom-click.wav", "Native click played wrong or duplicate sound");
            button("custom").addComponent(UISoundIgnore);
            button("custom").onClick(() => {});
            button("custom").fireClick();
            check(sounds.length === 3, "Adding ignore marker at runtime did not mute");
            ui.defaultButtonSound = "next-default.wav";
            check(button("default").sound === "default-click.wav", "Changing default must not traverse existing buttons");
            for (const name of ["default", "native", "custom", "muted", "ignored-default"]) button(name).onClick(() => {});
            check(button("default").sound === "default-click.wav" && button("native").sound === "native-click.wav"
                && !button("custom").sound && !button("muted").sound && !button("ignored-default").sound,
                "Re-registering lost sound priority");
            await new Promise<void>(resolve => Laya.timer.frameOnce(1, null, resolve));
            const dynamic = new Laya.GButton();
            dynamic.name = "dynamic";
            a.addChild(dynamic);
            dynamic.onClick(() => {});
            check(await ui.open("a", { n: 2 }, false) === a && a.data.n === 2, "Cache reuse/refresh failed");
            check(dynamic.sound === "next-default.wav" && !button("muted").sound, "Delayed onClick registration missed default or lost mute");
            const plain = new Laya.GButton();
            a.addChild(plain);
            plain.on(Laya.Event.CLICK, null, () => {});
            check(!plain.sound, "Direct on(CLICK) must remain outside onClick hook");
            const caller = { count: 0, value: "" };
            function listener(this: typeof caller, value: string) { this.count++; this.value = value; }
            dynamic.onClick(caller, listener, ["preserved"]);
            const count = sounds.length;
            dynamic.fireClick();
            check(sounds.length === count + 1 && sounds[sounds.length - 1] === "next-default.wav"
                && caller.count === 1 && caller.value === "preserved", "Hook duplicated sound or broke caller/args");
            dynamic.offClick(caller, listener);
            dynamic.fireClick();
            check(caller.count === 1, "offClick could not remove original listener");
            let singleCalls = 0;
            const single = () => singleCalls++;
            dynamic.onClick(single);
            dynamic.fireClick();
            dynamic.offClick(single);
            dynamic.fireClick();
            check(singleCalls === 1, "Single-argument onClick/offClick semantics changed");
            button("native").sound = "runtime-click.wav";
            button("native").onClick(() => {});
            check(button("native").sound === "runtime-click.wav", "Explicit runtime native sound lost");
            const ignore = await ui.open("ignore", null, false);
            const b = await ui.open("b", null, false);
            check(!a.active && ignore.active && b.active, "HideOther/Ignore navigation failed");
            await ui.close(b, false);
            check(a.active, "Closing navigation did not restore underlying panel");
            const temp = await ui.open("temp", null, false);
            await ui.close(temp.getComponent(UIPanel), false);
            check(temp.destroyed, "Temp lifecycle did not destroy owner");
            await ui.closeAll();
            ui.defaultButtonSound = "cached-default.wav";
            button("default").onClick(() => {});
            check(button("default").sound === "default-click.wav" && !button("muted").sound,
                "Re-registering cached button lost priority or mute");
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
            console.log("Installed UI: onClick hook/default/ignore/native clicks, native widgets/components, package exports, panel cache, navigation, lifetimes, tips and tooltip reuse passed.");
        } finally {
            Laya.loader.load = load;
            Laya.SoundManager.playSound = playSound;
            ui.defaultButtonSound = previousDefault;
            await ui.closeAll();
            UIFrame.inst.owner.destroy();
        }
    }
}
