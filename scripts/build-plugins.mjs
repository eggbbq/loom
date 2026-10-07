import { mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { projectRoot, requirePackageExport, run, runLaya } from './laya.mjs';

const pluginsRoot = path.join(projectRoot, 'assets/plugins');

function discoverPlugins() {
    return readdirSync(pluginsRoot, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => {
        const folder = path.join(pluginsRoot, entry.name);
        const manifest = JSON.parse(readFileSync(path.join(folder, 'package.json'), 'utf8'));
        if (!/^[a-z0-9][a-z0-9.-]*$/.test(manifest.name) || !/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i.test(manifest.version)) {
            throw new Error(`Invalid package name/version in ${entry.name}/package.json.`);
        }
        const output = `release/plugins/${manifest.name}-${manifest.version}.layapkg`;
        return { id: entry.name, manifest, source: `assets/plugins/${entry.name}`, output };
    }).sort((a, b) => a.id.localeCompare(b.id));
}

try {
    const args = process.argv.slice(2);
    const plugins = discoverPlugins();
    const names = new Set();
    for (const plugin of plugins) {
        if (names.has(plugin.manifest.name)) throw new Error(`Duplicate package name: ${plugin.manifest.name}`);
        names.add(plugin.manifest.name);
    }
    if (args.length === 1 && args[0] === '--list') {
        for (const plugin of plugins) console.log(`${plugin.id}: ${plugin.manifest.name}@${plugin.manifest.version}`);
    } else {
        const unknown = args.filter(id => !plugins.some(plugin => plugin.id === id));
        if (unknown.length) throw new Error(`Unknown plugins: ${unknown.join(', ')}. Use npm run list:plugins.`);
        const selected = args.length ? plugins.filter(plugin => args.includes(plugin.id)) : plugins;
        if (!selected.length) throw new Error('No plugins to build. Add a folder with package.json under assets/plugins.');
        requirePackageExport();
        console.log('Checking TypeScript...');
        run(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit', '--pretty', 'false']);
        const tests = readdirSync(path.join(projectRoot, 'tests')).filter(name => name.endsWith('.test.cjs'));
        if (tests.length) run(process.execPath, ['--test', ...tests.map(name => `tests/${name}`)]);
        mkdirSync(path.join(projectRoot, 'release/plugins'), { recursive: true });
        for (const plugin of selected) {
            const output = path.join(projectRoot, plugin.output);
            rmSync(output, { force: true });
            console.log(`Exporting ${plugin.manifest.name}@${plugin.manifest.version}...`);
            try {
                runLaya(['export-installable-package', plugin.source, '--output', plugin.output,
                    '--project', projectRoot, '--skip-package-install']);
                if (!statSync(output).size) throw new Error(`Empty package: ${plugin.output}`);
            } catch (error) {
                rmSync(output, { force: true });
                throw error;
            }
            console.log(`Package: ${output}`);
        }
    }
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
