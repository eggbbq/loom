import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';

const [consumer, previewUrl] = process.argv.slice(2);
const chrome = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
assert.ok(existsSync(chrome));
const observer = `<script>
window.__sdkErrors=[];
window.addEventListener('error',e=>window.__sdkErrors.push(e.message));
window.addEventListener('unhandledrejection',e=>window.__sdkErrors.push(String(e.reason)));
window.addEventListener('load',()=>setTimeout(()=>{
 const ok=window.__sdkStartup===true && window.loom?.sdk?.constructor.name==='LoomSDKAdapter' && !window.__sdkErrors.length;
 const pre=document.createElement('pre');pre.id='sdk-result';pre.textContent=JSON.stringify({ok,errors:window.__sdkErrors});document.body.appendChild(pre);
},1000));
</script>`;
const previewHtml = await (await fetch(previewUrl)).text();
const publishedHtml = readFileSync(path.join(consumer, 'release/web/index.html'), 'utf8');
for (const [html, business] of [[previewHtml, 'js/bundles/bundle.js'], [publishedHtml, 'js/bundle.js']]) {
    const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map(match => match[1]);
    const main = scripts.indexOf(business);
    const adapter = scripts.findIndex(src => src.includes('sdk') && !src.includes('runtime.js'));
    assert.ok(adapter >= 0 && adapter < main, `adapter must precede business: ${JSON.stringify(scripts)}`);
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
            const root = path.resolve(consumer, 'release/web');
            const relative = pathname === '/published/' ? 'index.html' : pathname.slice('/published/'.length);
            const file = path.resolve(root, relative);
            if (!pathname.startsWith('/published/') || !file.startsWith(root + path.sep) || !existsSync(file)) { res.statusCode = 404; res.end(); return; }
            body = relative === 'index.html' ? publishedHtml.replace('</head>', observer + '</head>') : readFileSync(file);
            contentType = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream';
        }
        res.setHeader('Content-Type', contentType); res.end(body);
    } catch (error) { res.statusCode = 500; res.end(String(error)); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const profile = mkdtempSync(path.join(consumer, 'chrome-'));
try {
    for (const mode of ['preview', 'published']) {
        const result = await new Promise((resolve, reject) => {
            const proc = spawn(chrome, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-gpu',
                '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--virtual-time-budget=5000', '--dump-dom',
                `--user-data-dir=${profile}`, `http://127.0.0.1:${server.address().port}/${mode}/`]);
            const timeout = setTimeout(() => { proc.kill(); reject(Error('SDK browser verification timed out')); }, 60000);
            let stdout = '', stderr = '';
            proc.stdout.on('data', chunk => stdout += chunk); proc.stderr.on('data', chunk => stderr += chunk);
            proc.on('error', reject); proc.on('close', code => { clearTimeout(timeout); resolve({ code, stdout, stderr }); });
        });
        assert.equal(result.code, 0, result.stderr);
        const match = result.stdout.match(/<pre id="sdk-result">([\s\S]*?)<\/pre>/);
        assert.ok(match, result.stdout + result.stderr);
        const report = JSON.parse(match[1].replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>'));
        assert.equal(report.ok, true, JSON.stringify(report));
        console.log(`Installed SDK native Chromium ${mode}: project adapter ready before business scripts.`);
    }
} finally { await new Promise(resolve => server.close(resolve)); rmSync(profile, { recursive: true, force: true }); }
