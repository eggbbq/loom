declare const $msg: unique symbol;

export type Msg<D = void, R = never> = string & {
    readonly [$msg]: readonly [D, R];
};

export function msg<D = void, R = never>(type: string): Msg<D, R> {
    return type as Msg<D, R>;
}

type AnyMsg = Msg<any, any>;
type PlainEventType = string & { readonly [$msg]?: never };
type DataOf<M extends AnyMsg> = M extends Msg<infer D, any> ? D : never;
type ResultOf<M extends AnyMsg> = M extends Msg<any, infer R> ? R : never;
type DataArgs<M extends AnyMsg> = [DataOf<M>] extends [void]? [data?: undefined] : [data: DataOf<M>];
type RequestArgs<M extends AnyMsg> = [ResultOf<M>] extends [never] ? never : DataArgs<M>;

type ListenerArgs<M extends AnyMsg> = [DataOf<M>] extends [void]
    ? []
    : DataOf<M> extends readonly unknown[]
        ? [...DataOf<M>]
        : [data: DataOf<M>];

type ListenerResult<M extends AnyMsg> = [ResultOf<M>] extends [never] ? unknown : ResultOf<M> | PromiseLike<ResultOf<M> | undefined> | undefined;
type MsgListener<M extends AnyMsg> = (...args: ListenerArgs<M>) => ListenerResult<M>;
type BoundMsgListener<M extends AnyMsg, A extends unknown[]> = (...args: [...A, ...ListenerArgs<M>]) => ListenerResult<M>;

type Listener = {
    callback: Function;
    caller: any;
    args: any[] | null;
    once: boolean;
    active: boolean;
};

type ListenerGroup = {
    readonly listeners: Listener[];
    activeCount: number;
    dispatching: boolean;
    dirty: boolean;
};

type InvokeResult = {
    readonly values: unknown[];
    readonly errors: unknown[];
};

const enum DataKind {
    None,
    Single,
    Array,
    Event
}

export interface INotifier {
    hasListener(type: string): boolean;
    event<M extends AnyMsg>(type: M, ...args: DataArgs<M>): void;
    event(type: PlainEventType, data?: any): void;
    request<M extends AnyMsg>(type: M, ...args: RequestArgs<M>): Promise<ResultOf<M> | undefined>;
    request<TResult>(type: PlainEventType, data?: any): Promise<TResult | undefined>;
    on<M extends AnyMsg>(type: M, listener: MsgListener<M>): this;
    on<M extends AnyMsg>(type: M, caller: any, listener: MsgListener<M>): this;
    on<M extends AnyMsg, A extends unknown[]>(type: M, caller: any, listener: BoundMsgListener<M, A>, args: [...A]): this;
    on(type: PlainEventType, listener: Function): this;
    on(type: PlainEventType, caller: any, listener: Function, args?: any[]): this;
    once<M extends AnyMsg>(type: M, listener: MsgListener<M>): this;
    once<M extends AnyMsg>(type: M, caller: any, listener: MsgListener<M>): this;
    once<M extends AnyMsg, A extends unknown[]>(type: M, caller: any, listener: BoundMsgListener<M, A>, args: [...A]): this;
    once(type: PlainEventType, listener: Function): this;
    once(type: PlainEventType, caller: any, listener: Function, args?: any[]): this;
    off<M extends AnyMsg>(type: M, listener: MsgListener<M>): this;
    off<M extends AnyMsg>(type: M, caller: any, listener: MsgListener<M>): this;
    off<M extends AnyMsg, A extends unknown[]>(type: M, caller: any, listener: BoundMsgListener<M, A>, args: [...A]): this;
    off(type: PlainEventType, listener: Function): this;
    off(type: PlainEventType, caller: any, listener?: Function, args?: any[]): this;
    offAll(type?: string): this;
    offAllCaller(caller: any): this;
}

export class Notifier implements INotifier {
    static readonly current: Notifier = new Notifier();

    private readonly m_events = new Map<string, ListenerGroup>();
    private readonly m_eventPool: Laya.Event[] = [];

    hasListener(type: string): boolean {
        return (this.m_events.get(type)?.activeCount ?? 0) > 0;
    }

    event<M extends AnyMsg>(type: M, ...args: DataArgs<M>): void;
    event(type: PlainEventType, data?: any): void;
    event(type: string, data?: unknown): void {
        const group = this.m_events.get(type);
        if (!group || group.activeCount === 0 || group.dispatching) return;
        this.invoke(group, type, data, null);
    }

