import { BTNode } from "./bt-node";
import { BTStatus } from "./bt-status";

export enum BTParallelMode {
    All,
    Any,
}

export class BTParallel extends BTNode {
    private readonly _statuses: Array<BTStatus | null>;

    constructor(
        readonly children: readonly BTNode[],
        readonly mode = BTParallelMode.All,
    ) {
        super();
        this._statuses = new Array(children.length).fill(null);
    }

    protected onEnter(): void {
        this._statuses.fill(null);
    }

    protected onTick(deltaTime: number): BTStatus {
        if (this.children.length === 0) {
            return this.mode === BTParallelMode.All ? BTStatus.Success : BTStatus.Failure;
        }

        let successCount = 0;
        let failureCount = 0;

        for (let index = 0; index < this.children.length; index++) {
            let status = this._statuses[index];
            if (status === null || status === BTStatus.Running) {
                const child = this.children[index];
                child.context = this.context;
                status = child.tick(deltaTime);
                this._statuses[index] = status;
            }

            if (status === BTStatus.Success) successCount++;
            if (status === BTStatus.Failure) failureCount++;
        }

        if (this.mode === BTParallelMode.Any) {
            if (successCount > 0) return BTStatus.Success;
            if (failureCount === this.children.length) return BTStatus.Failure;
            return BTStatus.Running;
        }

        if (failureCount > 0) return BTStatus.Failure;
        if (successCount === this.children.length) return BTStatus.Success;
        return BTStatus.Running;
    }

    protected onExit(_status: BTStatus): void {
        this.resetChildren();
    }

    protected onReset(): void {
        this.resetChildren();
    }

    private resetChildren(): void {
        for (const child of this.children) {
            child.context = this.context;
            child.reset();
        }
        this._statuses.fill(null);
    }
}
