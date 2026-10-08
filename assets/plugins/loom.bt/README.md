# loom.bt

独立 LayaAir 3.4.1 插件；保留原行为树节点、组件 UUID 和算法语义。通过包入口导入，或使用 `loom.bt.BTBuilder`、`loom.bt.BTRunner`、`loom.bt.BTStatus` 等公开 API。无需其他插件；安装不生成项目配置。注册入口自动挂载，构建插件保证全局调用进入 Web 发布。

构建 `./build.sh loom.bt`，安装验证 `npm run verify:bt`。

# 轻量行为树

这是一个面向 Laya 游戏角色的轻量代码式行为树。

- 不依赖图形编辑器。
- 不依赖 JSON 配置。
- 不使用泛型。
- Context 通过节点属性传递。
- 支持顺序、选择、并行、条件、动作和等待节点。

## 基本概念

每个节点每次执行都会返回一个 `BTStatus`：

```ts
export enum BTStatus {
    Success, // 执行成功
    Failure, // 执行失败
    Running, // 尚未完成，下次继续执行
}
```

行为树通过 `BTRunner.tick(deltaTime)` 更新，`deltaTime` 的单位为秒。

## 最小示例

下面的角色会优先攻击敌人，没有敌人时巡逻：

```ts
import {
    BTBuilder,
    BTRunner,
    BTStatus,
} from "~/packages/loom.bt";

interface EnemyAIContext {
    enemy: Laya.Sprite3D | null;
    attack(enemy: Laya.Sprite3D): void;
    patrol(): void;
}

const context: EnemyAIContext = {
    enemy: null,
    attack(enemy) {
        console.log("attack", enemy.name);
    },
    patrol() {
        console.log("patrol");
    },
};

const bt = new BTBuilder();

const root = bt.selector(
    bt.sequence(
        bt.condition((ctx: EnemyAIContext) => !!ctx.enemy),
        bt.action((ctx: EnemyAIContext) => {
            const enemy = ctx.enemy;
            if (!enemy) return BTStatus.Failure;

            ctx.attack(enemy);
            return BTStatus.Running;
        }),
    ),
    bt.action((ctx: EnemyAIContext) => {
        ctx.patrol();
        return BTStatus.Running;
    }),
);

const runner = new BTRunner(root, context);

// 在游戏更新逻辑中调用，单位为秒。
runner.tick(Laya.timer.delta / 1000);
```

## 在 Laya 组件中使用

通常只需要继承 `BTComponent`，创建 Context 和根节点：

```ts
import {
    BTBuilder,
    BTComponent,
    BTNode,
    BTStatus,
} from "~/packages/loom.bt";

const { regClass, property } = Laya;

interface CharacterBTContext {
    actor: CharacterComponent;
    enemy: Laya.Sprite3D | null;
}

@regClass()
export class CharacterBTComponent extends BTComponent {
    @property(CharacterComponent)
    actor: CharacterComponent | null = null;

    declare protected context: CharacterBTContext;

    protected createBTContext(): CharacterBTContext {
        return {
            actor: this.actor,
            enemy: null,
        };
    }

    protected createBTRoot(): BTNode {
        const bt = new BTBuilder();

        return bt.selector(
            this.createAttackBranch(bt),
            this.createChaseBranch(bt),
            this.createPatrolBranch(bt),
        );
    }

    private createAttackBranch(bt: BTBuilder): BTNode {
        return bt.sequence(
            bt.condition(() => {
                const { actor, enemy } = this.context;
                return !!enemy && actor.inAttackRange(enemy);
            }),
            bt.action(() => {
                const { actor, enemy } = this.context;
                if (!enemy || !actor.inAttackRange(enemy)) {
                    return BTStatus.Failure;
                }

                actor.attack(enemy);
                return BTStatus.Running;
            }),
        );
    }

    private createChaseBranch(bt: BTBuilder): BTNode {
        return bt.sequence(
            bt.condition(() => !!this.context.enemy),
            bt.action({
                enter: () => {
                    const enemy = this.context.enemy;
                    if (enemy) this.context.actor.moveTo(enemy);
                },
                update: () => {
                    if (!this.context.enemy) {
                        return BTStatus.Failure;
                    }

                    return this.context.actor.isMoving
                        ? BTStatus.Running
                        : BTStatus.Success;
                },
                abort: () => {
                    this.context.actor.stopMoving();
                },
            }),
        );
    }

    private createPatrolBranch(bt: BTBuilder): BTNode {
        return bt.action(() => {
            this.context.actor.patrol();
            return BTStatus.Running;
        });
    }
}
```

`BTComponent` 默认每 `0.1` 秒执行一次行为树决策：

```ts
this.btTickInterval = 0.1; // 每秒执行约 10 次
this.btTickInterval = 0;   // 每帧执行
```

可以手动控制行为树：

```ts
this.btStart(); // 开始更新
this.btStop();  // 停止并重置
this.btReset(); // 重置所有运行中的节点
```

组件禁用或销毁时会自动重置行为树。

## Context 类型

框架中的 `context` 基础类型为 `any`，因此不需要为整棵行为树添加泛型。

组件子类可以使用 `declare` 重新绑定类型：

```ts
interface WorkerBTContext {
    worker: WorkerComponent;
    target: Laya.Sprite3D | null;
}

class WorkerBTComponent extends BTComponent {
    declare protected context: WorkerBTContext;

    protected createBTContext(): WorkerBTContext {
        return {
            worker: this.owner.getComponent(WorkerComponent),
            target: null,
        };
    }

    protected createBTRoot(): BTNode {
        const bt = new BTBuilder();
        return bt.condition(() => this.context.target !== null);
    }
}
```

自定义节点也可以重新声明 Context 类型：

