// Finds hardcoded user-visible strings in apps/desktop/src.
//   node tools/i18n/scan.cjs check [--update-baseline]   CI guard: no new magic strings, no missing keys
//   node tools/i18n/scan.cjs file <paths...>             list remaining strings in specific files
//   node tools/i18n/scan.cjs map <outDir>                full translation map (translation-map.json, stats.json)
// Suppress a deliberate literal with an `i18n-exempt` comment on the same or previous line.
const ts = require('typescript');
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '../..');
const ROOT = path.join(REPO, 'apps/desktop/src');
const LOCALES = path.join(ROOT, 'shared/i18n/locales');
const BASELINE = path.join(__dirname, 'baseline.json');
const [MODE = 'check', ...ARGS] = process.argv.slice(2);
const OUT = ARGS[0];

const UI_ATTRS = new Set(['title', 'placeholder', 'aria-label', 'alt', 'label', 'data-tip', 'tooltip',
  'description', 'message', 'hint', 'helperText', 'emptyText', 'confirmLabel', 'cancelLabel', 'subtitle',
  'heading', 'caption', 'text', 'header', 'tip', 'summary', 'detail', 'warning', 'error', 'buttonText', 'actionLabel']);
const UI_PROPS = new Set(['label', 'title', 'description', 'message', 'hint', 'tooltip', 'placeholder',
  'subtitle', 'heading', 'caption', 'summary', 'detail', 'help', 'helpText', 'body', 'warning', 'confirmLabel',
  'cancelLabel', 'buttonLabel', 'actionLabel', 'tip', 'text', 'desc', 'short', 'long', 'reason', 'explanation',
  'emptyText', 'unitLabel', 'question', 'answer', 'cta', 'blurb', 'note', 'step', 'instructions', 'content']);
const UI_CALLS = /^(toast(\.\w+)?|showToast|notify|addToast|pushToast|alert|confirm|window\.confirm|window\.alert|setError|setStatus|setMessage|setWarning|setStatusText|setErrorMessage|showError|showMessage|announce|speak|dialog\.show\w+|new Notification)$/;
const SKIP_DIRS = /(\/__tests__\/|\.test\.|\.spec\.|\/testing\/|\/perf\/|\.d\.ts$|\/graphify-out\/|\/shared\/i18n\/)/;
// Firmware-sourced or technical: never translated (scope decision 2026-10-01).
const FIRMWARE_FILE = /(param(eter)?-metadata|px4-.*metadata|inav-\d|ap-motor-layouts|mavlink-ts|msp-ts|\/generated\/|mode-names|flight-modes?\.(ts|tsx)$|\/protocol\/|\/decoders?\/)/i;

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'graphify-out') walk(p, acc); }
    else if (/\.(tsx?|)$/.test(e.name) && /\.tsx?$/.test(e.name) && !SKIP_DIRS.test(p)) acc.push(p);
  }
  return acc;
}

