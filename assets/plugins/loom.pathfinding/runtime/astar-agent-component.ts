import { AstarPathSmootherComponent } from "./astar-path-smoother-component";
import { Point } from "./astar";
import { astar } from "./astar-chunk-component";

const { regClass, property } = Laya;

export type AstarAgentInitOptions = {
    id?: number;
    position?: Point;
    speed?: number;
};

export type AstarAgentTargetOptions = {
    /** 目标被阻挡或不连通时，移动到从当前位置可达且最接近目标的格子。 */
    findNearestReachable?: boolean;
};

export const AstarAgentEvent = {
    StateChanged: "astar-agent-state-changed",
    Arrived: "astar-agent-arrived",
    PathFailed: "astar-agent-path-failed",
    Stopped: "astar-agent-stopped",
} as const;

export type AstarAgentState = "idle" | "moving" | "arrived" | "path-failed" | "stopped";
export type AstarAgentPathFailureReason = "not-ready" | "unreachable";

export type AstarAgentEventData = {
    agent: AstarAgentComponent;
    state: AstarAgentState;
    previousState: AstarAgentState;
    target: Point | null;
    reason?: AstarAgentPathFailureReason;
};

@regClass()
@Laya.classInfo({ menu: "loom/pathfinding" })
export class AstarAgentComponent extends Laya.Script {
    declare owner: Laya.Sprite3D;
    @property({ type: Number, readonly: true }) agentId = 0;
    @property({ type: Number, min: 0, step: 0.01, fractionDigits: 2 }) speed = 1;
    @property({ type: Boolean }) syncOwnerPosition = true;
    @property({ type: Boolean }) readOwnerPositionOnEnable = true;
    @property({ type: Boolean }) useDefaultOnUpdate: boolean = true;
    @property({ type: Boolean }) faceMovementDirection = true;
    @property({ type: Number, min: 0 }) rotationSpeed = 180;
    @property({ type: Number, min: -180, max: 180, step: 90 }) rotationOffset = 0;
    @property({ type: AstarPathSmootherComponent }) pathSmoother: AstarPathSmootherComponent | null = null;
    @property({ type: Boolean }) debugDraw = false;

    position: Point = { x: 0, y: 0 };
    target: Point | null = null;
    path: Point[] = [];
    smoothedPath: Point[] = [];
    isMoving = false;

    private m_state: AstarAgentState = "idle";
    get state(): AstarAgentState { return this.m_state; }

    private m_currentRotation = 0;
    private m_lineRenderer: Laya.PixelLineSprite3D | null = null;
    private m_inited = false;
    private m_findNearestReachableTarget = false;

    onDestroy(): void {
        if (this.m_lineRenderer && !this.m_lineRenderer.destroyed) {
            this.m_lineRenderer.destroy();
        }
        this.m_lineRenderer = null;
    }

    private init() {
        if (this.m_inited) return true;
        if (!astar.main || !astar.main.inited) return false;
        this.m_inited = true;
        this.pathSmoother = this.owner.getComponent(AstarPathSmootherComponent);
        this.syncPathSmootherParameters();

        if (this.debugDraw) {
            this.m_lineRenderer = new Laya.PixelLineSprite3D(20, "AgentPathDebugLine");
            this.owner.scene.addChild(this.m_lineRenderer);
        }
        return true;
    }

    setOptions(options: AstarAgentInitOptions): void {
        if (options.id !== undefined) this.agentId = options.id;
        if (options.position) this.setPosition(options.position);
        if (options.speed !== undefined) this.speed = options.speed;
    }

    setPosition(position: Point, syncOwner = true): void {
        this.position = { x: position.x, y: position.y };
        if (syncOwner && this.syncOwnerPosition) {
            this.applyOwnerPosition();
        }
    }

    setTarget(target: Point, options: AstarAgentTargetOptions = {}): boolean {
        const requestedTarget = { x: target.x, y: target.y };
        this.m_findNearestReachableTarget = options.findNearestReachable ?? false;
        if (!astar.main || !astar.main.inited) {
            console.error("astar is not ready");
            this.handlePathFailure(requestedTarget, "not-ready");
            return false;
        }
        if (!this.m_inited && !this.init()) {
            this.handlePathFailure(requestedTarget, "not-ready");
            return false;
        }
        this.target = requestedTarget;
        return this.calculatePath();
    }

