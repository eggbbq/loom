import type { Point } from "./astar";
import type { IPathSmoother, IWalkabilityGrid, PathSmoothingGridOptions } from "./types";

const { regClass, property } = Laya;

@regClass()
@Laya.classInfo({ menu: "loom/pathfinding" })
export class AstarPathSmootherComponent extends Laya.Script implements IPathSmoother {
    @property({ type: Boolean }) enableSmoothing = true;
    @property({ type: Number, min: 0.1, max: 2, step: 0.1 }) tolerance = 0.3;
    @property({ type: Boolean }) removeRedundantPoints = true;
    @property({ type: Boolean }) allowDiagonalMovement = true;
    @property({ type: Boolean, caption: "禁止平滑路径斜穿墙角" }) preventCornerCutting = true;

    protected tileSize = 0.1;
    protected grid: IWalkabilityGrid | null = null;

    public smoothPath(originalPath: Point[]): Point[] {
        if (!this.enableSmoothing || originalPath.length <= 2) {
            return [...originalPath];
        }
        if (!this.grid) return [...originalPath];

        let smoothedPath = [...originalPath];

        if (this.removeRedundantPoints) {
            smoothedPath = this.removeRedundantPathPoints(smoothedPath);
        }

        smoothedPath = this.applySmoothingAlgorithm(smoothedPath);
        if (!this.hasMatchingEndpoints(originalPath, smoothedPath)) return [...originalPath];
        const validatedPath = this.validatePath(smoothedPath);

        return validatedPath.length > 0 ? validatedPath : [...originalPath];
    }

    public setGridParameters(tileSize: number, grid: IWalkabilityGrid, options: PathSmoothingGridOptions = {}): void {
        this.tileSize = tileSize;
        this.grid = grid;
        if (options.allowDiagonalMovement !== undefined) this.allowDiagonalMovement = options.allowDiagonalMovement;
        if (options.preventCornerCutting !== undefined) this.preventCornerCutting = options.preventCornerCutting;
    }

    public getDirection(currentPos: Point, targetPos: Point): Point {
        const dx = targetPos.x - currentPos.x;
        const dy = targetPos.y - currentPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance === 0) {
            return { x: 0, y: 0 };
        }

        return {
            x: dx / distance,
            y: dy / distance,
        };
    }

    protected applySmoothingAlgorithm(path: Point[]): Point[] {
        (typeof $env !== "undefined" && $env.debug) && console.log('Please implement this method in subclass');
        return path;
    }

    protected removeRedundantPathPoints(path: Point[]): Point[] {
        if (path.length <= 2) return path;

        const result: Point[] = [path[0]];

        for (let i = 1; i < path.length - 1; i++) {
            const prev = result[result.length - 1];
            const curr = path[i];
            const next = path[i + 1];

            const crossProduct = (curr.x - prev.x) * (next.y - curr.y) - (curr.y - prev.y) * (next.x - curr.x);

            if (Math.abs(crossProduct) > this.tolerance) {
                result.push(curr);
            }
        }

        result.push(path[path.length - 1]);
        return result;
    }

    protected validatePath(path: Point[]): Point[] {
        if (!this.grid) return path;
        for (let index = 0; index < path.length; index++) {
            if (!this.isGridPointWalkable(path[index])) return [];
            if (index > 0 && !this.isGridSegmentWalkable(path[index - 1], path[index])) return [];
        }
        return path;
    }

    protected isGridPointWalkable(gridPoint: Point): boolean {
        return this.isGridCellWalkable(gridPoint.x, gridPoint.y);
    }

    protected isGridCellWalkable(x: number, y: number): boolean {
        if (!this.grid) return false;

        if (this.grid.width !== undefined && this.grid.height !== undefined &&
            (x < 0 || x >= this.grid.width || y < 0 || y >= this.grid.height)) {
            return false;
        }

        return this.grid.isWalkable(x, y);
    }

    protected hasLineOfSight(from: Point, to: Point): boolean {
        if (!this.grid) return false;
        return this.isGridSegmentWalkable(this.toGridPoint(from), this.toGridPoint(to));
    }

    protected isGridSegmentWalkable(from: Point, to: Point): boolean {
        if (!this.grid) return false;
        if (!Number.isInteger(from.x) || !Number.isInteger(from.y) || !Number.isInteger(to.x) || !Number.isInteger(to.y)) return false;
        if (!this.isGridPointWalkable(from) || !this.isGridPointWalkable(to)) return false;

        const deltaX = to.x - from.x;
        const deltaY = to.y - from.y;
        if (deltaX === 0 && deltaY === 0) return true;
        if (!this.allowDiagonalMovement && deltaX !== 0 && deltaY !== 0) return false;

        const stepX = Math.sign(deltaX);
        const stepY = Math.sign(deltaY);
        const absoluteX = Math.abs(deltaX);
        const absoluteY = Math.abs(deltaY);
        const tDeltaX = absoluteX > 0 ? 1 / absoluteX : Number.POSITIVE_INFINITY;
        const tDeltaY = absoluteY > 0 ? 1 / absoluteY : Number.POSITIVE_INFINITY;
        let tMaxX = absoluteX > 0 ? 0.5 / absoluteX : Number.POSITIVE_INFINITY;
        let tMaxY = absoluteY > 0 ? 0.5 / absoluteY : Number.POSITIVE_INFINITY;
        let x = from.x;
        let y = from.y;

        while (x !== to.x || y !== to.y) {
            const cornerDistance = tMaxX - tMaxY;
            if (Math.abs(cornerDistance) <= 1e-12) {
                if (this.preventCornerCutting &&
                    (!this.isGridCellWalkable(x + stepX, y) || !this.isGridCellWalkable(x, y + stepY))) {
                    return false;
                }
                x += stepX;
                y += stepY;
                tMaxX += tDeltaX;
                tMaxY += tDeltaY;
            } else if (cornerDistance < 0) {
                x += stepX;
                tMaxX += tDeltaX;
            } else {
                y += stepY;
                tMaxY += tDeltaY;
            }

            if (!this.isGridCellWalkable(x, y)) return false;
        }

        return true;
    }

    protected toGridPoint(point: Point): Point {
        return {
            x: Math.floor(point.x / this.tileSize),
            y: Math.floor(point.y / this.tileSize),
        };
    }

    protected toWorldPoint(gridPoint: Point): Point {
        return {
            x: gridPoint.x * this.tileSize + this.tileSize * 0.5,
            y: gridPoint.y * this.tileSize + this.tileSize * 0.5,
        };
    }

    private hasMatchingEndpoints(originalPath: Point[], smoothedPath: Point[]): boolean {
        if (originalPath.length === 0 || smoothedPath.length === 0) return originalPath.length === smoothedPath.length;
        const originalStart = originalPath[0];
        const originalEnd = originalPath[originalPath.length - 1];
        const smoothedStart = smoothedPath[0];
        const smoothedEnd = smoothedPath[smoothedPath.length - 1];
        return originalStart.x === smoothedStart.x && originalStart.y === smoothedStart.y &&
            originalEnd.x === smoothedEnd.x && originalEnd.y === smoothedEnd.y;
    }
}
