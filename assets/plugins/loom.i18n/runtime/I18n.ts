import type { ITranslate } from "./types";

/** Laya 原生多语言服务；模块入口负责挂载全局 API。 */
export class I18n {
    static readonly inst = new I18n();
    private _textMap: Record<string, string> = Object.create(null);
    private _hasTextMap = false;
    private readonly _targets = new Set<ITranslate>();

    get lang(): string {
        return Laya.LocalStorage.getItem("i18n.lang") ?? "en";
    }

    set lang(value: string) {
        Laya.LocalStorage.setItem("i18n.lang", value);
    }

    /** 替换当前字典，并刷新全部已绑定的语言对象。 */
    settext(textMap: Record<string, string>): void {
        this._textMap = Object.assign(Object.create(null), textMap);
        this._hasTextMap = true;
        for (const target of this._targets) target.translate();
    }

    /** 未配置或为空的译文沿用原行为，返回键名。 */
    gettext(key: string): string {
        return this._textMap[key] || key;
    }

    /** 绑定语言对象，返回解除函数；首次设置字典前保留对象的默认文案。 */
    bind(target: ITranslate): () => void {
        this._targets.add(target);
        if (this._hasTextMap) target.translate();
        return () => { this._targets.delete(target); };
    }

    static install(): void {
        window.loom ??= {} as LoomGlobal;
        window.loom.i18n = I18n.inst;
    }
}

declare global {
    interface LoomGlobal { i18n: I18n; }
    var loom: LoomGlobal;
}
