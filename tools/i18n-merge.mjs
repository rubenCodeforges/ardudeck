#!/usr/bin/env node
/**
 * i18n merge — fold per-file key tables into the locale bundles.
 *
 * Translating a screen happens in two halves. One half edits the component and
 * puts a translation key next to every user-visible string. The other half
 * records what each key says: a small table of `[key, english, chinese]` rows.
 * This tool does the second half — it folds those tables into `en.ts` (the
 * source bundle) and `zh-CN.ts`.
 *
 * Usage:
 *   node tools/i18n-merge.mjs [--dir=.run/i18n-out] [--dry-run]
 *
 * Each input file is JSON shaped:
 *   { "namespace": "views", "file": "...", "keys": [["views.x.y", "English", "中文"]] }
 *
 * The bundles are hand-written TypeScript with three object levels, a mix of
 * quoted and bare keys, and keys that themselves contain dots. Rather than
 * re-print them — which would reorder and re-quote everything and lose any
 * formatting a human chose — this tool only ever INSERTS a line. Existing bytes
 * are never rewritten, so re-running cannot drift.
 *
 * Guarantees, in order of importance:
 *   1. The Chinese bundle's key set always EQUALS the English one. A key in
 *      only one bundle is a compile error waiting to happen (TS2353 / TS1117),
 *      so both are written from a single pairing.
 *   2. Idempotent — an existing key is detected and skipped.
 *   3. Never silently overwrites. An existing key whose English differs from
 *      the table's is reported and left alone.
 *   4. A namespace that does not exist yet is created in both bundles and
 *      registered in `I18N_NAMESPACES`, since i18next never loads an
 *      unregistered namespace and its copy would silently fall back to English.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES = join(REPO_ROOT, 'apps/desktop/src/renderer/i18n/locales');
const I18N_INDEX = join(REPO_ROOT, 'apps/desktop/src/renderer/i18n/index.ts');
const EN_PATH = join(LOCALES, 'en.ts');
const ZH_PATH = join(LOCALES, 'zh-CN.ts');

/** Bundle values may contain \\' and \\\\ — round-trip both. */
const unescape = (s) => s.replace(/\\(.)/g, '$1');
const escape = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

const LEAF_RE = /^(\s*)(?:'((?:[^'\\]|\\.)*)'|([A-Za-z_$][\w$]*)):\s*'((?:[^'\\]|\\.)*)',$/;
const OPEN_RE = /^(\s*)(?:'((?:[^'\\]|\\.)*)'|([A-Za-z_$][\w$]*)):\s*\{$/;
const CLOSE_RE = /^(\s*)\},?$/;

/**
 * Walk one namespace block.
 *
 * Returns the line index of its closing brace plus every object and leaf found
 * inside it, keyed by the path below the namespace (so `tours` or
 * `tours.welcome`), with the leaf key spelled the way it appears in the file.
 */
function scanNamespace(lines, ns) {
  const head = `  ${ns}: {`;
  const startIdx = lines.indexOf(head);
  if (startIdx === -1) return null;

  const objects = new Map(); // path -> { closeIdx, childIndent }
  const leaves = new Map(); // path (incl. leaf) -> { value, key }
  const stack = [];
  let endIdx = -1;

  for (let i = startIdx + 1; i < lines.length; i += 1) {
    const line = lines[i];
    const open = OPEN_RE.exec(line);
    if (open) {
      stack.push({ name: unescape(open[2] ?? open[3]), indent: open[1].length });
      objects.set(stack.map((s) => s.name).join('.'), { closeIdx: -1, childIndent: open[1].length + 2 });
      continue;
    }
    const close = CLOSE_RE.exec(line);
    if (close) {
      if (stack.length === 0) {
        endIdx = i;
        break;
      }
      const closed = stack.pop();
      const path = [...stack, closed].map((s) => s.name).join('.');
      const entry = objects.get(path);
      if (entry) entry.closeIdx = i;
      continue;
    }
    const leaf = LEAF_RE.exec(line);
    if (leaf) {
      const rawKey = unescape(leaf[2] ?? leaf[3]);
      const path = [...stack.map((s) => s.name), rawKey].join('.');
      leaves.set(path, { value: unescape(leaf[4]), key: rawKey, indent: leaf[1].length });
    }
  }

  if (endIdx === -1) throw new Error(`unterminated namespace block: ${ns}`);
  return { startIdx, endIdx, objects, leaves };
}

