import { BTNode } from "./bt-node";
import { BTRunner } from "./bt-runner";
import { BTStatus } from "./bt-status";

const { regClass, property } = Laya;

@regClass()
export abstract class BTComponent extends Laya.Script {
    @property({ type: Number, min: 0, step: 0.01, fractionDigits: 2 })
    btTickInterval = 0.1;

    @property({ type: Boolean })
    btAutoStart = true;

    protected context: any = null;
    protected btRunner: BTRunner;

    private _btRunning = false;
    private _btElapsed = 0;

    get btRunning(): boolean {
        return this._btRunning;
    }

    get btStatus(): BTStatus | null {
        return this.btRunner?.status ?? null;
    }

    protected abstract createBTContext(): any;

    protected abstract createBTRoot(): BTNode;

    onAwake(): void {
        this.context = this.createBTContext();
        this.btRunner = new BTRunner(this.createBTRoot(), this.context);
        this._btRunning = this.btAutoStart;
    }

    btStart(): void {
        this._btRunning = true;
    }

    btStop(): void {
        this._btRunning = false;
        this.btReset();
    }

    btReset(): void {
        this._btElapsed = 0;
        this.btRunner?.reset();
    }

    btTick(deltaTime: number): BTStatus | null {
        return this.btRunner?.tick(deltaTime) ?? null;
    }

    onUpdate(): void {
        if (!this._btRunning || !this.btRunner) return;

        const deltaTime = Laya.timer.delta / 1000;
        if (this.btTickInterval <= 0) {
            this.btTick(deltaTime);
            return;
        }

        this._btElapsed += deltaTime;
        if (this._btElapsed < this.btTickInterval) return;

        const elapsed = this._btElapsed;
        this._btElapsed = 0;
        this.btTick(elapsed);
    }

    onDisable(): void {
        this.btReset();
    }

    onDestroy(): void {
        this.btReset();
    }
}
