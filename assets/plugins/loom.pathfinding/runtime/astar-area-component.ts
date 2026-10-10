import { utils } from "./utils";

const { regClass, runInEditor } = Laya;

@runInEditor
@regClass()
@Laya.classInfo({ menu: "loom/pathfinding" })
export class AstarAreaComponent extends Laya.Script {
    declare owner: Laya.Sprite3D;

    private readonly _localBounds = new Laya.BoundBox(
        new Laya.Vector3(),
        new Laya.Vector3(),
    );
    private readonly _worldBounds = new Laya.BoundBox(
        new Laya.Vector3(),
        new Laya.Vector3(),
    );

    getWorldBounds(): Laya.BoundBox | null {
        const collider = this.owner.getComponent(Laya.PhysicsCollider);
        const shape = collider?.colliderShape;
        if (!(shape instanceof Laya.BoxColliderShape)) return null;

        const halfX = Math.abs(shape.size.x) * 0.5;
        const halfY = Math.abs(shape.size.y) * 0.5;
        const halfZ = Math.abs(shape.size.z) * 0.5;
        const center = shape.localOffset;
        this._localBounds.min.set(
            center.x - halfX,
            center.y - halfY,
            center.z - halfZ,
        );
        this._localBounds.max.set(
            center.x + halfX,
            center.y + halfY,
            center.z + halfZ,
        );
        utils.transformBoundBox(this._localBounds, this.owner.transform.worldMatrix, this._worldBounds);
        return this._worldBounds;
    }
}
