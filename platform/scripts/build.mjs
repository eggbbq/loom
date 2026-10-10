import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { copyFile, readFile, appendFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const root = fileURLToPath(new URL("../", import.meta.url));
const supportedPlatforms = ["wechat", "douyin"];
const requested = process.argv.slice(2);
const platforms = requested.length === 0 ? supportedPlatforms : [...new Set(requested)];

for (const platform of platforms) {
  if (!supportedPlatforms.includes(platform)) {
    throw new Error(`未知平台：${platform}。支持的平台：${supportedPlatforms.join(", ")}`);
  }
}

await Promise.all(platforms.map((platform) => build({
  absWorkingDir: root,
  entryPoints: [`src/loom.${platform}.ts`],
  outfile: `dist/loom.${platform}.js`,
  bundle: true,
  format: "iife",
  platform: "neutral",
  target: "es2018",
  minify: true,
  legalComments: "none",
  logLevel: "info",
})));

// 用 TypeScript 生成声明，避免手工截取时混入实现代码。
await promisify(execFile)(process.execPath, [
  fileURLToPath(new URL("../node_modules/typescript/bin/tsc", import.meta.url)),
  "-p", "tsconfig.declarations.json",
], { cwd: root });
const globals = await readFile(new URL("../src/loom.global.d.ts", import.meta.url), "utf8");
const globalDeclarations = globals
  .replace(/^import type .* from ["']\.\/loom\.sdk["'];\r?\n/gm, "");
await appendFile(new URL("../dist/loom.sdk.d.ts", import.meta.url), "\n" + globalDeclarations);
await copyFile(new URL("../src/loom.sdk.ts", import.meta.url), new URL("../dist/loom.sdk.ts", import.meta.url));

// 清理旧命名的生成文件。
await Promise.all(["sdk.d.ts", "minisdk.ts", "minisdk.d.ts", ...supportedPlatforms.flatMap(platform => [`jy-sdk.${platform}.js`, `minisdk.${platform}.js`])]
  .map(name => rm(new URL(`../dist/${name}`, import.meta.url), { force: true })));
