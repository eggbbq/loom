const { regClass, runInEditor, property } = Laya;

export type AstarBakeChunkData = {
    cx: number;
    cy: number;
};

export type AstarBakeObstacleData = AstarBakeChunkData & {
    blocks: number[];
    /** 与 blocks 一一对应，表示每个格子上的动态障碍数量。version 1 数据中可以缺省。 */
    counts?: number[];
};

export type AstarBakeData = {
    version: 1 | 2;
    tileSize: number;
    chunkSize: number;
    min: { x: number; y: number };
    max: { x: number; y: number };
    chunks: AstarBakeChunkData[];
    obstacle: AstarBakeObstacleData[];
};

@runInEditor
@regClass()
@Laya.classInfo({ menu: "loom/pathfinding" })
export class AstarBakeComponent extends Laya.Script {
    declare owner: Laya.Sprite3D;

    @property({ type: Number, min: 0.01, step: 0.01, fractionDigits: 2 })
    tileSize = 0.2;

    @property({ type: Number, min: 1, step: 1 })
    chunkSize = 64;

    @property({ type: Laya.Vector2 })
    min = new Laya.Vector2(-64, -64);

    @property({ type: Laya.Vector2 })
    max = new Laya.Vector2(64, 64);

    @property({ type: [Laya.Sprite3D] })
    obstacleRoots: Laya.Sprite3D[] = [];

    @property({ type: String })
    outputPath = "data/pathfinding";

    @property({
        type: Boolean,
        caption: "显示 AStar 预览",
        tips: "总开关。开启后无需选中此节点，也会在场景编辑器中持续显示寻路预览。",
    })
    showAstarGizmos = true;

    @property({ type: Boolean })
    drawTileGrid = true;

    @property({ type: Boolean })
    drawChunkGrid = true;

    @property({ type: Boolean })
    drawObstacles = true;

    @property({ type: Boolean })
    drawAreas = true;

    @property({ type: Boolean })
    drawBlocks = true;

    @property({ type: Number, step: 0.01, fractionDigits: 2 })
    gizmoY = 0.02;

    @property({ type: Laya.Color })
    tileGridColor = new Laya.Color(0, 1, 0, 0.2);

    @property({ type: Laya.Color })
    chunkGridColor = new Laya.Color(0, 0.5, 1, 0.5);

    @property({ type: Laya.Color })
    obstacleColor = new Laya.Color(1, 0.5, 0, 0.6);

    @property({ type: Laya.Color })
    areaColor = new Laya.Color(0, 1, 0.4, 0.6);

    @property({ type: Laya.Color })
    blockColor = new Laya.Color(1, 0, 0, 0.5);

    @property({
        inspector: "Buttons",
        private: false,
        serializable: false,
        caption: "寻路烘焙",
        options: {
            showCaption: "none",
            buttons: [
                { caption: "烘焙寻路数据", runNodeScript: "_bakeAstar" },
            ],
        },
    })
    editorButtons: any;

    private _bakeAstar(): void {
        console.log("烘焙寻路数据", this.owner);
    }

}
