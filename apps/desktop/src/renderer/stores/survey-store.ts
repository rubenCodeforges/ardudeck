import { create } from 'zustand';
import type { LatLng, SurveyConfig, SurveyResult, SurveyPattern, AltitudeReference } from '../components/survey/survey-types';
import { DEFAULT_SURVEY_CONFIG } from '../components/survey/survey-types';
import type { CameraPreset } from '../components/survey/survey-types';
import { generateGrid } from '../components/survey/generators/grid-generator';
import { generateCrosshatch } from '../components/survey/generators/crosshatch-generator';
import { generateCircular } from '../components/survey/generators/circular-generator';

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

  // Polygon editing
  updateVertex: (index: number, lat: number, lng: number) => void;
  removeVertex: (index: number) => void;

  // Survey actions
  generateSurvey: () => void;
  clearSurvey: () => void;
  activateSurvey: () => void;
  deactivateSurvey: () => void;
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
    default:
      return generateGrid(config);
  }
}

export const useSurveyStore = create<SurveyStore>((set, get) => ({
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
}));
