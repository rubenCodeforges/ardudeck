// Writes the AI tool registry as JSON for the website docs: node scripts/export-ai-tools.mjs [out.json]
import { build } from 'esbuild';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(process.argv[2] ?? 'ai-tools.json');
const dir = mkdtempSync(join(tmpdir(), 'ai-tools-'));
const bundle = join(dir, 'defs.mjs');
await build({ entryPoints: [join(here, '../src/shared/ai-tools/definitions.ts')], bundle: true, platform: 'node', format: 'esm', outfile: bundle, logLevel: 'warning' });
const { describeAiTools } = await import(pathToFileURL(bundle).href);
writeFileSync(out, JSON.stringify(describeAiTools(), null, 2) + '\n');
rmSync(dir, { recursive: true, force: true });
console.log(`Wrote ${out}`);
