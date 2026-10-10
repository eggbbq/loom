import { readFileSync, writeFileSync } from 'node:fs';

// Only update the package default; project-owned templates are never overwritten.
export function syncSDKTemplate() {
    const source = readFileSync(new URL('../platform/src/loom.sdk.ts', import.meta.url), 'utf8');
    const template = new URL('../assets/plugins/loom.sdk/editorResources/loom.sdk/loom.sdk.ts.txt', import.meta.url);
    if (readFileSync(template, 'utf8') !== source) writeFileSync(template, source);
}
