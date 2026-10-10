# Loom Pathfinding

LayaAir 3.4.1 标准安装包，保留原组件 UUID、算法、烘焙格式和运行时导航行为。包入口 `~/packages/loom.pathfinding` 导出全部 API，公开成员直接挂载到 `loom`，例如 `loom.AStarGrid`、`loom.astar`。

通过原生 `pluginDependencies` 声明依赖 `loom.core@2.0.0`，点击控制与演示组件使用其相机、UI 命中检查与射线工具。编辑器烘焙脚本位于 `editor/`；默认输出 `assets/data/pathfinding`，工程可配置输出目录。安装不生成导航数据或业务配置。测试与示例不进入包。

构建 `./build.sh loom.pathfinding`；`npm run verify:pathfinding` 在隔离工程安装两包、执行原生寻路和烘焙、验证 Web 发布入口。

# Pathfinding

`pathfinding` 是基于二维网格的寻路工具包，用于 Laya 3D 场景的 XZ 平面导航。它提供：

- 固定网格 A* 搜索；
- 基于 chunk 的无限世界网格；
- 有界局部窗口寻路；
- 编辑器区域、障碍标记与 JSON 烘焙；
- 路径平滑、Agent 移动和运行时调试显示。

导航 JSON 由消费工程编辑器烘焙生成，不随插件分发。Astar 不自动加载这些数据，项目加载流负责组装 chunk，再交给 `AstarChunkComponent`。

## 架构与职责

| 模块 | 职责 |
| --- | --- |
| `astar.ts` | 纯 A* 算法、局部窗口和 chunk 坐标查询 |
| `astar-chunk-component.ts` | 保存已加载的 walkable chunk，对外提供世界坐标寻路 |
| `astar-bake-component.ts` | 配置烘焙范围、格子大小、chunk 大小和输出目录 |
| `astar-area-component.ts` | 标记有效导航区域所覆盖的 chunk |
| `astar-obstacle-component.ts` | 把 BoxCollider 覆盖的格子烘焙为不可走 |
| `astar-agent-component.ts` | 请求路径并驱动 Sprite3D 移动、转向 |
| `astar-character-ctrl-component.ts` | 点击地面并向 AStar Agent 提交寻路目标 |
| `astar-path-line-smoother-component.ts` | 删除不必要的中间路径点 |
| `astar-runtime-debug-view.ts` | 显示已加载 chunk、网格和阻挡格 |

推荐的数据流：

```text
场景中的 Area / Obstacle
          ↓ 编辑器烘焙
pathfinding JSON 或世界 chunk 数据
          ↓ 世界加载流
staticWalkable + dynamicBlockCount
          ↓ setChunk / delChunk
AstarChunkComponent
          ↓ findPath
Agent 或业务逻辑
```

资源加载、JSON 格式和 chunk 生命周期属于世界层。`AstarChunkComponent` 只消费内存中的静态可走层和动态阻挡计数层，不负责调用 `Laya.loader`。

## 编辑器烘焙

### 1. 创建烘焙器

在 `Scene3D` 下创建普通 `Sprite3D`，添加 `AstarBakeComponent`，配置：

- `tileSize`：单个网格的世界尺寸；
- `chunkSize`：一个 chunk 每边包含的格子数；
- `min` / `max`：XZ 平面的烘焙范围，其中 `Vector2.y` 对应世界 Z；
- `outputPath`：相对于 `assets` 的输出目录，默认为 `data/pathfinding`；
- `obstacleRoots`：限制 Area 和 Obstacle 的扫描根节点。为空时扫描整个 `Scene3D`。

例如：

```text
tileSize   = 0.2
chunkSize  = 64
min        = (-64, -64)
max        = ( 64,  64)
outputPath = data/pathfinding
```

### 2. 标记有效区域和障碍

在同一个 `Sprite3D` 上添加：

```text
PhysicsCollider
└── BoxColliderShape
AstarAreaComponent 或 AstarObstacleComponent
```

- `AstarAreaComponent` 与某个 chunk 相交时，该 chunk 会写入 `chunks`。
- `AstarObstacleComponent` 覆盖到的格子会写入 `blocks + counts`，并使所在 chunk 有效。
- 有效 chunk 内的静态地形默认全部可走；`counts` 记录每个格子上重叠的动态障碍数量。
- 没有与 Area 或 Obstacle 相交的 chunk 不会输出，运行时通常应把它视为不可走或未加载。

Area 当前按 chunk 激活，不是逐格可行走白名单。旋转后的 BoxCollider 使用世界 AABB 烘焙，因此结果会偏保守。

