let _textMap: Record<string, string> = Object.create(null);
export const i18n = {
    get lang(): string {
        return Laya.LocalStorage.getItem("i18n.lang") ?? "en";
    },

    set lang(value: string) {
        Laya.LocalStorage.setItem("i18n.lang", value);
    },

    /** 复制并替换当前字典；语言对象通过 translate() 手动刷新。 */
    settext(textMap: Record<string, string>): void {
        _textMap = Object.assign(Object.create(null), textMap);
    },

    /** 未配置或为空的译文沿用原行为，返回键名。 */
    gettext(key: string): string {
        return _textMap[key] || key;
    },
};
