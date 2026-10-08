import { ChunkedWalkableWorld, ChunkWalkabilityLayers, FindPathOptions, InfiniteAStarGrid, PathResult, Point } from "./astar";
import { utils } from "./utils";

const { regClass, property } = Laya;

export const ASTAR_CHUNKS_CHANGED = "astar-chunks-changed";

export type LoadedAstarChunk = {
    cx: number;
    cy: number;
} & ChunkWalkabilityLayers;

let m_main: AstarChunkComponent | null = null;
export const astar = {
    get main(): AstarChunkComponent | null {
        if (!m_main) console.error("Pathfinding.main is not set");
        return m_main;
    },
} as const;


@regClass()
export class AstarChunkComponent extends Laya.Script {

    @property({ type: Number, tips: "区块尺寸", min: 1, step: 1 }) chunkSize = 64;
    @property({ type: Number, tips: "格子尺寸", min: 0.1, step: 0.05, fractionDigits: 2 }) tileSize = 0.1;
    @property({ type: Number, tips: "寻路窗口宽度", min: 1, step: 1 }) windowWidth = 128;
    @property({ type: Number, tips: "寻路窗口高度", min: 1, step: 1 }) windowHeight = 96;
    @property({ type: Number, tips: "区块加载半径", min: 0, step: 1 }) loadRadiusInChunks = 2;
    @property({ type: Boolean, tips: "自动卸载范围外区块" }) unloadOutsideRadius = false;
    @property({ type: Boolean, tips: "允许斜向移动" }) allowDiagonal = false;
    @property({ type: Boolean, tips: "禁止斜穿拐角" }) preventCornerCutting = true;
    @property({ type: Boolean, tips: "输出寻路调试日志" }) debugFindPath = false;

    private m_chunks = new Map<number, ChunkWalkabilityLayers>();
    private m_dynamicBlockDeltas = new Map<number, Int32Array>();
    private m_world!: ChunkedWalkableWorld;
    private m_astar!: InfiniteAStarGrid;
    private m_chunkX: number | undefined = undefined;
    private m_chunkY: number | undefined = undefined;

    private m_inited: boolean = false;
    get inited() { return this.m_inited; }

    onAwake(): void {
        if (m_main && m_main !== this) {
            console.warn("PathfindingChunkComponent: overriding existing main instance");
        }
        m_main = this;
    }

    onDestroy(): void {
        if (m_main === this) {
            m_main = null;
        }
    }

    setChunk(cx: number, cy: number, walkable: Uint8Array): void {
        this.setChunkLayers(cx, cy, walkable, new Uint16Array(walkable.length));
    }

    setChunkLayers(cx: number, cy: number, staticWalkable: Uint8Array, dynamicBlockCount: Uint16Array): void {
        const cellCount = this.chunkSize * this.chunkSize;
        if (staticWalkable.length !== cellCount) throw new Error("staticWalkable length must equal chunkSize * chunkSize");
        if (dynamicBlockCount.length !== cellCount) throw new Error("dynamicBlockCount length must equal chunkSize * chunkSize");

        const key = utils.coordPack(cx, cy);
        const effectiveDynamicBlockCount = new Uint16Array(dynamicBlockCount);
        const deltas = this.m_dynamicBlockDeltas.get(key);
        if (deltas) {
            if (deltas.length !== cellCount) {
                throw new Error("chunkSize changed while dynamic block deltas still exist; call clearChunks() before changing chunkSize");
            }
            this.applyDynamicBlockDeltas(effectiveDynamicBlockCount, deltas, cx, cy);
        }

        this.m_chunks.set(key, {
            staticWalkable,
            dynamicBlockCount: effectiveDynamicBlockCount,
        });
        this.notifyChunksChanged();
    }

    delChunk(cx: number, cy: number): void {
        if (!this.m_chunks.delete(utils.coordPack(cx, cy))) return;
        this.notifyChunksChanged();
    }

    clearChunks(clearDynamicBlockDeltas = true): void {
        const changed = this.m_chunks.size > 0 || (clearDynamicBlockDeltas && this.m_dynamicBlockDeltas.size > 0);
        if (!changed) return;
        this.m_chunks.clear();
        if (clearDynamicBlockDeltas) this.m_dynamicBlockDeltas.clear();
        this.notifyChunksChanged();
    }

    getChunk(cx: number, cy: number): ChunkWalkabilityLayers | undefined {
        return this.m_chunks.get(utils.coordPack(cx, cy));
    }

    changeDynamicBlockCountInWorldBounds(minX: number, minZ: number, maxX: number, maxZ: number, delta: number): number {
        if (!Number.isInteger(delta) || delta === 0) throw new Error("dynamic block delta must be a non-zero integer");

        const startTileX = Math.floor(Math.min(minX, maxX) / this.tileSize);
        const endTileX = Math.ceil(Math.max(minX, maxX) / this.tileSize) - 1;
        const startTileY = Math.floor(Math.min(minZ, maxZ) / this.tileSize);
        const endTileY = Math.ceil(Math.max(minZ, maxZ) / this.tileSize) - 1;
        if (endTileX < startTileX || endTileY < startTileY) return 0;

        let affectedCells = 0;
        for (let tileY = startTileY; tileY <= endTileY; tileY++) {
            for (let tileX = startTileX; tileX <= endTileX; tileX++) {
                this.changeDynamicBlockCountAtGrid(tileX, tileY, delta);
                affectedCells++;
            }
        }

        this.notifyChunksChanged();
        return affectedCells;
    }

    getChunkCount(): number {
        return this.m_chunks.size;
    }