运行时永久移除障碍时调用 `AstarObstacleComponent.releaseObstacle()`；运行时新增且未包含在烘焙数据中的障碍调用 `occupyObstacle()`。
节点或组件的 `active` / `enabled` 变化只表示显隐和生命周期切换，不会自动改变寻路遮挡，避免世界流卸载、对象池回收或重复显示节点时错误开放网格。

最终可走性由两层共同决定：

```ts
staticWalkable[index] === 1 && dynamicBlockCount[index] === 0
```

- `staticWalkable`：地形本身是否可走，动态障碍释放不能改变它；
- `dynamicBlockCount`：当前覆盖该格子的动态障碍数量；
- 多个障碍重叠时计数大于 `1`，释放一个障碍只递减 `1`。

### 3. 预览并输出

`showAstarGizmos` 是寻路预览总开关。开启后即使没有选中烘焙器节点，场景编辑器也会持续显示 AStar Gizmo；关闭后隐藏全部寻路预览。

以下子开关控制具体内容：

- `drawAreas`：绿色 Area 轮廓；
- `drawObstacles`：橙色 Obstacle 轮廓；
- `drawBlocks`：红色最终 Block；
- `drawTileGrid`：绿色 tile 网格；
- `drawChunkGrid`：蓝色 chunk 网格。

点击 Inspector 中的“烘焙寻路数据”。场景名为 `Farm` 时默认输出：

```text
assets/data/pathfinding/Farm.json
```

## 烘焙数据格式

```json
{
  "version": 2,
  "tileSize": 0.2,
  "chunkSize": 64,
  "min": { "x": -64, "y": -64 },
  "max": { "x": 64, "y": 64 },
  "chunks": [
    { "cx": 0, "cy": 0 },
    { "cx": 1, "cy": 0 }
  ],
  "obstacle": [
    {
      "cx": 0,
      "cy": 0,
      "blocks": [0, 1, 64],
      "counts": [1, 2, 1]
    }
  ]
}
```

- `chunks`：有效 chunk 坐标；
- `obstacle`：包含动态障碍的 chunk；
- `blocks`：chunk 内存在动态障碍的格子索引；
- `counts`：与 `blocks` 一一对应的动态障碍数量；旧版 `version = 1` 没有该字段时按 `1` 读取；
- `min` / `max`：本次烘焙使用的世界 XZ 范围。

Block 与局部坐标之间的转换：

```ts
const lx = block % chunkSize;
const ly = Math.floor(block / chunkSize);
const block = ly * chunkSize + lx;
```

没有阻挡格的有效 chunk 不会出现在 `obstacle` 中，以减少文件大小。

## 由世界加载流装配 Astar

### 初始化

世界配置确定后设置参数并调用 `rebuild()`。`tileSize` 和 `chunkSize` 必须与输入数据一致。

```ts
import { astar } from "~/packages/loom.pathfinding";

function initializePathfinding(tileSize: number, chunkSize: number): void {
    const nav = astar.main;
    if (!nav) throw new Error("AstarChunkComponent is missing");

    nav.tileSize = tileSize;
    nav.chunkSize = chunkSize;
    nav.windowWidth = 128;
    nav.windowHeight = 96;
    nav.allowDiagonal = false;
    nav.preventCornerCutting = true;
    nav.rebuild();
}
```

如果运行时修改了 `tileSize`、`chunkSize`、窗口或斜向移动配置，需要再次调用 `rebuild()`。

### 挂载 chunk

世界 chunk 进入加载范围时，分别装配静态可走层和动态阻挡计数层：

```ts
type ChunkPathfindingData = {
    chunkSize: number;
    staticBlocks?: number[];
    blocks: number[];
    counts?: number[];
};

function mountPathfindingChunk(
    cx: number,
    cy: number,
    data: ChunkPathfindingData,
): void {
    const nav = astar.main;
    if (!nav?.inited) throw new Error("Pathfinding is not initialized");
    if (data.chunkSize !== nav.chunkSize) {
        throw new Error("Pathfinding chunkSize mismatch");
    }

    const cellCount = nav.chunkSize * nav.chunkSize;
    const staticWalkable = new Uint8Array(cellCount).fill(1);
    for (const block of data.staticBlocks ?? []) {
        if (!Number.isInteger(block) || block < 0 || block >= cellCount) throw new Error(`Invalid static block: ${block}`);
        staticWalkable[block] = 0;
    }

    const dynamicBlockCount = new Uint16Array(cellCount);
    for (let index = 0; index < data.blocks.length; index++) {
        const block = data.blocks[index];
        const count = data.counts?.[index] ?? 1;
        if (!Number.isInteger(block) || block < 0 || block >= cellCount) throw new Error(`Invalid dynamic block: ${block}`);
        if (!Number.isInteger(count) || count <= 0 || count > 0xffff) throw new Error(`Invalid dynamic block count: ${count}`);
        dynamicBlockCount[block] = count;
    }

    nav.setChunkLayers(cx, cy, staticWalkable, dynamicBlockCount);
}
```

