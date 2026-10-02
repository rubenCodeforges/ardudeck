import { app } from 'electron';
import { existsSync, readFileSync, watch } from 'node:fs';
import { join, resolve } from 'node:path';
import Store from 'electron-store';
import { parseModuleManifest } from '@ardudeck/module-sdk';
import { checkDevSlug, type DevLoadCheck } from '../../shared/dev-load-guard.js';

export interface DevModule {
  slug: string;
  name: string;
  version: string;
  /** Folder holding module.json and the built renderer entry. */
  path: string;
}

interface DevStoreSchema {
  devModules: DevModule[];
}

let cached: Store<DevStoreSchema> | null = null;
function store(): Store<DevStoreSchema> {
  if (!cached) cached = new Store<DevStoreSchema>({ name: 'modules-dev', defaults: { devModules: [] } });
  return cached;
}

/** Unpackaged builds only. A shipped app has no dev-load path at all. */
export function isDevLoadAvailable(): boolean {
  return !app.isPackaged;
}

export { checkDevSlug, type DevLoadCheck };

export function getDevModules(): DevModule[] {
  return isDevLoadAvailable() ? store().get('devModules') : [];
}

export function getDevModulePath(slug: string): string | null {
  return getDevModules().find((m) => m.slug === slug)?.path ?? null;
}

export function loadDevModule(
  dir: string,
  installedSlugs: readonly string[],
): DevLoadCheck & { module?: DevModule } {
  if (!isDevLoadAvailable()) return { ok: false, error: 'Not available in a packaged build' }; // i18n-exempt

  let manifest;
  try {
    const raw = readFileSync(join(dir, 'module.json'), 'utf-8');
    const parsed = parseModuleManifest(JSON.parse(raw));
    if (!parsed.ok) return { ok: false, error: `Invalid module.json: ${parsed.error}` };
    manifest = parsed.manifest;
  } catch (err) {
    return { ok: false, error: `No readable module.json in ${dir}: ${err}` };
  }

  const check = checkDevSlug(manifest.slug, installedSlugs);
  if (!check.ok) return check;

  const entry = manifest.entry?.renderer ?? manifest.entry?.main;
  if (!entry) return { ok: false, error: 'module.json declares no entry' };
  if (!existsSync(join(dir, entry))) {
    const built = join(dir, 'dist', entry);
    return {
      ok: false,
      error: existsSync(built)
        ? `module.json points at ${entry}, which is in dist/. Choose the dist folder instead.`
        : `module.json points at ${entry}, which is not in this folder. Build the cargo first.`,
    };
  }

  const mod: DevModule = {
    slug: manifest.slug,
    name: manifest.name ?? manifest.slug,
    version: manifest.version ?? '0.0.0',
    path: resolve(dir),
  };
  store().set('devModules', [...getDevModules().filter((m) => m.slug !== mod.slug), mod]);
  return { ok: true, module: mod };
}

export function unloadDevModule(slug: string): void {
  if (!isDevLoadAvailable()) return;
  store().set('devModules', getDevModules().filter((m) => m.slug !== slug));
}

type Watcher = { close: () => void };
const watchers = new Map<string, Watcher>();

/** Fires when a dev module's built output changes on disk. */
export function watchDevModules(onChange: (slug: string) => void): void {
  if (!isDevLoadAvailable()) return;
  for (const [slug, w] of watchers) {
    w.close();
    watchers.delete(slug);
  }
  for (const mod of getDevModules()) {
    try {
      let timer: NodeJS.Timeout | null = null;
      const w = watch(mod.path, { recursive: true }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          console.log(`[ModuleDev] ${mod.slug} changed on disk, reloading`);
          onChange(mod.slug);
        }, 150);
      });
      watchers.set(mod.slug, w);
      console.log(`[ModuleDev] watching ${mod.path}`);
    } catch (err) {
      console.warn(`[ModuleDev] cannot watch ${mod.path}:`, err);
    }
  }
}

export function stopWatchingDevModules(): void {
  for (const w of watchers.values()) w.close();
  watchers.clear();
}
