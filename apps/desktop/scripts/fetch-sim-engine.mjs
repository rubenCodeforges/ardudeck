/**
 * Stage the ardudeck-sim-engine binary for the current platform so
 * electron-builder bundles it (extraResources: sim-engine-bin -> Resources/sim-engine).
 * If a locally built binary already exists at sim-engine-bin/<out>, it wins (skip).
 * Otherwise download the pinned release asset and verify its SHA-256.
 *
 * Downloads go through `gh release download` (same as fetch-engine.mjs) so
 * DRAFT releases work: the engine releases are kept as drafts on purpose so
 * they never show up in the public releases list, and draft assets 404 on the
 * plain releases/download URL. `gh` picks up GH_TOKEN/GITHUB_TOKEN in CI or
 * the local `gh auth login` on a dev machine.
 */
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile, readFile, access, chmod } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const execFileP = promisify(execFile);

/**
 * On macOS a downloaded/copied Mach-O binary loses its code signature and
 * carries a quarantine flag, so the kernel SIGKILLs it ("Killed: 9") on the
 * first real run. Strip the quarantine and ad-hoc re-sign so it is runnable.
 * No-op on other platforms.
 */
async function makeRunnableOnMac(binPath) {
  if (process.platform !== 'darwin') return;
  try {
    await execFileP('xattr', ['-d', 'com.apple.quarantine', binPath]);
  } catch {
    // not quarantined; fine
  }
  await execFileP('codesign', ['--force', '--sign', '-', binPath]);
  console.log('[fetch-sim-engine] ad-hoc code-signed for macOS.');
}

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(here, '..');
const binDir = path.join(desktopRoot, 'sim-engine-bin');

const ASSETS = {
  'darwin-arm64': { asset: 'ardudeck-sim-engine-macos-arm64', out: 'ardudeck-sim-engine' },
  'darwin-x64': { asset: 'ardudeck-sim-engine-macos-x64', out: 'ardudeck-sim-engine' },
  'win32-x64': { asset: 'ardudeck-sim-engine-windows-x64.exe', out: 'ardudeck-sim-engine.exe' },
  'linux-x64': { asset: 'ardudeck-sim-engine-linux-x64', out: 'ardudeck-sim-engine' },
};

function parseArgs() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const platArg = args.find((a) => a.startsWith('--platform='));
  const key = platArg ? platArg.split('=')[1] : `${process.platform}-${process.arch}`;
  return { force, key };
}
async function fileExists(p) { try { await access(p); return true; } catch { return false; } }
function sha256(buf) { return createHash('sha256').update(buf).digest('hex'); }

// Downloads `patterns` from a release into `destDir` via the gh CLI, which
// handles auth (and draft releases) uniformly - no manual API/token plumbing.
async function ghReleaseDownload(repo, tag, patterns, destDir) {
  const args = ['release', 'download', tag, '--repo', repo, '--dir', destDir, '--clobber'];
  for (const p of patterns) args.push('--pattern', p);
  try {
    await execFileP('gh', args);
  } catch (err) {
    throw new Error(
      `gh release download failed for ${repo}@${tag}: ${err.stderr || err.message}\n` +
        'Is the gh CLI installed and authenticated (GH_TOKEN in CI, or `gh auth login` locally)?',
    );
  }
}

async function main() {
  const { force, key } = parseArgs();
  const entry = ASSETS[key];
  if (!entry) {
    console.error(`[fetch-sim-engine] No binary for platform "${key}". Known: ${Object.keys(ASSETS).join(', ')}`);
    process.exit(1);
  }
  const outPath = path.join(binDir, entry.out);
  if (!force && (await fileExists(outPath))) {
    console.log(`[fetch-sim-engine] ${path.relative(desktopRoot, outPath)} already present, skipping.`);
    return;
  }
  const { repo, tag } = JSON.parse(await readFile(path.join(desktopRoot, 'sim-engine.json'), 'utf8'));
  console.log(`[fetch-sim-engine] Fetching ${entry.asset} from ${repo}@${tag} ...`);
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'ardudeck-sim-engine-'));
  try {
    await ghReleaseDownload(repo, tag, [entry.asset, 'checksums.txt'], tmpDir);
    const [binary, checksumsText] = await Promise.all([
      readFile(path.join(tmpDir, entry.asset)),
      readFile(path.join(tmpDir, 'checksums.txt'), 'utf8'),
    ]);
    const expected = checksumsText.split('\n').map((l) => l.trim().split(/\s+/)).find((p) => p[1] === entry.asset)?.[0];
    if (!expected) throw new Error(`checksums.txt has no entry for ${entry.asset}`);
    const actual = sha256(binary);
    if (actual !== expected) throw new Error(`Checksum mismatch for ${entry.asset}\n  expected ${expected}\n  actual   ${actual}`);
    await mkdir(binDir, { recursive: true });
    await writeFile(outPath, binary);
    if (process.platform !== 'win32') await chmod(outPath, 0o755);
    await makeRunnableOnMac(outPath);
    console.log(`[fetch-sim-engine] Verified and staged ${path.relative(desktopRoot, outPath)} (sha256 ${actual.slice(0, 12)}...).`);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}
main().catch((err) => {
  console.error(`[fetch-sim-engine] ${err.message}`);
  console.error('[fetch-sim-engine] The ArduDeck physics engine could not be staged; realistic-physics SITL would be unavailable in this build.');
  process.exit(1);
});
