import { astar } from "./astar-chunk-component";
import { utils } from "./utils";

const { regClass, runInEditor } = Laya;

@runInEditor
@regClass()
export class AstarObstacleComponent extends Laya.Script {
    declare owner: Laya.Sprite3D;

    private m_released = false;
    private m_runtimeOccupied = false;

    private readonly _localBounds = new Laya.BoundBox(
        new Laya.Vector3(),
        new Laya.Vector3(),
    );
    private readonly _worldBounds = new Laya.BoundBox(
        new Laya.Vector3(),
        new Laya.Vector3(),
    );

    getBoxShape(): Laya.BoxColliderShape | null {
        const collider = this.owner.getComponent(Laya.PhysicsCollider);
        const shape = collider?.colliderShape;
        return shape instanceof Laya.BoxColliderShape ? shape : null;
    }

    getWorldBounds(): Laya.BoundBox | null {
        const shape = this.getBoxShape();
        if (!shape) return null;

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

    /**
     * 显式释放此障碍覆盖的格子。未加载 Chunk 会记录增量，并在重新载入时应用。
     *
     * 节点或组件的显隐属于生命周期行为，不应隐式改变持久的寻路状态。
     */
    releaseObstacle(): void {
        if (this.m_released) return;
        const nav = astar.main;
        const bounds = this.getWorldBounds();
        if (!nav || !bounds) return;

        nav.changeDynamicBlockCountInWorldBounds(bounds.min.x, bounds.min.z, bounds.max.x, bounds.max.z, -1);
        this.m_released = true;
        this.m_runtimeOccupied = false;
    }

    /**
     * 显式登记运行时新增的障碍。已经包含在烘焙数据中的障碍不应再次调用。
     */
    occupyObstacle(): void {
        if (this.m_runtimeOccupied) return;
        const nav = astar.main;
        const bounds = this.getWorldBounds();
        if (!nav || !bounds) return;

        nav.changeDynamicBlockCountInWorldBounds(bounds.min.x, bounds.min.z, bounds.max.x, bounds.max.z, 1);
        this.m_runtimeOccupied = true;
        this.m_released = false;
    }
}
