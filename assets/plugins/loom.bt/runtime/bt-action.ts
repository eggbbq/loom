import { BTNode } from "./bt-node";
import { BTStatus } from "./bt-status";

export type BTActionResult = BTStatus | boolean | void;
export type BTActionHandler = (context: any, deltaTime: number) => BTActionResult;

export interface BTActionOptions {
    enter?: (context: any) => void;
    update: BTActionHandler;
    exit?: (context: any, status: BTStatus) => void;
    abort?: (context: any) => void;
}

export class BTAction extends BTNode {
    private readonly _options: BTActionOptions;

    constructor(action: BTActionHandler | BTActionOptions) {
        super();
        this._options = typeof action === "function" ? { update: action } : action;
    }

    protected onEnter(): void {
        this._options.enter?.(this.context);
    }

    protected onTick(deltaTime: number): BTStatus {
        const result = this._options.update(this.context, deltaTime);
        if (result === undefined) return BTStatus.Success;
        if (typeof result === "boolean") return result ? BTStatus.Success : BTStatus.Failure;
        return result as BTStatus;
    }

    protected onExit(status: BTStatus): void {
        this._options.exit?.(this.context, status);
    }

    protected onAbort(): void {
        this._options.abort?.(this.context);
    }
}
