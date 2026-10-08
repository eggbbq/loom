import { CONFIG_PATH } from "./address-mapping";

const texts = gui.Translations.create("loom.addressMapping", "en")
    .setContent("en", { update: "Address Mapping: Update", config: "Address Mapping: Configuration" })
    .setContent("zh-CN", { update: "资源地址映射：更新", config: "资源地址映射：配置" });

/** UI 进程只注册菜单并转发编辑器配置事件，生成始终在 Scene 进程执行。 */
@IEditor.regClass()
export class LoomAddressMappingEditor {
    @IEditor.onLoad
    static onLoad(): void { Editor.assetDb.onAssetChanged.add(LoomAddressMappingEditor.onAssetChanged, LoomAddressMappingEditor); }

    @IEditor.onUnload
    static onUnload(): void { Editor.assetDb.onAssetChanged.remove(LoomAddressMappingEditor.onAssetChanged, LoomAddressMappingEditor); }

    private static onAssetChanged(_id: string, file: string): void {
        if (file === CONFIG_PATH || file === `assets/${CONFIG_PATH}`) {
            void Editor.scene.runScript("LoomAddressMappingPlugin.reloadConfig").catch(error => console.error("[AddressMapping]", error));
        }
    }

    @IEditor.menu("App/tool/loom.addressMapping.update", { label: "i18n:loom.addressMapping:update" })
    static async update(): Promise<void> {
        await Editor.scene.runScript("LoomAddressMappingPlugin.runNow");
        Editor.showToast(texts.t("update"), "info");
    }

    @IEditor.menu("App/tool/loom.addressMapping.config", { label: "i18n:loom.addressMapping:config" })
    static async openConfig(): Promise<void> {
        await Editor.scene.runScript("LoomAddressMappingPlugin.reloadConfig");
        Editor.openFile(CONFIG_PATH);
    }
}
