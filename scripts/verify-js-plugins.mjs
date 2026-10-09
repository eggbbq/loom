import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { projectFile, projectRoot, run, runLaya } from './laya.mjs';

const manifests = readdirSync(path.join(projectRoot, 'assets/plugins')).filter(name => existsSync(path.join(projectRoot, 'assets/plugins', name, 'package.json'))).sort()
    .map(name => JSON.parse(readFileSync(path.join(projectRoot, 'assets/plugins', name, 'package.json'), 'utf8')));
const requested = process.argv.slice(2).filter(arg => arg !== '--skip-build');
const unknown = requested.filter(name => !manifests.some(manifest => manifest.name === name));
if (unknown.length) throw new Error(`Unknown plugins: ${unknown.join(', ')}.`);
const selected = requested.length ? manifests.filter(manifest => requested.includes(manifest.name)) : manifests;
const walk = folder => readdirSync(folder, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(folder, entry.name)) : [path.join(folder, entry.name)]);
const logDir = path.join(projectRoot, 'temp/verification-logs');
mkdirSync(logDir, { recursive: true });
if (!process.argv.includes('--skip-build')) run(process.execPath, ['scripts/build-js-plugins.mjs', ...requested]);
const results = [];
for (const manifest of selected) {
    let consumer;
    const checks = [];
    try {
        consumer = mkdtempSync(path.join(projectRoot, 'temp/js-install-'));
        mkdirSync(path.join(consumer, 'assets'));
        mkdirSync(path.join(consumer, 'packages'));
        cpSync(path.join(projectRoot, projectFile), path.join(consumer, 'verify.laya'));
        for (const dir of ['engine', 'settings']) cpSync(path.join(projectRoot, dir), path.join(consumer, dir), { recursive: true });
        const config = JSON.parse(readFileSync(path.join(projectRoot, 'tsconfig.json'), 'utf8'));
        config.include.push('./library/packages/*/index.d.ts', './probe.ts');
        writeFileSync(path.join(consumer, 'tsconfig.json'), JSON.stringify(config));
        const build = JSON.parse(readFileSync(path.join(consumer, 'settings/BuildSettings.json'), 'utf8'));
        delete build.startupScene;
        writeFileSync(path.join(consumer, 'settings/BuildSettings.json'), JSON.stringify(build));
        const dependencies = {};
        const names = [manifest.name, ...Object.keys(manifest.pluginDependencies ?? {})];
        for (const name of names) {
            const version = manifests.find(value => value.name === name).version;
            cpSync(path.join(projectRoot, `release/plugins/${name}-${version}.layapkg`), path.join(consumer, name + '.layapkg'));
            dependencies[name] = `file:../${name}.layapkg`;
        }
        writeFileSync(path.join(consumer, 'packages/manifest.json'), JSON.stringify({ dependencies }));
        const cli = (method, file, args) => {
            const result = runLaya(['run', '--project', consumer, `--script=${method}`,
                ...(file ? ['--script-file', file] : []), ...(args ? ['--script-args=' + args] : [])], { stdio: 'pipe', encoding: 'utf8' });
            process.stdout.write(result.stdout); process.stderr.write(result.stderr);
            return result.stdout;
        };
        cli('JSPackageRegistryProbe.verify', path.join(projectRoot, 'tests/js-package-registry-probe.ts'));
        assert.ok(!existsSync(path.join(consumer, 'assets/plugins')));
        for (const name of names) {
            const files = walk(path.join(consumer, 'library/packages', name));
            assert.ok(!files.some(file => file.endsWith('.ts') && !file.endsWith('.d.ts')), 'JS package must have no TypeScript implementation');
            const uuids = new Set();
            for (const file of files.filter(file => file.endsWith('.meta'))) {
                const uuid = JSON.parse(readFileSync(file, 'utf8')).uuid;
                if (uuid) { assert.ok(!uuids.has(uuid), `duplicate package UUID ${uuid}`); uuids.add(uuid); }
            }
        }
        checks.push('JS-only installation', 'component UUID/editor registry');
        const apiProbe = {
            'loom.bt': ['installed-bt-probe.ts', 'InstalledBTProbe.verify', 'Installed BT:'],
            'loom.core': ['installed-core-probe.ts', 'InstalledCoreProbe.verify', 'Installed core:'],
            'loom.i18n': ['installed-i18n-probe.ts', 'InstalledI18nProbe.verify', 'Installed i18n:'],
            'loom.ui': ['installed-ui-probe.ts', 'InstalledUIProbe.verify', 'Installed UI:'],
            'loom.pathfinding': ['installed-pathfinding-probe.ts', 'InstalledPathfindingProbe.verify', 'Installed pathfinding:'],
        }[manifest.name];
        if (apiProbe) {
            const source = readFileSync(path.join(projectRoot, 'tests', apiProbe[0]), 'utf8');
            writeFileSync(path.join(consumer, 'native-probe.ts'), source);
            assert.ok(cli(apiProbe[1], path.join(consumer, 'native-probe.ts')).includes(apiProbe[2]));
            checks.push('native API/import identity');
        }
        if (manifest.name === 'loom.address') {
            const configFile = path.join(consumer, 'assets/editorResources/address-mapping-watcher/config.json');
            assert.deepEqual(JSON.parse(readFileSync(configFile, 'utf8')).watchDirs, []);
            const settings = JSON.stringify({ watchDirs: ['resources/icons', 'portraits'], extensions: ['png'], debounceMs: 0 });
            writeFileSync(configFile, settings);
            const image = path.join(projectRoot, 'assets/examples/manual-atlas-collector/demo.png');
            for (const relative of ['resources/icons/apple.png', 'portraits/hero.png']) {
                mkdirSync(path.dirname(path.join(consumer, 'assets', relative)), { recursive: true });
                cpSync(image, path.join(consumer, 'assets', relative));
            }
            cli('LoomAddressMappingEditor.update');
            const output = path.join(consumer, 'assets/resources/address.json');
            const expected = { $path: [['resources/icons', '.png'], ['portraits', '.png']], apple: 0, hero: 1 };
            assert.deepEqual(JSON.parse(readFileSync(output)), expected);
            cli('LoomAddressMappingPlugin.check');
            assert.equal(readFileSync(configFile, 'utf8'), settings);
            assert.ok(cli('InstalledAddressMappingProbe.verify', path.join(projectRoot, 'tests/installed-address-mapping-probe.ts')).includes('Installed runtime:'));
            rmSync(path.join(consumer, 'assets/portraits/hero.png'));
            assert.throws(() => cli('LoomAddressMappingPlugin.check'), /failed/, 'stale mapping must reject');
            cpSync(image, path.join(consumer, 'assets/portraits/hero.png'));
            checks.push('default/preserved config', 'UI menu → Scene runScript', 'CLI generation/check', 'native JSON loader');
        }
        if (manifest.name === 'loom.atlas') {
            const configFile = path.join(consumer, 'assets/editorResources/manual-atlas-collector/config.json');
            assert.deepEqual(JSON.parse(readFileSync(configFile, 'utf8')).atlases, []);
            cpSync(path.join(projectRoot, 'assets/examples/manual-atlas-collector'), path.join(consumer, 'assets/examples/manual-atlas-collector'), { recursive: true });
            const settings = JSON.stringify({ atlases: ['examples/manual-atlas-collector/demo.atlas'], retain: true });
            writeFileSync(configFile, settings);
            cli('JSPackageRegistryProbe.verify', path.join(projectRoot, 'tests/js-package-registry-probe.ts'));
            const payload = JSON.parse(readFileSync(path.join(consumer, 'bin/manual-atlas-collector.json'), 'utf8'));
            assert.equal(payload.atlases.length, 1);
            assert.equal(readFileSync(configFile, 'utf8'), settings);
            checks.push('default/preserved config', 'native Scene atlas mapping');
        }
        if (manifest.name === 'loom.pathfinding') {
            cli('AstarBakeEditorService.writeFile', null, 'resources/js-bake-test.json "{\\\"ok\\\":true}"');
            assert.ok(existsSync(path.join(consumer, 'assets/resources/js-bake-test.json')));
            checks.push('UI asset database write', 'native Scene bake');
        }
        if (manifest.name === 'loom.ui') {
            mkdirSync(path.join(consumer, 'assets/resources'), { recursive: true });
            writeFileSync(path.join(consumer, 'assets/resources/Panel.lh'), JSON.stringify({ _$ver: 1, _$id: 'fixture', _$type: 'GWidget', name: 'Panel', width: 100, height: 100,
                _$comp: [{ _$type: 'b0c345c4-9c3a-4c6a-883b-f6b19d06102f', scriptPath: '~/packages/loom.ui/runtime/ui-panel.d.ts', anim: 0, center: false, life: 1 }] }));
        }
        // Runtime assertion probes intentionally narrow mutable values; type-check separate business usage.
        const typedUsage = {
            'loom.bt': 'const builder: api.BTBuilder = new loom.bt.BTBuilder(); const runner = new api.BTRunner(builder.wait(0.1), {}); const status: api.BTStatus = runner.tick(0.1);',
            'loom.core': 'const notifier: api.Notifier = new loom.core.Notifier(); const manager = new api.ModuleManager(); const token = api.moduleToken<{ value: number }>("typed"); const value: number = manager.get(token)?.value ?? 0;',
            'loom.i18n': 'class Language extends api.LangBase { ok = "OK"; } const unbind: () => void = loom.i18n.bind(new Language()); const value: string = loom.i18n.gettext("ok");',
            'loom.ui': 'const panel: api.UIPanel = new api.UIPanel(); const opened: Promise<Laya.GWidget> = loom.ui.open("resources/Panel.lh"); const manager: api.UIManager = api.UIManager.inst;',
            'loom.pathfinding': 'const grid: api.AStarGrid = new loom.pathfinding.AStarGrid({ width: 2, height: 2, walkable: new Uint8Array(4).fill(1) }); const reached: boolean = grid.findPath({ x: 0, y: 0 }, { x: 1, y: 1 }).reachedTarget;',
            'loom.address': 'const addresses: Promise<Record<string, string>> = loom.address.load();',
            'loom.atlas': 'const runtime: typeof api.ManualAtlasCollectorRuntime = api.ManualAtlasCollectorRuntime;',
        }[manifest.name];
        writeFileSync(path.join(consumer, 'probe.ts'), `import * as api from ${JSON.stringify('~/packages/' + manifest.name)};\n${typedUsage}\n// @ts-expect-error: declarations must reject nonexistent API members.\napi.__missingMember;\n`);
        run(process.execPath, ['node_modules/typescript/bin/tsc', '--project', consumer, '--noEmit', '--pretty', 'false']);
        checks.push('TypeScript declarations');
        runLaya(['build', 'web', '--project', consumer]);
        assert.ok(existsSync(path.join(consumer, 'release/web/js', manifest.name + '.runtime.js')));
        if (manifest.name === 'loom.address') {
            assert.ok(existsSync(path.join(consumer, 'release/web/portraits/hero.png')));
            assert.ok(existsSync(path.join(consumer, 'release/web/resources/address.json')));
            assert.ok(!existsSync(path.join(consumer, 'release/web/editorResources')));
            run(process.execPath, ['tests/installed-address-mapping.cjs', consumer]);
            checks.push('mapping/images export', 'installed IDE load/unload during resource imports');
        }
        if (manifest.name === 'loom.atlas') {
            const config = JSON.parse(readFileSync(path.join(consumer, 'release/web/fileconfig.json'), 'utf8'));
            assert.deepEqual(config.config.find(entry => entry.prefix === 'examples/manual-atlas-collector/demo/').frames, ['red.png', 'blue.png']);
            checks.push('atlas/texture/fileconfig export');
        }
        if (manifest.name === 'loom.ui') {
            run(process.execPath, ['tests/installed-ui-browser.mjs', consumer, '--js']);
            checks.push('native Chromium prefab UUID/open/cache/close: Preview + Web');
        }
        checks.push('independent Web build');
        results.push({ name: manifest.name, passed: true, checks });
        console.log(`JS package PASS: ${manifest.name}`);
    } catch (error) {
        results.push({ name: manifest.name, passed: false, checks, error: String(error.stack ?? error) });
        console.error(`JS package FAIL: ${manifest.name}: ${error.message}`);
    } finally {
        if (consumer && !process.env.KEEP_JS_VERIFY) rmSync(consumer, { recursive: true, force: true });
        else if (consumer) console.log(`JS consumer kept: ${consumer}`);
    }
}
const reportName = requested.length ? `js-plugin-functions-${selected.map(manifest => manifest.name).join('-')}.json` : 'js-plugin-functions.json';
writeFileSync(path.join(logDir, reportName), JSON.stringify({ results }, null, 2));
if (results.some(result => !result.passed)) process.exitCode = 1;
