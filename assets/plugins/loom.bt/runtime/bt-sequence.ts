import { BTNode } from "./bt-node";
import { BTStatus } from "./bt-status";

export class BTSequence extends BTNode {
    private _currentIndex = 0;

    constructor(readonly children: readonly BTNode[]) {
        super();
    }

    protected onEnter(): void {
        this._currentIndex = 0;
    }

    protected onTick(deltaTime: number): BTStatus {
        while (this._currentIndex < this.children.length) {
            const child = this.children[this._currentIndex];
            child.context = this.context;
            const status = child.tick(deltaTime);
            if (status === BTStatus.Running) return status;

            if (status === BTStatus.Failure) {
                this._currentIndex = 0;
                return status;
            }

            this._currentIndex++;
        }

        this._currentIndex = 0;
        return BTStatus.Success;
    }

    protected onReset(): void {
        for (const child of this.children) {
            child.context = this.context;
            child.reset();
        }
        this._currentIndex = 0;
    }
}
