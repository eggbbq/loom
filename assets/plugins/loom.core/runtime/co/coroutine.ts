const WAIT_NONE = 0;
const WAIT_NEXT_FRAME = 1;
const WAIT_SECONDS = 2;
const WAIT_FRAMES = 3;
const WAIT_UNTIL = 4;
const WAIT_WHILE = 5;
const WAIT_COROUTINE = 6;
const WAIT_PROMISE = 7;
const WAIT_CUSTOM = 8;

export interface CoroutineYieldInstruction {
    update(dt: number): boolean;
}

export type CoroutineIterator = Iterator<CoroutineYield, any, unknown>;
export type CoroutineFactory = () => CoroutineIterator;
export type CoroutineStarter = CoroutineIterator | CoroutineFactory;
export type CoroutineYield =
    | CoroutineYieldInstruction
    | CoroutineIterator
    | Coroutine
    | PromiseLike<any>
    | number
    | null
    | undefined
    | false;

export class WaitForSeconds implements CoroutineYieldInstruction {
    readonly waitType: number = WAIT_SECONDS;
    seconds: number;

    constructor(seconds: number) {
        this.seconds = seconds > 0 ? seconds : 0;
    }

    update(dt: number): boolean {
        this.seconds -= dt;
        return this.seconds > 0;
    }
}

export class WaitForFrames implements CoroutineYieldInstruction {
    readonly waitType: number = WAIT_FRAMES;
    frames: number;

    constructor(frameCount: number = 1) {
        this.frames = frameCount > 0 ? frameCount : 0;
    }

    update(_dt: number): boolean {
        this.frames--;
        return this.frames > 0;
    }
}

export class WaitUntil implements CoroutineYieldInstruction {
    readonly waitType: number = WAIT_UNTIL;
    predicate: () => boolean;

    constructor(predicate: () => boolean) {
        this.predicate = predicate;
    }

    update(_dt: number): boolean {
        return !this.predicate();
    }
}

export class WaitWhile implements CoroutineYieldInstruction {
    readonly waitType: number = WAIT_WHILE;
    predicate: () => boolean;

    constructor(predicate: () => boolean) {
        this.predicate = predicate;
    }

    update(_dt: number): boolean {
        return this.predicate();
    }
}

export class WaitForPromise<T = any> implements CoroutineYieldInstruction {
    readonly waitType: number = WAIT_PROMISE;
    done: boolean = false;
    error: any = null;
    value: T = null;
    throwOnReject: boolean;

    constructor(promise: PromiseLike<T>, throwOnReject: boolean = true) {
        this.throwOnReject = throwOnReject;
        promise.then(
            value => {
                this.value = value;
                this.done = true;
            },
            error => {
                this.error = error;
                this.done = true;
            },
        );
    }

    update(_dt: number): boolean {
        if (this.done && this.error && this.throwOnReject) throw this.error;
        return !this.done;
    }
}

export class Coroutine {
    readonly id: number;
    _runner: CoroutineRunner = null;
    _active: boolean = true;
    _paused: boolean = false;
    _error: any = null;
    _stack: CoroutineIterator[] = [];
    _stackLen: number = 0;
    _waitType: number = WAIT_NONE;
    _waitTime: number = 0;
    _waitFrames: number = 0;
    _waitObj: any = null;

    constructor(id: number, runner: CoroutineRunner, iterator: CoroutineIterator) {
        this.id = id;
        this._runner = runner;
        this._stack[0] = iterator;
        this._stackLen = 1;
    }

    get done(): boolean {
        return !this._active || this._stackLen === 0;
    }

    get running(): boolean {
        return this._active && !this._paused && this._stackLen > 0;
    }

    get paused(): boolean {
        return this._paused;
    }

    get error(): any {
        return this._error;
    }

    pause(): void {
        this._paused = true;
    }

    resume(): void {
        this._paused = false;
    }

    stop(): void {
        const runner = this._runner;
        if (runner) {
            runner.stop(this);
            return;
        }
        this._clear();
    }

    advance(dt: number): void {
        if (!this._active || this._paused) return;
        if (!this._step(dt)) {
            const runner = this._runner;
            if (runner) runner._finish(this);
            else this._clear();
        }
    }

    _clear(): void {
        this._active = false;
        this._paused = false;
        this._runner = null;
        this._waitType = WAIT_NONE;
        this._waitTime = 0;
        this._waitFrames = 0;
        this._waitObj = null;
        this._stackLen = 0;
        this._stack.length = 0;
    }

    _step(dt: number): boolean {
        if (this._paused) return true;

        const waitType = this._waitType;
        if (waitType !== WAIT_NONE) {
            if (this._keepWaiting(waitType, dt)) return true;
            this._waitType = WAIT_NONE;
            this._waitObj = null;
        }

        const stackLen = this._stackLen;
        if (stackLen <= 0) return false;

        const result = this._stack[stackLen - 1].next();
        if (result.done) {
            this._stackLen = stackLen - 1;
            this._stack.length = this._stackLen;
            return this._stackLen > 0;
        }

        this._setWait(result.value);
        return true;
    }

