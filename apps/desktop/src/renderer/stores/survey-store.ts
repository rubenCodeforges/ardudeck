import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { LatLng, SurveyConfig, SurveyResult, SurveyPattern, AltitudeReference, GroundPattern } from '../components/survey/survey-types';
import { DEFAULT_SURVEY_CONFIG } from '../components/survey/survey-types';
import type { CameraPreset } from '../components/survey/survey-types';
import { generateGrid } from '../components/survey/generators/grid-generator';
import { generateCrosshatch } from '../components/survey/generators/crosshatch-generator';
import { generateCircular } from '../components/survey/generators/circular-generator';
import { generateSpiral } from '../components/survey/generators/spiral-generator';
import { generatePerimeterFill } from '../components/survey/generators/perimeter-fill-generator';
import { useSettingsStore } from './settings-store';

type DrawMode = 'none' | 'polygon';

interface SurveyStore {
  // Drawing state
  drawMode: DrawMode;
  drawingVertices: LatLng[];

  // Survey state
  polygon: LatLng[] | null;
  config: Omit<SurveyConfig, 'polygon'>;
  result: SurveyResult | null;
  showFootprints: boolean;
  isActive: boolean;

  // Drawing actions
  startDrawing: () => void;
  addVertex: (lat: number, lng: number) => void;
  completePolygon: () => void;
  cancelDrawing: () => void;

  // Config actions
  setPattern: (pattern: SurveyPattern) => void;
  setAltitude: (altitude: number) => void;
  setSpeed: (speed: number) => void;
  setFrontOverlap: (overlap: number) => void;
  setSideOverlap: (overlap: number) => void;
  setCamera: (camera: CameraPreset) => void;
  setGridAngle: (angle: number) => void;
  setOvershoot: (overshoot: number) => void;
  setAltitudeReference: (ref: AltitudeReference) => void;
  setShowFootprints: (show: boolean) => void;
  setGroundPattern: (pattern: GroundPattern) => void;
  setSpiralDirection: (direction: 'inward' | 'outward') => void;
  setPerimeterPasses: (passes: number) => void;

  // Polygon editing
  updateVertex: (index: number, lat: number, lng: number) => void;
  removeVertex: (index: number) => void;

  // Survey actions
  generateSurvey: () => void;
  clearSurvey: () => void;
  activateSurvey: () => void;
  deactivateSurvey: () => void;

  // Preset application — overlays a preset's config slice + (optional) camera
  // onto the current config in a single store update. Only the fields the
  // preset specifies are overwritten; gridAngle and polygon are preserved.
  applyPresetConfig: (
    partial: Partial<Omit<SurveyConfig, 'polygon' | 'gridAngle'>>,
    camera?: CameraPreset,
  ) => void;
}

function runGenerator(config: SurveyConfig): SurveyResult | null {
  if (config.polygon.length < 3) return null;

  switch (config.pattern) {
    case 'grid':
      return generateGrid(config);
    case 'crosshatch':
      return generateCrosshatch(config);
    case 'circular':
      return generateCircular(config);
    case 'spiral':
      return generateSpiral(config);
    case 'perimeter-fill':
      return generatePerimeterFill(config);
    default:
      return generateGrid(config);
  }
}

// Module-level flag — true after the initial hydration from settings, used to
// suppress the persistence subscriber during the very first applyPresetConfig
// call (otherwise we'd save the hydrated config back to itself before any
// user change, which is harmless but noisy).
let isHydratingFromSettings = false;

