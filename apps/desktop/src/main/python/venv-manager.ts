/**
 * Per-plugin Python virtualenv management.
 *
 * For each plugin we maintain `<pluginDir>/.venv/` provisioned with the
 * interpreter found by `python-detector`. Provisioning is idempotent: if the
 * venv already exists *and* the hash of the plugin's `requirements.txt` matches
 * the previously recorded hash in `.venv/.requirements.sha256`, we skip pip
 * entirely. Any change to `requirements.txt` triggers a re-install.
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { detectPython } from './python-detector.js';

const VENV_DIRNAME = '.venv';
const HASH_FILENAME = '.requirements.sha256';

export interface ProvisionOptions {
  pluginDir: string;
  /** Receives every line of stdout/stderr from venv/pip for log streaming. */
  onLog?: (level: 'info' | 'error', line: string) => void;
  /** Phase change hook used to drive UI status transitions. */
  onPhase?: (phase: 'venv' | 'pip' | 'done') => void;
}

export interface ProvisionResult {
  venvPath: string;
  /** Absolute path to the python binary inside the venv. */
  pythonPath: string;
  /** True when pip ran (i.e. requirements changed or venv was new). */
  installed: boolean;
}

function venvPaths(pluginDir: string): { venv: string; python: string; pip: string; hashFile: string } {
  const venv = join(pluginDir, VENV_DIRNAME);
  const isWin = process.platform === 'win32';
  const python = isWin ? join(venv, 'Scripts', 'python.exe') : join(venv, 'bin', 'python');
  const pip = isWin ? join(venv, 'Scripts', 'pip.exe') : join(venv, 'bin', 'pip');
  const hashFile = join(venv, HASH_FILENAME);
  return { venv, python, pip, hashFile };
}

export function getVenvPython(pluginDir: string): string {
  return venvPaths(pluginDir).python;
}

export function venvExists(pluginDir: string): boolean {
  return existsSync(venvPaths(pluginDir).python);
}

interface RunOptions {
  cwd?: string;
  onLog?: (level: 'info' | 'error', line: string) => void;
  /** Hard timeout in ms; 0 disables. Defaults to 10 minutes for pip installs. */
  timeoutMs?: number;
}

function runStreaming(command: string, args: string[], options: RunOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      windowsHide: true,
      env: {
        ...process.env,
        // pip emits ASCII progress that is very noisy in raw streams; hint it
        // toward a more line-oriented format.
        PIP_DISABLE_PIP_VERSION_CHECK: '1',
        PIP_NO_INPUT: '1',
        PYTHONIOENCODING: 'utf-8',
        PYTHONUNBUFFERED: '1',
      },
    });

    const timeout = options.timeoutMs ?? 10 * 60 * 1000;
    let timer: NodeJS.Timeout | null = null;
    if (timeout > 0) {
      timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Command timed out after ${timeout}ms: ${command}`));
      }, timeout);
    }

    const pipe = (level: 'info' | 'error') => (chunk: Buffer) => {
      const text = chunk.toString('utf-8');
      for (const line of text.split(/\r?\n/)) {
        if (line.length > 0) options.onLog?.(level, line);
      }
    };
    child.stdout.on('data', pipe('info'));
    child.stderr.on('data', pipe('error'));

    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    child.on('exit', (code) => {
      if (timer) clearTimeout(timer);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code}`));
      }
    });
  });
}

async function hashRequirements(pluginDir: string): Promise<string | null> {
  const reqPath = join(pluginDir, 'requirements.txt');
  if (!existsSync(reqPath)) return null;
  const buf = await readFile(reqPath);
  return createHash('sha256').update(buf).digest('hex');
}

async function readStoredHash(hashFile: string): Promise<string | null> {
  try {
    const text = await readFile(hashFile, 'utf-8');
    return text.trim();
  } catch {
    return null;
  }
}

/**
 * Provision (or re-provision) a venv for a plugin folder.
 *
 * Behavior:
 *  - If the venv binary exists and the requirements hash matches, returns
 *    immediately with `installed: false`.
 *  - Otherwise creates a fresh venv (deleting any prior `.venv`), installs
 *    `requirements.txt` (if present), and writes a new hash sentinel.
 */
export async function provisionVenv(options: ProvisionOptions): Promise<ProvisionResult> {
  const { pluginDir, onLog, onPhase } = options;
  const interpreter = await detectPython();
  if (!interpreter) {
    throw new Error(
      'No system Python interpreter found. Install Python 3.10+ and ensure it is on PATH, or set ARDUDECK_PYTHON.',
    );
  }

  const { venv, python, hashFile } = venvPaths(pluginDir);
  const desiredHash = await hashRequirements(pluginDir);
  const storedHash = await readStoredHash(hashFile);

  if (existsSync(python) && desiredHash === storedHash) {
    onPhase?.('done');
    return { venvPath: venv, pythonPath: python, installed: false };
  }

  // Drop any previous venv before creating a new one — venvs are not designed
  // to handle interpreter swaps gracefully.
  if (existsSync(venv)) {
    await rm(venv, { recursive: true, force: true });
  }
  await mkdir(pluginDir, { recursive: true });

  onPhase?.('venv');
  onLog?.('info', `[venv] creating ${venv} with ${interpreter.path}`);
  await runStreaming(interpreter.path, ['-m', 'venv', venv], {
    cwd: pluginDir,
    onLog,
    timeoutMs: 2 * 60 * 1000,
  });

  if (desiredHash !== null) {
    onPhase?.('pip');
    onLog?.('info', '[pip] upgrading pip');
    await runStreaming(python, ['-m', 'pip', 'install', '--upgrade', 'pip'], {
      cwd: pluginDir,
      onLog,
      timeoutMs: 5 * 60 * 1000,
    });
    onLog?.('info', '[pip] installing requirements.txt');
    await runStreaming(
      python,
      ['-m', 'pip', 'install', '--no-input', '-r', 'requirements.txt'],
      { cwd: pluginDir, onLog, timeoutMs: 15 * 60 * 1000 },
    );
    await writeFile(hashFile, desiredHash, 'utf-8');
  } else {
    // No requirements file means an empty hash sentinel so we don't reprovision
    // forever on a manifest without dependencies.
    await writeFile(hashFile, '', 'utf-8');
  }

  onPhase?.('done');
  return { venvPath: venv, pythonPath: python, installed: true };
}

/** Remove the venv directory (used by uninstall). Does not delete plugin sources. */
export async function destroyVenv(pluginDir: string): Promise<void> {
  const { venv } = venvPaths(pluginDir);
  if (existsSync(venv)) {
    await rm(venv, { recursive: true, force: true });
  }
}
