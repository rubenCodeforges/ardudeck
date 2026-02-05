import { create } from 'zustand';
import {
  loadFont,
  CachedFont,
  OsdScreenBuffer,
  VideoType,
  OSD_COLS,
  getOsdRows,
} from '../utils/osd/font-renderer';
import { useTelemetryStore } from './telemetry-store';
import { calculateCcrp } from '../utils/ccrp-calculator';
import { usePayloadStore } from './payload-store';
import {
  type OsdElementId,
  buildDefaultPositions,
  buildBfIndexMap,
  ELEMENT_REGISTRY,
} from '../utils/osd/element-registry';
import {
  type DemoTelemetry,
  DEFAULT_DEMO_VALUES,
  renderElement,
} from '../utils/osd/element-renderers';

// Re-export types used by consumers
export type { OsdElementId } from '../utils/osd/element-registry';
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

/** Default element positions built from registry */
export const DEFAULT_ELEMENT_POSITIONS: Record<OsdElementId, OsdElementPosition> =
  buildDefaultPositions() as Record<OsdElementId, OsdElementPosition>;

export type OsdMode = 'demo' | 'live' | 'edit';

interface OsdStore {
  // Font state
  currentFont: CachedFont | null;
  currentFontName: string;
  isLoadingFont: boolean;
  fontError: string | null;

  // Display settings
  videoType: VideoType;
  scale: number;
  showGrid: boolean;
  backgroundColor: string;

  // Mode
  mode: OsdMode;

  // Demo values
  demoValues: DemoTelemetry;

  // Element positions
  elementPositions: Record<OsdElementId, OsdElementPosition>;

  // Screen buffer
  screenBuffer: OsdScreenBuffer;
  renderVersion: number;

  // Actions
  loadBundledFont: (name: string) => Promise<void>;
  loadFontFromContent: (content: string, name: string) => Promise<void>;
  setVideoType: (type: VideoType) => void;
  setScale: (scale: number) => void;
  setShowGrid: (show: boolean) => void;
  setBackgroundColor: (color: string) => void;
  setMode: (mode: OsdMode) => void;
  updateDemoValue: <K extends keyof DemoTelemetry>(key: K, value: DemoTelemetry[K]) => void;
  setDemoValues: (values: Partial<DemoTelemetry>) => void;
  resetDemoValues: () => void;
  setElementPosition: (id: OsdElementId, position: Partial<OsdElementPosition>) => void;
  toggleElement: (id: OsdElementId) => void;
  resetElementPositions: () => void;
  loadPositionsFromFc: () => Promise<boolean>;
  updateScreenBuffer: () => void;
}

