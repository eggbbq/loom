import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';

const consumer = process.argv[2];
const chrome = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
assert.ok(existsSync(chrome), 'set CHROME_BIN to a Chromium executable for native UI browser verification');
const panel = 'b0c345c4-9c3a-4c6a-883b-f6b19d06102f';
const compress = id => Buffer.from(id.replaceAll('-', ''), 'hex').toString('base64url');
const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>
${['laya.core', 'laya.d3', 'laya.webgl_2D', 'laya.webgl_3D', 'laya.ui2'].map(name => `<script src="/release/web/libs/${name}.js"></script>`).join('\n')}
<script>window.__setBundle_=(_name,api)=>window.uiAPI=api;</script>
<script src="/library/packages/build/loom.ui.js"></script>
<script>
(async () => {
 const check=(value,message)=>{if(!value)throw Error(message)};
 try {
  Laya.PlayerConfig.UI={alwaysIncludeDefaultSkin:false};
  await Laya.init(320,480);
  const { UIPanel, UIManager, UIFrame }=window.uiAPI ?? {
   UIPanel:Laya.ClassUtils.getClass('${panel}'), UIManager:loom.ui.constructor,
   UIFrame:Laya.ClassUtils.getClass('32cdfef6-44bf-4a87-8225-1fb11b3c85a4')
  };
  check(loom.ui===UIManager.inst,'global/import singleton mismatch');
  check(Laya.ClassUtils.getClass('${panel}')===UIPanel,'UUID registry and exported component differ');
  const owner=await loom.ui.open('/fixtures/Panel.lh',{value:42},false);
  check(owner instanceof Laya.GWidget && owner.getComponent(UIPanel),'native prefab lost component binding');
  check(owner.data.value===42 && owner.parent===UIFrame.inst.panel,'native prefab open/data/layer failed');
  const same=await loom.ui.open('/fixtures/Panel.lh',{value:43},false);
  check(owner===same && owner.data.value===43,'native prefab cache/refresh failed');
  await loom.ui.close(owner,false);
  check(!owner.parent,'native prefab close failed');
  document.body.appendChild(document.createElement('pre')).textContent='NATIVE_UI_BROWSER_PASSED';
 } catch(error) { document.body.appendChild(document.createElement('pre')).textContent='NATIVE_UI_BROWSER_FAILED: '+error.stack; }
})();
</script></body></html>`;
const fixture = JSON.stringify({ _$ver: 1, _$id: 'fixture', _$type: 'GWidget', name: 'Panel', width: 100, height: 100,
    _$comp: [{ _$type: panel, scriptPath: '~/packages/loom.ui/runtime/ui-panel.ts', anim: 0, center: false, life: 1 }] });
const server = createServer((req, res) => {
    if (req.url.startsWith('/native-ui.html')) { res.setHeader('Content-Type', 'text/html'); res.end(req.url.includes('published') ? html.replace('/library/packages/build/loom.ui.js', '/release/web/js/bundle.js').replaceAll(panel, compress(panel)).replaceAll('32cdfef6-44bf-4a87-8225-1fb11b3c85a4', compress('32cdfef6-44bf-4a87-8225-1fb11b3c85a4')).replaceAll('/fixtures/Panel.lh', '/release/web/resources/Panel.lh') : html); return; }
    if (req.url === '/fixtures/Panel.lh') { res.setHeader('Content-Type', 'application/json'); res.end(fixture); return; }
    const file = path.resolve(consumer, '.' + new URL(req.url, 'http://local').pathname);
    if (!file.startsWith(path.resolve(consumer) + path.sep) || !existsSync(file)) { res.statusCode = 404; res.end(); return; }
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
    res.end(readFileSync(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const profile = mkdtempSync(path.join(consumer, 'chrome-'));
try {
    for (const mode of ['preview', 'published']) {
    const args = ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-gpu', '--enable-unsafe-swiftshader',
        '--use-angle=swiftshader', '--virtual-time-budget=5000', '--dump-dom', `--user-data-dir=${profile}`, `http://127.0.0.1:${server.address().port}/native-ui.html?${mode}`];
    const result = await new Promise((resolve, reject) => {
        const process = spawn(chrome, args); let stdout = '', stderr = '';
        process.stdout.on('data', data => stdout += data); process.stderr.on('data', data => stderr += data);
        process.on('error', reject); process.on('close', code => resolve({ code, stdout, stderr }));
    });
    assert.equal(result.code, 0, result.stderr);
    assert.ok(result.stdout.includes('<pre>NATIVE_UI_BROWSER_PASSED</pre>'), result.stdout + result.stderr);
    console.log(`Native Chromium + Laya engine (${mode}): package UUID bindings and actual prefab open/refresh/close passed.`);
    }
} finally { await new Promise(resolve => server.close(resolve)); rmSync(profile, { recursive: true, force: true }); }
