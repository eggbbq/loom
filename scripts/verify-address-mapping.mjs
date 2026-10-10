import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { projectFile, projectRoot, run, runLaya } from './laya.mjs';

const manifest = JSON.parse(readFileSync(path.join(projectRoot, 'assets/plugins/loom.address/package.json'), 'utf8'));
const name = manifest.name;
let consumer;
try {
    run(process.execPath, ['scripts/build-plugins.mjs', 'loom.address']);
    mkdirSync(path.join(projectRoot, 'temp'), { recursive: true });
    consumer = mkdtempSync(path.join(projectRoot, 'temp/address-install-'));
    cpSync(path.join(projectRoot, projectFile), path.join(consumer, 'verify.laya'));
    cpSync(path.join(projectRoot, 'tsconfig.json'), path.join(consumer, 'tsconfig.json'));
    for (const dir of ['engine', 'settings']) cpSync(path.join(projectRoot, dir), path.join(consumer, dir), { recursive: true });
    mkdirSync(path.join(consumer, 'assets'), { recursive: true });
    mkdirSync(path.join(consumer, 'packages'));
    cpSync(path.join(projectRoot, `release/plugins/source/${name}.layapkg`), path.join(consumer, 'plugin.layapkg'));
    writeFileSync(path.join(consumer, 'packages/manifest.json'), JSON.stringify({ dependencies: { [name]: 'file:../plugin.layapkg' } }));
    // Reconcile this isolated local-only manifest: CLI 3.4.1 can lose package root assets when installation is skipped.
    const cli = method => runLaya(['run', '--project', consumer, `--script=LoomAddressMappingPlugin.${method}`]);
    cli('runNow');
    assert.ok(!existsSync(path.join(consumer, 'assets/plugins')), 'consumer must load the installed package, without source copies');
    const config = path.join(consumer, 'assets/editorResources/loom.address/config.json');
    assert.deepEqual(JSON.parse(readFileSync(config)).watchDirs, [], 'real package load creates default config');
    const settings = JSON.stringify({ watchDirs: ['resources/icons', 'portraits'], extensions: ['png'], debounceMs: 0 });
    writeFileSync(config, settings);
    const image = path.join(projectRoot, 'assets/examples/manual-atlas-collector/demo.png');
    mkdirSync(path.join(consumer, 'assets/resources/icons'), { recursive: true });
    mkdirSync(path.join(consumer, 'assets/portraits'), { recursive: true });
    cpSync(image, path.join(consumer, 'assets/resources/icons/apple.png'));
    cpSync(image, path.join(consumer, 'assets/portraits/hero.png'));
    cli('runNow');
    const output = path.join(consumer, 'assets/resources/address.json');
    const expected = { $path: [['resources/icons', '.png'], ['portraits', '.png']], apple: 0, hero: 1 };
    assert.deepEqual(JSON.parse(readFileSync(output)), expected);
    cli('check');
    assert.equal(readFileSync(config, 'utf8'), settings, 'existing config bytes must survive CLI reloads');
    rmSync(path.join(consumer, 'assets/portraits/hero.png')); rmSync(path.join(consumer, 'assets/portraits/hero.png.meta')); cli('runNow');
    assert.deepEqual(JSON.parse(readFileSync(output)), { $path: [['resources/icons', '.png']], apple: 0 });
    cpSync(image, path.join(consumer, 'assets/portraits/hero.png'));
    assert.throws(() => cli('check'), /failed/, 'stale output must produce a non-zero CLI exit');
    runLaya(['build', 'web', '--project', consumer]);
    assert.deepEqual(JSON.parse(readFileSync(output)), expected, 'build hook updates stale mapping');
    const exported = path.join(consumer, 'release/web');
    assert.ok(existsSync(path.join(exported, 'resources/address.json')), 'mapping must be exported');
    assert.ok(existsSync(path.join(exported, 'portraits/hero.png')), 'non-resources target must be collected');
    assert.ok(!existsSync(path.join(exported, 'editorResources')), 'editor config must remain editor-only');
    runLaya(['run', '--project', consumer, '--script=InstalledAddressMappingProbe.verify',
        '--script-file', path.join(projectRoot, 'tests/installed-address-mapping-probe.ts')]);
    run(process.execPath, ['tests/installed-address-mapping.cjs', consumer]);
    console.log('Verified: official local package installation, native config creation, CLI generation/check, installed events and web resource export.');
} catch (error) { console.error(error); process.exitCode = 1; }
finally { if (consumer) rmSync(consumer, { recursive: true, force: true }); }
