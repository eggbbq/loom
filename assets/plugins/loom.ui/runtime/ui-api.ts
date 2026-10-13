export * from "./ui-close-button";
export * from "./ui-const";
export * from "./ui-dialog-manager";
export * from "./ui-frame";
export * from "./ui-manager";
export * from "./ui-panel";
export { UISoundIgnore } from "./ui-sound-ignore";
export * from "./ui-tips-manager";
export * from "./ui-tooltips-manager";
export * from "./ui-types";
export * from "./ui-utils";

import { UIDialogManager } from "./ui-dialog-manager";
import { UIManager } from "./ui-manager";
import { UITipsManager } from "./ui-tips-manager";
import { UIToolTipsManager } from "./ui-tooltips-manager";

export const ui = UIManager.inst;
export const dialog = UIDialogManager.inst;
export const tips = UITipsManager.inst;
export const tooltips = UIToolTipsManager.inst;
