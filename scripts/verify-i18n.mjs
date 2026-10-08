import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { projectFile, projectRoot, run, runLaya } from './laya.mjs';

const name = 'loom.i18n';
const manifest = JSON.parse(readFileSync(path.join(projectRoot, `assets/plugins/${name}/package.json`), 'utf8'));
let consumer;
try {
    run(process.execPath, ['scripts/build-plugins.mjs', name]);
    mkdirSync(path.join(projectRoot, 'temp'), { recursive: true });
    consumer = mkdtempSync(path.join(projectRoot, 'temp/i18n-install-'));
    cpSync(path.join(projectRoot, projectFile), path.join(consumer, 'verify.laya'));
    cpSync(path.join(projectRoot, 'tsconfig.json'), path.join(consumer, 'tsconfig.json'));
    for (const dir of ['engine', 'settings']) cpSync(path.join(projectRoot, dir), path.join(consumer, dir), { recursive: true });
    mkdirSync(path.join(consumer, 'assets'), { recursive: true });
    mkdirSync(path.join(consumer, 'packages'));
    cpSync(path.join(projectRoot, `release/plugins/${name}-${manifest.version}.layapkg`), path.join(consumer, 'plugin.layapkg'));
    writeFileSync(path.join(consumer, 'packages/manifest.json'), JSON.stringify({ dependencies: { [name]: 'file:../plugin.layapkg' } }));
    runLaya(['run', '--project', consumer, '--script=InstalledI18nProbe.verify',
        '--script-file', path.join(projectRoot, 'tests/installed-i18n-probe.ts')]);
    assert.ok(!existsSync(path.join(consumer, 'assets/plugins')), 'test the installed package without source copies');
    runLaya(['build', 'web', '--project', consumer]);
    run(process.execPath, ['tests/installed-i18n.cjs', consumer]);
    console.log('Verified independent loom.i18n package installation, native Scene execution and published Web runtime.');
} catch (error) {
    console.error(error);
    process.exitCode = 1;
} finally {
    if (consumer && !process.env.KEEP_I18N_VERIFY) rmSync(consumer, { recursive: true, force: true });
    else if (consumer) console.log(`Consumer kept for inspection: ${consumer}`);
}
