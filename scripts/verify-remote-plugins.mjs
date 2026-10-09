import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createReadStream, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { projectRoot, run } from './laya.mjs';

const args = process.argv.slice(2);
if (args.some(arg => !['--local', '--skip-build'].includes(arg))) throw new Error('Usage: npm run verify:remote -- [--local] [--skip-build]');
if (!args.includes('--skip-build')) run(process.execPath, ['scripts/build-js-plugins.mjs']);
let server;
const requests = new Set();
const env = { ...process.env };
try {
    if (args.includes('--local')) {
        const distribution = JSON.parse(readFileSync(path.join(projectRoot, 'release/plugins/distribution.json'), 'utf8'));
        const files = new Set(distribution.packages.map(pkg => '/' + pkg.file));
        server = createServer((request, response) => {
            // Deliberately no CORS headers: exercise the same CLI compatibility path as GitHub Releases.
            if (request.method !== 'GET') { response.writeHead(405).end(); return; }
            const url = new URL(request.url, 'http://localhost');
            if (!files.has(url.pathname)) { response.writeHead(404).end(); return; }
            requests.add(url.pathname);
            response.setHeader('Content-Type', 'application/octet-stream');
            createReadStream(path.join(projectRoot, 'release/plugins', url.pathname.slice(1))).pipe(response);
        });
        await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
        env.LOOM_VERIFY_PACKAGE_BASE_URL = `http://127.0.0.1:${server.address().port}`;
        console.log(`Verify HTTP package installation: ${env.LOOM_VERIFY_PACKAGE_BASE_URL}`);
    } else delete env.LOOM_VERIFY_PACKAGE_BASE_URL;
    const child = spawn(process.execPath, ['scripts/verify-package-startup.mjs', '--js', '--remote', '--skip-build'], { cwd: projectRoot, env, stdio: 'inherit' });
    const exit = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal })); });
    assert.equal(exit.code, 0, `Remote package validation failed (${exit.signal ?? exit.code}).`);
    if (server) {
        const expected = Object.keys(JSON.parse(readFileSync(path.join(projectRoot, 'release/plugins/manifest.json'), 'utf8')).dependencies).length;
        assert.equal(requests.size, expected, 'Every plugin must have been downloaded over HTTP.');
    }
    console.log('HTTP package installation and startup verification passed.');
} finally {
    if (server) await new Promise(resolve => server.close(resolve));
}
