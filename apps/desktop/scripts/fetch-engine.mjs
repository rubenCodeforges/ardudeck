/**
 * Fetch the pinned multi-vehicle engine binary (the orchestrator) for the
 * current platform and stage it at engine/ so electron-builder bundles it
 * into the app's Resources (see the extraResources entry in package.json).
 *
 * The binary is a release asset on the rubenCodeforges/ardudeck repo (tag from
 * engine.json), pulled via `gh release download` so it works whether that
 * release is public or a Draft (drafts aren't reachable via a plain URL fetch).
 * `gh` picks up auth from GH_TOKEN/GITHUB_TOKEN in CI (build.yml already grants
 * this repo's own workflow `contents: write`, so no new secret is needed - it
 * never touches the private orchestrator source repo) or from the local `gh`
 * login on a dev machine. The asset's SHA-256 is verified against the
 * release's checksums.txt before the binary is written, so a tampered or
 * truncated download can never be bundled.
 *
 * Behavior:
 *   - If engine/<binary> already exists, skip (a locally built binary wins;
 *     pass --force to re-download).
 *   - CI clean checkout has no binary, so it downloads + verifies.
 *   - --platform=<key> overrides the target (for cross-OS packaging).
 */

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile, readFile, access, chmod } from 'node:fs/promises';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

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

// Downloads `patterns` from a release into `destDir` via the gh CLI, which
// handles auth (and draft releases) uniformly - no manual API/token plumbing.
async function ghReleaseDownload(repo, tag, patterns, destDir) {
  const args = ['release', 'download', tag, '--repo', repo, '--dir', destDir, '--clobber'];
  for (const p of patterns) args.push('--pattern', p);
  try {
    await execFileAsync('gh', args);
  } catch (err) {
    throw new Error(
      `gh release download failed for ${repo}@${tag}: ${err.stderr || err.message}\n` +
        'Is the gh CLI installed and authenticated (GH_TOKEN in CI, or `gh auth login` locally)?',
    );
  }
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

  console.log(`[fetch-engine] Fetching ${entry.asset} from ${repo}@${tag} ...`);
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'ardudeck-engine-'));
  try {
    await ghReleaseDownload(repo, tag, [entry.asset, 'checksums.txt'], tmpDir);
    const [binary, checksumsText] = await Promise.all([
      readFile(path.join(tmpDir, entry.asset)),
      readFile(path.join(tmpDir, 'checksums.txt'), 'utf8'),
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
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(`[fetch-engine] ${err.message}`);
  console.error('[fetch-engine] The engine could not be staged; multi-vehicle mode would be unavailable in this build.');
  process.exit(1);
});
