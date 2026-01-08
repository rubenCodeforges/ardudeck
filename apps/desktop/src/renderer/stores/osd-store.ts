import { create } from 'zustand';
import {
  loadFont,
  CachedFont,
  OsdScreenBuffer,
  VideoType,
  OSD_COLS,
  getOsdRows,
} from '../utils/osd/font-renderer';
import { SYM, numberToSymbols } from '../utils/osd/osd-symbols';
import { useTelemetryStore } from './telemetry-store';

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

/** Demo telemetry values for standalone mode */
export interface DemoTelemetry {
  altitude: number; // meters
  speed: number; // m/s
  heading: number; // degrees 0-359
  pitch: number; // degrees
  roll: number; // degrees
  batteryVoltage: number; // volts
  batteryCurrent: number; // amps
  batteryPercent: number; // 0-100
  gpsSats: number;
  rssi: number; // 0-100
  throttle: number; // 0-100
  flightTime: number; // seconds
  distance: number; // meters from home
  latitude: number;
  longitude: number;
}

/** OSD element position */
export interface OsdElementPosition {
  x: number;
  y: number;
  enabled: boolean;
}

/** Available OSD elements */
export type OsdElementId =
  | 'altitude'
  | 'speed'
  | 'heading'
  | 'battery_voltage'
  | 'battery_percent'
  | 'gps_sats'
  | 'rssi'
  | 'throttle'
  | 'flight_time'
  | 'distance'
  | 'coordinates'
  | 'pitch'
  | 'roll'
  | 'crosshairs'
  | 'artificial_horizon';

/** Default element positions (PAL layout) */
const DEFAULT_ELEMENT_POSITIONS: Record<OsdElementId, OsdElementPosition> = {
  altitude: { x: 1, y: 2, enabled: true },
  speed: { x: 1, y: 3, enabled: true },
  heading: { x: 14, y: 0, enabled: true },
  battery_voltage: { x: 1, y: 0, enabled: true },
  battery_percent: { x: 24, y: 0, enabled: true },
  gps_sats: { x: 24, y: 1, enabled: true },
  rssi: { x: 1, y: 1, enabled: true },
  throttle: { x: 1, y: 12, enabled: true },
  flight_time: { x: 24, y: 12, enabled: true },
  distance: { x: 1, y: 4, enabled: true },
  coordinates: { x: 1, y: 14, enabled: true },
  pitch: { x: 24, y: 4, enabled: true },
  roll: { x: 24, y: 5, enabled: true },
  crosshairs: { x: 14, y: 7, enabled: true },
  artificial_horizon: { x: 10, y: 7, enabled: true },
};

/** Default demo values */
const DEFAULT_DEMO_VALUES: DemoTelemetry = {
  altitude: 120,
  speed: 15,
  heading: 270,
  pitch: 5,
  roll: -3,
  batteryVoltage: 11.8,
  batteryCurrent: 8.5,
  batteryPercent: 75,
  gpsSats: 12,
  rssi: 85,
  throttle: 45,
  flightTime: 185,
  distance: 350,
  latitude: 37.7749,
  longitude: -122.4194,
};

