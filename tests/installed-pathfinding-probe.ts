import { AStarGrid, AstarChunkComponent, AstarAgentComponent, AstarPathLineSmootherComponent, AstarBakeComponent, AstarAreaComponent, AstarObstacleComponent, utils } from "~/packages/loom.pathfinding";
import { AstarBakeEditorComponent } from "~/packages/loom.pathfinding/editor/astar-bake-editor-component";

function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

@IEditorEnv.regClass()
export class InstalledPathfindingProbe {
    static verify(): void {
        check(loom.AStarGrid === AStarGrid && loom.AstarAgentComponent === AstarAgentComponent && loom.CameraRef, "Package API/dependency not ready");
        const grid = new AStarGrid({ width: 4, height: 4, walkable: new Uint8Array(16).fill(1), allowDiagonal: true, preventCornerCutting: true });
        check(grid.findPath({ x: 0, y: 0 }, { x: 3, y: 3 }).reachedTarget, "Fixed-grid route failed");
        const owner = new Laya.Sprite3D();
        const nav = owner.addComponent(AstarChunkComponent);
        nav.onAwake(); nav.chunkSize = 4; nav.tileSize = 1; nav.rebuild();
        nav.setChunk(-1, 0, new Uint8Array(16).fill(1));
        nav.setChunk(0, 0, new Uint8Array(16).fill(1));
        check(nav.findPath({ x: -2.5, y: 0.5 }, { x: 2.5, y: 0.5 }).reachedTarget, "Negative-coordinate cross-chunk route failed");
        nav.changeDynamicBlockCountInWorldBounds(2, 0, 3, 1, 1);
        check(!nav.isWalkableWorldPoint({ x: 2.5, y: 0.5 }), "Dynamic obstacle count ignored");
        const nearest = nav.findPath({ x: -2.5, y: 0.5 }, { x: 2.5, y: 0.5 }, { findNearestReachable: true });
        check(nearest.found && !nearest.reachedTarget, "Nearest reachable fallback failed");
        nav.delChunk(0, 0); nav.setChunk(0, 0, new Uint8Array(16).fill(1));
        check(!nav.isWalkableWorldPoint({ x: 2.5, y: 0.5 }), "Chunk reload lost dynamic block deltas");
        nav.changeDynamicBlockCountInWorldBounds(2, 0, 3, 1, -1);
        check(nav.isWalkableWorldPoint({ x: 2.5, y: 0.5 }), "Obstacle release failed");
        const smoother = owner.addComponent(AstarPathLineSmootherComponent);
        smoother.setGridParameters(1, nav.getWorld(), { allowDiagonalMovement: true });
        const path = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }];
        check(smoother.smoothPath(path).length === 2, "Native path smoothing failed");
        const bakedOwner = new Laya.Sprite3D(), areaOwner = new Laya.Sprite3D(), obstacleOwner = new Laya.Sprite3D();
        const baker = bakedOwner.addComponent(AstarBakeComponent);
        baker.tileSize = 1; baker.chunkSize = 4; baker.min.setValue(0, 0); baker.max.setValue(4, 4);
        const area = areaOwner.addComponent(AstarAreaComponent), obstacle = obstacleOwner.addComponent(AstarObstacleComponent);
        const editor = new AstarBakeEditorComponent();
        const data = (editor as any).createBakeData(baker, {
            areas: [{ area, bounds: new Laya.BoundBox(new Laya.Vector3(0, 0, 0), new Laya.Vector3(4, 1, 4)) }],
            obstacles: [{ obstacle, bounds: new Laya.BoundBox(new Laya.Vector3(1, 0, 1), new Laya.Vector3(2, 1, 2)) }],
        }, true);
        check(data.version === 2 && data.chunks.length === 1 && data.obstacle[0].blocks[0] === 5 && data.obstacle[0].counts[0] === 1, "Installed Scene bake changed JSON format/cell counts");
        const packed = utils.coordPack(-2, -3), unpacked = utils.coordUnpack(packed);
        check(unpacked[0] === -2 && unpacked[1] === -3, "Coordinate helper export failed");
        for (const node of [owner, bakedOwner, areaOwner, obstacleOwner]) node.destroy();
        console.log("Installed pathfinding: dependency/API identity, fixed and cross-chunk routes, negative coordinates, dynamic obstacles/reload, nearest target, smoothing and native Scene bake passed.");
    }
}
