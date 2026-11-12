/**
 * Boundary guides: imported polygons shown on the mission map as reference
 * outlines. Unlike the survey import flow, importing a guide generates
 * NOTHING - the user later starts a survey from a guide on demand, with
 * whichever generator (built-in pattern or module engine) is selected in the
 * survey panel.
 *
 * Guides persist across sessions via the settings store, independent of
 * mission files - they are geography, not mission content.
 */
import { create } from 'zustand';
import { t } from '../../shared/i18n/index.js';
import type { LatLng } from '../components/survey/survey-types';
import { parseGisArea, parseGisLines } from '../../shared/gis-area-import';
import { simplifyPolygon } from '../components/survey/geo-math';
import { GROUP_COLOR_PALETTE } from '../../shared/mission-group-types';
import { useSettingsStore } from './settings-store';
import { useSurveyStore } from './survey-store';

/** What a guide stands for. Drives its default colour and how it is drawn; absent = a plain area. */
export type GuideRole = 'area' | 'interest' | 'nofly' | 'takeoff' | 'poi' | 'note';
export const GUIDE_ROLES: GuideRole[] = ['area', 'interest', 'nofly', 'takeoff', 'poi', 'note'];

/** Roles written before the generic names; read once on load. */
const LEGACY_ROLES: Record<string, GuideRole> = { anomaly: 'interest', sample: 'poi' };

// Kept clear of the mission's blues so a guide never reads as part of the flight path.
export const GUIDE_ROLE_COLORS: Record<GuideRole, string> = {
  area: '#e2e8f0',
  interest: '#f97316',
  nofly: '#ef4444',
  takeoff: '#22c55e',
  poi: '#facc15',
  note: '#c084fc',
};

export const GUIDE_PALETTE = ['#f97316', '#facc15', '#22c55e', '#14b8a6', '#e2e8f0', '#c084fc', '#ec4899', '#ef4444'];

export type GuideGeometry = 'polygon' | 'points' | 'line';

export function minGuidePoints(kind: GuideGeometry): number {
  return kind === 'polygon' ? 3 : kind === 'line' ? 2 : 1;
}

export interface MapGuide {
  id: string;
  name: string;
  polygon: LatLng[];
  holes: LatLng[][];
  visible: boolean;
  color: string;
  /**
   * 'points' renders numbered markers (surveyed RTK points) instead of an
   * outline, 'line' renders an open path (a road, a rail line, a power line)
   * that can be used as a corridor centerline. In both cases `polygon` holds
   * the ordered vertices. Absent = 'polygon' (guides that predate the field).
   */
  kind?: 'polygon' | 'points' | 'line';
  /** Per-point labels for 'points' guides (parallel to `polygon`). */
  pointLabels?: (string | null)[];
  role?: GuideRole;
  /** Where it came from or a remark, shown in the guides panel. */
  notes?: string;
  /** Who added it: an import, an agent, a cargo. */
  source?: string;
}

export type GuideInput = Omit<MapGuide, 'id' | 'visible' | 'holes' | 'color'> & {
  id?: string;
  visible?: boolean;
  holes?: LatLng[][];
  color?: string;
};

const LABELS_KEY = 'ardudeck:guide-labels';
function readShowLabels(): boolean {
  try { return localStorage.getItem(LABELS_KEY) !== '0'; } catch { return true; }
}

interface GuideStore {
  guides: MapGuide[];
  /** Name chips on the map. Per viewer. */
  showLabels: boolean;
  setShowLabels: (show: boolean) => void;
  /** Add (no id, or an unknown id) or replace a guide. Points are kept as given. */
  upsertGuide: (input: GuideInput) => MapGuide;
  patchGuide: (id: string, patch: Partial<Pick<MapGuide, 'name' | 'color' | 'role' | 'notes' | 'polygon' | 'holes'>>) => void;
  /** Monotonic trigger + bounds for "focus the map on this guide" requests. */
  focusSeq: number;
  focusBounds: [[number, number], [number, number]] | null;

