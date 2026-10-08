import { BTNode } from "./bt-node";
import { BTStatus } from "./bt-status";

export type BTConditionPredicate = (context: any) => boolean;

export class BTCondition extends BTNode {
    constructor(private readonly _predicate: BTConditionPredicate) {
        super();
    }

    protected onTick(_deltaTime: number): BTStatus {
        return this._predicate(this.context) ? BTStatus.Success : BTStatus.Failure;
    }
}
