import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { projectFile, projectRoot, run, runLaya, startPreview } from './laya.mjs';

const jsMode = process.argv.includes('--js');
const remoteMode = process.argv.includes('--remote');
if (remoteMode && !jsMode) throw new Error('Remote verification requires JS packages.');
const remoteDependencies = remoteMode ? JSON.parse(readFileSync(path.join(projectRoot, 'release/plugins/manifest.json'), 'utf8')).dependencies : null;

async function verifyOrder(order, packageNames) {
    let consumer, preview;
    try {
        mkdirSync(path.join(projectRoot, 'temp'), { recursive: true });
        consumer = mkdtempSync(path.join(projectRoot, 'temp/package-startup-'));
        cpSync(path.join(projectRoot, projectFile), path.join(consumer, 'verify.laya'));
        for (const dir of ['engine', 'settings']) cpSync(path.join(projectRoot, dir), path.join(consumer, dir), { recursive: true });
        const config = JSON.parse(readFileSync(path.join(projectRoot, 'tsconfig.json'), 'utf8'));
        // Include declarations through TypeScript configuration, with no business or runtime imports.
        config.include.push(jsMode ? './library/packages/*/index.d.ts' : './library/packages/*/index.ts');
        writeFileSync(path.join(consumer, 'tsconfig.json'), JSON.stringify(config, null, 2));
        mkdirSync(path.join(consumer, 'assets'));
        mkdirSync(path.join(consumer, 'packages'));
        const dependencies = {};
        for (const name of packageNames) {
            const manifest = JSON.parse(readFileSync(path.join(projectRoot, 'assets/plugins', name, 'package.json'), 'utf8'));
            if (remoteMode) {
                dependencies[name] = process.env.LOOM_VERIFY_PACKAGE_BASE_URL
                    ? `${process.env.LOOM_VERIFY_PACKAGE_BASE_URL}/${name}-${manifest.version}.layapkg`
                    : remoteDependencies[name];
                assert.match(dependencies[name] ?? '', /^https?:\/\//, `missing HTTP package URL for ${name}`);
            } else {
                cpSync(path.join(projectRoot, `release/plugins/${jsMode ? '' : 'source/'}${name}-${manifest.version}.layapkg`), path.join(consumer, `${name}.layapkg`));
                dependencies[name] = `file:../${name}.layapkg`;
            }
        }
        writeFileSync(path.join(consumer, 'packages/manifest.json'), JSON.stringify({ dependencies }, null, 2));
        const probeId = randomUUID();
        const businessFile = path.join(projectRoot, 'tests/package-startup-business.ts');
        const businessSource = readFileSync(businessFile, 'utf8');
        assert.doesNotMatch(businessSource, /^\s*import\b/m, 'business probe must have no import declarations');
        assert.doesNotMatch(businessSource, /\bimport\s*\(/, 'business probe must have no dynamic imports');
        cpSync(businessFile, path.join(consumer, 'assets/Business.ts'));
        writeFileSync(path.join(consumer, 'assets/Business.ts.meta'), JSON.stringify({ uuid: probeId }));
        writeFileSync(path.join(consumer, 'settings/CompilerSettings.json'), JSON.stringify({ entries: [`res://${probeId}`] }));
        const build = JSON.parse(readFileSync(path.join(consumer, 'settings/BuildSettings.json'), 'utf8'));
        delete build.startupScene;
        writeFileSync(path.join(consumer, 'settings/BuildSettings.json'), JSON.stringify(build));
        const result = runLaya(['run', '--project', consumer, '--script=PackageStartupSceneProbe.verify',
            '--script-file', path.join(projectRoot, 'tests/package-startup-scene-probe.ts')], { stdio: 'pipe', encoding: 'utf8' });
        process.stdout.write(result.stdout); process.stderr.write(result.stderr);
        assert.ok(result.stdout.includes('PACKAGE_STARTUP_SCENE='));
        assert.ok(!existsSync(path.join(consumer, 'assets/plugins')), 'consumer must use installed packages only');
        assert.ok(existsSync(path.join(consumer, 'assets/editorResources/address-mapping-watcher/config.json')), 'installed address must still create its editor configuration');
        const scene = JSON.parse(result.stdout.match(/^PACKAGE_STARTUP_SCENE=(.+)$/m)[1]);
        run(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit', '--pretty', 'false', '--project', consumer]);
        runLaya(['build', 'web', '--project', consumer]);
        preview = await startPreview(consumer);
        run(process.execPath, ['tests/package-startup-browser.mjs', consumer, preview.url, ...(jsMode ? ['--js'] : [])]);
        const browser = JSON.parse(readFileSync(path.join(consumer, 'startup-browser-results.json'), 'utf8'));
        const webBundle = readFileSync(path.join(consumer, 'release/web/js/bundle.js'), 'utf8');
        return { order, packages: packageNames, types: true, addressConfigCreated: true, scene, ...browser,
            webOffsets: { business: webBundle.indexOf('var startupNamespaces'), btMount: webBundle.indexOf('LoomBTRuntime.install();') } };
    } finally {
        preview?.stop();
        if (consumer && !process.env.KEEP_STARTUP_VERIFY) rmSync(consumer, { recursive: true, force: true });
        else if (consumer) console.log(`Consumer kept for inspection: ${consumer}`);
    }
}

if (!process.argv.includes('--skip-build')) run(process.execPath, [jsMode ? 'scripts/build-js-plugins.mjs' : 'scripts/build-plugins.mjs']);
const names = readdirSync(path.join(projectRoot, 'assets/plugins')).filter(name => existsSync(path.join(projectRoot, 'assets/plugins', name, 'package.json'))).sort();
const cases = [];
for (const [order, packages] of [['alphabetical', names], ['reversed', [...names].reverse()]]) {
    cases.push(await verifyOrder(order, packages));
}
const ready = cases.every(test => test.scene.ready && test.preview.startup?.ready && test.published.startup?.ready);
const report = { layaVersion: JSON.parse(readFileSync(path.join(projectRoot, projectFile), 'utf8')).version,
    businessHasImports: false, remotePackages: remoteMode, allTestedTargetsReady: ready, cases };
const reportPath = path.join(projectRoot, `temp/verification-logs/${remoteMode ? 'remote-' : ''}${jsMode ? 'js-' : ''}package-startup.json`);
mkdirSync(path.dirname(reportPath), { recursive: true });
writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`Startup verification report: ${reportPath}`);
if (!ready) {
    console.error('Automatic package mounting is NOT ready before no-import business module evaluation in every tested target.');
    process.exitCode = 1;
} else console.log('All tested targets mount package globals before no-import business module evaluation.');
