import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { projectRoot, projectFile, run, runLaya, startPreview } from './laya.mjs';

if (!process.argv.includes('--skip-build')) run(process.execPath, ['scripts/build-js-plugins.mjs', 'loom.sdk']);
const walk = folder => readdirSync(folder, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(folder, entry.name)) : [path.join(folder, entry.name)]);
let consumer, preview;
try {
    mkdirSync(path.join(projectRoot, 'temp'), { recursive: true });
    consumer = mkdtempSync(path.join(projectRoot, 'temp/sdk-install-'));
    cpSync(path.join(projectRoot, projectFile), path.join(consumer, 'verify.laya'));
    for (const dir of ['engine', 'settings']) cpSync(path.join(projectRoot, dir), path.join(consumer, dir), { recursive: true });
    mkdirSync(path.join(consumer, 'assets')); mkdirSync(path.join(consumer, 'packages'));
    const config = JSON.parse(readFileSync(path.join(projectRoot, 'tsconfig.json'), 'utf8'));
    config.include.push('./library/packages/*/index.d.ts');
    writeFileSync(path.join(consumer, 'tsconfig.json'), JSON.stringify(config));
    cpSync(path.join(projectRoot, 'release/plugins/loom.sdk.layapkg'), path.join(consumer, 'plugin.layapkg'));
    writeFileSync(path.join(consumer, 'packages/manifest.json'), JSON.stringify({ dependencies: { 'loom.sdk': 'file:../plugin.layapkg' } }));
    const cli = (method, extra = []) => {
        const result = runLaya(['run', '--project', consumer, `--script=${method}`, ...extra], { stdio: 'pipe', encoding: 'utf8' });
        process.stdout.write(result.stdout); process.stderr.write(result.stderr); return result.stdout;
    };
    cli('InstalledSDKProbe.bootstrap', ['--script-file', path.join(projectRoot, 'tests/installed-sdk-probe.ts')]);
    const installed = path.join(consumer, 'library/packages/loom.sdk');
    const files = walk(installed);
    assert.ok(existsSync(path.join(installed, 'editorResources/loom.sdk/loom.sdk.ts.txt')));
    assert.equal(JSON.parse(readFileSync(path.join(installed, 'editorResources/loom.sdk/loom.sdk.ts.txt.meta'), 'utf8')).uuid, '20abf886-34e8-4e44-a8e3-521a03bbf1ca');
    const resources = path.join(installed, 'editorResources/loom.sdk');
    for (const file of ['loom.sdk.ts', 'loom.sdk.d.ts', 'loom.wechat.js', 'loom.douyin.js']) {
        assert.equal(readFileSync(path.join(resources, file + '.txt'), 'utf8'), readFileSync(path.join(projectRoot, 'assets/plugins/loom.sdk/editorResources/loom.sdk', file + '.txt'), 'utf8'));
    }
    assert.ok(existsSync(path.join(installed, 'build~/bundle.scene.js')));
    assert.ok(existsSync(path.join(installed, 'build~/bundle.editor.js')));
    assert.ok(!files.some(file => file.endsWith('.ts') && !file.endsWith('.d.ts')), 'no package TS implementation');
    assert.ok(files.filter(file => file.endsWith('.js')).every(file => path.dirname(file) === path.join(installed, 'build~')), 'only editor JS; no SDK runtime or JS bridges');
    const adapter = path.join(consumer, 'src/loom/loom.sdk.ts');
    const template = path.join(consumer, 'assets/editorResources/loom.sdk/loom.sdk.ts.txt');
    const configFile = path.join(consumer, 'assets/editorResources/loom.sdk/config.json');
    assert.ok(existsSync(adapter), 'installation generates default project TS');
    for (const file of ['loom.sdk.ts', 'loom.sdk.d.ts', 'loom.wechat.js', 'loom.douyin.js']) {
        assert.equal(readFileSync(path.join(consumer, 'src/loom', file), 'utf8'), readFileSync(path.join(resources, file + '.txt'), 'utf8'));
    }
    const nativeFiles = ['loom.wechat.js', 'loom.douyin.js', 'loom.sdk.d.ts'].map(file => path.join(consumer, 'src/loom', file));
    for (const file of nativeFiles) writeFileSync(file, readFileSync(file, 'utf8') + '\n// project customization retained\n');
    const nativeCopies = nativeFiles.map(file => ({ file, code: readFileSync(file, 'utf8'), meta: readFileSync(file + '.meta', 'utf8') }));
    const meta = readFileSync(adapter + '.meta', 'utf8');
    const bundle = readFileSync(adapter.replace(/\.ts$/, '.bundledef'), 'utf8');
    writeFileSync(adapter, readFileSync(adapter, 'utf8') + '\n// project customization retained\n');
    writeFileSync(template, readFileSync(template, 'utf8') + '\n// project template customization retained\n');
    const edited = readFileSync(adapter, 'utf8');
    const settings = '{ "output": "src/loom/loom.sdk.ts", "custom": true }\n';
    writeFileSync(configFile, settings);
    cli('LoomSDKPlugin.generate');
    cli('LoomSDKEditor.generate');
    assert.equal(readFileSync(adapter, 'utf8'), edited);
    assert.equal(readFileSync(configFile, 'utf8'), settings);
    assert.equal(readFileSync(adapter + '.meta', 'utf8'), meta);
    assert.equal(readFileSync(adapter.replace(/\.ts$/, '.bundledef'), 'utf8'), bundle);
    // Simulate a package reinstall; project sources, template and metadata remain untouched.
    rmSync(installed, { recursive: true, force: true });
    cli('LoomSDKPlugin.generate');
    assert.equal(readFileSync(adapter, 'utf8'), edited);
    assert.ok(readFileSync(template, 'utf8').includes('project template customization retained'));
    assert.equal(readFileSync(adapter + '.meta', 'utf8'), meta);
    for (const copy of nativeCopies) {
        assert.equal(readFileSync(copy.file, 'utf8'), copy.code);
        assert.equal(readFileSync(copy.file + '.meta', 'utf8'), copy.meta);
    }
    // Simulate the platform JS loaded by the host before the generated entry.
    const entry = adapter.replace(/\.ts$/, '.entry.ts');
    writeFileSync(entry, `const native = {
    platform: "douyin" as const,
    init() { if (this !== native || (window as any).$env?.appid !== "probe") throw new Error("SDK global environment forwarding failed"); },
    login(options: { success(): void }) { options.success(); },
    getLaunchOptionsSync() { return { scene: "0012", query: {} }; },
};
(window as any).__sdk = native;
` + readFileSync(entry, 'utf8'));
    const id = randomUUID();
    writeFileSync(path.join(consumer, 'assets/Business.ts'), `
const sdkAtTop = loom.sdk;
if (!sdkAtTop) throw new Error("SDK not mounted at business module evaluation");

loom.sdk.init({ appid: "probe", debug: false });
let loggedIn = false;
loom.sdk.login({ success: () => { loggedIn = true; }, fail: () => { throw new Error("Unexpected SDK login failure"); } });
if (!loggedIn || loom.sdk.platform !== "douyin" || loom.sdk.getLaunchOptionsSync().scene !== "0012") throw new Error("SDK native forwarding failed");
(window as any).__sdkStartup = true;
@Laya.regClass()
export class SDKBusiness {}
`);
    writeFileSync(path.join(consumer, 'assets/Business.ts.meta'), JSON.stringify({ uuid: id }));
    writeFileSync(path.join(consumer, 'settings/CompilerSettings.json'), JSON.stringify({ entries: [`res://${id}`] }));
    const build = JSON.parse(readFileSync(path.join(consumer, 'settings/BuildSettings.json'), 'utf8'));
    delete build.startupScene;
    writeFileSync(path.join(consumer, 'settings/BuildSettings.json'), JSON.stringify(build));
    assert.ok(cli('InstalledSDKProbe.verify', ['--script-file', path.join(projectRoot, 'tests/installed-sdk-probe.ts')]).includes('Installed SDK:'));
    run(process.execPath, ['node_modules/typescript/bin/tsc', '--project', consumer, '--noEmit', '--pretty', 'false']);
    runLaya(['build', 'web', '--project', consumer]);
    assert.ok(!existsSync(path.join(consumer, 'release/web/js/loom.sdk.runtime.js')));
    assert.ok(!existsSync(path.join(consumer, 'release/web/editorResources')));
    preview = await startPreview(consumer);
    run(process.execPath, ['tests/installed-sdk-browser.mjs', consumer, preview.url]);
    assert.ok(!existsSync(path.join(consumer, 'assets/plugins')));
    console.log('Verified installed Loom SDK: editor-only package, editable project TS, preserved edits/UUIDs and no-import Scene/Preview/Web startup.');
} finally {
    preview?.stop();
    if (consumer && !process.env.KEEP_SDK_VERIFY) rmSync(consumer, { recursive: true, force: true });
    else if (consumer) console.log(`SDK consumer kept: ${consumer}`);
}
