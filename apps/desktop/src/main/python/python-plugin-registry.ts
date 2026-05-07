/**
 * Discovery, validation, and lifecycle for Python plugins.
 *
 * Plugins live in `<userData>/python-plugins/<slug>/`. The registry is the
 * single source of truth for which plugins exist, what state each is in,
 * and how to talk to its sidecar. It keeps no SQLite/electron-store of its
 * own — manifests on disk + the sentinel files written by `venv-manager`
 * are authoritative; the registry is just an in-memory cache rebuilt on
 * startup and after refreshes.
 */

import { app } from 'electron';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import {
  type PythonPluginDescriptor,
  type PythonPluginManifest,
  type PythonPluginStatus,
  type PythonPluginStatusEvent,
  type PythonPluginCapability,
} from '../../shared/python-plugin-types.js';
import { provisionVenv, destroyVenv, venvExists, getVenvPython } from './venv-manager.js';
import { PythonSidecar } from './python-sidecar.js';
import { detectPython, meetsMinPython } from './python-detector.js';

const PLUGINS_DIRNAME = 'python-plugins';
const MANIFEST_FILENAME = 'plugin.json';
const REQUIREMENTS_FILENAME = 'requirements.txt';

const ALLOWED_CAPABILITIES: PythonPluginCapability[] = [
  'telemetry.subscribe',
  'mavlink.send',
  'ui.panel',
  'fs.userdata',
];

interface RegistryEntry {
  descriptor: PythonPluginDescriptor;
  sidecar: PythonSidecar | null;
}

class PythonPluginRegistry extends EventEmitter {
  private entries = new Map<string, RegistryEntry>();
  private rootPromise: Promise<string> | null = null;

  async root(): Promise<string> {
    if (!this.rootPromise) {
      this.rootPromise = (async () => {
        const dir = join(app.getPath('userData'), PLUGINS_DIRNAME);
        await mkdir(dir, { recursive: true });
        return dir;
      })();
    }
    return this.rootPromise;
  }

  /** Fresh listing for the renderer. Cheap; safe to call frequently. */
  list(): PythonPluginDescriptor[] {
    return Array.from(this.entries.values()).map((e) => ({ ...e.descriptor }));
  }

  get(slug: string): PythonPluginDescriptor | undefined {
    const entry = this.entries.get(slug);
    return entry ? { ...entry.descriptor } : undefined;
  }

  getSidecar(slug: string): PythonSidecar | null {
    return this.entries.get(slug)?.sidecar ?? null;
  }