export type OsdMode = 'demo' | 'live';

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
  renderVersion: number; // Incremented to force re-renders

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
      // Update screen buffer with new font
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

  updateScreenBuffer: () => {
    const { screenBuffer, elementPositions, demoValues, mode } = get();

    // Clear buffer
    screenBuffer.clear();

    // Get telemetry values (demo or live)
    let values: DemoTelemetry;
    if (mode === 'demo') {
      values = demoValues;
    } else {
      // Live mode - use useTelemetryStore for ALL protocols
      // MSP data is also sent via TELEMETRY_UPDATE and converted to the same format
      const telemetry = useTelemetryStore.getState();
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
        flightTime: 0,
        distance: 0,
        latitude: telemetry.gps.lat || telemetry.position.lat,
        longitude: telemetry.gps.lon || telemetry.position.lon,
      };
    }

    // Render each enabled element
    for (const [id, pos] of Object.entries(elementPositions) as [OsdElementId, OsdElementPosition][]) {
      if (!pos.enabled) continue;

      switch (id) {
        case 'altitude':
          renderAltitude(screenBuffer, pos.x, pos.y, values.altitude);
          break;
        case 'speed':
          renderSpeed(screenBuffer, pos.x, pos.y, values.speed);
          break;
        case 'heading':
          renderHeading(screenBuffer, pos.x, pos.y, values.heading);
          break;
        case 'battery_voltage':
          renderBatteryVoltage(screenBuffer, pos.x, pos.y, values.batteryVoltage);
          break;
        case 'battery_percent':
          renderBatteryPercent(screenBuffer, pos.x, pos.y, values.batteryPercent);
          break;
        case 'gps_sats':
          renderGpsSats(screenBuffer, pos.x, pos.y, values.gpsSats);
          break;
        case 'rssi':
          renderRssi(screenBuffer, pos.x, pos.y, values.rssi);
          break;
        case 'throttle':
          renderThrottle(screenBuffer, pos.x, pos.y, values.throttle);
          break;
        case 'flight_time':
          renderFlightTime(screenBuffer, pos.x, pos.y, values.flightTime);
          break;
        case 'distance':
          renderDistance(screenBuffer, pos.x, pos.y, values.distance);
          break;
        case 'crosshairs':
          renderCrosshairs(screenBuffer, pos.x, pos.y);
          break;
        case 'artificial_horizon':
          renderArtificialHorizon(screenBuffer, pos.x, pos.y, values.pitch, values.roll);
          break;
        case 'pitch':
          renderPitch(screenBuffer, pos.x, pos.y, values.pitch);
          break;
        case 'roll':
          renderRoll(screenBuffer, pos.x, pos.y, values.roll);
          break;
        case 'coordinates':
          renderCoordinates(screenBuffer, pos.x, pos.y, values.latitude, values.longitude);
          break;
      }
    }

    // Force re-render by incrementing version
    set((state) => ({ renderVersion: state.renderVersion + 1 }));
  },
}));

// =============================================================================
// Element Renderers
// =============================================================================

function renderAltitude(buffer: OsdScreenBuffer, x: number, y: number, altitude: number): void {
  const altStr = Math.round(altitude).toString().padStart(4, ' ');
  buffer.setChar(x, y, SYM.ALT_M);
  buffer.drawString(x + 1, y, altStr);
  buffer.setChar(x + 5, y, SYM.M);
}

function renderSpeed(buffer: OsdScreenBuffer, x: number, y: number, speed: number): void {
  const speedKmh = Math.round(speed * 3.6); // m/s to km/h
  const speedStr = speedKmh.toString().padStart(3, ' ');
  buffer.drawString(x, y, speedStr);
  buffer.setChar(x + 3, y, SYM.KMH);
}

function renderHeading(buffer: OsdScreenBuffer, x: number, y: number, heading: number): void {
  const hdgStr = Math.round(heading).toString().padStart(3, '0');
  buffer.setChar(x, y, SYM.HEADING);
  buffer.drawString(x + 1, y, hdgStr);
  buffer.setChar(x + 4, y, SYM.DEGREES);
}

function renderBatteryVoltage(buffer: OsdScreenBuffer, x: number, y: number, voltage: number): void {
  const voltStr = voltage.toFixed(1).padStart(4, ' ');
  buffer.setChar(x, y, SYM.BATT);
  buffer.drawString(x + 1, y, voltStr);
  buffer.setChar(x + 5, y, SYM.VOLT);
}

function renderBatteryPercent(buffer: OsdScreenBuffer, x: number, y: number, percent: number): void {
  const pctStr = Math.round(percent).toString().padStart(3, ' ');
  buffer.setChar(x, y, SYM.BATT);
  buffer.drawString(x + 1, y, pctStr);
  buffer.setChar(x + 4, y, 0x25); // % character
}

