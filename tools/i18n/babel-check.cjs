const { parse } = require(require.resolve('@babel/parser', { paths: [require('path').join(__dirname, '../../node_modules/.pnpm/node_modules')] }));
const fs = require('fs'), path = require('path');
const root = process.argv[2];
const walk = (d, a = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!['node_modules','graphify-out'].includes(e.name)) walk(p, a); } else if (/\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) a.push(p); } return a; };
let bad = 0;
for (const f of walk(root)) {
  try { parse(fs.readFileSync(f, 'utf8'), { sourceType: 'module', plugins: ['typescript', 'deprecatedImportAssert', ...(f.endsWith('x') ? ['jsx'] : [])] }); }
  catch (e) { bad++; console.log(path.relative(root, f) + ': ' + e.message); }
}
console.log(bad + ' babel parse error(s)');
