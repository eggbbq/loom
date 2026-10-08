import { AstarAreaComponent } from "../runtime/astar-area-component";
import {
    AstarBakeChunkData,
    AstarBakeComponent,
    AstarBakeData,
    AstarBakeObstacleData,
} from "../runtime/astar-bake-component";
import { AstarObstacleComponent } from "../runtime/astar-obstacle-component";


type MutableBakeChunk = {
    cx: number;
    cy: number;
    blockCounts: Map<number, number>;
    valid: boolean;
};

type AreaSnapshot = {
    area: AstarAreaComponent;
    bounds: Laya.BoundBox | null;
};

type ObstacleSnapshot = {
    obstacle: AstarObstacleComponent;
    bounds: Laya.BoundBox | null;
};

type BakeSnapshots = {
    areas: AreaSnapshot[];
    obstacles: ObstacleSnapshot[];
};

@IEditorEnv.customEditor(AstarBakeComponent)
export class AstarBakeEditorComponent extends IEditorEnv.CustomEditor {
    private m_data: AstarBakeData | null = null;
    private m_previewSignature = "";
    private readonly m_p0 = new Laya.Vector3();
    private readonly m_p1 = new Laya.Vector3();
    private readonly m_scale = new Laya.Vector3();
    private readonly m_blockMesh = Laya.PrimitiveMesh.createBox(1, 1, 1);

    onAwake(): void {
        const comp = this.comp as AstarBakeComponent;
        (comp as any)._bakeAstar = this.bake.bind(this);
    }

    onDrawGizmos(): void {
        const comp = this.comp as AstarBakeComponent;
        if (!comp.showAstarGizmos) return;
        const snapshots = comp.drawAreas || comp.drawObstacles || comp.drawBlocks
            ? this.collectSnapshots(comp)
            : { areas: [], obstacles: [] };

        this.drawGrid(comp);
        this.drawAreas(comp, snapshots.areas);
        this.drawObstacles(comp, snapshots.obstacles);
        this.refreshBlockPreview(comp, snapshots);
        this.drawBlocks(comp);
    }

    async bake(): Promise<void> {
        const comp = this.comp as AstarBakeComponent;
        if (!this.validateConfig(comp)) return;
        if (typeof EditorEnv === "undefined" || !EditorEnv.scene?.asset) return;

        const snapshots = this.collectSnapshots(comp);
        const data = this.createBakeData(comp, snapshots, true);
        const signature = this.createPreviewSignature(comp, snapshots);
        const file = this.getOutputFile(comp);
        await EditorEnv.runUIScript(
            "AstarBakeEditorService.writeFile",
            file,
            JSON.stringify(data),
        );

        this.m_data = data;
        this.m_previewSignature = signature;
        EditorEnv.d3Manager?.invalidateGizmos();
        const blockedCount = data.obstacle.reduce(
            (total, chunk) => total + chunk.blocks.length,
            0,
        );
        console.log(`寻路烘焙完成：${data.chunks.length} 个有效区块，${blockedCount} 个遮挡格，输出 ${file}`);
    }

