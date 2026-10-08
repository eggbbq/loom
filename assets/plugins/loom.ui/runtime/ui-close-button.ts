import { findUIEntityInParent } from "./ui-utils";
const { regClass, property } = Laya;

@regClass()
export class UICloseButton extends Laya.Script {
    onMouseClick(evt: Laya.Event): void {
        findUIEntityInParent(this.owner)?.close();
    }
}