世界 chunk 离开加载范围时同步卸载：

```ts
function unmountPathfindingChunk(cx: number, cy: number): void {
    astar.main?.delChunk(cx, cy);
}

function disposePathfinding(): void {
    astar.main?.clearChunks();
}
```

`delChunk()` 只卸载当前 Chunk 数据，会保留运行期间的动态阻挡增量；同一 Chunk 重新载入时会自动重新应用这些增量。
`clearChunks()` 表示整个寻路世界重置，默认同时清除这些增量。

项目中的 `ChunkDataComponent → ChunkAstarComponent` 采用的就是这一模式。建议由世界流统一管理加载和卸载，并保持 `AstarChunkComponent.unloadOutsideRadius = false`，避免两套生命周期同时删除 chunk。

### 将完整烘焙 JSON 转成 chunk

如果世界层直接读取 `AstarBakeData`，可先建立障碍索引，再按 `chunks` 装配：

```ts
const obstacles = new Map(data.obstacle.map(item => [`${item.cx},${item.cy}`, item]));

for (const chunk of data.chunks) {
    mountPathfindingChunk(chunk.cx, chunk.cy, {
        chunkSize: data.chunkSize,
        blocks: obstacles.get(`${chunk.cx},${chunk.cy}`)?.blocks ?? [],
        counts: obstacles.get(`${chunk.cx},${chunk.cy}`)?.counts,
    });
}
```

大型世界更适合在导出阶段把完整烘焙结果拆入世界 chunk 文件，再由世界流按需加载，而不是启动时装入整个 JSON。

## 查询路径

`AstarChunkComponent.findPath()` 接收世界 XZ 坐标，返回网格坐标路径：

```ts
const nav = astar.main;
if (!nav?.inited) throw new Error("Pathfinding is not ready");

const result = nav.findPath(
    { x: actor.transform.position.x, y: actor.transform.position.z },
    { x: targetX, y: targetZ },
);

if (!result.found) {
    console.warn("No path found");
} else {
    for (const gridPoint of result.path) {
        const worldX = (gridPoint.x + 0.5) * nav.tileSize;
        const worldZ = (gridPoint.y + 0.5) * nav.tileSize;
        console.log(worldX, worldZ);
    }
}
```

世界坐标与网格坐标的基本转换：

```ts
const gridX = Math.floor(worldX / tileSize);
const gridY = Math.floor(worldZ / tileSize);

const cellCenterWorldX = (gridX + 0.5) * tileSize;
const cellCenterWorldZ = (gridY + 0.5) * tileSize;
```

负坐标使用 `Math.floor` 划分 chunk；chunk 内局部坐标会转换为非负数。

## 使用 Agent

在角色 `Sprite3D` 上添加：

1. `AstarAgentComponent`；
2. 可选的 `AstarPathLineSmootherComponent`。
3. 需要点击地面控制角色时，添加 `AstarCharacterCtrlComponent`。

确保 Astar 已初始化、起点和目标附近的 chunk 已加载，然后设置世界坐标目标：

```ts
import { AstarAgentComponent } from "~/packages/loom.pathfinding";
import { AstarCharacterCtrlComponent } from "~/packages/loom.pathfinding";

const agent = role.getComponent(AstarAgentComponent);
if (!agent) throw new Error("AstarAgentComponent is missing");

agent.speed = 2;
const pathFound = agent.setTarget({ x: targetWorldX, y: targetWorldZ });
if (!pathFound) {
    // setTarget 会同步返回寻路结果，同时通过 owner 发送 path-failed 事件。
    console.warn("Agent cannot reach target");
}
```

`setTarget()` 默认要求精确到达目标格，适合任务点、工作位等业务目标。需要接受就近落点时显式开启：

```ts
agent.setTarget({ x: targetWorldX, y: targetWorldZ }, { findNearestReachable: true });
```

目标格被阻挡或与起点不连通时，A* 会在同一次搜索中返回“从起点确实可达、且格子中心距离请求目标最近”的路径。
它不会只在目标周围找一个表面可走、实际位于墙另一侧的格子。`PathResult.reachedTarget` 表示是否精确到达请求格，
`PathResult.resolvedEnd` 表示最终落到的网格坐标。

