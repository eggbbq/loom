import type { ChunkWalkabilityLayers, Point } from "./astar";

export type PathSmoothingGridOptions = {
    allowDiagonalMovement?: boolean;
    preventCornerCutting?: boolean;
};

export interface IWalkabilityGrid {
    readonly width?: number;
    readonly height?: number;
    isWalkable(x: number, y: number): boolean;
}

export interface IPathSmoother {
    smoothPath(originalPath: Point[]): Point[];
    setGridParameters(tileSize: number, grid: IWalkabilityGrid, options?: PathSmoothingGridOptions): void;
    getDirection(currentPos: Point, targetPos: Point): Point;
}

export interface IWorldAstarController {
    readonly inited: boolean;
    init(): void;
    updateByWorldPosition(x:number, y:number): void;
    setChunkData(cx: number, cy: number, layers: ChunkWalkabilityLayers): void;
    delChunkData(cx: number, cy: number): void;
    clearChunks(): void;
}
