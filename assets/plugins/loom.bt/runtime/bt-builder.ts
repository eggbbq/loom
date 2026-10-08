import { BTAction, BTActionHandler, BTActionOptions } from "./bt-action";
import { BTCondition, BTConditionPredicate } from "./bt-condition";
import { BTNode } from "./bt-node";
import { BTParallel, BTParallelMode } from "./bt-parallel";
import { BTSelector } from "./bt-selector";
import { BTSequence } from "./bt-sequence";
import { BTWait } from "./bt-wait";

export class BTBuilder {
    selector(...children: BTNode[]): BTSelector {
        return new BTSelector(children);
    }

    sequence(...children: BTNode[]): BTSequence {
        return new BTSequence(children);
    }

    parallel(...children: BTNode[]): BTParallel;
    parallel(mode: BTParallelMode, ...children: BTNode[]): BTParallel;
    parallel(
        first?: BTParallelMode | BTNode,
        ...rest: BTNode[]
    ): BTParallel {
        if (first === undefined) {
            return new BTParallel([]);
        }
        if (typeof first === "number") {
            return new BTParallel(rest, first);
        }
        return new BTParallel([first, ...rest]);
    }

    condition(predicate: BTConditionPredicate): BTCondition {
        return new BTCondition(predicate);
    }

    action(action: BTActionHandler | BTActionOptions): BTAction {
        return new BTAction(action);
    }

    wait(duration: number): BTWait {
        return new BTWait(duration);
    }
}