默认情况下 Agent 会在 `onUpdate()` 中移动角色，并让角色朝移动方向旋转。外部系统需要自行驱动时：

```ts
agent.useDefaultOnUpdate = false;
agent.update(deltaSeconds);
```

`stop()` 会停止移动并清空当前目标和路径。如果 Agent 正在执行目标，还会通过角色节点发送停止事件。

### 点击地面寻路

`AstarCharacterCtrlComponent` 会把短点击位置转换为相机射线，读取地面碰撞体的命中点，并调用同节点的
`AstarAgentComponent.setTarget()`。它默认开启 `findNearestReachable`：点击位置被阻挡或不可达时，角色会走到最接近点击位置的可达格；
可以通过 Inspector 中的“接近不可达目标”总开关关闭这一行为。

使用要求：

- 地面必须具有 3D 碰撞体；
- `groundCollisionMask` 建议只包含可点击寻路的地面层，避免先命中角色、建筑或装饰碰撞体；
- `camera` 可以显式指定，留空时使用带有 `CameraRef` 的主相机；
- 按下与抬起距离超过 `clickTolerance` 时按拖动处理，不触发寻路；
- `ignorePointerOverUI` 开启时，UI 上的点击不会控制角色。

也可以由其他输入系统直接调用：

```ts
const controller = role.getComponent(AstarCharacterCtrlComponent);
controller?.moveToScreenPoint(Laya.stage.mouseX, Laya.stage.mouseY);
```

### 路径平滑安全性

`AstarPathLineSmootherComponent` 会检查平滑后每一条线段实际经过的全部格子。线段恰好穿过格子角点时，
`preventCornerCutting = true` 会同时检查角点两侧的正交格，避免平滑路径从墙角或两个相邻障碍之间斜穿。

平滑完成后会再次验证所有路径点和相邻线段。任意一段验证失败时，直接回退到原始 A* 路径，不会通过删除无效路径点继续拼接。

`allowDiagonalMovement` 控制平滑器能否产生斜向捷径，它与 A* 的邻居搜索方式可以独立配置；无论是否允许斜向平滑，
Agent 都会把 A* 的 `preventCornerCutting` 配置同步给平滑器。

当前安全检测仍以角色中心所在格为准，尚未包含胶囊体半径或安全间距。角色有明显体积时，后续应通过障碍膨胀或 `clearance` 检测处理。

### Agent 状态

`agent.state` 表示最近一次寻路或移动的状态：

| 状态 | 含义 |
| --- | --- |
| `idle` | 初始状态，尚未请求目标 |
| `moving` | 已找到路径，正在移动 |
| `arrived` | 已到达最后一个路径点 |
| `path-failed` | Astar 未准备好或目标不可达 |
| `stopped` | 移动过程中主动调用了 `stop()` |

`agent.isMoving` 可用于简单的逐帧查询；涉及动画切换、AI 行为、采集或任务推进时，推荐监听状态事件。

### 监听 Agent 事件

Agent 事件统一通过它所在的 `owner` 发送。其他组件只需监听同一个角色节点，不需要持有全局事件总线或额外的事件分发器。

| 事件 | 触发时机 |
| --- | --- |
| `astar-agent-state-changed` | `state` 发生变化 |
| `astar-agent-arrived` | 到达最后一个路径点 |
| `astar-agent-path-failed` | Astar 未初始化或没有找到路径 |
| `astar-agent-stopped` | 移动过程中主动停止 |

每个事件都会传递相同结构的 `AstarAgentEventData`：

```ts
type AstarAgentEventData = {
    agent: AstarAgentComponent;
    state: "idle" | "moving" | "arrived" | "path-failed" | "stopped";
    previousState: "idle" | "moving" | "arrived" | "path-failed" | "stopped";
    target: { x: number; y: number } | null;
    reason?: "not-ready" | "unreachable";
};
```

其中 `target` 是本次事件对应目标的快照。`reason` 只在 `path-failed` 中使用：

- `not-ready`：`AstarChunkComponent` 不存在或尚未 `rebuild()`；
- `unreachable`：A* 在当前已加载 chunk 和局部窗口内没有找到路径。

完整监听示例：

