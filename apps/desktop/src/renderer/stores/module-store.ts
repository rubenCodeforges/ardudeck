import { create } from 'zustand';
import { t } from '../../shared/i18n/index.js';
import type { CargoDetail, InstalledModule, ModuleProgress, PublicCargo, UpdateAvailable } from '../../shared/module-types.js';

interface ModuleState {
  // State
  modules: InstalledModule[];
  isLoading: boolean;
  error: string | null;
  activating: boolean;
  progress: ModuleProgress | null;
  updates: UpdateAvailable[];
  /** Slug currently being updated, or 'all' during an update-all sweep. */
  updating: string | null;
  /** True while an update check is in flight. */
  checkingUpdates: boolean;
  /** When the last update check finished, or null before the first one. */
  updatesCheckedAt: number | null;
  /** Why the last update check failed, or null if it succeeded. */
  updatesError: string | null;

  // Browse catalog (public, free Hangar cargos)
  catalog: PublicCargo[];
  catalogLoading: boolean;
  catalogError: string | null;
  /** Slug currently being installed from the browse catalog, or null. */
  installingSlug: string | null;

  // Cargo detail (marketing preview shown in the detail modal)
  /** Slug whose detail modal is open, or null when closed. */
  openDetailSlug: string | null;
  /** The fetched detail for the open cargo, or null while loading / on error. */
  detail: CargoDetail | null;
  detailLoading: boolean;
  detailError: string | null;

  // Actions
  loadModules: () => Promise<void>;
  activateLicense: (key: string) => Promise<{ success: boolean; error?: string }>;
  removeLicense: (key: string) => Promise<void>;
  checkUpdates: () => Promise<void>;
  /** Update one module to its latest published version. */
  updateModule: (slug: string) => Promise<{ success: boolean; error?: string }>;
  /** Update every module that has a pending update. Returns how many succeeded. */
  updateAll: () => Promise<number>;
  /**
   * Toggle a module without removing it. Returns success; bundle modules need
   * a restart for the change to take effect (they only load at startup).
   */
  setEnabled: (slug: string, enabled: boolean) => Promise<{ success: boolean; error?: string }>;
  setProgress: (progress: ModuleProgress | null) => void;
  clearError: () => void;
  /** Load the public, free Hangar catalog for the browse section. */
  fetchCatalog: () => Promise<void>;
  /**
   * One-click install a free public cargo by slug, then refresh the installed
   * list. Returns success; installable cargo needs a restart to load.
   */
  installFree: (slug: string) => Promise<{ success: boolean; error?: string }>;
  /** Open the detail modal for a cargo and fetch its marketing preview. */
  openDetail: (slug: string) => Promise<void>;
  /** Close the detail modal and drop the fetched detail. */
  closeDetail: () => void;
}