export const useSurveyStore = create<SurveyStore>()(subscribeWithSelector((set, get) => ({
  drawMode: 'none',
  drawingVertices: [],
  polygon: null,
  config: { ...DEFAULT_SURVEY_CONFIG },
  result: null,
  showFootprints: false,
  isActive: false,

  startDrawing: () => {
    set({ drawMode: 'polygon', drawingVertices: [], polygon: null, result: null });
  },

  addVertex: (lat, lng) => {
    set((s) => ({ drawingVertices: [...s.drawingVertices, { lat, lng }] }));
  },

  completePolygon: () => {
    const { drawingVertices, config } = get();
    if (drawingVertices.length < 3) return;

    const polygon = [...drawingVertices];
    const fullConfig: SurveyConfig = { ...config, polygon };
    const result = runGenerator(fullConfig);

    set({ drawMode: 'none', drawingVertices: [], polygon, result });
  },

  cancelDrawing: () => {
    set({ drawMode: 'none', drawingVertices: [] });
  },

  setPattern: (pattern) => {
    set({ config: { ...get().config, pattern } });
    get().generateSurvey();
  },

  setAltitude: (altitude) => {
    set({ config: { ...get().config, altitude } });
    get().generateSurvey();
  },

  setSpeed: (speed) => {
    set({ config: { ...get().config, speed } });
    get().generateSurvey();
  },

  setFrontOverlap: (frontOverlap) => {
    set({ config: { ...get().config, frontOverlap } });
    get().generateSurvey();
  },

  setSideOverlap: (sideOverlap) => {
    set({ config: { ...get().config, sideOverlap } });
    get().generateSurvey();
  },

  setCamera: (camera) => {
    set({ config: { ...get().config, camera } });
    get().generateSurvey();
  },

  setGridAngle: (gridAngle) => {
    set({ config: { ...get().config, gridAngle } });
    get().generateSurvey();
  },

  setOvershoot: (overshoot) => {
    set({ config: { ...get().config, overshoot } });
    get().generateSurvey();
  },

  setAltitudeReference: (altitudeReference) => {
    set({ config: { ...get().config, altitudeReference } });
  },

  setShowFootprints: (showFootprints) => {
    set({ showFootprints });
  },

  setGroundPattern: (groundPattern) => {
    set({ config: { ...get().config, groundPattern } });
    // No regeneration needed — the waypoint geometry is identical between
    // boustrophedon and reverse-alternating. Only mission-builder reads this
    // when materializing the mission (to insert DO_SET_REVERSE between lines).
  },

  setSpiralDirection: (spiralDirection) => {
    set({ config: { ...get().config, spiralDirection } });
    get().generateSurvey();
  },

  setPerimeterPasses: (perimeterPasses) => {
    // Clamp at the same range the generator enforces so the slider/UI can't
    // push past what's geometrically sensible.
    const clamped = Math.max(1, Math.min(5, Math.round(perimeterPasses)));
    set({ config: { ...get().config, perimeterPasses: clamped } });
    get().generateSurvey();
  },

  updateVertex: (index, lat, lng) => {
    const { polygon } = get();
    if (!polygon) return;
    const newPolygon = [...polygon];
    newPolygon[index] = { lat, lng };
    set({ polygon: newPolygon });
    get().generateSurvey();
  },

  removeVertex: (index) => {
    const { polygon } = get();
    if (!polygon || polygon.length <= 3) return; // Need at least 3 vertices
    const newPolygon = polygon.filter((_, i) => i !== index);
    set({ polygon: newPolygon });
    get().generateSurvey();
  },

  generateSurvey: () => {
    const { polygon, config } = get();
    if (!polygon || polygon.length < 3) return;

    const fullConfig: SurveyConfig = { ...config, polygon };
    const result = runGenerator(fullConfig);
    set({ result });
  },

  clearSurvey: () => {
    set({
      drawMode: 'none',
      drawingVertices: [],
      polygon: null,
      result: null,
      isActive: false,
    });
  },

  activateSurvey: () => {
    set({ isActive: true });
  },

  deactivateSurvey: () => {
    set({
      isActive: false,
      drawMode: 'none',
      drawingVertices: [],
      polygon: null,
      result: null,
    });
  },

  applyPresetConfig: (partial, camera) => {
    const current = get().config;
    // Merge — preset wins on keys it sets, current stays for everything else.
    // Camera is only replaced when the preset explicitly provides one (e.g.
    // Mower template flips into Manual mode); otherwise the user's chosen
    // camera survives a template switch.
    const nextConfig = {
      ...current,
      ...partial,
      ...(camera ? { camera } : {}),
    };
    set({ config: nextConfig });
    // Regenerate so the map updates immediately.
    get().generateSurvey();
  },
})));

// Persistence: any change to the survey config is serialized and pushed to
// settings-store, which auto-saves it via the existing electron-store flow.
// We strip the polygon (scene-specific, not worth carrying across sessions —
// loading a saved polygon on a different map location would be confusing).
useSurveyStore.subscribe(
  (state) => state.config,
  (config) => {
    if (isHydratingFromSettings) return;
    // The Omit<SurveyConfig, 'polygon'> shape carries no polygon field already,
    // but the cast keeps us tolerant of future shape changes.
    useSettingsStore.getState().setSurveySavedConfig(config as unknown as Record<string, unknown>);
  },
);

// Shared hydration helper — applies saved config over the defaults without
// triggering the persistence subscriber above.
function applySavedConfig(saved: Record<string, unknown>) {
  isHydratingFromSettings = true;
  try {
    const merged = { ...DEFAULT_SURVEY_CONFIG, ...(saved as Partial<typeof DEFAULT_SURVEY_CONFIG>) };
    useSurveyStore.setState({ config: merged });
  } finally {
    isHydratingFromSettings = false;
  }
}

// Hydration: when settings finishes loading (single false→true transition of
// _isInitialized) and a saved config exists, apply it.
useSettingsStore.subscribe(
  (state) => state._isInitialized,
  (init, prev) => {
    if (!init || prev) return;
    const saved = useSettingsStore.getState().surveySavedConfig;
    if (saved) applySavedConfig(saved);
  },
);

// HMR / late-import safety: if settings finished loading before this module
// attached its subscriber, hydrate immediately from the current snapshot.
if (useSettingsStore.getState()._isInitialized) {
  const saved = useSettingsStore.getState().surveySavedConfig;
  if (saved) applySavedConfig(saved);
}
