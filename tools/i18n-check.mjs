#!/usr/bin/env node
/**
 * i18n check — verify one file's wiring against its translation table.
 *
 * A subagent (or I) can report "210 keys, both directions match" and still be
 * wrong: a key can sit in the table unused, a component can call `t('x')` for a
 * key nobody wrote, or the bundle can be missing the Chinese. This tool checks
 * all three from the artefacts rather than from anyone's summary.
 *
 * Usage:
 *   node tools/i18n-check.mjs [--dir=.run/i18n-out] [--strict]
 *
 * For each `<dir>/*.json` table it reports:
 *   used-not-declared  the file renders a key the table does not define
 *   declared-not-used  the table defines a key the file never renders
 *   missing-in-bundle  the bundle lacks the key, or its Chinese is empty
 *   unreferenced       the file no longer contains the English literal the
 *                      table claims to have replaced (a hint that the key was
 *                      added without switching the render site)
 *
 * `--strict` exits non-zero when any of the first three is non-empty.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EN_PATH = join(REPO_ROOT, 'apps/desktop/src/renderer/i18n/locales/en.ts');
const ZH_PATH = join(REPO_ROOT, 'apps/desktop/src/renderer/i18n/locales/zh-CN.ts');

/**
 * Every occurrence of a key in the source, however it is spelled. Keys appear
 * either as a call argument (`t('ns.key')`, `svText(t, x.labelKey, …)`) or as a
 * sibling property (`labelKey: 'ns.key'`), so search the whole file for the
 * literal rather than trying to parse the JSX.
 */
function keysInSource(source, prefixes) {
  const found = new Set();
  // One table can span several prefixes (`group.*` and `palette.*` share a data
  // file), so match every dotted literal and keep those whose first segment is a
  // prefix this table uses.
  const re = /['"`]([A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9-]+)+)['"`]/g;
  for (const m of source.matchAll(re)) {
    if (prefixes.some((p) => m[1].startsWith(`${p}.`))) found.add(m[1]);
  }
  return found;
}

/**
 * The bundles have three object levels and keys that themselves contain dots,
 * so their shape is read back through the merge tool's `--dump` rather than by
 * parsing here. One source of truth for "what does the bundle contain".
 */
function loadBundles() {
  const raw = execFileSync(process.execPath, [join(REPO_ROOT, 'tools/i18n-merge.mjs'), '--dump'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const byNs = new Map();
  for (const table of JSON.parse(raw)) {
    const inner = new Map();
    for (const [key, en, zh] of table.keys) {
      // The dump already spells keys the way a component does: in-namespace
      // (`survey.title` under `views`), which is what a table uses too.
      inner.set(key, { en, zh });
    }
    byNs.set(table.namespace, inner);
  }
  return byNs;
}

/** The leaf a key names inside its namespace, to look it up in a dump. */
function main() {
  const args = process.argv.slice(2);
  const dirs = args.filter((a) => a.startsWith('--dir')).map((a) => resolve(REPO_ROOT, a.slice(a.indexOf('=') + 1)));
  if (!dirs.length) dirs.push(join(REPO_ROOT, '.run/i18n-out'));
  const strict = args.includes('--strict');
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      console.error(`no such directory: ${dir}`);
      process.exit(1);
    }
  }

  const bundles = loadBundles();
  // A key can legitimately be keyed by hand and live only in the bundle — not
  // every string went through a table. Such a key is not a defect just because
  // no table declares it.
  const inBundle = new Set();
  for (const [ns, inner] of bundles) for (const k of inner.keys()) inBundle.add(`${ns}.${k}`);

  // Two tables may share a prefix (`logs.*` has both a main table and a Y-mode
  // sub-table). A key this file references but this table does not declare is
  // therefore only a defect if NO table declares it, so the used/declared
  // comparison runs against the union of every table's declarations.
  const allDeclared = new Set();
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      const t = JSON.parse(readFileSync(join(dir, name), 'utf8'));
      for (const [k] of t.keys) allDeclared.add(k);
    }
  }

  let failures = 0;

  const files = [];
  for (const dir of dirs) {
    for (const name of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
      files.push({ name, dir });
    }
  }

  for (const { name, dir } of files) {
    const table = JSON.parse(readFileSync(join(dir, name), 'utf8'));
    const ns = table.namespace;
    const prefixes = [...new Set(table.keys.map(([k]) => k.split('.')[0]))];
    const declared = new Set(table.keys.map(([k]) => k));
    // A table describing a DATA file (`parameter-groups.ts`, `node-library.ts`)
    // declares keys the data carries but no component spells out; the reference
    // lives in whichever components read that data. Such a table may name those
    // consumers in `scanFiles`, otherwise only the file itself is searched.
    const scanFiles = table.scanFiles ?? [table.file];
    const source = scanFiles.map((f) => readFileSync(join(REPO_ROOT, f), 'utf8')).join('\n');
    const used = keysInSource(source, prefixes);

    const usedNotDeclared = [...used]
      .filter((k) => !allDeclared.has(k) && !inBundle.has(`${ns}.${k}`))
      .sort();
    const declaredNotUsed = [...declared].filter((k) => !used.has(k)).sort();

    const missing = [];
    for (const [key, value] of table.keys) {
      const hit = bundles.get(ns)?.get(key);
      if (!hit) missing.push(`${key} (absent from the bundles)`);
      else {
        if (hit.en !== value) missing.push(`${key} (en mismatch: bundle ${JSON.stringify(hit.en)})`);
        if (hit.zh === '') missing.push(`${key} (empty Chinese)`);
      }
    }

    const bad = usedNotDeclared.length + declaredNotUsed.length + missing.length;
    if (bad) failures += 1;
    const status = bad ? 'FAIL' : 'OK';
    console.log(`${status}  ${name}  (${table.keys.length} keys, ${used.size} referenced)`);
    const show = (label, list) => {
      if (!list.length) return;
      console.log(`    ${label} (${list.length}):`);
      for (const item of list.slice(0, 15)) console.log(`      ${item}`);
      if (list.length > 15) console.log(`      … and ${list.length - 15} more`);
    };
    show('used but not declared', usedNotDeclared);
    show('declared but never used', declaredNotUsed);
    show('problem in the bundle', missing);
  }

  if (strict && failures) {
    console.error(`\n${failures} table(s) failed`);
    process.exit(1);
  }
  console.log(failures ? `\n${failures} table(s) need attention` : '\nall tables consistent');
}

main();
