import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { useConnectionStore } from '../../stores/connection-store';
import { useMissionStore } from '../../stores/mission-store';
import {
  COPTER_MODES,
  PLANE_MODES,
  ROVER_MODES,
  SUB_MODES,
  getVehicleClass,
  type ArduPilotVehicleClass,
} from '../../../shared/telemetry-types';
import type { EdgeTxScanResult } from '../../../shared/edgetx-types';
import logoUrl from './hud-logo.png';
import logoLightUrl from './hud-logo-light.png';
import { MapContainer, TileLayer, Circle, Marker, useMap, useMapEvents } from 'react-leaflet';
import {
  BatteryMedium, Zap, Fuel, MoveVertical, MoveRight, TrendingUp, Satellite, Home,
  Wind, Crosshair, Ruler, Thermometer, MapPin, SlidersHorizontal, Compass, X, BookOpen,
  type LucideIcon,
} from 'lucide-react';
import { BwGuide } from './BwGuide';
import 'leaflet/dist/leaflet.css';
import { SmoothWheelZoom } from '../map/SmoothWheelZoom';
import { MapSearchControl } from '../map/MapSearchControl';
import { generateFieldMaps, FIELD_MAP_SPANS, type FieldMapImage } from './field-maps';
import {
  loadLayouts,
  persistLayouts,
  removeLayout,
  renameLayout,
  uniqueLayoutName,
  upsertLayout,
  type SavedHudLayout,
} from './hud-layout-library';
import { useTranslation } from 'react-i18next';
import { i18n } from '../../i18n';

/**
 * Radio HUD studio: configure the ArduDeck EdgeTX widget, arrange its tiles
 * on a live preview, and push widget + config to the radio's SD card.
 *
 * Preview and radio consume the identical layout config (hud.cfg tileN
 * lines), so what you arrange here is what the radio draws. Top bar and
 * message ticker are brand invariants: not movable, not removable.
 */

/** Prefer the i18n key; falls back to the literal. */
function rhText(t: (key: string) => string, key: string | undefined, fallback: string): string {
  return key ? t(key) : fallback;
}

// theme.lua contract (source-traced; do not invent)
const DARK = {
  bgBase: '#0a0a0f',
  surface: '#1f2937',
  text: '#ffffff',
  text2: '#9ca3af',
  text3: '#6b7280',
  success: '#34d399',
  warn: '#fbbf24',
  warnStrong: '#f59e0b',
  danger: '#f87171',
  info: '#60a5fa',
  accent: '#2dd4bf',
  gaugeFace: '#16181d',
  gaugeBezel: '#1b2230',
  gaugeEdge: '#374151',
  gaugeTick: '#e5e7eb',
  needle: '#ffffff',
  grid: '#0c1418',
  pillOn: '#1c3a31',
};

// .light override from globals.css: white faces, near-black markings
const LIGHT: typeof DARK = {
  bgBase: '#f5f6f8',
  surface: '#ffffff',
  text: '#111827',
  text2: '#4b5563',
  text3: '#9ca3af',
  success: '#16a34a',
  warn: '#d97706',
  warnStrong: '#f59e0b',
  danger: '#dc2626',
  info: '#2563eb',
  accent: '#0d9488',
  gaugeFace: '#fbfbfd',
  gaugeBezel: '#f5f6f8',
  gaugeEdge: '#a6adba',
  gaugeTick: '#111827',
  needle: '#111827',
  grid: '#ebf4f5',
  pillOn: '#d0eddb',
};

// Active palette; HudPreview reassigns before rendering children. Module
// state instead of prop-drilling through every tile body: rendering is
// synchronous, so children always read the palette set by their preview.
let C = DARK;

/** Radio screen classes the HUD runs on (ids match the installer's
 *  RADIO_VARIANTS). Color radios get the widget (presets authored @480x320
 *  and rescaled); B&W radios get the fixed-layout telemetry script. */
interface ScreenModel {
  variant: string;
  label: string;
  labelKey?: string;
  w: number;
  h: number;
  /** monochrome telemetry script target: fixed layout, no tile editing */
  bw?: boolean;
}
const SCREEN_MODELS: ScreenModel[] = [
  { variant: 'c480x320', label: 'TX15 (480x320)', labelKey: 'radioHud.screens.tx15', w: 480, h: 320 },
  { variant: 'c480x272', label: 'TX16S / T16 / T18 / X10 (480x272)', labelKey: 'radioHud.screens.tx16s', w: 480, h: 272 },
  { variant: 'c800x480', label: 'TX16S mkIII (800x480)', labelKey: 'radioHud.screens.tx16s-mk3', w: 800, h: 480 },
  { variant: 'c320x480', label: 'NV14 / EL18 (320x480 portrait)', labelKey: 'radioHud.screens.nv14', w: 320, h: 480 },
  { variant: 'bw128x64', label: 'Boxer / Zorro / TX12 / Pocket (128x64 B&W)', labelKey: 'radioHud.screens.boxer', w: 128, h: 64, bw: true },
  { variant: 'bw212x64', label: 'Taranis X9D (212x64 B&W)', labelKey: 'radioHud.screens.taranis-x9d', w: 212, h: 64, bw: true },
];

// Active screen geometry; RadioHudView reassigns from the selected radio
// model before rendering children (same module-state idiom as the palette
// above - rendering is synchronous).
let SCREEN_W = 480;
let SCREEN_H = 320;
let TICKER_TOP = SCREEN_H - 66;
const TILE_REGION_TOP = 44;
const SNAP = 8;

/** Fixed widget chrome: header ends at 48, ticker owns the bottom 72px.
 *  Keep all geometry math in sync with loadable.lua. */
const TILE_TOP = 48;
const BOTTOM_CHROME = 72;

/** Carry a tile onto another screen: SHRINK when the target is smaller,
 *  never inflate (EdgeTX fonts don't scale - bigger screens mean room for
 *  MORE instruments, not fatter ones), then clamp into bounds. */
function fitTile(t: TileDef, from: { w: number; h: number }, to: { w: number; h: number }): TileDef {
  const fx = Math.min(1, to.w / from.w);
  const fy = Math.min(1, (to.h - TILE_TOP - BOTTOM_CHROME) / (from.h - TILE_TOP - BOTTOM_CHROME));
  const w = Math.round(t.w * fx);
  const h = Math.round(t.h * fy);
  return {
    ...t,
    w,
    h,
    x: Math.max(0, Math.min(to.w - w, Math.round(t.x * fx))),
    y: Math.max(TILE_TOP, Math.min(to.h - BOTTOM_CHROME - h + 6, Math.round(TILE_TOP + (t.y - TILE_TOP) * fy))),
  };
}
const REF_SCREEN = { w: 480, h: 320 };

/** Mirror of the widget's gridDefault: fills the screen with instruments at
 *  natural size - last column is a full-band attitude ball, the rest fill
 *  row-major by usefulness. @480x320 this is the classic 5-tile default. */
function gridLayout(screen: { w: number; h: number }): TileDef[] {
  const band = screen.h - TILE_TOP - BOTTOM_CHROME;
  const cols = Math.max(2, Math.floor((screen.w - 8) / 152));
  let pitch = Math.floor((screen.w - 8) / cols);
  pitch -= pitch % 8;
  const tw = pitch - 8;
  const rows = Math.max(1, Math.floor((band + 8) / 104 + 0.5));
  let th = Math.floor((band - (rows - 1) * 8) / rows);
  th -= th % 8;
  const ids = ['batt', 'home', 'alt', 'gps', 'spd', 'wind', 'link', 'timer',
    'thr', 'imu', 'wp', 'compass', 'rng', 'txbat'];
  const t: TileDef[] = [];
  let n = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - 1 && n < ids.length; c++, n++) {
      t.push({ id: ids[n]!, x: 8 + c * pitch, y: TILE_TOP + r * (th + 8), w: tw, h: th, variant: 'default' });
    }
  }
  t.push({ id: 'att', x: 8 + (cols - 1) * pitch, y: TILE_TOP, w: tw, h: band, variant: 'ball' });
  return t;
}

export interface TileDef {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  variant: string;
}

// Mirror of the Lua DEFAULT_LAYOUT (the @480x320 grid = classic 5 tiles).
const DEFAULT_LAYOUT: TileDef[] = gridLayout(REF_SCREEN);

const TILE_META: Record<string, { label: string; labelKey?: string; minW: number; minH: number; variants?: string[] }> = {
  batt: { label: 'Battery', labelKey: 'radioHud.tiles.battery', minW: 120, minH: 56, variants: ['default', 'icon'] },
  home: { label: 'Home', labelKey: 'radioHud.tiles.home', minW: 100, minH: 56 },
  alt: { label: 'Alt / Vspd', labelKey: 'radioHud.tiles.alt-vspd', minW: 100, minH: 56 },
  gps: { label: 'GPS', labelKey: 'radioHud.tiles.gps', minW: 100, minH: 56 },
  att: { label: 'Attitude', labelKey: 'radioHud.tiles.attitude', minW: 100, minH: 80, variants: ['ball', 'line', 'bars'] },
  compass: { label: 'Compass', labelKey: 'radioHud.tiles.compass', minW: 100, minH: 100 },
  spd: { label: 'Speed', labelKey: 'radioHud.tiles.speed', minW: 100, minH: 56 },
  timer: { label: 'Flight Timer', labelKey: 'radioHud.tiles.flight-timer', minW: 100, minH: 56 },
  wind: { label: 'Wind', labelKey: 'radioHud.tiles.wind', minW: 110, minH: 56 },
  link: { label: 'Signal', labelKey: 'radioHud.tiles.signal', minW: 110, minH: 56 },
  txbat: { label: 'TX Battery', labelKey: 'radioHud.tiles.tx-battery', minW: 110, minH: 56 },
  thr: { label: 'Throttle', labelKey: 'radioHud.tiles.throttle', minW: 90, minH: 56 },
  imu: { label: 'IMU Temp', labelKey: 'radioHud.tiles.imu-temp', minW: 90, minH: 56 },
  rng: { label: 'Rangefinder', labelKey: 'radioHud.tiles.rangefinder', minW: 90, minH: 56 },
  pos: { label: 'Position', labelKey: 'radioHud.tiles.position', minW: 140, minH: 64 },
  map: { label: 'Map', labelKey: 'radioHud.tiles.map', minW: 140, minH: 100 },
  wp: { label: 'Mission WP', labelKey: 'radioHud.tiles.mission-wp', minW: 120, minH: 56 },
};

// Sky/ground per the app's AttitudeIndicator (AttitudePanel.tsx gradients);
// ground uses the deeper amber-800 end, the lighter one is cartoonish flat
const SKY = '#2563eb';
const GROUND = '#92400e';

// Prebuilt layouts for common setups. All 8px-grid aligned.
const LAYOUT_PRESETS: Record<string, TileDef[]> = {
  'Classic copter': DEFAULT_LAYOUT,
  'Navigator': [
    { id: 'map', x: 8, y: 48, w: 296, h: 200, variant: 'default' },
    { id: 'compass', x: 312, y: 48, w: 144, h: 96, variant: 'default' },
    { id: 'home', x: 312, y: 152, w: 144, h: 96, variant: 'default' },
  ],
  'Plane': [
    { id: 'spd', x: 8, y: 48, w: 144, h: 96, variant: 'default' },
    { id: 'alt', x: 8, y: 152, w: 144, h: 96, variant: 'default' },
    { id: 'att', x: 160, y: 48, w: 144, h: 200, variant: 'ball' },
    { id: 'gps', x: 312, y: 48, w: 144, h: 96, variant: 'default' },
    { id: 'wind', x: 312, y: 152, w: 144, h: 96, variant: 'default' },
  ],
  'Systems': [
    { id: 'batt', x: 8, y: 48, w: 144, h: 96, variant: 'icon' },
    { id: 'txbat', x: 160, y: 48, w: 144, h: 96, variant: 'default' },
    { id: 'link', x: 312, y: 48, w: 144, h: 96, variant: 'default' },
    { id: 'imu', x: 8, y: 152, w: 144, h: 96, variant: 'default' },
    { id: 'thr', x: 160, y: 152, w: 144, h: 96, variant: 'default' },
    { id: 'timer', x: 312, y: 152, w: 144, h: 96, variant: 'default' },
  ],
  'Big picture': [
    { id: 'att', x: 8, y: 48, w: 224, h: 200, variant: 'ball' },
    { id: 'map', x: 240, y: 48, w: 216, h: 200, variant: 'default' },
  ],
  'Rangefinder work': [
    { id: 'rng', x: 8, y: 48, w: 144, h: 200, variant: 'default' },
    { id: 'alt', x: 160, y: 48, w: 144, h: 96, variant: 'default' },
    { id: 'batt', x: 160, y: 152, w: 144, h: 96, variant: 'default' },
    { id: 'att', x: 312, y: 48, w: 144, h: 200, variant: 'bars' },
  ],
  'Mission flight': [
    { id: 'map', x: 8, y: 48, w: 296, h: 200, variant: 'default' },
    { id: 'wp', x: 312, y: 48, w: 144, h: 96, variant: 'default' },
    { id: 'home', x: 312, y: 152, w: 144, h: 96, variant: 'default' },
  ],
  'Long range': [
    { id: 'link', x: 8, y: 48, w: 144, h: 96, variant: 'default' },
    { id: 'home', x: 8, y: 152, w: 144, h: 96, variant: 'default' },
    { id: 'map', x: 160, y: 48, w: 296, h: 200, variant: 'default' },
  ],
  'Rover': [
    { id: 'spd', x: 8, y: 48, w: 144, h: 96, variant: 'default' },
    { id: 'thr', x: 8, y: 152, w: 144, h: 96, variant: 'default' },
    { id: 'compass', x: 160, y: 48, w: 144, h: 200, variant: 'default' },
    { id: 'batt', x: 312, y: 48, w: 144, h: 96, variant: 'default' },
    { id: 'timer', x: 312, y: 152, w: 144, h: 96, variant: 'default' },
  ],
  'FPV': [
    { id: 'att', x: 8, y: 48, w: 296, h: 200, variant: 'ball' },
    { id: 'link', x: 312, y: 48, w: 144, h: 96, variant: 'default' },
    { id: 'batt', x: 312, y: 152, w: 144, h: 96, variant: 'default' },
  ],
  'Minimal glance': [
    { id: 'batt', x: 8, y: 48, w: 224, h: 200, variant: 'icon' },
    { id: 'home', x: 240, y: 48, w: 216, h: 96, variant: 'default' },
    { id: 'timer', x: 240, y: 152, w: 216, h: 96, variant: 'default' },
  ],
};
const MAX_PAGES = 4;

/** Display-name keys for LAYOUT_PRESETS; the preset id stays the object key. */
const LAYOUT_PRESET_KEYS: Record<string, string> = {
  'Classic copter': 'radioHud.presets.classic-copter',
  'Navigator': 'radioHud.presets.navigator',
  'Plane': 'radioHud.presets.plane',
  'Systems': 'radioHud.presets.systems',
  'Big picture': 'radioHud.presets.big-picture',
  'Rangefinder work': 'radioHud.presets.rangefinder-work',
  'Mission flight': 'radioHud.presets.mission-flight',
  'Long range': 'radioHud.presets.long-range',
  'Rover': 'radioHud.presets.rover',
  'FPV': 'radioHud.presets.fpv',
  'Minimal glance': 'radioHud.presets.minimal-glance',
};

interface HudCfg {
  name: string;
  cells: number;
  low_cell: number;
  crit_cell: number;
  capacity: number;
  demo: boolean;
  theme: 'dark' | 'light';
  /** Seconds per page for the radio's own rotation; 0 = never. */
  pageSecs: number;
  /** Print what the radio hands the widget (event, touch, fullscreen). */
  debugInput: boolean;
}


/** Mode names the radio should print, from the table for the vehicle that is
 * connected. Without this the widget shows copter names on every vehicle: a
 * rover in HOLD (mode 4) reads as GUIDED. */
const MODE_TABLES: Record<ArduPilotVehicleClass, Record<number, string>> = {
  copter: COPTER_MODES,
  plane: PLANE_MODES,
  vtol: PLANE_MODES,
  rover: ROVER_MODES,
  sub: SUB_MODES,
};

export function modeTableCfg(vehicleClass: ArduPilotVehicleClass): string {
  return Object.entries(MODE_TABLES[vehicleClass])
    .map(([num, name]) => `${num}:${name.toUpperCase()}`)
    .join(',');
}

const DEFAULT_CFG: HudCfg = { name: '', cells: 0, low_cell: 3.6, crit_cell: 3.4, capacity: 0, demo: false, theme: 'dark', pageSecs: 0, debugInput: false };

