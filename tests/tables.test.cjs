const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { load } = require('./address-mapping-harness.cjs');
const source = path.resolve('assets/plugins/loom.tables');

test('tables adapter waits for generated schema, preserves project edits and metadata, and mounts a typed instance', () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-tables-'));
    const watched = new Map(), reloads = [];
    const fsApi = { ...fs, watchFile: (file, _options, callback) => watched.set(file, callback), unwatchFile: file => watched.delete(file) };
    const globals = {
        IEditorEnv: { regClass: () => type => type, onLoad() {}, onUnload() {},
            require: name => name === 'fs' ? fsApi : require(name) },
        EditorEnv: { projectPath: project, assetMgr: {
            getAsset: () => ({ file: 'tables.txt' }), getFullPath: () => path.join(source, 'tables.txt'),
            flushChanges: () => { throw Error('Lifecycle must not wait for asset imports'); },
        } },
    };
    const { LoomTablesPlugin: plugin } = load(path.join(source, 'tables-plugin.ts'), globals);
    try {
        plugin.onLoad();
        const adapter = path.join(project, 'src/loom/tables.ts');
        const config = path.join(project, 'assets/editorResources/loom.tables/config.json');
        const template = path.join(project, 'assets/editorResources/loom.tables/tables.txt');
        const schema = path.join(project, 'src/game/tables/schema.ts');
        const bytebuf = path.join(project, 'src/game/tables/bytebuf.ts');
        assert.ok(!fs.existsSync(adapter), 'missing schema must not break compilation');
        assert.ok(watched.has(schema), 'install watches a not-yet-generated schema');
        assert.ok(watched.has(bytebuf), 'watch additional imports from the same directory');
        fs.mkdirSync(path.dirname(schema), { recursive: true }); fs.writeFileSync(schema, 'export class Tables {}');
        watched.get(schema)();
        assert.ok(!fs.existsSync(adapter), 'schema alone must not create an unresolved bytebuf import');
        fs.writeFileSync(bytebuf, 'export default class ByteBuf {}'); watched.get(bytebuf)();
        const generated = fs.readFileSync(adapter, 'utf8');
        assert.ok(generated.includes('from "../game/tables/schema"'));
        assert.ok(generated.includes('from "../game/tables/bytebuf"'));
        assert.doesNotMatch(generated, /\{\{importdir\}\}/);
        const generate = plugin.generate;
        assert.equal(generate.call(undefined).created, false, 'unbound CLI calls work without rewriting');
        const originalMeta = fs.readFileSync(adapter + '.meta', 'utf8');
        const bundle = JSON.parse(fs.readFileSync(path.join(project, 'src/loom/tables.bundledef')));
        assert.equal(bundle.loadBeforeMain, true);
        assert.equal(bundle.entries[0], 'res://' + JSON.parse(originalMeta).uuid);
        const host = { core: {} }; class Tables {}
        const runtime = { window: { loom: host }, Laya: { regClass: () => type => type },
            IEditorEnv: { onUserScriptsLoad: (type, name) => reloads.push(() => type[name]()) } };
        load(adapter, runtime, { '../game/tables/schema': { Tables }, '../game/tables/bytebuf': { default: class ByteBuf {} } });
        assert.equal(runtime.window.loom, host);
        assert.ok(host.tables instanceof Tables);
        const instance = host.tables;
        runtime.window.loom = {}; reloads[0]();
        assert.equal(runtime.window.loom.tables, instance, 'hot reload restores the same data instance');
        fs.appendFileSync(template, '\n// custom project template\n');
        generate();
        assert.ok(fs.readFileSync(adapter, 'utf8').endsWith('// custom project template\n'));
        assert.equal(fs.readFileSync(adapter + '.meta', 'utf8'), originalMeta);
        const currentTemplate = fs.readFileSync(template, 'utf8');
        fs.writeFileSync(template, currentTemplate.replaceAll('{{importdir}}/schema', '{{schemaImport}}'));
        generate();
        assert.ok(fs.readFileSync(adapter, 'utf8').includes('from "../game/tables/schema"'), 'legacy schemaImport remains supported');
        fs.writeFileSync(template, currentTemplate); generate();
        const customDir = path.join(project, 'src/custom/generated');
        fs.mkdirSync(customDir, { recursive: true });
        fs.writeFileSync(path.join(customDir, 'schema.ts'), 'export class Tables {}');
        fs.writeFileSync(path.join(customDir, 'bytebuf.ts'), 'export default class ByteBuf {}');
        fs.writeFileSync(config, JSON.stringify({ schema: 'src\\custom\\generated\\schema.ts' }));
        generate();
        assert.ok(fs.readFileSync(adapter, 'utf8').includes('from "../custom/generated/schema"'));
        assert.ok(fs.readFileSync(adapter, 'utf8').includes('from "../custom/generated/bytebuf"'));
        assert.equal(fs.readFileSync(adapter + '.meta', 'utf8'), originalMeta);
        fs.writeFileSync(config, JSON.stringify({ schema: 'src/game/tables/schema.ts' })); generate();
        const edited = fs.readFileSync(adapter, 'utf8') + '// manual adapter change\n';
        fs.writeFileSync(adapter, edited);
        fs.appendFileSync(template, '// newer template\n'); generate();
        assert.equal(fs.readFileSync(adapter, 'utf8'), edited, 'never overwrite a manually edited adapter');
        const existingConfig = '{"schema":"src/game/tables/schema.ts","custom":true}';
        fs.writeFileSync(config, existingConfig); generate();
        assert.equal(fs.readFileSync(config, 'utf8'), existingConfig);
        fs.writeFileSync(config, '{"schema":"src/../outside.ts"}');
        assert.throws(() => generate(), /Invalid config.schema/);
    } finally { plugin.onUnload(); assert.equal(watched.size, 0); fs.rmSync(project, { recursive: true, force: true }); }
});
