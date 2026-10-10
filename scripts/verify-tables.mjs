import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { projectRoot, projectFile, run, runLaya, startPreview } from './laya.mjs';

if (!process.argv.includes('--skip-build')) run(process.execPath, ['scripts/build-js-plugins.mjs', 'loom.tables']);
let consumer, preview;
try {
    mkdirSync(path.join(projectRoot, 'temp'), { recursive: true });
    consumer = mkdtempSync(path.join(projectRoot, 'temp/tables-install-'));
    cpSync(path.join(projectRoot, projectFile), path.join(consumer, 'verify.laya'));
    for (const dir of ['engine', 'settings']) cpSync(path.join(projectRoot, dir), path.join(consumer, dir), { recursive: true });
    mkdirSync(path.join(consumer, 'assets')); mkdirSync(path.join(consumer, 'packages'));
    const config = JSON.parse(readFileSync(path.join(projectRoot, 'tsconfig.json'), 'utf8'));
    config.include.push('./library/packages/*/index.d.ts');
    writeFileSync(path.join(consumer, 'tsconfig.json'), JSON.stringify(config));
    cpSync(path.join(projectRoot, 'release/plugins/loom.tables.layapkg'), path.join(consumer, 'plugin.layapkg'));
    writeFileSync(path.join(consumer, 'packages/manifest.json'), JSON.stringify({ dependencies: { 'loom.tables': 'file:../plugin.layapkg' } }));
    const cli = (method, extra = []) => {
        const result = runLaya(['run', '--project', consumer, `--script=${method}`, ...extra], { stdio: 'pipe', encoding: 'utf8' });
        process.stdout.write(result.stdout); process.stderr.write(result.stderr); return result.stdout;
    };
    cli('InstalledTablesProbe.bootstrap', ['--script-file', path.join(projectRoot, 'tests/installed-tables-probe.ts')]);
    assert.ok(existsSync(path.join(consumer, 'assets/editorResources/loom.tables/tables.txt')));
    assert.ok(!existsSync(path.join(consumer, 'src/loom/tables.ts')), 'wait for later-generated schema');
    const installed = path.join(consumer, 'library/packages/loom.tables');
    assert.ok(existsSync(path.join(installed, 'tables.txt')));
    assert.ok(!readdirSync(installed).some(name => name.endsWith('.ts') && !name.endsWith('.d.ts')));
    mkdirSync(path.join(consumer, 'src/game/tables'), { recursive: true });
    cpSync(path.join(projectRoot, 'src/game/tables/schema.ts'), path.join(consumer, 'src/game/tables/schema.ts'));
    cli('LoomTablesPlugin.generate');
    assert.ok(!existsSync(path.join(consumer, 'src/loom/tables.ts')), 'wait for additional bytebuf import');
    cpSync(path.join(projectRoot, 'src/game/tables/bytebuf.ts'), path.join(consumer, 'src/game/tables/bytebuf.ts'));
    cli('LoomTablesPlugin.generate');
    const adapter = path.join(consumer, 'src/loom/tables.ts');
    assert.ok(existsSync(adapter));
    assert.ok(readFileSync(adapter, 'utf8').includes('from "../game/tables/schema"'));
    assert.ok(readFileSync(adapter, 'utf8').includes('from "../game/tables/bytebuf"'));
    assert.doesNotMatch(readFileSync(adapter, 'utf8'), /\{\{importdir\}\}/);
    const meta = readFileSync(adapter + '.meta', 'utf8');
    const template = path.join(consumer, 'assets/editorResources/loom.tables/tables.txt');
    writeFileSync(template, readFileSync(template, 'utf8') + '\n// project customization retained\n');
    cli('LoomTablesPlugin.generate');
    assert.ok(readFileSync(adapter, 'utf8').includes('project customization retained'));
    assert.equal(readFileSync(adapter + '.meta', 'utf8'), meta);
    const id = randomUUID();
    writeFileSync(path.join(consumer, 'assets/Business.ts'), `
const tablesAtTop = loom.tables;
if (!tablesAtTop || tablesAtTop.constructor.name !== "Tables") throw new Error("Tables not mounted at business module evaluation");
(window as any).__tablesStartup = true;
@Laya.regClass()
export class TablesBusiness {}
`);
    writeFileSync(path.join(consumer, 'assets/Business.ts.meta'), JSON.stringify({ uuid: id }));
    writeFileSync(path.join(consumer, 'settings/CompilerSettings.json'), JSON.stringify({ entries: [`res://${id}`] }));
    const build = JSON.parse(readFileSync(path.join(consumer, 'settings/BuildSettings.json'), 'utf8'));
    delete build.startupScene;
    writeFileSync(path.join(consumer, 'settings/BuildSettings.json'), JSON.stringify(build));
    assert.ok(cli('InstalledTablesProbe.verify', ['--script-file', path.join(projectRoot, 'tests/installed-tables-probe.ts')]).includes('Installed tables:'));
    run(process.execPath, ['node_modules/typescript/bin/tsc', '--project', consumer, '--noEmit', '--pretty', 'false']);
    runLaya(['build', 'web', '--project', consumer]);
    preview = await startPreview(consumer);
    run(process.execPath, ['tests/installed-tables-browser.mjs', consumer, preview.url]);
    assert.ok(!existsSync(path.join(consumer, 'assets/plugins')));
    console.log('Verified installed Loom Tables: delayed generation, editable template, native Scene and no-import Preview/Web startup.');
} finally {
    preview?.stop();
    if (consumer && !process.env.KEEP_TABLES_VERIFY) rmSync(consumer, { recursive: true, force: true });
    else if (consumer) console.log(`Tables consumer kept: ${consumer}`);
}
