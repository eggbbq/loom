import { AstarAgentComponent } from "./astar-agent-component";

const { regClass, property } = Laya;

/**
 * 将场景中的短点击转换为 AStar Agent 的世界 XZ 寻路目标。
 * 地面必须具有 3D 碰撞体，并包含在 groundCollisionMask 中。
 */
@regClass()
export class AstarCharacterCtrlComponent extends Laya.Script {
    declare owner: Laya.Sprite3D;

    @property({ type: AstarAgentComponent, caption: "AStar Agent", tips: "未指定时自动查找当前节点上的 AstarAgentComponent。" })
    agent: AstarAgentComponent | null = null;

    @property({ type: Laya.Camera, caption: "点击相机", tips: "未指定时使用 loom.CameraRef.main。" })
    camera: Laya.Camera | null = null;

    @property({ type: Number, caption: "射线距离", min: 0.01, step: 1, fractionDigits: 2 })
    raycastDistance = 500;

    @property({ type: Number, caption: "地面碰撞掩码", tips: "建议只包含可以点击寻路的地面碰撞层。" })
    groundCollisionMask = -1;

    @property({ type: Number, caption: "点击容差（像素）", tips: "按下与抬起距离超过该值时视为拖动。", min: 0, step: 1 })
    clickTolerance = 10;

    @property({ type: Boolean, caption: "忽略 UI 点击" })
    ignorePointerOverUI = true;

    @property({ type: Boolean, caption: "接近不可达目标", tips: "点击格被阻挡或不连通时，移动到从角色位置可达的最近格。" })
    findNearestReachable = true;

    @property({ type: Boolean, caption: "输出调试日志" })
    debugLog = false;

    private m_pointerDown = false;
    private readonly m_downPosition = new Laya.Vector2();
    private readonly m_screenPoint = new Laya.Vector2();
    private readonly m_ray = new Laya.Ray(new Laya.Vector3(), new Laya.Vector3());
    private readonly m_hit = new Laya.HitResult();

    onAwake(): void {
        if (!this.resolveAgent()) console.error("AstarCharacterCtrlComponent：请配置 Agent，或在当前节点添加 AstarAgentComponent。");
    }

    onEnable(): void {
        Laya.stage.on(Laya.Event.MOUSE_DOWN, this, this.onStageMouseDown);
        Laya.stage.on(Laya.Event.MOUSE_UP, this, this.onStageMouseUp);
        Laya.stage.on(Laya.Event.MOUSE_OUT, this, this.cancelPointer);
    }

    onDisable(): void {
        Laya.stage.off(Laya.Event.MOUSE_DOWN, this, this.onStageMouseDown);
        Laya.stage.off(Laya.Event.MOUSE_UP, this, this.onStageMouseUp);
        Laya.stage.off(Laya.Event.MOUSE_OUT, this, this.cancelPointer);
        this.cancelPointer();
    }

    moveToScreenPoint(screenX: number, screenY: number): boolean {
        const agent = this.resolveAgent();
        if (!agent) return false;


        const camera = this.resolveCamera();
        if (!camera) {
            console.error("AstarCharacterCtrlComponent：请配置点击相机，或在主相机添加 CameraRef。");
            return false;
        }

        const scene = this.owner.scene as Laya.Scene3D | null;
        if (!scene) return false;

        this.m_screenPoint.setValue(screenX, screenY);
        camera.viewportPointToRay(this.m_screenPoint, this.m_ray);
        const hitGround = scene.physicsSimulation.rayCast(
            this.m_ray,
            this.m_hit,
            Math.max(0.01, this.raycastDistance),
            Laya.Physics3DUtils.COLLISIONFILTERGROUP_DEFAULTFILTER,
            this.groundCollisionMask,
        );
        if (!hitGround) {
            this.log("点击位置没有命中地面碰撞体。");
            return false;
        }

        const target = { x: this.m_hit.point.x, y: this.m_hit.point.z };
        const started = agent.setTarget(target, { findNearestReachable: this.findNearestReachable });
        this.log(started
            ? `开始寻路到 (${target.x.toFixed(2)}, ${target.y.toFixed(2)})。`
            : `无法寻路到 (${target.x.toFixed(2)}, ${target.y.toFixed(2)})。`);
        return started;
    }

    private onStageMouseDown(): void {
        if (this.ignorePointerOverUI || loom.uif.isPointerOverUI()) {
            this.cancelPointer();
            return;
        }

        this.m_pointerDown = true;
        this.m_downPosition.setValue(Laya.stage.mouseX, Laya.stage.mouseY);
    }

    private onStageMouseUp(): void {
        if (!this.m_pointerDown) return;
        this.m_pointerDown = false;
        if (this.ignorePointerOverUI && loom.uif.isPointerOverUI()) return;

        const deltaX = Laya.stage.mouseX - this.m_downPosition.x;
        const deltaY = Laya.stage.mouseY - this.m_downPosition.y;
        const tolerance = Math.max(0, this.clickTolerance);
        if (deltaX * deltaX + deltaY * deltaY > tolerance * tolerance) return;

        this.moveToScreenPoint(Laya.stage.mouseX, Laya.stage.mouseY);
    }

    private cancelPointer(): void {
        this.m_pointerDown = false;
    }

    private resolveAgent(): AstarAgentComponent | null {
        if (this.agent && !this.agent.destroyed) return this.agent;
        this.agent = this.owner.getComponent(AstarAgentComponent);
        return this.agent;
    }

    private resolveCamera(): Laya.Camera | null {
        if (this.camera && !this.camera.destroyed) return this.camera;
        const camera = loom.CameraRef.main;
        return camera && !camera.destroyed ? camera : null;
    }

    private log(message: string): void {
        if (this.debugLog) console.log(`[AstarCharacterCtrl] ${message}`);
    }
}
