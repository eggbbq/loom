const texts = gui.Translations.create("loom.sdk", "en")
    .setContent("en", { generate: "SDK: Generate Adapter", adapter: "SDK: Open Adapter", template: "SDK: Open Template", config: "SDK: Configuration", created: "SDK adapter generated", preserved: "Existing SDK adapter preserved" })
    .setContent("zh-CN", { generate: "SDK：生成适配器", adapter: "SDK：打开适配器", template: "SDK：打开模板", config: "SDK：配置", created: "已生成 SDK 适配器", preserved: "已保留现有 SDK 适配器" });

/** UI 进程：原生工具菜单；生成逻辑通过 runScript 在 Scene 运行。 */
@IEditor.regClass()
export class LoomSDKEditor {
    @IEditor.menu("App/tool/loom.sdk.generate", { label: "i18n:loom.sdk:generate" })
    static async generate(): Promise<void> {
        const result = await Editor.scene.runScript("LoomSDKPlugin.generate") as { created: boolean };
        Editor.showToast(texts.t(result.created ? "created" : "preserved"), "info");
    }

    @IEditor.menu("App/tool/loom.sdk.adapter", { label: "i18n:loom.sdk:adapter" })
    static async openAdapter(): Promise<void> {
        const result = await Editor.scene.runScript("LoomSDKPlugin.generate") as { output: string };
        Editor.openFile(IEditor.require("path").join(Editor.projectPath, result.output));
    }

    @IEditor.menu("App/tool/loom.sdk.template", { label: "i18n:loom.sdk:template" })
    static async openTemplate(): Promise<void> {
        const result = await Editor.scene.runScript("LoomSDKPlugin.ensureProjectFiles") as { template: string };
        Editor.openFile(result.template);
    }

    @IEditor.menu("App/tool/loom.sdk.config", { label: "i18n:loom.sdk:config" })
    static async openConfig(): Promise<void> {
        const result = await Editor.scene.runScript("LoomSDKPlugin.ensureProjectFiles") as { config: string };
        Editor.openFile(result.config);
    }
}
