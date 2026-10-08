import { I18n } from "./I18n";
import type { ITranslate } from "./types";

/** 子类的可枚举字符串字段名就是翻译键；不枚举方法和内部缓存。 */
@Laya.regClass()
export class LangBase implements ITranslate {
    translate(): void {
        for (const key of Object.keys(this)) {
            if (typeof (this as any)[key] === "string") {
                (this as any)[key] = I18n.inst.gettext(key);
            }
        }
    }
}
