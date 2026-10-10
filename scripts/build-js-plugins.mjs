import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { projectFile, projectRoot, requirePackageExport, run, runLaya } from './laya.mjs';
import { distributionSettings, writePluginDistribution } from './plugin-distribution.mjs';
import { syncSDKTemplate } from './sync-sdk-template.mjs';

const plugins = readdirSync(path.join(projectRoot, 'assets/plugins')).filter(name => existsSync(path.join(projectRoot, 'assets/plugins', name, 'package.json'))).sort().map(name => {
    const source = path.join(projectRoot, 'assets/plugins', name);
    return { source, manifest: JSON.parse(readFileSync(path.join(source, 'package.json'), 'utf8')) };
});
const args = process.argv.slice(2);
const requested = args.filter(arg => arg !== '--skip-source-build');
if (requested.length === 1 && requested[0] === '--list') {
    for (const { manifest } of plugins) console.log(`${manifest.name}: ${manifest.name}@${manifest.version}`);
    process.exit(0);
}
const unknown = requested.filter(name => !plugins.some(plugin => plugin.manifest.name === name));
if (unknown.length) throw new Error(`Unknown plugins: ${unknown.join(', ')}. Use npm run list:plugins.`);
const selected = new Set(requested.length ? requested : plugins.map(plugin => plugin.manifest.name));
const includeDependencies = name => {
    const plugin = plugins.find(plugin => plugin.manifest.name === name);
    if (!plugin) throw new Error(`Unknown plugin dependency: ${name}`);
    for (const dependency of Object.keys(plugin.manifest.pluginDependencies ?? {})) {
        if (!selected.has(dependency)) { selected.add(dependency); includeDependencies(dependency); }
    }
};
for (const name of selected) includeDependencies(name);
const outputRoot = path.join(projectRoot, 'release/plugins');
distributionSettings();
let staging;
try {
    requirePackageExport();
    syncSDKTemplate();
    mkdirSync(path.join(projectRoot, 'temp'), { recursive: true });
    staging = mkdtempSync(path.join(projectRoot, 'temp/js-package-build-'));
    // Source archives are compiler inputs, kept out of the default distribution folder.
    const sourceOutput = args.includes('--skip-source-build') ? path.join(projectRoot, 'release/plugins/source') : path.join(staging, 'source-packages');
    if (!args.includes('--skip-source-build')) run(process.execPath, ['scripts/build-plugins.mjs', `--output-dir=${path.relative(projectRoot, sourceOutput)}`]);
    const compiler = path.join(staging, 'compiler');
    mkdirSync(path.join(compiler, 'assets'), { recursive: true });
    mkdirSync(path.join(compiler, 'packages'));
    cpSync(path.join(projectRoot, projectFile), path.join(compiler, 'verify.laya'));
    for (const dir of ['engine', 'settings']) cpSync(path.join(projectRoot, dir), path.join(compiler, dir), { recursive: true });
    const config = JSON.parse(readFileSync(path.join(projectRoot, 'tsconfig.json'), 'utf8'));
    config.include = ['./library/packages/**/*.ts', './engine/**/*.d.ts'];
    writeFileSync(path.join(compiler, 'tsconfig.json'), JSON.stringify(config));
    const dependencies = {};
    for (const { manifest } of plugins) {
        cpSync(path.join(sourceOutput, `${manifest.name}.layapkg`), path.join(compiler, `${manifest.name}.layapkg`));
        dependencies[manifest.name] = `file:../${manifest.name}.layapkg`;
    }
    writeFileSync(path.join(compiler, 'packages/manifest.json'), JSON.stringify({ dependencies }));
    runLaya(['run', '--project', compiler, '--script=CompileJSPackagesProbe.verify',
        '--script-file', path.join(projectRoot, 'tests/compile-js-packages-probe.ts')]);
    const types = path.join(staging, 'types');
    run(process.execPath, ['node_modules/typescript/bin/tsc', '--project', compiler, '--noEmit', 'false', '--declaration', '--emitDeclarationOnly',
        '--outDir', types, '--rootDir', path.join(compiler, 'library/packages'), '--pretty', 'false']);
    const parsed = ts.getParsedCommandLineOfConfigFile(path.join(compiler, 'tsconfig.json'), {}, {
        ...ts.sys, onUnRecoverableConfigFileDiagnostic: error => { throw new Error(ts.flattenDiagnosticMessageText(error.messageText, '\n')); },
    });
    const program = ts.createProgram(parsed.fileNames, parsed.options);
    const checker = program.getTypeChecker();
    const runtimeIds = new Map(plugins.map(({ source, manifest }) => [manifest.name, JSON.parse(readFileSync(path.join(source, 'index.ts.meta'), 'utf8')).uuid]));
    mkdirSync(outputRoot, { recursive: true });
    for (const { source, manifest } of plugins) {
        const name = manifest.name;
        if (!selected.has(name)) continue;
        const hasRuntime = manifest.loom?.runtime !== false;
        const folder = path.join(staging, name);
        mkdirSync(path.join(folder, 'build~'), { recursive: true });
        cpSync(path.join(types, name), folder, { recursive: true });
        const registered = [];
        const copyAssets = (from, to) => {
            for (const entry of readdirSync(from, { withFileTypes: true })) {
                if (entry.isDirectory()) { mkdirSync(path.join(to, entry.name), { recursive: true }); copyAssets(path.join(from, entry.name), path.join(to, entry.name)); continue; }
                if (entry.name.endsWith('.ts.meta')) {
                    const meta = JSON.parse(readFileSync(path.join(from, entry.name), 'utf8'));
                    const basename = entry.name.slice(0, -5);
                    if (path.relative(source, path.join(from, entry.name)) !== 'index.ts.meta') {
                        cpSync(path.join(from, entry.name), path.join(to, (basename.endsWith('.d.ts') ? basename : basename.replace(/\.ts$/, '.d.ts')) + '.meta'));
                        registered.push(meta.uuid);
                    }
                } else if (entry.name.endsWith('.d.ts')) cpSync(path.join(from, entry.name), path.join(to, entry.name));
                else if (!entry.name.endsWith('.ts') && entry.name !== 'package.json') cpSync(path.join(from, entry.name), path.join(to, entry.name));
            }
        };
        copyAssets(source, folder);
        const sourceFile = program.getSourceFile(path.join(compiler, 'library/packages', name, 'index.ts'));
        const exports = checker.getExportsOfModule(checker.getSymbolAtLocation(sourceFile)).filter(symbol => {
            const value = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
            return !!(value.flags & ts.SymbolFlags.Value);
        }).map(symbol => symbol.name);
        // JS module bridges preserve imports of public runtime exports and registered editor classes.
        for (const file of program.getSourceFiles()) {
            if (!hasRuntime) break;
            const relative = path.relative(path.join(compiler, 'library/packages', name), file.fileName);
            if (relative.startsWith('..') || file.isDeclarationFile) continue;
            const module = checker.getSymbolAtLocation(file);
            if (!module) continue;
            const values = checker.getExportsOfModule(module).filter(symbol => {
                const value = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
                return !!(value.flags & ts.SymbolFlags.Value);
            }).map(symbol => symbol.name);
            if (!values.length) continue;
            const jsFile = path.join(folder, relative.replace(/\.ts$/, '.js'));
            writeFileSync(jsFile, values.map(value => value === 'default'
                ? `export default globalThis.__loomPackageExports[${JSON.stringify(name)}].default;`
                : `export const ${value} = globalThis.__loomPackageExports[${JSON.stringify(name)}][${JSON.stringify(value)}];`).join('\n') + '\n');
            writeFileSync(jsFile + '.meta', JSON.stringify({ importer: { import: false } }));
        }
        const compiled = suffix => {
            const file = path.join(compiler, 'library/packages/build', name + suffix + '.js');
            return existsSync(file) ? readFileSync(file, 'utf8').replace(/\/\/# sourceMappingURL=.*$/gm, '') : null;
        };
        const runtime = compiled('');
        if (hasRuntime) assert.ok(runtime, `missing official runtime output for ${name}`);
        // Scene/UI precompiled package wrappers expect this export variable.
        for (const [suffix, file] of [['.scene', 'bundle.scene.js'], ['.editor', 'bundle.editor.js']]) {
            const code = compiled(suffix);
            if (!code) continue;
            writeFileSync(path.join(folder, 'build~', file), code
                .replaceAll('__bundle__', '__laya_precompiled__')
                + `\nglobalThis.__loomPackageExports ??= {}; globalThis.__loomPackageExports[${JSON.stringify(name)}] = __laya_precompiled__;\n`);
        }
        if (hasRuntime) {
            const aliases = registered.map(id => [id, Buffer.from(id.replaceAll('-', ''), 'hex').toString('base64url')]);
            const runtimeFile = `${name}.runtime.js`;
            writeFileSync(path.join(folder, runtimeFile), runtime.replaceAll('window.__setBundle_(', 'window.__setBundle_ && window.__setBundle_(')
                + `\nglobalThis.__loomPackageExports ??= {}; globalThis.__loomPackageExports[${JSON.stringify(name)}] = __bundle__;\n`
                + `for (const [id, compressed] of ${JSON.stringify(aliases)}) { const type = Laya.ClassUtils.getClass(id); if (type) Laya.ClassUtils.regClass(compressed, type); }\n`);
            writeFileSync(path.join(folder, runtimeFile + '.meta'), JSON.stringify({ uuid: runtimeIds.get(name), importer: {
                import: true, type: 'runtime', allowLoadInEditor: false, allowLoadInRuntime: true, autoLoad: true,
                references: Object.keys(manifest.pluginDependencies ?? {}).map(dependency => `res://${runtimeIds.get(dependency)}`),
            } }, null, 2));
        }
        writeFileSync(path.join(folder, 'package.json'), JSON.stringify(manifest, null, 2));
        const output = path.join(outputRoot, `${name}.layapkg`);
        rmSync(output, { force: true });
        runLaya(['export-installable-package', path.relative(projectRoot, folder), '--output', path.relative(projectRoot, output),
            '--project', projectRoot, '--skip-package-install']);
        console.log(`JS package: ${output} (${hasRuntime ? exports.length + " public runtime exports" : "editor-only"})`);
    }
    writePluginDistribution(plugins.filter(plugin => selected.has(plugin.manifest.name)).map(plugin => plugin.manifest), outputRoot);
} finally {
    if (staging && !process.env.KEEP_JS_BUILD) rmSync(staging, { recursive: true, force: true });
    else if (staging) console.log(`JS build staging kept: ${staging}`);
}
