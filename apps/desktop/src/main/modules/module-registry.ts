import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseModuleManifest, type ModuleManifest } from '@ardudeck/module-sdk';
import { getInstalledModules } from './module-manager.js';
import { getDevModules } from './module-dev.js';
import { loadModuleMain } from './module-loader.js';
import { createMainHostApi } from './module-host-main.js';
import { killAllForModule } from './module-pty-service.js';
import { unregisterTileSourcesFor } from '../terrain/tile-source-registry.js';
import { unregisterBasemapsFor } from '../basemaps/basemap-registry.js';
import { unregisterSceneMeshesFor } from '../terrain/scene-mesh-registry.js';

interface LoadedRecord {
  slug: string;
  manifest: ModuleManifest;
  installPath: string;
}

const loaded = new Map<string, LoadedRecord>();

export function getLoadedModules(): LoadedRecord[] {
  return Array.from(loaded.values());
}

export async function loadAllModules(): Promise<void> {
  const dev = getDevModules().map((d) => ({
    slug: d.slug,
    installPath: d.path,
    activatable: false,
    enabled: true,
    entitled: true,
  }));
  const installed = [...getInstalledModules(), ...dev];
  for (const mod of installed) {
    // Activatable modules ship in the app - there is no bundle to load.
    if (mod.activatable) continue;
    // User-disabled cargo stays installed but never loads.
    if (mod.enabled === false) continue;
    if (mod.entitled === false) continue;
    if (!mod.installPath) {
      console.warn(`[ModuleRegistry] skipping ${mod.slug}: no installPath`);
      continue;
    }
    try {
      const raw = await readFile(join(mod.installPath, 'module.json'), 'utf-8');
      const parsed = parseModuleManifest(JSON.parse(raw));
      if (!parsed.ok) {
        console.warn(`[ModuleRegistry] invalid manifest for ${mod.slug}: ${parsed.error}`);
        continue;
      }
      const manifest = parsed.manifest;
      if (manifest.entry.main) {
        const host = createMainHostApi(manifest);
        await loadModuleMain(mod.installPath, manifest.entry.main, host);
      }
      loaded.set(mod.slug, { slug: mod.slug, manifest, installPath: mod.installPath });
      console.log(`[ModuleRegistry] loaded ${mod.slug}@${manifest.version}`);
    } catch (err) {
      console.error(`[ModuleRegistry] failed to load ${mod.slug}:`, err);
    }
  }
}

export function unloadAllModules(): void {
  for (const { slug } of loaded.values()) {
    killAllForModule(slug);
    unregisterTileSourcesFor(slug);
    unregisterSceneMeshesFor(slug);
    unregisterBasemapsFor(slug);
  }
  loaded.clear();
}
