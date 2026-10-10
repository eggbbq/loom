import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { projectRoot, projectFile } from './laya.mjs';

export function distributionSettings() {
    const project = JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
    const repository = process.env.LOOM_RELEASE_REPOSITORY ?? project.repository?.url?.match(/github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/)?.[1];
    if (!repository || !/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Configure a GitHub repository in package.json or LOOM_RELEASE_REPOSITORY.');
    const tag = process.env.LOOM_RELEASE_TAG ?? `v${project.version}`;
    if (!/^[\w.-]+$/.test(tag)) throw new Error('Release tags must contain only letters, numbers, dots, underscores or hyphens.');
    const baseUrl = process.env.LOOM_PACKAGE_BASE_URL ?? `https://github.com/${repository}/releases/download/${tag}`;
    const url = new URL(baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Package base URL must be an HTTP(S) directory URL without credentials, query or fragment.');
    return { repository, tag, baseUrl: baseUrl.replace(/\/$/, '') };
}

export function writePluginDistribution(manifests, outputRoot) {
    const { repository, tag, baseUrl } = distributionSettings();
    const dependencies = {};
    const packages = manifests.map(manifest => {
        const file = `${manifest.name}.layapkg`;
        const data = readFileSync(path.join(outputRoot, file));
        if (!data.length) throw new Error(`Empty package: ${file}`);
        const url = `${baseUrl}/${file}`;
        dependencies[manifest.name] = url;
        return { name: manifest.name, displayName: manifest.displayName, version: manifest.version, file, url,
            sha256: createHash('sha256').update(data).digest('hex'), dependencies: manifest.pluginDependencies ?? {} };
    });
    // Explicit URLs for dependencies keep private plugins out of the Laya resource store resolver.
    for (const pkg of packages) for (const [name, version] of Object.entries(pkg.dependencies)) {
        const dependency = packages.find(value => value.name === name);
        if (!dependency || dependency.version !== version) throw new Error(`${pkg.name} requires ${name}@${version}; include its matching archive in the distribution.`);
    }
    const distribution = { repository, tag, layaVersion: JSON.parse(readFileSync(path.join(projectRoot, projectFile), 'utf8')).version, packages };
    writeFileSync(path.join(outputRoot, 'manifest.json'), JSON.stringify({ dependencies }, null, 2) + '\n');
    writeFileSync(path.join(outputRoot, 'distribution.json'), JSON.stringify(distribution, null, 2) + '\n');
    const files = [...packages.map(pkg => pkg.file), 'manifest.json', 'distribution.json'];
    writeFileSync(path.join(outputRoot, 'SHA256SUMS'), files.map(file => `${createHash('sha256').update(readFileSync(path.join(outputRoot, file))).digest('hex')}  ${file}`).join('\n') + '\n');
    console.log(`Remote install manifest: ${path.join(outputRoot, 'manifest.json')} (${tag})`);
    return distribution;
}
