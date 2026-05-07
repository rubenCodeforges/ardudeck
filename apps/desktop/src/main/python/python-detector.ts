/**
 * Locate a usable system Python interpreter for the Python Plugins subsystem.
 *
 * Discovery order (first hit wins):
 *  1. `ARDUDECK_PYTHON` env var (manual override).
 *  2. `python3` then `python` on PATH.
 *  3. Windows: `py -3` launcher, plus common install paths.
 *  4. POSIX: `/usr/local/bin/python3`, `/opt/homebrew/bin/python3`, `/usr/bin/python3`.
 *
 * Result is cached for the lifetime of the main process; call `clearPythonCache`
 * when the user resolves a missing-python error so we re-probe.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { PythonInterpreterInfo } from '../../shared/python-plugin-types.js';

const MIN_MAJOR = 3;
const MIN_MINOR = 10;

let cached: PythonInterpreterInfo | null = null;
let inflight: Promise<PythonInterpreterInfo | null> | null = null;

interface ProbeResult {
  path: string;
  version: string;
  majorMinor: string;
}

function execProbe(command: string, args: string[]): Promise<ProbeResult | null> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      resolve(null);
    }, 5_000);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf-8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8');
    });

    child.on('error', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(null);
    });

    child.on('exit', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        resolve(null);
        return;
      }
      // python -c '...' prints `path\nversion`
      const lines = (stdout || stderr).trim().split(/\r?\n/);
      if (lines.length < 2) {
        resolve(null);
        return;
      }
      const executablePath = lines[0];
      const version = lines[1];
      if (!executablePath || !version) {
        resolve(null);
        return;
      }
      const versionMatch = /^(\d+)\.(\d+)\.\d+/.exec(version);
      if (!versionMatch) {
        resolve(null);
        return;
      }
      const major = Number(versionMatch[1]);
      const minor = Number(versionMatch[2]);
      if (major < MIN_MAJOR || (major === MIN_MAJOR && minor < MIN_MINOR)) {
        resolve(null);
        return;
      }
      resolve({
        path: executablePath,
        version,
        majorMinor: `${major}.${minor}`,
      });
    });
  });
}

const PROBE_SCRIPT =
  'import sys;print(sys.executable);print("%d.%d.%d" % sys.version_info[:3])';

async function probe(command: string, extraArgs: string[] = []): Promise<ProbeResult | null> {
  return execProbe(command, [...extraArgs, '-c', PROBE_SCRIPT]);
}

function platformCandidates(): string[] {
  if (process.platform === 'win32') {
    const candidates: string[] = [];
    const localApp = process.env['LOCALAPPDATA'];
    if (localApp) {
      // Modern python.org installer dumps under LOCALAPPDATA\Programs\Python\Python3xx\
      for (const minor of ['313', '312', '311', '310']) {
        candidates.push(`${localApp}\\Programs\\Python\\Python${minor}\\python.exe`);
      }
    }
    candidates.push(
      'C:\\Python313\\python.exe',
      'C:\\Python312\\python.exe',
      'C:\\Python311\\python.exe',
      'C:\\Python310\\python.exe',
    );
    return candidates;
  }
  return [
    '/opt/homebrew/bin/python3',
    '/usr/local/bin/python3',
    '/usr/bin/python3',
  ];
}

async function detect(): Promise<PythonInterpreterInfo | null> {
  const envOverride = process.env['ARDUDECK_PYTHON'];
  if (envOverride && existsSync(envOverride)) {
    const result = await probe(envOverride);
    if (result) {
      return { ...result, source: 'env' };
    }
  }

  for (const cmd of ['python3', 'python']) {
    const result = await probe(cmd);
    if (result) {
      return { ...result, source: 'path' };
    }
  }

  if (process.platform === 'win32') {
    // py -3 is the canonical Windows entry-point when PATH lacks python.exe.
    const result = await probe('py', ['-3']);
    if (result) {
      return { ...result, source: 'py-launcher' };
    }
  }

  for (const candidate of platformCandidates()) {
    if (!existsSync(candidate)) continue;
    const result = await probe(candidate);
    if (result) {
      return { ...result, source: 'platform' };
    }
  }

  return null;
}

/** Detect the interpreter, caching the first successful probe. */
export async function detectPython(): Promise<PythonInterpreterInfo | null> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = detect()
    .then((info) => {
      cached = info;
      return info;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Force the next `detectPython()` call to re-probe (e.g. after install). */
export function clearPythonCache(): void {
  cached = null;
}

/** Synchronous accessor for the most recent detection. May be `null`. */
export function getCachedPython(): PythonInterpreterInfo | null {
  return cached;
}

/** Compare interpreter version against `manifest.minPython` (e.g. "3.11"). */
export function meetsMinPython(
  interpreter: PythonInterpreterInfo,
  required: string | undefined,
): boolean {
  if (!required) return true;
  const reqMatch = /^(\d+)(?:\.(\d+))?/.exec(required);
  if (!reqMatch) return true;
  const reqMajor = Number(reqMatch[1]);
  const reqMinor = reqMatch[2] ? Number(reqMatch[2]) : 0;
  const parts = interpreter.majorMinor.split('.').map(Number);
  const haveMajor = parts[0] ?? 0;
  const haveMinor = parts[1] ?? 0;
  if (haveMajor !== reqMajor) return haveMajor > reqMajor;
  return haveMinor >= reqMinor;
}
