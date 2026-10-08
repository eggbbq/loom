import { BTStatus } from "./bt-status";

export abstract class BTNode {
    context: any = null;
    private _running = false;

    get running(): boolean {
        return this._running;
    }

    tick(deltaTime: number): BTStatus {
        if (!this._running) {
            this.onEnter();
        }

        const status = this.onTick(Math.max(0, deltaTime));
        if (status === BTStatus.Running) {
            this._running = true;
            return status;
        }

        this._running = false;
        this.onExit(status);
        return status;
    }

    reset(): void {
        const wasRunning = this._running;
        this._running = false;

        if (wasRunning) {
            this.onAbort();
        }
        this.onReset();
    }

    protected onEnter(): void { }

    protected abstract onTick(deltaTime: number): BTStatus;

    protected onExit(_status: BTStatus): void { }

    protected onAbort(): void { }

    protected onReset(): void { }
}
