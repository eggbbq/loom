import { AstarAgentComponent, AstarAgentEvent } from "./astar-agent-component";

import type { AstarBakeData } from "./astar-bake-component";
import { astar } from "./astar-chunk-component";

const { regClass, property } = Laya;

@regClass()
export class AstarExampleComponent extends Laya.Script {
    declare owner: Laya.Sprite3D;
    @property({ type: AstarAgentComponent }) public agent: AstarAgentComponent | null = null;
    @property({ type: Laya.TextResource }) public astarData: Laya.TextResource | null = null;

    private _downPosition: Laya.Vector2 = new Laya.Vector2();
    private _downTime: number = 0;
    private onStageMouseDown(): void {
        if (loom.uif.isPointerOverUI()) return;

        if (!this.agent) return;
        this._downPosition.setValue(Laya.stage.mouseX, Laya.stage.mouseY);
        this._downTime = Date.now();
    }


    private _targetPos: Laya.Vector3 = new Laya.Vector3();
    private onStageMouseUp(): void {
        if (loom.uif.isPointerOverUI()) return;
        console.log("????????")
        if (Date.now() - this._downTime > 500) return;
        if (!this.agent) return;

        if (Math.abs(this._downPosition.x - Laya.stage.mouseX) > 10 ||
            Math.abs(this._downPosition.y - Laya.stage.mouseY) > 10) {
            return;
        }

        const ray = new Laya.Ray(new Laya.Vector3(0, 0, 0), new Laya.Vector3(0, 0, 0));
        loom.CameraRef.main.viewportPointToRay(new Laya.Vector2(Laya.stage.mouseX, Laya.stage.mouseY), ray);
        const scene = this.owner.scene as Laya.Scene3D | null;
        if (!scene) return;

        const hit = new Laya.HitResult();
        const pos = this._targetPos;
        let dirx = 0;
        let dirz = 0;
        if (scene.physicsSimulation.rayCast(ray, hit) && hit.point.y > 0.1) {
            const owner = hit.collider.owner as Laya.Sprite3D;
            const stand = owner.findChild("stand") as Laya.Sprite3D;
            if (stand) {
                console.log("找到stand对象:", stand.name);
                pos.setValue(stand.transform.position.x, 0, stand.transform.position.z);
            } else {
                pos.setValue(hit.point.x, 0, hit.point.z);
            }
            // return;
        } else {
            loom.mathf.intersectYPlane(ray, 0, pos);
        }

        this.startMove();
    }

    private startMove() {
        const hasPath = this.agent.setTarget({ x: this._targetPos.x, y: this._targetPos.z }, { findNearestReachable: true });
        if (!hasPath) {
            console.log("无法找到路径");
        } else {
            const arr = this.agent.path;
            const last = arr[arr.length - 1];
            const last2 = arr[Math.max(0, arr.length - 2)];
            this._targetPos.x += (last.x - last2.x) * 10;
            this._targetPos.z += (last.y - last2.y) * 10;
        }
    }

    onStart(): void {
        if (!this.initializeAstar()) return;
        if (!this.agent) return;
        // Laya.stage.on(Laya.Event.MOUSE_DOWN, this, this.onStageMouseDown);
        // Laya.stage.on(Laya.Event.MOUSE_UP, this, this.onStageMouseUp);
    }

    onEnable(): void {
        if (!this.agent) return;
        Laya.stage.on(Laya.Event.MOUSE_DOWN, this, this.onStageMouseDown);
        Laya.stage.on(Laya.Event.MOUSE_UP, this, this.onStageMouseUp);
        this.owner.on(AstarAgentEvent.Arrived, this, this.onArrived);
    }

    onDisable(): void {
        Laya.stage.off(Laya.Event.MOUSE_DOWN, this, this.onStageMouseDown);
        Laya.stage.off(Laya.Event.MOUSE_UP, this, this.onStageMouseUp);
        this.owner.off(AstarAgentEvent.Arrived, this, this.onArrived);
    }

    private onArrived(): void {
        const position = this.owner.transform.position;
        const deltaX = this._targetPos.x - position.x;
        const deltaZ = this._targetPos.z - position.z;
        if (deltaX === 0 && deltaZ === 0) return;
        this.owner.transform.objLookat(this._targetPos, Laya.Vector3.Up);
    }

    private initializeAstar(): boolean {
        if (!this.astarData) {
            console.error("AstarExampleComponent: astarData is not set");
            return false;
        }

        let data: AstarBakeData;
        try {
            const rawData = this.astarData.data;
            data = (typeof rawData === "string" ? JSON.parse(rawData) : rawData) as AstarBakeData;
        } catch (error) {
            console.error("AstarExampleComponent: failed to parse astarData", error);
            return false;
        }

        if (!this.isValidAstarData(data)) {
            console.error("AstarExampleComponent: invalid astarData");
            return false;
        }

        const nav = astar.main;
        if (!nav) {
            console.error("AstarExampleComponent: AstarChunkComponent is missing");
            return false;
        }

        nav.clearChunks();
        nav.tileSize = data.tileSize;
        nav.chunkSize = data.chunkSize;
        nav.rebuild();

        const obstacleByChunk = new Map(data.obstacle.map(item => [`${item.cx},${item.cy}`, item] as const));
        const chunkCellCount = data.chunkSize * data.chunkSize;

        for (const chunk of data.chunks) {
            const staticWalkable = new Uint8Array(chunkCellCount).fill(1);
            const dynamicBlockCount = new Uint16Array(chunkCellCount);
            const obstacle = obstacleByChunk.get(`${chunk.cx},${chunk.cy}`);
            const blocks = obstacle?.blocks ?? [];

            for (let index = 0; index < blocks.length; index++) {
                const block = blocks[index];
                if (!Number.isInteger(block) || block < 0 || block >= chunkCellCount) {
                    console.warn(
                        `AstarExampleComponent: ignored invalid block ${block} in chunk (${chunk.cx}, ${chunk.cy})`,
                    );
                    continue;
                }
                dynamicBlockCount[block] = data.version === 2 ? obstacle!.counts![index] : 1;
            }

            nav.setChunkLayers(chunk.cx, chunk.cy, staticWalkable, dynamicBlockCount);
        }

        return true;
    }

    private isValidAstarData(value: unknown): value is AstarBakeData {
        if (!value || typeof value !== "object") return false;
        const data = value as Partial<AstarBakeData>;

        return (data.version === 1 || data.version === 2)
            && Number.isFinite(data.tileSize)
            && data.tileSize! > 0
            && Number.isInteger(data.chunkSize)
            && data.chunkSize! > 0
            && Array.isArray(data.chunks)
            && data.chunks.every(chunk =>
                !!chunk
                && Number.isInteger(chunk.cx)
                && Number.isInteger(chunk.cy)
            )
            && Array.isArray(data.obstacle)
            && data.obstacle.every(item =>
                !!item
                && Number.isInteger(item.cx)
                && Number.isInteger(item.cy)
                && Array.isArray(item.blocks)
                && (data.version === 1
                    || (Array.isArray(item.counts)
                        && item.counts.length === item.blocks.length
                        && item.counts.every(count => Number.isInteger(count) && count > 0 && count <= 0xffff)))
            );
    }
}
