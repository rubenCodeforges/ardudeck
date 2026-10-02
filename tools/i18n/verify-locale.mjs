// usage: node tools/i18n/verify-locale.mjs <lang> [ns ...]   compares a locale against en
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../apps/desktop/src/shared/i18n/locales');
const [lang, ...only] = process.argv.slice(2);
if (!lang || lang === 'en') { console.error('usage: verify-locale.mjs <lang> [ns ...]'); process.exit(2); }

const flatten = (o, p = '', out = {}) => {
  for (const [k, v] of Object.entries(o)) {
    const key = p ? `${p}.${k}` : k;
    if (typeof v === 'string') out[key] = v; else flatten(v, key, out);
  }
  return out;
};
const vars = (s) => [...s.matchAll(/\{\{\s*([\w.-]+)[^}]*\}\}/g)].map((m) => m[1]).sort().join(',');
const tags = (s) => [...s.matchAll(/<\/?([\w-]+)\s*\/?>/g)].map((m) => m[0].replace(/\s+/g, '')).sort().join(',');
const pluralBase = (k) => k.replace(/_(zero|one|two|few|many|other)$/, '');

let problems = 0;
let total = 0;
let untranslated = 0;
const namespaces = only.length ? only : fs.readdirSync(path.join(dir, 'en')).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
for (const ns of namespaces) {
  const en = flatten(JSON.parse(fs.readFileSync(path.join(dir, 'en', `${ns}.json`), 'utf8')));
  const file = path.join(dir, lang, `${ns}.json`);
  if (!fs.existsSync(file)) { console.log(`${ns}: MISSING FILE`); problems++; continue; }
  let tr;
  try { tr = flatten(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch (e) { console.log(`${ns}: INVALID JSON ${e.message}`); problems++; continue; }
  const enBases = new Set(Object.keys(en).map(pluralBase));
  for (const [k, v] of Object.entries(en)) {
    total++;
    const isPlural = k !== pluralBase(k);
    const t = tr[k];
    if (t === undefined) {
      if (isPlural && Object.keys(tr).some((x) => pluralBase(x) === pluralBase(k))) continue;
      console.log(`${ns}: missing ${k}`); problems++; continue;
    }
    if (vars(v) !== vars(t)) { console.log(`${ns}: placeholders differ ${k}\n    en: ${v}\n    ${lang}: ${t}`); problems++; }
    if (tags(v) !== tags(t)) { console.log(`${ns}: tags differ ${k}\n    en: ${v}\n    ${lang}: ${t}`); problems++; }
    if (/—/.test(t)) { console.log(`${ns}: em dash in ${k}`); problems++; }
    if (t === v && /[a-z]{4,}\s+[a-z]{3,}/i.test(v)) untranslated++;
  }
  for (const k of Object.keys(tr)) {
    if (!(k in en) && !enBases.has(pluralBase(k))) { console.log(`${ns}: extra key ${k}`); problems++; }
  }
}
console.log(`\n${lang}: ${total} en strings checked, ${problems} problem(s), ${untranslated} multi-word string(s) identical to English`);
process.exit(problems ? 1 : 0);
