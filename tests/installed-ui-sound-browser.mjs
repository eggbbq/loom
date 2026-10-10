import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';

// Real wall-clock audio and mouse input; no playSound stub or virtual-time budget.
const consumer = path.resolve(process.argv[2]);
const chrome = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
assert.ok(existsSync(chrome), 'set CHROME_BIN to a Chromium executable');
function wav(frequency) {
    const rate = 44100, samples = rate / 2;
    const data = Buffer.alloc(44 + samples * 2);
    data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8);
    data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22);
    data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 2, 28);
    data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34); data.write('data', 36);
    data.writeUInt32LE(samples * 2, 40);
    for (let i = 0; i < samples; i++) data.writeInt16LE(Math.round(16000 * Math.sin(2 * Math.PI * frequency * i / rate)), 44 + i * 2);
    return data;
}
const audio = new Map([['/audio/default.wav', wav(440)], ['/audio/native.wav', wav(880)]]);
const html = runtime => `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0}</style></head><body>
${['laya.core', 'laya.d3', 'laya.webgl_2D', 'laya.webgl_3D', 'laya.ui2'].map(name => `<script src="/release/web/libs/${name}.js"></script>`).join('\n')}
<script>window.__setBundle_=(_name,api)=>window.uiAPI=api;</script><script src="${runtime}"></script>
<script>
window.ready=(async()=>{
 const check=(value,message)=>{if(!value)throw Error(message)};
 const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 Laya.PlayerConfig.UI={alwaysIncludeDefaultSkin:false};
 const wrapped=Laya.GButton.prototype.onClick;
 await Laya.init(400,300);
 check(Laya.GButton.prototype.onClick===wrapped,'init wrapped onClick twice');
 const ctx=Laya.PAL.media.audioCtx;
 check(ctx,'native WebAudio backend unavailable');
 // Headless machines may have no audio device. A native silent sink still runs
 // the real WebAudio graph so its decoded output can be measured below.
 if(ctx.setSinkId)await ctx.setSinkId({type:'none'});
 await ctx.resume();
 check(ctx.state==='running','audio context must be running');
 loom.ui.defaultButtonSound='/audio/default.wav';
 const sequence=[], sounds=[], measured=[];
 const original=Laya.SoundManager.playSound;
 Laya.SoundManager.playSound=function(...args){
  const channel=Reflect.apply(original,this,args);
  sounds.push({url:args[0],channel});
  return channel;
 };
 const buttons=[];
 const create=(x)=>{
  const button=Laya.stage.addChild(new Laya.GButton());
  button.pos(x,30);button.size(80,50);button.mouseThrough=false;button.mouseEnabled=true;
  buttons.push(button);return button;
 };
 // Simulates a list item constructed after startup.
 await wait(20);
 const normal=create(20), own=create(120), muted=create(220);
 normal.soundVolumeScale=0.4;
 const first=()=>sequence.push('first');
 normal.onClick(first);
 const caller={value:'caller'};
 function second(payload,event){check(this===caller && payload==='payload' && event.type===Laya.Event.CLICK,'caller/args/event changed');sequence.push('second');}
 normal.onClick(caller,second,['payload']);
 own.sound='/audio/native.wav';own.onClick(()=>sequence.push('own'));
 muted.sound='/audio/native.wav';muted.addComponent(loom.UISoundIgnore);muted.onClick(()=>sequence.push('muted'));
 check(normal.sound==='/audio/default.wav' && own.sound==='/audio/native.wav' && muted.sound==='','sound priorities failed');
 function position(index){
  const point=buttons[index].localToGlobal(new Laya.Point(40,25));
  const rect=Laya.Browser.mainCanvas.source.getBoundingClientRect();
  return {x:rect.left+point.x*rect.width/Laya.stage.width,y:rect.top+point.y*rect.height/Laya.stage.height};
 }
 async function inspectSound(index,expected,volume){
  const start=performance.now();let channel;
  while(performance.now()-start<3000){channel=sounds[index]?.channel;if(channel?._sourceNode)break;await wait(5);}
  check(channel?._sourceNode && !channel.isStopped,'native channel did not start');
  check(channel.duration>0 && Math.abs(channel.volume-volume)<0.001,'native duration/volume incorrect');
  const analyser=ctx.createAnalyser();analyser.fftSize=2048;
  const sink=ctx.createGain();sink.gain.value=0;
  channel._gainNode.connect(analyser);analyser.connect(sink);sink.connect(ctx.destination);
  const samples=new Float32Array(analyser.fftSize);
  let peak=0;const audioStart=ctx.currentTime;
  for(let i=0;i<15;i++){await wait(10);analyser.getFloatTimeDomainData(samples);for(const sample of samples)peak=Math.max(peak,Math.abs(sample));if(peak>0.001)break;}
  check(peak>0.001,'native output contains no audio signal: '+JSON.stringify({audioStart,audioEnd:ctx.currentTime,contextState:ctx.state,gain:channel._gainNode?.gain.value,stopped:channel.isStopped,paused:channel.paused,position:channel.position,bufferSample:channel._buffer?.getChannelData(0)[100]}));
  check(sounds[index].url===expected,'wrong audio URL');
  measured.push({url:expected,duration:channel.duration,volume:channel.volume,peak});
  analyser.disconnect();sink.disconnect();
  await wait(550);
  check(channel.isStopped,'native channel did not complete');
 }
 window.soundTest={position,inspectSound,remove(){normal.offClick(first);normal.offClick(caller,second);},
  verify(stage){
   const expected=[['first','second'],['first','second','own'],['first','second','own','muted'],['first','second','own','muted']][stage];
   check(JSON.stringify(sequence)===JSON.stringify(expected),'callbacks duplicated, reordered or incorrectly removed: '+sequence);
   check(sounds.length===[1,2,2,3][stage],'native playback duplicated or mute failed: '+sounds.length);
   return {sequence:[...sequence],plays:sounds.length,measured};
  }};
 return {hookStable:true,audioContext:ctx.state};
})();
</script></body></html>`;

