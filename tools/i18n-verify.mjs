#!/usr/bin/env node
/**
 * i18n verify — resolve every translated key through i18next itself.
 *
 * `i18n-check.mjs` proves the key is in the bundle and the component mentions it.
 * Neither of those proves a lookup RETURNS the Chinese: the bundle could nest the
 * key where i18next will not look, the namespace could be wrong, or the component
 * could pass the wrong namespace to `useTranslation`. This tool closes that gap by
 * loading the real locale bundles, initialising i18next with the app's own options,
 * and asserting `t(key, { ns })` returns the expected string.
 *
 * It is also what catches the failure mode that matters most here: a lookup that
 * silently falls back to English.
 *
 * Usage:
 *   node tools/i18n-verify.mjs [--dir=.run/i18n-out] [--dir2=...]
 */

import { readFileSync, readdirSync, existsSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const dirs = process.argv.slice(2).filter((a) => a.startsWith('--dir'))
  .map((a) => resolve(REPO_ROOT, a.slice(a.indexOf('=') + 1)));
if (!dirs.length) dirs.push(join(REPO_ROOT, '.run/i18n-out'));

const work = mkdtempSync(join(tmpdir(), 'i18n-verify-'));
const entry = join(work, 'entry.ts');
writeFileSync(entry, `import { en } from ${JSON.stringify(join(REPO_ROOT, 'apps/desktop/src/renderer/i18n/locales/en'))};
import { zhCN } from ${JSON.stringify(join(REPO_ROOT, 'apps/desktop/src/renderer/i18n/locales/zh-CN'))};
export const resources = { en, 'zh-CN': zhCN };
`);
const out = join(work, 'bundle.mjs');
execFileSync('npx', ['esbuild', entry, '--bundle', '--format=esm', '--platform=node', `--outfile=${out}`, '--log-level=warning'], {
  cwd: REPO_ROOT,
  stdio: ['ignore', 'ignore', 'inherit'],
});

const { resources } = await import(pathToFileURL(out).href);
const i18next = (await import('i18next')).default;

// The app's own init options (apps/desktop/src/renderer/i18n/index.ts).
const i18n = i18next.createInstance();
await i18n.init({
  lng: 'zh-CN',
  fallbackLng: 'en',
  ns: Object.keys(resources.en),
  defaultNS: 'common',
  fallbackNS: 'common',
  resources,
  interpolation: { escapeValue: false },
  returnNull: false,
});

const I18N_NAMESPACES = Object.keys(resources.en);
const tables = [];
for (const dir of dirs) {
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    tables.push({ name, ...JSON.parse(readFileSync(join(dir, name), 'utf8')) });
  }
}

let failures = 0;
let checked = 0;
const seen = new Map();
for (const table of tables) {
  const ns = table.namespace;
  if (!I18N_NAMESPACES.includes(ns)) {
    console.error(`FAIL ${table.name}: namespace ${ns} is not registered, so i18next never loads it`);
    failures += 1;
    continue;
  }
  const bad = [];
  for (const [key, , zh] of table.keys) {
    if (seen.has(key)) continue;
    seen.set(key, table.name);
    checked += 1;
    const got = i18n.t(key, { ns });
    if (got !== zh) bad.push(`${key}: expected ${JSON.stringify(zh)}, got ${JSON.stringify(got)}`);
  }
  if (bad.length) {
    failures += 1;
    console.log(`FAIL ${table.name} (${bad.length} of ${table.keys.length} keys did not resolve)`);
    for (const b of bad.slice(0, 10)) console.log(`      ${b}`);
    if (bad.length > 10) console.log(`      … and ${bad.length - 10} more`);
  } else {
    console.log(`OK   ${table.name} (${table.keys.length} keys resolve to Chinese)`);
  }
}
console.log(`\n${checked} unique keys resolved through i18next across ${tables.length} table(s)`);
if (failures) {
  console.error(`${failures} table(s) failed`);
  process.exit(1);
}
