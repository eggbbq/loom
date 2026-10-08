const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const consumer = process.argv[2];
for (const [file, scene] of [['library/packages/build/loom.pathfinding.scene.js', true], ['library/packages/build/loom.pathfinding.js', false], ['release/web/js/bundle.js', false]]) {
    const callbacks = [], classes = {}, customEditors = [];
    class Vector { constructor(x = 0, y = 0, z = 0) { Object.assign(this, { x, y, z }); } }
    const host = { core: { CameraRef: {}, uif: {}, mathf: {} }, ui: {} };
    const ctx = { console, loom: host, __setBundle_: (_name, values) => Object.assign(classes, values), Laya: {
        Node: class {}, Script: class {}, Camera: class {}, Sprite3D: class {}, GWidget: class {}, TextResource: class {}, Vector2: Vector, Vector3: Vector, Color: Vector,
        regClass: () => type => type, property: () => () => {}, runInEditor: type => type,
        addBeforeInitCallback: callback => callbacks.push(callback),
    } };
    ctx.window = ctx;
    if (scene) ctx.IEditorEnv = {
        CustomEditor: class {}, customEditor: target => type => customEditors.push([target, type]),
        regClass: () => type => type, regBuildPlugin: () => type => type, onUserScriptsLoad() {},
    };
    vm.runInNewContext(fs.readFileSync(path.join(consumer, file), 'utf8'), ctx, { filename: file });
    callbacks.forEach(callback => callback());
    assert.equal(ctx.loom, host);
    const api = host.pathfinding;
    for (const name of ['AStarGrid', 'InfiniteAStarGrid', 'ChunkedWalkableWorld', 'AstarAgentComponent', 'AstarAreaComponent', 'AstarBakeComponent', 'AstarCharacterCtrlComponent', 'AstarChunkComponent', 'AstarEmptyComponent', 'AstarExampleComponent', 'AstarObstacleComponent', 'AstarPathLineSmootherComponent', 'AstarPathSmootherComponent', 'AstarRuntimeDebugView', 'astar', 'utils']) assert.ok(api[name], `missing ${name}`);
    const grid = new api.AStarGrid({ width: 3, height: 3, walkable: new Uint8Array(9).fill(1) });
    assert.equal(grid.findPath({ x: 0, y: 0 }, { x: 2, y: 2 }).reachedTarget, true);
    if (scene) {
        assert.equal(classes.AStarGrid, api.AStarGrid);
        assert.equal(customEditors.length, 1);
        assert.equal(customEditors[0][0], api.AstarBakeComponent);
    } else assert.equal(customEditors.length, 0);
    assert.ok(!fs.readFileSync(path.join(consumer, 'release/web/js/bundle.js'), 'utf8').includes('AstarBakeEditorService'), 'UI editor service must not enter runtime publish');
}
console.log('Installed Scene/Preview and published Web bundles execute loom.pathfinding and keep bake editors in Scene/UI only.');
