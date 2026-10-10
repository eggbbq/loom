import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createConnection } from 'node:net';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [consumer, previewUrl] = process.argv.slice(2);
const jsMode = process.argv.includes('--js');
const chrome = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
assert.ok(existsSync(chrome), 'set CHROME_BIN to a Chromium executable');
const observer = `<script>
window.__startupPageErrors=[];
window.addEventListener('error',e=>window.__startupPageErrors.push(e.message));
window.addEventListener('unhandledrejection',e=>window.__startupPageErrors.push(String(e.reason)));
window.addEventListener('load',()=>setTimeout(()=>{
 const members={core:'ModuleBase',address:'address',bt:'BTBuilder',i18n:'i18n',ui:'ui',pathfinding:'AStarGrid',sdk:'sdk'};
 const after=typeof loom==='undefined'?[]:Object.entries(members).filter(([,member])=>!!loom[member]).map(([name])=>name);
 const result={startup:window.__loomPackageStartup??null,afterMount:after,pageErrors:window.__startupPageErrors};
 const pre=document.createElement('pre');pre.id='package-startup-result';pre.textContent=JSON.stringify(result);document.body.appendChild(pre);
},1000));
</script>`;
const scriptSources = html => [...html.matchAll(/<script[^>]+src=["']([^"']+)["'][^>]*>/g)].map(match => match[1]);
const previewHtml = await (await fetch(previewUrl)).text();
const previewScripts = scriptSources(previewHtml);
const mainIndex = previewScripts.indexOf('js/bundles/bundle.js');
assert.ok(mainIndex >= 0, 'official preview main bundle must be present');
for (const name of ['core', 'address', 'bt', 'i18n', 'ui', 'pathfinding']) {
    const index = previewScripts.indexOf(jsMode ? `js/loom.${name}.runtime.js` : `js/packages/loom.${name}.js`);
    assert.ok(index >= 0 && index < mainIndex, `official preview must put loom.${name} before business`);
}
const publishedHtml = readFileSync(path.join(consumer, 'release/web/index.html'), 'utf8');
if (jsMode) {
    for (const [target, scripts, business] of [
        ['Preview', previewScripts, 'js/bundles/bundle.js'],
        ['Web', scriptSources(publishedHtml), 'js/bundle.js'],
    ]) {
        const before = scripts.indexOf(business);
        for (const name of ['address', 'atlas', 'bt', 'core', 'i18n', 'pathfinding', 'ui']) {
            const index = scripts.indexOf(`js/loom.${name}.runtime.js`);
            assert.ok(index >= 0 && index < before, `${target}: loom.${name} must load before business`);
        }
        assert.ok(scripts.indexOf('js/loom.core.runtime.js') < scripts.indexOf('js/loom.pathfinding.runtime.js'),
            `${target}: core dependency must load before pathfinding`);
        const sdk = scripts.findIndex(src => src.includes('sdk') && !src.includes('runtime.js'));
        assert.ok(sdk >= 0 && sdk < before, `${target}: generated SDK adapter must load before business`);
        assert.ok(!scripts.includes('js/loom.sdk.runtime.js'), `${target}: SDK package must not supply runtime JS`);
    }
}
const server = createServer(async (req, res) => {
    try {
        const pathname = new URL(req.url, 'http://local').pathname;
        let body, contentType;
        if (pathname.startsWith('/preview/')) {
            const upstream = await fetch(new URL(req.url.slice('/preview/'.length), previewUrl));
            res.statusCode = upstream.status;
            contentType = upstream.headers.get('content-type') ?? 'application/octet-stream';
            body = Buffer.from(await upstream.arrayBuffer());
            if (pathname === '/preview/') body = previewHtml.replace('</head>', observer + '</head>');
        } else {
            const relative = pathname === '/published/' ? 'index.html' : pathname.slice('/published/'.length);
            const root = path.resolve(consumer, 'release/web');
            const file = path.resolve(root, relative);
            if (!pathname.startsWith('/published/') || !file.startsWith(root + path.sep) || !existsSync(file)) { res.statusCode = 404; res.end(); return; }
            body = relative === 'index.html' ? publishedHtml.replace('</head>', observer + '</head>') : readFileSync(file);
            contentType = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream';
        }
        res.setHeader('Content-Type', contentType); res.end(body);
    } catch (error) { res.statusCode = 500; res.end(String(error)); }
});
server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url.startsWith('/preview/') ? req.url.slice('/preview/'.length) : req.url, previewUrl);
    const remote = createConnection(Number(url.port), url.hostname, () => {
        const headers = Object.entries({ ...req.headers, host: url.host }).map(([key, value]) => `${key}: ${value}`).join('\r\n');
        remote.write(`GET ${url.pathname}${url.search} HTTP/1.1\r\n${headers}\r\n\r\n`);
        if (head.length) remote.write(head);
        socket.pipe(remote).pipe(socket);
    });
    remote.on('error', () => socket.destroy()); socket.on('error', () => remote.destroy());
    socket.on('close', () => remote.destroy());
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const profile = mkdtempSync(path.join(consumer, 'chrome-'));
const results = { previewScripts, publishedScripts: scriptSources(publishedHtml) };
try {
    for (const mode of ['preview', 'published']) {
        const result = await new Promise((resolve, reject) => {
            const proc = spawn(chrome, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-gpu', '--enable-unsafe-swiftshader',
                '--use-angle=swiftshader', '--virtual-time-budget=5000', '--dump-dom', `--user-data-dir=${profile}`, `http://127.0.0.1:${server.address().port}/${mode}/`]);
            const timeout = setTimeout(() => { proc.kill(); reject(new Error('Chromium startup verification timed out')); }, 60000);
            let stdout = '', stderr = '';
            proc.stdout.on('data', chunk => stdout += chunk); proc.stderr.on('data', chunk => stderr += chunk);
            proc.on('error', reject); proc.on('close', code => { clearTimeout(timeout); resolve({ code, stdout, stderr }); });
        });
        assert.equal(result.code, 0, result.stderr);
        const match = result.stdout.match(/<pre id="package-startup-result">([\s\S]*?)<\/pre>/);
        assert.ok(match, result.stdout + result.stderr);
        results[mode] = JSON.parse(match[1].replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&'));
        console.log(`PACKAGE_STARTUP_${mode.toUpperCase()}=${JSON.stringify(results[mode])}`);
    }
    writeFileSync(path.join(consumer, 'startup-browser-results.json'), JSON.stringify(results, null, 2));
} finally {
    await new Promise(resolve => server.close(resolve)); rmSync(profile, { recursive: true, force: true });
}
