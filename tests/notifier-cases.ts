export {};
declare const require: (path: string) => any;
declare const process: { exitCode?: number };
type INotifier = import("../assets/plugins/loom.core/runtime/utils/notifier").INotifier;

class TestEvent {
    static readonly EMPTY = new TestEvent();
    type = "";
    target: any = null;
    currentTarget: any = null;

    setTo(type: string, currentTarget: any, target: any): this {
        this.type = type;
        this.currentTarget = currentTarget;
        this.target = target;
        return this;
    }
}

(globalThis as any).Laya = { Event: TestEvent };

const { msg, Notifier } = require("../assets/plugins/loom.core/runtime/utils/notifier") as typeof import("../assets/plugins/loom.core/runtime/utils/notifier");

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

async function run(): Promise<void> {
    const notifier = new Notifier();
    const TestMsg = {
        Value: msg<number>("value"),
        Array: msg<[string, string]>("array"),
        Once: msg("once"),
        RemoveDuringDispatch: msg("remove-during-dispatch"),
        AddDuringDispatch: msg("add-during-dispatch"),
        Nested: msg("nested"),
        BroadcastError: msg("broadcast-error"),
        AsyncBroadcastError: msg("async-broadcast-error"),
        AsyncBroadcastFlow: msg<number>("async-broadcast-flow"),
        SyncResult: msg<number, number>("sync-result"),
        AsyncResult: msg<number, number>("async-result"),
        MissingResult: msg<null, number>("missing-result"),
        MultipleResults: msg<null, number>("multiple-results"),
        ResultErrors: msg<null, unknown>("result-errors"),
        Empty: msg<TestEvent>("empty"),
    } as const;

    if (false) {
        // @ts-expect-error typed messages reject incompatible data.
        notifier.event(TestMsg.Value, "wrong");
        // @ts-expect-error result types are inferred from the message token.
        const wrongResult: string = await notifier.request(TestMsg.SyncResult, 1);
        void wrongResult;
        // @ts-expect-error broadcast messages cannot be used as requests.
        await notifier.request(TestMsg.Value, 1);
        // @ts-expect-error result mode is exposed through request(), not event().
        notifier.event(TestMsg.SyncResult, 1, true);
        // @ts-expect-error token listeners receive the token's data type.
        notifier.on(TestMsg.SyncResult, (value: string) => value.length);
        // @ts-expect-error token listeners must return the token's result type.
        notifier.once(TestMsg.SyncResult, (value: number) => String(value));
        // @ts-expect-error off() checks the listener against the token contract.
        notifier.off(TestMsg.SyncResult, (value: string) => Number(value));
    }

    const compatible: INotifier = notifier;
    void compatible;
    const calls: string[] = [];
    const caller = { name: "caller" };

    function listener(this: typeof caller, prefix: string, value: number): void {
        assert(this === caller, "caller should be preserved");
        calls.push(`${prefix}:${value}`);
    }

    assert(notifier.on(TestMsg.Value, caller, listener, ["fixed"]) === notifier, "on should return the notifier");
    assert(notifier.hasListener(TestMsg.Value), "hasListener should detect registered listeners");
    notifier.event(TestMsg.Value, 1);
    assert(calls.join(",") === "fixed:1", "fixed arguments should precede event arguments");

    notifier.on(TestMsg.Value, caller, listener, ["updated"]);
    notifier.event(TestMsg.Value, 2);
    assert(calls.join(",") === "fixed:1,updated:2", "duplicate registration should update instead of append");

    let plainStringValue = 0;
    notifier.on("plain-string", (value: number) => { plainStringValue = value; });
    notifier.event("plain-string", 3);
    assert(plainStringValue === 3, "plain string events should dispatch their data");

    let arrayArgs = "";
    notifier.on(TestMsg.Array, (left: string, right: string) => { arrayArgs = `${left}:${right}`; });
    notifier.event(TestMsg.Array, ["left", "right"]);
    assert(arrayArgs === "left:right", "array event data should be spread across listener arguments");

    let onceCount = 0;
    notifier.once(TestMsg.Once, () => onceCount++);
    notifier.event(TestMsg.Once);
    notifier.event(TestMsg.Once);
    assert(onceCount === 1 && !notifier.hasListener(TestMsg.Once), "once should remove the listener after dispatch");

    const removedCalls: string[] = [];
    const second = () => removedCalls.push("second");
    notifier.on(TestMsg.RemoveDuringDispatch, () => {
        removedCalls.push("first");
        notifier.off(TestMsg.RemoveDuringDispatch, second);
    });
    notifier.on(TestMsg.RemoveDuringDispatch, second);
    notifier.event(TestMsg.RemoveDuringDispatch);
    assert(removedCalls.join(",") === "first", "listeners removed during dispatch should not run later in the same dispatch");

    const addedCalls: string[] = [];
    const added = () => addedCalls.push("added");
    notifier.once(TestMsg.AddDuringDispatch, () => {
        addedCalls.push("first");
        notifier.on(TestMsg.AddDuringDispatch, added);
    });
    notifier.event(TestMsg.AddDuringDispatch);
    assert(addedCalls.join(",") === "first", "listeners added during dispatch should wait until the next dispatch");
    notifier.event(TestMsg.AddDuringDispatch);
    assert(addedCalls.join(",") === "first,added", "listeners added during dispatch should remain registered");

    let nestedCount = 0;
    notifier.on(TestMsg.Nested, () => {
        nestedCount++;
        notifier.event(TestMsg.Nested);
    });
    notifier.event(TestMsg.Nested);
    assert(nestedCount === 1, "reentrant dispatch of the same type should be ignored like EventDispatcher");

    const originalConsoleError = console.error;
    const reportedErrors: unknown[][] = [];
    console.error = (...args: unknown[]) => { reportedErrors.push(args); };
    try {
        let continuedAfterError = false;
        notifier.once(TestMsg.BroadcastError, () => { throw new Error("sync failure"); });
        notifier.on(TestMsg.BroadcastError, () => { continuedAfterError = true; });
        notifier.event(TestMsg.BroadcastError);
        assert(continuedAfterError, "a failing broadcast listener should not stop later listeners");

        notifier.once(TestMsg.AsyncBroadcastError, async () => { throw new Error("async failure"); });
        notifier.event(TestMsg.AsyncBroadcastError);
        await Promise.resolve();
        await Promise.resolve();
        assert(reportedErrors.length === 2, "synchronous and asynchronous broadcast failures should both be reported");
        assert(reportedErrors.every(args => String(args[0]).includes("Notifier")), "reported errors should include Notifier context");
    } finally {
        console.error = originalConsoleError;
    }

    const asyncBroadcastCalls: string[] = [];
    let releaseFirstBroadcast!: () => void;
    const firstBroadcastPending = new Promise<void>(resolve => { releaseFirstBroadcast = resolve; });
    notifier.on(TestMsg.AsyncBroadcastFlow, async value => {
        asyncBroadcastCalls.push(`async:${value}:start`);
        if (value === 1) await firstBroadcastPending;
        asyncBroadcastCalls.push(`async:${value}:end`);
    });
    notifier.on(TestMsg.AsyncBroadcastFlow, value => { asyncBroadcastCalls.push(`sync:${value}`); });
    notifier.event(TestMsg.AsyncBroadcastFlow, 1);
    assert(asyncBroadcastCalls.join(",") === "async:1:start,sync:1", "broadcast should invoke later listeners without awaiting promises");
    notifier.event(TestMsg.AsyncBroadcastFlow, 2);
    assert(asyncBroadcastCalls.includes("sync:2"), "a pending async listener should not block later events of the same type");
    releaseFirstBroadcast();
    await Promise.resolve();
    assert(asyncBroadcastCalls.includes("async:1:end"), "an async broadcast listener should continue after its promise resumes");

    notifier.on(TestMsg.SyncResult, (value: number) => value * 2);
    assert(await notifier.request(TestMsg.SyncResult, 3) === 6, "request should return a synchronous listener result");

    notifier.on(TestMsg.AsyncResult, async (value: number) => value * 3);
    assert(await notifier.request(TestMsg.AsyncResult, 3) === 9, "request should await an asynchronous listener result");
    assert(await notifier.request(TestMsg.MissingResult, null) === undefined, "missing listeners should return undefined");

    notifier.on("plain-string-result", (value: number) => value * 4);
    assert(await notifier.request<number>("plain-string-result", 3) === 12, "plain string requests should remain compatible");

    notifier.on(TestMsg.MultipleResults, () => 1);
    notifier.on(TestMsg.MultipleResults, () => 2);
    let multipleResultError = false;
    try {
        await notifier.request(TestMsg.MultipleResults, null);
    } catch {
        multipleResultError = true;
    }
    assert(multipleResultError, "multiple replies should be rejected");

    let continuedAfterResultError = false;
    notifier.on(TestMsg.ResultErrors, () => { throw new Error("sync result failure"); });
    notifier.on(TestMsg.ResultErrors, async () => { throw new Error("async result failure"); });
    notifier.on(TestMsg.ResultErrors, () => { continuedAfterResultError = true; });
    let resultError: any = null;
    try {
        await notifier.request(TestMsg.ResultErrors, null);
    } catch (error) {
        resultError = error;
    }
    assert(continuedAfterResultError, "a failing result listener should not stop later listeners");
    const combinedErrors = resultError instanceof Error ? (resultError as Error & { errors?: unknown[] }).errors : undefined;
    assert(combinedErrors?.length === 2, "result mode should report every listener failure");

    let emptyEvent: TestEvent | null = null;
    notifier.on(TestMsg.Empty, (event: TestEvent) => { emptyEvent = event; });
    notifier.event(TestMsg.Empty, TestEvent.EMPTY);
    const dispatchedEvent = emptyEvent as TestEvent | null;
    assert(dispatchedEvent?.type === "empty", "Event.EMPTY should create an event with the dispatched type");
    assert(dispatchedEvent?.target === null && dispatchedEvent?.currentTarget === null, "temporary events should release their targets after dispatch");

    notifier.off(TestMsg.Value, caller, listener, ["updated"]);
    assert(!notifier.hasListener(TestMsg.Value), "off should remove caller/listener pairs");

    const otherCaller = {};
    notifier.on("caller-a", caller, (): undefined => undefined);
    notifier.on("caller-b", otherCaller, (): undefined => undefined);
    notifier.offAllCaller(caller);
    assert(!notifier.hasListener("caller-a") && notifier.hasListener("caller-b"), "offAllCaller should remove only the specified caller");
    notifier.offAll();
    assert(!notifier.hasListener("caller-b"), "offAll should remove every listener");
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