```ts
import {
    AstarAgentComponent,
    AstarAgentEvent,
    type AstarAgentEventData,
} from "~/packages/loom.pathfinding";

const { regClass } = Laya;

@regClass()
export class CharacterPathController extends Laya.Script {
    declare owner: Laya.Sprite3D;

    private agent!: AstarAgentComponent;

    onAwake(): void {
        const agent = this.owner.getComponent(AstarAgentComponent);
        if (!agent) throw new Error("AstarAgentComponent is missing");
        this.agent = agent;

        // 事件由当前角色节点发送。
        this.owner.on(AstarAgentEvent.Arrived, this, this.onArrived);
        this.owner.on(AstarAgentEvent.PathFailed, this, this.onPathFailed);
        this.owner.on(AstarAgentEvent.Stopped, this, this.onStopped);
    }

    moveTo(worldX: number, worldZ: number): boolean {
        return this.agent.setTarget({ x: worldX, y: worldZ });
    }

    cancelMove(): void {
        this.agent.stop();
    }

    onDestroy(): void {
        this.owner.offAllCaller(this);
    }

    private onArrived(data: AstarAgentEventData): void {
        console.log("Arrived", data.target);
        // 例如：切换待机动画、开始采集、推进 AI 行为。
    }

    private onPathFailed(data: AstarAgentEventData): void {
        console.warn("Path failed", data.reason, data.target);
        // 例如：放弃任务、选择备用目标或等待远端 chunk 加载。
    }

    private onStopped(data: AstarAgentEventData): void {
        console.log("Movement stopped", data.target);
    }
}
```

事件名常量集中在 `AstarAgentEvent` 中，并与 Agent 类型位于同一个模块。如果监听方希望完全避免引入事件常量，也可以直接使用节点事件名：

```ts
this.owner.on("astar-agent-arrived", this, this.onArrived);
this.owner.on("astar-agent-path-failed", this, this.onPathFailed);
```

应先注册监听器，再调用 `setTarget()`，因为 A* 搜索是同步的，`path-failed` 可能在 `setTarget()` 返回之前发出。状态切换时会先发送 `astar-agent-state-changed`，再发送对应的 `arrived`、`path-failed` 或 `stopped` 事件。

## 跨 chunk 与窗口限制

寻路可以跨越多个已加载 chunk。局部窗口会逐格查询 `ChunkedWalkableWorld`，所以相邻 chunk 的边界对 A* 是透明的。

但每次 `findPath()` 只执行一次固定大小的局部窗口搜索：

- 未通过 `setChunk()` 装入的 chunk 默认不可走；
- 起点、终点和绕行路径必须位于当前窗口内；
- 系统不会自动请求世界流加载远端 chunk；
- 系统不会自动拼接多个窗口的路径；
- chunk 或障碍变化后，已有路径不会自动重新计算。

例如 `chunkSize = 16`、窗口为 `128 × 96` 时，一个窗口理论上可覆盖约 `8 × 6` 个 chunk，但实际可行走范围仍由世界流已加载的 chunk 决定。

## 运行时调试

给包含 `AstarChunkComponent` 的节点添加 `AstarRuntimeDebugView`，可以显示：

- 已加载 chunk 边界；
- tile 网格；
- 不可走格子。

常用配置：

```text
showChunkGrid     = true
showTileGrid      = true
showBlockedTiles  = true
maxVisibleChunks  = 64
```

`AstarAgentComponent.debugDraw` 可显示当前 Agent 的平滑路径。

## 注意事项

- 所有导航计算都发生在世界 XZ 平面，代码中的二维 `y` 对应世界 Z。
- `setChunk()` 是兼容入口，传入的数据只作为静态可走层；需要动态障碍时使用 `setChunkLayers()`。
- `staticWalkable` 和 `dynamicBlockCount` 的长度都必须严格等于 `chunkSize * chunkSize`。
- 烘焙数据、世界配置和运行时 Astar 必须使用相同的 `tileSize` 与 `chunkSize`。
- 未加载 chunk 默认不可走；不要在导航数据缺失时静默创建全可走 chunk。
- 起点位于阻挡格或局部窗口之外时，寻路会失败。终点被阻挡或不连通且未开启 `findNearestReachable` 时也会失败。
- 当前局部窗口是有界搜索，不等同于全世界寻路。
- 路径平滑、动态障碍和 chunk 生命周期发生变化时，业务层应根据需要重新请求路径。

默认构建输出预编译 JS、`.d.ts` 与资源的独立 `.layapkg`。Runtime JS 在业务脚本之前自动加载；Scene 在用户脚本加载/重载后恢复挂载。类型配置可在 `tsconfig.json` 的 `include` 中追加 `"./library/packages/*/index.d.ts"`。构建结构、依赖顺序和源码版选择见仓库的 [安装与构建指南](../../../docs/plugin-distribution.md)，实际验证见 [JS 安装包验证](../../../docs/js-plugin-verification.md)。
