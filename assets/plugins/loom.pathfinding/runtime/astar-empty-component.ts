const { regClass, runInEditor } = Laya;

@runInEditor
@regClass()
@Laya.classInfo({ menu: "loom/pathfinding" })
export class AstarEmptyComponent extends Laya.Script {
    declare owner: Laya.Sprite3D;

    onAwake(): void {
        this.owner.active = false;
    }
}
