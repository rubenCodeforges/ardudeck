// usage: node tools/i18n/add-keys.mjs <ns> '{"safetyTab.title":"Safety"}' | keys.json  (locked, refuses conflicting values)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(here, '../../apps/desktop/src/shared/i18n/locales/en');
const [ns, input] = process.argv.slice(2);
if (!ns || !input || !/^[a-z0-9-]+$/.test(ns)) {
  console.error('usage: add-keys.mjs <ns> <json | file.json>');
  process.exit(2);
}
const additions = JSON.parse(fs.existsSync(input) ? fs.readFileSync(input, 'utf8') : input);

const lock = path.join(dir, `.${ns}.lock`);
fs.mkdirSync(dir, { recursive: true });
const deadline = Date.now() + 30_000;
for (;;) {
  try { fs.mkdirSync(lock); break; } catch {
    if (Date.now() > deadline) { console.error(`lock timeout: ${lock}`); process.exit(1); }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
  }
}

try {
  const file = path.join(dir, `${ns}.json`);
  const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  const conflicts = [];
  let added = 0;
  for (const [key, value] of Object.entries(additions)) {
    if (typeof value !== 'string') { conflicts.push(`${key}: value must be a string`); continue; }
    const parts = key.split('.');
    let node = data;
    let blocked = false;
    for (const part of parts.slice(0, -1)) {
      if (node[part] === undefined) node[part] = {};
      if (typeof node[part] !== 'object') { conflicts.push(`${key}: "${part}" is already a string`); blocked = true; break; }
      node = node[part];
    }
    if (blocked) continue;
    const leaf = parts[parts.length - 1];
    if (node[leaf] === undefined) { node[leaf] = value; added++; }
    else if (node[leaf] !== value) conflicts.push(`${key}: exists as ${JSON.stringify(node[leaf])}`);
  }
  const sort = (o) => (typeof o === 'string' ? o : Object.fromEntries(Object.keys(o).sort().map((k) => [k, sort(o[k])])));
  fs.writeFileSync(file, JSON.stringify(sort(data), null, 2) + '\n');
  console.log(`${ns}: +${added} key(s)`);
  if (conflicts.length) {
    console.error(`conflicts (pick another key or reuse the existing one):\n  ${conflicts.join('\n  ')}`);
    process.exitCode = 1;
  }
} finally {
  fs.rmdirSync(lock);
}
