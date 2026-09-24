import { create } from 'zustand';
import type { SurveyGroup } from '../../shared/mission-group-types';
import {
  surveyAreaFromGroup,
  type SaveSurveyAreaPayload,
  type SurveyDocument,
  type SurveyDocumentSummary,
} from '../../shared/survey-document-types';
import { polygonArea } from '../components/survey/geo-math';
import type { FleetRepoSite, VaultSurveyArea } from '../../shared/ipc-channels';

/**
 * Saved survey areas: the polygon and generator settings on their own, so a
 * survey outlives the mission it was planned in and opens on another machine.
 */
export function areaPayloadFromGroup(
  group: SurveyGroup,
  meta: { name: string; description?: string; tags?: string[]; site?: string; id?: string },
): SaveSurveyAreaPayload {
  const areaSqm = group.polygon.length >= 3 ? polygonArea(group.polygon) : null;
  return {
    ...(meta.id ? { id: meta.id } : {}),
    name: meta.name,
    description: meta.description ?? '',
    tags: meta.tags ?? [],
    ...(meta.site ? { site: meta.site } : {}),
    ...surveyAreaFromGroup(group, areaSqm),
  };
}

interface SurveyAreaStore {
  areas: SurveyDocumentSummary[];
  allTags: string[];
  search: string;
  isLoading: boolean;
  error: string | null;
  /** Areas committed to the Git Vault, from this machine or any other. */
  vaultAreas: VaultSurveyArea[];
  vaultSites: string[];
  /** Per-site vault contents, including the missions committed under each. */
  vaultSiteInfo: FleetRepoSite[];
  isVaultLoading: boolean;

  loadAreas: () => Promise<void>;
  loadVault: () => Promise<void>;
  /** Commit a saved area to the vault under a site, so other machines get it. */
  pushToVault: (id: string, site: string) => Promise<boolean>;
  /** Copy a vault area into this machine's library, ready to load or edit. */
  pullFromVault: (path: string) => Promise<SurveyDocument | null>;
  setSearch: (search: string) => void;
  getArea: (id: string) => Promise<SurveyDocument | null>;
  /** Save a mission's survey group as a reusable area. Returns the stored document. */
  saveGroupAsArea: (
    group: SurveyGroup,
    meta: { name: string; description?: string; tags?: string[]; site?: string; id?: string },
  ) => Promise<SurveyDocument | null>;
  deleteArea: (id: string) => Promise<boolean>;
  duplicateArea: (id: string, newName: string) => Promise<SurveyDocument | null>;
  exportArea: (id: string) => Promise<string | null>;
  importArea: () => Promise<SurveyDocument | null>;
}

export const useSurveyAreaStore = create<SurveyAreaStore>((set, get) => ({
  areas: [],
  allTags: [],
  search: '',
  isLoading: false,
  error: null,
  vaultAreas: [],
  vaultSites: [],
  vaultSiteInfo: [],
  isVaultLoading: false,

  loadVault: async () => {
    set({ isVaultLoading: true });
    try {
      const [vaultAreas, sites] = await Promise.all([
        window.electronAPI?.fleetRepoListSurveyAreas() ?? Promise.resolve([]),
        window.electronAPI?.fleetRepoListSites() ?? Promise.resolve([]),
      ]);
      set({
        vaultAreas,
        vaultSiteInfo: sites,
        vaultSites: [...new Set([...sites.map((s) => s.site), ...vaultAreas.map((a) => a.site)])].sort(),
        isVaultLoading: false,
      });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), isVaultLoading: false });
    }
  },

  pushToVault: async (id, site) => {
    const doc = await get().getArea(id);
    if (!doc) return false;
    const result = await window.electronAPI?.fleetRepoSnapshotSurveyArea(site, doc);
    if (!result?.success) {
      set({ error: result?.error ?? 'Could not write to the vault' });
      return false;
    }
    // Record the site on the local copy without bumping the revision: the
    // vault and this machine must agree on which revision this is.
    await window.electronAPI?.surveyAreaImportDoc({ ...doc, site });
    await Promise.all([get().loadAreas(), get().loadVault()]);
    return true;
  },

  pullFromVault: async (path) => {
    const doc = await window.electronAPI?.fleetRepoReadSurveyArea(path);
    if (!doc) {
      set({ error: 'Could not read that area from the vault' });
      return null;
    }
    const stored = await window.electronAPI?.surveyAreaImportDoc(doc);
    await get().loadAreas();
    return stored ?? null;
  },

  loadAreas: async () => {
    set({ isLoading: true, error: null });
    try {
      const search = get().search.trim();
      const [areas, allTags] = await Promise.all([
        window.electronAPI?.surveyAreaList(search ? { search } : undefined) ?? Promise.resolve([]),
        window.electronAPI?.surveyAreaGetTags() ?? Promise.resolve([]),
      ]);
      set({ areas, allTags, isLoading: false });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), isLoading: false });
    }
  },

  setSearch: (search) => {
    set({ search });
    void get().loadAreas();
  },

  getArea: async (id) => {
    try {
      return (await window.electronAPI?.surveyAreaGet(id)) ?? null;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return null;
    }
  },

  saveGroupAsArea: async (group, meta) => {
    set({ error: null });
    try {
      const doc = await window.electronAPI?.surveyAreaSave(areaPayloadFromGroup(group, meta));
      if (!doc) return null;
      await get().loadAreas();
      return doc;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return null;
    }
  },

  deleteArea: async (id) => {
    const ok = (await window.electronAPI?.surveyAreaDelete(id)) ?? false;
    if (ok) await get().loadAreas();
    return ok;
  },

  duplicateArea: async (id, newName) => {
    const doc = (await window.electronAPI?.surveyAreaDuplicate(id, newName)) ?? null;
    if (doc) await get().loadAreas();
    return doc;
  },

  exportArea: async (id) => {
    const result = await window.electronAPI?.surveyAreaExportFile(id);
    if (!result?.success) {
      // Cancelling a file dialog is not a failure worth a red banner.
      if (result?.error && result.error !== 'Cancelled') set({ error: result.error });
      return null;
    }
    return result.filePath ?? null;
  },

  importArea: async () => {
    const result = await window.electronAPI?.surveyAreaImportFile();
    if (!result?.success) {
      if (result?.error && result.error !== 'Cancelled') set({ error: result.error });
      return null;
    }
    await get().loadAreas();
    return result.area ?? null;
  },
}));