    private createBakeData(comp: AstarBakeComponent, snapshots: BakeSnapshots, reportInvalidComponent: boolean): AstarBakeData {
        const minX = Math.min(comp.min.x, comp.max.x);
        const maxX = Math.max(comp.min.x, comp.max.x);
        const minZ = Math.min(comp.min.y, comp.max.y);
        const maxZ = Math.max(comp.min.y, comp.max.y);
        const startTileX = Math.floor(minX / comp.tileSize);
        const endTileX = Math.ceil(maxX / comp.tileSize) - 1;
        const startTileY = Math.floor(minZ / comp.tileSize);
        const endTileY = Math.ceil(maxZ / comp.tileSize) - 1;

        const startChunkX = Math.floor(startTileX / comp.chunkSize);
        const endChunkX = Math.floor(endTileX / comp.chunkSize);
        const startChunkY = Math.floor(startTileY / comp.chunkSize);
        const endChunkY = Math.floor(endTileY / comp.chunkSize);
        const chunkColumns = endChunkX - startChunkX + 1;
        const chunkWorldSize = comp.tileSize * comp.chunkSize;
        const chunks: MutableBakeChunk[] = [];

        for (let cy = startChunkY; cy <= endChunkY; cy++) {
            for (let cx = startChunkX; cx <= endChunkX; cx++) {
                chunks.push({ cx, cy, blockCounts: new Map<number, number>(), valid: false });
            }
        }

        for (const { area, bounds } of snapshots.areas) {
            if (!bounds) {
                if (reportInvalidComponent) {
                    console.warn(
                        `AstarAreaComponent 需要同节点 PhysicsCollider + BoxColliderShape: ${area.owner.name}`,
                    );
                }
                continue;
            }
            if (
                bounds.max.x <= minX || bounds.min.x >= maxX ||
                bounds.max.z <= minZ || bounds.min.z >= maxZ
            ) {
                continue;
            }

            const areaStartX = Math.max(startChunkX, Math.floor(bounds.min.x / chunkWorldSize));
            const areaEndX = Math.min(endChunkX, Math.ceil(bounds.max.x / chunkWorldSize) - 1);
            const areaStartY = Math.max(startChunkY, Math.floor(bounds.min.z / chunkWorldSize));
            const areaEndY = Math.min(endChunkY, Math.ceil(bounds.max.z / chunkWorldSize) - 1);

            for (let cy = areaStartY; cy <= areaEndY; cy++) {
                for (let cx = areaStartX; cx <= areaEndX; cx++) {
                    const chunkIndex = (cy - startChunkY) * chunkColumns + cx - startChunkX;
                    chunks[chunkIndex].valid = true;
                }
            }
        }

        for (const { obstacle, bounds } of snapshots.obstacles) {
            if (!bounds) {
                if (reportInvalidComponent) {
                    console.warn(
                        `AstarObstacleComponent 需要同节点 PhysicsCollider + BoxColliderShape: ${obstacle.owner.name}`,
                    );
                }
                continue;
            }
            if (
                bounds.max.x <= minX || bounds.min.x >= maxX ||
                bounds.max.z <= minZ || bounds.min.z >= maxZ
            ) {
                continue;
            }

            const obstacleStartX = Math.max(startTileX, Math.floor(bounds.min.x / comp.tileSize));
            const obstacleEndX = Math.min(endTileX, Math.ceil(bounds.max.x / comp.tileSize) - 1);
            const obstacleStartY = Math.max(startTileY, Math.floor(bounds.min.z / comp.tileSize));
            const obstacleEndY = Math.min(endTileY, Math.ceil(bounds.max.z / comp.tileSize) - 1);

            for (let tileY = obstacleStartY; tileY <= obstacleEndY; tileY++) {
                for (let tileX = obstacleStartX; tileX <= obstacleEndX; tileX++) {
                    const cx = Math.floor(tileX / comp.chunkSize);
                    const cy = Math.floor(tileY / comp.chunkSize);
                    const chunkIndex = (cy - startChunkY) * chunkColumns + cx - startChunkX;
                    const chunk = chunks[chunkIndex];
                    chunk.valid = true;

                    const lx = tileX - cx * comp.chunkSize;
                    const ly = tileY - cy * comp.chunkSize;
                    const block = ly * comp.chunkSize + lx;
                    chunk.blockCounts.set(block, (chunk.blockCounts.get(block) ?? 0) + 1);
                }
            }
        }

        const outputChunks: AstarBakeChunkData[] = chunks
            .filter((chunk) => chunk.valid)
            .map((chunk) => ({
                cx: chunk.cx,
                cy: chunk.cy,
            }));
        const outputObstacles: AstarBakeObstacleData[] = chunks
            .filter((chunk) => chunk.blockCounts.size > 0)
            .map((chunk) => {
                const blocks = Array.from(chunk.blockCounts.keys()).sort((a, b) => a - b);
                return {
                    cx: chunk.cx,
                    cy: chunk.cy,
                    blocks,
                    counts: blocks.map(block => chunk.blockCounts.get(block)!),
                };
            });

        return {
            version: 2,
            tileSize: comp.tileSize,
            chunkSize: comp.chunkSize,
            min: { x: minX, y: minZ },
            max: { x: maxX, y: maxZ },
            chunks: outputChunks,
            obstacle: outputObstacles,
        };
    }