function renderGpsSats(buffer: OsdScreenBuffer, x: number, y: number, sats: number): void {
  buffer.setChar(x, y, SYM.GPS_SAT1);
  buffer.setChar(x + 1, y, SYM.GPS_SAT2);
  const satStr = sats.toString().padStart(2, ' ');
  buffer.drawString(x + 2, y, satStr);
}

function renderRssi(buffer: OsdScreenBuffer, x: number, y: number, rssi: number): void {
  buffer.setChar(x, y, SYM.RSSI);
  const rssiStr = Math.round(rssi).toString().padStart(3, ' ');
  buffer.drawString(x + 1, y, rssiStr);
}

function renderThrottle(buffer: OsdScreenBuffer, x: number, y: number, throttle: number): void {
  buffer.setChar(x, y, SYM.THR);
  const thrStr = Math.round(throttle).toString().padStart(3, ' ');
  buffer.drawString(x + 1, y, thrStr);
  buffer.setChar(x + 4, y, 0x25); // %
}

function renderFlightTime(buffer: OsdScreenBuffer, x: number, y: number, seconds: number): void {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  buffer.setChar(x, y, SYM.FLY_M);
  buffer.drawString(x + 1, y, timeStr);
}

function renderDistance(buffer: OsdScreenBuffer, x: number, y: number, distance: number): void {
  buffer.setChar(x, y, SYM.HOME);
  const distStr = Math.round(distance).toString().padStart(4, ' ');
  buffer.drawString(x + 1, y, distStr);
  buffer.setChar(x + 5, y, SYM.M);
}

function renderCrosshairs(buffer: OsdScreenBuffer, x: number, y: number): void {
  // Simple 3-char crosshairs
  buffer.setChar(x - 1, y, SYM.AH_CENTER_LINE);
  buffer.setChar(x, y, SYM.AH_AIRCRAFT2);
  buffer.setChar(x + 1, y, SYM.AH_CENTER_LINE_RIGHT);
}

function renderArtificialHorizon(
  buffer: OsdScreenBuffer,
  x: number,
  y: number,
  pitch: number,
  roll: number
): void {
  // Simplified horizon - just render 9 horizon bar characters
  // In a real implementation, this would select different chars based on pitch/roll

  // Calculate pitch offset (each char represents ~5 degrees roughly)
  const pitchOffset = Math.round(pitch / 10);

  // Render horizon bar (9 chars wide, centered)
  for (let i = 0; i < 9; i++) {
    const charX = x - 4 + i;
    // SYM.AH_BAR9_0 + offset selects different horizon angle chars
    const horizonChar = SYM.AH_BAR9_0 + 4; // Middle position (level)
    buffer.setChar(charX, y - pitchOffset, horizonChar);
  }
}

function renderPitch(buffer: OsdScreenBuffer, x: number, y: number, pitch: number): void {
  const pitchStr = Math.round(pitch).toString().padStart(3, ' ');
  buffer.setChar(x, y, SYM.PITCH_UP);
  buffer.drawString(x + 1, y, pitchStr);
  buffer.setChar(x + 4, y, SYM.DEGREES);
}

function renderRoll(buffer: OsdScreenBuffer, x: number, y: number, roll: number): void {
  const rollStr = Math.round(roll).toString().padStart(3, ' ');
  buffer.setChar(x, y, SYM.ROLL_LEVEL);
  buffer.drawString(x + 1, y, rollStr);
  buffer.setChar(x + 4, y, SYM.DEGREES);
}

function renderCoordinates(
  buffer: OsdScreenBuffer,
  x: number,
  y: number,
  lat: number,
  lon: number
): void {
  // Latitude line
  const latStr = lat.toFixed(5);
  buffer.setChar(x, y, SYM.LAT);
  buffer.drawString(x + 1, y, latStr);

  // Longitude line (below latitude)
  const lonStr = lon.toFixed(5);
  buffer.setChar(x, y + 1, SYM.LON);
  buffer.drawString(x + 1, y + 1, lonStr);
}