    request<M extends AnyMsg>(type: M, ...args: RequestArgs<M>): Promise<ResultOf<M> | undefined>;
    request<TResult>(type: PlainEventType, data?: any): Promise<TResult | undefined>;
    request(type: string, data?: unknown): Promise<unknown | undefined> {
        const group = this.m_events.get(type);
        if (!group || group.activeCount === 0 || group.dispatching) return Promise.resolve(undefined);

        const result: InvokeResult = { values: [], errors: [] };
        this.invoke(group, type, data, result);
        return this.resolveResult(type, result);
    }

    on<M extends AnyMsg>(type: M, listener: MsgListener<M>): this;
    on<M extends AnyMsg>(type: M, caller: any, listener: MsgListener<M>): this;
    on<M extends AnyMsg, A extends unknown[]>(type: M, caller: any, listener: BoundMsgListener<M, A>, args: [...A]): this;
    on(type: PlainEventType, listener: Function): this;
    on(type: PlainEventType, caller: any, listener: Function, args?: any[]): this;
    on(type: string, callerOrListener: any, listener?: Function, args?: any[]): this {
        const caller = arguments.length === 2 ? null : callerOrListener || null;
        const callback = arguments.length === 2 ? callerOrListener : listener;
        if (typeof callback !== "function") throw new TypeError("Event listener must be a function.");
        this.addListener(type, caller, callback, args, false);
        return this;
    }

    once<M extends AnyMsg>(type: M, listener: MsgListener<M>): this;
    once<M extends AnyMsg>(type: M, caller: any, listener: MsgListener<M>): this;
    once<M extends AnyMsg, A extends unknown[]>(type: M, caller: any, listener: BoundMsgListener<M, A>, args: [...A]): this;
    once(type: PlainEventType, listener: Function): this;
    once(type: PlainEventType, caller: any, listener: Function, args?: any[]): this;
    once(type: string, callerOrListener: any, listener?: Function, args?: any[]): this {
        const caller = arguments.length === 2 ? null : callerOrListener || null;
        const callback = arguments.length === 2 ? callerOrListener : listener;
        if (typeof callback !== "function") throw new TypeError("Event listener must be a function.");
        this.addListener(type, caller, callback, args, true);
        return this;
    }

    off<M extends AnyMsg>(type: M, listener: MsgListener<M>): this;
    off<M extends AnyMsg>(type: M, caller: any, listener: MsgListener<M>): this;
    off<M extends AnyMsg, A extends unknown[]>(type: M, caller: any, listener: BoundMsgListener<M, A>, args: [...A]): this;
    off(type: PlainEventType, listener: Function): this;
    off(type: PlainEventType, caller: any, listener?: Function, args?: any[]): this;
    off(type: string, callerOrListener: any, listener?: Function): this {
        const caller = arguments.length === 2 ? null : callerOrListener || null;
        const callback = arguments.length === 2 ? callerOrListener : listener;
        const group = this.m_events.get(type);
        if (!group) return this;

        const listeners = group.listeners;
        for (let i = 0; i < listeners.length; i++) {
            const current = listeners[i];
            if (!current.active || current.callback !== callback || current.caller !== caller) continue;
            current.active = false;
            group.activeCount--;
            group.dirty = true;
            break;
        }
        if (group.dirty && !group.dispatching) this.compact(group);
        return this;
    }

    offAll(type?: string): this {
        if (type == null) {
            for (const group of this.m_events.values()) this.clearGroup(group);
        } else {
            const group = this.m_events.get(type);
            if (group) this.clearGroup(group);
        }
        return this;
    }

    offAllCaller(caller: any): this {
        if (!caller) return this;
        for (const group of this.m_events.values()) {
            const listeners = group.listeners;
            for (let i = 0; i < listeners.length; i++) {
                const listener = listeners[i];
                if (!listener.active || listener.caller !== caller) continue;
                listener.active = false;
                group.activeCount--;
                group.dirty = true;
            }
            if (group.dirty && !group.dispatching) this.compact(group);
        }
        return this;
    }

    private addListener(type: string, caller: any, callback: Function, args: any[] | undefined, once: boolean): void {
        let group = this.m_events.get(type);
        if (!group) {
            group = { listeners: [], activeCount: 0, dispatching: false, dirty: false };
            this.m_events.set(type, group);
        }

        const listeners = group.listeners;
        for (let i = 0; i < listeners.length; i++) {
            const current = listeners[i];
            if (current.callback !== callback || current.caller !== caller) continue;
            current.args = args ?? null;
            current.once = once;
            if (!current.active) {
                current.active = true;
                group.activeCount++;
            }
            return;
        }
        listeners.push({ callback, caller, args: args ?? null, once, active: true });
        group.activeCount++;
    }

