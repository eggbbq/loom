import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { projectFile, projectRoot, run, runLaya } from './laya.mjs';

const plugin = 'manual-atlas-collector';
const source = path.join(projectRoot, 'assets/plugins', plugin);
const manifest = JSON.parse(readFileSync(path.join(source, 'package.json'), 'utf8'));
let consumer;

try {
    // Always verify a freshly exported package, rather than an old artifact.
    run(process.execPath, ['scripts/build-plugins.mjs', plugin]);
    const temp = path.join(projectRoot, 'temp');
    mkdirSync(temp, { recursive: true });
    consumer = mkdtempSync(path.join(temp, 'collector-install-'));
    cpSync(path.join(projectRoot, projectFile), path.join(consumer, 'verify.laya'));
    cpSync(path.join(projectRoot, 'engine'), path.join(consumer, 'engine'), { recursive: true });
    cpSync(path.join(projectRoot, 'settings'), path.join(consumer, 'settings'), { recursive: true });
    cpSync(path.join(projectRoot, 'assets/examples'), path.join(consumer, 'assets/examples'), { recursive: true });
    cpSync(path.join(projectRoot, 'assets/editorResources'), path.join(consumer, 'assets/editorResources'), { recursive: true });
    mkdirSync(path.join(consumer, 'packages'));
    cpSync(path.join(projectRoot, `release/plugins/${manifest.name}-${manifest.version}.layapkg`), path.join(consumer, 'plugin.layapkg'));
    writeFileSync(path.join(consumer, 'packages/manifest.json'), JSON.stringify({
        dependencies: { [manifest.name]: 'file:../plugin.layapkg' },
    }, null, 2));
    // Reconciliation is intentional here: install the local artifact in an isolated consumer.
    console.log('Installing and building a source-free consumer project...');
    runLaya(['build', 'web', '--project', consumer]);
    assert.ok(!existsSync(path.join(consumer, 'assets/plugins')), 'the consumer must not contain plugin source copies');
    const installed = JSON.parse(readFileSync(path.join(consumer, 'library/packages', manifest.name, 'package.json'), 'utf8'));
    assert.equal(installed.version, manifest.version);
    run(process.execPath, ['tests/installed-collector.cjs', consumer]);
    const config = JSON.parse(readFileSync(path.join(consumer, 'release/web/fileconfig.json'), 'utf8'));
    const atlas = config.config.find(entry => entry.prefix === `examples/${plugin}/demo/`);
    assert.deepEqual(atlas.frames, ['red.png', 'blue.png']);
    assert.ok(!existsSync(path.join(consumer, `release/web/${plugin}.json`)), 'preview metadata must not enter the published game');
    console.log('Verified: local package installation, load hooks, runtime entry and published atlas index.');
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
} finally {
    if (consumer) rmSync(consumer, { recursive: true, force: true });
}
