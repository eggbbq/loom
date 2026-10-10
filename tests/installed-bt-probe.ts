import { BTBuilder, BTRunner, BTStatus, BTParallelMode, BTComponent, BTNode } from "~/packages/loom.bt";

function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

@IEditorEnv.regClass()
export class InstalledBTProbe {
    static verify(): void {
        check(loom.BTBuilder === BTBuilder && loom.BTComponent === BTComponent, "Package/global class identity differs");
        const bt = new BTBuilder();
        let done = 0, aborts = 0;
        const runner = new BTRunner(bt.sequence(bt.wait(0.2), bt.action(ctx => { ctx.done++; })), { done: 0 });
        check(runner.tick(0.1) === BTStatus.Running, "Wait finished early");
        check(runner.tick(0.1) === BTStatus.Success && runner.context.done === 1, "Sequence/context failed");
        runner.reset();
        check(runner.status === null && runner.tick(0.05) === BTStatus.Running, "Reset did not restart wait");
        const context = { priority: false };
        const selector = new BTRunner(bt.selector(bt.condition(ctx => ctx.priority), bt.action({
            update: () => BTStatus.Running, abort: () => aborts++,
        })), context);
        check(selector.tick(0) === BTStatus.Running, "Selector did not choose fallback");
        context.priority = true;
        check(selector.tick(0) === BTStatus.Success && aborts === 1, "Preemption failed to abort running action");
        const race = new BTRunner(bt.parallel(BTParallelMode.Any, bt.action(() => true), bt.action({
            update: () => BTStatus.Running, abort: () => aborts++,
        })), {});
        check(race.tick(0) === BTStatus.Success && aborts === 2, "Parallel completion did not abort pending branch");
        class ProbeComponent extends BTComponent {
            protected createBTContext() { return {}; }
            protected createBTRoot(): BTNode { return bt.action({ update: () => { done++; return BTStatus.Running; }, abort: () => aborts++ }); }
        }
        const owner = new Laya.Sprite3D();
        const component = owner.addComponent(ProbeComponent);
        component.onAwake();
        check(component.btTick(0.1) === BTStatus.Running && done === 1, "Native component did not drive runner");
        component.btStop();
        check(!component.btRunning && component.btStatus === null && aborts === 3, "Component stop/reset failed");
        owner.destroy();
        console.log("Installed BT: all public classes, native component, waits, context, reset, selector preemption and parallel abort passed.");
    }
}
