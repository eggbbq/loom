const assert = require('node:assert/strict');
const { test } = require('node:test');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, rmSync, mkdirSync } = require('node:fs');
const path = require('node:path');

test('migrated module-token and notifier contracts retain their type and lifecycle regressions', () => {
    const root = path.resolve(__dirname, '..');
    mkdirSync(path.join(root, 'temp'), { recursive: true });
    const out = mkdtempSync(path.join(root, 'temp/core-cases-'));
    function run(args) {
        const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
        assert.equal(result.status, 0, result.stdout + result.stderr);
    }
    try {
        run(['node_modules/typescript/bin/tsc', '--strict', '--skipLibCheck', '--target', 'ES2020', '--module', 'commonjs', '--outDir', out, '--rootDir', '.',
            'engine/types/LayaAir.d.ts', 'assets/plugins/loom.core/runtime/g.d.ts', 'tests/module-token-cases.ts', 'tests/notifier-cases.ts']);
        for (const name of ['module-token', 'notifier']) run([path.join(out, `tests/${name}-cases.js`)]);
    } finally { rmSync(out, { recursive: true, force: true }); }
});
