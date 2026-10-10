import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { projectFile, projectRoot, run, runLaya } from './laya.mjs';

const name = 'loom.pathfinding';
const manifest = JSON.parse(readFileSync(path.join(projectRoot, `assets/plugins/${name}/package.json`), 'utf8'));
let consumer;
try {
    run(process.execPath, ['scripts/build-plugins.mjs', 'loom.core', name]);
    mkdirSync(path.join(projectRoot, 'temp'), { recursive: true });
    consumer = mkdtempSync(path.join(projectRoot, 'temp/pathfinding-install-'));
    cpSync(path.join(projectRoot, projectFile), path.join(consumer, 'verify.laya'));
    const consumerConfig = JSON.parse(readFileSync(path.join(projectRoot, 'tsconfig.json'), 'utf8'));
    writeFileSync(path.join(consumer, 'tsconfig.json'), JSON.stringify(consumerConfig));
    for (const dir of ['engine', 'settings']) cpSync(path.join(projectRoot, dir), path.join(consumer, dir), { recursive: true });
    mkdirSync(path.join(consumer, 'assets'), { recursive: true });
    mkdirSync(path.join(consumer, 'packages'));
    cpSync(path.join(projectRoot, `release/plugins/source/${name}.layapkg`), path.join(consumer, 'plugin.layapkg'));
    cpSync(path.join(projectRoot, 'release/plugins/source/loom.core.layapkg'), path.join(consumer, 'core.layapkg'));
    writeFileSync(path.join(consumer, 'packages/manifest.json'), JSON.stringify({ dependencies: { [name]: 'file:../plugin.layapkg', 'loom.core': 'file:../core.layapkg' } }));
    const probe = runLaya(['run', '--project', consumer, '--script=InstalledPathfindingProbe.verify',
        '--script-file', path.join(projectRoot, 'tests/installed-pathfinding-probe.ts')], { stdio: 'pipe', encoding: 'utf8' });
    process.stdout.write(probe.stdout); process.stderr.write(probe.stderr);
    assert.ok(probe.stdout.includes('Installed pathfinding:'), 'native verification entry must actually execute');
    const lock = JSON.parse(readFileSync(path.join(consumer, 'packages/package-lock.json'), 'utf8'));
    assert.equal(lock.packages[name].dependencies['loom.core'], manifest.pluginDependencies['loom.core'], 'native package manager must recognize pluginDependencies');
    assert.ok(!existsSync(path.join(consumer, 'assets/plugins')), 'test the installed package without source copies');
    runLaya(['build', 'web', '--project', consumer]);
    run(process.execPath, ['tests/installed-pathfinding.cjs', consumer]);
    console.log('Verified independent loom.pathfinding package installation, native Scene execution and published Web runtime.');
} catch (error) {
    console.error(error);
    process.exitCode = 1;
} finally {
    if (consumer && !process.env.KEEP_PATHFINDING_VERIFY) rmSync(consumer, { recursive: true, force: true });
    else if (consumer) console.log(`Consumer kept for inspection: ${consumer}`);
}