    calculatePath(): boolean {
        if (!this.target) return false;
        if (!this.m_inited) return false;

        const result = astar.main.findPath(this.position, this.target, { findNearestReachable: this.m_findNearestReachableTarget });
        this.clearDebugPath();

        if (!result.found) {
            this.handlePathFailure(this.target, "unreachable");
            console.log("No path found");
            return false;
        }

        this.path = result.path;

        if (this.pathSmoother) {
            this.syncPathSmootherParameters();
            this.smoothedPath = this.pathSmoother.smoothPath(this.path);
        } else {
            this.smoothedPath = Array.from(this.path);
        }

        this.drawDebugPath();

        if (this.smoothedPath.length === 0) {
            this.completeArrival();
            return true;
        }

        this.transitionTo("moving", this.target);
        return true;
    }

    moveToNextPoint(delta = 1): void {
        if (!this.m_inited) return;
        if (this.smoothedPath.length === 0) {
            this.completeArrival();
            return;
        }

        const tileSize = astar.main.tileSize;
        const nextGridPoint = this.smoothedPath[0];
        const nextWorldPoint = this.toWorldPoint(nextGridPoint);

        let movementDirection = this.getDirection(nextWorldPoint);
        if (this.pathSmoother) {
            movementDirection = this.pathSmoother.getDirection(this.position, nextWorldPoint);
        }

        this.position = this.moveTowards(this.position, nextWorldPoint, this.speed * delta);

        if (this.faceMovementDirection && (movementDirection.x !== 0 || movementDirection.y !== 0)) {
            this.updateRotation(movementDirection, delta);
        }

        const distance = Math.sqrt(
            Math.pow(this.position.x - nextWorldPoint.x, 2) +
            Math.pow(this.position.y - nextWorldPoint.y, 2)
        );

        if (distance < tileSize * 0.1) {
            this.position = { x: nextWorldPoint.x, y: nextWorldPoint.y };
            this.smoothedPath.shift();
            this.drawDebugPath();
        }

        if (this.syncOwnerPosition) {
            this.applyOwnerPosition();
        }

        if (this.smoothedPath.length === 0) {
            this.completeArrival();
        }
    }

    getDirection(target: Point): Point {
        const dx = target.x - this.position.x;
        const dy = target.y - this.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance === 0) {
            return { x: 0, y: 0 };
        }