  /**
   * Import guides from a GIS file (KML/KMZ/GeoJSON/SHP) via the main-process
   * file dialog. One guide per polygon, holes preserved, no generation.
   */
  importGuides: () => Promise<{ ok: boolean; count: number; error?: string }>;
  /**
   * Add guides from already-parsed polygons (Area Editor "Mark as guide"
   * commit path). Same simplification and coloring as the file import.
   */
  addGuidesFromAreas: (areas: Array<{ polygon: LatLng[]; holes?: LatLng[][]; name?: string }>) => number;
  /**
   * Add surveyed points (RTK pole measurements) as a guide. `connect: true`
   * closes them into a polygon outline (needs >= 3); otherwise they render as
   * numbered markers. Points are deliberate measurements - no simplification.
   */
  addSurveyedPoints: (
    points: Array<{ lat: number; lng: number; label?: string | null }>,
    opts: { connect: boolean; name?: string },
  ) => { ok: boolean; error?: string };
  toggleGuide: (id: string) => void;
  setAllVisible: (visible: boolean) => void;
  removeGuide: (id: string) => void;
  clearGuides: () => void;
  /** Pan/zoom the mission map to a guide (and unhide it if hidden). */
  focusGuide: (id: string) => void;
  /**
   * Load a line guide as a corridor centerline and open the survey panel with
   * the corridor pattern selected. The guide itself stays on the map.
   */
  startCorridorFromGuide: (id: string) => void;
  /**
   * Load a guide into the survey draft (polygon + holes) and open the survey
   * panel. Generation then runs through the normal flow, so the currently
   * selected engine (grid, TOPAS, ...) applies and Insert commits as usual.
   * The guide itself stays untouched on the map.
   */
  startSurveyFromGuide: (id: string) => void;
}