export const useOsdStore = create<OsdStore>((set, get) => ({
  // Initial state
  currentFont: null,
  currentFontName: '',
  isLoadingFont: false,
  fontError: null,

  videoType: 'PAL',
  scale: 2,
  showGrid: false,
  backgroundColor: 'rgba(0, 100, 200, 0.6)',

  mode: 'demo',

  demoValues: { ...DEFAULT_DEMO_VALUES },

  elementPositions: { ...DEFAULT_ELEMENT_POSITIONS },

  screenBuffer: new OsdScreenBuffer('PAL'),
  renderVersion: 0,

  // Actions
  loadBundledFont: async (name: string) => {
    const content = BUNDLED_FONTS[name];
    if (!content) {
      set({ fontError: `Unknown bundled font: ${name}` });
      return;
    }

    set({ isLoadingFont: true, fontError: null });
    try {
      const font = loadFont(content, name);
      set({
        currentFont: font,
        currentFontName: name,
        isLoadingFont: false,
      });
      get().updateScreenBuffer();
    } catch (err) {
      set({
        fontError: err instanceof Error ? err.message : 'Failed to load font',
        isLoadingFont: false,
      });
    }
  },

  loadFontFromContent: async (content: string, name: string) => {
    set({ isLoadingFont: true, fontError: null });
    try {
      const font = loadFont(content, name);
      set({
        currentFont: font,
        currentFontName: name,
        isLoadingFont: false,
      });
      get().updateScreenBuffer();
    } catch (err) {
      set({
        fontError: err instanceof Error ? err.message : 'Failed to load font',
        isLoadingFont: false,
      });
    }
  },

  setVideoType: (videoType: VideoType) => {
    const buffer = get().screenBuffer;
    buffer.resize(videoType);
    set({ videoType });
    get().updateScreenBuffer();
  },

  setScale: (scale: number) => set({ scale }),

  setShowGrid: (showGrid: boolean) => set({ showGrid }),

  setBackgroundColor: (backgroundColor: string) => set({ backgroundColor }),

  setMode: (mode: OsdMode) => set({ mode }),

  updateDemoValue: (key, value) => {
    set((state) => ({
      demoValues: { ...state.demoValues, [key]: value },
    }));
    get().updateScreenBuffer();
  },

  setDemoValues: (values: Partial<DemoTelemetry>) => {
    set((state) => ({
      demoValues: { ...state.demoValues, ...values },
    }));
    get().updateScreenBuffer();
  },

  resetDemoValues: () => {
    set({ demoValues: { ...DEFAULT_DEMO_VALUES } });
    get().updateScreenBuffer();
  },

  setElementPosition: (id: OsdElementId, position: Partial<OsdElementPosition>) => {
    set((state) => ({
      elementPositions: {
        ...state.elementPositions,
        [id]: { ...state.elementPositions[id], ...position },
      },
    }));
    get().updateScreenBuffer();
  },

  toggleElement: (id: OsdElementId) => {
    set((state) => ({
      elementPositions: {
        ...state.elementPositions,
        [id]: {
          ...state.elementPositions[id],
          enabled: !state.elementPositions[id].enabled,
        },
      },
    }));
    get().updateScreenBuffer();
  },

  resetElementPositions: () => {
    set({ elementPositions: { ...DEFAULT_ELEMENT_POSITIONS } });
    get().updateScreenBuffer();
  },

  loadPositionsFromFc: async () => {
    try {
      const config = await window.api.mspGetOsdConfig() as {
        flags: number;
        videoSystem: number;
        unitMode: number;
        elements: { index: number; x: number; y: number; visible: boolean }[];
        elementCount: number;
      } | null;

      if (!config || config.elements.length === 0) {
        console.log('[OSD] No OSD config returned from FC');
        return false;
      }

      console.log('[OSD] Loaded', config.elements.length, 'element positions from FC');

      // Build BF index map from registry
      const BF_INDEX_MAP = buildBfIndexMap();

      const newPositions = { ...get().elementPositions };
      let updatedCount = 0;

      for (const element of config.elements) {
        const ourId = BF_INDEX_MAP[element.index];
        if (ourId && newPositions[ourId]) {
          newPositions[ourId] = {
            x: element.x,
            y: element.y,
            enabled: element.visible,
          };
          updatedCount++;
          console.log(`[OSD] Element ${ourId}: (${element.x}, ${element.y}) ${element.visible ? 'visible' : 'hidden'}`);
        }
      }

      if (updatedCount > 0) {
        set({ elementPositions: newPositions });
        get().updateScreenBuffer();
        console.log('[OSD] Updated', updatedCount, 'element positions from FC');
      }

      return updatedCount > 0;
    } catch (err) {
      console.error('[OSD] Failed to load positions from FC:', err);
      return false;
    }
  },

  updateScreenBuffer: () => {
    const { screenBuffer, elementPositions, demoValues, mode } = get();

    screenBuffer.clear();

    // Get telemetry values (demo or live)
    let values: DemoTelemetry;
    if (mode === 'demo' || mode === 'edit') {
      values = demoValues;
    } else {
      // Live mode - use telemetry store (map ALL fields, use 0 for unavailable)
      const telemetry = useTelemetryStore.getState();
      const lat = telemetry.gps.lat || telemetry.position.lat;
      const lon = telemetry.gps.lon || telemetry.position.lon;
      values = {
        altitude: telemetry.vfrHud.alt || telemetry.position.relativeAlt,
        speed: telemetry.vfrHud.groundspeed,
        heading: telemetry.vfrHud.heading || telemetry.attitude.yaw,
        pitch: telemetry.attitude.pitch,
        roll: telemetry.attitude.roll,
        batteryVoltage: telemetry.battery.voltage,
        batteryCurrent: telemetry.battery.current,
        batteryPercent: telemetry.battery.remaining,
        gpsSats: telemetry.gps.satellites,
        rssi: 0,
        throttle: telemetry.vfrHud.throttle,
        latitude: lat,
        longitude: lon,
        targetLat: lat,
        targetLon: lon,
        // Fields now mapped from telemetry (were using demo defaults)
        isArmed: telemetry.flight.armed,
        flightMode: telemetry.flight.mode,
        craftName: '',
        vario: telemetry.vfrHud.climb,
        airspeed: telemetry.vfrHud.airspeed,
        gpsHdop: telemetry.gps.hdop,
        mslAltitude: telemetry.vfrHud.alt,
        cellVoltage: telemetry.battery.cellVoltage ?? 0,
        cellCount: telemetry.battery.cellCount ?? 0,
        mahDrawn: telemetry.battery.mahDrawn ?? 0,
        powerWatts: telemetry.battery.voltage * telemetry.battery.current,
        // Fields not available from basic MSP telemetry
        baroTemp: 0,
        imuTemp: 0,
        escTemp: 0,
        gForce: 0,
        escRpm: 0,
        windSpeed: 0,
        windDirection: 0,
        windVertical: 0,
        homeDirection: 0,
        rssiDbm: 0,
        maxSpeed: 0,
        flightTime: 0,
        onTime: 0,
        distance: 0,
      };
    }

    // Render each enabled element using the extracted renderers
    for (const [id, pos] of Object.entries(elementPositions) as [OsdElementId, OsdElementPosition][]) {
      if (!pos.enabled) continue;

      if (id === 'ccrp_indicator') {
        // CCRP needs special calculation
        const payloadConfig = usePayloadStore.getState().config;
        const ccrpResult = calculateCcrp({
          aircraftLat: values.latitude,
          aircraftLon: values.longitude,
          aircraftAltAgl: values.altitude,
          groundSpeed: values.speed,
          heading: values.heading,
          targetLat: values.targetLat,
          targetLon: values.targetLon,
          descentRateMs: payloadConfig.descentRateMs,
        });
        renderElement(screenBuffer, id, pos.x, pos.y, values, ccrpResult);
      } else {
        renderElement(screenBuffer, id, pos.x, pos.y, values);
      }
    }

    // Force re-render
    set((state) => ({ renderVersion: state.renderVersion + 1 }));
  },
}));
