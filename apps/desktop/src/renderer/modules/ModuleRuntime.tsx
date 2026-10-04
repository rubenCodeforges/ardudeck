import { createContext, useContext, useEffect, useState, type ReactNode, type ComponentType } from 'react';
import { installReactGlobal } from './module-react-global';
import {
  createRendererHostApi,
  unregisterModuleMissionPanelsForSlug,
  cancelModuleProposalsForSlug,
  clearModuleAlertsForSlug,
  unregisterModuleMapLayersForSlug,
  unregisterModuleSurveyGenerators,
  unregisterModuleExtensionsForSlug,
} from './module-host-renderer';
import { unregisterModulePanels } from './module-panel-registry';
import { unregisterModuleOsdElements } from './module-osd-registry';
import { unregisterModuleHudInstruments } from './module-hud-registry';

interface MountEntry {
  slug: string;
  component: ComponentType;
}

type MountMap = Record<string, MountEntry[]>;

interface RuntimeContextValue {
  mounts: MountMap;
}

const RuntimeContext = createContext<RuntimeContextValue>({ mounts: {} });

export function useMountPoint(name: string): MountEntry[] {
  return useContext(RuntimeContext).mounts[name] ?? [];
}

interface RendererExports {
  activate?: (host: ReturnType<typeof createRendererHostApi>) => void | Promise<void>;
  deactivate?: () => void | Promise<void>;
}

interface LoadedModuleInfo {
  slug: string;
  manifest: { entry?: { renderer?: string }; permissions?: string[] } | null;
  installPath: string;
}

export function ModuleRuntime({ children }: { children: ReactNode }) {
  const [mounts, setMounts] = useState<MountMap>({});

  useEffect(() => {
    installReactGlobal();

    const register = (slug: string, name: string, component: ComponentType) => {
      setMounts((prev) => {
        const existing = prev[name] ?? [];
        const filtered = existing.filter((e) => e.slug !== slug);
        return { ...prev, [name]: [...filtered, { slug, component }] };
      });
    };

    const deactivators = new Map<string, () => void | Promise<void>>();

    const loadOne = async (rec: LoadedModuleInfo, bust?: number): Promise<void> => {
      const rendererEntry = rec.manifest?.entry?.renderer;
      if (!rendererEntry) return;
      const url = `ardudeck-module://${rec.slug}/${rendererEntry}${bust ? `?v=${bust}` : ''}`;
      try {
        const mod = (await import(/* @vite-ignore */ url)) as RendererExports;
        if (typeof mod.activate !== 'function') {
          console.warn(`[ModuleRuntime] ${rec.slug} has no activate() export`);
          return;
        }
        const host = createRendererHostApi(rec.slug, register, rec.manifest?.permissions ?? []);
        await mod.activate(host);
        if (typeof mod.deactivate === 'function') deactivators.set(rec.slug, mod.deactivate);
        console.log(`[ModuleRuntime] activated ${rec.slug}`);
      } catch (err) {
        console.error(`[ModuleRuntime] failed to load ${rec.slug}:`, err);
      }
    };

    const sweep = async (slug: string): Promise<void> => {
      try {
        await deactivators.get(slug)?.();
      } catch (err) {
        console.warn(`[ModuleRuntime] ${slug} deactivate threw`, err);
      }
      deactivators.delete(slug);
      unregisterModuleMissionPanelsForSlug(slug);
      cancelModuleProposalsForSlug(slug);
      clearModuleAlertsForSlug(slug);
      unregisterModuleMapLayersForSlug(slug);
      unregisterModuleSurveyGenerators(slug);
      unregisterModuleExtensionsForSlug(slug);
      unregisterModulePanels(slug);
      unregisterModuleOsdElements(slug);
      unregisterModuleHudInstruments(slug);
      setMounts((prev) => {
        const next: MountMap = {};
        for (const [name, entries] of Object.entries(prev)) {
          next[name] = entries.filter((e) => e.slug !== slug);
        }
        return next;
      });
    };

    let offDevChanged: (() => void) | undefined;

    (async () => {
      const loaded = (await window.electronAPI.moduleHostListLoaded()) as LoadedModuleInfo[];
      console.log(`[ModuleRuntime] ${loaded.length} loaded module(s) reported by host`);
      for (const rec of loaded) await loadOne(rec);

      const reload = async (slug: string): Promise<void> => {
        const rec = loaded.find((r) => r.slug === slug);
        if (!rec) {
          console.warn(`[ModuleRuntime] asked to reload ${slug}, which is not loaded`);
          return;
        }
        console.log(`[ModuleRuntime] reloading ${slug}`);
        await sweep(slug);
        await loadOne(rec, Date.now());
      };

      if (typeof window.electronAPI.onModuleDevChanged !== 'function') {
        console.warn('[ModuleRuntime] host has no onModuleDevChanged; use Reload in Cargo Bay');
      }
      offDevChanged = window.electronAPI.onModuleDevChanged?.((slug: string) => void reload(slug));

      const manual = (e: Event) => void reload((e as CustomEvent<string>).detail);
      window.addEventListener('ardudeck:reload-module', manual);
      const offManual = offDevChanged;
      offDevChanged = () => {
        offManual?.();
        window.removeEventListener('ardudeck:reload-module', manual);
      };
    })();

    return () => {
      offDevChanged?.();
    };
  }, []);

  return <RuntimeContext.Provider value={{ mounts }}>{children}</RuntimeContext.Provider>;
}