interface PreviewData {
  armed: boolean;
  mode: string;
  voltV: number;
  currA: number;
  homeDist: number;
  homeBearing: number;
  altM: number;
  vspd: number;
  hspd: number;
  sats: number;
  fix: number;
  hdop: number;
  roll: number;
  pitch: number;
  yaw: number;
  lq: number;
  mahUsed: number;
  /** FC-reported remaining % (CRSF "Bat%" on the radio); null if unknown */
  remainingPct: number | null;
  throttle: number;
  imuTemp: number;
  range: number;
  lat: number | null;
  lon: number | null;
  windMs: number;
  windDirDeg: number;
  flightSecs: number;
  wpNum: number;
  wpDist: number;
  wpBearing: number;
  messages: Array<{ sev: number; text: string }>;
}

const SAMPLE: PreviewData = {
  armed: true, mode: 'LOITER', voltV: 23.4, currA: 7.3,
  homeDist: 229, homeBearing: 156, altM: 63, vspd: -0.4, hspd: 4.2,
  sats: 14, fix: 3, hdop: 0.8, roll: -8, pitch: 4, yaw: 244, lq: 100, mahUsed: 980,
  remainingPct: null,
  throttle: 41, imuTemp: 45, range: 1.34, lat: 42.4411, lon: 19.2632,
  windMs: 3.4, windDirDeg: 62, flightSecs: 192,
  wpNum: 3, wpDist: 184, wpBearing: 276,
  messages: [
    { sev: 6, text: 'EKF3 IMU0 is using GPS' },
    { sev: 4, text: 'Terrain data missing' },
    { sev: 6, text: 'Flight plan received' },
  ],
};

type PreviewMode = 'sample' | 'live' | 'no-link' | 'no-mavlink' | 'streams-off';

const SEV_LABEL: Record<number, string> = { 0: 'EMRG', 1: 'ALRT', 2: 'CRIT', 3: 'ERR', 4: 'WARN', 5: 'NOTC', 6: 'INFO' };

// ----------------------------------------------------- field center picker --

function FieldClickHandler({ onPick }: { onPick: (lat: number, lon: number) => void }) {
  useMapEvents({
    click: (e) => onPick(e.latlng.lat, e.latlng.lng),
  });
  return null;
}

