import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { isMainThread, workerData, Worker } from 'node:worker_threads';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { setTimeout as retryDelay } from 'node:timers/promises';

// CLI 3.4.1 uses Happy DOM fetch, which preflights even simple cross-origin GETs.
// Keep the official package resolver/extractor; use native HTTP for public package files only.
const cliRoot = workerData?.rendererInfo?.webRootPath ?? path.dirname(process.argv[1] ?? '');
const target = path.join(cliRoot, 'node_modules/happy-dom/lib/window/BrowserWindow.js');
if (existsSync(target)) {
    if (isMainThread) {
        const OriginalWorker = Worker;
        const threads = createRequire(import.meta.url)('node:worker_threads');
        threads.Worker = class extends OriginalWorker {
            constructor(filename, options) {
                // Node 20 does not run --import preloads for CommonJS eval workers.
                if (options?.workerData?.__CLI_WORKER__ && options.eval) filename =
                    `import(${JSON.stringify(import.meta.url)}).then(() => {\n${filename}\n}).catch(error => { console.error(error); process.exitCode = 1; });`;
                super(filename, options);
            }
        };
        syncBuiltinESMExports();
    }
    const NativeResponse = globalThis.Response;
    const { default: BrowserWindow } = await import(pathToFileURL(target).href);
    const original = BrowserWindow.prototype.fetch;
    const execute = promisify(execFile);
    let downloads = Promise.resolve();
    BrowserWindow.prototype.fetch = async function(input, init) {
        const value = typeof input === 'string' || input instanceof URL ? String(input) : input?.url;
        let url;
        try { url = new URL(value); } catch { return original.call(this, input, init); }
        const method = init?.method ?? input?.method ?? 'GET';
        if (method.toUpperCase() !== 'GET' || !['http:', 'https:'].includes(url.protocol) || !url.pathname.endsWith('.layapkg')) return original.call(this, input, init);
        const download = async () => {
            for (let attempt = 0; ; attempt++) {
                try {
                    return await execute('curl', ['--silent', '--show-error', '--fail', '--location', '--connect-timeout', '20', '--max-time', '120', '--', url.href],
                        { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
                } catch (error) {
                    if (attempt === 3 || ![5, 6, 7, 18, 28, 35, 52, 55, 56].includes(error.code)) throw error;
                    // Start a fresh process/buffer: never append a partial response to a retry.
                    await retryDelay(1000 * (attempt + 1));
                }
            }
        };
        // Avoid a burst of parallel TLS connections during dependency discovery.
        const pending = downloads.then(download);
        downloads = pending.catch(() => {});
        const { stdout } = await pending;
        return new NativeResponse(stdout, { status: 200, headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(stdout.length) } });
    };
}