  /** Re-scan disk and reconcile in-memory descriptors. */
  async refresh(): Promise<PythonPluginDescriptor[]> {
    const root = await this.root();
    const seen = new Set<string>();

    let dirents: import('node:fs').Dirent[] = [];
    try {
      dirents = await readdir(root, { withFileTypes: true });
    } catch {
      return [];
    }

    for (const dirent of dirents) {
      if (!dirent.isDirectory()) continue;
      const slug = dirent.name;
      const pluginDir = join(root, slug);
      const manifestPath = join(pluginDir, MANIFEST_FILENAME);
      if (!existsSync(manifestPath)) continue;

      seen.add(slug);
      try {
        const manifest = await readManifest(manifestPath);
        if (manifest.slug !== slug) {
          // Folder name and manifest slug must agree to avoid id ambiguity.
          this.markError(slug, manifest, pluginDir, `Manifest slug "${manifest.slug}" does not match folder "${slug}"`);
          continue;
        }
        const hasReq = existsSync(join(pluginDir, REQUIREMENTS_FILENAME));
        const hasV = venvExists(pluginDir);
        const existing = this.entries.get(slug);
        const status: PythonPluginStatus = existing?.descriptor.status ?? (hasV ? 'ready' : 'discovered');
        const descriptor: PythonPluginDescriptor = {
          slug,
          manifest,
          installPath: pluginDir,
          hasRequirements: hasReq,
          hasVenv: hasV,
          status,
          pid: existing?.sidecar?.pid,
        };
        if (existing) {
          existing.descriptor = descriptor;
        } else {
          this.entries.set(slug, { descriptor, sidecar: null });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.markError(slug, null, pluginDir, message);
      }
    }

    // Drop entries whose folders disappeared.
    for (const slug of [...this.entries.keys()]) {
      if (!seen.has(slug)) {
        const entry = this.entries.get(slug);
        await entry?.sidecar?.stop().catch(() => {});
        this.entries.delete(slug);
      }
    }

    return this.list();
  }

  /** Provision the venv (idempotent) and emit progress events. */
  async install(
    slug: string,
    onLog: (level: 'info' | 'error', line: string) => void,
    onPhase: (phase: 'venv' | 'pip' | 'done') => void,
  ): Promise<PythonPluginDescriptor> {
    const entry = this.entries.get(slug);
    if (!entry) throw new Error(`Plugin "${slug}" is not registered`);

    const interpreter = await detectPython();
    if (!interpreter) {
      this.transition(slug, 'error', 'No Python interpreter found');
      throw new Error('No Python interpreter found');
    }
    if (!meetsMinPython(interpreter, entry.descriptor.manifest.minPython)) {
      this.transition(
        slug,
        'error',
        `Python ${entry.descriptor.manifest.minPython}+ required, found ${interpreter.version}`,
      );
      throw new Error(
        `Python ${entry.descriptor.manifest.minPython}+ required, found ${interpreter.version}`,
      );
    }

    this.transition(slug, 'creating-venv');
    try {
      await provisionVenv({
        pluginDir: entry.descriptor.installPath,
        onLog,
        onPhase: (phase) => {
          if (phase === 'pip') this.transition(slug, 'installing');
          onPhase(phase);
        },
      });
      entry.descriptor.hasVenv = true;
      this.transition(slug, 'ready');
      return { ...entry.descriptor };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.transition(slug, 'error', message);
      throw err;
    }
  }

  async uninstall(slug: string): Promise<void> {
    const entry = this.entries.get(slug);
    if (!entry) return;
    await entry.sidecar?.stop().catch(() => {});
    await destroyVenv(entry.descriptor.installPath);
    await rm(entry.descriptor.installPath, { recursive: true, force: true });
    this.entries.delete(slug);
    this.emit('status', { slug, status: 'stopped' } satisfies PythonPluginStatusEvent);
  }

  async start(slug: string): Promise<PythonPluginDescriptor> {
    const entry = this.entries.get(slug);
    console.log('entry', entry);
    if (!entry) throw new Error(`Plugin "${slug}" is not registered`);
    if (entry.sidecar?.isRunning) return { ...entry.descriptor };
    if (!entry.descriptor.hasVenv) {
      throw new Error(`Plugin "${slug}" has no venv yet — run install first`);
    }
    this.transition(slug, 'starting');
    const pythonPath = getVenvPython(entry.descriptor.installPath);
    const sidecar = new PythonSidecar({
      slug,
      pythonPath,
      pluginDir: entry.descriptor.installPath,
    });

    sidecar.on('log', (level, line) => {
      this.emit('log', { slug, level, message: line, timestamp: Date.now() });
    });
    sidecar.on('event', (event, payload) => {
      this.emit('event', { slug, event, payload, timestamp: Date.now() });
    });
    sidecar.on('command', (command, payload) => {
      this.emit('command', { slug, command, payload, timestamp: Date.now() });
    });
    sidecar.on('exit', (code, signal) => {
      this.emit('log', {
        slug,
        level: code === 0 ? 'info' : 'error',
        message: `[sidecar] exited code=${code} signal=${signal}`,
        timestamp: Date.now(),
      });
      // After exit, drop back to ready (if the venv is still around).
      if (entry.descriptor.hasVenv) {
        this.transition(slug, 'stopped');
      }
    });
    entry.sidecar = sidecar;
    try {
      await sidecar.start();
      entry.descriptor.pid = sidecar.pid;
      this.transition(slug, 'running');
      return { ...entry.descriptor };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.transition(slug, 'error', message);
      throw err;
    }
  }

  async stop(slug: string): Promise<void> {
    const entry = this.entries.get(slug);
    if (!entry?.sidecar) return;
    await entry.sidecar.stop();
    entry.sidecar = null;
    entry.descriptor.pid = undefined;
    this.transition(slug, 'stopped');
  }

  async stopAll(): Promise<void> {
    const stops = Array.from(this.entries.values()).map(async (e) => {
      if (e.sidecar) await e.sidecar.stop().catch(() => {});
    });
    await Promise.all(stops);
  }

  /** Public helper used by IPC handlers. */
  call<T = unknown>(slug: string, method: string, params?: unknown): Promise<T> {
    const entry = this.entries.get(slug);
    if (!entry?.sidecar) {
      return Promise.reject(new Error(`Plugin "${slug}" is not running`));
    }
    return entry.sidecar.call<T>(method, params);
  }

  publishTelemetryBatch(batch: unknown): void {
    for (const [slug, entry] of this.entries) {
      if (!entry.sidecar?.isRunning) continue;
      const caps = entry.descriptor.manifest.capabilities ?? [];
      if (!caps.includes('telemetry.subscribe')) continue;
      try {
        entry.sidecar.notify('telemetry.batch', batch);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.emit('log', {
          slug,
          level: 'error',
          message: `[telemetry] publish failed: ${message}`,
          timestamp: Date.now(),
        });
      }
    }
  }

  private transition(slug: string, status: PythonPluginStatus, error?: string): void {
    const entry = this.entries.get(slug);
    if (!entry) return;
    entry.descriptor.status = status;
    entry.descriptor.error = error;
    if (status !== 'running') entry.descriptor.pid = undefined;
    const evt: PythonPluginStatusEvent = {
      slug,
      status,
      pid: entry.descriptor.pid,
      error,
    };
    this.emit('status', evt);
  }

  private markError(
    slug: string,
    manifest: PythonPluginManifest | null,
    installPath: string,
    error: string,
  ): void {
    const fallback: PythonPluginManifest = manifest ?? {
      slug,
      name: slug,
      version: '0.0.0',
      entry: 'main.py',
    };
    const descriptor: PythonPluginDescriptor = {
      slug,
      manifest: fallback,
      installPath,
      hasRequirements: false,
      hasVenv: false,
      status: 'error',
      error,
    };
    const existing = this.entries.get(slug);
    if (existing) {
      existing.descriptor = descriptor;
    } else {
      this.entries.set(slug, { descriptor, sidecar: null });
    }
    this.emit('status', { slug, status: 'error', error } satisfies PythonPluginStatusEvent);
  }
}

async function readManifest(path: string): Promise<PythonPluginManifest> {
  const raw = await readFile(path, 'utf-8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in plugin.json: ${(err as Error).message}`);
  }
  return validateManifest(parsed);
}

function validateManifest(input: unknown): PythonPluginManifest {
  if (!input || typeof input !== 'object') {
    throw new Error('plugin.json must be an object');
  }
  const obj = input as Record<string, unknown>;
  const required = ['slug', 'name', 'version', 'entry'] as const;
  for (const key of required) {
    if (typeof obj[key] !== 'string' || (obj[key] as string).length === 0) {
      throw new Error(`plugin.json: missing/invalid "${key}"`);
    }
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(obj['slug'] as string)) {
    throw new Error(`plugin.json: slug must be kebab-case`);
  }
  const capabilities = Array.isArray(obj['capabilities'])
    ? (obj['capabilities'] as unknown[])
        .filter((c): c is PythonPluginCapability =>
          typeof c === 'string' && (ALLOWED_CAPABILITIES as readonly string[]).includes(c),
        )
    : undefined;

  let ui: PythonPluginManifest['ui'];
  if (obj['ui'] && typeof obj['ui'] === 'object') {
    const uiObj = obj['ui'] as Record<string, unknown>;
    if (typeof uiObj['panelId'] === 'string' && typeof uiObj['title'] === 'string') {
      ui = {
        panelId: uiObj['panelId'],
        title: uiObj['title'],
        icon: typeof uiObj['icon'] === 'string' ? uiObj['icon'] : undefined,
      };
    }
  }

  return {
    slug: obj['slug'] as string,
    name: obj['name'] as string,
    version: obj['version'] as string,
    entry: obj['entry'] as string,
    description: typeof obj['description'] === 'string' ? obj['description'] : undefined,
    author: typeof obj['author'] === 'string' ? obj['author'] : undefined,
    minPython: typeof obj['minPython'] === 'string' ? obj['minPython'] : undefined,
    capabilities,
    ui,
  };
}

/**
 * Install a plugin from an arbitrary source folder by copying it into
 * `<userData>/python-plugins/<slug>/`. Returns the installed slug.
 */
export async function importPluginFromFolder(sourceFolder: string): Promise<string> {
  const stats = await stat(sourceFolder);
  if (!stats.isDirectory()) {
    throw new Error(`Not a directory: ${sourceFolder}`);
  }
  const manifestPath = join(sourceFolder, MANIFEST_FILENAME);
  if (!existsSync(manifestPath)) {
    throw new Error(`No plugin.json found in ${sourceFolder}`);
  }
  const manifest = await readManifest(manifestPath);
  const target = join(await pythonPluginRegistry.root(), manifest.slug);
  if (existsSync(target)) {
    throw new Error(`Plugin "${manifest.slug}" is already installed`);
  }
  await copyDir(sourceFolder, target);
  await pythonPluginRegistry.refresh();
  return manifest.slug;
}

async function copyDir(src: string, dst: string): Promise<void> {
  await mkdir(dst, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      // .venv from a source folder must never be copied — recreate it locally.
      if (entry.name === '.venv') return;
      const s = join(src, entry.name);
      const d = join(dst, entry.name);
      if (entry.isDirectory()) {
        await copyDir(s, d);
      } else {
        const { copyFile } = await import('node:fs/promises');
        await copyFile(s, d);
      }
    }),
  );
}

export const pythonPluginRegistry = new PythonPluginRegistry();
