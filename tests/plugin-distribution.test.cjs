const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

test('archive names stay fixed while tags change URLs and package versions retain dependency semantics', async () => {
    const { writePluginDistribution } = await import('../scripts/plugin-distribution.mjs');
    const output = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-distribution-'));
    const names = ['LOOM_RELEASE_TAG', 'LOOM_RELEASE_REPOSITORY', 'LOOM_PACKAGE_BASE_URL'];
    const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
    try {
        process.env.LOOM_RELEASE_REPOSITORY = 'example/loom';
        delete process.env.LOOM_PACKAGE_BASE_URL;
        const core = { name: 'loom.core', displayName: 'Loom Core', version: '1.0.0' };
        const navigation = { name: 'loom.pathfinding', displayName: 'Loom Pathfinding', version: '1.0.1', pluginDependencies: { 'loom.core': '1.0.0' } };
        for (const pkg of [core, navigation]) fs.writeFileSync(path.join(output, pkg.name + '.layapkg'), pkg.name);
        process.env.LOOM_RELEASE_TAG = 'v0.2.0';
        const first = writePluginDistribution([core, navigation], output);
        assert.equal(first.packages[0].file, 'loom.core.layapkg');
        assert.equal(first.packages[0].url, 'https://github.com/example/loom/releases/download/v0.2.0/loom.core.layapkg');
        process.env.LOOM_RELEASE_TAG = 'v0.3.0';
        core.version = '1.1.0'; navigation.pluginDependencies['loom.core'] = '1.1.0';
        const second = writePluginDistribution([core, navigation], output);
        assert.equal(second.packages[0].file, first.packages[0].file);
        assert.notEqual(second.packages[0].url, first.packages[0].url);
        assert.equal(second.packages[0].version, '1.1.0');
        assert.equal(second.packages[1].dependencies['loom.core'], '1.1.0');
        assert.equal(JSON.parse(fs.readFileSync(path.join(output, 'manifest.json'))).dependencies['loom.core'], second.packages[0].url);
        for (const line of fs.readFileSync(path.join(output, 'SHA256SUMS'), 'utf8').trim().split('\n')) {
            const [hash, file] = line.split('  ');
            assert.equal(hash, crypto.createHash('sha256').update(fs.readFileSync(path.join(output, file))).digest('hex'));
        }
        assert.throws(() => writePluginDistribution([navigation], output), /include its matching archive/);
    } finally {
        for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; }
        fs.rmSync(output, { recursive: true, force: true });
    }
});
