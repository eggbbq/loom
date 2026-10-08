import { BTNode } from "./bt-node";
import { BTStatus } from "./bt-status";

export class BTRunner {
    private _status: BTStatus | null = null;

    constructor(
        readonly root: BTNode,
        readonly context: any,
    ) { }

    get status(): BTStatus | null {
        return this._status;
    }

    tick(deltaTime: number): BTStatus {
        this.root.context = this.context;
        return this._status = this.root.tick(deltaTime);
    }

    reset(): void {
        this.root.context = this.context;
        this.root.reset();
        this._status = null;
    }
}
