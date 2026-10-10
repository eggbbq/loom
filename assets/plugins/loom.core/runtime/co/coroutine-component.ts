import { Coroutine, CoroutineRunner, CoroutineStarter } from "./coroutine";

const { regClass } = Laya;

@regClass()
@Laya.classInfo({ menu: "loom/core" })
export class CoroutineComponent extends Laya.Script {
    private _co: CoroutineRunner = new CoroutineRunner(true);

    startCoroutine(starter: CoroutineStarter): Coroutine {
        return (this._co ??= new CoroutineRunner(true)).start(starter);
    }

    stopCoroutine(coroutine: Coroutine | number): boolean {
        return this._co?.stop(coroutine) ?? false;
    }

    stopAllCoroutines(): void {
        this._co?.stopAll();
    }

    onUpdate(): void {
        this._co?.update(Laya.timer.delta / 1000);
    }

    onDestroy(): void {
        this._co?.stopAll();
    }
}
