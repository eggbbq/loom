import { BTNode } from "./bt-node";
import { BTStatus } from "./bt-status";

export class BTWait extends BTNode {
    private _elapsed = 0;

    constructor(readonly duration: number) {
        super();
    }

    protected onEnter(): void {
        this._elapsed = 0;
    }

    protected onTick(deltaTime: number): BTStatus {
        this._elapsed += deltaTime;
        return this._elapsed >= Math.max(0, this.duration)
            ? BTStatus.Success
            : BTStatus.Running;
    }

    protected onReset(): void {
        this._elapsed = 0;
    }
}
