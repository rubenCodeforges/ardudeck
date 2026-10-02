import { create } from 'zustand';
import { t } from '../../shared/i18n/index.js';
import type { AppProgress, HangarApp, InstalledApp } from '../../shared/app-types';

/**
 * Hangar APPS, kept out of `module-store` on purpose.
 *
 * An app has no licence key, no enable/disable, no manifest and no restart-required: sharing a
 * store would mean every one of those fields existing for rows where it means nothing.
 */
interface AppState {
  catalog: HangarApp[];
  installed: InstalledApp[];
  loading: boolean;
  error: string | null;
  /** Slug currently installing, so only that card shows a spinner. */
  installing: string | null;
  progress: AppProgress | null;

  fetchCatalog: () => Promise<void>;
  fetchInstalled: () => Promise<void>;
  install: (slug: string) => Promise<void>;
  uninstall: (slug: string) => Promise<void>;
  setProgress: (p: AppProgress | null) => void;
  clearError: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  catalog: [],
  installed: [],
  loading: false,
  error: null,
  installing: null,
  progress: null,

  fetchCatalog: async () => {
    set({ loading: true, error: null });
    try {
      const res = await window.electronAPI.appCatalogList();
      set({
        catalog: res.success && res.apps ? res.apps : [],
        error: res.error ?? null,
        loading: false,
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), loading: false });
    }
  },

  fetchInstalled: async () => {
    try {
      set({ installed: await window.electronAPI.appList() });
    } catch {
      // An empty list is the right answer for a renderer that cannot reach the main process;
      // an error banner here would fire on every startup race.
    }
  },

  install: async (slug) => {
    set({ installing: slug, error: null, progress: null });
    try {
      const res = await window.electronAPI.appInstall(slug);
      if (!res.success) set({ error: res.error ?? t('stores:appStore.installFailed') });
      await get().fetchInstalled();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      set({ installing: null, progress: null });
    }
  },

  uninstall: async (slug) => {
    try {
      const res = await window.electronAPI.appUninstall(slug);
      if (!res.success) set({ error: res.error ?? t('stores:appStore.uninstallFailed') });
      set({ installed: res.apps ?? get().installed.filter((a) => a.slug !== slug) });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  setProgress: (progress) => set({ progress }),
  clearError: () => set({ error: null }),
}));

export function useAppInstalled(slug: string): boolean {
  return useAppStore((s) => s.installed.some((a) => a.slug === slug));
}
