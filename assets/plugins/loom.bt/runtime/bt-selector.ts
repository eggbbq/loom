import { BTNode } from "./bt-node";
import { BTStatus } from "./bt-status";

export class BTSelector extends BTNode {
    private _runningIndex = -1;

    constructor(readonly children: readonly BTNode[]) {
        super();
    }

    protected onTick(deltaTime: number): BTStatus {
        for (let index = 0; index < this.children.length; index++) {
            const child = this.children[index];
            child.context = this.context;
            const status = child.tick(deltaTime);
            if (status === BTStatus.Failure) continue;

            if (this._runningIndex >= 0 && this._runningIndex !== index) {
                const runningChild = this.children[this._runningIndex];
                runningChild.context = this.context;
                runningChild.reset();
            }

            this._runningIndex = status === BTStatus.Running ? index : -1;
            return status;
        }

        this._runningIndex = -1;
        return BTStatus.Failure;
    }

    protected onReset(): void {
        for (const child of this.children) {
            child.context = this.context;
            child.reset();
        }
        this._runningIndex = -1;
    }
}