        return {
            x: dx / distance,
            y: dy / distance,
        };
    }

    private syncPathSmootherParameters(): void {
        const nav = astar.main;
        if (!this.pathSmoother || !nav?.inited) return;
        this.pathSmoother.setGridParameters(nav.tileSize, nav.getWorld(), {
            preventCornerCutting: nav.preventCornerCutting,
        });
    }

    moveTowards(position: Point, target: Point, maxDistanceDelta = this.speed): Point {
        const dx = target.x - position.x;
        const dy = target.y - position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= maxDistanceDelta || distance === 0) {
            return { x: target.x, y: target.y };
        }

        const ratio = maxDistanceDelta / distance;
        return {
            x: position.x + dx * ratio,
            y: position.y + dy * ratio,
        };
    }

    stop(): void {
        if (!this.isMoving && !this.target) return;

        const stoppedTarget = this.clonePoint(this.target);
        this.target = null;
        this.path.length = 0;
        this.smoothedPath.length = 0;
        this.m_findNearestReachableTarget = false;
        const data = this.transitionTo("stopped", stoppedTarget);
        this.owner.event(AstarAgentEvent.Stopped, data);
    }

    update(delta = 1): void {
        if (!this.m_inited) return;
        if (this.isMoving) {
            this.moveToNextPoint(delta);
        }
    }

    onEnable(): void {
        if (this.readOwnerPositionOnEnable) {
            this.readOwnerPosition();
        }
    }

    onUpdate(): void {
        if (!this.useDefaultOnUpdate) return;
        this.update(Laya.timer.delta / 1000);
    }

    private readOwnerPosition(): void {
        const owner = this.owner as Laya.Sprite3D;
        if (!(owner instanceof Laya.Sprite3D)) return;

        const pos = owner.transform.position;
        this.position = { x: pos.x, y: pos.z };

        const rotation = owner.transform.rotation;
        this.m_currentRotation = this.getYAxisRotation(rotation);
    }

    private completeArrival(): void {
        if (!this.isMoving && this.m_state === "arrived") return;

        const arrivedTarget = this.clonePoint(this.target);
        this.target = null;
        this.path.length = 0;
        this.smoothedPath.length = 0;
        this.m_findNearestReachableTarget = false;
        const data = this.transitionTo("arrived", arrivedTarget);
        this.owner.event(AstarAgentEvent.Arrived, data);
    }

    private handlePathFailure(target: Point | null, reason: AstarAgentPathFailureReason): void {
        const failedTarget = this.clonePoint(target);
        this.target = null;
        this.path.length = 0;
        this.smoothedPath.length = 0;
        this.m_findNearestReachableTarget = false;
        this.clearDebugPath();

        const data = this.transitionTo("path-failed", failedTarget, reason);
        this.owner.event(AstarAgentEvent.PathFailed, data);
    }

    private transitionTo(
        state: AstarAgentState,
        target: Point | null,
        reason?: AstarAgentPathFailureReason,
    ): AstarAgentEventData {
        const previousState = this.m_state;
        this.m_state = state;
        this.isMoving = state === "moving";

        const data: AstarAgentEventData = {
            agent: this,
            state,
            previousState,
            target: this.clonePoint(target),
            reason,
        };

        if (state !== previousState) {
            this.owner.event(AstarAgentEvent.StateChanged, data);
        }
        return data;
    }

    private clonePoint(point: Point | null): Point | null {
        return point ? { x: point.x, y: point.y } : null;
    }

    private clearDebugPath(): void {
        if (this.m_lineRenderer) {
            this.m_lineRenderer.clear();
        }
    }

    private drawDebugPath(): void {
        if (!this.m_lineRenderer || !this.debugDraw) return;
        this.clearDebugPath();

        if (this.smoothedPath.length === 0) return;

        const color = new Laya.Color(1, 0, 0, 1);

        const p0 = this.toWorldPoint(this.smoothedPath[0]);

        this.m_lineRenderer.addLine(
            new Laya.Vector3(this.owner.transform.position.x, 0.1, this.owner.transform.position.z),
            new Laya.Vector3(p0.x, 0.1, p0.y),
            color,
            color
        );

        for (let i = 0; i < this.smoothedPath.length - 1; i++) {
            const startWorld = this.toWorldPoint(this.smoothedPath[i]);
            const endWorld = this.toWorldPoint(this.smoothedPath[i + 1]);

            this.m_lineRenderer.addLine(
                new Laya.Vector3(startWorld.x, 0.1, startWorld.y),
                new Laya.Vector3(endWorld.x, 0.1, endWorld.y),
                color,
                color
            );
        }
    }

    private getYAxisRotation(quaternion: Laya.Quaternion): number {
        const euler = new Laya.Vector3();
        quaternion.getYawPitchRoll(euler);
        return euler.y * (180 / Math.PI);
    }

    private applyOwnerPosition(): void {
        const owner = this.owner as Laya.Sprite3D;
        if (!(owner instanceof Laya.Sprite3D)) return;

        const pos = owner.transform.position.clone();
        pos.x = this.position.x;
        pos.z = this.position.y;
        owner.transform.position = pos;
    }

    private updateRotation(direction: Point, delta: number): void {
        const targetRotationRad = Math.atan2(direction.x, direction.y);
        const targetRotationDeg = (targetRotationRad * (180 / Math.PI)) + this.rotationOffset;
        let angleDiff = targetRotationDeg - this.m_currentRotation;

        while (angleDiff > 180) angleDiff -= 360;
        while (angleDiff < -180) angleDiff += 360;

        const maxRotation = this.rotationSpeed * delta;
        const rotationToApply = Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), maxRotation);

        this.m_currentRotation += rotationToApply;
        this.applyOwnerRotation();
    }

    private applyOwnerRotation(): void {
        const owner = this.owner as Laya.Sprite3D;
        if (!(owner instanceof Laya.Sprite3D)) return;

        const rotation = new Laya.Quaternion();
        Laya.Quaternion.createFromAxisAngle(
            new Laya.Vector3(0, 1, 0),
            this.m_currentRotation * (Math.PI / 180),
            rotation
        );
        owner.transform.rotation = rotation;
    }

    private toGridPoint(point: Point): Point {
        const tileSize = astar.main?.tileSize ?? 1;
        const col = Math.floor(point.x / tileSize);
        const row = Math.floor(point.y / tileSize);
        return { x: col, y: row };
    }

    private toWorldPoint(gridPoint: Point): Point {
        const tileSize = astar.main?.tileSize ?? 1;
        return {
            x: gridPoint.x * tileSize + tileSize * 0.5,
            y: gridPoint.y * tileSize + tileSize * 0.5,
        };
    }
}
