import { create } from 'zustand';
import { t as i18nT } from '../../shared/i18n/index.js';
import {
  loadFont,
  CachedFont,
  OsdScreenBuffer,
  VideoType,
  getOsdRows,
  getOsdCols,
  normalizeVideoType,
} from '../utils/osd/font-renderer';
import { getElementSize } from '../utils/osd/element-sizes';
import { remapToCanvas } from '../utils/osd/osd-layout';
import { useTelemetryStore } from './telemetry-store';
import { useConnectionStore } from './connection-store';
import { useParameterStore } from './parameter-store';
import { useMissionStore } from './mission-store';
import {
  type OsdElementId,
  type OsdElementKey,
  buildDefaultPositions,
  buildBfIndexMap,
} from '../utils/osd/element-registry';
import { ELEMENT_REGISTRY } from '../utils/osd/element-registry';
import {
  listModuleOsdElements,
  subscribeModuleOsdElements,
} from '../modules/module-osd-registry';
import {
  type DemoTelemetry,
  DEFAULT_DEMO_VALUES,
  renderElement,
} from '../utils/osd/element-renderers';
import {
  buildLiveTelemetry,
  createOsdLiveTracker,
  type OsdLiveTracker,
  type LiveTelemetrySnapshot,
} from '../utils/osd/live-telemetry';
import {
  type ArdupilotOsdScreen,
  hasArdupilotOsd,
  detectArdupilotOsdScreens,
  readArdupilotOsd,
  buildArdupilotOsdWrites,
  supportedArdupilotElements,
} from '../utils/osd/ardupilot-osd';

// Re-export types used by consumers
export type { OsdElementId, OsdElementKey } from '../utils/osd/element-registry';
export type { DemoTelemetry } from '../utils/osd/element-renderers';

// Import bundled fonts (Vite raw imports)
import defaultFontMcm from '../assets/osd-fonts/default.mcm?raw';
import boldFontMcm from '../assets/osd-fonts/bold.mcm?raw';
import clarityFontMcm from '../assets/osd-fonts/clarity.mcm?raw';
import clarityMediumFontMcm from '../assets/osd-fonts/clarity_medium.mcm?raw';
import impactFontMcm from '../assets/osd-fonts/impact.mcm?raw';
import impactMiniFontMcm from '../assets/osd-fonts/impact_mini.mcm?raw';
import largeFontMcm from '../assets/osd-fonts/large.mcm?raw';
import visionFontMcm from '../assets/osd-fonts/vision.mcm?raw';

/** Bundled font definitions */
export const BUNDLED_FONTS: Record<string, string> = {
  default: defaultFontMcm,
  bold: boldFontMcm,
  clarity: clarityFontMcm,
  clarity_medium: clarityMediumFontMcm,
  impact: impactFontMcm,
  impact_mini: impactMiniFontMcm,
  large: largeFontMcm,
  vision: visionFontMcm,
};

export const BUNDLED_FONT_NAMES = Object.keys(BUNDLED_FONTS);

/** OSD element position */
export interface OsdElementPosition {
  x: number;
  y: number;
  enabled: boolean;
}

/**
 * Layout map. Built-in ids resolve to a guaranteed position (mapped type),
 * while module-contributed string ids resolve to `OsdElementPosition | undefined`
 * (index signature under noUncheckedIndexedAccess) and must be guarded.
 */
export type OsdElementPositions = Record<OsdElementId, OsdElementPosition> & {
  [key: string]: OsdElementPosition;
};

/** Default element positions built from registry */
export const DEFAULT_ELEMENT_POSITIONS: Record<OsdElementId, OsdElementPosition> =
  buildDefaultPositions() as Record<OsdElementId, OsdElementPosition>;

/** Seed positions for every currently-registered module element. */
function moduleDefaultPositions(): Record<string, OsdElementPosition> {
  const out: Record<string, OsdElementPosition> = {};
  for (const reg of listModuleOsdElements()) {
    const dp = reg.defaultPosition ?? { x: 1, y: 1, enabled: false };
    out[reg.id] = { x: dp.x, y: dp.y, enabled: dp.enabled };
  }
  return out;
}

