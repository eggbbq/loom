import { UIManager } from "./ui-manager";
import { UIEntity } from "./ui-types";

const DEFAULT_PREFAB = "resources/ui/Dialog.lh";

export interface UIDialogData {
    text: string;
    title?: string;
    confirmText?: string;
    cancelText?: string;
}

/** 对话框根节点在 refresh() 中读取的数据；回调在打开动画期间也有效。 */
export interface UIDialogContext extends UIDialogData {
    onConfirm(): void;
    onCancel(): void;
}

/** 通过 UIManager 管理 UIPanel，只负责确认结果及同一地址的请求排队。 */
export class UIDialogManager {
    static readonly inst = new UIDialogManager();
    private static readonly queues = new Map<string, Promise<void>>();
    private _cancel: () => void;

    constructor(private readonly prefabAddress: string = DEFAULT_PREFAB) {}

    /** 确认返回 true；取消、面板关闭或打开失败返回 false。 */
    confirm(data: string | UIDialogData, tween = true): Promise<boolean> {
        const queue = UIDialogManager.queues.get(this.prefabAddress);
        const result = queue ? queue.then(() => this.show(data, tween)) : this.show(data, tween);
        const tail = result.then(() => {}, () => {});
        UIDialogManager.queues.set(this.prefabAddress, tail);
        void tail.then(() => {
            if (UIDialogManager.queues.get(this.prefabAddress) === tail) {
                UIDialogManager.queues.delete(this.prefabAddress);
            }
        });
        return result;
    }

    /** 取消本管理器当前请求（包括加载期间）；后续排队请求继续显示。 */
    close(): void {
        this._cancel?.();
    }

    private async show(data: string | UIDialogData, tween: boolean): Promise<boolean> {
        const ui = UIManager.inst;
        let entity: UIEntity;
        let settled = false;
        let onConfirm: () => void;
        let onCancel: () => void;
        const cleanup = () => {
            entity?.off("confirm", this, onConfirm);
            entity?.off("cancel", this, onCancel);
            entity?.off(Laya.Event.REMOVED, this, onCancel);
        };
        const result = new Promise<boolean>((resolve, reject) => {
            const finish = (confirmed: boolean) => {
                if (settled) return;
                settled = true;
                cleanup();
                // UIManager 统一执行动画、导航恢复和生命周期释放。
                void (async () => {
                    await ui.close(this.prefabAddress, tween);
                    await ui.waitPanelOptionComplete();
                    resolve(confirmed);
                })().catch(reject);
            };
            onConfirm = () => finish(true);
            this._cancel = onCancel = () => finish(false);
            const context: UIDialogContext = {
                ...(typeof data === "string" ? { text: data } : data),
                onConfirm,
                onCancel,
            };
            void ui.open(this.prefabAddress, context, tween).then(opened => {
                if (settled) return;
                if (!opened) {
                    settled = true;
                    resolve(false);
                    return;
                }
                entity = opened;
                entity.on("confirm", this, onConfirm);
                entity.on("cancel", this, onCancel);
                entity.on(Laya.Event.REMOVED, this, onCancel);
                if (!entity.parent || entity.destroyed) onCancel();
            }).catch(error => {
                if (settled) return;
                settled = true;
                reject(error);
            });
        });
        try { return await result; }
        finally {
            cleanup();
            this._cancel = null;
        }
    }
}
