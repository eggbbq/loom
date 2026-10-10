import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { projectRoot, run } from './laya.mjs';

const outputRoot = path.join(projectRoot, 'release/plugins');
const git = args => run('git', args, { stdio: 'pipe', encoding: 'utf8' }).stdout.trim();

function githubToken(repository) {
    if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) return process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
    const result = spawnSync('git', ['credential', 'fill'], { cwd: projectRoot, encoding: 'utf8',
        input: `protocol=https\nhost=github.com\npath=${repository}.git\n\n`, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
    const password = result.stdout?.split('\n').find(line => line.startsWith('password='))?.slice(9);
    if (!password) throw new Error('GitHub credentials are unavailable. Configure a Git credential helper or GH_TOKEN/GITHUB_TOKEN with Contents write permission.');
    return password;
}

function request(url, token, method = 'GET', payload, file) {
    const args = ['--silent', '--show-error', '--connect-timeout', '20', '--max-time', '120', '--config', '-', '--request', method, '--write-out', '\n%{http_code}', url];
    const headers = ['Accept: application/vnd.github+json', 'X-GitHub-Api-Version: 2022-11-28', 'User-Agent: loom-plugin-release', `Authorization: Bearer ${token}`];
    if (payload) { args.push('--data-binary', JSON.stringify(payload)); headers.push('Content-Type: application/json'); }
    if (file) { args.push('--data-binary', '@' + file); headers.push('Content-Type: application/octet-stream'); }
    // Keep credentials out of command arguments, files and console output.
    const config = headers.map(header => `header = ${JSON.stringify(header)}`).join('\n') + '\n';
    const response = spawnSync('curl', args, { cwd: projectRoot, encoding: 'utf8', input: config, maxBuffer: 8 * 1024 * 1024 });
    if (response.error || response.status !== 0) throw new Error(`GitHub request failed: ${response.error?.message ?? response.stderr?.trim() ?? response.status}`);
    const split = response.stdout.lastIndexOf('\n');
    const status = Number(response.stdout.slice(split + 1));
    const data = response.stdout.slice(0, split) ? JSON.parse(response.stdout.slice(0, split)) : null;
    return { status, data };
}

try {
    if (process.argv.length > 2) throw new Error('Usage: npm run release (publish the existing validated build).');
    if (git(['status', '--porcelain'])) throw new Error('Commit all changes before publishing a release.');
    const head = git(['rev-parse', 'HEAD']);
    const branch = git(['branch', '--show-current']);
    const remote = git(['ls-remote', 'origin', `refs/heads/${branch}`]).split(/\s/)[0];
    if (remote !== head) throw new Error('Push the current commit to origin before publishing a release.');
    const distribution = JSON.parse(readFileSync(path.join(outputRoot, 'distribution.json'), 'utf8'));
    const { repository, tag, packages } = distribution;
    const origin = git(['remote', 'get-url', 'origin']);
    if (!origin.endsWith(`github.com/${repository}.git`) && !origin.endsWith(`github.com/${repository}`) && !origin.endsWith(`github.com:${repository}.git`)) throw new Error('Distribution repository must match origin.');
    const expected = readdirSync(path.join(projectRoot, 'assets/plugins')).filter(name => existsSync(path.join(projectRoot, 'assets/plugins', name, 'package.json')));
    if (packages.length !== expected.length || new Set(packages.map(pkg => pkg.name)).size !== expected.length) throw new Error('Build all plugins before publishing a release.');
    for (const pkg of packages) {
        const source = JSON.parse(readFileSync(path.join(projectRoot, 'assets/plugins', pkg.name, 'package.json'), 'utf8'));
        if (source.version !== pkg.version || pkg.file !== `${pkg.name}.layapkg`) throw new Error(`Package metadata changed: ${pkg.name}. Rebuild before publishing.`);
        if (pkg.url !== `https://github.com/${repository}/releases/download/${tag}/${pkg.file}`) throw new Error('This publisher requires GitHub Releases download URLs.');
        const hash = createHash('sha256').update(readFileSync(path.join(outputRoot, pkg.file))).digest('hex');
        if (hash !== pkg.sha256) throw new Error(`Package checksum mismatch: ${pkg.file}. Rebuild before publishing.`);
    }
    const token = githubToken(repository);
    const api = `https://api.github.com/repos/${repository}/releases`;
    const existing = request(`${api}/tags/${encodeURIComponent(tag)}`, token);
    if (existing.status !== 404) throw new Error(existing.status === 200 ? `Release ${tag} already exists; choose a new LOOM_RELEASE_TAG instead of replacing fixed URLs.` : `Cannot check release: HTTP ${existing.status} ${existing.data?.message ?? ''}`);
    const editorTools = packages.filter(pkg => JSON.parse(readFileSync(path.join(projectRoot, 'assets/plugins', pkg.name, 'package.json'), 'utf8')).loom?.runtime === false);
    const body = `Independent plugins and editor tools for LayaAir ${distribution.layaVersion}.\n\nCopy the dependencies from the attached manifest.json into your game's packages/manifest.json. Preserve existing dependencies. Include ./library/packages/*/index.d.ts in tsconfig.json for global API types.\n\n${packages.map(pkg => `- ${pkg.displayName}: ${pkg.version}`).join('\n')}${editorTools.length ? `\n\nEditor-only tools (${editorTools.map(pkg => pkg.name).join(', ')}) provide editable project TypeScript adapters instead of SDK runtime JS. Loom SDK restores all bundled .txt resources into src/loom/ by removing the final .txt extension, including loom.sdk.ts, loom.sdk.d.ts, loom.wechat.js and loom.douyin.js. A separate Laya entry exposes loom.sdk.init() before business scripts run. Reinstalling or upgrading preserves project edits and metadata.` : ''}\n\nScene, official Preview and Web startup with no business imports have been verified. SHA256SUMS covers the packages and manifests.`;
    const created = request(api, token, 'POST', { tag_name: tag, target_commitish: head, name: `Loom ${tag}`, body, draft: true });
    if (created.status !== 201) throw new Error(`Cannot create release: HTTP ${created.status} ${created.data?.message ?? ''}`);
    const release = created.data;
    console.log(`Release draft created: ${tag} (${release.id})`);
    for (const file of [...packages.map(pkg => pkg.file), 'manifest.json', 'distribution.json', 'SHA256SUMS']) {
        const uploaded = request(`${release.upload_url.split('{')[0]}?name=${encodeURIComponent(file)}`, token, 'POST', undefined, path.join(outputRoot, file));
        if (uploaded.status !== 201) throw new Error(`Upload failed for ${file}: HTTP ${uploaded.status} ${uploaded.data?.message ?? ''}. Release ${release.id} remains a draft.`);
        console.log(`Uploaded ${file}`);
    }
    const published = request(`${api}/${release.id}`, token, 'PATCH', { draft: false, make_latest: 'true' });
    if (published.status !== 200) throw new Error(`Cannot publish release ${release.id}: HTTP ${published.status} ${published.data?.message ?? ''}`);
    writeFileSync(path.join(outputRoot, 'published-release.json'), JSON.stringify({ commit: head, tag, url: published.data.html_url, assets: published.data.assets.map(asset => ({ name: asset.name, url: asset.browser_download_url })) }, null, 2) + '\n');
    console.log(`Published: ${published.data.html_url}`);
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