    getCenterChunk(): { cx: number; cy: number } | null {
        if (this.m_chunkX === undefined || this.m_chunkY === undefined) return null;
        return { cx: this.m_chunkX, cy: this.m_chunkY };
    }

    getLoadedChunks(): LoadedAstarChunk[] {
        const result: LoadedAstarChunk[] = [];
        this.forEachChunk((cx, cy, layers) => {
            result.push({ cx, cy, ...layers });
        });
        return result;
    }

    forEachChunk(callback: (cx: number, cy: number, layers: ChunkWalkabilityLayers) => void): void {
        for (const [key, layers] of this.m_chunks.entries()) {
            const [cx, cy] = utils.coordUnpack(key);
            callback(cx, cy, layers);
        }
    }

    isWalkableGridPoint(x: number, y: number): boolean {
        return this.m_world.isWalkable(x, y);
    }

    isWalkableWorldPoint(point: Point): boolean {
        const gridX = utils.worldToTS(point.x, this.tileSize);
        const gridY = utils.worldToTS(point.y, this.tileSize);
        return this.isWalkableGridPoint(gridX, gridY);
    }

    updateCenterByWorldPosition(position: Point): void {
        const cx = utils.worldToChunk(position.x, this.tileSize, this.chunkSize);
        const cy = utils.worldToChunk(position.y, this.tileSize, this.chunkSize);
        if (this.m_chunkX === cx && this.m_chunkY === cy) return;
        this.m_chunkX = cx;
        this.m_chunkY = cy;
        if (!this.unloadOutsideRadius) return;

        this.unloadChunksOutsideRadius(cx, cy);
    }

    private _tempP0 = { x: 0, y: 0 };
    private _tempP1 = { x: 0, y: 0 };
    findPath(startWorld: Point, endWorld: Point, options: FindPathOptions = {}): PathResult {
        const start = utils.worldToTSPoint(startWorld, this.tileSize, this._tempP0);
        const end = utils.worldToTSPoint(endWorld, this.tileSize, this._tempP1);
        const result = this.m_astar.findPath(start, end, options);

        if (this.debugFindPath) {
            const resolvedEnd = result.resolvedEnd ? `(${result.resolvedEnd.x}, ${result.resolvedEnd.y})` : "none";
            console.log(
                `PathfindingChunkComponent: chunks=${this.m_chunks.size}, start=(${start.x}, ${start.y}), end=(${end.x}, ${end.y}), ` +
                `found=${result.found}, reachedTarget=${result.reachedTarget}, resolvedEnd=${resolvedEnd}, path=${result.path.length}`,
            );
        }

        return result;
    }

    getWorld(): ChunkedWalkableWorld {
        return this.m_world;
    }

    rebuild(): void {
        this.m_inited = true;
        this.m_world = new ChunkedWalkableWorld({
            chunkSize: this.chunkSize,
            getChunk: (cx, cy) => this.getChunk(cx, cy),
            unloadedIsWalkable: false,
        });

        this.m_astar = new InfiniteAStarGrid({
            windowWidth: this.windowWidth,
            windowHeight: this.windowHeight,
            allowDiagonal: this.allowDiagonal,
            preventCornerCutting: this.preventCornerCutting,
            isWalkableWorld: (x, y) => this.m_world.isWalkable(x, y),
        });
        this.notifyChunksChanged();
    }

    private unloadChunksOutsideRadius(centerCx: number, centerCy: number): void {
        let changed = false;
        for (const key of this.m_chunks.keys()) {
            const [cx, cy] = utils.coordUnpack(key);
            const outside = Math.abs(cx - centerCx) > this.loadRadiusInChunks || Math.abs(cy - centerCy) > this.loadRadiusInChunks;

            if (outside) {
                this.m_chunks.delete(key);
                changed = true;
            }
        }

        if (changed) {
            this.notifyChunksChanged();
        }
    }

    private changeDynamicBlockCountAtGrid(gridX: number, gridY: number, delta: number): void {
        const cx = Math.floor(gridX / this.chunkSize);
        const cy = Math.floor(gridY / this.chunkSize);
        const lx = ((gridX % this.chunkSize) + this.chunkSize) % this.chunkSize;
        const ly = ((gridY % this.chunkSize) + this.chunkSize) % this.chunkSize;
        const index = ly * this.chunkSize + lx;
        const key = utils.coordPack(cx, cy);

        let deltas = this.m_dynamicBlockDeltas.get(key);
        if (!deltas) {
            deltas = new Int32Array(this.chunkSize * this.chunkSize);
            this.m_dynamicBlockDeltas.set(key, deltas);
        }
        deltas[index] += delta;

        const chunk = this.m_chunks.get(key);
        if (!chunk) return;
        const next = chunk.dynamicBlockCount[index] + delta;
        chunk.dynamicBlockCount[index] = Math.max(0, Math.min(0xffff, next));
    }

    private applyDynamicBlockDeltas(target: Uint16Array, deltas: Int32Array, cx: number, cy: number): void {
        for (let index = 0; index < target.length; index++) {
            const delta = deltas[index];
            if (delta === 0) continue;
            const next = target[index] + delta;
            if (next < 0 || next > 0xffff) {
                console.warn(`Astar dynamic block count clamped in chunk (${cx}, ${cy}), cell=${index}, base=${target[index]}, delta=${delta}`);
            }
            target[index] = Math.max(0, Math.min(0xffff, next));
        }
    }

    private notifyChunksChanged(): void {
        this.owner.event(ASTAR_CHUNKS_CHANGED, this);
    }
}