/** What feeds the preview. */
export type OsdDataSource = 'demo' | 'live';

/** Which device the editor is targeting. */
export type OsdTarget = 'none' | 'ardupilot' | 'msp';

export interface OsdFcState {
  /** Whether a sync (read/upload) is in progress. */
  busy: boolean;
  /** Progress of an in-flight upload, or null. */
  progress: { done: number; total: number } | null;
  /** Last status line shown to the user. */
  message: string | null;
  /** True if the last op was an error. */
  error: boolean;
}

// ── persistence ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'ardudeck.osd.editor.v1';

interface PersistedOsd {
  fontName: string;
  videoType: VideoType;
  scale: number;
  fitMode: boolean;
  showGrid: boolean;
  backgroundColor: string;
  positions: Record<string, OsdElementPosition>;
  presets: Record<string, Record<string, OsdElementPosition>>;
}

function loadPersisted(): Partial<PersistedOsd> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<PersistedOsd>) : {};
  } catch {
    return {};
  }
}

function savePersisted(store: OsdStore) {
  try {
    const data: PersistedOsd = {
      fontName: store.currentFontName || 'default',
      videoType: store.videoType,
      scale: store.scale,
      fitMode: store.fitMode,
      showGrid: store.showGrid,
      backgroundColor: store.backgroundColor,
      positions: store.elementPositions,
      presets: store.presets,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage may be unavailable; persistence is best-effort.
  }
}

const persisted = loadPersisted();

function mergePositions(
  saved: Record<string, OsdElementPosition> | undefined,
): OsdElementPositions {
  const base: Record<string, OsdElementPosition> = {
    ...DEFAULT_ELEMENT_POSITIONS,
    ...moduleDefaultPositions(),
  };
  if (saved) {
    for (const def of ELEMENT_REGISTRY) {
      const s = saved[def.id];
      if (s) base[def.id] = { x: s.x, y: s.y, enabled: s.enabled };
    }
    // Restore saved module-element positions (string ids). Keep them even if the
    // contributing module hasn't registered yet this session, so a later
    // registration doesn't clobber the user's placement.
    for (const [id, s] of Object.entries(saved)) {
      if (!(id in DEFAULT_ELEMENT_POSITIONS)) base[id] = { x: s.x, y: s.y, enabled: s.enabled };
    }
  }
  return base as OsdElementPositions;
}

// ── FC detection ──────────────────────────────────────────────────────────

function detectTarget(): OsdTarget {
  const conn = useConnectionStore.getState().connectionState;
  if (!conn.isConnected) return 'none';
  if (conn.protocol === 'msp' || conn.fcVariant) return 'msp';
  if (conn.autopilot === 'ArduPilot') return 'ardupilot';
  return 'none';
}

interface OsdStore {
  // Font state
  currentFont: CachedFont | null;
  currentFontName: string;
  isLoadingFont: boolean;
  fontError: string | null;

  // Display settings
  videoType: VideoType;
  scale: number;
  fitMode: boolean;
  showGrid: boolean;
  backgroundColor: string;

  // Preview data source
  dataSource: OsdDataSource;

  // Demo values
  demoValues: DemoTelemetry;

  // Element positions (the working layout; includes module-contributed ids)
  elementPositions: OsdElementPositions;

  // Named local presets
  presets: Record<string, Record<string, OsdElementPosition>>;

  // FC sync
  target: OsdTarget;
  screen: ArdupilotOsdScreen;
  availableScreens: ArdupilotOsdScreen[];
  supportedElements: Set<OsdElementId> | null; // null = all (sim / MSP)
  fc: OsdFcState;
  liveTracker: OsdLiveTracker | null;

  // Screen buffer
  screenBuffer: OsdScreenBuffer;
  renderVersion: number;

  // Actions — font/display
  loadBundledFont: (name: string) => Promise<void>;
  loadFontFromContent: (content: string, name: string) => Promise<void>;
  setVideoType: (type: VideoType) => void;
  setScale: (scale: number) => void;
  setFitMode: (fit: boolean) => void;
  setShowGrid: (show: boolean) => void;
  setBackgroundColor: (color: string) => void;

  // Actions — preview
  setDataSource: (source: OsdDataSource) => void;
  updateDemoValue: <K extends keyof DemoTelemetry>(key: K, value: DemoTelemetry[K]) => void;
  setDemoValues: (values: Partial<DemoTelemetry>) => void;
  resetDemoValues: () => void;

  // Actions — layout
  setElementPosition: (id: OsdElementKey, position: Partial<OsdElementPosition>) => void;
  toggleElement: (id: OsdElementKey) => void;
  resetElementPositions: () => void;
  mergeModuleElementDefaults: () => void;
  autoArrangeToCanvas: () => void;
  savePreset: (name: string) => void;
  loadPreset: (name: string) => void;
  deletePreset: (name: string) => void;

  // Actions — FC sync
  refreshTarget: () => void;
  setScreen: (screen: ArdupilotOsdScreen) => void;
  readFromFc: () => Promise<boolean>;
  uploadToFc: () => Promise<boolean>;
  uploadFontToFc: () => Promise<boolean>;
  clearFcMessage: () => void;
  resetLiveTracker: () => void;

  // Render
  updateScreenBuffer: () => void;
}

export const useOsdStore = create<OsdStore>((set, get) => ({
  // Initial state
  currentFont: null,
  currentFontName: '',
  isLoadingFont: false,
  fontError: null,

  videoType: normalizeVideoType(persisted.videoType),
  scale: persisted.scale ?? 2,
  fitMode: persisted.fitMode ?? true,
  showGrid: persisted.showGrid ?? false,
  backgroundColor: persisted.backgroundColor ?? 'rgba(0, 100, 200, 0.6)',

  dataSource: 'demo',

  demoValues: { ...DEFAULT_DEMO_VALUES },

  elementPositions: mergePositions(persisted.positions),
  presets: persisted.presets ?? {},

  target: 'none',
  screen: 1,
  availableScreens: [],
  supportedElements: null,
  fc: { busy: false, progress: null, message: null, error: false },
  liveTracker: null,

  screenBuffer: new OsdScreenBuffer(normalizeVideoType(persisted.videoType)),
  renderVersion: 0,

  // ── font/display ──────────────────────────────────────────────────────
  loadBundledFont: async (name: string) => {
    const content = BUNDLED_FONTS[name];
    if (!content) {
      set({ fontError: i18nT('stores:osdStore.unknownFont', { name }) });
      return;
    }
    set({ isLoadingFont: true, fontError: null });
    try {
      const font = loadFont(content, name);
      set({ currentFont: font, currentFontName: name, isLoadingFont: false });
      get().updateScreenBuffer();
      savePersisted(get());
    } catch (err) {
      set({
        fontError: err instanceof Error ? err.message : i18nT('stores:osdStore.loadFontFailed'),
        isLoadingFont: false,
      });
    }
  },

  loadFontFromContent: async (content: string, name: string) => {
    set({ isLoadingFont: true, fontError: null });
    try {
      const font = loadFont(content, name);
      set({ currentFont: font, currentFontName: name, isLoadingFont: false });
      get().updateScreenBuffer();
    } catch (err) {
      set({
        fontError: err instanceof Error ? err.message : i18nT('stores:osdStore.loadFontFailed'),
        isLoadingFont: false,
      });
    }
  },

  setVideoType: (videoType: VideoType) => {
    const old = get().videoType;
    const oldCols = getOsdCols(old);
    const oldRows = getOsdRows(old);
    const newCols = getOsdCols(videoType);
    const newRows = getOsdRows(videoType);

    let positions = get().elementPositions;
    // Reflow the layout when the canvas changes size (e.g. analog 30x16 -> HD
    // 50x18) so elements keep their relative placement instead of clustering in
    // the top-left. Anchor-preserving: an element at the right/bottom edge stays
    // at the right/bottom edge of the new canvas.
    if (oldCols !== newCols || oldRows !== newRows) {
      const remapped = { ...positions } as typeof positions;
      for (const [id, pos] of Object.entries(positions) as [OsdElementId, OsdElementPosition][]) {
        const { x, y } = remapToCanvas(pos, getElementSize(id), oldCols, oldRows, newCols, newRows);
        remapped[id] = { ...pos, x, y };
      }
      positions = remapped;
    }

    get().screenBuffer.resize(videoType);
    set({ videoType, elementPositions: positions });
    get().updateScreenBuffer();
    savePersisted(get());
  },

  setScale: (scale: number) => {
    set({ scale, fitMode: false });
    savePersisted(get());
  },

  setFitMode: (fitMode: boolean) => {
    set({ fitMode });
    savePersisted(get());
  },

  setShowGrid: (showGrid: boolean) => {
    set({ showGrid });
    savePersisted(get());
  },

  setBackgroundColor: (backgroundColor: string) => {
    set({ backgroundColor });
    savePersisted(get());
  },

  // ── preview ───────────────────────────────────────────────────────────
  setDataSource: (dataSource: OsdDataSource) => {
    if (dataSource === 'live' && !get().liveTracker) {
      set({ liveTracker: createOsdLiveTracker(Date.now()) });
    }
    set({ dataSource });
    get().updateScreenBuffer();
  },

  updateDemoValue: (key, value) => {
    set((state) => ({ demoValues: { ...state.demoValues, [key]: value } }));
    get().updateScreenBuffer();
  },

  setDemoValues: (values: Partial<DemoTelemetry>) => {
    set((state) => ({ demoValues: { ...state.demoValues, ...values } }));
    get().updateScreenBuffer();
  },

  resetDemoValues: () => {
    set({ demoValues: { ...DEFAULT_DEMO_VALUES } });
    get().updateScreenBuffer();
  },

  // ── layout ────────────────────────────────────────────────────────────
  setElementPosition: (id: OsdElementKey, position: Partial<OsdElementPosition>) => {
    set((state) => {
      const prev = state.elementPositions[id] ?? { x: 0, y: 0, enabled: false };
      return {
        elementPositions: {
          ...state.elementPositions,
          [id]: { ...prev, ...position },
        },
      };
    });
    get().updateScreenBuffer();
    savePersisted(get());
  },

  toggleElement: (id: OsdElementKey) => {
    set((state) => {
      const prev = state.elementPositions[id] ?? { x: 0, y: 0, enabled: false };
      return {
        elementPositions: {
          ...state.elementPositions,
          [id]: { ...prev, enabled: !prev.enabled },
        },
      };
    });
    get().updateScreenBuffer();
    savePersisted(get());
  },

  resetElementPositions: () => {
    set({ elementPositions: mergePositions(undefined) });
    get().updateScreenBuffer();
    savePersisted(get());
  },

  // Ensure any module element registered after init has a seeded position, so
  // it shows in the palette and can be enabled. Never overwrites existing
  // (possibly user-adjusted or persisted) placements.
  mergeModuleElementDefaults: () => {
    set((state) => {
      const next: Record<string, OsdElementPosition> = { ...state.elementPositions };
      let changed = false;
      for (const reg of listModuleOsdElements()) {
        if (!next[reg.id]) {
          const dp = reg.defaultPosition ?? { x: 1, y: 1, enabled: false };
          next[reg.id] = { x: dp.x, y: dp.y, enabled: dp.enabled };
          changed = true;
        }
      }
      return changed ? { elementPositions: next as OsdElementPositions } : {};
    });
    get().updateScreenBuffer();
  },

  // Redistribute every element across the CURRENT canvas using its default
  // analog (30x16) anchor remapped to the active format — so a switch to HD
  // spreads elements out instead of leaving them bunched in the corner. Keeps
  // each element's enabled state.
  autoArrangeToCanvas: () => {
    const { videoType, elementPositions } = get();
    const cols = getOsdCols(videoType);
    const rows = getOsdRows(videoType);
    const next = { ...elementPositions } as typeof elementPositions;
    for (const [id, pos] of Object.entries(elementPositions) as [OsdElementId, OsdElementPosition][]) {
      const def = DEFAULT_ELEMENT_POSITIONS[id];
      const { x, y } = remapToCanvas(def, getElementSize(id), 30, 16, cols, rows);
      next[id] = { ...pos, x, y };
    }
    set({ elementPositions: next });
    get().updateScreenBuffer();
    savePersisted(get());
  },

  savePreset: (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    set((state) => ({
      presets: { ...state.presets, [trimmed]: { ...state.elementPositions } },
    }));
    savePersisted(get());
  },

  loadPreset: (name: string) => {
    const preset = get().presets[name];
    if (!preset) return;
    set({ elementPositions: mergePositions(preset) });
    get().updateScreenBuffer();
    savePersisted(get());
  },

  deletePreset: (name: string) => {
    set((state) => {
      const next = { ...state.presets };
      delete next[name];
      return { presets: next };
    });
    savePersisted(get());
  },

  // ── FC sync ───────────────────────────────────────────────────────────
  refreshTarget: () => {
    const target = detectTarget();
    if (target === 'ardupilot') {
      const params = useParameterStore.getState().parameters;
      const screens = detectArdupilotOsdScreens(params);
      const screen = screens.includes(get().screen) ? get().screen : (screens[0] ?? 1);
      set({
        target,
        availableScreens: screens,
        screen,
        supportedElements: hasArdupilotOsd(params)
          ? supportedArdupilotElements(params, screen)
          : null,
      });
    } else {
      set({ target, availableScreens: [], supportedElements: null });
    }
  },

  setScreen: (screen: ArdupilotOsdScreen) => {
    set({ screen });
    if (get().target === 'ardupilot') {
      const params = useParameterStore.getState().parameters;
      set({ supportedElements: supportedArdupilotElements(params, screen) });
    }
  },

  readFromFc: async () => {
    const target = detectTarget();
    set({ fc: { busy: true, progress: null, message: i18nT('stores:osdStore.reading'), error: false } });

    try {
      if (target === 'msp') {
        const config = (await window.electronAPI.mspGetOsdConfig()) as {
          elements: { index: number; x: number; y: number; visible: boolean }[];
          videoSystem?: number;
        } | null;
        if (!config || config.elements.length === 0) {
          set({ fc: { busy: false, progress: null, message: i18nT('stores:osdStore.noConfig'), error: true } });
          return false;
        }
        // videoSystem: 1=PAL, 2=NTSC, 3=HD (Betaflight-HD compatible canvas)
        if (config.videoSystem === 3) get().setVideoType('BFHD');
        else if (config.videoSystem === 2) get().setVideoType('NTSC');
        else if (config.videoSystem === 1) get().setVideoType('PAL');
        const bfMap = buildBfIndexMap();
        const next = { ...get().elementPositions };
        let count = 0;
        for (const el of config.elements) {
          const id = bfMap[el.index];
          if (id && next[id]) {
            next[id] = { x: el.x, y: el.y, enabled: el.visible };
            count++;
          }
        }
        set({
          elementPositions: next,
          fc: { busy: false, progress: null, message: i18nT('stores:osdStore.loadedFromFc', { count }), error: false },
        });
        get().updateScreenBuffer();
        savePersisted(get());
        return count > 0;
      }

      if (target === 'ardupilot') {
        let params = useParameterStore.getState().parameters;
        if (params.size === 0) {
          set({ fc: { busy: true, progress: null, message: i18nT('common:downloadingParameters'), error: false } });
          await useParameterStore.getState().fetchParameters();
          params = useParameterStore.getState().parameters;
        }
        if (!hasArdupilotOsd(params)) {
          set({ fc: { busy: false, progress: null, message: i18nT('stores:osdStore.noOsdParams'), error: true } });
          return false;
        }
        const screen = get().screen;
        const { positions, resolved } = readArdupilotOsd(params, screen);
        const next = { ...get().elementPositions };
        for (const [id, pos] of Object.entries(positions) as [OsdElementId, OsdElementPosition][]) {
          next[id] = { x: pos.x, y: pos.y, enabled: pos.enabled };
        }
        set({
          elementPositions: next,
          supportedElements: supportedArdupilotElements(params, screen),
          availableScreens: detectArdupilotOsdScreens(params),
          fc: { busy: false, progress: null, message: i18nT('stores:osdStore.loadedFromScreen', { resolved, screen }), error: false },
        });
        get().updateScreenBuffer();
        savePersisted(get());
        return resolved > 0;
      }

      set({ fc: { busy: false, progress: null, message: i18nT('stores:osdStore.connectFirst'), error: true } });
      return false;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ fc: { busy: false, progress: null, message: i18nT('stores:osdStore.readFailed', { msg }), error: true } });
      return false;
    }
  },

  uploadToFc: async () => {
    const target = detectTarget();
    const positions = get().elementPositions;

    try {
      if (target === 'msp') {
        const elements = ELEMENT_REGISTRY.filter((d) => d.betaflightIndex !== undefined).map((d) => {
          const p = positions[d.id];
          return { index: d.betaflightIndex!, x: p.x, y: p.y, visible: p.enabled };
        });
        set({ fc: { busy: true, progress: { done: 0, total: elements.length }, message: i18nT('stores:osdStore.uploadingLayout'), error: false } });
        const res = await window.electronAPI.mspSetOsdConfig(elements);
        set({
          fc: {
            busy: false,
            progress: null,
            message: res.success
              ? i18nT('stores:osdStore.uploadedSaved', { count: res.written })
              : i18nT('stores:osdStore.uploadFailed', { msg: res.error ?? i18nT('stores:osdStore.unknownError') }),
            error: !res.success,
          },
        });
        return res.success;
      }

      if (target === 'ardupilot') {
        let params = useParameterStore.getState().parameters;
        // Need the board's OSD params to know which exist + their types. Pull
        // them first if we haven't yet, so upload doesn't silently no-op.
        if (params.size === 0) {
          set({ fc: { busy: true, progress: null, message: i18nT('stores:osdStore.downloadingParams'), error: false } });
          await useParameterStore.getState().fetchParameters();
          params = useParameterStore.getState().parameters;
        }
        const writes = buildArdupilotOsdWrites(positions, params, get().screen);
        if (writes.length === 0) {
          set({
            fc: {
              busy: false,
              progress: null,
              message: hasArdupilotOsd(params)
                ? 'None of the enabled elements map to this screen’s OSD params'
                : 'No OSD parameters on this board (set OSD_TYPE / OSD enabled?)',
              error: true,
            },
          });
          return false;
        }
        set({ fc: { busy: true, progress: { done: 0, total: writes.length }, message: i18nT('stores:osdStore.uploadingParams', { count: writes.length }), error: false } });

        const off = window.electronAPI.onParamSetBatchProgress?.((p) => {
          set((state) => ({ fc: { ...state.fc, progress: { done: p.confirmed, total: p.total } } }));
        });
        const res = await window.electronAPI.setParameterBatch(writes);
        off?.();

        const ok = res.success && res.failed.length === 0;
        set({
          fc: {
            busy: false,
            progress: null,
            message: ok
              ? i18nT('stores:osdStore.uploadedToScreen', { count: res.confirmed, screen: get().screen })
              : i18nT('stores:osdStore.uploadedPartial', { confirmed: res.confirmed, total: writes.length, failed: res.failed.length }),
            error: !ok,
          },
        });
        return ok;
      }

      set({ fc: { busy: false, progress: null, message: i18nT('stores:osdStore.connectFcFirst'), error: true } });
      return false;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ fc: { busy: false, progress: null, message: i18nT('stores:osdStore.uploadFailed', { msg }), error: true } });
      return false;
    }
  },

  uploadFontToFc: async () => {
    const target = detectTarget();
    if (target !== 'msp') {
      set({
        fc: {
          busy: false,
          progress: null,
          message:
            target === 'ardupilot'
              ? i18nT('stores:osdStore.ardupilotFont')
              : i18nT('stores:osdStore.connectForFont'),
          error: true,
        },
      });
      return false;
    }
    const font = get().currentFont;
    if (!font) {
      set({ fc: { busy: false, progress: null, message: i18nT('stores:osdStore.noFont'), error: true } });
      return false;
    }
    const chars = font.font.characters.map((c) => ({ address: c.index, bytes: Array.from(c.rawBytes) }));
    set({ fc: { busy: true, progress: { done: 0, total: chars.length }, message: i18nT('stores:osdStore.uploadingFont'), error: false } });
    try {
      const res = await window.electronAPI.mspUploadOsdFont(chars);
      set({
        fc: {
          busy: false,
          progress: null,
          message: res.success
            ? i18nT('stores:osdStore.fontUploaded', { count: res.written })
            : i18nT('stores:osdStore.fontUploadFailed', { msg: res.error ?? i18nT('stores:osdStore.unknownError') }),
          error: !res.success,
        },
      });
      return res.success;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ fc: { busy: false, progress: null, message: i18nT('stores:osdStore.fontUploadFailed', { msg }), error: true } });
      return false;
    }
  },

  clearFcMessage: () => set((state) => ({ fc: { ...state.fc, message: null, error: false } })),

  resetLiveTracker: () => set({ liveTracker: createOsdLiveTracker(Date.now()) }),

  // ── render ────────────────────────────────────────────────────────────
  updateScreenBuffer: () => {
    const { screenBuffer, elementPositions, demoValues, dataSource } = get();

    screenBuffer.clear();

    let values: DemoTelemetry;
    if (dataSource === 'live') {
      const t = useTelemetryStore.getState();
      const home = useMissionStore.getState().homePosition;
      let tracker = get().liveTracker;
      if (!tracker) {
        tracker = createOsdLiveTracker(Date.now());
        set({ liveTracker: tracker });
      }
      const snap: LiveTelemetrySnapshot = {
        attitude: { roll: t.attitude.roll, pitch: t.attitude.pitch, yaw: t.attitude.yaw },
        position: {
          lat: t.position.lat,
          lon: t.position.lon,
          alt: t.position.alt,
          relativeAlt: t.position.relativeAlt,
        },
        gps: { satellites: t.gps.satellites, hdop: t.gps.hdop, lat: t.gps.lat, lon: t.gps.lon },
        battery: {
          voltage: t.battery.voltage,
          current: t.battery.current,
          remaining: t.battery.remaining,
          cellCount: t.battery.cellCount,
          cellVoltage: t.battery.cellVoltage,
          mahDrawn: t.battery.mahDrawn,
        },
        vfrHud: {
          airspeed: t.vfrHud.airspeed,
          groundspeed: t.vfrHud.groundspeed,
          heading: t.vfrHud.heading,
          throttle: t.vfrHud.throttle,
          alt: t.vfrHud.alt,
          climb: t.vfrHud.climb,
        },
        wind: { direction: t.wind.direction, speed: t.wind.speed, speedZ: t.wind.speedZ },
        flight: { mode: t.flight.mode, armed: t.flight.armed },
        rcChannels: { rssi: t.rcChannels.rssi },
        escTelemetry: t.escTelemetry
          ? { motors: t.escTelemetry.motors.map((m) => (m ? { rpm: m.rpm, tempC: m.tempC } : undefined)) }
          : null,
        craftName: '',
      };
      values = buildLiveTelemetry(snap, home ? { lat: home.lat, lon: home.lon } : null, tracker, Date.now());
    } else {
      values = demoValues;
    }

    for (const [id, pos] of Object.entries(elementPositions) as [OsdElementKey, OsdElementPosition][]) {
      if (!pos.enabled) continue;

      renderElement(screenBuffer, id, pos.x, pos.y, values);
    }

    set((state) => ({ renderVersion: state.renderVersion + 1 }));
  },
}));

/** Clamp helper for editor bounds (cols/rows depend on video type). */
export function osdRowsFor(videoType: VideoType): number {
  return getOsdRows(videoType);
}

// Seed positions (and trigger a re-render) whenever a module registers or
// unregisters an OSD element after store init.
subscribeModuleOsdElements(() => {
  useOsdStore.getState().mergeModuleElementDefaults();
});
