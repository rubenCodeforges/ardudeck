#!/usr/bin/env node
/**
 * i18n codemod — AST + type-checker based.
 *
 * Earlier rounds used regexes to find translatable text and to patch source.
 * That caused several self-inflicted bugs (a `>} =` corrupted generic, a missed
 * `description` field, single-line rows silently skipped, nested `GraphFile`
 * objects wrongly decorated). This tool uses the TypeScript compiler API and the
 * type checker, so it knows what each string actually is.
 *
 * The core idea: only decorate object literals whose resolved type is in a
 * caller-provided allowlist (`--types=NodeDefinition,GraphTemplate`). That is
 * what makes it safe on data files — a nested `graph: {...}` whose type is
 * `GraphFile` is left alone, an inline nested object resolves to an anonymous
 * type and is left alone, and only real entry objects get keys. Property names
 * need no allowlist at all: every string-literal property whose name is not in
 * IDENTIFIER_PROPS is treated as copy and gets a `<prop>Key` sibling.
 *
 * Modes
 *   report (default)  print what would change; touches nothing
 *   write             apply changes
 *
 * Usage
 *   node tools/i18n-codemod.mjs report <file-or-dir> --types=A,B [--ns=x]
 *   node tools/i18n-codemod.mjs write  <file-or-dir> --types=A,B [--ns=x] [--en-out=f]
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
const TSCONFIG_DIR = 'apps/desktop';
const SKIP_DIRS = new Set(['node_modules', 'out', 'release', 'dist', 'i18n', 'generated']);
const SKIP_FILES = /\.(test|spec)\.tsx?$/;

/**
 * Property names that hold machine identifiers rather than user-visible copy.
 * Everything else with a string-literal value is treated as copy, so a new
 * display field is picked up without touching this tool.
 */
const IDENTIFIER_PROPS = new Set([
  'id', 'key', 'type', 'path', 'url', 'href', 'src', 'icon', 'color', 'category',
  'version', 'createdAt', 'updatedAt', 'runIntervalMs', 'luaTemplate', 'value',
  'className', 'hrefId', 'ref', 'mode', 'kind', 'variant', 'unit',
  // NOTE: `name` is deliberately NOT listed. It is display copy on the types in
  // the allowlist (GraphTemplate.name, GraphFile.name) and only an identifier on
  // types the allowlist already excludes, so the type filter — not the property
  // name — is what keeps it safe.
  // Not copy, despite being string literals: a data-flow direction and a code
  // default. Caught by the lua-graph pilot, which reported 151 of the former.
  'direction', 'defaultValue', 'operator', 'scope', 'target',
  // Preview sample text ('11.8V', 'ARMED') shown as a glyph preview, not copy.
  'previewText',
]);

