import { I18n, LangBase } from "~/packages/loom.i18n";

class ProbeLanguage extends LangBase {
    ok = "确定";
    cancel = "取消";
    count = 1;
}

/** 只由隔离消费工程加载，不进入插件包。 */
@IEditorEnv.regClass()
export class InstalledI18nProbe {
    static verify(): void {
        if (loom.i18n !== I18n.inst) throw new Error("Package imports created a second translation service");
        const saved = Laya.LocalStorage.getItem("i18n.lang");
        const lang = new ProbeLanguage();
        const unbind = loom.i18n.bind(lang);
        try {
            loom.i18n.lang = "zh";
            if (loom.i18n.lang !== "zh") throw new Error("Native language persistence failed");
            loom.i18n.settext({ ok: "OK", cancel: "Cancel" });
            if (lang.ok !== "OK" || lang.cancel !== "Cancel" || lang.count !== 1) throw new Error("Bound language refresh failed");
            loom.i18n.settext({ ok: "确定" });
            lang.translate(); lang.translate();
            if (lang.ok !== "确定" || lang.cancel !== "cancel") throw new Error("Repeated translation failed");
            if (loom.i18n.gettext("missing") !== "missing") throw new Error("Missing-key fallback failed");
            unbind();
            loom.i18n.settext({ ok: "Detached" });
            if (lang.ok !== "确定") throw new Error("Unbind failed");
            console.log("Installed i18n: native storage, package singleton, dictionary replacement, repeated refresh and unbind passed.");
        } finally {
            unbind();
            if (saved === null) Laya.LocalStorage.removeItem("i18n.lang");
            else Laya.LocalStorage.setItem("i18n.lang", saved);
        }
    }
}
