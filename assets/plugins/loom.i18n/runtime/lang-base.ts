import type { ITranslate } from "./types";
import { i18n } from "./i18n-service";

/** 子类的可枚举字符串字段名就是翻译键；不枚举方法和内部缓存。 */
export class LangBase implements ITranslate {
    translate(): void {
        for (const key of Object.keys(this)) {
            if (typeof (this as any)[key] === "string") {
                (this as any)[key] = i18n.gettext(key);
            }
        }
    }
}