export const useModuleStore = create<ModuleState>((set, get) => ({
  modules: [],
  isLoading: false,
  error: null,
  activating: false,
  progress: null,
  updates: [],
  updating: null,
  checkingUpdates: false,
  updatesCheckedAt: null,
  updatesError: null,
  catalog: [],
  catalogLoading: false,
  catalogError: null,
  installingSlug: null,
  openDetailSlug: null,
  detail: null,
  detailLoading: false,
  detailError: null,

  loadModules: async () => {
    set({ isLoading: true, error: null });
    try {
      const modules = await window.electronAPI.moduleList();
      set({ modules, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message, isLoading: false });
    }
  },

  activateLicense: async (key: string) => {
    set({ activating: true, error: null, progress: null });
    try {
      const result = await window.electronAPI.moduleActivate(key);
      if (!result.success) {
        set({ activating: false, error: result.error || t('stores:moduleStore.activationFailed') });
        return result;
      }
      // Refresh module list
      await get().loadModules();
      set({ activating: false });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ activating: false, error: message });
      return { success: false, error: message };
    }
  },

  removeLicense: async (key: string) => {
    set({ error: null });
    try {
      await window.electronAPI.moduleRemove(key);
      await get().loadModules();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
    }
  },

  checkUpdates: async () => {
    set({ checkingUpdates: true });
    try {
      const result = await window.electronAPI.moduleCheckUpdates();
      set({
        updates: result.updates,
        updatesError: result.error ?? null,
        checkingUpdates: false,
        updatesCheckedAt: Date.now(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ updatesError: message, checkingUpdates: false, updatesCheckedAt: Date.now() });
    }
  },

  updateModule: async (slug: string) => {
    set({ updating: slug, error: null, progress: null });
    try {
      const result = await window.electronAPI.moduleUpdate(slug);
      if (!result.success) {
        set({ updating: null, error: result.error || t('stores:moduleStore.updateFailed') });
        return result;
      }
      await get().loadModules();
      await get().checkUpdates();
      set({ updating: null });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ updating: null, error: message });
      return { success: false, error: message };
    }
  },

  updateAll: async () => {
    const pending = get().updates.map((u) => u.slug);
    set({ updating: 'all', error: null, progress: null });
    let succeeded = 0;
    // Sequential on purpose: updates share the download pipe and the store,
    // and a licence covering a bundle updates several slugs in one call.
    for (const slug of pending) {
      // A previous iteration may have already cleared this slug's update
      // (bundle licences update sibling modules together).
      if (!get().updates.some((u) => u.slug === slug) && succeeded > 0) continue;
      const result = await window.electronAPI.moduleUpdate(slug);
      if (result.success) {
        succeeded += 1;
        await get().loadModules();
        await get().checkUpdates();
      } else {
        set({ error: result.error || t('stores:moduleStore.updateFailedFor', { slug }) });
      }
    }
    set({ updating: null });
    return succeeded;
  },

  setEnabled: async (slug: string, enabled: boolean) => {
    set({ error: null });
    try {
      const result = await window.electronAPI.moduleSetEnabled(slug, enabled);
      if (!result.success) {
        set({ error: result.error || t('stores:moduleStore.toggleFailed') });
        return { success: false, error: result.error };
      }
      if (result.modules) set({ modules: result.modules });
      else await get().loadModules();
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
      return { success: false, error: message };
    }
  },

  setProgress: (progress) => set({ progress }),

  clearError: () => set({ error: null }),

  fetchCatalog: async () => {
    set({ catalogLoading: true, catalogError: null });
    try {
      const result = await window.electronAPI.moduleCatalogList();
      set({
        catalog: result.cargos,
        catalogError: result.error ?? null,
        catalogLoading: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ catalogError: message, catalogLoading: false });
    }
  },

  installFree: async (slug: string) => {
    set({ installingSlug: slug, error: null, progress: null });
    try {
      const result = await window.electronAPI.moduleInstallFree(slug);
      if (!result.success) {
        set({ installingSlug: null, error: result.error || t('stores:moduleStore.installFailed') });
        return result;
      }
      await get().loadModules();
      set({ installingSlug: null });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ installingSlug: null, error: message });
      return { success: false, error: message };
    }
  },

  openDetail: async (slug: string) => {
    set({ openDetailSlug: slug, detail: null, detailLoading: true, detailError: null });
    try {
      const result = await window.electronAPI.moduleCatalogDetail(slug);
      // A newer open may have superseded this one while the fetch was in
      // flight; ignore the stale result so the modal shows the right cargo.
      if (get().openDetailSlug !== slug) return;
      set({
        detail: result.detail,
        detailError: result.error ?? null,
        detailLoading: false,
      });
    } catch (err) {
      if (get().openDetailSlug !== slug) return;
      const message = err instanceof Error ? err.message : String(err);
      set({ detailError: message, detailLoading: false });
    }
  },

  closeDetail: () => set({ openDetailSlug: null, detail: null, detailLoading: false, detailError: null }),
}));
