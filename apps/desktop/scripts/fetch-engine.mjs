/**
 * Fetch the pinned multi-vehicle engine binary (the orchestrator) for the
 * current platform and stage it at engine/ so electron-builder bundles it
 * into the app's Resources (see the extraResources entry in package.json).
 *
 * The binary lives as a release asset on the PUBLIC rubenCodeforges/ardudeck
 * repo (tag from engine.json), so this download needs no credentials. The
 * asset's SHA-256 is verified against the release's checksums.txt before the
 * binary is written, so a tampered or truncated download can never be bundled.
 *
 * Behavior:
 *   - If engine/<binary> already exists, skip (a locally built binary wins;
 *     pass --force to re-download).
 *   - CI clean checkout has no binary, so it downloads + verifies.
 *   - --platform=<key> overrides the target (for cross-OS packaging).
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile, access, chmod } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(here, '..');
const engineDir = path.join(desktopRoot, 'engine');

// platform key -> release asset name + local binary name
const ASSETS = {
  'darwin-arm64': { asset: 'ardudeck-orchestrator-macos-arm64', out: 'ardudeck-orchestrator' },
  'darwin-x64': { asset: 'ardudeck-orchestrator-macos-x64', out: 'ardudeck-orchestrator' },
  'win32-x64': { asset: 'ardudeck-orchestrator-windows-x64.exe', out: 'ardudeck-orchestrator.exe' },
  'linux-x64': { asset: 'ardudeck-orchestrator-linux-x64', out: 'ardudeck-orchestrator' },
};

function parseArgs() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const platArg = args.find((a) => a.startsWith('--platform='));
  const key = platArg ? platArg.split('=')[1] : `${process.platform}-${process.arch}`;
  return { force, key };
}

async function fileExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function fetchBuffer(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

async function main() {
  const { force, key } = parseArgs();
  const entry = ASSETS[key];
  if (!entry) {
    console.error(`[fetch-engine] No engine binary for platform "${key}". Known: ${Object.keys(ASSETS).join(', ')}`);
    process.exit(1);
  }

  const outPath = path.join(engineDir, entry.out);
  if (!force && (await fileExists(outPath))) {
    console.log(`[fetch-engine] ${path.relative(desktopRoot, outPath)} already present, skipping (use --force to re-download).`);
    return;
  }

  const { repo, tag } = JSON.parse(await readFile(path.join(desktopRoot, 'engine.json'), 'utf8'));
  const base = `https://github.com/${repo}/releases/download/${tag}`;

  console.log(`[fetch-engine] Fetching ${entry.asset} from ${repo}@${tag} ...`);
  const [binary, checksumsText] = await Promise.all([
    fetchBuffer(`${base}/${entry.asset}`),
    fetchBuffer(`${base}/checksums.txt`).then((b) => b.toString('utf8')),
  ]);

  // checksums.txt lines are "<sha256>  <asset-name>"
  const expected = checksumsText
    .split('\n')
    .map((l) => l.trim().split(/\s+/))
    .find((parts) => parts[1] === entry.asset)?.[0];
  if (!expected) {
    throw new Error(`checksums.txt has no entry for ${entry.asset}`);
  }
  const actual = sha256(binary);
  if (actual !== expected) {
    throw new Error(`Checksum mismatch for ${entry.asset}\n  expected ${expected}\n  actual   ${actual}`);
  }

  await mkdir(engineDir, { recursive: true });
  await writeFile(outPath, binary);
  if (process.platform !== 'win32') await chmod(outPath, 0o755);
  console.log(`[fetch-engine] Verified and staged ${path.relative(desktopRoot, outPath)} (sha256 ${actual.slice(0, 12)}...).`);
}

main().catch((err) => {
  console.error(`[fetch-engine] ${err.message}`);
  console.error('[fetch-engine] The engine could not be staged; multi-vehicle mode would be unavailable in this build.');
  process.exit(1);
});
