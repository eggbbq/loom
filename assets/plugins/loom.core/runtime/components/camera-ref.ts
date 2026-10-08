const { regClass, property } = Laya;

enum CameraTag {
    UI,
    MAIN,
}


@regClass()
export class CameraRef extends Laya.Script {

    private static _main:Laya.Camera;
    private static _ui:Laya.Camera;

    static get main() { return this._main; }
    static get ui() { return this._ui; }

    @property({type:CameraTag}) tag: CameraTag = CameraTag.MAIN;

    onAwake(): void {
        let camera = this.owner as Laya.Camera;
        if (!(camera instanceof Laya.Camera)) throw new Error("CameraComponent must be attached to a Camera");

        if (this.tag === CameraTag.MAIN) CameraRef._main = camera;
        else if (this.tag === CameraTag.UI) CameraRef._ui = camera;
    }

    onDestroy(): void {
        if (this.owner === CameraRef._main) CameraRef._main = null;
        if (this.owner === CameraRef._ui) CameraRef._ui = null;
    }
}