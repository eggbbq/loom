import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { projectFile, projectRoot, run, runLaya } from './laya.mjs';

const name = 'loom.ui';
const manifest = JSON.parse(readFileSync(path.join(projectRoot, `assets/plugins/${name}/package.json`), 'utf8'));
let consumer;
try {
    run(process.execPath, ['scripts/build-plugins.mjs', name]);
    mkdirSync(path.join(projectRoot, 'temp'), { recursive: true });
    consumer = mkdtempSync(path.join(projectRoot, 'temp/ui-install-'));
    cpSync(path.join(projectRoot, projectFile), path.join(consumer, 'verify.laya'));
    const consumerConfig = JSON.parse(readFileSync(path.join(projectRoot, 'tsconfig.json'), 'utf8'));
    writeFileSync(path.join(consumer, 'tsconfig.json'), JSON.stringify(consumerConfig));
    for (const dir of ['engine', 'settings']) cpSync(path.join(projectRoot, dir), path.join(consumer, dir), { recursive: true });
    mkdirSync(path.join(consumer, 'assets'), { recursive: true });
    mkdirSync(path.join(consumer, 'packages'));
    cpSync(path.join(projectRoot, `release/plugins/source/${name}.layapkg`), path.join(consumer, 'plugin.layapkg'));
    writeFileSync(path.join(consumer, 'packages/manifest.json'), JSON.stringify({ dependencies: { [name]: 'file:../plugin.layapkg' } }));
    const probe = runLaya(['run', '--project', consumer, '--script=InstalledUIProbe.verify',
        '--script-file', path.join(projectRoot, 'tests/installed-ui-probe.ts')], { stdio: 'pipe', encoding: 'utf8' });
    process.stdout.write(probe.stdout); process.stderr.write(probe.stderr);
    assert.ok(probe.stdout.includes('Installed UI:'), 'native verification entry must actually execute');
    assert.ok(!existsSync(path.join(consumer, 'assets/plugins')), 'test the installed package without source copies');
    mkdirSync(path.join(consumer, 'assets/resources'), { recursive: true });
    writeFileSync(path.join(consumer, 'assets/resources/Panel.lh'), JSON.stringify({ _$ver: 1, _$id: 'fixture', _$type: 'GWidget', name: 'Panel', width: 100, height: 100,
        _$comp: [{ _$type: 'b0c345c4-9c3a-4c6a-883b-f6b19d06102f', scriptPath: '~/packages/loom.ui/runtime/ui-panel.ts', anim: 0, center: false, life: 1 }],
        _$child: [{ _$id: 'muted', _$type: 'GButton', name: 'Muted', _$comp: [{
            _$type: 'eb88d8e2-4e80-4d1e-8b55-daf031159a76', scriptPath: '~/packages/loom.ui/runtime/ui-sound-ignore.ts' }] }] }));
    runLaya(['build', 'web', '--project', consumer]);
    run(process.execPath, ['tests/installed-ui.cjs', consumer]);
    run(process.execPath, ['tests/installed-ui-browser.mjs', consumer]);
    console.log('Verified independent loom.ui package installation, native Scene execution and published Web runtime.');
} catch (error) {
    console.error(error);
    process.exitCode = 1;
} finally {
    if (consumer && !process.env.KEEP_UI_VERIFY) rmSync(consumer, { recursive: true, force: true });
    else if (consumer) console.log(`Consumer kept for inspection: ${consumer}`);
}