function FieldRecenter({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  useEffect(() => {
    if (lat || lon) map.setView([lat, lon], map.getZoom());
  }, [lat, lon, map]);
  return null;
}

// ------------------------------------------------------------ tile bodies --

function TileFrame({ t, caption, children }: { t: TileDef; caption: string; children?: React.ReactNode }) {
  return (
    <div style={{ position: 'absolute', left: t.x, top: t.y, width: t.w, height: t.h, background: C.surface, border: `1px solid ${C.gaugeEdge}`, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 8, top: 3, fontSize: 11, color: C.text3 }}>{caption}</div>
      {children}
    </div>
  );
}

function NumericBody({ t, value, sub, color }: { t: TileDef; value: string; sub?: string; color?: string }) {
  return (
    <>
      <div style={{ position: 'absolute', left: 8, top: Math.max(18, t.h / 2 - 18), fontSize: 30, fontWeight: 700, color: color ?? C.text }}>{value}</div>
      {sub && t.h >= 70 && <div style={{ position: 'absolute', left: 8, top: t.h - 26, fontSize: 12, color: C.text2, whiteSpace: 'nowrap' }}>{sub}</div>}
    </>
  );
}

function TileBody({ t, data, cfg }: { t: TileDef; data: PreviewData; cfg: HudCfg }) {
  // Mirrors the widget's isGround(): the preview has to read like the radio.
  const groundVehicle = getVehicleClass(useConnectionStore((s) => s.connectionState.mavType)) === 'rover';
  switch (t.id) {
    case 'batt': {
      // cells: config first, else what the radio would auto-detect from
      // peak voltage (4.3V steps, matching effBattery in loadable.lua)
      const cells = cfg.cells > 0 ? cfg.cells : (data.voltV > 6 ? Math.floor(data.voltV / 4.3) + 1 : 0);
      const cellV = cells > 0 ? data.voltV / cells : null;
      // priority mirrors the radio: configured capacity, FC remaining-%,
      // then voltage-only graphic
      const pct = cfg.capacity > 0
        ? Math.max(0, Math.min(100, ((cfg.capacity - data.mahUsed) / cfg.capacity) * 100))
        : data.remainingPct;
      const vColor = pct != null
        ? (pct > 30 ? C.success : pct > 15 ? C.warnStrong : C.danger)
        : cellV == null ? C.text : cellV <= cfg.crit_cell ? C.danger : cellV <= cfg.low_cell ? C.warn : C.success;
      const vfrac = cellV != null ? Math.max(0, Math.min(1, (cellV - cfg.crit_cell) / (4.2 - cfg.crit_cell))) : null;
      const fillPct = pct != null ? pct : vfrac != null ? vfrac * 100 : null;
      const bigText = pct != null ? `${Math.round(pct)}%` : `${data.voltV.toFixed(1)}V`;
      if (t.variant === 'icon' && fillPct != null) {
        return (
          <TileFrame t={t} caption="BATTERY">
            <div style={{ position: 'absolute', left: 8, top: 22, width: 46, height: 22, border: `1px solid ${C.gaugeTick}` }}>
              <div style={{ position: 'absolute', left: 1, top: 1, bottom: 1, width: `${fillPct * 0.92}%`, background: vColor }} />
            </div>
            <div style={{ position: 'absolute', left: 56, top: 25, width: 4, height: 10, background: C.gaugeTick }} />
            <div style={{ position: 'absolute', left: 68, top: 14, fontSize: 30, fontWeight: 700, color: vColor }}>{bigText}</div>
            <div style={{ position: 'absolute', left: 8, top: 52, fontSize: 11, color: C.text2, whiteSpace: 'nowrap' }}>
              {pct != null ? `${data.voltV.toFixed(1)}V  ` : ''}{cellV != null ? `${cellV.toFixed(2)}V/c  ` : ''}{data.currA.toFixed(0)}A
            </div>
          </TileFrame>
        );
      }
      return (
        <TileFrame t={t} caption="BATTERY">
          {fillPct != null ? (
            <>
              <div style={{ position: 'absolute', left: 8, top: 18, fontSize: 30, fontWeight: 700, color: vColor }}>{bigText}</div>
              {pct != null && (
                <div style={{ position: 'absolute', right: 8, top: 30, fontSize: 15, color: C.text2 }}>{data.voltV.toFixed(1)}V</div>
              )}
              <div style={{ position: 'absolute', left: 8, top: t.h - 34, width: t.w - 16, height: 8, background: C.gaugeBezel, border: `1px solid ${C.gaugeEdge}` }}>
                <div style={{ width: `${fillPct}%`, height: '100%', background: vColor }} />
              </div>
              {t.h >= 80 && (
                <div style={{ position: 'absolute', left: 8, top: t.h - 22, fontSize: 11, color: C.text2, whiteSpace: 'nowrap' }}>
                  {cellV != null ? `${cellV.toFixed(2)}V/c  ` : ''}{data.currA.toFixed(0)}A  {data.mahUsed}mAh used
                </div>
              )}
            </>
          ) : (
            <NumericBody t={t} value={`${data.voltV.toFixed(1)}V`} color={vColor}
              sub={cellV != null ? `${cellV.toFixed(2)}V/cell  ${data.currA.toFixed(0)}A` : `${data.currA.toFixed(0)}A`} />
          )}
        </TileFrame>
      );
    }
    case 'home': {
      const a = ((data.homeBearing - data.yaw) * Math.PI) / 180;
      const ar = Math.min(13, t.h / 2 - 8);
      return (
        <TileFrame t={t} caption="HOME">
          <NumericBody t={t} value={`${Math.round(data.homeDist)}m`} sub={`brg ${Math.round(data.homeBearing)}`} />
          {data.homeDist > 0 && (
            <svg style={{ position: 'absolute', right: 9, top: t.h / 2 - ar }} width={ar * 2} height={ar * 2}>
              <line x1={ar - Math.sin(a) * ar} y1={ar + Math.cos(a) * ar} x2={ar + Math.sin(a) * ar} y2={ar - Math.cos(a) * ar} stroke={C.warnStrong} strokeWidth="2" />
              <circle cx={ar + Math.sin(a) * ar} cy={ar - Math.cos(a) * ar} r="3" fill={C.warnStrong} />
            </svg>
          )}
        </TileFrame>
      );
    }
    case 'alt': {
      const vsColor = Math.abs(data.vspd) > 3 ? C.warnStrong : C.success;
      const barH = t.h - 34;
      const frac = Math.max(-1, Math.min(1, data.vspd / 5));
      const fill = Math.abs(frac) * (barH / 2);
      return (
        <TileFrame t={t} caption="ALT / VSPD">
          <NumericBody t={t} value={`${Math.round(data.altM)}m`}
            sub={`${data.vspd >= 0 ? '+' : ''}${data.vspd.toFixed(1)}  ${data.hspd >= 10 ? Math.round(data.hspd) : data.hspd.toFixed(1)} spd`} />
          <div style={{ position: 'absolute', right: 8, top: 20, width: 8, height: barH, background: C.gaugeBezel, border: `1px solid ${C.gaugeEdge}` }}>
            <div style={{
              position: 'absolute', width: '100%', background: vsColor,
              top: frac >= 0 ? barH / 2 - fill : barH / 2, height: fill,
            }} />
            <div style={{ position: 'absolute', left: -2, right: -2, top: barH / 2 - 1, height: 1, background: C.gaugeTick }} />
          </div>
        </TileFrame>
      );
    }
    case 'gps': {
      const gpsColor = data.fix >= 3 ? C.success : data.fix === 2 ? C.warnStrong : C.danger;
      const fixLabel = ['NO GPS', 'NO FIX', '2D', '3D'][data.fix] ?? '?';
      const lit = Math.min(8, Math.round(data.sats / 2));
      return (
        <TileFrame t={t} caption="GPS">
          <NumericBody t={t} value={String(data.sats)} color={gpsColor} sub={`${fixLabel}  hdop ${data.hdop.toFixed(1)}`} />
          <div style={{ position: 'absolute', right: 8, top: 24, display: 'flex', gap: 2 }}>
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} style={{
                width: 6, height: 14,
                background: i < lit ? gpsColor : C.gaugeBezel,
                border: i < lit ? 'none' : `1px solid ${C.gaugeEdge}`,
              }} />
            ))}
          </div>
        </TileFrame>
      );
    }
    case 'att': {
      if (t.variant === 'ball') {
        const cy = (t.h - 24) / 2 + 2;
        const r = Math.min(t.w - 16, t.h - 34) / 2;
        const pitchOffset = data.pitch * (r / 45);
        const hdg = String(Math.round(data.yaw)).padStart(3, '0');
        return (
          <div style={{ position: 'absolute', left: t.x, top: t.y, width: t.w, height: t.h, background: C.surface, border: `1px solid ${C.gaugeEdge}`, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', left: t.w / 2 - r - 3, top: cy - r - 3, width: (r + 3) * 2, height: (r + 3) * 2, borderRadius: '50%', background: C.gaugeBezel }} />
            <div style={{ position: 'absolute', left: t.w / 2 - r, top: cy - r, width: r * 2, height: r * 2, borderRadius: '50%', overflow: 'hidden', boxShadow: `0 0 0 1px ${C.gaugeEdge}` }}>
              <div style={{ position: 'absolute', inset: 0, transform: `rotate(${-data.roll}deg)` }}>
                <div style={{ position: 'absolute', left: -r, right: -r, top: -r * 2, height: r * 3, background: SKY, transform: `translateY(${pitchOffset}px)` }} />
                <div style={{ position: 'absolute', left: -r, right: -r, top: r, height: r * 3, background: GROUND, transform: `translateY(${pitchOffset}px)` }} />
                <div style={{ position: 'absolute', left: -r, right: -r, top: r - 1, height: 2, background: C.needle, transform: `translateY(${pitchOffset}px)` }} />
                {[-20, -10, 10, 20].map((p) => (
                  <div key={p} style={{
                    position: 'absolute', left: '50%', top: r - 1, height: 1, background: C.gaugeTick,
                    width: p % 20 === 0 ? 28 : 16,
                    transform: `translate(-50%, ${pitchOffset - p * (r / 45)}px)`,
                  }} />
                ))}
              </div>
            </div>
            <div style={{ position: 'absolute', left: t.w / 2 - 18, top: cy - 1, width: 12, height: 2, background: C.warnStrong }} />
            <div style={{ position: 'absolute', left: t.w / 2 + 6, top: cy - 1, width: 12, height: 2, background: C.warnStrong }} />
            <div style={{ position: 'absolute', left: t.w / 2 - 2, top: cy - 2, width: 4, height: 4, borderRadius: 2, background: C.warnStrong }} />
            <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: t.h - 20, background: C.gaugeBezel, padding: '1px 6px', fontSize: 13, color: C.gaugeTick }}>{hdg}</div>
          </div>
        );
      }
      if (t.variant === 'bars' || t.variant === 'numeric') {
        const Bar = ({ y, angle, max, warnAt }: { y: number; angle: number; max: number; warnAt: number }) => {
          const bw = t.w - 70;
          const half = bw / 2;
          const frac = Math.max(-1, Math.min(1, angle / max));
          const fill = Math.abs(frac) * half;
          const color = Math.abs(angle) >= warnAt ? C.warnStrong : C.needle;
          return (
            <div style={{ position: 'absolute', left: 8, top: y, width: bw, height: 10, background: C.gaugeBezel, border: `1px solid ${C.gaugeEdge}` }}>
              <div style={{
                position: 'absolute', top: 0, height: '100%', background: color,
                left: frac >= 0 ? '50%' : `calc(50% - ${fill}px)`, width: fill,
              }} />
              <div style={{ position: 'absolute', left: '50%', top: -2, width: 1, height: 14, background: C.gaugeTick }} />
            </div>
          );
        };
        const row2 = 26 + Math.max(34, (t.h - 60) / 2);
        return (
          <TileFrame t={t} caption="ATTITUDE">
            <div style={{ position: 'absolute', left: 8, top: 18, fontSize: 11, color: C.text3 }}>ROLL</div>
            <Bar y={32} angle={data.roll} max={45} warnAt={30} />
            <div style={{ position: 'absolute', right: 8, top: 28, fontSize: 15, color: C.text }}>{data.roll >= 0 ? '+' : ''}{Math.round(data.roll)}</div>
            <div style={{ position: 'absolute', left: 8, top: row2 - 8, fontSize: 11, color: C.text3 }}>PITCH</div>
            <Bar y={row2 + 6} angle={data.pitch} max={30} warnAt={20} />
            <div style={{ position: 'absolute', right: 8, top: row2 + 2, fontSize: 15, color: C.text }}>{data.pitch >= 0 ? '+' : ''}{Math.round(data.pitch)}</div>
            <div style={{ position: 'absolute', left: 8, top: t.h - 22, fontSize: 11, color: C.text2 }}>yaw {String(Math.round(data.yaw)).padStart(3, '0')}</div>
          </TileFrame>
        );
      }
      const pitchPx = data.pitch * (t.h / 90);
      return (
        <div style={{ position: 'absolute', left: t.x, top: t.y, width: t.w, height: t.h, background: C.gaugeFace, border: `1px solid ${C.gaugeBezel}`, overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', left: -t.w / 2, top: t.h / 2 + pitchPx - 1, width: t.w * 2, height: 2,
            background: C.needle, transform: `rotate(${data.roll}deg)`, transformOrigin: 'center',
          }} />
          <div style={{ position: 'absolute', left: t.w / 2 - 18, top: t.h / 2 - 1, width: 12, height: 2, background: C.warnStrong }} />
          <div style={{ position: 'absolute', left: t.w / 2 + 6, top: t.h / 2 - 1, width: 12, height: 2, background: C.warnStrong }} />
          <div style={{ position: 'absolute', left: t.w / 2 - 2, top: t.h / 2 - 2, width: 4, height: 4, borderRadius: 2, background: C.warnStrong }} />
          <div style={{ position: 'absolute', left: 6, bottom: 4, fontSize: 11, color: C.gaugeTick }}>yaw {String(Math.round(data.yaw)).padStart(3, '0')}</div>
        </div>
      );
    }
    case 'compass': {
      const cx = t.w / 2;
      const cy = (t.h - 18) / 2 + 2;
      const r = Math.min(t.w, t.h - 22) / 2 - 4;
      const yawRad = (data.yaw * Math.PI) / 180;
      const homeA = (data.homeBearing * Math.PI) / 180 - yawRad;
      const hdg = String(Math.round(data.yaw)).padStart(3, '0');
      const ticks = [];
      for (let deg = 0; deg < 360; deg += 30) {
        const a = (deg * Math.PI) / 180 - yawRad;
        const major = deg % 90 === 0;
        const len = major ? 9 : 5;
        ticks.push(
          <div key={deg} style={{
            position: 'absolute',
            left: cx + Math.sin(a) * (r - len / 2) - 1,
            top: cy - Math.cos(a) * (r - len / 2) - len / 2,
            width: 2, height: len, background: major ? C.gaugeTick : C.text3,
            transform: `rotate(${deg - data.yaw}deg)`,
          }} />,
        );
        if (major) {
          const L = ({ 0: 'N', 90: 'E', 180: 'S', 270: 'W' } as Record<number, string>)[deg]!;
          ticks.push(
            <div key={L} style={{
              position: 'absolute', left: cx + Math.sin(a) * (r - 17) - 5, top: cy - Math.cos(a) * (r - 17) - 8,
              fontSize: 12, fontWeight: 600, color: L === 'N' ? C.danger : C.gaugeTick,
            }}>{L}</div>,
          );
        }
      }
      return (
        <div style={{ position: 'absolute', left: t.x, top: t.y, width: t.w, height: t.h, background: C.surface, border: `1px solid ${C.gaugeEdge}`, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', left: cx - r - 3, top: cy - r - 3, width: (r + 3) * 2, height: (r + 3) * 2, borderRadius: '50%', background: C.gaugeBezel }} />
          <div style={{ position: 'absolute', left: cx - r, top: cy - r, width: r * 2, height: r * 2, borderRadius: '50%', background: C.gaugeFace }} />
          {ticks}
          {/* lubber line */}
          <div style={{
            position: 'absolute', left: cx - 4, top: cy - r - 3,
            width: 0, height: 0, borderLeft: '4px solid transparent', borderRight: '4px solid transparent',
            borderTop: `8px solid ${C.needle}`,
          }} />
          <div style={{ position: 'absolute', left: cx - 2, top: cy - 2, width: 4, height: 4, borderRadius: 2, background: C.needle }} />
          {data.homeDist > 0 && (
            <div style={{
              position: 'absolute', left: cx + Math.sin(homeA) * (r - 8) - 3, top: cy - Math.cos(homeA) * (r - 8) - 3,
              width: 6, height: 6, borderRadius: 3, background: C.warnStrong,
            }} />
          )}
          <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: t.h - 20, background: C.gaugeBezel, padding: '1px 6px', fontSize: 13, color: C.gaugeTick }}>{hdg}</div>
        </div>
      );
    }
    case 'spd':
      return (
        <TileFrame t={t} caption="SPEED">
          <NumericBody t={t} value={`${data.hspd >= 10 ? Math.round(data.hspd) : data.hspd.toFixed(1)} m/s`}
            sub={`vspd ${data.vspd >= 0 ? '+' : ''}${data.vspd.toFixed(1)}`} />
        </TileFrame>
      );
    case 'timer': {
      const mm = String(Math.floor(data.flightSecs / 60)).padStart(2, '0');
      const ss = String(data.flightSecs % 60).padStart(2, '0');
      return (
        <TileFrame t={t} caption={groundVehicle ? 'RUN TIME' : 'FLIGHT TIME'}>
          <NumericBody
            t={t}
            value={`${mm}:${ss}`}
            sub={data.armed ? (groundVehicle ? 'running' : 'flying') : 'total this session'}
          />
          {data.armed && <div style={{ position: 'absolute', right: 12, top: 20, width: 8, height: 8, borderRadius: 4, background: C.success }} />}
        </TileFrame>
      );
    }
    case 'wind': {
      const a = ((data.windDirDeg - data.yaw) * Math.PI) / 180;
      const ar = Math.min(14, t.h / 2 - 8);
      const acx = t.w - 22;
      const acy = t.h / 2;
      return (
        <TileFrame t={t} caption="WIND">
          <NumericBody t={t} value={`${data.windMs.toFixed(1)} m/s`} color={data.windMs > 8 ? C.warn : C.text}
            sub={`from ${String(Math.round(data.windDirDeg) % 360).padStart(3, '0')}`} />
          <svg style={{ position: 'absolute', left: acx - ar, top: acy - ar }} width={ar * 2} height={ar * 2}>
            <line x1={ar - Math.sin(a) * ar} y1={ar + Math.cos(a) * ar} x2={ar + Math.sin(a) * ar} y2={ar - Math.cos(a) * ar} stroke={C.info} strokeWidth="2" />
            <circle cx={ar + Math.sin(a) * ar} cy={ar - Math.cos(a) * ar} r="3" fill={C.info} />
          </svg>
        </TileFrame>
      );
    }
    case 'link': {
      const lq = data.lq;
      const lqC = lq >= 70 ? C.success : lq >= 40 ? C.warnStrong : C.danger;
      const lit = Math.round(lq / 20);
      const baseY = Math.min(t.h - 30, 58);
      return (
        <TileFrame t={t} caption="SIGNAL">
          <NumericBody t={t} value={`${lq}%`} color={lqC} />
          {t.h >= 70 && (
            <div style={{ position: 'absolute', left: 8, top: t.h - 26, fontSize: 12 }}>
              <span style={{ color: C.success }}>-58 dBm</span>
              <span style={{ color: C.warnStrong, marginLeft: 10 }}>250mW</span>
            </div>
          )}
          {Array.from({ length: 5 }, (_, i) => {
            const bh = 6 + i * 7;
            return (
              <div key={i} style={{
                position: 'absolute', right: 8 + (4 - i) * 8, top: baseY - bh, width: 6, height: bh,
                background: i < lit ? lqC : C.gaugeBezel,
                border: i < lit ? 'none' : `1px solid ${C.gaugeEdge}`,
              }} />
            );
          })}
        </TileFrame>
      );
    }
    case 'txbat': {
      const v = 7.9;
      const pct = Math.max(0, Math.min(100, ((v - 6.6) / (8.4 - 6.6)) * 100));
      return (
        <TileFrame t={t} caption="TX BATTERY">
          <NumericBody t={t} value={`${v.toFixed(1)}V`} sub={`${Math.round(pct)}% of 6.6-8.4V`} />
          <div style={{ position: 'absolute', right: 8, top: 18, width: 6, height: t.h - 30, background: C.gaugeBezel, border: `1px solid ${C.gaugeEdge}` }}>
            <div style={{ position: 'absolute', bottom: 0, width: '100%', height: `${pct}%`, background: C.success }} />
          </div>
        </TileFrame>
      );
    }
    case 'thr': {
      const hot = data.throttle >= 80;
      return (
        <TileFrame t={t} caption="THROTTLE">
          <NumericBody t={t} value={`${data.throttle}%`} color={hot ? C.warnStrong : C.text} />
          <div style={{ position: 'absolute', left: 8, right: 8, bottom: 14, height: 8, background: C.gaugeBezel, border: `1px solid ${C.gaugeEdge}` }}>
            <div style={{ width: `${Math.max(0, Math.min(100, data.throttle))}%`, height: '100%', background: hot ? C.warnStrong : C.success }} />
          </div>
        </TileFrame>
      );
    }
    case 'imu': {
      const c = data.imuTemp >= 70 ? C.danger : data.imuTemp >= 60 ? C.warnStrong : C.success;
      const frac = Math.max(0, Math.min(1, (data.imuTemp - 20) / 60));
      return (
        <TileFrame t={t} caption="IMU TEMP">
          <NumericBody t={t} value={`${data.imuTemp}C`} color={c} />
          <div style={{ position: 'absolute', right: 8, top: 18, width: 8, height: t.h - 30, background: C.gaugeBezel, border: `1px solid ${C.gaugeEdge}` }}>
            <div style={{ position: 'absolute', bottom: 0, width: '100%', height: `${frac * 100}%`, background: c }} />
          </div>
        </TileFrame>
      );
    }
    case 'rng': {
      const near = data.range > 0 && data.range < 1;
      const frac = Math.max(0, Math.min(1, data.range / 5));
      return (
        <TileFrame t={t} caption="RANGE">
          <NumericBody t={t} value={`${data.range.toFixed(2)}m`} color={near ? C.warnStrong : C.text} />
          <div style={{ position: 'absolute', right: 8, top: 18, width: 8, height: t.h - 30, background: C.gaugeBezel, border: `1px solid ${C.gaugeEdge}` }}>
            <div style={{ position: 'absolute', bottom: 0, width: '100%', height: `${frac * 100}%`, background: C.info }} />
          </div>
        </TileFrame>
      );
    }
    case 'pos':
      return (
        <TileFrame t={t} caption="POSITION">
          {data.lat != null && data.lon != null ? (
            <>
              <div style={{ position: 'absolute', left: 8, top: 20, fontSize: 15, color: C.text }}>{data.lat.toFixed(6)}</div>
              <div style={{ position: 'absolute', left: 8, top: 40, fontSize: 15, color: C.text }}>{data.lon.toFixed(6)}</div>
            </>
          ) : (
            <div style={{ position: 'absolute', left: 8, top: 20, fontSize: 15, color: C.text3 }}>no position</div>
          )}
        </TileFrame>
      );
    case 'wp': {
      const a = ((data.wpBearing - data.yaw) * Math.PI) / 180;
      const ar = Math.min(13, t.h / 2 - 8);
      return (
        <TileFrame t={t} caption="MISSION">
          <NumericBody t={t} value={`WP ${data.wpNum}`} color={C.info} sub={`${Math.round(data.wpDist)}m to go`} />
          <svg style={{ position: 'absolute', right: 9, top: t.h / 2 - ar }} width={ar * 2} height={ar * 2}>
            <line x1={ar - Math.sin(a) * ar} y1={ar + Math.cos(a) * ar} x2={ar + Math.sin(a) * ar} y2={ar - Math.cos(a) * ar} stroke={C.info} strokeWidth="2" />
            <circle cx={ar + Math.sin(a) * ar} cy={ar - Math.cos(a) * ar} r="3" fill={C.info} />
          </svg>
        </TileFrame>
      );
    }
    case 'map': {
      // preview placeholder: the real satellite image only exists on the SD
      const a = (data.yaw * Math.PI) / 180;
      const cx = t.w / 2;
      const cy = (t.h - 20) / 2 + 18;
      return (
        <TileFrame t={t} caption="MAP">
          <div style={{
            position: 'absolute', left: 2, top: 18, right: 2, bottom: 18, background: C.gaugeFace,
            backgroundImage: `linear-gradient(${C.gaugeEdge}44 1px, transparent 1px), linear-gradient(90deg, ${C.gaugeEdge}44 1px, transparent 1px)`,
            backgroundSize: '24px 24px',
          }} />
          <svg style={{ position: 'absolute', left: cx - 10, top: cy - 10 }} width="20" height="20">
            <polygon
              points={`${10 + Math.sin(a) * 8},${10 - Math.cos(a) * 8} ${10 - Math.sin(a) * 5 - Math.cos(a) * 5},${10 + Math.cos(a) * 5 - Math.sin(a) * 5} ${10 - Math.sin(a) * 5 + Math.cos(a) * 5},${10 + Math.cos(a) * 5 + Math.sin(a) * 5}`}
              fill={C.danger}
            />
          </svg>
          <div style={{ position: 'absolute', left: 6, bottom: 2, fontSize: 11, color: C.gaugeTick }}>1000m across</div>
          <div style={{ position: 'absolute', right: 6, bottom: 2, fontSize: 10, color: C.text3 }}>satellite image on radio</div>
        </TileFrame>
      );
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------- preview --

interface DragState {
  tileIdx: number;
  mode: 'move' | 'resize';
  startX: number;
  startY: number;
  orig: TileDef;
}

function HudPreview({
  mode, data, cfg, tiles, editing, onTilesChange,
}: {
  mode: PreviewMode;
  data: PreviewData;
  cfg: HudCfg;
  tiles: TileDef[];
  editing: boolean;
  onTilesChange: (tiles: TileDef[]) => void;
}) {
  C = cfg.theme === 'light' ? LIGHT : DARK;
  const [drag, setDrag] = useState<DragState | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!drag) return;
    const snap = (v: number) => Math.round(v / SNAP) * SNAP;
    const MAGNET = 7;
    // After grid snap, magnetize to neighbor edges: exact edge alignment or
    // butting against a neighbor with the standard 8px gap.
    const magnetize = (value: number, targets: number[]) => {
      let best = value;
      let bestDist = MAGNET + 1;
      for (const target of targets) {
        const d = Math.abs(value - target);
        if (d < bestDist) { bestDist = d; best = target; }
      }
      return best;
    };
    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      onTilesChange(tiles.map((t, i) => {
        if (i !== drag.tileIdx) return t;
        const meta = TILE_META[t.id] ?? { minW: 80, minH: 56 };
        const others = tiles.filter((_, j) => j !== drag.tileIdx);
        if (drag.mode === 'move') {
          const xTargets = others.flatMap((o) => [o.x, o.x + o.w - t.w, o.x + o.w + SNAP, o.x - t.w - SNAP]);
          const yTargets = others.flatMap((o) => [o.y, o.y + o.h - t.h, o.y + o.h + SNAP, o.y - t.h - SNAP]);
          let x = magnetize(snap(drag.orig.x + dx), xTargets);
          let y = magnetize(snap(drag.orig.y + dy), yTargets);
          x = Math.max(0, Math.min(SCREEN_W - t.w, x));
          y = Math.max(TILE_REGION_TOP, Math.min(TICKER_TOP - t.h, y));
          return { ...t, x, y };
        }
        // resize: magnetize the moving right/bottom edge to neighbor edges
        const rTargets = others.flatMap((o) => [o.x + o.w - t.x, o.x - SNAP - t.x]);
        const bTargets = others.flatMap((o) => [o.y + o.h - t.y, o.y - SNAP - t.y]);
        let w = magnetize(snap(drag.orig.w + dx), rTargets);
        let h = magnetize(snap(drag.orig.h + dy), bTargets);
        w = Math.max(meta.minW, Math.min(SCREEN_W - t.x, w));
        h = Math.max(meta.minH, Math.min(TICKER_TOP - t.y, h));
        return { ...t, w, h };
      }));
    };
    const onUp = () => setDrag(null);
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
  }, [drag, tiles, onTilesChange]);

  const gridBg = {
    background: C.bgBase,
    backgroundImage: `linear-gradient(${C.grid} 1px, transparent 1px), linear-gradient(90deg, ${C.grid} 1px, transparent 1px)`,
    backgroundSize: '28px 28px',
  };

  if (!editing && (mode === 'no-link' || mode === 'no-mavlink' || mode === 'streams-off')) {
    const banner = mode === 'no-link'
      ? { state: 'NO LINK', hint: 'radio link down - check RX power / binding', color: C.danger }
      : mode === 'no-mavlink'
        ? { state: 'NO MAVLINK', hint: 'link up, no telemetry frames - ELRS MAVLink mode?', color: C.warn }
        : { state: 'STREAMS OFF', hint: 'FC not streaming - connect ArduDeck to fix rates', color: C.warn };
    return (
      <div style={{ position: 'relative', width: SCREEN_W, height: SCREEN_H, ...gridBg, fontFamily: 'Roboto, system-ui, sans-serif' }}>
        <div style={{ position: 'absolute', top: 84, width: '100%', textAlign: 'center', fontSize: 32, fontWeight: 700, color: banner.color }}>{banner.state}</div>
        <div style={{ position: 'absolute', top: 148, width: '100%', textAlign: 'center', fontSize: 15, color: C.text2 }}>{banner.hint}</div>
        <div style={{ position: 'absolute', bottom: 22, width: '100%', textAlign: 'center', fontSize: 13, color: C.accent }}>ArduDeck</div>
      </div>
    );
  }

  return (
    <div ref={rootRef} style={{ position: 'relative', width: SCREEN_W, height: SCREEN_H, ...gridBg, fontFamily: 'Roboto, system-ui, sans-serif', overflow: 'hidden', userSelect: 'none' }}>
      {/* top bar (brand invariant) */}
      <div style={{ position: 'absolute', top: 0, width: '100%', height: 38, background: C.surface }}>
        {/* dim ghost of the EdgeTX corner affordance the radio draws there */}
        <div style={{ position: 'absolute', left: 4, top: 8, width: 38, height: 22, border: `1px dashed ${C.text3}`, borderRadius: 3, opacity: 0.35, fontSize: 8, color: C.text3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>OS</div>
        {/* narrow screens (320 portrait): dot alone carries arm state; the
            word, TX chip and wordmark don't fit next to the mode pill
            (mirrors the widget's `narrow` rule) */}
        <div style={{
          position: 'absolute', left: 47, top: SCREEN_W < 400 ? 12 : 14,
          width: SCREEN_W < 400 ? 14 : 10, height: SCREEN_W < 400 ? 14 : 10, borderRadius: 7,
          background: data.armed ? C.danger : 'transparent', border: data.armed ? 'none' : `1px solid ${C.text3}`,
        }} />
        {SCREEN_W >= 400 && (
          <div style={{ position: 'absolute', left: 64, top: 7, fontSize: 20, fontWeight: 700, color: data.armed ? C.danger : C.text2 }}>
            {data.armed ? 'ARMED' : 'DISARMED'}
          </div>
        )}
        <div style={{ position: 'absolute', left: '50%', top: 5, transform: 'translateX(-50%)', background: C.pillOn, padding: '2px 10px', height: 28, display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: 19, fontWeight: 600, color: C.success }}>{data.mode}</span>
        </div>
        {/* brand cluster as a flex row: everything centers on the same
            midline by construction. Light mode uses the dark-tile logo. */}
        <div style={{ position: 'absolute', right: 8, top: 0, height: 38, display: 'flex', alignItems: 'center', gap: 8 }}>
          {SCREEN_W >= 400 && (
            <>
              {/* TX battery chip (handset vitals; live values are radio-side) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: 4 }}>
                <div style={{ position: 'relative', width: 14, height: 10, border: `1px solid ${C.text2}` }}>
                  <div style={{ position: 'absolute', left: 1, top: 1, bottom: 1, width: '72%', background: C.success }} />
                  <div style={{ position: 'absolute', right: -3, top: 2, width: 2, height: 4, background: C.text2 }} />
                </div>
                <span style={{ fontSize: 12, color: C.text2 }}>7.9</span>
              </div>
            </>
          )}
          <span style={{ fontSize: 12, color: data.lq > 70 ? C.text2 : C.warn, marginRight: 4 }}>LQ {data.lq}</span>
          <img src={cfg.theme === 'light' ? logoLightUrl : logoUrl} style={{ width: 20, height: 20, borderRadius: cfg.theme === 'light' ? 4 : 0 }} alt="" />
          {SCREEN_W >= 400 && <span style={{ fontSize: 12, color: C.text }}>ArduDeck</span>}
        </div>
      </div>

      {/* tiles */}
      {tiles.map((t, i) => (
        <div key={`${t.id}-${i}`} style={{ position: 'relative' }}>
          <TileBody t={t} data={data} cfg={cfg} />
          {editing && (
            <div
              onPointerDown={(e) => {
                e.preventDefault();
                setDrag({ tileIdx: i, mode: 'move', startX: e.clientX, startY: e.clientY, orig: t });
              }}
              style={{
                position: 'absolute', left: t.x, top: t.y, width: t.w, height: t.h,
                border: `1px dashed ${C.accent}`, cursor: 'move', zIndex: 5,
              }}
            >
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onTilesChange(tiles.filter((_, j) => j !== i))}
                style={{
                  position: 'absolute', right: 2, top: 2, width: 16, height: 16, lineHeight: '14px',
                  fontSize: 11, color: C.text, background: C.danger, border: 'none', cursor: 'pointer', zIndex: 6,
                }}
              >×</button>
              {TILE_META[t.id]?.variants && (
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => {
                    const variants = TILE_META[t.id]!.variants!;
                    const next = variants[(variants.indexOf(t.variant) + 1) % variants.length]!;
                    onTilesChange(tiles.map((tt, j) => (j === i ? { ...tt, variant: next } : tt)));
                  }}
                  style={{
                    position: 'absolute', left: 2, top: 2, padding: '0 4px', height: 16, lineHeight: '14px',
                    fontSize: 9, color: C.bgBase, background: C.accent, border: 'none', cursor: 'pointer', zIndex: 6,
                  }}
                >{t.variant}</button>
              )}
              <div
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setDrag({ tileIdx: i, mode: 'resize', startX: e.clientX, startY: e.clientY, orig: t });
                }}
                style={{
                  position: 'absolute', right: -1, bottom: -1, width: 12, height: 12,
                  background: C.accent, cursor: 'nwse-resize', zIndex: 6,
                }}
              />
            </div>
          )}
        </div>
      ))}

      {/* ticker (brand invariant) */}
      <div style={{ position: 'absolute', left: 6, top: TICKER_TOP, fontSize: 11, color: C.text3 }}>MESSAGES</div>
      {cfg.name && <div style={{ position: 'absolute', right: 6, top: TICKER_TOP, fontSize: 11, color: C.text3 }}>{cfg.name}</div>}
      {data.messages.slice(0, 3).map((m, i) => (
        <div key={i} style={{
          position: 'absolute', left: 6, top: TICKER_TOP + 16 + i * 15, fontSize: 12,
          color: m.sev <= 3 ? C.danger : m.sev === 4 ? C.warn : C.text2,
          whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: SCREEN_W - 12,
        }}>
          {SEV_LABEL[m.sev] ?? ''} {m.text}
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------- view --

// Studio state survives view switches and app restarts; a detected card's
// config still wins when one is loaded.
/** Battery context handed to slot formatters (mirrors effBattery/battPct). */
interface BwBatt { cells: number; pct: number | null }

/** Data-slot fields for the B&W script. KEEP IDS IN SYNC with FIELDS in
 *  SDBW/.../ArduDk.lua. */
const BW_FIELDS: Record<string, { label: string; labelKey?: string; fmt: (d: PreviewData, b: BwBatt) => string }> = {
  volt: { label: 'Voltage', labelKey: 'radioHud.bw.voltage', fmt: (d) => `${d.voltV.toFixed(1)}V` },
  cellv: { label: 'Cell voltage', labelKey: 'radioHud.bw.cell-voltage', fmt: (d, b) => (b.cells > 0 ? `${(d.voltV / b.cells).toFixed(2)}v/c` : '--v/c') },
  pct: { label: 'Battery %', labelKey: 'radioHud.bw.battery-pct', fmt: (_d, b) => (b.pct != null ? `${Math.round(b.pct)}%` : '--%') },
  cellpct: { label: 'Cell V + %', labelKey: 'radioHud.bw.cell-v-plus-pct', fmt: (d, b) => `${b.cells > 0 ? `${(d.voltV / b.cells).toFixed(2)}v/c` : ''}${b.pct != null ? ` ${Math.round(b.pct)}%` : ''}` || '--' },
  curr: { label: 'Current', labelKey: 'radioHud.bw.current', fmt: (d) => `${d.currA.toFixed(1)}A` },
  mah: { label: 'mAh used', labelKey: 'radioHud.bw.mah-used', fmt: (d) => `${d.mahUsed}mAh` },
  alt: { label: 'Altitude', labelKey: 'radioHud.bw.altitude', fmt: (d) => `A${Math.round(d.altM)}m` },
  spd: { label: 'Ground speed', labelKey: 'radioHud.bw.ground-speed', fmt: (d) => `S${d.hspd.toFixed(1)}` },
  vspd: { label: 'Climb rate', labelKey: 'radioHud.bw.climb-rate', fmt: (d) => `V${d.vspd >= 0 ? '+' : ''}${d.vspd.toFixed(1)}` },
  sat: { label: 'Sats / fix', labelKey: 'radioHud.bw.sats-fix', fmt: (d) => `${d.sats}s${d.fix >= 3 ? '3D' : d.fix === 2 ? '2D' : '--'}` },
  home: { label: 'Home distance', labelKey: 'radioHud.bw.home-distance', fmt: (d) => `H${Math.round(d.homeDist)}m` },
  wind: { label: 'Wind', labelKey: 'radioHud.bw.wind', fmt: (d) => `w${d.windMs.toFixed(1)}m` },
  hdop: { label: 'HDOP', labelKey: 'radioHud.bw.hdop', fmt: (d) => `hd${d.hdop.toFixed(1)}` },
  rng: { label: 'Rangefinder', labelKey: 'radioHud.bw.rangefinder', fmt: (d) => `r${d.range.toFixed(1)}m` },
  imu: { label: 'IMU temp', labelKey: 'radioHud.bw.imu-temp', fmt: (d) => `i${Math.round(d.imuTemp)}C` },
  wp: { label: 'Waypoint', labelKey: 'radioHud.bw.waypoint', fmt: (d) => (d.wpNum > 0 ? `wp${d.wpNum} ${Math.round(d.wpDist)}m` : 'wp--') },
  thr: { label: 'Throttle', labelKey: 'radioHud.bw.throttle', fmt: (d) => `t${Math.round(d.throttle)}%` },
  yaw: { label: 'Heading', labelKey: 'radioHud.bw.heading', fmt: (d) => String(Math.round(d.yaw) % 360).padStart(3, '0') },
  none: { label: '(empty)', labelKey: 'radioHud.bw.empty', fmt: () => '' },
};

/** Large top-left readout choices (mirrors BIG in ArduDk.lua). */
const BW_BIG: Record<string, { label: string; labelKey?: string; fmt: (d: PreviewData, b: BwBatt) => [string, string] }> = {
  volt: { label: 'Voltage', labelKey: 'radioHud.bw.voltage', fmt: (d) => [d.voltV.toFixed(1), 'V'] },
  pct: { label: 'Battery %', labelKey: 'radioHud.bw.battery-pct', fmt: (_d, b) => [b.pct != null ? String(Math.round(b.pct)) : '--', '%'] },
  alt: { label: 'Altitude', labelKey: 'radioHud.bw.altitude', fmt: (d) => [String(Math.round(d.altM)), 'm'] },
  spd: { label: 'Ground speed', labelKey: 'radioHud.bw.ground-speed', fmt: (d) => [d.hspd.toFixed(1), 'm/s'] },
};

const BW_MONO = 'ui-monospace, SFMono-Regular, monospace';
const BW_INK = '#242b1f';
const BW_GLASS = '#c9d2bd';
const BW_FIELD_OPTIONS = Object.entries(BW_FIELDS).map(([v, f]) => [v, f.label, f.labelKey] as [string, string, string?]);

/** Icon and colour per slot field, so the picker reads at a glance. */
const BW_FIELD_ICONS: Record<string, { Icon: LucideIcon; color: string }> = {
  volt: { Icon: BatteryMedium, color: 'text-emerald-400' },
  cellv: { Icon: BatteryMedium, color: 'text-emerald-400' },
  pct: { Icon: BatteryMedium, color: 'text-emerald-400' },
  cellpct: { Icon: BatteryMedium, color: 'text-emerald-400' },
  curr: { Icon: Zap, color: 'text-amber-400' },
  mah: { Icon: Fuel, color: 'text-amber-400' },
  alt: { Icon: MoveVertical, color: 'text-sky-400' },
  spd: { Icon: MoveRight, color: 'text-sky-400' },
  vspd: { Icon: TrendingUp, color: 'text-sky-400' },
  sat: { Icon: Satellite, color: 'text-teal-400' },
  home: { Icon: Home, color: 'text-orange-400' },
  wind: { Icon: Wind, color: 'text-cyan-400' },
  hdop: { Icon: Crosshair, color: 'text-teal-400' },
  rng: { Icon: Ruler, color: 'text-violet-400' },
  imu: { Icon: Thermometer, color: 'text-rose-400' },
  wp: { Icon: MapPin, color: 'text-blue-400' },
  thr: { Icon: SlidersHorizontal, color: 'text-yellow-400' },
  yaw: { Icon: Compass, color: 'text-purple-400' },
  none: { Icon: X, color: 'text-content-secondary' },
};

/**
 * Field picker: opens where the slot is, one click to assign.
 *
 * Replaces a row of <select>s. On a 128x64 canvas the slots are small, so
 * the grid is an icon per field rather than a dropdown you have to read
 * item by item, and "Empty" is a tile like any other.
 */
function BwFieldPicker({ x, y, value, options, onPick, onClose }: {
  x: number; y: number; value: string;
  options: Array<[string, string, string?]>; onPick: (v: string) => void; onClose: () => void;
}) {
  const { t } = useTranslation('views');
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); onClose(); }} />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ position: 'absolute', left: x, top: y }}
        className="z-50 w-56 p-2 rounded-lg bg-surface-raised border border-subtle shadow-xl"
      >
        <div className="grid grid-cols-3 gap-1">
          {options.map(([id, label, labelKey]) => {
            const meta = BW_FIELD_ICONS[id] ?? BW_FIELD_ICONS.none!;
            const active = id === value;
            const text = rhText(t, labelKey, label);
            return (
              <button
                key={id}
                onClick={() => { onPick(id); onClose(); }}
                data-tip={text}
                className={`flex flex-col items-center gap-0.5 px-1 py-1.5 rounded border text-[10px] transition-colors ${active
                  ? 'bg-teal-500/20 border-teal-500/50 text-teal-200'
                  : 'bg-surface-input border-subtle text-content-secondary hover:text-content hover:bg-surface-raised'}`}
              >
                <meta.Icon className={`w-3.5 h-3.5 ${active ? 'text-teal-300' : meta.color}`} />
                <span className="truncate w-full text-center">{text}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

/**
 * Compact forms used only when a row grows (mirrors COMPACT in ArduDk.lua).
 * Growing is about using the free HEIGHT, so a value too wide for the bigger
 * font drops its tag and unit rather than refusing to grow.
 */
const BW_COMPACT: Record<string, (d: PreviewData, b: BwBatt) => string> = {
  volt: (d) => d.voltV.toFixed(1),
  curr: (d) => d.currA.toFixed(1),
  mah: (d) => String(d.mahUsed),
  alt: (d) => String(Math.round(d.altM)),
  spd: (d) => d.hspd.toFixed(0),
  vspd: (d) => `${d.vspd >= 0 ? '+' : ''}${d.vspd.toFixed(0)}`,
  sat: (d) => String(d.sats),
  home: (d) => String(Math.round(d.homeDist)),
  wind: (d) => d.windMs.toFixed(0),
  rng: (d) => d.range.toFixed(1),
  thr: (d) => String(Math.round(d.throttle)),
  yaw: (d) => String(Math.round(d.yaw) % 360).padStart(3, '0'),
  wp: (d) => String(Math.round(d.wpDist)),
};

const BW_BOTTOM_CHROME_Y = 56;

type BwSize = 'dbl' | 'mid' | null;

function bwFitSize(text: string, room: number): BwSize {
  if (text.length * 11 <= room) return 'dbl';
  if (text.length * 8 <= room) return 'mid';
  return null;
}

interface BwRow { text: string; y: number; size: BwSize }

/**
 * Mirrors drawSlots in ArduDk.lua: an empty neighbour is free space, the
 * surviving row grows into it, and the row after the last drawn one is
 * handed back so the caller can use the leftover height (the home arrow).
 * KEEP THE NUMBERS IN SYNC with that function.
 */
function bwRows(
  list: string[], i0: number, count: number, room: number, y0: number,
  data: PreviewData, batt: BwBatt,
): { rows: BwRow[]; freeY: number } {
  const text = (id: string | undefined) => (id ? BW_FIELDS[id]?.fmt(data, batt) ?? '' : '');
  const empty = (id: string | undefined) => id === undefined || id === 'none' || text(id) === '';
  const grown = (id: string, full: string): [string, BwSize] => {
    const direct = bwFitSize(full, room);
    if (direct) return [full, direct];
    const short = BW_COMPACT[id]?.(data, batt);
    if (short) {
      const size = bwFitSize(short, room);
      if (size) return [short, size];
    }
    return [full, null];
  };

  const rows: BwRow[] = [];
  let i = 0;
  let last = 0;
  while (i < count) {
    const here = list[i0 + i];
    const below = list[i0 + i + 1];
    const y = y0 + i * 8;
    const fits = y + 16 <= BW_BOTTOM_CHROME_Y && i + 1 < count;
    if (empty(here)) {
      if (i + 1 < count && !empty(below)) {
        const [t, size] = fits ? grown(below!, text(below)) : [text(below), null as BwSize];
        rows.push({ text: t, y: size ? y : y + 8, size });
        i += 2;
        last = i;
      } else {
        i += 1;
      }
    } else {
      const [t, size] = (i + 1 < count && empty(below) && fits)
        ? grown(here!, text(here))
        : [text(here), null as BwSize];
      rows.push({ text: t, y, size });
      i += size ? 2 : 1;
      last = i;
    }
  }
  return { rows, freeY: y0 + last * 8 };
}

function BwSlotRows({ s, SML, list, listKey, x, count, i0 = 0, room, editing, data, batt, onOpen }: {
  s: number; SML: number; list: string[]; listKey: 'left' | 'cslots' | 'slots' | 'wslots';
  x: number; count: number; i0?: number; room: number; editing: boolean;
  data: PreviewData; batt: BwBatt;
  onOpen: (index: number, xPx: number, yPx: number) => void;
}) {
  const { t } = useTranslation('views');
  const y0 = listKey === 'left' ? 27 : 9;

  if (editing) {
    return (
      <>
        {Array.from({ length: count }, (_, i) => {
          const id = list[i0 + i] ?? 'none';
          const meta = BW_FIELD_ICONS[id] ?? BW_FIELD_ICONS.none!;
          const field = BW_FIELDS[id] ?? BW_FIELDS.none!;
          return (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); onOpen(i0 + i, x * s, (y0 + i * 8 + 9) * s); }}
              style={{
                position: 'absolute', left: x * s, top: (y0 + i * 8) * s - 1,
                width: Math.min(room, 46) * s, height: 8 * s,
                display: 'flex', alignItems: 'center', gap: 3, padding: '0 3px', overflow: 'hidden',
                fontSize: Math.max(8, SML - 2), fontFamily: BW_MONO, fontWeight: 700, color: BW_INK,
                background: 'rgba(255,255,255,0.6)', border: `1px dashed ${BW_INK}`, borderRadius: 2,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              <meta.Icon style={{ width: SML, height: SML, flexShrink: 0 }} />
              {rhText(t, field.labelKey, field.label)}
            </button>
          );
        })}
      </>
    );
  }

  const { rows } = bwRows(list, i0, count, room, y0, data, batt);
  return (
    <>
      {rows.map((row, i) => (
        <div key={i} style={{
          position: 'absolute', left: x * s, top: row.y * s,
          fontSize: row.size === 'dbl' ? SML * 2.2 : row.size === 'mid' ? SML * 1.5 : SML,
          lineHeight: 1, fontFamily: BW_MONO, fontWeight: 700, color: BW_INK, whiteSpace: 'nowrap',
        }}>{row.text}</div>
      ))}
    </>
  );
}

/** Full B&W layout config (everything between the strips is a slot). */
interface BwLayout {
  big: string;
  left: string[];
  center: 'horizon' | 'slots';
  cslots: string[];
  slots: string[];
  wslots: string[];
}
const DEFAULT_BW_LAYOUT: BwLayout = {
  big: 'volt',
  left: ['cellpct', 'curr', 'mah', 'thr'],
  center: 'horizon',
  cslots: ['alt', 'spd', 'vspd', 'sat', 'home', 'wind', 'hdop', 'rng', 'wp', 'yaw'],
  slots: ['alt', 'spd', 'vspd', 'sat', 'home'],
  wslots: ['wind', 'hdop', 'rng', 'imu', 'wp'],
};

/** 1-bit mirror of the B&W telemetry script (SDBW/.../ArduDk.lua): dark
 *  pixels on light LCD glass (that's what these displays ARE), fixed
 *  chrome + editable data slots, click flips pages like the radio's
 *  rotary. Keep positions in sync with the script's drawFly/drawNav. */
function BwPreview({ mode, data, cfg, screenW, editing, layout, onLayout }: {
  mode: PreviewMode; data: PreviewData; cfg: HudCfg; screenW: number;
  editing: boolean; layout: BwLayout;
  onLayout: (next: BwLayout) => void;
}) {
  const { t } = useTranslation('views');
  const [page, setPage] = useState(1);
  // open field picker: which list, which index, and where to draw it
  const [picker, setPicker] = useState<
    { key: 'left' | 'cslots' | 'slots' | 'wslots' | 'big'; index: number; x: number; y: number } | null
  >(null);
  const s = screenW > 150 ? 2 : 3; // 128->384px, 212->424px: fits the column
  const INK = '#242b1f';
  const GLASS = '#c9d2bd';
  const SML = Math.round(6.6 * s);
  /** Slot name for the editor chips and the picker (editor vocabulary, not the
   *  script's own readouts). */
  const fieldLabel = (id: string | undefined): string => {
    const f = BW_FIELDS[id ?? 'none'] ?? BW_FIELDS.none!;
    return rhText(t, f.labelKey, f.label);
  };
  const batt: BwBatt = {
    cells: cfg.cells > 0 ? cfg.cells : (data.voltV > 6 ? Math.floor(data.voltV / 4.3) + 1 : 0),
    pct: cfg.capacity > 0
      ? Math.max(0, Math.min(100, ((cfg.capacity - data.mahUsed) / cfg.capacity) * 100))
      : data.remainingPct,
  };
  const mono = 'ui-monospace, SFMono-Regular, monospace';
  const Txt = ({ x, y, size, inv, children }: { x: number; y: number; size?: number; inv?: boolean; children: React.ReactNode }) => (
    <div style={{
      position: 'absolute', left: x * s, top: y * s, fontSize: size ?? SML, lineHeight: 1,
      fontFamily: mono, fontWeight: 700,
      color: inv ? GLASS : INK, whiteSpace: 'nowrap',
    }}>{children}</div>
  );
  const Strip = ({ y }: { y: number }) => (
    <div style={{ position: 'absolute', left: 0, top: y * s, width: '100%', height: 8 * s, background: INK }} />
  );
  const setList = (key: 'left' | 'cslots' | 'slots' | 'wslots', i: number, v: string) => {
    const next = [...layout[key]];
    next[i] = v;
    onLayout({ ...layout, [key]: next });
  };
  const timer = `${String(Math.floor(data.flightSecs / 60)).padStart(2, '0')}:${String(data.flightSecs % 60).padStart(2, '0')}`;
  const ladder = mode === 'no-link' ? ['NO LINK', 'check RX power / binding']
    : mode === 'no-mavlink' ? ['NO MAVLINK', 'ELRS MAVLink mode off?']
    : mode === 'streams-off' ? ['STREAMS OFF', 'connect ArduDeck once'] : null;
  // horizon geometry, same math as the Lua
  const wide = screenW > 150;
  const hx = wide ? 62 : 50;
  const hw = wide ? 64 : 42;
  const hcx = (hx + hw / 2) * s;
  const hcy = (9 + 23) * s;
  const roll = (data.roll * Math.PI) / 180;
  const len = (hw / 2 - 3) * s;
  const pmax = Math.max(0, (23 - 2) * s - Math.abs(Math.sin(roll)) * len);
  const p = Math.max(-pmax, Math.min(pmax, (data.pitch / 60) * 23 * s));
  const ca = Math.cos(roll);
  const sa = Math.sin(roll);
  const homeA = ((data.homeBearing - data.yaw) * Math.PI) / 180;
  const rx = hx + hw + 4;
  // the home arrow owns the height the right column did not use, same rule
  // as drawFly in the script
  const rightRoom = wide ? 44 : screenW - rx;
  const rightFree = bwRows(layout.slots, 0, 5, rightRoom, 9, data, batt).freeY;
  const arrowBand = BW_BOTTOM_CHROME_Y - rightFree;
  const arrowGeom = arrowBand >= 14
    ? { cx: rx + 10, cy: rightFree + Math.floor(arrowBand / 2), r: Math.min(Math.floor(arrowBand / 2) - 1, 16) }
    : { cx: rx + 8, cy: 52, r: 5 };
  const [bigNum, bigUnit] = (BW_BIG[layout.big] ?? BW_BIG.volt!).fmt(data, batt);
  const Arrow = ({ cx, cy, r }: { cx: number; cy: number; r: number }) => {
    const tx = (cx + Math.sin(homeA) * r) * s;
    const ty = (cy - Math.cos(homeA) * r) * s;
    return (
      <svg style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }} width={screenW * s} height={64 * s}>
        {[2.6, -2.6].map((o) => (
          <line key={o} x1={(cx + Math.sin(homeA + o) * r) * s} y1={(cy - Math.cos(homeA + o) * r) * s}
            x2={tx} y2={ty} stroke={INK} strokeWidth={s} />
        ))}
        <line x1={cx * s} y1={cy * s} x2={tx} y2={ty} stroke={INK} strokeWidth={s} />
      </svg>
    );
  };
  return (
    <div>
      {/* bezel as padding on a wrapper: border-box would otherwise eat 12px
          of the 64-row canvas and clip the bottom strip */}
      <div style={{ display: 'inline-block', padding: 6, background: '#1b1d1a', borderRadius: 8, cursor: 'pointer' }}
        onClick={() => setPage(page === 1 ? 2 : 1)}
        data-tip={t('radioHud.bw.flip-tip')}
      >
        <div style={{
          position: 'relative', width: screenW * s, height: 64 * s, background: GLASS,
          overflow: 'hidden', boxShadow: 'inset 0 0 18px rgba(30,40,20,0.25)',
        }}>
          {ladder ? (
            <>
              <Txt x={screenW / 2 - ladder[0]!.length * 3.4} y={18} size={SML * 2}>{ladder[0]}</Txt>
              <Txt x={screenW / 2 - ladder[1]!.length * 1.7} y={40}>{ladder[1]}</Txt>
              <Txt x={1} y={56.6}>ArduDeck</Txt>
            </>
          ) : (
            <>
              <Strip y={0} />
              <Txt x={1} y={0.6} inv>{data.mode}</Txt>
              <Txt x={screenW / 2 - 12} y={0.6} inv>{timer}</Txt>
              <Txt x={screenW - 24} y={0.6} inv>RS{data.lq}</Txt>
              <Strip y={56} />
              <Txt x={1} y={56.6} inv>
                {data.messages[0]?.text.slice(0, Math.floor(screenW / 5))
                  ?? `${cfg.name || 'ArduDeck'}  ${data.armed ? 'ARMED' : 'DISARMED'}`}
              </Txt>
              {page === 1 ? (
                <>
                  <Txt x={0} y={10} size={SML * 2.2}>{bigNum}</Txt>
                  <Txt x={44} y={10}>{bigUnit}</Txt>
                  {editing && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setPicker({ key: 'big', index: 0, x: 0, y: 26 * s }); }}
                      data-tip={t('radioHud.bw.large-readout')}
                      style={{
                        position: 'absolute', left: 0, top: 9 * s, width: 46 * s, height: 17 * s,
                        background: 'rgba(255,255,255,0.35)', border: `1px dashed ${INK}`,
                        borderRadius: 2, cursor: 'pointer',
                      }}
                    />
                  )}
                  <BwSlotRows s={s} SML={SML} list={layout.left} listKey="left" x={0} count={3} room={hx - 2}
                    editing={editing} data={data} batt={batt}
                    onOpen={(i, px, py) => setPicker({ key: 'left', index: i, x: px, y: py })} />
                  {editing ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); setPicker({ key: 'left', index: 3, x: 0, y: 50 * s }); }}
                      style={{
                        position: 'absolute', left: 0, top: 48 * s, width: Math.min(hx - 2, 46) * s, height: 8 * s,
                        fontSize: Math.max(8, SML - 2), fontFamily: BW_MONO, fontWeight: 700, color: INK,
                        background: 'rgba(255,255,255,0.6)', border: `1px dashed ${INK}`, borderRadius: 2,
                        cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden',
                      }}
                    >{fieldLabel(layout.left[3])}</button>
                  ) : (
                    <Txt x={0} y={49}>{BW_FIELDS[layout.left[3] ?? 'none']?.fmt(data, batt)}</Txt>
                  )}
                  {layout.center === 'slots' ? (
                    <>
                      <BwSlotRows s={s} SML={SML} list={layout.cslots} listKey="cslots" x={hx} count={5} room={hw / 2}
                        editing={editing} data={data} batt={batt}
                        onOpen={(i, px, py) => setPicker({ key: 'cslots', index: i, x: px, y: py })} />
                      <BwSlotRows s={s} SML={SML} list={layout.cslots} listKey="cslots" x={hx + hw / 2 + 2} count={5} i0={5} room={hw / 2}
                        editing={editing} data={data} batt={batt}
                        onOpen={(i, px, py) => setPicker({ key: 'cslots', index: i, x: px, y: py })} />
                    </>
                  ) : (
                    <>
                      {/* artificial horizon */}
                      <div style={{ position: 'absolute', left: hx * s, top: 9 * s, width: hw * s, height: 46 * s, border: `${s}px solid ${INK}` }} />
                      <svg style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }} width={screenW * s} height={64 * s}>
                        <line x1={hcx - ca * len + sa * p} y1={hcy + sa * len + ca * p}
                          x2={hcx + ca * len + sa * p} y2={hcy - sa * len + ca * p} stroke={INK} strokeWidth={s} />
                        <line x1={hcx - 5 * s} y1={hcy} x2={hcx - 2 * s} y2={hcy} stroke={INK} strokeWidth={s} />
                        <line x1={hcx + 2 * s} y1={hcy} x2={hcx + 5 * s} y2={hcy} stroke={INK} strokeWidth={s} />
                        <rect x={hcx - s} y={hcy - s} width={2 * s} height={2 * s} fill={INK} />
                      </svg>
                      <div style={{ position: 'absolute', left: hcx - 10 * s, top: (9 + 46 - 8) * s, width: 20 * s, height: 8 * s, background: INK }} />
                      <Txt x={hx + hw / 2 - 8} y={9 + 46 - 7.4} inv>{String(Math.round(data.yaw) % 360).padStart(3, '0')}</Txt>
                    </>
                  )}
                  {editing && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        position: 'absolute', left: hx * s, top: (layout.center === 'slots' ? 50 : 22) * s,
                        display: 'flex', gap: 2,
                      }}
                    >
                      {(['horizon', 'slots'] as const).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => onLayout({ ...layout, center: mode })}
                          style={{
                            fontSize: Math.max(8, SML - 2), fontFamily: BW_MONO, fontWeight: 700,
                            padding: '1px 4px', borderRadius: 2, cursor: 'pointer',
                            border: `1px ${layout.center === mode ? 'solid' : 'dashed'} ${INK}`,
                            background: layout.center === mode ? INK : 'rgba(255,255,255,0.6)',
                            color: layout.center === mode ? GLASS : INK,
                          }}
                        >{mode === 'horizon' ? t('radioHud.bw.horizon') : t('radioHud.bw.slots')}</button>
                      ))}
                    </div>
                  )}
                  <BwSlotRows s={s} SML={SML} list={layout.slots} listKey="slots" x={rx} count={5}
                    room={wide ? 44 : screenW - rx}
                    editing={editing} data={data} batt={batt}
                    onOpen={(i, px, py) => setPicker({ key: 'slots', index: i, x: px, y: py })} />
                  {!editing && data.homeDist > 0 && <Arrow {...arrowGeom} />}
                  {wide && <BwSlotRows s={s} SML={SML} list={layout.wslots} listKey="wslots" x={rx + 46} count={5}
                    room={screenW - (rx + 46)}
                    editing={editing} data={data} batt={batt}
                    onOpen={(i, px, py) => setPicker({ key: 'wslots', index: i, x: px, y: py })} />}
                </>
              ) : (
                <>
                  <Txt x={0} y={10} size={SML * 1.2}>{data.lat != null ? data.lat.toFixed(6) : 'no position'}</Txt>
                  <Txt x={0} y={20} size={SML * 1.2}>{data.lon != null ? data.lon.toFixed(6) : ''}</Txt>
                  <Txt x={0} y={30}>{`home ${Math.round(data.homeDist)}m brg ${Math.round(data.homeBearing)}`}</Txt>
                  <Txt x={0} y={38}>{data.wpNum > 0 ? `wp ${data.wpNum}  ${Math.round(data.wpDist)}m brg ${Math.round(data.wpBearing)}` : 'no mission wp'}</Txt>
                  <Txt x={0} y={46}>{`wind ${data.windMs.toFixed(1)}m/s ${Math.round(data.windDirDeg)}  thr ${Math.round(data.throttle)}%`}</Txt>
                  <Txt x={screenW - 50} y={10}>{`alt ${Math.round(data.altM)}m`}</Txt>
                  <Txt x={screenW - 50} y={18}>{`hdp ${data.hdop.toFixed(1)}`}</Txt>
                  <Txt x={screenW - 50} y={26}>{`vsp ${data.vspd >= 0 ? '+' : ''}${data.vspd.toFixed(1)}`}</Txt>
                  {data.homeDist > 0 && <Arrow cx={screenW - 40} cy={40} r={6} />}
                </>
              )}
            </>
          )}
        </div>
        {picker && (
          <BwFieldPicker
            x={Math.min(6 + picker.x, Math.max(6, screenW * s - 210))}
            y={6 + picker.y}
            value={picker.key === 'big' ? layout.big : (layout[picker.key][picker.index] ?? 'none')}
            options={picker.key === 'big'
              ? Object.entries(BW_BIG).map(([v, b]) => [v, b.label, b.labelKey] as [string, string, string?])
              : BW_FIELD_OPTIONS}
            onPick={(v) => {
              if (picker.key === 'big') onLayout({ ...layout, big: v });
              else setList(picker.key, picker.index, v);
            }}
            onClose={() => setPicker(null)}
          />
        )}
      </div>
      <p className="mt-1.5 text-[11px] text-content-tertiary" style={{ maxWidth: screenW * s + 12 }}>
        {t('radioHud.bw.help', { page })}
        {editing && t('radioHud.bw.help-editing')}
      </p>
    </div>
  );
}

