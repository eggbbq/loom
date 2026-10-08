const { regClass } = Laya;

export interface IState {
    readonly name: string;
    agent: Laya.Sprite | Laya.Sprite3D;
    onRegister?(): void;
    onUnregistger?(): void;
    next: (state: IState, next: string, data?: any) => void;
    enter(data?: any): void;
    leave(): void;
    update?(dt: number): void;
}

class StateEmpty implements IState {
    name: string = "";
    agent: any = null;
    enter(_data?: any): void { }
    leave(): void { }
    next: (state: IState, next: string, data?: any) => void = null;
}

const EMPTY = new StateEmpty();

@regClass()
export class StateManagerComponent extends Laya.Script {

    onDestroy(): void {
        this.onStop();
    }

    protected _states = new Map<string, IState>();

    protected register(...states: IState[]): void {
        const fun = this.nextInternal.bind(this);
        for (const state of states) {
            state.agent = this.owner;
            this._states.set(state.name, state);
            state.next = fun;
        }
    }

    private nextInternal(state: IState, next: string, data?: any): void {
        if (this._current != state) {
            console.error("所有权已经过期，请勿胡乱调用");
            return;
        }

        this.next(next, data);
    }

    private _current: IState = EMPTY;
    get current() { return this._current; }

    next(stateName: string, data?: any): void {
        if (this.destroyed) {
            console.error("状态机已经销毁, 不在支持切换");
            return;
        }

        if (!this.enabled) {
            console.error("状态机已经停止, 不在支持切换");
            return;
        }

        if (this._current && this._current.name == stateName) {
            // 暂时保留原实现行为：允许同状态再次 enter。
        }

        const next = this._states.get(stateName);
        if (!next) {
            console.error(`目标状态:${stateName}不存在`);
            return;
        }

        $env.mdebug && console.log("[fish-state-manager]", this._current.name, "to", stateName);

        if (this.current) {
            this.current.leave();
        }

        this._current = next;
        next.enter(data);
    }

    onStart(): void {
        for (const [_k, state] of this._states.entries()) {
            state.onRegister?.();
        }
    }

    onStop(): void {
        for (const [_k, state] of this._states.entries()) {
            try {
                state.onUnregistger?.();
            } catch (error) {
                console.error(error);
            }
            state.agent = null;
            state.next = null;
        }
    }

    onUpdate(): void {
        const dt = Laya.timer.delta / 1000;
        if (this._current) {
            this._current.update?.(dt);
        }
    }
}
