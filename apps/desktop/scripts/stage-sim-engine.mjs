/**
 * Build the Rust physics engine (crates/ardudeck-sim-engine) and stage a
 * runnable binary at apps/desktop/sim-engine-bin/ for `pnpm dev` to launch.
 *
 * On macOS, copying a freshly built Mach-O over the previous one invalidates its
 * ad-hoc code signature, so the kernel SIGKILLs it ("Killed: 9") on first run.
 * We ad-hoc re-sign after copying so it is always runnable. No-op elsewhere.
 *
 * We also stage ATOMICALLY: write + sign a temp file, then rename it over the
 * target. An in-place overwrite of a file that is currently executing (e.g. the
 * engine is live in a running `pnpm dev`) makes macOS kill that running process,
 * which drops SITL's JSON feed mid-flight. A rename swaps the directory entry
 * while the live process keeps its old inode, so restaging never kills it.
 *
 * Usage: `pnpm stage:sim-engine` (requires a Rust toolchain / cargo on PATH).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, copyFileSync, chmodSync, renameSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(here, '..');
const repoRoot = path.resolve(desktopRoot, '..', '..');
const manifest = path.join(repoRoot, 'crates', 'ardudeck-sim-engine', 'Cargo.toml');
const exe = process.platform === 'win32' ? 'ardudeck-sim-engine.exe' : 'ardudeck-sim-engine';
const builtPath = path.join(repoRoot, 'crates', 'ardudeck-sim-engine', 'target', 'release', exe);
const binDir = path.join(desktopRoot, 'sim-engine-bin');
const outPath = path.join(binDir, exe);

console.log('[stage-sim-engine] cargo build --release ...');
execFileSync('cargo', ['build', '--release', '--manifest-path', manifest], { stdio: 'inherit' });

mkdirSync(binDir, { recursive: true });
// Stage into a temp file, sign it there, then atomically rename over the target.
const tmpPath = `${outPath}.staging-${process.pid}`;
try {
  copyFileSync(builtPath, tmpPath);
  if (process.platform !== 'win32') chmodSync(tmpPath, 0o755);
  if (process.platform === 'darwin') {
    execFileSync('codesign', ['--force', '--sign', '-', tmpPath], { stdio: 'inherit' });
    console.log('[stage-sim-engine] ad-hoc code-signed for macOS.');
  }
  renameSync(tmpPath, outPath); // atomic: a live engine keeps its old inode
} catch (err) {
  try {
    rmSync(tmpPath, { force: true });
  } catch {
    /* best-effort cleanup */
  }
  throw err;
}

console.log(`[stage-sim-engine] staged ${path.relative(desktopRoot, outPath)}`);
