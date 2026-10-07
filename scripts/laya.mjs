import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const projects = readdirSync(projectRoot).filter(name => name.endsWith('.laya'));
if (projects.length !== 1) throw new Error('Expected exactly one .laya project descriptor.');
export const projectFile = projects[0];
const projectVersion = JSON.parse(readFileSync(path.join(projectRoot, projectFile), 'utf8')).version;

export function run(command, args, options = {}) {
    const result = spawnSync(command, args, { cwd: projectRoot, stdio: 'inherit', ...options });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${path.basename(command)} failed (${result.signal ?? result.status}).`);
    return result;
}

function resolveCli() {
    const name = process.platform === 'win32' ? 'layaair.cmd' : 'layaair';
    const candidates = process.env.LAYAAIR_CLI ? [process.env.LAYAAIR_CLI] : [
        ...String(process.env.PATH ?? '').split(path.delimiter).filter(Boolean).map(dir => path.join(dir, name)),
        path.join(homedir(), '.layaair', name),
    ];
    const cli = candidates.find(candidate => existsSync(candidate));
    if (!cli) throw new Error('LayaAir CLI was not found. Install the official CLI, or set LAYAAIR_CLI to its executable path.');
    // Windows command wrappers need a shell; use the official Node dispatcher directly instead.
    if (cli.endsWith('.cmd')) {
        const dispatcher = path.join(path.dirname(cli), 'dispatcher.js');
        if (!existsSync(dispatcher)) throw new Error('Use the official CLI installation containing dispatcher.js.');
        return { command: process.execPath, prefix: [dispatcher] };
    }
    return { command: cli, prefix: [] };
}

export function runLaya(args, options = {}) {
    const { command, prefix } = resolveCli();
    return run(command, [...prefix, `--version=${projectVersion}`, ...args], options);
}

export function requirePackageExport() {
    const result = runLaya(['help', 'export-installable-package'], { stdio: 'pipe', encoding: 'utf8' });
    if (!result.stdout.includes('export-installable-package <')) {
        throw new Error(`This CLI lacks installable package export. Run: layaair install ${projectVersion}`);
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const args = process.argv.slice(2);
        if (!args.length) throw new Error('Usage: node scripts/laya.mjs <command> [...args]');
        runLaya([...args, '--project', projectRoot, '--skip-package-install']);
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
