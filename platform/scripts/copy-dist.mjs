import { copyFile, mkdir, readdir, access, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const source = fileURLToPath(new URL('../dist/', import.meta.url));
const destination = fileURLToPath(new URL('../../assets/plugins/loom.sdk/editorResources/loom.sdk/', import.meta.url));

async function copyDirectory(from, to) {
  const entries = await readdir(from, { withFileTypes: true });
  await mkdir(to, { recursive: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      await copyDirectory(path.join(from, entry.name), path.join(to, entry.name));
    } else if (entry.isFile()) {
      const output = path.join(to, entry.name + '.txt');
      await copyFile(path.join(from, entry.name), output);
      // Keep Laya asset UUIDs stable across repeated builds.
      try { await access(output + '.meta'); }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        await writeFile(output + '.meta', JSON.stringify({ uuid: randomUUID() }, null, 2) + '\n', { flag: 'wx' });
      }
      console.log(`Copied ${entry.name} -> ${path.relative(destination, output)}`);
    }
  }
}

await copyDirectory(source, destination);