    private collectSnapshots(comp: AstarBakeComponent): BakeSnapshots {
        const roots = comp.obstacleRoots.length > 0
            ? comp.obstacleRoots
            : [comp.owner.scene ?? comp.owner];
        const stack: Laya.Node[] = [];
        const visited = new Set<Laya.Node>();
        const areaSet = new Set<AstarAreaComponent>();
        const obstacleSet = new Set<AstarObstacleComponent>();

        for (const root of roots) {
            if (root && !root.destroyed) stack.push(root);
        }

        while (stack.length > 0) {
            const node = stack.pop()!;
            if (visited.has(node) || node.destroyed) continue;
            visited.add(node);

            const areas = node.getComponents(AstarAreaComponent) as AstarAreaComponent[];
            for (const area of areas) {
                if (area.enabled && !area.destroyed) areaSet.add(area);
            }

            const obstacles = node.getComponents(AstarObstacleComponent) as AstarObstacleComponent[];
            for (const obstacle of obstacles) {
                if (obstacle.enabled && !obstacle.destroyed) obstacleSet.add(obstacle);
            }

            for (const child of node.children) {
                stack.push(child);
            }
        }

        return {
            areas: Array.from(areaSet)
                .sort((a, b) => a.owner.id - b.owner.id)
                .map((area) => ({
                    area,
                    bounds: area.getWorldBounds(),
                })),
            obstacles: Array.from(obstacleSet)
                .sort((a, b) => a.owner.id - b.owner.id)
                .map((obstacle) => ({
                    obstacle,
                    bounds: obstacle.getWorldBounds(),
                })),
        };
    }

    private refreshBlockPreview(comp: AstarBakeComponent, snapshots: BakeSnapshots): void {
        if (!comp.drawBlocks) return;
        if (!this.validateConfig(comp, false)) {
            this.m_data = null;
            this.m_previewSignature = "";
            return;
        }

        const signature = this.createPreviewSignature(comp, snapshots);
        if (signature === this.m_previewSignature && this.m_data) return;

        this.m_previewSignature = signature;
        this.m_data = this.createBakeData(comp, snapshots, false);
    }

    private createPreviewSignature(comp: AstarBakeComponent, snapshots: BakeSnapshots): string {
        const parts: Array<string | number> = [
            comp.tileSize,
            comp.chunkSize,
            comp.min.x,
            comp.min.y,
            comp.max.x,
            comp.max.y,
        ];

        parts.push("areas");
        for (const { area, bounds } of snapshots.areas) {
            parts.push(area.owner.id);
            if (!bounds) {
                parts.push("invalid");
                continue;
            }
            parts.push(
                bounds.min.x,
                bounds.min.z,
                bounds.max.x,
                bounds.max.z,
            );
        }

        parts.push("obstacles");
        for (const { obstacle, bounds } of snapshots.obstacles) {
            parts.push(obstacle.owner.id);
            if (!bounds) {
                parts.push("invalid");
                continue;
            }
            parts.push(
                bounds.min.x,
                bounds.min.z,
                bounds.max.x,
                bounds.max.z,
            );
        }
        return parts.join("|");
    }

