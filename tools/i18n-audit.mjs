#!/usr/bin/env node
/**
 * i18n audit — find every translation lookup in the renderer that does not resolve.
 *
 * `i18n-check.mjs` and `i18n-verify.mjs` only look at keys that came through a
 * translation table. A screen keyed by hand — or an earlier round's work — can
 * still call `t('serialPorts.configHeading')` when the bundle stores that key as
 * `configHeading` inside the `serialPorts` namespace. Nothing type-checks that:
 * the call compiles, the key exists somewhere, and at runtime i18next finds
 * nothing and prints the KEY ITSELF into the UI.
 *
 * So this walks the whole renderer, pairs every `t('…')` / `xxText(t, '…', …)`
 * literal with the namespaces its file actually loads, and reports the pairs
 * that resolve to nothing. A literal is only a failure when it fails in EVERY
 * namespace the file uses, which keeps files that legitimately mix namespaces
 * (ParameterTable reads `params` for group keys) from being flagged.
 *
 * Usage:
 *   node tools/i18n-audit.mjs [--json]
 */

import { readFileSync, readdirSync, statSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve, relative, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RENDERER = join(REPO_ROOT, 'apps/desktop/src/renderer');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (['.ts', '.tsx'].includes(extname(p))) out.push(p);
  }
  return out;
}

/** The namespaces a file loads. `useTranslation('x')` / `useTranslation(['x','y'])`. */
function namespacesOf(source) {
  const out = new Set();
  for (const m of source.matchAll(/useTranslation\(\s*(\[[^\]]*\]|'[^']*'|"[^"]*")/g)) {
    for (const q of m[1].matchAll(/['"]([^'"]+)['"]/g)) out.add(q[1]);
  }
  return [...out];
}

/**
 * Every string literal the file passes to a translation call: `t('k')` in any
 * form (`t(...)`, `i18n.t(...)`, `xxText(t, 'k', …)`, `t('k', { … })`), plus the
 * `<prop>Key: 'k'` sibling properties that hold keys for a render site.
 */
function keyLiterals(source) {
  const out = new Set();
  for (const m of source.matchAll(/\bt\(\s*'([^']+)'/g)) out.add(m[1]);
  for (const m of source.matchAll(/[A-Za-z]*[Tt]ext\(\s*t\s*,\s*'([^']+)'/g)) out.add(m[1]);
  for (const m of source.matchAll(/\b\w+Key\s*:\s*'([^']+)'/g)) out.add(m[1]);
  return [...out];
}

const work = mkdtempSync(join(tmpdir(), 'i18n-audit-'));
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
const i18n = i18next.createInstance();
await i18n.init({
  lng: 'en',
  fallbackLng: false, // resolve against the source bundle alone
  ns: Object.keys(resources.en),
  defaultNS: 'common',
  resources: { en: resources.en },
  interpolation: { escapeValue: false },
  returnNull: false,
});

const I18N_NAMESPACES = Object.keys(resources.en);
const failures = [];
let checked = 0;
let filesWithCalls = 0;

for (const file of walk(RENDERER)) {
  // Tests assert against translator mocks and hold non-key literals; scanning
  // them produced nothing but noise (`t('v')`, `t('attitude')`).
  if (/\.test\.tsx?$/.test(file) || /\/__tests__\//.test(file)) continue;
  const source = readFileSync(file, 'utf8');
  if (/\/i18n\/locales\//.test(file)) continue;
  const literals = keyLiterals(source);
  if (!literals.length) continue;
  const nss = namespacesOf(source);
  // No hook in the file means the call relies on the default namespace.
  const candidates = nss.length ? nss : ['common'];
  filesWithCalls += 1;
  const nowhere = [];
  const wrongNs = [];
  for (const key of literals) {
    checked += 1;
    const inOwn = candidates.some((ns) => i18n.t(key, { ns }) !== key);
    if (inOwn) continue;
    // Two different defects, and only the first is unambiguous:
    //   nowhere  — no namespace defines the key, so i18next prints the key.
    //   wrongNs  — some namespace defines it, but not one this file loads.
    // A data table (no useTranslation) cannot be judged on the second, because
    // the file that renders it is what picks the namespace.
    const anywhere = I18N_NAMESPACES.some((ns) => i18n.t(key, { ns }) !== key);
    if (!anywhere) nowhere.push(key);
    else if (nss.length) wrongNs.push(key);
  }
  if (nowhere.length || wrongNs.length) {
    failures.push({ file: relative(REPO_ROOT, file), namespaces: candidates, nowhere, wrongNs });
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ checked, filesWithCalls, failures }, null, 1));
} else {
  console.log(`i18n audit — ${filesWithCalls} file(s) with lookups, ${checked} literal(s) checked`);
  if (!failures.length) {
    console.log('every lookup resolves');
  } else {
    const nNowhere = failures.reduce((n, f) => n + f.nowhere.length, 0);
    const nWrong = failures.reduce((n, f) => n + f.wrongNs.length, 0);
    console.log(`${nNowhere} key(s) defined in NO namespace, ${nWrong} key(s) defined only outside the file's namespaces:\n`);
    for (const f of failures) {
      if (!f.nowhere.length && !f.wrongNs.length) continue;
      console.log(`  ${f.file}   [ns: ${f.namespaces.join(', ')}]`);
      for (const k of f.nowhere) console.log(`      NOWHERE  ${k}`);
      for (const k of f.wrongNs.slice(0, 10)) console.log(`      WRONG-NS ${k}`);
      if (f.wrongNs.length > 10) console.log(`      … and ${f.wrongNs.length - 10} more wrong-ns`);
    }
    process.exitCode = 1;
  }
}
