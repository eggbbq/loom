import { Point } from "./astar";

const _corner = new Laya.Vector3();
const _temp = new Laya.Vector3();

function transformBoundBox(source: Laya.BoundBox, matrix: Laya.Matrix4x4, out: Laya.BoundBox): void {
    const xs = [source.min.x, source.max.x];
    const ys = [source.min.y, source.max.y];
    const zs = [source.min.z, source.max.z];
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (const x of xs) {
        for (const y of ys) {
            for (const z of zs) {
                _corner.setValue(x, y, z);
                Laya.Vector3.transformV3ToV3(_corner, matrix, _temp);
                if (_temp.x < minX) minX = _temp.x;
                if (_temp.x > maxX) maxX = _temp.x;
                if (_temp.y < minY) minY = _temp.y;
                if (_temp.y > maxY) maxY = _temp.y;
                if (_temp.z < minZ) minZ = _temp.z;
                if (_temp.z > maxZ) maxZ = _temp.z;
            }
        }
    }
    out.min.setValue(minX, minY, minZ);
    out.max.setValue(maxX, maxY, maxZ);
}

function coordPack(cx: number, cy: number): number {
    return cx * 0x100000000 + (cy >>> 0);
}

function coordUnpack(key: number): [number, number] {
    const cx = Math.floor(key / 0x100000000);
    const cy = key | 0;
    return [cx, cy];
}

function worldToTS(x: number, gridSize: number): number {
    return Math.floor(x / gridSize);
}

function TSToChunk(x: number, chunkSize: number): number {
    return Math.floor(x / chunkSize);
}

function worldToChunkPoint(p: Point, tileSize: number, chunkSize: number, out:Point): Point {
    out.x = TSToChunk(worldToTS(p.x, tileSize), chunkSize);
    out.y = TSToChunk(worldToTS(p.y, tileSize), chunkSize);
    return out;
}

function worldToTSPoint(p: Point, gridSize: number, out:Point): Point {
    out.x = worldToTS(p.x, gridSize);
    out.y = worldToTS(p.y, gridSize);
    return out;
}

function worldToChunk(x: number, tileSize:number, chunkSize: number): number {
    return TSToChunk(worldToTS(x, tileSize), chunkSize);
}

export const utils = {
    coordPack,
    coordUnpack,
    worldToTS,
    TSToChunk,
    worldToChunk,
    worldToChunkPoint,
    worldToTSPoint,
    transformBoundBox,
} as const;