const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://local');
    if (url.pathname === '/sound.html') {
        res.setHeader('Content-Type', 'text/html');
        res.end(html(url.searchParams.has('published') ? '/release/web/js/loom.ui.runtime.js' : '/library/packages/loom.ui/loom.ui.runtime.js')); return;
    }
    if (audio.has(url.pathname)) { res.setHeader('Content-Type', 'audio/wav'); res.end(audio.get(url.pathname)); return; }
    const file = path.resolve(consumer, '.' + url.pathname);
    if (!file.startsWith(consumer + path.sep) || !existsSync(file)) { res.statusCode = 404; res.end(); return; }
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
    res.end(readFileSync(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const profile = mkdtempSync(path.join(consumer, 'chrome-sound-'));
const child = spawn(chrome, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--disable-gpu', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--remote-debugging-pipe', `--user-data-dir=${profile}`], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
let nextId = 0, incoming = '', stderr = '';
const pending = new Map();
child.stderr.on('data', chunk => stderr += chunk);
function failAll(error) { for (const { reject, timer } of pending.values()) { clearTimeout(timer); reject(error); } pending.clear(); }
child.on('error', failAll);
child.on('exit', code => failAll(new Error('Chrome exited: ' + code + '\n' + stderr)));
child.stdio[4].on('data', chunk => {
    incoming += chunk.toString();
    let end;
    while ((end = incoming.indexOf('\0')) >= 0) {
        const message = JSON.parse(incoming.slice(0, end)); incoming = incoming.slice(end + 1);
        const request = pending.get(message.id);
        if (!request) continue;
        clearTimeout(request.timer); pending.delete(message.id);
        if (message.error) request.reject(new Error(JSON.stringify(message.error)));
        else request.resolve(message.result);
    }
});
function send(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
        const id = ++nextId;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method + '\n' + stderr)); }, 15000);
        pending.set(id, { resolve, reject, timer });
        child.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + '\0');
    });
}
try {
    for (const mode of ['preview', 'published']) {
        const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
        const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
        const evaluate = async expression => {
            const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
            assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
            return result.result.value;
        };
        await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/sound.html?${mode}` }, sessionId);
        let ready;
        for (let attempt = 0; attempt < 100; attempt++) {
            ready = await evaluate('window.ready');
            if (ready) break;
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        assert.ok(ready, 'Laya audio page did not initialize');
        async function click(index) {
            const point = await evaluate(`soundTest.position(${index})`);
            await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point }, sessionId);
            await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point }, sessionId);
        }
        await click(0);
        await evaluate("soundTest.inspectSound(0,'/audio/default.wav',0.4)");
        await evaluate('soundTest.verify(0)');
        await click(1);
        await evaluate("soundTest.inspectSound(1,'/audio/native.wav',1)");
        await evaluate('soundTest.verify(1)');
        await click(2);
        await evaluate('soundTest.verify(2)');
        await evaluate('soundTest.remove()');
        await click(0);
        const result = await evaluate('soundTest.verify(3)');
        console.log(`Real Laya audio + mouse (${mode}): ${JSON.stringify({ ...ready, ...result })}`);
        await send('Target.closeTarget', { targetId });
    }
} finally {
    child.kill();
    await new Promise(resolve => { if (child.exitCode !== null || child.signalCode) resolve(); else child.once('exit', resolve); });
    await new Promise(resolve => server.close(resolve));
    rmSync(profile, { recursive: true, force: true });
}
