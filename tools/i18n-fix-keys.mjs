#!/usr/bin/env node
/**
 * i18n fix-keys — rewrite key literals that cannot resolve.
 *
 * Early rounds wrote keys with a redundant namespace prefix in the components
 * and data tables (`t('serialPorts.configHeading')`, `nameKey: 'lua.auto.x'`)
 * while the bundles stored them without it (`configHeading`, `auto.x`). Those
 * lookups return the KEY ITSELF, so the UI printed `serialPorts.configHeading`.
 * Nothing type-checks this, and `i18n-audit.mjs` is what finds it.
 *
 * For each broken literal this looks for the in-namespace spelling that DOES
 * resolve, trying in order:
 *   1. the same key with its first segment removed     (`lua.auto.x`   → `auto.x`)
 *   2. a key that ends with the literal                (`planeModes.2.x` → `fm.planeModes.2.x`)
 *   3. a key of which the literal is a suffix after a group
 * and only rewrites when exactly one candidate resolves, so an ambiguous case is
 * reported rather than guessed at.
 *
 * STATUS: NOT SAFE TO APPLY YET. A dry run over the current tree produced clear
 * false positives — `mavlink.auto.airspeed` (a key corrupted by an earlier bad
 * codemod) was rewritten to the `lua` namespace's unrelated `auto.airspeed`, and
 * `left` in RadioHudView matched `survey.panorama.side.left`, which is layout
 * data rather than a key. Both rules need to be constrained by the English value
 * that sits next to the key before this can be trusted. It stays dry-run by
 * default and exists to size and plan the repair, not to perform it.
 *
 * Usage:
 *   node tools/i18n-fix-keys.mjs            # dry run, prints the plan
 *   node tools/i18n-fix-keys.mjs --write    # apply
 */

import { readFileSync, writeFileSync, readdirSync, statSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve, relative, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RENDERER = join(REPO_ROOT, 'apps/desktop/src/renderer');
const write = process.argv.includes('--write');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (['.ts', '.tsx'].includes(extname(p))) out.push(p);
  }
  return out;
}

function namespacesOf(source) {
  const out = new Set();
  for (const m of source.matchAll(/useTranslation\(\s*(\[[^\]]*\]|'[^']*'|"[^"]*")/g)) {
    for (const q of m[1].matchAll(/['"]([^'"]+)['"]/g)) out.add(q[1]);
  }
  return [...out];
}

function keyLiterals(source) {
  const out = new Set();
  for (const m of source.matchAll(/\bt\(\s*'([^']+)'/g)) out.add(m[1]);
  for (const m of source.matchAll(/[A-Za-z]*[Tt]ext\(\s*t\s*,\s*'([^']+)'/g)) out.add(m[1]);
  for (const m of source.matchAll(/\b\w+Key\s*:\s*'([^']+)'/g)) out.add(m[1]);
  return [...out];
}

// Load the bundles through the merge tool's dump: one source of truth.
const raw = execFileSync(process.execPath, [join(REPO_ROOT, 'tools/i18n-merge.mjs'), '--dump'], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
const byNs = new Map();
for (const t of JSON.parse(raw)) byNs.set(t.namespace, new Map(t.keys.map(([k, en]) => [k, en])));

const work = mkdtempSync(join(tmpdir(), 'i18n-fix-'));
const entry = join(work, 'entry.ts');
writeFileSync(entry, `import { en } from ${JSON.stringify(join(RENDERER, 'i18n/locales/en'))};
export const resources = { en };
`);
const bundled = join(work, 'bundle.mjs');
execFileSync('npx', ['esbuild', entry, '--bundle', '--format=esm', '--platform=node', `--outfile=${bundled}`, '--log-level=warning'], {
  cwd: REPO_ROOT,
  stdio: ['ignore', 'ignore', 'inherit'],
});
const { resources } = await import(pathToFileURL(bundled).href);
const i18next = (await import('i18next')).default;
const i18n = i18next.createInstance();
await i18n.init({
  lng: 'en', fallbackLng: false, ns: Object.keys(resources.en), defaultNS: 'common',
  resources: { en: resources.en }, returnNull: false, interpolation: { escapeValue: false },
});
const resolves = (key, ns) => i18n.t(key, { ns }) !== key;

/** Candidate in-namespace spellings for a literal that does not resolve. */
function candidatesFor(key, ns) {
  const out = [];
  const dot = key.indexOf('.');
  if (dot > 0) out.push(key.slice(dot + 1));
  for (const other of byNs.get(ns)?.keys() ?? []) {
    if (other !== key && other.endsWith(`.${key}`)) out.push(other);
  }
  return [...new Set(out)];
}

const plan = [];
const unresolved = [];
for (const file of walk(RENDERER)) {
  if (/\.test\.tsx?$/.test(file) || /\/__tests__\//.test(file) || /\/i18n\/locales\//.test(file)) continue;
  const source = readFileSync(file, 'utf8');
  const literals = keyLiterals(source);
  if (!literals.length) continue;
  const own = namespacesOf(source);
  // A data table names no namespace, so search every one; the key's value is the
  // same wherever it landed.
  const searchNs = own.length ? own : [...byNs.keys()];
  for (const key of literals) {
    if (searchNs.some((ns) => resolves(key, ns))) continue;
    const hits = [];
    for (const ns of searchNs) {
      for (const cand of candidatesFor(key, ns)) {
        if (resolves(cand, ns)) hits.push({ ns, cand });
      }
    }
    const unique = [...new Map(hits.map((h) => [`${h.ns}:${h.cand}`, h])).values()];
    if (unique.length === 1) plan.push({ file: relative(REPO_ROOT, file), from: key, to: unique[0].cand, ns: unique[0].ns });
    else unresolved.push({ file: relative(REPO_ROOT, file), key, hits: unique.length });
  }
}

console.log(`fix-keys — ${plan.length} rewrite(s), ${unresolved.length} unresolved`);
const byFile = new Map();
for (const p of plan) {
  if (!byFile.has(p.file)) byFile.set(p.file, []);
  byFile.get(p.file).push(p);
}
for (const [file, items] of byFile) {
  console.log(`  ${file}  (${items.length})`);
  if (!write) {
    for (const it of items.slice(0, 3)) console.log(`      ${it.from}  →  ${it.to}   [${it.ns}]`);
    if (items.length > 3) console.log(`      … and ${items.length - 3} more`);
  }
}
if (unresolved.length) {
  console.log('\nunresolved (need a human):');
  for (const u of unresolved.slice(0, 20)) console.log(`  ${u.file}: ${u.key}  (${u.hits} candidate namespaces)`);
  if (unresolved.length > 20) console.log(`  … and ${unresolved.length - 20} more`);
}

if (write) {
  for (const [file, items] of byFile) {
    const abs = join(REPO_ROOT, file);
    let source = readFileSync(abs, 'utf8');
    for (const it of items) {
      const quoted = [`'${it.from}'`, `"${it.from}"`, `\`${it.from}\``];
      for (const q of quoted) source = source.split(q).join(`${q[0]}${it.to}${q[0]}`);
    }
    writeFileSync(abs, source);
  }
  console.log(`\nrewrote ${plan.length} literal(s) in ${byFile.size} file(s)`);
}
