const { regClass, runInEditor } = Laya;

@runInEditor
@regClass()
export class AstarEmptyComponent extends Laya.Script {
    declare owner: Laya.Sprite3D;

    onAwake(): void {
        this.owner.active = false;
    }
}