const isHuman = (s) => {
  const t = s.replace(/&[a-z]+;|&#\d+;/gi, ' ').trim();
  if (t.length < 2 || !/[A-Za-z]{2}/.test(t)) return false;
  if (/^https?:|^\/|^#[0-9a-f]{3,8}$|^\.\/|^[\w-]+\.(json|ts|tsx|png|svg|lua|bin|hex|apj|param|bin)$/i.test(t)) return false;
  if (/^[a-z][a-zA-Z0-9]*$/.test(t)) return false;          // camelCase identifier / keyword
  if (/^[a-z0-9]+([-_:.][a-z0-9]+)+$/.test(t)) return false; // kebab/snake/ids/event names
  if (/^[A-Z0-9_]+$/.test(t)) return false;                  // PARAM_NAME / ENUM / MODE
  if (/^(\w+-)?(flex|grid|text|bg|border|p[xytrbl]?|m[xytrbl]?|w|h|gap|rounded|items|justify|font|hover|absolute|relative)[-:\[]/.test(t)) return false; // tailwind
  if (/^[\d\s.,:%°+\-/x×()]+[a-zA-Z]{0,3}$/.test(t) && !/[a-z]{3}/i.test(t)) return false;
  if (/^(GET|POST|PUT|DELETE|utf-?8|base64|hex|ascii|json|application\/)/i.test(t)) return false;
  return true;
};

function areaOf(file) {
  const rel = path.relative(ROOT, file).split(path.sep);
  if (rel[0] === 'main') return 'main';
  if (rel[0] === 'shared') return 'shared';
  if (rel[0] === 'renderer') {
    if (rel[1] === 'components' && rel.length > 3) return rel[2];
    if (rel[1] === 'components') return 'common';
    if (['modules', 'feature-tours', 'guides', 'area-editor', 'detached', 'safety-monitor'].includes(rel[1])) return rel[1];
    return rel[1].replace(/\.tsx?$/, '') === 'App' ? 'app' : rel[1];
  }
  return rel[0];
}

const entries = [];
const residuals = [];
const seenPos = new Set();
let filesScanned = 0, firmwareSkipped = 0;

function templateText(node, sf) {
  if (ts.isNoSubstitutionTemplateLiteral(node)) return { text: node.text, vars: [] };
  let text = node.head.text; const vars = [];
  for (const span of node.templateSpans) {
    let name = span.expression.getText(sf).replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').split('_').pop() || 'value';
    if (vars.includes(name)) name += vars.length;
    vars.push(name); text += `{{${name}}}` + span.literal.text;
  }
  return { text, vars };
}

const linesCache = new WeakMap();
function exempt(sf, node) {
  if (!linesCache.has(sf)) linesCache.set(sf, sf.text.split('\n'));
  const lines = linesCache.get(sf);
  const first = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
  const last = sf.getLineAndCharacterOfPosition(node.getEnd()).line;
  for (let l = Math.max(0, first - 1); l <= last; l++) if (/i18n-exempt/.test(lines[l] || '')) return true;
  return false;
}

function record(file, sf, node, text, kind, extra = {}) {
  if (exempt(sf, node)) return;
  const norm = text.replace(/\s+/g, ' ').trim();
  if (!isHuman(norm.replace(/\{\{\w+\}\}/g, ''))) return;
  seenPos.add(file + ':' + node.getStart(sf));
  const mark = (c) => { seenPos.add(file + ':' + c.getStart(sf)); ts.forEachChild(c, mark); };
  ts.forEachChild(node, mark);
  const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  entries.push({ area: areaOf(file), text: norm, kind, file: path.relative(ROOT, file), line: line + 1, ...extra });
}

function stringOf(node, sf) {
  if (!node) return null;
  if (ts.isStringLiteral(node)) return { text: node.text, vars: [] };
  if (ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) return templateText(node, sf);
  return null;
}

const FILES = MODE === 'file' ? ARGS.map((a) => path.resolve(a)) : walk(ROOT);
for (const file of FILES) {
  if (FIRMWARE_FILE.test(file)) { firmwareSkipped++; continue; }
  filesScanned++;
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const isMain = file.includes('/src/main/');

  const visit = (node) => {
    // JSX text children
    if (ts.isJsxText(node)) {
      const parent = node.parent;
      const mixed = parent && parent.children && parent.children.some((c) => ts.isJsxExpression(c) && c.expression);
      record(file, sf, node, node.text, 'jsx-text', mixed ? { mixed: true } : {});
    }
    // {'literal'} / {`tmpl`} as JSX child
    else if (ts.isJsxExpression(node) && node.expression && node.parent && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      const s = stringOf(node.expression, sf);
      if (s) record(file, sf, node, s.text, 'jsx-expr', s.vars.length ? { vars: s.vars } : {});
      if (node.expression && ts.isConditionalExpression(node.expression)) {
        for (const b of [node.expression.whenTrue, node.expression.whenFalse]) {
          const sb = stringOf(b, sf); if (sb) record(file, sf, b, sb.text, 'jsx-cond', sb.vars.length ? { vars: sb.vars } : {});
        }
      }
    }
    // JSX attributes
    else if (ts.isJsxAttribute(node) && node.initializer) {
      const name = node.name.getText(sf);
      if (UI_ATTRS.has(name)) {
        const init = node.initializer;
        const s = ts.isStringLiteral(init) ? { text: init.text, vars: [] } : (ts.isJsxExpression(init) ? stringOf(init.expression, sf) : null);
        if (s) record(file, sf, node, s.text, `attr:${name}`, s.vars.length ? { vars: s.vars } : {});
        if (ts.isJsxExpression(init) && init.expression && ts.isConditionalExpression(init.expression)) {
          for (const b of [init.expression.whenTrue, init.expression.whenFalse]) {
            const sb = stringOf(b, sf); if (sb) record(file, sf, b, sb.text, `attr:${name}`, sb.vars.length ? { vars: sb.vars } : {});
          }
        }
      }
    }
    // object literal UI props: { label: 'Arm', description: '...' }
    else if (ts.isPropertyAssignment(node) && node.name && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))) {
      const name = node.name.text;
      if (UI_PROPS.has(name)) {
        const s = stringOf(node.initializer, sf);
        if (s) record(file, sf, node, s.text, `prop:${name}`, s.vars.length ? { vars: s.vars } : {});
      }
      // electron menu / dialog in main
      if (isMain && ['label', 'title', 'message', 'detail', 'buttonLabel', 'body'].includes(name) === false && name === 'buttons' && ts.isArrayLiteralExpression(node.initializer)) {
        for (const el of node.initializer.elements) { const s = stringOf(el, sf); if (s) record(file, sf, el, s.text, 'dialog-button'); }
      }
    }
    // toast/alert/setError('...') and throw new Error('...') surfaced in UI
    else if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const callee = node.expression.getText(sf);
      const name = ts.isNewExpression(node) ? `new ${callee}` : callee;
      if (UI_CALLS.test(name) && node.arguments && node.arguments.length) {
        const s = stringOf(node.arguments[0], sf);
        if (s) record(file, sf, node, s.text, `call:${name}`, s.vars.length ? { vars: s.vars } : {});
        if (node.arguments[0] && ts.isConditionalExpression(node.arguments[0])) {
          for (const b of [node.arguments[0].whenTrue, node.arguments[0].whenFalse]) {
            const sb = stringOf(b, sf); if (sb) record(file, sf, b, sb.text, `call:${name}`, sb.vars.length ? { vars: sb.vars } : {});
          }
        }
      }
      if (ts.isNewExpression(node) && /^\w*Error$/.test(callee) && node.arguments && node.arguments[0]) {
        const s = stringOf(node.arguments[0], sf);
        if (s) record(file, sf, node, s.text, 'error', s.vars.length ? { vars: s.vars } : {});
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  const resid = (node) => {
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && !seenPos.has(file + ':' + node.getStart(sf))) {
      const t = node.text.trim();
      const p = node.parent;
      const inImport = p && (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p));
      const inClass = p && ts.isJsxAttribute(p) && /^(className|style|key|id|type|name|href|src|variant|color|to)$/.test(p.name.getText(sf));
      const inLog = p && ts.isCallExpression(p) && /console\.|log\.|logger\.|debug\(|sendLog$|appendLog$/.test(p.expression.getText(sf));
      if (!inImport && !inClass && !inLog && !exempt(sf, node) && /^[A-Z][a-z']+([ ,][A-Za-z'(][\w'().,%/-]*){1,}[.!?:]?$/.test(t) && isHuman(t)) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        residuals.push({ area: areaOf(file), text: t, file: path.relative(ROOT, file), line: line + 1, ctx: p ? ts.SyntaxKind[p.kind] : '', pname: p && (ts.isPropertyAssignment(p) || ts.isJsxAttribute(p)) ? p.name.getText(sf) : (p && ts.isCallExpression(p) ? p.expression.getText(sf).slice(0,40) : (p && p.parent && ts.isJsxAttribute(p.parent) ? 'attr>' + p.parent.name.getText(sf) : (p && p.parent && ts.isJsxExpression(p.parent) && p.parent.parent && ts.isJsxAttribute(p.parent.parent) ? 'attr>' + p.parent.parent.name.getText(sf) : ''))) });
      }
    }
    ts.forEachChild(node, resid);
  };
  resid(sf);
}

for (const r of residuals) entries.push({ area: r.area, text: r.text.replace(/\s+/g, ' '), kind: `residual:${r.ctx}${r.pname ? ':' + r.pname : ''}`, file: r.file, line: r.line, residual: true });

// Keys: namespace = area; strings used in >= 3 areas promoted to `common`.
const areasByText = new Map();
for (const e of entries) {
  if (!areasByText.has(e.text)) areasByText.set(e.text, new Set());
  areasByText.get(e.text).add(e.area);
}
const slug = (t) => {
  const words = t.replace(/\{\{(\w+)\}\}/g, ' $1 ').replace(/[^A-Za-z0-9 ]+/g, ' ').trim().split(/\s+/).slice(0, 6);
  const s = words.map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())).join('');
  return s || 'text';
};
const map = {};
const keyOf = new Map();
for (const e of entries) {
  const ns = areasByText.get(e.text).size >= 3 ? 'common' : e.area;
  const id = `${ns}\u0000${e.text}`;
  if (!keyOf.has(id)) {
    map[ns] ??= {};
    let k = slug(e.text), n = 2;
    while (map[ns][k] && map[ns][k].en !== e.text) k = `${slug(e.text)}${n++}`;
    const brand = /^(Jumper|RadioMaster|Radiomaster|TBS|FrSky|Matek|Holybro|Pixhawk|CubePilot|Cube |Betaflight|INAV|iNav|ExpressLRS|ELRS|EdgeTX|OpenTX|SpeedyBee|Kakute|Herelink|Siyi|SIYI|DJI|Walksnail|HDZero|Skydroid|mRo|Durandal|Pix32|BetaFPV|Flywoo|Happymodel|ArduPilot|PX4|QGroundControl|Mission Planner)\b/.test(e.text) && e.text.split(' ').length <= 4;
    const dev = e.kind === 'error' && (/[A-Za-z]+\.[a-zA-Z]+[:(]|\[module:|must be run|\b[a-z]+[A-Z]\w*\b|=\{\{/.test(e.text));
    const board = /^(Matek|Omnibus|SpeedyBee|Kakute|Holybro|Mamba|Diatone|JHEMCU|Foxeer|CUAV|Pixracer|Pixhawk|Cube|Durandal|MicoAir|Flywoo|BetaFPV|Aocoda|Zeez|GEPRC|iFlight|T-Motor|Airbot|Skystars|Sequre|Radix|Brain|Revo|MRo|mRo|KakuteH7|SoloGood|TBS|NxtPX4|Hex|Here\d|Jumper|RadioMaster)\b/.test(e.text) && e.text.split(' ').length <= 4;
    const fw = e.kind.startsWith('residual:PropertyAssignment:') && /^['"]?[A-Z][A-Z0-9]*_[A-Z0-9_]*['"]?$/.test(e.kind.split(':').slice(2).join(':'));
    const tier = fw ? 'firmware' : brand || board ? 'brand' : e.residual ? 'review' : dev ? 'internal' : e.kind === 'error' ? 'error-review' : 'ui';
    map[ns][k] = { en: e.text, tier, kinds: [], vars: e.vars || [], mixedJsx: false, refs: [] };
    keyOf.set(id, k);
  }
  const item = map[ns][keyOf.get(id)];
  if (!item.kinds.includes(e.kind)) item.kinds.push(e.kind);
  if (e.mixed) item.mixedJsx = true;
  item.refs.push(`${e.file}:${e.line}`);
}

// Sort namespaces and keys for stable diffs.
const sorted = {};
for (const ns of Object.keys(map).sort()) {
  sorted[ns] = {};
  for (const k of Object.keys(map[ns]).sort()) sorted[ns][k] = map[ns][k];
}
const enOnly = {};
for (const ns of Object.keys(sorted)) { enOnly[ns] = {}; for (const k of Object.keys(sorted[ns])) if (['ui','error-review'].includes(sorted[ns][k].tier)) enOnly[ns][k] = sorted[ns][k].en; }

const stats = Object.keys(sorted).map((ns) => {
  const items = Object.values(sorted[ns]).filter((i) => i.tier === 'ui' || i.tier === 'review' || i.tier === 'error-review');
  const files = new Set(items.flatMap((i) => i.refs.map((r) => r.split(':')[0])));
  return { ns, keys: items.length, words: items.reduce((a, i) => a + i.en.split(/\s+/).length, 0), files: files.size,
    interpolated: items.filter((i) => i.vars.length).length, mixedJsx: items.filter((i) => i.mixedJsx).length };
}).sort((a, b) => b.keys - a.keys);

const TRANSLATABLE = new Set(['ui', 'review', 'error-review']);
const pending = [];
for (const ns in sorted) for (const k in sorted[ns]) {
  const it = sorted[ns][k];
  if (TRANSLATABLE.has(it.tier)) for (const ref of it.refs) pending.push({ ref, tier: it.tier, en: it.en });
}

if (MODE === 'file') {
  pending.sort((a, b) => a.ref.localeCompare(b.ref, undefined, { numeric: true }));
  for (const p of pending) console.log(`${p.ref}  [${p.tier}]  ${p.en}`);
  console.log(`${pending.length} hardcoded string(s) left`);
  process.exit(0);
}

if (MODE === 'map') {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'translation-map.json'), JSON.stringify(sorted, null, 2));
  fs.writeFileSync(path.join(OUT, 'stats.json'), JSON.stringify({ filesScanned, firmwareSkipped, occurrences: entries.length, stats }, null, 2));
  const tot = stats.reduce((a, s) => ({ keys: a.keys + s.keys, words: a.words + s.words }), { keys: 0, words: 0 });
  const tierCount = {}; for (const ns in sorted) for (const k in sorted[ns]) tierCount[sorted[ns][k].tier] = (tierCount[sorted[ns][k].tier] || 0) + 1;
  console.log('tiers', JSON.stringify(tierCount));
  console.log(`files ${filesScanned}, unique translatable ${tot.keys}, words ${tot.words}, namespaces ${stats.length}`);
  for (const s of stats) console.log(`${s.ns.padEnd(22)} ${String(s.keys).padStart(5)} keys ${String(s.words).padStart(6)} words ${String(s.files).padStart(4)} files`);
  process.exit(0);
}

// check: hardcoded strings may only shrink, and every referenced key must exist in en.
const perFile = {};
for (const p of pending) { const f = p.ref.split(':')[0]; perFile[f] = (perFile[f] || 0) + 1; }
if (ARGS.includes('--update-baseline')) {
  fs.writeFileSync(BASELINE, JSON.stringify(Object.fromEntries(Object.entries(perFile).sort()), null, 2) + '\n');
  console.log(`baseline written: ${pending.length} strings in ${Object.keys(perFile).length} files`);
  process.exit(0);
}
const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : {};
let failed = false;
for (const [f, n] of Object.entries(perFile)) {
  if (n > (baseline[f] || 0)) {
    failed = true;
    console.log(`\n${f}: ${n} hardcoded strings (baseline ${baseline[f] || 0})`);
    for (const p of pending.filter((x) => x.ref.startsWith(f + ':'))) console.log(`  ${p.ref}  ${p.en}`);
  }
}

const en = {};
const enDir = path.join(LOCALES, 'en');
for (const f of fs.existsSync(enDir) ? fs.readdirSync(enDir) : []) {
  if (f.endsWith('.json')) en[f.replace(/\.json$/, '')] = JSON.parse(fs.readFileSync(path.join(enDir, f), 'utf8'));
}
const lookup = (ns, key) => {
  let node = en[ns];
  for (const part of key.split('.')) { if (!node || typeof node !== 'object') return undefined; node = node[part]; }
  return node;
};
const has = (ns, key) => [ '', '_one', '_other', '_zero' ].some((suf) => lookup(ns, key + suf) !== undefined);
const KEY_RE = /(?:\bt\(\s*|i18nKey=\{?\s*)['"`]([\w-]+):([\w.-]+)['"`]/g;
let missing = 0;
for (const file of walk(ROOT)) {
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(KEY_RE)) {
    if (!has(m[1], m[2])) {
      missing++;
      const line = src.slice(0, m.index).split('\n').length;
      console.log(`missing key ${m[1]}:${m[2]}  ${path.relative(ROOT, file)}:${line}`);
    }
  }
}
for (const lang of fs.readdirSync(LOCALES)) {
  if (lang === 'en') continue;
  for (const f of fs.readdirSync(path.join(LOCALES, lang))) {
    const other = JSON.parse(fs.readFileSync(path.join(LOCALES, lang, f), 'utf8'));
    const base = en[f.replace(/\.json$/, '')] || {};
    for (const k of Object.keys(other)) if (!(k in base)) console.log(`stale key ${lang}/${f}: ${k}`);
  }
}
if (missing) failed = true;
console.log(`\n${pending.length} hardcoded strings left (baseline ${Object.values(baseline).reduce((a, b) => a + b, 0)}), ${missing} missing keys`);
process.exit(failed ? 1 : 0);