```ts
class BTWorkerMove extends BTNode {
    declare context: WorkerBTContext;

    protected onTick(deltaTime: number): BTStatus {
        const { worker, target } = this.context;
        if (!target) return BTStatus.Failure;

        worker.moveTo(target, deltaTime);
        return worker.arrived ? BTStatus.Success : BTStatus.Running;
    }
}
```

## BTSelector 选择节点

`BTSelector` 从上到下执行子节点：

- 遇到 `Success` 时返回成功。
- 遇到 `Running` 时保持运行。
- 遇到 `Failure` 时尝试下一个节点。

```ts
const root = bt.selector(
    attackBranch, // 最高优先级
    chaseBranch,
    patrolBranch, // 最低优先级
);
```

选择节点每次 tick 都从第一个子节点开始检查。高优先级节点变为可运行时，会重置并中断之前运行的低优先级节点。

## BTSequence 顺序节点

`BTSequence` 按顺序执行子节点：

- 子节点成功后继续执行下一个节点。
- 子节点失败时立即返回失败。
- 子节点运行中时，下次从该节点继续。
- 所有子节点成功时返回成功。

```ts
const harvest = bt.sequence(
    bt.condition(() => this.context.worker.hasTarget),
    bt.action(() => this.context.worker.moveToTarget()),
    bt.action(() => this.context.worker.harvest()),
);
```

顺序节点会记住正在运行的子节点，不会每次重新执行前面的条件。因此长时间运行的 Action 应自行检查目标是否仍然有效：

```ts
bt.action(() => {
    if (!this.context.target) return BTStatus.Failure;
    return this.context.worker.updateMovement();
});
```

## BTCondition 条件节点

条件成立返回 `Success`，否则返回 `Failure`：

```ts
const hasEnemy = bt.condition(() => !!this.context.enemy);

const lowHealth = bt.condition(() => {
    return this.context.actor.hp < this.context.actor.maxHp * 0.3;
});
```

条件节点应该只负责判断，不要在条件中执行移动、攻击等行为。

## BTAction 动作节点

简单动作可以直接传入函数：

```ts
const playIdle = bt.action(() => {
    this.context.actor.playAnimation("idle");
    return BTStatus.Running;
});
```

动作返回值支持：

- `BTStatus.Running`：动作尚未完成。
- `BTStatus.Success`：动作成功完成。
- `BTStatus.Failure`：动作失败。
- `true`：等同于 `Success`。
- `false`：等同于 `Failure`。
- 不返回值：等同于 `Success`。

需要生命周期时使用配置对象：

```ts
const moveToEnemy = bt.action({
    enter: (ctx: CharacterBTContext) => {
        if (ctx.enemy) ctx.actor.moveTo(ctx.enemy);
    },
    update: (ctx: CharacterBTContext, deltaTime) => {
        if (!ctx.enemy) return BTStatus.Failure;

        ctx.actor.updateMovement(deltaTime);
        return ctx.actor.isMoving
            ? BTStatus.Running
            : BTStatus.Success;
    },
    exit: (ctx: CharacterBTContext, status) => {
        console.log("move finished", status);
    },
    abort: (ctx: CharacterBTContext) => {
        ctx.actor.stopMoving();
    },
});
```

生命周期顺序：

```text
enter -> update -> update -> ... -> exit
```

节点被高优先级分支抢占或行为树被重置时调用 `abort`，不会调用 `exit`。

## BTWait 等待节点

等待时间的单位为秒：

```ts
const attackLoop = bt.sequence(
    bt.action(() => this.context.actor.attack()),
    bt.wait(0.5),
);
```

`BTWait` 在等待结束前返回 `Running`，时间到达后返回 `Success`。

## BTParallel 并行节点

并行节点会在同一次 tick 中更新所有仍在运行的子节点。

### 全部成功

```ts
const moveAndPlayAnimation = bt.parallel(
    BTParallelMode.All,
    moveNode,
    animationNode,
);
```

`BTParallelMode.All`：

- 所有子节点成功时返回 `Success`。
- 任一子节点失败时返回 `Failure`。
- 其他情况返回 `Running`。

`All` 是默认模式，因此也可以这样写：

```ts
const parallel = bt.parallel(moveNode, animationNode);
```

### 任一成功

```ts
const race = bt.parallel(
    BTParallelMode.Any,
    findTargetNode,
    timeoutNode,
);
```

`BTParallelMode.Any`：

- 任一子节点成功时返回 `Success`。
- 所有子节点失败时返回 `Failure`。
- 其他情况返回 `Running`。

并行节点结束时，会自动重置仍在运行的子节点，并触发这些节点的 `abort`。

## 不使用 BTComponent

如果不需要 Laya 驱动组件，可以直接持有 `BTRunner`：

```ts
class EnemyAI {
    private readonly context: EnemyAIContext;
    private readonly runner: BTRunner;

    constructor(context: EnemyAIContext) {
        this.context = context;

        const bt = new BTBuilder();
        const root = bt.action((ctx: EnemyAIContext) => {
            ctx.patrol();
            return BTStatus.Running;
        });

        this.runner = new BTRunner(root, context);
    }

    update(deltaTime: number): void {
        this.runner.tick(deltaTime);
    }

    destroy(): void {
        this.runner.reset();
    }
}
```

## 使用约定

1. 每个角色创建自己的节点实例，不要在多个角色之间共享同一棵行为树。
2. 子节点按照传入顺序确定优先级。
3. 长时间运行的 Action 应在目标失效时返回 `Failure`。
4. 移动、动画、计时器等需要清理的 Action 应实现 `abort`。
5. Context 中保存角色组件和共享状态，不要在节点之间互相引用。
6. 行为树负责决策；移动、动画和攻击的具体实现仍放在对应角色组件中。