const STUDIO_STORAGE_KEY = 'radio-hud.studio';

interface PersistedStudio {
  cfg: HudCfg;
  pages: TileDef[][];
  mapCenter: { lat: number; lon: number };
  /** selected radio screen class; absent in pre-multiscreen saves (=TX15) */
  screen?: { w: number; h: number };
  /** B&W script slot layout (older saves may carry bwSlots/bwWslots only) */
  bw?: BwLayout;
  bwSlots?: string[];
  bwWslots?: string[];
}

function loadPersistedStudio(): PersistedStudio | null {
  try {
    const raw = localStorage.getItem(STUDIO_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedStudio;
    if (!parsed.pages?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function RadioHudView() {
  const { t } = useTranslation('views');
  const persisted = useMemo(loadPersistedStudio, []);
  const [cfg, setCfg] = useState<HudCfg>(persisted?.cfg ?? DEFAULT_CFG);
  const [screen, setScreen] = useState<{ w: number; h: number }>(persisted?.screen ?? REF_SCREEN);
  // WYSIWYG canvas: the module geometry follows the selected radio model
  SCREEN_W = screen.w;
  SCREEN_H = screen.h;
  TICKER_TOP = screen.h - 66;
  const isBw = !!SCREEN_MODELS.find((m) => m.w === screen.w && m.h === screen.h)?.bw;
  const [bw, setBw] = useState<BwLayout>(persisted?.bw ?? {
    ...DEFAULT_BW_LAYOUT,
    // migrate pre-full-slot saves that only carried the right columns
    ...(persisted?.bwSlots ? { slots: persisted.bwSlots } : {}),
    ...(persisted?.bwWslots ? { wslots: persisted.bwWslots } : {}),
  });
  // layout pages; the radio swipes between them (or pins via the Page option)
  // A first-run studio starts on the set that matches whatever is connected,
  // so a rover owner never has to know the copter layout was the default.
  const [pages, setPages] = useState<TileDef[][]>(
    persisted?.pages
      ?? [getVehicleClass(useConnectionStore.getState().connectionState.mavType) === 'rover'
        ? (LAYOUT_PRESETS['Rover'] ?? DEFAULT_LAYOUT)
        : DEFAULT_LAYOUT],
  );
  // switching radio model rescales every page (same math as the widget);
  // B&W targets have a fixed script layout, so tiles pass through untouched
  // and are still there when the user switches back to a color model
  const changeScreen = (m: ScreenModel) => {
    if (!m.bw && !isBw) {
      setPages((prev) => prev.map((p) => p.map((t) => fitTile(t, screen, m))));
    }
    setScreen({ w: m.w, h: m.h });
  };
  const [activePage, setActivePage] = useState(0);
  const tiles = pages[activePage] ?? pages[0]!;
  const setTiles = useCallback((next: TileDef[]) => {
    setPages((prev) => prev.map((p, i) => (i === activePage ? next : p)));
  }, [activePage]);
  const [editing, setEditing] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [addPageOpen, setAddPageOpen] = useState(false);
  const addPage = (layout: TileDef[]) => {
    setPages((prev) => [...prev, layout]);
    setActivePage(pages.length);
    setAddPageOpen(false);
    setEditing(true);
  };
  const [previewMode, setPreviewMode] = useState<PreviewMode>('sample');
  const [scan, setScan] = useState<EdgeTxScanResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [applyState, setApplyState] = useState<string | null>(null);
  // Models on the card: one radio flies several machines, so a layout can be
  // written for all of them (hud.cfg) or for one (models/<name>.cfg).
  const [models, setModels] = useState<{ file: string; name: string; current: boolean; hasLayout: boolean }[]>([]);
  // Where the pages on screen came from, so applying them somewhere else is
  // recognisably a copy and not a save.
  const [pagesFrom, setPagesFrom] = useState<string | null>(null);
  const [confirmApply, setConfirmApply] = useState(false);
  const [layouts, setLayouts] = useState<SavedHudLayout[]>(() => loadLayouts());
  const [layoutName, setLayoutName] = useState(() => loadLayouts()[0]?.name ?? t('radioHud.layout.my-layout'));
  const [nameDraft, setNameDraft] = useState('');
  const [applyTarget, setApplyTarget] = useState<string>('');
  // Once the user picks a target themselves, a rescan must not move it back.
  const targetTouched = useRef(false);
  // Which file the last Load from radio actually read, for the status line.
  const loadedSourceRef = useRef<'model' | 'shared'>('shared');
  const [applyError, setApplyError] = useState<string | null>(null);

  const { connectionState } = useConnectionStore();
  const isPx4 = connectionState.firmware === 'px4';
  const telemetry = useTelemetryStore();

  // Field maps: generated on demand, shipped with the next Apply
  const [fieldMaps, setFieldMaps] = useState<FieldMapImage[] | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lon: number }>(
    persisted?.mapCenter ?? { lat: 0, lon: 0 },
  );
  const [mapGenState, setMapGenState] = useState<string | null>(null);

  // persist studio state (cfg, pages, field center) across view switches
  useEffect(() => {
    try {
      localStorage.setItem(STUDIO_STORAGE_KEY, JSON.stringify({ cfg, pages, mapCenter, screen, bw } satisfies PersistedStudio));
    } catch {
      // storage full/unavailable; state simply won't survive a reload
    }
  }, [cfg, pages, mapCenter, screen, bw]);

  // default the field center to the vehicle's position when one appears
  useEffect(() => {
    if (telemetry.gps.lat && telemetry.gps.lon && mapCenter.lat === 0 && mapCenter.lon === 0) {
      setMapCenter({ lat: telemetry.gps.lat, lon: telemetry.gps.lon });
    }
  }, [telemetry.gps.lat, telemetry.gps.lon, mapCenter]);

  // The editor IS the layout: every change writes through to the library, the
  // way the map cockpit persists itself. Debounced so a drag is one write.
  useEffect(() => {
    const name = layoutName.trim();
    if (isBw || !name) return;
    const t = setTimeout(() => {
      setLayouts((prev) => {
        const next = upsertLayout(prev, { name, screen, pages, savedAt: new Date().toISOString() });
        persistLayouts(next);
        return next;
      });
    }, 600);
    return () => clearTimeout(t);
  }, [pages, screen, layoutName, isBw]);

  useEffect(() => { setNameDraft(layoutName); }, [layoutName]);

  const commitRename = () => {
    const to = nameDraft.trim();
    if (!to || to === layoutName) {
      setNameDraft(layoutName);
      return;
    }
    const result = renameLayout(layouts, layoutName, to);
    if (!result.renamed) {
      setNameDraft(layoutName);
      setApplyState(t('radioHud.layout.already-exists', { name: to }));
      return;
    }
    persistLayouts(result.layouts);
    setLayouts(result.layouts);
    setLayoutName(to);
  };

  const handleGenerateMaps = async () => {
    if (!mapCenter.lat && !mapCenter.lon) {
      setMapGenState(t('radioHud.maps.set-center-first'));
      return;
    }
    setMapGenState(t('radioHud.maps.stitching'));
    try {
      // Match the placed map tile so the image fills it instead of
      // letterboxing; the widget subtracts its own caption strip.
      const mapTile = pages.flat().find((t) => t.id === 'map');
      const size = mapTile ? { w: mapTile.w - 2, h: mapTile.h - 20 } : undefined;
      const { maps, missingTiles } = await generateFieldMaps(mapCenter.lat, mapCenter.lon, size,
        (d, total) => setMapGenState(t('radioHud.maps.stitching-progress', { done: d, total })));
      setFieldMaps(maps);
      setMapGenState(missingTiles > 0
        ? t('radioHud.maps.ready-missing', { zooms: maps.length, missing: missingTiles })
        : t('radioHud.maps.ready', { zooms: maps.length }));
    } catch (e) {
      setMapGenState(null);
      setApplyError(e instanceof Error ? e.message : String(e));
    }
  };

  const liveData: PreviewData = useMemo(() => ({
    armed: telemetry.flight.armed,
    mode: (telemetry.flight.mode || 'UNKNOWN').toUpperCase(),
    voltV: telemetry.battery.voltage,
    currA: telemetry.battery.current,
    homeDist: telemetry.navController?.wpDist ?? 0,
    homeBearing: telemetry.navController?.targetBearing ?? 0,
    altM: telemetry.vfrHud.alt,
    vspd: telemetry.vfrHud.climb,
    hspd: telemetry.vfrHud.groundspeed,
    sats: telemetry.gps.satellites,
    fix: Math.min(telemetry.gps.fixType, 3),
    hdop: telemetry.gps.hdop >= 99 ? 0 : telemetry.gps.hdop,
    roll: telemetry.attitude.roll * 57.2958,
    pitch: telemetry.attitude.pitch * 57.2958,
    yaw: ((telemetry.attitude.yaw * 57.2958) + 360) % 360,
    lq: 100,
    mahUsed: telemetry.battery.remaining >= 0 && cfg.capacity > 0
      ? Math.round(cfg.capacity * (1 - telemetry.battery.remaining / 100))
      : 0,
    remainingPct: telemetry.battery.remaining >= 1 && telemetry.battery.remaining <= 100
      ? telemetry.battery.remaining
      : null,
    throttle: telemetry.vfrHud.throttle,
    imuTemp: SAMPLE.imuTemp,
    range: SAMPLE.range,
    lat: telemetry.gps.lat || null,
    lon: telemetry.gps.lon || null,
    windMs: telemetry.wind?.speed ?? 0,
    windDirDeg: telemetry.wind?.direction ?? 0,
    flightSecs: SAMPLE.flightSecs,
    wpNum: SAMPLE.wpNum,
    wpDist: telemetry.navController?.wpDist ?? 0,
    wpBearing: telemetry.navController?.targetBearing ?? 0,
    messages: SAMPLE.messages,
  }), [telemetry, cfg.capacity]);

  const previewData = previewMode === 'live' ? liveData : SAMPLE;

  // Sample mode is fully synthetic: it always pairs the sample flight with a
  // matching sample battery setup, otherwise vehicle-derived config produces
  // nonsense like 7.8V/cell against the sample's 23.4V. Live mode stays
  // honest to the actual config.
  const previewCfg = previewMode !== 'live'
    ? { ...cfg, capacity: 2200, cells: 6, low_cell: 3.6, crit_cell: 3.4 }
    : cfg;

  const loadedFromCard = useRef(false);

  // Preview scale: the canvas is the selected radio's resolution; on narrow
  // windows we scale it down to the column width so it never overflows.
  // Re-runs on model change (observe() fires once immediately).
  const previewBoxRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(1);
  useEffect(() => {
    const el = previewBoxRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setPreviewScale(Math.min(1, el.clientWidth / SCREEN_W));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [screen]);

  /** Returns which config was read: the model's own, the shared one, or none. */
  const loadFromCard = useCallback(async (volumePath: string, modelName?: string) => {
    // Reading has to follow the same file the radio would: a per-model layout
    // is invisible from the global one.
    const own = await window.electronAPI.edgetxHudConfigGet(volumePath, modelName);
    const flat = own ?? (modelName ? await window.electronAPI.edgetxHudConfigGet(volumePath) : null);
    if (!flat) return false;
    loadedSourceRef.current = own && modelName ? 'model' : 'shared';
    const parsedPages = new Map<number, TileDef[]>();
    for (const [k, v] of Object.entries(flat)) {
      const pageMatch = k.match(/^tile\d+$/) ? 1 : k.match(/^p(\d+)_tile\d+$/)?.[1];
      if (!pageMatch) continue;
      const page = Number(pageMatch);
      const m = v.match(/^(\w+),(\d+),(\d+),(\d+),(\d+),?(\w*)$/);
      if (m) {
        if (!parsedPages.has(page)) parsedPages.set(page, []);
        parsedPages.get(page)!.push({
          id: m[1]!, x: Number(m[2]), y: Number(m[3]),
          w: Number(m[4]), h: Number(m[5]), variant: m[6] || 'default',
        });
      }
    }
    const parsedTiles = [...parsedPages.keys()].sort((a, b) => a - b).map((p) => parsedPages.get(p)!);
    setCfg((prev) => ({
      ...prev,
      name: flat.name ?? prev.name,
      cells: flat.cells != null ? Number(flat.cells) : prev.cells,
      low_cell: flat.low_cell != null ? Number(flat.low_cell) : prev.low_cell,
      crit_cell: flat.crit_cell != null ? Number(flat.crit_cell) : prev.crit_cell,
      capacity: flat.capacity != null ? Number(flat.capacity) : prev.capacity,
      demo: flat.demo === '1',
      theme: flat.theme === 'light' ? 'light' : 'dark',
    }));
    if (parsedTiles.length > 0) {
      setPages(parsedTiles);
      setActivePage(0);
      // tiles on the card are authored for the screen stamped in the cfg
      // (pre-multiscreen cards carry none = TX15); follow it
      const sm = (flat.screen ?? '480x320').match(/^(\d+)x(\d+)$/);
      if (sm) setScreen({ w: Number(sm[1]), h: Number(sm[2]) });
    }
    if (flat.bw_slot1 || flat.bw_big) {
      setBw((prev) => ({
        big: flat.bw_big ?? prev.big,
        center: flat.bw_center === 'slots' ? 'slots' : 'horizon',
        left: prev.left.map((d, i) => flat[`bw_l${i + 1}`] ?? d),
        cslots: prev.cslots.map((d, i) => flat[`bw_c${i + 1}`] ?? d),
        slots: prev.slots.map((d, i) => flat[`bw_slot${i + 1}`] ?? d),
        wslots: prev.wslots.map((d, i) => flat[`bw_wslot${i + 1}`] ?? d),
      }));
    }
    return true;
  }, []);

  const rescan = useCallback(async (announce = false) => {
    // Same reasoning as below: created once, so read the singleton.
    if (announce) setApplyState(i18n.t('radioHud.status.looking-for-radio', { ns: 'views' }));
    setIsScanning(true);
    try {
      const result = await window.electronAPI.edgetxScan();
      setScan(result);
      // First sight of a card with our widget: adopt its config and layout
      // so the studio resumes where the radio actually is.
      const found = result.cards[0];
      if (found) {
        // An app running from before this IPC existed has no such method: a
        // missing model picker must not take the whole scan down with it.
        try {
          const list = await window.electronAPI.edgetxModelsList?.(found.volumePath) ?? [];
          setModels(list);
          // Default to the model the radio has open. Applying to every model is
          // still one click away, but it must be a choice: silently rewriting
          // the layout of machines that are not even plugged in is not.
          const current = list.find((m) => m.current);
          if (current && !targetTouched.current) setApplyTarget(current.name);
        } catch {
          setModels([]);
        }
      } else {
        setModels([]);
      }
      if (found && !loadedFromCard.current && result.installed[found.volumePath]?.['ardudeck-hud']) {
        loadedFromCard.current = true;
        await loadFromCard(found.volumePath);
      }
      if (announce) {
        setApplyState(found
          ? null
          // Created once so a language change does not re-trigger a card scan;
          // the singleton resolves the current language at call time.
          : i18n.t('radioHud.status.no-radio-yet', { ns: 'views' }));
      }
    } finally {
      setIsScanning(false);
    }
  }, [loadFromCard]);

  useEffect(() => { rescan(); }, [rescan]);

  // Poll for card arrival/removal while the view is open, so plugging the
  // radio in is enough - no manual Rescan. The scan is a handful of stats.
  // With no card yet, look every second: the radio takes several seconds to
  // enter USB storage and mount, and a four second gap on top of that reads as
  // the app having missed it.
  useEffect(() => {
    const id = setInterval(() => {
      if (!isScanning && !(applyState?.endsWith('…'))) {
        rescan();
      }
    }, scan?.cards.length ? 4000 : 1000);
    return () => clearInterval(id);
  }, [rescan, isScanning, applyState, scan]);

  // Only the vehicle NAME prefills automatically. Battery values stay on
  // auto (the widget self-configures from telemetry); "Load from vehicle"
  // is the explicit way to turn FC params into overrides.
  useEffect(() => {
    window.electronAPI.edgetxHudConfigSuggest().then(({ cfg: suggested }) => {
      if (suggested.name) {
        setCfg((prev) => ({ ...prev, name: prev.name || String(suggested.name) }));
      }
    });
  }, [connectionState.isConnected]);

  const card = scan?.cards[0] ?? null;
  const hudInstalled = Boolean(card && scan?.installed[card.volumePath]?.['ardudeck-hud']);
  const unplacedTiles = Object.keys(TILE_META).filter((id) => !tiles.some((t) => t.id === id));

  const handleLoadFromVehicle = async () => {
    let { connected, cfg: suggested } = await window.electronAPI.edgetxHudConfigSuggest();
    if (connected && suggested.capacity == null) {
      // param cache is cold; read the needed params directly from the FC
      // Different parameter set per stack; reading ArduPilot's names on PX4
      // returns nothing and the suggestion comes back empty on a live link.
      const batteryParams = isPx4
        ? ['BAT1_N_CELLS', 'BAT1_CAPACITY', 'BAT1_V_CHARGED', 'BAT1_V_EMPTY', 'BAT_LOW_THR', 'BAT_CRIT_THR']
        : ['MOT_BAT_VOLT_MAX', 'BATT_CAPACITY', 'BATT_LOW_VOLT', 'BATT_CRT_VOLT'];
      await window.electronAPI.readParameterBatch(batteryParams).catch(() => null);
      suggested = (await window.electronAPI.edgetxHudConfigSuggest()).cfg;
    }
    if (Object.keys(suggested).length === 0) {
      setApplyError(t('radioHud.errors.no-vehicle-data'));
      return;
    }
    setApplyError(null);
    setApplyState(connected ? null : t('radioHud.status.loaded-from-cache'));
    setCfg((prev) => ({
      ...prev,
      name: String(suggested.name ?? ''),
      cells: Number(suggested.cells ?? 0),
      low_cell: Number(suggested.low_cell ?? prev.low_cell),
      crit_cell: Number(suggested.crit_cell ?? prev.crit_cell),
      capacity: Number(suggested.capacity ?? 0),
    }));
  };

  // The plugged-in card names its radio; a colour layout applied to a mono
  // radio installs a widget the firmware cannot load, which reads as "nothing
  // happened" on the radio.
  const detectedCard = scan?.cards[0] ?? null;
  const detectedModel = SCREEN_MODELS.find((m) => m.variant === detectedCard?.suggestedVariantId) ?? null;

  const handleApply = async () => {
    setApplyError(null);
    setApplyState(t('radioHud.status.looking-for-radio-short'));
    const result = await window.electronAPI.edgetxScan();
    setScan(result);
    const target = result.cards[0];
    if (!target) {
      setApplyState(null);
      setApplyError(t('radioHud.errors.no-radio-found'));
      return;
    }
    // Always refresh the widget files: bundled source, instant, and it
    // guarantees the radio runs the same code this preview mirrors.
    setApplyState(t('radioHud.status.installing-widget'));
    const variant = SCREEN_MODELS.find((m) => m.w === screen.w && m.h === screen.h)?.variant ?? 'c480x320';
    const install = await window.electronAPI.edgetxInstall(target.volumePath, 'ardudeck-hud', variant);
    if (!install.success) {
      setApplyState(null);
      setApplyError(install.error ?? t('radioHud.errors.install-failed'));
      return;
    }
    setApplyState(t('radioHud.status.writing-config'));
    const cfgOut: Record<string, string | number> = {};
    if (cfg.name) cfgOut.name = cfg.name;
    if (cfg.cells > 0) {
      cfgOut.cells = cfg.cells;
      cfgOut.low_cell = cfg.low_cell;
      cfgOut.crit_cell = cfg.crit_cell;
    }
    if (cfg.capacity > 0) cfgOut.capacity = cfg.capacity;
    cfgOut.demo = cfg.demo ? 1 : 0;
    if (pages.length > 1) cfgOut.pageSecs = Math.max(0, Math.round(cfg.pageSecs || 0));
    cfgOut.debugInput = cfg.debugInput ? 1 : 0;
    cfgOut.theme = cfg.theme;
    const vehicleClass = getVehicleClass(connectionState.mavType);
    cfgOut.vehicle = vehicleClass;
    cfgOut.modes = modeTableCfg(vehicleClass);
    // authored canvas: the widget rescales tiles if its LCD differs (e.g.
    // the SD card later moves to another radio)
    cfgOut.screen = `${screen.w}x${screen.h}`;
    if (isBw) {
      cfgOut.bw_big = bw.big;
      cfgOut.bw_center = bw.center;
      bw.left.forEach((id, i) => { cfgOut[`bw_l${i + 1}`] = id; });
      bw.cslots.forEach((id, i) => { cfgOut[`bw_c${i + 1}`] = id; });
      bw.slots.forEach((id, i) => { cfgOut[`bw_slot${i + 1}`] = id; });
      bw.wslots.forEach((id, i) => { cfgOut[`bw_wslot${i + 1}`] = id; });
    }
    pages.forEach((pageTiles, p) => {
      const prefix = p === 0 ? 'tile' : `p${p + 1}_tile`;
      pageTiles.forEach((t, i) => {
        cfgOut[`${prefix}${i + 1}`] = `${t.id},${t.x},${t.y},${t.w},${t.h},${t.variant}`;
      });
    });
    const write = await window.electronAPI.edgetxHudConfigWrite(
      target.volumePath, cfgOut, applyTarget || undefined,
    );
    if (!write.ok) {
      setApplyState(null);
      setApplyError(write.error ?? t('radioHud.errors.config-write-failed'));
      return;
    }
    // mission overlay: the planner's route rides along so the radio's map
    // shows the waypoints; refreshed on every apply
    const missionWps = useMissionStore.getState().missionItems
      .filter((i) => i.latitude !== 0 && i.longitude !== 0)
      .map((i) => ({ seq: i.seq, lat: i.latitude, lon: i.longitude }));
    if (!isBw && ((fieldMaps && fieldMaps.length > 0) || missionWps.length > 0)) {
      setApplyState(t('radioHud.status.writing-field-maps'));
      const mapsResult = await window.electronAPI.edgetxHudMapsWrite(target.volumePath, fieldMaps ?? [], missionWps);
      if (!mapsResult.ok) {
        setApplyState(null);
        setApplyError(mapsResult.error ?? t('radioHud.errors.field-maps-write-failed'));
        return;
      }
    }
    setApplyState(isBw
      ? t('radioHud.status.applied-bw', { models: (install.screens?.added ?? 0) + (install.screens?.already ?? 0) })
      : applyTarget
        ? t('radioHud.status.applied-to-model', { model: applyTarget })
        : t('radioHud.status.applied-every-model'));
    setPagesFrom(applyTarget);
    await rescan();
  };

  const handleRemoveWidget = async () => {
    const target = scan?.cards[0];
    if (!target) return;
    setApplyError(null);
    setApplyState(t('radioHud.status.removing-widget'));
    const result = await window.electronAPI.edgetxRemove(target.volumePath, 'ardudeck-hud');
    setApplyState(result.success ? t('radioHud.status.widget-removed') : null);
    if (!result.success) setApplyError(result.error ?? t('radioHud.errors.remove-failed'));
    await rescan();
  };

  // Naming the target on the button is what stops a layout going to the wrong
  // machine; the second click is only asked for when something would be lost.
  const busyWithCard = isScanning || (applyState?.endsWith('…') ?? false);
  const applyLabel = !isBw && models.length > 0
    ? (applyTarget ? t('radioHud.actions.apply-to-model', { model: applyTarget }) : t('radioHud.actions.apply-to-every-model'))
    : t('radioHud.actions.apply-to-radio');
  const targetOwnsLayout = models.some((m) => m.name === applyTarget && m.hasLayout);
  const applyNeedsConfirm = !isBw && models.length > 0 && pagesFrom !== null && pagesFrom !== applyTarget
    && (applyTarget === '' || targetOwnsLayout);

  const handleEject = async () => {
    const target = scan?.cards[0];
    if (!target) return;
    setApplyError(null);
    setApplyState(t('radioHud.status.ejecting'));
    try {
      if (typeof window.electronAPI.edgetxEject !== 'function') {
        throw new Error(t('radioHud.errors.eject-needs-restart'));
      }
      const result = await window.electronAPI.edgetxEject(target.volumePath);
      if (!result.ok) setApplyState(null);
      if (result.ok) {
        setApplyState(t('radioHud.status.ejected'));
        await rescan();
      } else {
        setApplyError(result.error ?? t('radioHud.errors.eject-failed'));
      }
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : String(e));
    }
  };

  // hint rides as a tooltip on the input, not a visible text row - density
  const numField = (label: string, value: number, step: number, onChange: (v: number) => void, hint?: string, autoWhenEmpty?: boolean) => (
    <label className="block">
      <span className="text-xs text-content-secondary">{label}</span>
      <input
        type="number"
        step={step}
        value={value || ''}
        placeholder={autoWhenEmpty ? t('radioHud.config.auto') : undefined}
        data-tip={hint}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full px-2 py-1.5 text-sm bg-surface-input border border-subtle rounded text-content placeholder:text-teal-500/60"
      />
    </label>
  );

  return (
    <div className="flex flex-col h-full bg-surface-base">
      <div className="px-6 py-4 border-b border-subtle bg-surface-input">
        <div className="flex items-center gap-3">
          <svg className="w-6 h-6 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <rect x="4" y="7" width="16" height="11" rx="2" strokeWidth={1.5} />
            <path strokeLinecap="round" strokeWidth={1.5} d="M8 4l4 3 4-3M8 11h4M8 14h8" />
          </svg>
          <h1 className="text-xl font-semibold text-content">{t('radioHud.title')}</h1>
          <span className="text-xs text-content-secondary">{t('radioHud.subtitle')}</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto p-4 flex flex-col lg:flex-row gap-4 items-center lg:items-start">
          {/* left column: preview + field maps below it */}
          <div className="space-y-2 w-full lg:w-auto max-w-[512px]">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-content-secondary" data-tip={t('radioHud.preview.tip')}>{t('radioHud.preview.label')}</span>
              <select
                value={previewMode}
                onChange={(e) => setPreviewMode(e.target.value as PreviewMode)}
                className="px-2 py-1 text-xs bg-surface-input border border-subtle rounded text-content"
              >
                <option value="sample">{t('radioHud.preview.sample')}</option>
                <option value="live" disabled={!connectionState.isConnected}>
                  {t('radioHud.preview.live')}{connectionState.isConnected ? '' : t('radioHud.preview.connect-first')}
                </option>
                <option value="no-link">{t('radioHud.preview.state-no-link')}</option>
                <option value="no-mavlink">{t('radioHud.preview.state-no-mavlink')}</option>
                <option value="streams-off">{t('radioHud.preview.state-streams-off')}</option>
              </select>
              <select
                value={`${screen.w}x${screen.h}`}
                onChange={(e) => {
                  const m = SCREEN_MODELS.find((sm) => `${sm.w}x${sm.h}` === e.target.value);
                  if (m) changeScreen(m);
                }}
                data-tour="hud-model"
                data-tip={t('radioHud.preview.model-tip')}
                className="px-2 py-1 text-xs bg-surface-input border border-subtle rounded text-content"
              >
                {SCREEN_MODELS.map((m) => (
                  <option key={m.variant} value={`${m.w}x${m.h}`}>{rhText(t, m.labelKey, m.label)}</option>
                ))}
              </select>
              {detectedModel && `${detectedModel.w}x${detectedModel.h}` !== `${screen.w}x${screen.h}` && (
                <button
                  onClick={() => changeScreen(detectedModel)}
                  data-tip={t('radioHud.preview.detected-tip')}
                  className="px-2 py-1 text-xs rounded border bg-amber-500/10 text-amber-400 border-amber-500/40 hover:bg-amber-500/20 transition-colors"
                >
                  {t('radioHud.preview.detected-switch', { radio: detectedCard?.radioLabel ?? t('radioHud.preview.radio') })}
                </button>
              )}
              {isBw && (
                <button
                  onClick={() => setGuideOpen(true)}
                  data-tip={t('radioHud.preview.guide-tip')}
                  className="flex items-center gap-1.5 px-3 py-1 text-xs rounded border bg-surface-input text-content-secondary border-subtle hover:text-content transition-colors"
                >
                  <BookOpen className="w-3.5 h-3.5 text-teal-400" />
                  {t('radioHud.preview.guide')}
                </button>
              )}
              {isBw && (
                <button
                  onClick={() => setGuideOpen(true)}
                  data-tip={t('radioHud.preview.guide-tip-mono')}
                  className="flex items-center gap-1.5 px-3 py-1 text-xs rounded border bg-surface-input text-content-secondary border-subtle hover:text-content transition-colors"
                >
                  <BookOpen className="w-3.5 h-3.5 text-teal-400" />
                  {t('radioHud.preview.guide')}
                </button>
              )}
              {!isBw && (
                <>
                  <select
                    value={layoutName}
                    onChange={(e) => {
                      const saved = layouts.find((l) => l.name === e.target.value);
                      if (!saved) return;
                      setPages(saved.pages.map((p) => p.map((tile) => fitTile(tile, saved.screen, screen))));
                      setActivePage(0);
                      setLayoutName(saved.name);
                      setPagesFrom(t('radioHud.status.pages-from-layout', { name: saved.name }));
                    }}
                    data-tip={t('radioHud.layout.tip')}
                    className="px-2 py-1 text-xs bg-surface-input border border-subtle rounded text-content-secondary"
                  >
                    {layouts.length === 0 && <option value="">{t('radioHud.layout.placeholder')}</option>}
                    {layouts.map((l) => (
                      <option key={l.name} value={l.name}>{t('radioHud.layout.option-label', { name: l.name, pages: l.pages.length })}</option>
                    ))}
                  </select>
                  <input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                    onBlur={() => commitRename()}
                    placeholder={t('radioHud.layout.name-placeholder')}
                    data-tip={t('radioHud.layout.rename-tip')}
                    className="w-32 px-2 py-1 text-xs bg-surface-input border border-subtle rounded text-content placeholder:text-content-tertiary"
                  />
                  <button
                    onClick={() => {
                      const name = uniqueLayoutName(layouts, t('radioHud.layout.new-name'));
                      setLayoutName(name);
                      setNameDraft(name);
                      setPages([gridLayout(screen)]);
                      setActivePage(0);
                      setPagesFrom(t('radioHud.status.pages-from-layout', { name }));
                    }}
                    data-tip={t('radioHud.layout.new-tip')}
                    className="px-3 py-1 text-xs rounded border bg-surface-input text-content-secondary border-subtle hover:text-content transition-colors"
                  >
                    {t('radioHud.actions.new')}
                  </button>
                  {layouts.length > 1 && layouts.some((l) => l.name === layoutName) && (
                    <button
                      onClick={() => {
                        const next = removeLayout(layouts, layoutName);
                        persistLayouts(next);
                        setLayouts(next);
                        const fallback = next[0]!;
                        setLayoutName(fallback.name);
                        setNameDraft(fallback.name);
                        setPages(fallback.pages.map((p) => p.map((tile) => fitTile(tile, fallback.screen, screen))));
                        setActivePage(0);
                      }}
                      data-tip={t('radioHud.layout.delete-tip', { name: layoutName })}
                      className="px-2.5 py-1 text-xs rounded border border-subtle text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      {t('radioHud.actions.delete')}
                    </button>
                  )}
                </>
              )}
              <button
                onClick={() => setEditing(!editing)}
                data-tour="hud-edit"
                className={`px-3 py-1 text-xs rounded border transition-colors ${editing
                  ? 'bg-teal-500/20 text-teal-300 border-teal-500/40'
                  : 'bg-surface-input text-content-secondary border-subtle hover:text-content'}`}
              >
                {editing ? t('radioHud.actions.done-editing') : isBw ? t('radioHud.actions.edit-slots') : t('radioHud.actions.edit-layout')}
              </button>
              {editing && !isBw && (
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value === '__grid') {
                      setTiles(gridLayout(screen));
                      return;
                    }
                    const preset = LAYOUT_PRESETS[e.target.value];
                    if (preset) setTiles(preset.map((t) => fitTile(t, REF_SCREEN, screen)));
                  }}
                  className="px-2 py-1 text-xs bg-surface-input border border-subtle rounded text-content-secondary"
                >
                  <option value="" disabled>{t('radioHud.layout.preset-placeholder')}</option>
                  <option value="__grid">{t('radioHud.layout.auto-grid')}</option>
                  {Object.keys(LAYOUT_PRESETS).map((name) => (
                    <option key={name} value={name}>{rhText(t, LAYOUT_PRESET_KEYS[name], name)}</option>
                  ))}
                </select>
              )}

              {/* page tabs: the radio swipes between these (color only -
                  the B&W script has its own 2 fixed pages) */}
              {!isBw && (
              <div className="flex items-center gap-1 ml-auto">
                {pages.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setActivePage(i)}
                    data-tip={t('radioHud.layout.page-tip', { page: i + 1 })}
                    className={`w-7 h-7 text-xs rounded border transition-colors ${i === activePage
                      ? 'bg-teal-500/20 text-teal-300 border-teal-500/40'
                      : 'bg-surface-input text-content-secondary border-subtle hover:text-content'}`}
                  >
                    {i + 1}
                  </button>
                ))}
                {pages.length < MAX_PAGES && (
                  <div className="relative">
                    <button
                      onClick={() => setAddPageOpen(!addPageOpen)}
                      data-tip={t('radioHud.layout.add-page-tip')}
                      className="w-7 h-7 text-xs rounded border border-subtle bg-surface-input text-content-secondary hover:text-content"
                    >
                      +
                    </button>
                    {addPageOpen && (
                      <div className="absolute right-0 top-8 z-20 w-44 bg-surface-raised border border-subtle rounded-lg shadow-lg p-1">
                        <p className="px-2 py-1 text-[10px] uppercase text-content-tertiary">{t('radioHud.layout.new-page-from')}</p>
                        <button
                          onClick={() => addPage(tiles.map((t) => ({ ...t })))}
                          className="w-full text-left px-2 py-1.5 text-xs text-content hover:bg-surface-input rounded"
                        >
                          {t('radioHud.layout.duplicate-page')}
                        </button>
                        <button
                          onClick={() => addPage([])}
                          className="w-full text-left px-2 py-1.5 text-xs text-content hover:bg-surface-input rounded"
                        >
                          {t('radioHud.layout.empty-page')}
                        </button>
                        <button
                          onClick={() => addPage(gridLayout(screen))}
                          className="w-full text-left px-2 py-1.5 text-xs text-content hover:bg-surface-input rounded"
                        >
                          {t('radioHud.layout.auto-grid')}
                        </button>
                        <div className="my-1 border-t border-subtle" />
                        {Object.entries(LAYOUT_PRESETS).map(([name, preset]) => (
                          <button
                            key={name}
                            onClick={() => addPage(preset.map((t) => fitTile(t, REF_SCREEN, screen)))}
                            className="w-full text-left px-2 py-1.5 text-xs text-content-secondary hover:text-content hover:bg-surface-input rounded"
                          >
                            {rhText(t, LAYOUT_PRESET_KEYS[name], name)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {pages.length > 1 && (
                  <button
                    onClick={() => {
                      const next = pages.filter((_, i) => i !== activePage);
                      setPages(next);
                      setActivePage(Math.max(0, activePage - 1));
                    }}
                    data-tip={t('radioHud.layout.remove-page-tip')}
                    className="w-7 h-7 text-xs rounded border border-subtle bg-surface-input text-red-400 hover:text-red-300"
                  >
                    ×
                  </button>
                )}
              </div>
              )}
            </div>

            {isBw ? (
              <BwPreview mode={previewMode} data={previewData} cfg={previewCfg} screenW={screen.w}
                editing={editing} layout={bw} onLayout={setBw} />
            ) : (
              /* scales the native canvas down to the available width */
              <div ref={previewBoxRef} className="rounded-lg overflow-hidden border border-subtle shadow-lg"
                style={{ width: '100%', maxWidth: SCREEN_W, height: SCREEN_H * previewScale }}>
                <div style={{ transform: `scale(${previewScale})`, transformOrigin: 'top left', width: SCREEN_W, height: SCREEN_H }}>
                  <HudPreview mode={previewMode} data={previewData} cfg={previewCfg} tiles={tiles} editing={editing} onTilesChange={setTiles} />
                </div>
              </div>
            )}

            {editing && !isBw && (
              <div className="flex items-center gap-1.5 flex-wrap" style={{ maxWidth: SCREEN_W }}>
                <span className="text-[11px] text-content-tertiary">{t('radioHud.tiles.add-tile')}</span>
                {unplacedTiles.map((id) => (
                  <button
                    key={id}
                    onClick={() => setTiles([...tiles, {
                      id, x: 6, y: TILE_REGION_TOP + 20,
                      w: Math.max(TILE_META[id]!.minW, 120), h: Math.max(TILE_META[id]!.minH, 72),
                      variant: TILE_META[id]!.variants?.[0] ?? 'default',
                    }])}
                    className="px-2 py-0.5 text-[11px] text-content-secondary hover:text-content bg-surface-input hover:bg-surface-raised border border-subtle rounded"
                  >
                    + {rhText(t, TILE_META[id]!.labelKey, TILE_META[id]!.label)}
                  </button>
                ))}
                <span className="text-[10px] text-content-tertiary w-full">
                  {t('radioHud.tiles.drag-hint')}
                </span>
              </div>
            )}

            {/* field maps live under the preview - same width, no dead
                space. B&W radios have no map tile, so no card. */}
            {!isBw && (
            <div data-tour="hud-maps" className="bg-surface-raised border border-subtle rounded-xl p-3 space-y-2" style={{ maxWidth: SCREEN_W }}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-sm font-medium text-content"
                  data-tip={t('radioHud.maps.tip')}>
                  {t('radioHud.maps.heading')}
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (telemetry.gps.lat && telemetry.gps.lon) {
                        setMapCenter({ lat: telemetry.gps.lat, lon: telemetry.gps.lon });
                      }
                    }}
                    disabled={!telemetry.gps.lat}
                    data-tip={t('radioHud.maps.center-tip')}
                    className="px-2.5 py-1 text-xs whitespace-nowrap text-content-secondary hover:text-content bg-surface-input hover:bg-surface-raised border border-subtle rounded transition-colors disabled:opacity-50"
                  >
                    {t('radioHud.maps.use-vehicle-position')}
                  </button>
                  <button
                    onClick={handleGenerateMaps}
                    disabled={mapCenter.lat === 0}
                    className="px-2.5 py-1 text-xs whitespace-nowrap bg-teal-600/20 text-teal-300 hover:bg-teal-600/30 border border-teal-500/40 rounded transition-colors disabled:opacity-50"
                  >
                    {t('radioHud.maps.generate')}
                  </button>
                </div>
              </div>
              <div className="rounded-lg overflow-hidden border border-subtle" style={{ height: 190 }}>
                <MapContainer
                  center={[mapCenter.lat || 45, mapCenter.lon || 15]}
                  zoom={mapCenter.lat ? 13 : 4}
                  zoomSnap={0}
                  zoomControl={false}
                  style={{ height: '100%', width: '100%' }}
                  attributionControl={false}
                >
                  <SmoothWheelZoom />
                  <MapSearchControl />
                  <TileLayer url="tile-cache://satellite/{z}/{x}/{y}.png" />
                  <FieldClickHandler onPick={(lat, lon) => setMapCenter({ lat, lon })} />
                  <FieldRecenter lat={mapCenter.lat} lon={mapCenter.lon} />
                  {mapCenter.lat !== 0 && (
                    <>
                      <Marker position={[mapCenter.lat, mapCenter.lon]} />
                      {FIELD_MAP_SPANS.map((s) => (
                        <Circle key={s} center={[mapCenter.lat, mapCenter.lon]} radius={s}
                          pathOptions={{ color: '#2dd4bf', weight: 1, fillOpacity: 0.03 }} />
                      ))}
                    </>
                  )}
                </MapContainer>
              </div>
              {mapGenState && <p className="text-[11px] text-content-secondary">{mapGenState}</p>}
            </div>
            )}
          </div>

          {/* right column: dense config */}
          <div className="w-full lg:flex-1 lg:min-w-[300px] max-w-[512px] lg:max-w-md">
            <div data-tour="hud-config" className="bg-surface-raised border border-subtle rounded-xl p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-content"
                  data-tip={t('radioHud.config.tip')}>
                  {t('radioHud.config.heading')}
                </h3>
                <button
                  onClick={handleLoadFromVehicle}
                  data-tip={t('radioHud.config.load-tip')}
                  className="px-2 py-1 text-[11px] text-content-secondary hover:text-content bg-surface-input hover:bg-surface-raised border border-subtle rounded transition-colors"
                >
                  {t('radioHud.actions.load-from-vehicle')}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-xs text-content-secondary">{t('radioHud.config.theme')}</span>
                  <div className="mt-1 flex items-center bg-surface-input border border-subtle rounded p-0.5">
                    {(['dark', 'light'] as const).map((th) => (
                      <button
                        key={th}
                        onClick={() => setCfg({ ...cfg, theme: th })}
                        className={`flex-1 px-2 py-1 text-xs rounded transition-colors ${cfg.theme === th ? 'bg-surface-raised text-content' : 'text-content-secondary hover:text-content'}`}
                      >
                        {th === 'dark' ? t('radioHud.config.dark') : t('radioHud.config.light')}
                      </button>
                    ))}
                  </div>
                </label>
                <label className="block">
                  <span className="text-xs text-content-secondary">{t('radioHud.config.vehicle-name')}</span>
                  <input
                    type="text"
                    value={cfg.name}
                    onChange={(e) => setCfg({ ...cfg, name: e.target.value })}
                    className="mt-1 w-full px-2 py-1.5 text-sm bg-surface-input border border-subtle rounded text-content"
                  />
                </label>
                {numField(t('radioHud.config.cells'), cfg.cells, 1, (v) => setCfg({ ...cfg, cells: v }), t('radioHud.config.cells-hint'), true)}
                {numField(t('radioHud.config.capacity'), cfg.capacity, 100, (v) => setCfg({ ...cfg, capacity: v }), t('radioHud.config.capacity-hint'), true)}
                {numField(t('radioHud.config.low-cell'), cfg.low_cell, 0.05, (v) => setCfg({ ...cfg, low_cell: v }), t('radioHud.config.low-cell-hint'))}
                {numField(t('radioHud.config.crit-cell'), cfg.crit_cell, 0.05, (v) => setCfg({ ...cfg, crit_cell: v }), t('radioHud.config.crit-cell-hint'))}
              </div>
              {pages.length > 1 && (
                <label className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-content-secondary"
                    data-tip={t('radioHud.config.turn-pages-tip')}>
                    {t('radioHud.config.turn-pages-every')}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={120}
                    value={cfg.pageSecs}
                    onChange={(e) => setCfg({ ...cfg, pageSecs: Math.max(0, Math.min(120, Number(e.target.value) || 0)) })}
                    className="w-16 px-2 py-1 text-xs bg-surface-input border border-subtle rounded text-content"
                  />
                  <span className="text-xs text-content-tertiary">
                    {cfg.pageSecs > 0 ? t('radioHud.config.seconds') : t('radioHud.config.seconds-manual')}
                  </span>
                </label>
              )}
              <label className="flex items-center gap-2 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cfg.debugInput}
                  onChange={(e) => setCfg({ ...cfg, debugInput: e.target.checked })}
                  className="rounded border bg-surface-input"
                />
                <span className="text-xs text-content-secondary"
                  data-tip={t('radioHud.config.show-input-debug-tip')}>
                  {t('radioHud.config.show-input-debug')}
                </span>
              </label>
              <label className="flex items-center gap-2 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cfg.demo}
                  onChange={(e) => setCfg({ ...cfg, demo: e.target.checked })}
                  className="rounded border bg-surface-input"
                />
                <span className="text-xs text-content-secondary"
                  data-tip={t('radioHud.config.demo-mode-tip')}>
                  {t('radioHud.config.demo-mode')}
                </span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* fixed action footer: status left, actions right, always visible */}
      <div className="shrink-0 border-t border-subtle bg-surface-input px-4 py-2.5 flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[180px] text-xs">
          {applyError ? (
            <span className="text-red-400">{applyError}</span>
          ) : applyState ? (
            <span className="text-content-secondary">{applyState}</span>
          ) : card ? (
            <span className="text-content-secondary">
              <span className="text-emerald-400">{card.volumeName}</span>
              {hudInstalled ? t('radioHud.status.widget-installed') : t('radioHud.status.widget-will-install')}
              {!isBw && models.length > 0 && (
                <span className="text-content-tertiary">
                  {pagesFrom !== null && pagesFrom !== applyTarget
                    ? (applyTarget
                        ? t('radioHud.status.pages-from-applying', { source: pagesFrom || t('radioHud.status.shared-layout'), target: applyTarget })
                        : t('radioHud.status.pages-from', { source: pagesFrom || t('radioHud.status.shared-layout') }))
                    : applyTarget
                      ? t('radioHud.status.only-target-uses', { target: applyTarget })
                      : t('radioHud.status.every-model-uses')}
                </span>
              )}
            </span>
          ) : (
            <span className="flex items-center gap-2 text-content-secondary">
              <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-content-tertiary/30 border-t-content-secondary" />
              {t('radioHud.status.searching')}
            </span>
          )}
        </div>
        {hudInstalled && (
          <button
            onClick={handleRemoveWidget}
            data-tip={t('radioHud.actions.remove-tip')}
            className="px-2.5 py-1.5 text-xs whitespace-nowrap text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
          >
            {t('radioHud.actions.remove')}
          </button>
        )}
        <button
          onClick={async () => {
            if (!card) return;
            setApplyError(null);
            const ok = await loadFromCard(card.volumePath, applyTarget || undefined);
            if (ok) setPagesFrom(loadedSourceRef.current === 'model' ? applyTarget : '');
            setApplyState(ok
              ? loadedSourceRef.current === 'model'
                ? t('radioHud.status.loaded-own-layout', { model: applyTarget })
                : applyTarget
                  ? t('radioHud.status.no-own-layout', { model: applyTarget })
                  : t('radioHud.status.loaded-shared-layout')
              : null);
            if (!ok) setApplyError(t('radioHud.errors.no-config-on-card'));
          }}
          disabled={!card}
          data-tip={t('radioHud.actions.load-from-radio-tip')}
          className="px-3 py-1.5 text-xs whitespace-nowrap text-content-secondary hover:text-content bg-surface-raised hover:bg-surface-raised border border-subtle rounded-lg transition-colors disabled:opacity-50"
        >
          {t('radioHud.actions.load-from-radio')}
        </button>
        <button
          onClick={() => { void rescan(true); }}
          disabled={busyWithCard}
          className="px-3 py-1.5 text-xs whitespace-nowrap text-content-secondary hover:text-content bg-surface-raised border border-subtle rounded-lg transition-colors disabled:opacity-50"
        >
          {isScanning ? t('radioHud.actions.scanning') : t('radioHud.actions.rescan')}
        </button>
        <button
          onClick={handleEject}
          disabled={!card || busyWithCard}
          data-tip={t('radioHud.actions.eject-tip')}
          className="px-3 py-1.5 text-xs whitespace-nowrap text-content-secondary hover:text-content bg-surface-raised border border-subtle rounded-lg transition-colors disabled:opacity-50"
        >
          {t('radioHud.actions.eject')}
        </button>
        {!isBw && models.length > 0 && (
          <label className="flex items-center gap-2 text-xs text-content-tertiary">
            {t('radioHud.target.layout-for')}
            <select
              value={applyTarget}
              onChange={(e) => {
                targetTouched.current = true;
                setConfirmApply(false);
                setApplyTarget(e.target.value);
              }}
              data-tip={t('radioHud.target.tip')}
              className="px-2 py-1.5 text-xs bg-surface-input border border-subtle rounded-lg text-content-secondary"
            >
              <option value="">{t('radioHud.target.every-model')}</option>
              {/* The widget looks a layout up by model NAME, so two models
                  sharing one name share one layout: list it once. */}
              {models
                .filter((m, i) => models.findIndex((o) => o.name === m.name) === i)
                .map((m) => (
                  <option key={m.file} value={m.name}>
                    {m.name}
                    {models.some((o) => o.name === m.name && o.current) ? t('radioHud.target.on-radio-now') : ''}
                    {m.hasLayout ? t('radioHud.target.has-own-layout') : t('radioHud.target.shares-layout')}
                  </option>
                ))}
            </select>
          </label>
        )}
        <button
          onClick={() => {
            if (applyNeedsConfirm && !confirmApply) {
              setConfirmApply(true);
              return;
            }
            setConfirmApply(false);
            void handleApply();
          }}
          onBlur={() => setConfirmApply(false)}
          disabled={applyState !== null && applyState.endsWith('…')}
          data-tour="hud-apply"
          data-tip={t('radioHud.actions.apply-tip')}
          className={`px-4 py-1.5 text-sm whitespace-nowrap disabled:opacity-60 text-white rounded-lg transition-colors ${
            confirmApply ? 'bg-amber-600 hover:bg-amber-500' : 'bg-blue-600 hover:bg-blue-500'
          }`}
        >
          {confirmApply ? t('radioHud.actions.overwrite-confirm', { target: applyTarget || t('radioHud.actions.every-model') }) : applyLabel}
        </button>
      </div>
      {guideOpen && <BwGuide onClose={() => setGuideOpen(false)} />}
    </div>
  );
}
