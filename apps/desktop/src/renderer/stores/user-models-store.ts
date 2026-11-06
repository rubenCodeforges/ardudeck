import { create } from 'zustand';
import type {
  UserModel, UserModelImportRequest, UserModelImportResult, UserModelPlacement,
} from '../../shared/scene-models/user-models';
import { filterModelFiles } from '../components/models/user-models-helpers';

type LatLng = { lat: number; lng: number };

interface UserModelsStore {
  models: UserModel[];
  watched: string[];
  /** Import failures and models waiting for a position from the latest import. */
  lastImport: UserModelImportResult | null;
  /** Bumped on every import so the toast re-shows for a repeated result. */
  importSeq: number;
  busy: boolean;
  dialogOpen: boolean;
  focusId: string | null;
  /** The model whose origin and heading are being nudged on the 2D maps. */
  adjustId: string | null;
  watchError: string | null;

  refresh(): Promise<void>;
  start(): () => void;
  importModels(req: UserModelImportRequest): Promise<UserModelImportResult | null>;
  importDroppedFiles(files: ArrayLike<File>, dropAt: LatLng): Promise<UserModelImportResult | null>;
  updatePlacement(id: string, placement: UserModelPlacement): Promise<void>;
  setVisible(id: string, visible: boolean): Promise<void>;
  rename(id: string, name: string): Promise<void>;
  remove(id: string): Promise<void>;
  addWatched(): Promise<void>;
  removeWatched(dir: string): Promise<void>;
  openDialog(focusId?: string | null): void;
  closeDialog(): void;
  setAdjust(id: string | null): void;
  dismissImport(): void;
}

const api = () => window.electronAPI?.userModels;

/** Maps register a centre getter; the last one the pilot touched answers "Place at map centre". */
const centerProviders: Array<() => LatLng | null> = [];

export function registerMapCenter(fn: () => LatLng | null): { touch(): void; dispose(): void } {
  centerProviders.push(fn);
  return {
    touch: () => {
      const i = centerProviders.indexOf(fn);
      if (i >= 0 && i !== centerProviders.length - 1) {
        centerProviders.splice(i, 1);
        centerProviders.push(fn);
      }
    },
    dispose: () => {
      const i = centerProviders.indexOf(fn);
      if (i >= 0) centerProviders.splice(i, 1);
    },
  };
}

export function currentMapCenter(): LatLng | null {
  for (let i = centerProviders.length - 1; i >= 0; i--) {
    const c = centerProviders[i]!();
    if (c) return c;
  }
  return null;
}

function replaceModel(models: UserModel[], next: UserModel): UserModel[] {
  return models.map((m) => (m.id === next.id ? next : m));
}

export const useUserModelsStore = create<UserModelsStore>((set, get) => ({
  models: [],
  watched: [],
  lastImport: null,
  importSeq: 0,
  busy: false,
  dialogOpen: false,
  focusId: null,
  adjustId: null,
  watchError: null,

  refresh: async () => {
    const a = api();
    if (!a) return;
    try {
      const [models, watched] = await Promise.all([a.list(), a.listWatched()]);
      set({ models, watched });
    } catch {
      // handlers not registered yet
    }
  },

  start: () => {
    void get().refresh();
    const off = api()?.onChanged((models) => {
      set((s) => ({ models, adjustId: models.some((m) => m.id === s.adjustId) ? s.adjustId : null }));
      void api()?.listWatched().then((watched) => set({ watched })).catch(() => {});
    });
    return () => off?.();
  },

  importModels: async (req) => {
    const a = api();
    if (!a) return null;
    set({ busy: true });
    try {
      const result = await a.import({ ...req, dropAt: req.dropAt ?? currentMapCenter() ?? undefined });
      set((s) => ({
        lastImport: result,
        importSeq: s.importSeq + 1,
        models: mergeModels(s.models, result.imported),
      }));
      return result;
    } catch (e) {
      const result: UserModelImportResult = {
        imported: [],
        failed: [{ file: (req.paths ?? []).join(', '), error: e instanceof Error ? e.message : String(e) }],
        needsPlacement: [],
      };
      set((s) => ({ lastImport: result, importSeq: s.importSeq + 1 }));
      return result;
    } finally {
      set({ busy: false });
    }
  },

  importDroppedFiles: async (files, dropAt) => {
    const a = api();
    if (!a) return null;
    const paths = filterModelFiles(files).map((f) => a.pathForFile(f)).filter((p) => !!p);
    if (paths.length === 0) return null;
    return get().importModels({ paths, dropAt });
  },

  updatePlacement: async (id, placement) => {
    set((s) => ({ models: s.models.map((m) => (m.id === id ? { ...m, placement } : m)) }));
    const next = await api()?.update(id, { placement }).catch(() => null);
    if (next) set((s) => ({ models: replaceModel(s.models, next) }));
  },

  setVisible: async (id, visible) => {
    set((s) => ({ models: s.models.map((m) => (m.id === id ? { ...m, visible } : m)) }));
    const next = await api()?.update(id, { visible }).catch(() => null);
    if (next) set((s) => ({ models: replaceModel(s.models, next) }));
  },

  rename: async (id, name) => {
    const next = await api()?.update(id, { name }).catch(() => null);
    if (next) set((s) => ({ models: replaceModel(s.models, next) }));
  },

  remove: async (id) => {
    const ok = await api()?.remove(id).catch(() => false);
    if (ok) {
      set((s) => ({
        models: s.models.filter((m) => m.id !== id),
        adjustId: s.adjustId === id ? null : s.adjustId,
        focusId: s.focusId === id ? null : s.focusId,
      }));
    }
  },

  addWatched: async () => {
    const a = api();
    if (!a) return;
    try {
      const res = await a.addWatched(undefined);
      set({ watchError: res.error ?? null });
      if (res.dir) await get().refresh();
    } catch (e) {
      set({ watchError: e instanceof Error ? e.message : String(e) });
    }
  },

  removeWatched: async (dir) => {
    const ok = await api()?.removeWatched(dir).catch(() => false);
    if (ok) await get().refresh();
  },

  openDialog: (focusId = null) => set({ dialogOpen: true, focusId }),
  closeDialog: () => set({ dialogOpen: false, focusId: null }),
  setAdjust: (id) => set({ adjustId: id }),
  dismissImport: () => set({ lastImport: null }),
}));

function mergeModels(current: UserModel[], incoming: UserModel[]): UserModel[] {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()];
}