    _keepWaiting(waitType: number, dt: number): boolean {
        switch (waitType) {
            case WAIT_NEXT_FRAME:
                return false;
            case WAIT_SECONDS:
                this._waitTime -= dt;
                return this._waitTime > 0;
            case WAIT_FRAMES:
                this._waitFrames--;
                return this._waitFrames > 0;
            case WAIT_UNTIL:
                return !this._waitObj();
            case WAIT_WHILE:
                return this._waitObj();
            case WAIT_COROUTINE:
                return !this._waitObj.done;
            case WAIT_PROMISE: {
                const wait = this._waitObj as WaitForPromise;
                if (wait.done && wait.error && wait.throwOnReject) throw wait.error;
                return !wait.done;
            }
            default:
                return this._waitObj.update(dt);
        }
    }

    _setWait(value: CoroutineYield): void {
        if (value == null || value === false) {
            this._waitType = WAIT_NEXT_FRAME;
            return;
        }

        const valueType = typeof value;
        if (valueType === "number") {
            const seconds = value as number;
            if (seconds > 0) {
                this._waitType = WAIT_SECONDS;
                this._waitTime = seconds;
            } else {
                this._waitType = WAIT_NEXT_FRAME;
            }
            return;
        }

        if (valueType !== "object") {
            this._waitType = WAIT_NEXT_FRAME;
            return;
        }

        const obj = value as any;
        const waitType = obj.waitType;
        if (waitType === WAIT_SECONDS) {
            this._waitType = WAIT_SECONDS;
            this._waitTime = obj.seconds;
            return;
        }
        if (waitType === WAIT_FRAMES) {
            this._waitType = WAIT_FRAMES;
            this._waitFrames = obj.frames;
            return;
        }
        if (waitType === WAIT_UNTIL) {
            this._waitType = WAIT_UNTIL;
            this._waitObj = obj.predicate;
            return;
        }
        if (waitType === WAIT_WHILE) {
            this._waitType = WAIT_WHILE;
            this._waitObj = obj.predicate;
            return;
        }
        if (waitType === WAIT_PROMISE) {
            this._waitType = WAIT_PROMISE;
            this._waitObj = obj;
            return;
        }

        if (obj._runner !== undefined && obj.id !== undefined) {
            this._waitType = obj.done ? WAIT_NEXT_FRAME : WAIT_COROUTINE;
            this._waitObj = obj;
            return;
        }

        if (typeof obj.next === "function") {
            const stackLen = this._stackLen;
            this._stack[stackLen] = obj;
            this._stackLen = stackLen + 1;
            return;
        }

        if (typeof obj.then === "function") {
            this._waitType = WAIT_PROMISE;
            this._waitObj = new WaitForPromise(obj);
            return;
        }

        if (typeof obj.update === "function") {
            this._waitType = WAIT_CUSTOM;
            this._waitObj = obj;
            return;
        }

        this._waitType = WAIT_NEXT_FRAME;
    }
}

export class CoroutineRunner {
    catchErrors: boolean = false;

    private _nextId: number = 1;
    private _count: number = 0;
    private _active: Coroutine[] = [];
    private _handles: Coroutine[] = [];

    constructor(catchErrors: boolean = false) {
        this.catchErrors = catchErrors;
    }

    get count(): number {
        return this._count;
    }

    start(starter: CoroutineStarter): Coroutine {
        const iterator = typeof starter === "function" ? starter() : starter;
        const coroutine = new Coroutine(this._nextId++, this, iterator);
        this._active[this._active.length] = coroutine;
        this._handles[coroutine.id] = coroutine;
        this._count++;
        return coroutine;
    }

    stop(coroutine: Coroutine | number): boolean {
        const handle = typeof coroutine === "number" ? this._handles[coroutine] : coroutine;
        if (!handle || !handle._active) return false;

        this._handles[handle.id] = null;
        this._count--;
        handle._clear();
        return true;
    }

    stopAll(): void {
        const active = this._active;
        for (let i = 0, len = active.length; i < len; i++) {
            active[i]._clear();
        }
        active.length = 0;
        this._handles.length = 0;
        this._count = 0;
    }

    update(dt: number): void {
        if (this.catchErrors) this._updateSafe(dt);
        else this._updateFast(dt);
    }

    _finish(coroutine: Coroutine): void {
        if (!coroutine._active) return;
        this._handles[coroutine.id] = null;
        this._count--;
        coroutine._clear();
    }

    private _updateFast(dt: number): void {
        const active = this._active;
        const len = active.length;
        if (len === 0) return;

        let write = 0;
        for (let read = 0; read < len; read++) {
            const coroutine = active[read];
            if (!coroutine._active) continue;

            if (coroutine._step(dt)) {
                if (coroutine._active) active[write++] = coroutine;
            } else {
                this._finish(coroutine);
            }
        }

        for (let read = len, total = active.length; read < total; read++) {
            const coroutine = active[read];
            if (coroutine._active) active[write++] = coroutine;
        }
        active.length = write;
    }

    private _updateSafe(dt: number): void {
        const active = this._active;
        const len = active.length;
        if (len === 0) return;

        let write = 0;
        for (let read = 0; read < len; read++) {
            const coroutine = active[read];
            if (!coroutine._active) continue;

            try {
                if (coroutine._step(dt)) {
                    if (coroutine._active) active[write++] = coroutine;
                } else {
                    this._finish(coroutine);
                }
            } catch (error) {
                coroutine._error = error;
                console.error(error);
                this._finish(coroutine);
            }
        }

        for (let read = len, total = active.length; read < total; read++) {
            const coroutine = active[read];
            if (coroutine._active) active[write++] = coroutine;
        }
        active.length = write;
    }
}