    private invoke(group: ListenerGroup, type: string, data: any, result: InvokeResult | null): void {
        const dataKind = Array.isArray(data)
            ? DataKind.Array
            : data === Laya.Event.EMPTY ? DataKind.Event : data === undefined ? DataKind.None : DataKind.Single;
        const event = dataKind === DataKind.Event ? this.acquireEvent(type) : null;
        const listeners = group.listeners;
        const count = listeners.length;
        group.dispatching = true;
        try {
            for (let i = 0; i < count; i++) {
                const listener = listeners[i];
                if (!listener.active) continue;
                try {
                    const value = this.callListener(listener, dataKind, data, event);
                    if (result) {
                        if (value !== undefined) result.values.push(value);
                    } else {
                        this.observeAsyncFailure(type, value);
                    }
                } catch (error) {
                    if (result) result.errors.push(error);
                    else this.reportError(type, error);
                }
                if (listener.once && listener.active) {
                    listener.active = false;
                    group.activeCount--;
                    group.dirty = true;
                }
            }
        } finally {
            group.dispatching = false;
            if (event) this.releaseEvent(event);
            if (group.dirty) this.compact(group);
        }
    }

    private callListener(listener: Listener, dataKind: DataKind, data: any, event: Laya.Event | null): unknown {
        const args = listener.args;
        if (args) {
            if (dataKind === DataKind.Array) return listener.callback.call(listener.caller, ...args, ...data);
            if (dataKind === DataKind.Event) return listener.callback.call(listener.caller, ...args, event);
            if (dataKind === DataKind.Single) return listener.callback.call(listener.caller, ...args, data);
            return listener.callback.call(listener.caller, ...args);
        }
        if (dataKind === DataKind.Array) return listener.callback.call(listener.caller, ...data);
        if (dataKind === DataKind.Event) return listener.callback.call(listener.caller, event);
        if (dataKind === DataKind.Single) return listener.callback.call(listener.caller, data);
        return listener.callback.call(listener.caller);
    }

    private async resolveResult<TResult>(type: string, result: InvokeResult): Promise<TResult | undefined> {
        let reply: TResult | undefined;
        let replyCount = 0;
        if (result.values.length > 0) {
            const settled = await Promise.allSettled(result.values);
            for (const item of settled) {
                if (item.status === "rejected") {
                    result.errors.push(item.reason);
                } else if (item.value !== undefined) {
                    reply = item.value as TResult;
                    replyCount++;
                }
            }
        }
        if (result.errors.length > 0) throw this.combineErrors(type, result.errors);
        if (replyCount > 1) throw new Error(`[Notifier] Multiple listeners returned a result for event "${type}".`);
        return reply;
    }

    private clearGroup(group: ListenerGroup): void {
        if (group.activeCount === 0) return;
        if (!group.dispatching) {
            group.listeners.length = 0;
            group.activeCount = 0;
            group.dirty = false;
            return;
        }
        const listeners = group.listeners;
        for (let i = 0; i < listeners.length; i++) listeners[i].active = false;
        group.activeCount = 0;
        group.dirty = true;
    }

    private compact(group: ListenerGroup): void {
        const listeners = group.listeners;
        let write = 0;
        for (let read = 0; read < listeners.length; read++) {
            const listener = listeners[read];
            if (!listener.active) continue;
            if (write !== read) listeners[write] = listener;
            write++;
        }
        listeners.length = write;
        group.dirty = false;
    }

    private acquireEvent(type: string): Laya.Event {
        const event = this.m_eventPool.pop() ?? new Laya.Event();
        return event.setTo(type, this, this);
    }

    private releaseEvent(event: Laya.Event): void {
        event.target = event.currentTarget = null;
        this.m_eventPool.push(event);
    }

    private observeAsyncFailure(type: string, value: unknown): void {
        if (!value || (typeof value !== "object" && typeof value !== "function")) return;
        let then: unknown;
        try {
            then = (value as PromiseLike<unknown>).then;
        } catch (error) {
            this.reportError(type, error);
            return;
        }
        if (typeof then === "function") Promise.resolve(value).catch(error => this.reportError(type, error));
    }

    private combineErrors(type: string, errors: unknown[]): unknown {
        if (errors.length === 1) return errors[0];
        const error = new Error(`[Notifier] ${errors.length} listeners failed for event "${type}".`);
        Object.defineProperty(error, "errors", { value: errors, enumerable: false });
        return error;
    }

    private reportError(type: string, error: unknown): void {
        console.error(`[Notifier] Listener failed for event "${type}".`, error);
    }
}
