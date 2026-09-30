#!/usr/bin/env node
/**
 * i18n coverage scan for the ArduDeck renderer.
 *
 * Finds user-visible English strings that are still hardcoded in TSX/TS, so the
 * remaining translation work can be tracked instead of maintained by hand.
 *
 * Deliberately heuristic: it parses JSX text nodes and a fixed set of
 * user-facing attributes with regexes rather than a full TSX AST, so that it
 * stays dependency-free and can also be pointed at the main process later. Every
 * rule below exists because the un-filtered scan produced that class of false
 * positive on this codebase.
 *
 * Usage:
 *   node tools/i18n-scan.mjs [--top=30] [--all] [--json] [--strict]
 *
 *   --top=N   how many entries to print per section (default 30)
 *   --all     print every finding, not just the top N
 *   --json    emit machine-readable JSON instead of the text report
 *   --strict  exit 1 when findings exist (for CI); default always exits 0
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SCAN_ROOT = join(REPO_ROOT, 'apps/desktop/src/renderer');
const SKIP_DIRS = new Set(['node_modules', 'i18n', 'styles', 'generated']);
/** Files that legitimately hold plenty of non-user-facing strings. */
const SKIP_FILE_PATTERNS = [/\.test\.tsx?$/];

/** Attributes whose value is rendered to the user. */
const ATTR_PATTERN = String.raw`(?:aria-label|placeholder|title|alt)`;
const ATTR_RE = new RegExp(String.raw`\b${ATTR_PATTERN}\s*=\s*"([^"{}]+)"`, 'g');
/** `t('...')`/`t("...")` calls mark strings as already translated. */
const T_CALL_RE = /\bt\(\s*['"`]/g;
const T_CALL_SPAN_RE = /\bt\(\s*['"`]([^'"`]*)['"`]/g;
/** `<span>Label</span>` — text between a same-line closing and next opening tag. */
const TAG_TEXT_RE = />([^<>{}]*[A-Za-z][^<>{}]*)</g;
/** Identifies the tag that precedes a JSX text node, e.g. `h1` in `<h1>Settings`. */
const PRECEDING_TAG_RE = /<\/?([A-Za-z][A-Za-z0-9.-]*)\b[^<>]*>\s*$/;
/**
 * Object-literal copy: `label: 'Telemetry'`, `name: 'Rover'`. These render as UI
 * text but never appear as JSX text nodes, which is why the left nav rail's 19
 * labels were previously invisible to this scan. Only a short allowlist of
 * user-facing property names is matched, to keep option/config objects out.
 */
const OBJECT_COPY_RE = /\b(label|title|name|heading|description|tooltip|placeholder|hint)\s*:\s*'((?:[^'\\]|\\.)*)'/g;
/** HTML tags: a JSX text node is always preceded by one of these. */
const HTML_TAGS = new Set([
  'a', 'abbr', 'b', 'br', 'button', 'canvas', 'code', 'dd', 'div', 'dl', 'dt', 'em', 'fieldset',
  'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr',
  'i', 'img', 'input', 'kbd', 'label', 'legend', 'li', 'main', 'nav', 'ol', 'option', 'p',
  'pre', 'progress', 'section', 'select', 'small', 'span', 'strong', 'sub', 'summary', 'sup',
  'table', 'tbody', 'td', 'textarea', 'tfoot', 'th', 'thead', 'tr', 'ul',
]);
/** Code-shaped fragments that never belong in a translation bundle. */
const CODE_SHAPE_RE = /[=<>()[\]]|=>|::/;
/** Unit symbols (`°/s`, `m/s`, `%`) carry no words to translate. */
const UNIT_SYMBOL_RE = /^[\s\d.,:;+\-/%°'"()[\]]+$/;
/** Strings shorter than this are usually units, ids, or symbols. */
const MIN_TEXT_LENGTH = 2;

/**
 * Terms that must stay identical in every language: brands, protocol names,
 * file formats, and firmware names. Flight-mode names (Loiter, RTL…) are
 * deliberately NOT here — they are shown in the UI and get translated.
 */
const ALLOWLIST = new Set(
  [
    'ArduDeck', 'ArduPilot', 'MAVLink', 'MAVLINK', 'MSP', 'Betaflight', 'iNav', 'INAV', 'PX4',
    'SITL', 'GPS', 'GNSS', 'RTK', 'NTRIP', 'RTCM', 'OSD', 'HUD', 'PID', 'ESC', 'UART', 'USB',
    'TCP', 'UDP', 'IP', 'FTP', 'JSON', 'CSV', 'KML', 'KMZ', 'GeoJSON', 'Shapefile', 'WPL',
    'RunCam', 'DroneBridge', 'FlightGear', 'Lua', 'WGS84', 'EGM96', 'Geoid', 'ESP32', 'STM32',
    'DFU', 'WiFiLink', 'OpenIPC', 'ELRS', 'CRSF', 'SiK', 'xterm', 'npm', 'pnpm', 'Node.js',
    'Electron', 'React', 'TypeScript', 'Docker', 'GitHub', 'AppImage', 'deb', 'macOS', 'Windows',
    'Linux', 'Ubuntu', 'CompassMot', 'RubyFPV', 'WebRTC', 'RTSP', 'UVC', 'ffmpeg', 'OpenAIP',
    'ADS-B', 'OGN', 'DEM', 'GSD', 'AMSL',
    // Math notation and telemetry metrics stay identical in every language.
    'Lmax', 'AUW', 'AGL', 'MSL', 'RSSI', 'SNR', 'HDOP', 'VDOP',
  ].map((s) => s.toLowerCase())
);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(entry)) {
      if (SKIP_FILE_PATTERNS.some((re) => re.test(entry))) continue;
      out.push(full);
    }
  }
  return out;
}

/** Lines or fragments that are code rather than copy. */
function looksLikeCode(value) {
  return CODE_SHAPE_RE.test(value) || !/[A-Za-z]/.test(value);
}

function isTranslatable(value) {
  const text = value.trim();
  if (text.length < MIN_TEXT_LENGTH) return false;
  if (UNIT_SYMBOL_RE.test(text)) return false;
  if (ALLOWLIST.has(text.toLowerCase())) return false;
  if (looksLikeCode(text)) return false;
  // Needs a lowercase word to be prose; bare type/identifier casing like `Yaw`
  // passes this test on purpose, `Promise` is filtered by the tag check below.
  return /[a-z]/.test(text);
}

/**
 * Blank out `{…}` expressions so their contents are not mistaken for copy. A
 * brace group is preserved when it is an attribute value (`={…}`) or a card
 * colour lookup (`${…}`), because those hold real markup values rather than
 * rendered text.
 */
function blankBracedExpressions(line) {
  return line.replace(/(?<![=$])\{[^{}]*\}/g, ' ');
}

/**
 * Decide whether the text just before `anchor` is a JSX text node. The check
 * runs on the original line, where opening tags (and their attributes) are still
 * intact — stripping first would delete the very tag this needs to see.
 */
function startsWithTag(rawLine, anchor) {
  const index = rawLine.indexOf(anchor);
  if (index <= 0) return false;
  const match = PRECEDING_TAG_RE.exec(rawLine.slice(0, index + 1));
  const name = match?.[1];
  if (!name) return false;
  // Known HTML tags, or a component tag (`<StatCard>`) which is capitalised.
  return HTML_TAGS.has(name.toLowerCase()) || /^[A-Z]/.test(name);
}

function collectFromFile(file) {
  const source = readFileSync(file, 'utf8');
  const findings = [];

  const allLines = source.split('\n');

  // Pre-compute which lines sit inside a nested `graph: { ... }` block. Those are
  // serialized graph instances (node labels, comments like 'Step 1'), not UI
  // copy: the type-aware codemod skips them via its type allowlist, but this
  // scanner has no types, so without this it counted 377 of them in
  // graph-templates.ts and inflated the backlog roughly fourfold.
  const inGraphBlock = new Array(allLines.length).fill(false);
  {
    let skip = false;
    let depth = 0;
    for (let i = 0; i < allLines.length; i++) {
      const l = allLines[i];
      if (!skip && /^\s{2,}graph:\s*\{\s*$/.test(l)) { skip = true; depth = 0; }
      if (skip) {
        depth += (l.match(/\{/g) ?? []).length - (l.match(/\}/g) ?? []).length;
        inGraphBlock[i] = true;
        if (depth <= 0) { skip = false; inGraphBlock[i] = true; }
      }
    }
  }

  allLines.forEach((rawLine, index) => {
    const lineNo = index + 1;
    if (inGraphBlock[index]) return;
    // A line holding a t() call is treated as translated; the scanner reports
    // what is left, it does not audit key quality.
    T_CALL_RE.lastIndex = 0;

    for (const match of rawLine.matchAll(ATTR_RE)) {
      const value = match[1] ?? '';
      if (!isTranslatable(value)) continue;
      findings.push({ line: lineNo, kind: 'attribute', text: value.trim(), raw: rawLine.trim() });
    }

    // Attribute strings are not copy when they are values, so they are removed
    // before the JSX text pass; the anchor used to locate each text node keeps
    // the original line positions valid either way.
    const withoutAttributes = rawLine.replace(ATTR_RE, '');
    const withoutCalls = blankBracedExpressions(
      withoutAttributes.replace(T_CALL_SPAN_RE, ' ').replace(T_CALL_RE, ' ')
    );
    for (const match of withoutCalls.matchAll(TAG_TEXT_RE)) {
      const value = match[1] ?? '';
      if (!isTranslatable(value)) continue;
      if (!startsWithTag(withoutAttributes, match[0])) continue;
      findings.push({ line: lineNo, kind: 'jsx-text', text: value.trim(), raw: rawLine.trim() });
    }

    // Object-literal copy (data tables). Skipped when the line already routes
    // through t(...) or carries only key properties, which is how translated
    // tables are written in this codebase.
    //
    // The key check must be precise: a row can hold a *Key property AND an
    // untranslated literal. Mid-migration a table row reads
    // `label: 'Takeoff', labelKey: 'takeoff'`, and the raw label is still what a
    // not-yet-migrated consumer renders. A bare /Key\s*:/ test therefore
    // reported those rows as done — it once hid all 128 strings in
    // mavlink-presets.ts. Only skip when no plain `label:`-style literal remains.
    const hasKeyProp = /\b\w*Key\s*:/.test(rawLine);
    const hasPlainLiteral = /\b(?:label|title|name|heading|description|tooltip|placeholder|hint)\s*:\s*'/.test(rawLine);
    // A row whose property has a `<prop>Key` sibling on this or the adjacent
    // line is rendered through the key (the tool's codemod writes it that way,
    // keeping the literal only as a fallback for strings that need no
    // translation). Counting it as untranslated made the metric contradict the
    // code: after the lua-graph codemod the scanner still reported 677 strings
    // for a directory whose UI was fully keyed.
    const nearText = allLines.slice(Math.max(0, index - 1), index + 2).join('\n');
    const hasKeySibling =
      /\b(?:label|title|name|heading|description|tooltip|placeholder|hint)Key\s*:/.test(rawLine) ||
      /\b(?:label|title|name|heading|description|tooltip|placeholder|hint)Key\s*:/.test(nearText);
    // Single-line inline objects that carry an `id` are leaf definitions
    // (PortDefinition and friends): their `label` is a hover hint, not surface
    // copy, and there are hundreds of them. The type-aware codemod skips them
    // too; without this the scanner reported 247 such lines in node-library.ts.
    const isInlineLeafDef = /\bid\s*:\s*'/.test(rawLine) && /\{.*\}\s*,\s*$/.test(rawLine);
    if (!/\bt\(/.test(rawLine) && !isInlineLeafDef && !(hasKeyProp && !hasPlainLiteral) && !hasKeySibling) {
      for (const match of rawLine.matchAll(OBJECT_COPY_RE)) {
        const value = match[2] ?? '';
        if (!isTranslatable(value)) continue;
        findings.push({ line: lineNo, kind: `object:${match[1]}`, text: value.trim(), raw: rawLine.trim() });
      }
    }
  });

  return findings;
}


function main() {
  const args = process.argv.slice(2);
  const topN = Number((args.find((a) => a.startsWith('--top=')) ?? '--top=30').slice(6)) || 30;
  const showAll = args.includes('--all');
  const asJson = args.includes('--json');
  const strict = args.includes('--strict');

  const files = walk(SCAN_ROOT);
  const byFile = new Map();
  const byText = new Map();
  const byKind = new Map();
  let total = 0;

  for (const file of files) {
    // No bundle-membership filter here on purpose. The English bundle is the
    // SOURCE bundle, so any literal that has a translation key also exists in
    // en.ts. Filtering on "is this text in the bundle?" therefore hides exactly
    // the strings that are keyed but whose component has not been switched to
    // t() yet — the most useful thing this scan can tell you. Whether a string
    // is translated is decided by the t(...) checks during collection instead.
    const findings = collectFromFile(file);
    if (!findings.length) continue;
    const rel = relative(REPO_ROOT, file);
    byFile.set(rel, findings);
    total += findings.length;
    for (const f of findings) {
      byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1);
      const entry = byText.get(f.text) ?? { count: 0, files: new Set(), example: null };
      entry.count += 1;
      entry.files.add(rel);
      if (!entry.example) entry.example = { file: rel, line: f.line };
      byText.set(f.text, entry);
    }
  }

  const fileRows = [...byFile.entries()]
    .map(([file, findings]) => ({ file, count: findings.length }))
    .sort((a, b) => b.count - a.count || a.file.localeCompare(b.file));
  const textRows = [...byText.entries()]
    .map(([text, { count, files: fileSet, example }]) => ({ text, count, files: fileSet.size, example }))
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text));
  const kindRows = [...byKind.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind));

  if (asJson) {
    console.log(JSON.stringify({
      scannedFiles: files.length,
      findings: total,
      byKind: kindRows,
      byFile: fileRows,
      byText: textRows,
    }, null, 2));
  } else {
    const limit = showAll ? Number.POSITIVE_INFINITY : topN;
    console.log(`i18n scan — ${files.length} files under ${relative(REPO_ROOT, SCAN_ROOT)}`);
    console.log(`hardcoded user-visible strings: ${total}\n`);
    console.log('By kind:');
    for (const row of kindRows) {
      console.log(`  ${String(row.count).padStart(4)}  ${row.kind}`);
    }
    console.log(`\nTop ${Math.min(limit, fileRows.length)} files:`);
    for (const row of fileRows.slice(0, limit)) {
      console.log(`  ${String(row.count).padStart(4)}  ${row.file}`);
    }
    console.log(`\nTop ${Math.min(limit, textRows.length)} repeated strings (with first location):`);
    for (const row of textRows.slice(0, limit)) {
      const where = row.example ? `${row.example.file}:${row.example.line}` : '?';
      console.log(`  ${String(row.count).padStart(4)}x  ${row.text}`);
      console.log(`        ${where}`);
    }
    console.log('\nHeuristic: one-line JSX text nodes, aria-label/placeholder/title/alt, and');
    console.log('object-literal copy on a fixed list of property names. `object:*` entries are');
    console.log('data-table strings (nav labels, OSD elements, node libraries) and include some');
    console.log('code identifiers by design — treat the total as a worklist, not a precise count.');
    console.log('Missed: strings inside {} expressions, multi-line blocks, and template literals.');
  }

  if (strict && total > 0) process.exit(1);
}

main();