function uuid(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function persist(guides: MapGuide[]): void {
  useSettingsStore.getState().setMapGuides(guides as unknown as Record<string, unknown>[]);
}

export const useGuideStore = create<GuideStore>((set, get) => ({
  guides: [],
  showLabels: readShowLabels(),
  setShowLabels: (showLabels) => {
    try { localStorage.setItem(LABELS_KEY, showLabels ? '1' : '0'); } catch { /* per-viewer convenience only */ }
    set({ showLabels });
  },

  upsertGuide: (input) => {
    const existing = input.id ? get().guides.find((g) => g.id === input.id) : undefined;
    const role = input.role ?? existing?.role;
    const guide: MapGuide = {
      ...existing,
      ...input,
      id: existing?.id ?? input.id ?? uuid(),
      holes: input.holes ?? existing?.holes ?? [],
      visible: input.visible ?? existing?.visible ?? true,
      color: input.color ?? existing?.color ?? (role ? GUIDE_ROLE_COLORS[role] : GROUP_COLOR_PALETTE[get().guides.length % GROUP_COLOR_PALETTE.length]!),
    };
    const guides = existing ? get().guides.map((g) => (g.id === guide.id ? guide : g)) : [...get().guides, guide];
    set({ guides });
    persist(guides);
    return guide;
  },

  patchGuide: (id, patch) => {
    const guides = get().guides.map((g) => (g.id === id ? { ...g, ...patch } : g));
    set({ guides });
    persist(guides);
  },
  focusSeq: 0,
  focusBounds: null,

  importGuides: async () => {
    const api = window.electronAPI;
    if (!api?.importSurveyArea) return { ok: false, count: 0, error: t('stores:guideStore.importUnavailable') };
    const res = await api.importSurveyArea();
    if (!res.success) {
      return { ok: false, count: 0, error: res.error === 'Cancelled' ? undefined : res.error };
    }
    if (!res.content || !res.format) return { ok: false, count: 0, error: t('stores:guideStore.emptyFile') };
    const areas = parseGisArea(res.content, res.format);
    const lines = parseGisLines(res.content, res.format);
    if (areas.length === 0 && lines.length === 0) {
      return { ok: false, count: 0, error: t('stores:guideStore.noShapes') };
    }

    // Same vertex thinning as the survey import: GIS boundaries are digitized
    // at sub-meter detail that a guide outline doesn't need.
    const toleranceM = useSettingsStore.getState().surveyPerformance.importSimplifyToleranceM;
    const base = get().guides.length;
    const added: MapGuide[] = areas.map((area, i) => ({
      id: uuid(),
      name: `Guide ${base + i + 1}`,
      polygon: simplifyPolygon(
        area.polygon.map((p) => ({ lat: p.lat, lng: p.lng })),
        toleranceM,
      ),
      holes: area.holes.map((ring) =>
        simplifyPolygon(ring.map((p) => ({ lat: p.lat, lng: p.lng })), toleranceM),
      ),
      visible: true,
      color: GROUP_COLOR_PALETTE[(base + i) % GROUP_COLOR_PALETTE.length]!,
    }));

    const lineBase = base + added.length;
    const addedLines: MapGuide[] = lines.map((line, i) => ({
      id: uuid(),
      name: line.name || `Line ${lineBase + i + 1}`,
      polygon: simplifyPolygon(line.path.map((p) => ({ lat: p.lat, lng: p.lng })), toleranceM),
      holes: [],
      visible: true,
      color: GROUP_COLOR_PALETTE[(lineBase + i) % GROUP_COLOR_PALETTE.length]!,
      kind: 'line',
    }));

    const guides = [...get().guides, ...added, ...addedLines];
    set({ guides });
    persist(guides);
    return { ok: true, count: added.length + addedLines.length };
  },

  addGuidesFromAreas: (areas) => {
    const toleranceM = useSettingsStore.getState().surveyPerformance.importSimplifyToleranceM;
    const base = get().guides.length;
    const added: MapGuide[] = areas
      .filter((a) => a.polygon.length >= 3)
      .map((a, i) => ({
        id: uuid(),
        name: a.name || `Guide ${base + i + 1}`,
        polygon: simplifyPolygon(a.polygon.map((p) => ({ lat: p.lat, lng: p.lng })), toleranceM),
        holes: (a.holes ?? []).map((ring) =>
          simplifyPolygon(ring.map((p) => ({ lat: p.lat, lng: p.lng })), toleranceM),
        ),
        visible: true,
        color: GROUP_COLOR_PALETTE[(base + i) % GROUP_COLOR_PALETTE.length]!,
      }));
    if (added.length === 0) return 0;
    const guides = [...get().guides, ...added];
    set({ guides });
    persist(guides);
    return added.length;
  },

  addSurveyedPoints: (points, opts) => {
    if (points.length === 0) return { ok: false, error: t('stores:guideStore.noValidPoints') };
    if (opts.connect && points.length < 3) {
      return { ok: false, error: 'A polygon needs at least 3 points - add as markers instead.' };
    }
    const base = get().guides.length;
    const guide: MapGuide = {
      id: uuid(),
      name: opts.name?.trim() || `RTK points ${base + 1}`,
      polygon: points.map((p) => ({ lat: p.lat, lng: p.lng })),
      holes: [],
      visible: true,
      color: GROUP_COLOR_PALETTE[base % GROUP_COLOR_PALETTE.length]!,
      kind: opts.connect ? 'polygon' : 'points',
      pointLabels: points.map((p) => p.label ?? null),
    };
    const guides = [...get().guides, guide];
    set({ guides });
    persist(guides);
    get().focusGuide(guide.id);
    return { ok: true };
  },

  toggleGuide: (id) => {
    const guides = get().guides.map((g) => (g.id === id ? { ...g, visible: !g.visible } : g));
    set({ guides });
    persist(guides);
  },

  setAllVisible: (visible) => {
    const guides = get().guides.map((g) => ({ ...g, visible }));
    set({ guides });
    persist(guides);
  },

  removeGuide: (id) => {
    const guides = get().guides.filter((g) => g.id !== id);
    set({ guides });
    persist(guides);
  },

  clearGuides: () => {
    set({ guides: [] });
    persist([]);
  },

  focusGuide: (id) => {
    const guide = get().guides.find((g) => g.id === id);
    if (!guide || guide.polygon.length === 0) return;
    const lats = guide.polygon.map((p) => p.lat);
    const lngs = guide.polygon.map((p) => p.lng);
    // Focusing a hidden guide would pan to seemingly nothing - unhide it.
    if (!guide.visible) {
      const guides = get().guides.map((g) => (g.id === id ? { ...g, visible: true } : g));
      set({ guides });
      persist(guides);
    }
    set((s) => ({
      focusSeq: s.focusSeq + 1,
      focusBounds: [
        [Math.min(...lats), Math.min(...lngs)],
        [Math.max(...lats), Math.max(...lngs)],
      ],
    }));
  },

  startSurveyFromGuide: (id) => {
    const guide = get().guides.find((g) => g.id === id);
    if (!guide) return;
    if (guide.kind === 'line') {
      useSurveyStore.getState().loadDraftFromCenterline(guide.polygon);
      return;
    }
    useSurveyStore.getState().loadDraftFromPolygon(guide.polygon, guide.holes);
  },

  startCorridorFromGuide: (id) => {
    const guide = get().guides.find((g) => g.id === id);
    if (!guide) return;
    useSurveyStore.getState().loadDraftFromCenterline(guide.polygon);
  },
}));

// Hydration mirrors survey-store: apply persisted guides once settings load,
// and immediately if they already have (late import / HMR).
function hydrate(): void {
  const raw = useSettingsStore.getState().mapGuides;
  if (Array.isArray(raw) && raw.length > 0) {
    const guides = (raw as unknown as MapGuide[]).map((g) => {
      const legacy = g.role ? LEGACY_ROLES[g.role as string] : undefined;
      return legacy ? { ...g, role: legacy } : g;
    });
    useGuideStore.setState({ guides });
  }
}

useSettingsStore.subscribe(
  (state) => state._isInitialized,
  (init, prev) => {
    if (init && !prev) hydrate();
  },
);

if (useSettingsStore.getState()._isInitialized) hydrate();