/** `a.b.c` → parent `a`, leaf `b.c`; `abc` → no parent, leaf `abc`. */
function splitKey(belowNs) {
  const dot = belowNs.indexOf('.');
  return dot === -1 ? { parent: null, leaf: belowNs } : { parent: belowNs.slice(0, dot), leaf: belowNs.slice(dot + 1) };
}

/**
 * Add one key to a bundle, creating its group object when needed.
 * `insertions` collects line edits so several keys in one namespace can be
 * applied against the ORIGINAL line numbers, bottom-up.
 */
function addKey(text, ns, belowNs, value, insertions, created) {
  const lines = text.split('\n');
  const block = scanNamespace(lines, ns);
  if (!block) throw new Error(`namespace ${ns} missing`);
  const { parent, leaf } = splitKey(belowNs);
  const quote = `'${escape(leaf)}': '${escape(value)}',`;

  if (!parent) {
    insertions.push({ idx: block.endIdx, line: `    ${quote}` });
    return;
  }

  const group = block.objects.get(parent);
  if (group) {
    insertions.push({ idx: group.closeIdx, line: `${' '.repeat(group.childIndent)}${quote}` });
    return;
  }

  // The group does not exist yet. Insertions are collected against the original
  // line numbers and applied at the end, so a group created by an earlier key in
  // this same run is invisible to `scanNamespace` — without `created` remembering
  // it, every key would open its own duplicate group object (TS1117).
  let open = created.get(parent);
  if (!open) {
    open = { idx: block.endIdx, header: `    '${escape(parent)}': {`, leaves: [] };
    created.set(parent, open);
    insertions.push(open);
  }
  open.leaves.push(`      ${quote}`);
}