    private drawGrid(comp: AstarBakeComponent): void {
        if (!this.validateConfig(comp, false)) return;

        const minX = Math.min(comp.min.x, comp.max.x);
        const maxX = Math.max(comp.min.x, comp.max.x);
        const minZ = Math.min(comp.min.y, comp.max.y);
        const maxZ = Math.max(comp.min.y, comp.max.y);

        if (comp.drawChunkGrid) {
            this.drawGridLines(
                minX,
                maxX,
                minZ,
                maxZ,
                comp.gizmoY,
                comp.tileSize * comp.chunkSize,
                comp.chunkGridColor,
            );
        }

        if (comp.drawTileGrid) {
            this.drawGridLines(
                minX,
                maxX,
                minZ,
                maxZ,
                comp.gizmoY,
                comp.tileSize,
                comp.tileGridColor,
            );
        }

    }

    private drawGridLines(minX: number, maxX: number, minZ: number, maxZ: number, y: number, step: number, color: Laya.Color): void {
        const startX = Math.floor(minX / step) * step;
        const endX = Math.ceil(maxX / step) * step;
        const startZ = Math.floor(minZ / step) * step;
        const endZ = Math.ceil(maxZ / step) * step;

        for (let z = startZ; z <= endZ; z += step) {
            this.m_p0.set(minX, y, z);
            this.m_p1.set(maxX, y, z);
            IEditorEnv.Gizmos.drawLine(this.m_p0, this.m_p1, color);
        }
        for (let x = startX; x <= endX; x += step) {
            this.m_p0.set(x, y, minZ);
            this.m_p1.set(x, y, maxZ);
            IEditorEnv.Gizmos.drawLine(this.m_p0, this.m_p1, color);
        }
    }

    private drawAreas(comp: AstarBakeComponent, areas: AreaSnapshot[]): void {
        if (!comp.drawAreas) return;
        for (const { bounds } of areas) {
            if (bounds) IEditorEnv.Gizmos.drawBoundBox(bounds, comp.areaColor);
        }
    }

    private drawObstacles(comp: AstarBakeComponent, obstacles: ObstacleSnapshot[]): void {
        if (!comp.drawObstacles) return;
        for (const { bounds } of obstacles) {
            if (bounds) IEditorEnv.Gizmos.drawBoundBox(bounds, comp.obstacleColor);
        }
    }

    private drawBlocks(comp: AstarBakeComponent): void {
        if (!comp.drawBlocks || !this.m_data) return;

        const tileSize = this.m_data.tileSize;
        const blockSize = tileSize * 0.92;
        const blockHeight = Math.max(tileSize * 0.05, 0.002);
        this.m_scale.set(blockSize, blockHeight, blockSize);
        for (const chunk of this.m_data.obstacle) {
            for (const block of chunk.blocks) {
                const lx = block % this.m_data.chunkSize;
                const ly = Math.floor(block / this.m_data.chunkSize);
                const tileX = chunk.cx * this.m_data.chunkSize + lx;
                const tileY = chunk.cy * this.m_data.chunkSize + ly;
                this.m_p0.set(
                    (tileX + 0.5) * tileSize,
                    comp.gizmoY + blockHeight * 0.5 + 0.001,
                    (tileY + 0.5) * tileSize,
                );
                IEditorEnv.Gizmos.drawMesh(
                    this.m_blockMesh,
                    0,
                    this.m_p0,
                    Laya.Quaternion.DEFAULT,
                    this.m_scale,
                    comp.blockColor,
                );
            }
        }
    }

    private getOutputFile(comp: AstarBakeComponent): string {
        const sceneName = EditorEnv.scene.asset.name;
        const outputPath = comp.outputPath.replace(/\\/g, "/").replace(/\/+$/, "");
        return outputPath ? `${outputPath}/${sceneName}.json` : `${sceneName}.json`;
    }

    private validateConfig(comp: AstarBakeComponent, reportError = true): boolean {
        if (comp.tileSize <= 0 || comp.chunkSize <= 0) {
            if (reportError) console.error("tileSize 和 chunkSize 必须大于 0");
            return false;
        }
        if (comp.min.x === comp.max.x || comp.min.y === comp.max.y) {
            if (reportError) console.error("烘焙范围不能为空");
            return false;
        }
        return true;
    }
}