function toKey(text) {
  return text
    .toLowerCase()
    .replace(/[#/&]/g, ' ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function isLikelyCopy(text) {
  const s = text.trim();
  if (s.length < 2) return false;
  if (!/[a-z]/.test(s)) return false;
  if (/^[\s\d.,:;+\-/%°'"()[\]{}=<>]*$/.test(s)) return false;
  return true;
}

function collectFiles(target) {
  const st = statSync(target);
  if (st.isFile()) return [target];
  const out = [];
  for (const entry of readdirSync(target)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(target, entry);
    if (statSync(full).isDirectory()) out.push(...collectFiles(full));
    else if (/\.tsx?$/.test(entry) && !SKIP_FILES.test(entry)) out.push(full);
  }
  return out;
}

function loadProgram(files) {
  const configPath = ts.findConfigFile(TSCONFIG_DIR, ts.sys.fileExists, 'tsconfig.json');
  if (!configPath) throw new Error(`no tsconfig.json under ${TSCONFIG_DIR}`);
  const cfg = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, TSCONFIG_DIR);
  return ts.createProgram(files, { ...parsed.options, noEmit: true });
}

/**
 * Resolved type name of an object literal, or null when anonymous.
 *
 * `checker.getTypeAtLocation(objLiteral)` returns the anonymous literal type, not
 * the declared interface — using it directly made this tool report zero findings
 * (caught in the lua-graph pilot). The declared type is reachable via the
 * contextual type, or via the element type of the annotated array the literal
 * sits in (`const nodes: NodeDefinition[] = [ {...} ]`).
 */
function typeNameOf(checker, node) {
  const candidates = [];
  const contextual = checker.getContextualType?.(node);
  if (contextual) candidates.push(contextual);
  const parent = node.parent;
  if (parent && ts.isArrayLiteralExpression(parent)) {
    candidates.push(checker.getTypeAtLocation(parent));
  }
  if (parent && ts.isVariableDeclaration(parent) && parent.type) {
    candidates.push(checker.getTypeAtLocation(parent.type));
  }
  for (const t of candidates) {
    for (const cand of [t, checker.getApparentType?.(t) ?? t]) {
      const sym = cand?.getSymbol?.() ?? cand?.aliasSymbol;
      const name = sym?.getName?.();
      if (name && name !== '__object') return name;
    }
  }
  return null;
}

function analyse(file, sf, checker, typeAllow, namespace) {
  const edits = [];
  const findings = [];
  const keyByText = new Map();
  const usedKeys = new Set();

  const addKey = (text) => {
    const cached = keyByText.get(text);
    if (cached) return cached;
    const base = toKey(text) || 'text';
    let key = `${namespace}.auto.${base}`;
    let n = 2;
    while (usedKeys.has(key)) key = `${namespace}.auto.${base}-${n++}`;
    usedKeys.add(key);
    keyByText.set(text, key);
    return key;
  };

  function visit(node) {
    if (ts.isObjectLiteralExpression(node)) {
      const tn = typeNameOf(checker, node);
      if (tn && typeAllow.has(tn)) {
        // Idempotency. Without this a second run decorates the keys it just
        // added (`descriptionKey` -> `descriptionKeyKey`) and emits duplicate
        // plain keys; tsc caught it, but a codemod that cannot be re-run safely
        // is a trap. Skip a property that already has its `<prop>Key` sibling,
        // and never treat a property that already ends in `Key` as copy.
        const existing = new Set();
        for (const p of node.properties) {
          if (ts.isPropertyAssignment(p)) existing.add(p.name.getText(sf));
        }
        for (const prop of node.properties) {
          if (!ts.isPropertyAssignment(prop)) continue;
          if (!ts.isStringLiteral(prop.initializer)) continue;
          const pname = prop.name.getText(sf);
          if (IDENTIFIER_PROPS.has(pname) || pname.endsWith('Key')) continue;
          if (existing.has(`${pname}Key`)) continue;
          const value = prop.initializer.text;
          if (!isLikelyCopy(value)) continue;
          const key = addKey(value);
          edits.push({ start: prop.getEnd(), end: prop.getEnd(), replacement: `, ${pname}Key: '${key}'`, text: value });
          findings.push({
            kind: `obj:${tn}.${pname}`,
            line: sf.getLineAndCharacterOfPosition(prop.getStart(sf)).line + 1,
            text: value,
            key,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return { edits, findings };
}

function applyEdits(source, edits) {
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let out = source;
  for (const e of sorted) out = out.slice(0, e.start) + e.replacement + out.slice(e.end);
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const mode = args[0] === 'write' ? 'write' : 'report';
  const target = args.find((a) => !a.startsWith('--') && a !== mode);
  const ns = (args.find((a) => a.startsWith('--ns=')) ?? '--ns=app').slice(5);
  const enOut = (args.find((a) => a.startsWith('--en-out=')) ?? '').slice(9);
  const typesArg = (args.find((a) => a.startsWith('--types=')) ?? '').slice(8);
  const typeAllow = new Set(typesArg.split(',').map((s) => s.trim()).filter(Boolean));

  if (!target || typeAllow.size === 0) {
    console.error('usage: i18n-codemod.mjs <report|write> <file-or-dir> --types=TypeA,TypeB [--ns=x] [--en-out=f]');
    process.exit(2);
  }

  const files = collectFiles(join(ROOT, target));
  const program = loadProgram(files);
  const checker = program.getTypeChecker();

  const report = { mode, namespace: ns, types: [...typeAllow], files: [], totals: { strings: 0, unique: 0 } };
  const enEntries = [];

  for (const file of files) {
    const sf = program.getSourceFile(file);
    if (!sf) continue;
    const { edits, findings } = analyse(file, sf, checker, typeAllow, ns);
    if (!findings.length) continue;
    report.files.push({ file: relative(ROOT, file), count: findings.length, findings });
    report.totals.strings += findings.length;
    for (const f of findings) enEntries.push([f.key, f.text]);
    if (mode === 'write') writeFileSync(file, applyEdits(sf.getFullText(), edits), 'utf8');
  }
  report.totals.unique = new Set(enEntries.map(([k]) => k)).size;

  if (enOut && enEntries.length) {
    const seen = new Set();
    const body = enEntries
      .filter(([k]) => (seen.has(k) ? false : (seen.add(k), true)))
      .map(([k, v]) => `      '${k}': '${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}',`)
      .join('\n');
    writeFileSync(join(ROOT, enOut), body + '\n', 'utf8');
  }

  console.log(JSON.stringify({ ...report, files: report.files.map((f) => ({ file: f.file, count: f.count })) }, null, 2));
  if (mode === 'report') {
    const detail = args.includes('--detail');
    if (detail) {
      for (const f of report.files) {
        console.log(`\n== ${f.file} ==`);
        for (const x of f.findings) console.log(`  L${x.line} ${x.kind} ${JSON.stringify(x.text).slice(0, 70)} -> ${x.key}`);
      }
    }
  }
}

main();