/** Create a namespace that is not in the bundle yet, in alphabetical place. */
function createNamespace(text, ns, rows) {
  const lines = text.split('\n');
  const names = lines
    .map((l, i) => (/^ {2}([A-Za-z][\w-]*): \{$/.test(l) ? { name: /^ {2}([A-Za-z][\w-]*): \{$/.exec(l)[1], i } : null))
    .filter(Boolean);

  const groups = new Map();
  for (const [key, value] of rows) {
    const { parent, leaf } = splitKey(key);
    const bucket = parent ?? '';
    if (!groups.has(bucket)) groups.set(bucket, []);
    groups.get(bucket).push([leaf, value]);
  }

  const body = [];
  for (const [leaf, value] of groups.get('') ?? []) body.push(`    '${escape(leaf)}': '${escape(value)}',`);
  for (const bucket of [...groups.keys()].filter(Boolean).sort()) {
    body.push(`    '${escape(bucket)}': {`);
    for (const [leaf, value] of groups.get(bucket)) body.push(`      '${escape(leaf)}': '${escape(value)}',`);
    body.push('    },');
  }
  const block = [`  ${ns}: {`, ...body, '  },'];

  const after = names.find((n) => n.name > ns);
  const at = after ? after.i : lines.findLastIndex((l) => /^ {2}\},$/.test(l)) + 1;
  return [...lines.slice(0, at), ...block, ...lines.slice(at)].join('\n');
}

/** Apply collected insertions from the bottom of the file upward. */
function applyInsertions(text, insertions) {
  const lines = text.split('\n');
  for (const ins of [...insertions].sort((a, b) => b.idx - a.idx)) {
    const parts = ins.line !== undefined ? ins.line.split('\n') : [ins.header, ...ins.leaves, '    },'];
    lines.splice(ins.idx, 0, ...parts);
  }
  return lines.join('\n');
}

/**
 * `--dump` prints every key the bundles already contain, as merge tables.
 * Merging the dump back is a no-op, which is what makes the insert-only
 * guarantee testable: any key the scanner fails to see would be inserted a
 * second time and show up as a diff.
 */
function dump() {
  const en = scanAll(readFileSync(EN_PATH, 'utf8').split('\n'));
  const zh = scanAll(readFileSync(ZH_PATH, 'utf8').split('\n'));
  const tables = [];
  for (const [ns, leaves] of en) {
    const other = zh.get(ns) ?? new Map();
    const keys = [];
    for (const [path, leaf] of leaves) {
      // In-namespace key, the same spelling a component passes to t().
      keys.push([path, leaf.value, other.get(path)?.value ?? '']);
    }
    tables.push({ namespace: ns, file: 'dump', keys });
  }
  console.log(JSON.stringify(tables, null, 1));
}

function scanAll(lines) {
  const out = new Map();
  for (const line of lines) {
    const m = /^ {2}([A-Za-z][\w-]*): \{$/.exec(line);
    if (!m) continue;
    out.set(m[1], scanNamespace(lines, m[1]).leaves);
  }
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const dir = resolve(REPO_ROOT, (args.find((a) => a.startsWith('--dir=')) ?? '--dir=.run/i18n-out').slice(6));
  const dryRun = args.includes('--dry-run');

  if (args.includes('--dump')) {
    dump();
    return;
  }

  if (!existsSync(dir)) {
    console.error(`no such directory: ${dir}`);
    process.exit(1);
  }

  // Collect tables by namespace. Two files claiming one key with different copy
  // is a mistake in the tables, not something to paper over.
  const byNs = new Map();
  const owner = new Map();
  const empties = [];
  let tables = 0;

  for (const name of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const parsed = JSON.parse(readFileSync(join(dir, name), 'utf8'));
    const ns = parsed.namespace;
    if (!ns) throw new Error(`${name}: missing "namespace"`);
    if (!Array.isArray(parsed.keys)) throw new Error(`${name}: missing "keys"`);
    tables += 1;
    const rows = byNs.get(ns) ?? [];
    for (const row of parsed.keys) {
      if (!Array.isArray(row) || row.length !== 3) {
        throw new Error(`${name}: every row must be [key, english, chinese]; got ${JSON.stringify(row)}`);
      }
      const [key, en, zh] = row;
      if (key.includes("'")) throw new Error(`${name}: a key may not contain a quote: ${key}`);
      if (typeof en !== 'string' || typeof zh !== 'string') {
        throw new Error(`${name}: ${key} needs string English and Chinese`);
      }
      // An empty Chinese value is legitimate: Chinese word order sometimes
      // absorbs the tail of a sentence that English needs a separate word for
      // (serialPorts.setupElrs3 is " baud" in English and nothing in Chinese).
      if (!en) empties.push(`${key} (empty English)`);
      if (!zh) empties.push(`${key} (empty Chinese)`);
      const prev = owner.get(key);
      if (prev) {
        if (prev.en !== en || prev.zh !== zh) {
          console.error(`conflicting definitions for ${key}:`);
          console.error(`  ${prev.file}: ${JSON.stringify(prev.en)} / ${JSON.stringify(prev.zh)}`);
          console.error(`  ${name}: ${JSON.stringify(en)} / ${JSON.stringify(zh)}`);
          process.exit(1);
        }
        continue;
      }
      owner.set(key, { file: name, en, zh });
      rows.push([key, en, zh]);
    }
    byNs.set(ns, rows);
  }

  const before = { en: readFileSync(EN_PATH, 'utf8'), zh: readFileSync(ZH_PATH, 'utf8') };
  let nextEn = before.en;
  let nextZh = before.zh;
  const notes = [];
  const newNamespaces = [];

  for (const ns of [...byNs.keys()].sort()) {
    const rows = byNs.get(ns);
    const enLines = nextEn.split('\n');
    const zhLines = nextZh.split('\n');
    const enBlock = scanNamespace(enLines, ns);
    const zhBlock = scanNamespace(zhLines, ns);

    if (!enBlock || !zhBlock) {
      if (enBlock || zhBlock) {
        console.error(`namespace ${ns} exists in only one bundle — refusing to guess`);
        process.exit(1);
      }
      nextEn = createNamespace(nextEn, ns, rows.map(([k, e]) => [k, e]));
      nextZh = createNamespace(nextZh, ns, rows.map(([k, , z]) => [k, z]));
      newNamespaces.push(ns);
      notes.push(`${ns} (new, ${rows.length} keys)`);
      continue;
    }

    const enIns = [];
    const zhIns = [];
    // One per bundle: sharing this map let the Chinese pass append its leaves to
    // the group object the English pass had opened, writing Chinese into en.ts.
    const madeEn = new Map();
    const madeZh = new Map();
    let added = 0;
    let present = 0;

    for (const [key, value, chinese] of rows) {
      const belowNs = key;
      const already = enBlock.leaves.get(belowNs);
      const alreadyZh = zhBlock.leaves.get(belowNs);
      if (already || alreadyZh) {
        if (!already || !alreadyZh) {
          console.error(`${key} exists in only one bundle — refusing to guess`);
          process.exit(1);
        }
        if (already.value !== value) {
          console.error(`conflict: ${key} already means ${JSON.stringify(already.value)}, table says ${JSON.stringify(value)}`);
          process.exit(1);
        }
        present += 1;
        continue;
      }
      addKey(nextEn, ns, belowNs, value, enIns, madeEn);
      addKey(nextZh, ns, belowNs, chinese, zhIns, madeZh);
      added += 1;
    }

    if (added) {
      nextEn = applyInsertions(nextEn, enIns);
      nextZh = applyInsertions(nextZh, zhIns);
    }
    notes.push(`${ns} (+${added}${present ? `, ${present} already present` : ''})`);
  }

  let index = readFileSync(I18N_INDEX, 'utf8');
  const declared = JSON.parse(/I18N_NAMESPACES = (\[[^\]]*\])/.exec(index)[1].replace(/'/g, '"'));
  const unregistered = [...byNs.keys()].filter((ns) => !declared.includes(ns));
  if (unregistered.length) {
    const list = [...new Set([...declared, ...unregistered])].sort();
    index = index.replace(
      /export const I18N_NAMESPACES = \[[^\]]*\] as const;/,
      `export const I18N_NAMESPACES = [${list.map((n) => `'${n}'`).join(', ')}] as const;`,
    );
  }

  console.log(`i18n merge — ${tables} table(s) from ${dir}`);
  for (const note of notes) console.log(`  ${note}`);
  if (unregistered.length) console.log(`  registered namespaces: ${unregistered.join(', ')}`);
  if (empties.length) {
    console.log(`  empty values (allowed, but check each is deliberate): ${empties.length}`);
    for (const e of empties) console.log(`    ${e}`);
  }
  if (newNamespaces.length) console.log(`  created namespaces: ${newNamespaces.join(', ')}`);
  if (dryRun) {
    console.log('  --dry-run: nothing written');
    return;
  }
  if (nextEn !== before.en) writeFileSync(EN_PATH, nextEn);
  if (nextZh !== before.zh) writeFileSync(ZH_PATH, nextZh);
  if (index !== readFileSync(I18N_INDEX, 'utf8')) writeFileSync(I18N_INDEX, index);
  const changed = nextEn !== before.en || nextZh !== before.zh;
  console.log(changed ? '  bundles written' : '  bundles unchanged');
}

main();
