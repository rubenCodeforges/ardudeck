import { ui } from '../ui/ui-hooks';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { MapContainer, TileLayer, Circle, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import {
  BatteryMedium, Zap, Fuel, MoveVertical, MoveRight, TrendingUp, Satellite, Home,
  Wind, Crosshair, Ruler, Thermometer, MapPin, SlidersHorizontal, Compass, X,
  type LucideIcon,
} from 'lucide-react';
import { BwGuide } from './BwGuide';
import {
  MAV_TYPE_SURFACE_BOAT, MAX_PAGES,
  REF_SCREEN, SCREEN_MODELS, TILE_META, TILE_TOP, firstRunPages, fitTile, hudVehicleKind,
  type HudVehicleKind, type ScreenModel, type TileDef,
} from './hud-model';
export type { TileDef } from './hud-model';
import { modeVoiceCfg } from './mode-voice';
import 'leaflet/dist/leaflet.css';
import { SmoothWheelZoom } from '../map/SmoothWheelZoom';
import { MapSearchControl } from '../map/MapSearchControl';
import { generateFieldMaps, FIELD_MAP_SPANS, type FieldMapImage } from './field-maps';
import {
  loadLayouts,
  persistLayouts,
  removeLayout,
  upsertLayout,
  type SavedHudLayout,
} from './hud-layout-library';
import { ChevronRight, LayoutTemplate, Magnet, Map as MapIcon, MonitorSmartphone, RefreshCw, Usb } from 'lucide-react';
import { ScreenStrip } from './ScreenStrip';
import { TemplateGallery } from './TemplateGallery';
import { TileInspector } from './TileInspector';
import { HudGuide } from './HudGuide';
import { SonarSetupCard } from './SonarSetupCard';

/**
 * Radio HUD studio: configure the ArduDeck EdgeTX widget, arrange its tiles
 * on a live preview, and push widget + config to the radio's SD card.
 *
 * Preview and radio consume the identical layout config (hud.cfg tileN
 * lines), so what you arrange here is what the radio draws. Top bar and
 * message ticker are brand invariants: not movable, not removable.
 */

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
// vehicle the preview draws for; set by HudPreview before its tiles render, as C is
let KIND: HudVehicleKind = 'copter';


// Active screen geometry; RadioHudView reassigns from the selected radio
// model before rendering children (same module-state idiom as the palette
// above - rendering is synchronous).
let SCREEN_W = 480;
let SCREEN_H = 320;
let TICKER_TOP = SCREEN_H - 66;
const TILE_REGION_TOP = 44;
const SNAP = 8;


// Sky/ground per the app's AttitudeIndicator (AttitudePanel.tsx gradients);
// ground uses the deeper amber-800 end, the lighter one is cartoonish flat
const SKY = '#2563eb';
const GROUND = '#92400e';


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
  /** Trip distance; the radio integrates ground speed while armed, the preview only has the demo value. */
  odoM?: number;
  /** Highest ground speed seen, m/s; the radio tracks it, the sample states one. */
  maxSpd?: number;
  /** Depth below the surface for a sub, m. */
  depthM?: number;
  /** Echogram columns from the sonar script, 32 levels 0..15 each, newest last. */
  echo?: number[][];
  echoStartM?: number;
  echoLenM?: number;
  /** Depth once a second for the bottom profile, newest last. */
  depthHist?: number[];
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

const SAMPLE_BOTTOM = Array.from({ length: 160 }, (_, i) => 9 + Math.sin(i / 14) * 2.2 + Math.sin(i / 5) * 0.4);
const SAMPLE_ECHO = SAMPLE_BOTTOM.map((d, i) => {
  const bottomRow = Math.floor((d / 20) * 32);
  return Array.from({ length: 32 }, (_, r) => {
    if (r >= bottomRow) return Math.max(0, 15 - (r - bottomRow) * 3);
    if (i > 70 && i < 92 && Math.abs(r - 9 - Math.sin(i / 3)) < 1.5) return 11 + ((i * 7 + r) % 4);
    if (r === bottomRow - 1 && i % 9 < 4) return 6;
    return (i * 31 + r * 17) % 23 === 0 ? 2 : 0;
  });
});

const SAMPLE: PreviewData = {
  armed: true, mode: 'LOITER', voltV: 23.4, currA: 7.3,
  homeDist: 229, odoM: 1840, maxSpd: 8.9, depthM: 12.4, homeBearing: 156,
  echo: SAMPLE_ECHO, echoStartM: 0, echoLenM: 20, depthHist: SAMPLE_BOTTOM, altM: 63, vspd: -0.4, hspd: 4.2,
  sats: 14, fix: 3, hdop: 0.8, roll: -8, pitch: 4, yaw: 244, lq: 100, mahUsed: 980,
  remainingPct: null,
  throttle: 41, imuTemp: 45, range: 1.34, lat: 42.4411, lon: 19.2632,
  windMs: 3.4, windDirDeg: 62, flightSecs: 192,
  wpNum: 3, wpDist: 184, wpBearing: 276,
  messages: [
    { sev: 6, text: 'EKF3 IMU0 is using GPS' }, // i18n-exempt
    { sev: 4, text: 'Terrain data missing' }, // i18n-exempt
    { sev: 6, text: 'Flight plan received' }, // i18n-exempt
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

/** A real preview of a screen, scaled to whatever box it is given (thumbnails, the gallery). */
function ScaledScreen({ tiles, data, cfg, kind }: { tiles: TileDef[]; data: PreviewData; cfg: HudCfg; kind: HudVehicleKind }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setScale(el.clientWidth / SCREEN_W));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={box} className="pointer-events-none relative w-full overflow-hidden rounded" style={{ aspectRatio: `${SCREEN_W} / ${SCREEN_H}` }}>
      {scale > 0 && (
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: SCREEN_W, height: SCREEN_H }}>
          <HudPreview mode="sample" data={data} cfg={cfg} tiles={tiles} editing={false} onTilesChange={() => undefined} kind={kind} />
        </div>
      )}
    </div>
  );
}

/** Leaflet sizes itself once; the card grows with the window, so it has to be told. */
function FollowContainerSize() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(el);
    return () => observer.disconnect();
  }, [map]);
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

// Mirrors the widget's stack(): EdgeTX line heights per font, and the px the preview draws them at.
const FONT = { dbl: { h: 34, px: 30 }, mid: { h: 25, px: 21 }, std: { h: 17, px: 15 }, sml: { h: 13, px: 11 } } as const;
type FontKey = keyof typeof FONT;
const STACK_SUB: Array<[FontKey, FontKey?]> = [['dbl', 'std'], ['dbl', 'sml'], ['mid', 'std'], ['mid', 'sml'], ['dbl'], ['mid']];
const STACK_ONE: Array<[FontKey, FontKey?]> = [['dbl'], ['mid']];

function stack(h: number, withSub: boolean): { vy: number; vf: FontKey; sy: number | null; sf: FontKey } {
  const top = 16;
  const room = h - 18;
  for (const [vf, sf] of withSub ? STACK_SUB : STACK_ONE) {
    const vh = FONT[vf].h;
    const sh = sf ? FONT[sf].h : 0;
    if (vh + sh <= room) {
      const vy = top + Math.floor((room - vh - sh) / 2);
      return { vy, vf, sy: sf ? vy + vh : null, sf: sf ?? 'sml' };
    }
  }
  return { vy: top, vf: 'mid', sy: null, sf: 'sml' };
}

let measureCtx: CanvasRenderingContext2D | null = null;
/** First option that fits `maxW` at `font`, else the shortest; mirrors the widget's fitText(). */
function fitText(maxW: number, font: FontKey, options: string[]): string {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  if (!measureCtx) return options[options.length - 1]!;
  measureCtx.font = `${FONT[font].px}px Roboto, system-ui, sans-serif`;
  return options.find((o) => measureCtx!.measureText(o).width <= maxW) ?? options[options.length - 1]!;
}

const fontStyle = (f: FontKey, weight?: number) => ({ fontSize: FONT[f].px, lineHeight: `${FONT[f].h}px`, fontWeight: weight });

function TileFrame({ t, caption, children }: { t: TileDef; caption: string; children?: React.ReactNode }) {
  return (
    <div style={{ position: 'absolute', left: t.x, top: t.y, width: t.w, height: t.h, background: C.surface, border: `1px solid ${C.gaugeEdge}`, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 8, top: 3, fontSize: 11, color: C.text3 }}>{caption}</div>
      {children}
    </div>
  );
}

const FIT_ORDER: FontKey[] = ['dbl', 'mid', 'std', 'sml'];
/** Mirrors the widget's fitFont: the largest font from the one picked that keeps the text inside maxW. */
function fitFont(text: string, start: FontKey, maxW: number): FontKey {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  if (!measureCtx) return start;
  for (const f of FIT_ORDER.slice(FIT_ORDER.indexOf(start))) {
    measureCtx.font = `700 ${FONT[f].px}px Roboto, system-ui, sans-serif`;
    if (measureCtx.measureText(text).width <= maxW) return f;
  }
  return 'sml';
}

function NumericBody({ t, value, sub, color, reserve = 0 }: {
  t: TileDef; value: string; sub?: React.ReactNode; color?: string;
  /** Room the tile's graphic takes on the right; the value steps down a font rather than run into it. */
  reserve?: number;
}) {
  const L = stack(t.h, sub != null);
  const f = fitFont(value, L.vf, t.w - 16 - reserve);
  return (
    <>
      <div style={{ position: 'absolute', left: 8, top: L.vy + Math.floor((FONT[L.vf].h - FONT[f].h) / 2), ...fontStyle(f, 700), color: color ?? C.text, whiteSpace: 'nowrap' }}>{value}</div>
      {sub != null && L.sy != null && (
        <div style={{ position: 'absolute', left: 8, top: L.sy, ...fontStyle(L.sf), color: C.text2, whiteSpace: 'nowrap' }}>{sub}</div>
      )}
    </>
  );
}

// Driving and diving instruments: same geometry as their loadable.lua counterparts.
const polar = (cx: number, cy: number, r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return [cx + Math.sin(a) * r, cy - Math.cos(a) * r] as const;
};
const arcPath = (cx: number, cy: number, r: number, a0: number, a1: number) => {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  return `M ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
};
const SPEED_STEPS = [10, 20, 30, 40, 60, 80, 100, 150, 200, 300];

function SpeedoTile({ t, data }: { t: TileDef; data: PreviewData }) {
  const v = data.hspd * 3.6;
  const max = Math.max(data.hspd, data.maxSpd ?? 0) * 3.6;
  const top = SPEED_STEPS.find((s) => s >= max * 1.1) ?? 300;
  const r = Math.floor(Math.min((t.w - 16) / 2, (t.h - 34) / 1.5));
  if (r < 12) return <TileFrame t={t} caption="SPEED" />;
  const thick = Math.max(3, Math.floor(r / 6));
  const cx = t.w / 2;
  const cy = 16 + r;
  const frac = Math.max(0, Math.min(1, v / top));
  const num = String(Math.round(v));
  const big = FONT[fitFont(num, r >= 40 ? 'dbl' : 'mid', 2 * (r - thick) - 6)].px;
  return (
    <TileFrame t={t} caption="SPEED">{/* i18n-exempt: radio text */}
      <svg width={t.w} height={t.h} style={{ position: 'absolute', left: 0, top: 0 }}>
        <path d={arcPath(cx, cy, r - thick / 2, -120, 120)} fill="none" stroke={C.gaugeBezel} strokeWidth={thick} />
        {frac > 0 && <path d={arcPath(cx, cy, r - thick / 2, -120, -120 + 240 * frac)} fill="none" stroke={frac > 0.9 ? C.warnStrong : C.success} strokeWidth={thick} />}
        <text x={cx} y={cy + big * 0.3} textAnchor="middle" fontSize={big} fontWeight={700} fill={C.text}>{num}</text>
        <text x={cx} y={cy + big * 0.3 + 14} textAnchor="middle" fontSize={11} fill={C.text3}>km/h</text>{/* i18n-exempt: radio text */}
        {cy + big * 0.3 + 14 + 4 < t.h - 16 && (
          <text x={cx} y={t.h - 5} textAnchor="middle" fontSize={11} fill={C.text3}>{`max ${Math.round(max)}  of ${top}`}</text>// i18n-exempt: radio text
        )}
      </svg>
    </TileFrame>
  );
}

const CARDINAL: Record<number, string> = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };

function HeadingTile({ t, data }: { t: TileDef; data: PreviewData }) {
  const hdg = data.yaw;
  const cx = t.w / 2;
  const ppd = t.w / 90;
  const base = t.h - 3;
  const d0 = Math.floor((hdg - 45) / 10) * 10;
  const ticks = Array.from({ length: 11 }, (_, i) => d0 + i * 10);
  const off = ((data.wpBearing - hdg + 540) % 360) - 180;
  const wpX = cx + Math.max(-44, Math.min(44, off)) * ppd;
  const label = String(Math.round(hdg) % 360).padStart(3, '0');
  return (
    <div style={{ position: 'absolute', left: t.x, top: t.y, width: t.w, height: t.h, background: C.surface, border: `1px solid ${C.gaugeEdge}`, overflow: 'hidden' }}>
      <svg width={t.w} height={t.h}>
        {ticks.map((d) => {
          const x = cx + (d - hdg) * ppd;
          if (x <= 2 || x >= t.w - 2) return null;
          const dd = ((d % 360) + 360) % 360;
          const major = dd % 30 === 0;
          return (
            <g key={d}>
              <line x1={x} y1={base} x2={x} y2={base - (major ? 9 : 4)} stroke={C.gaugeTick} />
              {major && Math.abs(x - cx) > 30 && <text x={x} y={base - 11} textAnchor="middle" fontSize={11} fill={CARDINAL[dd] ? C.text : C.text3}>{CARDINAL[dd] ?? dd}</text>}
            </g>
          );
        })}
        {data.wpNum > 0 && <polygon points={`${wpX - 6},2 ${wpX + 6},2 ${wpX},10`} fill={C.info} />}
        <rect x={cx - 24} y={1} width={48} height={24} fill={C.surface} stroke={C.gaugeTick} />
        <text x={cx} y={19} textAnchor="middle" fontSize={19} fontWeight={600} fill={C.text}>{label}</text>
        <polygon points={`${cx - 5},${base + 2} ${cx + 5},${base + 2} ${cx},${base - 5}`} fill={C.gaugeTick} />
      </svg>
    </div>
  );
}

/** Vehicle outlines for the tilt dials, same numbers as SHAPES in loadable.lua (units of the drawing size, y down). */
type ShapePart = { fill: 'b' | 'd'; pts: number[] } | { fill: 'b' | 'd'; circle: [number, number, number] };
const ellipsePts = (rx: number, ry: number, n: number) =>
  Array.from({ length: n }, (_, i) => [Math.cos((2 * Math.PI * i) / n) * rx, Math.sin((2 * Math.PI * i) / n) * ry]).flat();
const TILT_SHAPES: Record<'car' | 'boat' | 'sub', { rear: ShapePart[]; side: ShapePart[] }> = {
  car: {
    rear: [
      { fill: 'b', pts: [-0.48, -0.05, 0.48, -0.05, 0.5, 0.25, -0.5, 0.25] },
      { fill: 'b', pts: [-0.32, -0.34, 0.32, -0.34, 0.42, -0.05, -0.42, -0.05] },
      { fill: 'd', pts: [-0.26, -0.29, 0.26, -0.29, 0.34, -0.09, -0.34, -0.09] },
      { fill: 'd', pts: [-0.52, 0.12, -0.3, 0.12, -0.3, 0.44, -0.52, 0.44] },
      { fill: 'd', pts: [0.3, 0.12, 0.52, 0.12, 0.52, 0.44, 0.3, 0.44] },
    ],
    side: [
      { fill: 'b', pts: [-0.6, -0.04, 0.58, -0.04, 0.62, 0.2, -0.6, 0.2] },
      { fill: 'b', pts: [-0.42, -0.3, 0.12, -0.3, 0.36, -0.04, -0.5, -0.04] },
      { fill: 'd', pts: [-0.36, -0.25, 0.1, -0.25, 0.27, -0.08, -0.4, -0.08] },
      { fill: 'd', circle: [-0.36, 0.22, 0.15] }, { fill: 'd', circle: [0.36, 0.22, 0.15] },
      { fill: 'b', circle: [-0.36, 0.22, 0.06] }, { fill: 'b', circle: [0.36, 0.22, 0.06] },
    ],
  },
  boat: {
    rear: [
      { fill: 'b', pts: [-0.52, -0.02, 0.52, -0.02, 0.24, 0.32, -0.24, 0.32] },
      { fill: 'b', pts: [-0.26, -0.32, 0.26, -0.32, 0.32, -0.02, -0.32, -0.02] },
      { fill: 'd', pts: [-0.2, -0.27, 0.2, -0.27, 0.25, -0.08, -0.25, -0.08] },
    ],
    side: [
      { fill: 'b', pts: [-0.55, -0.04, 0.42, -0.04, 0.64, -0.14, 0.4, 0.24, -0.5, 0.24] },
      { fill: 'b', pts: [-0.32, -0.32, 0.08, -0.32, 0.2, -0.04, -0.36, -0.04] },
      { fill: 'd', pts: [-0.26, -0.27, 0.06, -0.27, 0.13, -0.09, -0.29, -0.09] },
    ],
  },
  sub: {
    rear: [
      { fill: 'b', pts: [-0.56, -0.035, 0.56, -0.035, 0.56, 0.035, -0.56, 0.035] },
      { fill: 'b', pts: [-0.08, -0.5, 0.08, -0.5, 0.1, -0.15, -0.1, -0.15] },
      { fill: 'b', pts: [-0.035, 0.15, 0.035, 0.15, 0.035, 0.44, -0.035, 0.44] },
      { fill: 'b', circle: [0, 0, 0.27] },
      { fill: 'd', circle: [0, 0, 0.1] },
    ],
    side: [
      { fill: 'b', pts: ellipsePts(0.56, 0.16, 20) },
      { fill: 'b', pts: [-0.14, -0.4, 0.08, -0.4, 0.14, -0.12, -0.18, -0.12] },
      { fill: 'b', pts: [-0.66, -0.22, -0.5, -0.05, -0.5, 0.05, -0.66, 0.22] },
      { fill: 'd', pts: [0.3, -0.05, 0.42, -0.05, 0.42, 0.05, 0.3, 0.05] },
    ],
  },
};

/** One land-meter window, as meterWindow() in loadable.lua: upright vehicle, ground tilted by g, zoned scale. */
function MeterWindow({ cx, cy, r, g, parts, state }: { cx: number; cy: number; r: number; g: number; parts: ShapePart[]; state: string }) {
  const clip = useId();
  const th = Math.max(2, Math.floor(r / 7));
  const R = r + 2 + th;
  const zones: [number, number, string][] = [[-40, -30, C.danger], [-30, -20, C.warnStrong], [-20, 20, C.success], [20, 30, C.warnStrong], [30, 40, C.danger]];
  const s = r * 1.1;
  const oy = cy + Math.floor(r * 0.05);
  const rad = (g * Math.PI) / 180;
  const [c, sn] = [Math.cos(rad), Math.sin(rad)];
  return (
    <g>
      {[90, 270].flatMap((base) => zones.map(([a0, a1, color]) => (
        <path key={`${base}${a0}`} d={arcPath(cx, cy, R - th / 2, base + a0, base + a1)} fill="none" stroke={color} strokeWidth={th} />
      )))}
      <clipPath id={clip}><circle cx={cx} cy={cy} r={r} /></clipPath>
      <g clipPath={`url(#${clip})`}>
        <rect x={cx - r} y={cy - r} width={2 * r} height={2 * r} fill={SKY} />
        <rect x={cx - 2 * r} y={cy} width={4 * r} height={2 * r} fill={GROUND} transform={`rotate(${g} ${cx} ${cy})`} />
        <line x1={cx - c * r} y1={cy - sn * r} x2={cx + c * r} y2={cy + sn * r} stroke={C.needle} />
      </g>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.gaugeEdge} />
      {parts.map((p, i) => {
        const fill = p.fill === 'd' ? C.surface : C.gaugeTick;
        if ('circle' in p) return <circle key={i} cx={cx + p.circle[0] * s} cy={oy + p.circle[1] * s} r={Math.max(1, p.circle[2] * s)} fill={fill} />;
        const pts = [];
        for (let k = 0; k < p.pts.length; k += 2) pts.push(`${cx + p.pts[k]! * s},${oy + p.pts[k + 1]! * s}`);
        return <polygon key={i} points={pts.join(' ')} fill={fill} />;
      })}
      {[90, 270].map((base) => {
        const a = ((base + Math.max(-44, Math.min(44, g))) * Math.PI) / 180;
        const [sa, ca] = [Math.sin(a), Math.cos(a)];
        const tx = cx + sa * (R - th);
        const ty = cy - ca * (R - th);
        const ox = cx + sa * (R + 6);
        const oyy = cy - ca * (R + 6);
        return <polygon key={base} points={`${tx},${ty} ${ox + ca * 4},${oyy + sa * 4} ${ox - ca * 4},${oyy - sa * 4}`} fill={state} />;
      })}
    </g>
  );
}

/** Roll or pitch as one land-meter window with the angle beside it, as attitudeTile() in loadable.lua. */
function AttitudeTile({ t, caption, deg, ground, view, pos, neg }: {
  t: TileDef; caption: string; deg: number; ground: number; view: 'rear' | 'side'; pos: string; neg: string;
}) {
  const c = Math.abs(deg) >= 30 ? C.danger : Math.abs(deg) >= 20 ? C.warnStrong : C.success;
  const parts = TILT_SHAPES[KIND === 'sub' ? 'sub' : KIND === 'boat' ? 'boat' : 'car'][view];
  const num = `${deg >= 0 ? pos : neg} ${Math.round(Math.abs(deg))}`;
  const tall = t.h > t.w * 0.9;
  if (tall) {
    const r = Math.floor(Math.min(t.w / 2 - 17, (t.h - 30 - FONT.mid.h) / 2.3));
    if (r < 8) {
      return (
        <TileFrame t={t} caption={caption}>
          <NumericBody t={t} value={num} color={c} />
        </TileFrame>
      );
    }
    const f = fitFont(num, 'mid', t.w - 16);
    return (
      <TileFrame t={t} caption={caption}>
        {r >= 8 && (
          <svg width={t.w} height={t.h} style={{ position: 'absolute', left: 0, top: 0 }}>
            <MeterWindow cx={t.w / 2} cy={18 + r + 10} r={r} g={ground} parts={parts} state={c} />
            <text x={t.w / 2} y={t.h - 6} textAnchor="middle" fontSize={FONT[f].px} fontWeight={700} fill={c}>{num}</text>
          </svg>
        )}
      </TileFrame>
    );
  }
  // vertically the window only needs its ring (the markers stick out sideways)
  const r = Math.floor(Math.min((t.h - 26) / 2.3, t.w * 0.25));
  if (r < 8) {
    return (
      <TileFrame t={t} caption={caption}>
        <NumericBody t={t} value={num} color={c} />
      </TileFrame>
    );
  }
  const cx = 8 + r + 10;
  const cy = 18 + Math.floor((t.h - 18) / 2);
  const tx = cx + r + 16;
  const room = t.w - 6 - tx;
  const f = fitFont(num, 'mid', room);
  return (
    <TileFrame t={t} caption={caption}>
      {(
        <svg width={t.w} height={t.h} style={{ position: 'absolute', left: 0, top: 0 }}>
          <MeterWindow cx={cx} cy={cy} r={r} g={ground} parts={parts} state={c} />
          {room >= 14 && <text x={tx} y={cy + FONT[f].px * 0.36} fontSize={FONT[f].px} fontWeight={700} fill={c}>{num}</text>}
        </svg>
      )}
    </TileFrame>
  );
}

/** Weak to strong echo, as ECHO_PAL in loadable.lua. */
const ECHO_STOPS: [number, number, number, number][] = [[0, 0x10, 0x30, 0x90], [4, 0x00, 0x9c, 0xd8], [7, 0x22, 0xc5, 0x5e], [10, 0xfa, 0xcc, 0x15], [13, 0xf9, 0x73, 0x16], [15, 0xdc, 0x26, 0x26]];
const ECHO_PAL = Array.from({ length: 16 }, (_, lv) => {
  const i = Math.max(0, ECHO_STOPS.findIndex((s, k) => lv >= s[0] && lv <= (ECHO_STOPS[k + 1]?.[0] ?? 15)));
  const a = ECHO_STOPS[i]!;
  const b = ECHO_STOPS[Math.min(i + 1, ECHO_STOPS.length - 1)]!;
  const f = b[0] > a[0] ? (lv - a[0]) / (b[0] - a[0]) : 0;
  const mix = (k: 1 | 2 | 3) => Math.round(a[k] + (b[k] - a[k]) * f);
  return `rgb(${mix(1)},${mix(2)},${mix(3)})`;
});

function DepthLabel({ x, y, text, size, color, bold }: { x: number; y: number; text: string; size: number; color: string; bold?: boolean }) {
  return (
    <div style={{ position: 'absolute', left: x, top: y, padding: '0 2px', background: C.surface, fontSize: size, fontWeight: bold ? 700 : 400, color, lineHeight: 1.15, whiteSpace: 'nowrap' }}>{text}</div>
  );
}

// what the radio prints when there is nothing to draw yet (the widget is English only)
const NO_ECHO = 'no echogram'; // i18n-exempt: radio text
const NO_DEPTH = 'no depth yet'; // i18n-exempt: radio text

function EchoTile({ t, data }: { t: TileDef; data: PreviewData }) {
  const rh = Math.max(1, Math.floor((t.h - 22) / 32));
  const ph = rh * 32;
  const pw = t.w - 8;
  const cols = data.echo ?? [];
  const n = Math.min(cols.length, Math.floor(pw / 3));
  return (
    <TileFrame t={t} caption="ECHOGRAM">{/* i18n-exempt: radio text */}
      <div style={{ position: 'absolute', right: 6, top: 3, padding: '0 3px', fontSize: 10, fontWeight: 700, color: C.bgBase, background: C.warnStrong }}>EXP</div>{/* i18n-exempt: radio text */}
      <svg width={pw} height={ph} style={{ position: 'absolute', left: 4, top: 18, background: C.gaugeBezel }}>
        {Array.from({ length: n }, (_, i) => {
          const col = cols[cols.length - 1 - i]!;
          const cx = pw - (i + 1) * 3;
          return col.map((lv, r) => (lv > 0 ? <rect key={`${i}-${r}`} x={cx} y={r * rh} width={3} height={rh} fill={ECHO_PAL[lv]} /> : null));
        })}
      </svg>
      {cols.length === 0 ? (
        <div style={{ position: 'absolute', left: 0, right: 0, top: 18 + ph / 2 - 12, textAlign: 'center', fontSize: 11, color: C.text3 }}>{NO_ECHO}</div>
      ) : (
        <>
          <DepthLabel x={6} y={19} text={`${Math.round(data.echoStartM ?? 0)}m`} size={11} color={C.text2} />
          <DepthLabel x={6} y={18 + ph - 15} text={`${Math.round((data.echoStartM ?? 0) + (data.echoLenM ?? 0))}m`} size={11} color={C.text2} />
          {data.range > 0 && <DepthLabel x={pw - 52} y={19} text={`${(data.depthHist?.at(-1) ?? data.range).toFixed(1)}m`} size={FONT.mid.px} color={C.text} bold />}
        </>
      )}
    </TileFrame>
  );
}

function BottomTile({ t, data }: { t: TileDef; data: PreviewData }) {
  const pw = t.w - 8;
  const ph = t.h - 22;
  const hist = data.depthHist ?? [];
  const n = Math.min(hist.length, pw);
  const recent = hist.slice(hist.length - n);
  const deepest = Math.max(0, ...recent);
  const scale = Math.max(2, deepest * 1.2);
  const line = recent.map((d, i) => `${pw - n + i},${(ph * d) / scale}`).join(' ');
  return (
    <TileFrame t={t} caption="BOTTOM">{/* i18n-exempt: radio text */}
      <svg width={pw} height={ph} style={{ position: 'absolute', left: 4, top: 18, background: C.gaugeBezel }}>
        {n >= 2 && (
          <>
            <polygon points={`${pw - n},${ph} ${line} ${pw - 1},${ph}`} fill={C.gaugeEdge} />
            <polyline points={line} fill="none" stroke={C.warnStrong} strokeWidth={2} />
          </>
        )}
      </svg>
      {n < 2 ? (
        <div style={{ position: 'absolute', left: 0, right: 0, top: 18 + ph / 2 - 7, textAlign: 'center', fontSize: 11, color: C.text3 }}>{NO_DEPTH}</div>
      ) : (
        <>
          <DepthLabel x={t.w - 60} y={19} text={`${recent.at(-1)!.toFixed(1)}m`} size={FONT.mid.px} color={C.text} bold />
          <DepthLabel x={6} y={18 + ph - 15} text={`max ${deepest.toFixed(1)}m`} size={11} color={C.text2} />{/* i18n-exempt: radio text */}
        </>
      )}
    </TileFrame>
  );
}

function DepthTile({ t, data }: { t: TileDef; data: PreviewData }) {
  const sub = KIND === 'sub';
  const depth = sub ? (data.depthM ?? Math.max(0, -data.altM)) : 0;
  const below = data.range > 0 ? data.range : null;
  const total = depth + (below ?? 0);
  const scale = Math.max(5, total * 1.2);
  const cw = Math.floor(t.w * 0.42);
  const ch = t.h - 26;
  const vy = 18 + (ch * depth) / scale;
  const by = 18 + (ch * total) / scale;
  const mid = 8 + cw / 2;
  const room = t.w - cw - 22;
  const value = sub ? `${depth.toFixed(1)}m` : below !== null ? `${below.toFixed(1)}m` : '--';
  const big = FONT[fitFont(value, t.h >= 90 ? 'dbl' : 'mid', room)].px;
  const subLine = sub
    ? fitText(room, 'sml', below !== null ? [`bottom ${below.toFixed(1)}m`, `${below.toFixed(1)}m`] : ['no bottom', '']) // i18n-exempt: radio text
    : fitText(room, 'sml', below !== null ? ['below the hull', 'below hull', ''] : ['no depth sensor', 'no sensor', '']); // i18n-exempt: radio text
  return (
    <TileFrame t={t} caption={sub ? 'DEPTH' : 'UNDER HULL'}>{/* i18n-exempt: radio text */}
      <svg width={t.w} height={t.h} style={{ position: 'absolute', left: 0, top: 0 }}>
        <rect x={8} y={18} width={cw} height={ch} fill={C.gaugeBezel} />
        <line x1={8} y1={18} x2={8 + cw} y2={18} stroke={C.info} />
        {below !== null && (
          <>
            <rect x={8} y={by} width={cw} height={Math.max(0, 18 + ch - by)} fill={C.gaugeEdge} />
            <rect x={8} y={by} width={cw} height={3} fill={C.warnStrong} />
            <line x1={mid} y1={vy + 4} x2={mid} y2={by - 1} stroke={C.text3} strokeDasharray="2 2" />
          </>
        )}
        <rect x={mid - cw * 0.3} y={Math.max(21, vy) - 3} width={cw * 0.6} height={6} fill={C.text} />
        <text x={cw + 16} y={18 + big} fontSize={big} fontWeight={700} fill={C.text}>{value}</text>
        <text x={cw + 16} y={18 + big + 14} fontSize={11} fill={C.text2}>{subLine}</text>
        {sub && Math.abs(data.vspd) >= 0.1 && (
          <text x={cw + 16} y={18 + big + 28} fontSize={11} fill={C.text3}>
            {`${data.vspd > 0 ? 'rising' : 'diving'} ${Math.abs(data.vspd).toFixed(1)}`}
          </text>
        )}
      </svg>
    </TileFrame>
  );
}

function TileBody({ t, data, cfg }: { t: TileDef; data: PreviewData; cfg: HudCfg }) {
  // Mirrors the widget's vehicleKind() and isGround(): the preview has to read like the radio.
  const boat = KIND === 'boat';
  const vehicleClass = KIND === 'boat' ? 'rover' : KIND;
  const groundVehicle = KIND === 'rover' || KIND === 'boat' || KIND === 'sub';
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
        // glyph grows with the tile, as the widget's icon variant
        const subTxt = fitText(t.w - 12, 'sml', [
          `${pct != null ? `${data.voltV.toFixed(1)}V  ` : ''}${cellV != null ? `${cellV.toFixed(2)}V/c  ` : ''}${data.currA.toFixed(0)}A`,
          `${data.voltV.toFixed(1)}V`,
        ]);
        const glyph = (bx: number, by: number, bw: number, bh: number) => {
          const th = Math.max(1, Math.floor(bh / 12));
          const nub = Math.max(3, Math.floor(bw / 14));
          const pad = th + 1;
          return (
            <>
              <div style={{ position: 'absolute', left: bx, top: by, width: bw, height: bh, border: `${th}px solid ${C.gaugeTick}`, boxSizing: 'border-box' }}>
                <div style={{ position: 'absolute', left: pad - th, top: pad - th, bottom: pad - th, width: ((bw - 2 * pad) * fillPct) / 100, background: vColor }} />
              </div>
              <div style={{ position: 'absolute', left: bx + bw, top: by + Math.floor(bh * 0.28), width: nub, height: bh - 2 * Math.floor(bh * 0.28), background: C.gaugeTick }} />
            </>
          );
        };
        if (t.h >= 110) {
          const fb = fitFont(bigText, 'dbl', t.w - 16);
          const room = t.h - 22 - FONT[fb].h - FONT.sml.h - 12;
          const bw = Math.floor(Math.min(t.w - 40, room / 0.45));
          const bh = Math.floor(bw * 0.45);
          const top = 18 + Math.floor((t.h - 18 - bh - FONT[fb].h - FONT.sml.h - 12) / 2);
          return (
            <TileFrame t={t} caption="BATTERY">
              {glyph(Math.floor((t.w - bw) / 2) - 2, top, bw, bh)}
              <div style={{ position: 'absolute', left: 0, right: 0, top: top + bh + 6, textAlign: 'center', ...fontStyle(fb, 700), color: vColor }}>{bigText}</div>
              <div style={{ position: 'absolute', left: 0, right: 0, top: top + bh + 12 + FONT[fb].h, textAlign: 'center', ...fontStyle('sml'), color: C.text2, whiteSpace: 'nowrap' }}>{subTxt}</div>
            </TileFrame>
          );
        }
        const fb = fitFont(bigText, 'dbl', t.w - 16 - 46 - 16);
        const rowH = Math.max(22, FONT[fb].h);
        const top = 18 + Math.floor((t.h - 18 - rowH - FONT.sml.h - 4) / 2);
        return (
          <TileFrame t={t} caption="BATTERY">
            {glyph(8, top + Math.floor((rowH - 22) / 2), 46, 22)}
            <div style={{ position: 'absolute', left: 66, top: top + Math.floor((rowH - FONT[fb].h) / 2), ...fontStyle(fb, 700), color: vColor }}>{bigText}</div>
            <div style={{ position: 'absolute', left: 8, top: top + rowH + 4, ...fontStyle('sml'), color: C.text2, whiteSpace: 'nowrap' }}>{subTxt}</div>
          </TileFrame>
        );
      }
      return (
        <TileFrame t={t} caption="BATTERY">
          {fillPct != null ? (() => {
            const L = stack(t.h - 12, true);
            const vh = FONT[L.vf].h;
            const cv = cellV != null ? `${cellV.toFixed(2)}V/c  ` : '';
            const a = `${data.currA.toFixed(0)}A`;
            return (
              <>
                <div style={{ position: 'absolute', left: 8, top: L.vy, ...fontStyle(L.vf, 700), color: vColor }}>{bigText}</div>
                {pct != null && (
                  <div style={{ position: 'absolute', right: 8, top: L.vy + vh - FONT.std.h, ...fontStyle('std'), color: C.text2 }}>{data.voltV.toFixed(1)}V</div>
                )}
                <div style={{ position: 'absolute', left: 8, top: L.vy + vh + 2, width: t.w - 16, height: 8, background: C.gaugeBezel, border: `1px solid ${C.gaugeEdge}` }}>
                  <div style={{ width: `${fillPct}%`, height: '100%', background: vColor }} />
                </div>
                {L.sy != null && (
                  <div style={{ position: 'absolute', left: 8, top: L.sy + 12, ...fontStyle(L.sf), color: C.text2, whiteSpace: 'nowrap' }}>
                    {fitText(t.w - 16, L.sf, [`${cv}${a}  ${data.mahUsed}mAh used`, `${cv}${a}  ${data.mahUsed}mAh`, `${cv}${a}`])}
                  </div>
                )}
              </>
            );
          })() : (
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
          <NumericBody t={t} reserve={40} value={`${Math.round(data.homeDist)}m`} sub={`brg ${Math.round(data.homeBearing)}`} />
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
      if (vehicleClass === 'rover') {
        const dist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(2)}km` : `${Math.round(m)}m`);
        return (
          <TileFrame t={t} caption="TRIP">{/* i18n-exempt: radio text */}
            <NumericBody t={t} value={dist(data.odoM ?? 0)} sub={`home ${dist(data.homeDist)}`} />
          </TileFrame>
        );
      }
      const vsColor = Math.abs(data.vspd) > 3 ? C.warnStrong : C.success;
      const barH = t.h - 34;
      const frac = Math.max(-1, Math.min(1, data.vspd / 5));
      const fill = Math.abs(frac) * (barH / 2);
      return (
        <TileFrame t={t} caption={vehicleClass === 'sub' ? 'DEPTH / VSPD' : 'ALT / VSPD'}>{/* i18n-exempt */}
          <NumericBody t={t} reserve={20} value={`${Math.round(vehicleClass === 'sub' ? Math.max(0, -data.altM) : data.altM)}m`}
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
      const fixLabel = ['NO GPS', 'NO FIX', '2D', '3D', 'DGPS', 'RTK FLT', 'RTK FIX'][data.fix] ?? '?';
      const lit = Math.min(8, Math.round(data.sats / 2));
      return (
        <TileFrame t={t} caption="GPS">
          <NumericBody t={t} reserve={72} value={String(data.sats)} color={gpsColor} sub={`${fixLabel}  hdop ${data.hdop.toFixed(1)}`} />
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
        <TileFrame t={t} caption={groundVehicle ? 'RUN TIME' : 'FLIGHT TIME'}>{/* i18n-exempt */}
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
          <NumericBody t={t} reserve={30} value={`${data.windMs.toFixed(1)} m/s`} color={data.windMs > 8 ? C.warn : C.text}
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
          <NumericBody t={t} reserve={50} value={`${lq}%`} color={lqC} sub={(
            <>
              <span style={{ color: C.success }}>-58 dBm</span>{/* i18n-exempt */}
              <span style={{ color: C.warnStrong, marginLeft: 10 }}>250mW</span>
            </>
          )} />
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
        <TileFrame t={t} caption="TX BATTERY">{/* i18n-exempt */}
          <NumericBody t={t} reserve={20} value={`${v.toFixed(1)}V`} sub={fitText(t.w - 36, stack(t.h, true).sf, [`${Math.round(pct)}% of 6.6-8.4V`, `${Math.round(pct)}%`])} />
          <div style={{ position: 'absolute', right: 8, top: 18, width: 6, height: t.h - 30, background: C.gaugeBezel, border: `1px solid ${C.gaugeEdge}` }}>
            <div style={{ position: 'absolute', bottom: 0, width: '100%', height: `${pct}%`, background: C.success }} />
          </div>
        </TileFrame>
      );
    }
    case 'thr': {
      const thr = data.throttle;
      const hot = Math.abs(thr) >= 80;
      const fill = hot ? C.warnStrong : C.success;
      const pct = Math.min(100, Math.abs(thr));
      const numH = Math.max(14, t.h - 44);
      return (
        <TileFrame t={t} caption="THROTTLE">{/* i18n-exempt: radio text */}
          <div style={{ position: 'absolute', left: 8, top: 18, height: numH, display: 'flex', alignItems: 'center', fontSize: Math.min(34, numH * 0.9), fontWeight: 700, color: hot ? C.warnStrong : C.text }}>
            {groundVehicle && thr < 0 ? `R ${-thr}%` : `${thr}%`}
          </div>
          <div style={{ position: 'absolute', left: 8, right: 8, bottom: 8, height: 8, background: C.gaugeBezel, border: `1px solid ${C.gaugeEdge}` }}>
            {groundVehicle ? (
              <>
                <div style={{ position: 'absolute', top: 0, bottom: 0, background: fill, width: `${pct / 2}%`, ...(thr < 0 ? { right: '50%' } : { left: '50%' }) }} />
                <div style={{ position: 'absolute', left: '50%', top: -3, bottom: -3, width: 1, background: C.gaugeTick }} />
              </>
            ) : (
              <div style={{ width: `${Math.max(0, pct)}%`, height: '100%', background: fill }} />
            )}
          </div>
        </TileFrame>
      );
    }
    case 'speedo':
      return <SpeedoTile t={t} data={data} />;
    case 'heading':
      return <HeadingTile t={t} data={data} />;
    case 'roll':
      return <AttitudeTile t={t} caption="ROLL" deg={data.roll} ground={-data.roll} view="rear" pos="R" neg="L" />; // i18n-exempt: radio text
    case 'pitch':
      return <AttitudeTile t={t} caption="PITCH" deg={data.pitch} ground={data.pitch} view="side" pos="UP" neg="DN" />; // i18n-exempt: radio text
    case 'depth':
      return <DepthTile t={t} data={data} />;
    case 'echo':
      return <EchoTile t={t} data={data} />;
    case 'bottom':
      return <BottomTile t={t} data={data} />;
    case 'imu': {
      const c = data.imuTemp >= 70 ? C.danger : data.imuTemp >= 60 ? C.warnStrong : C.success;
      const frac = Math.max(0, Math.min(1, (data.imuTemp - 20) / 60));
      return (
        <TileFrame t={t} caption="IMU TEMP">{/* i18n-exempt */}
          <NumericBody t={t} reserve={20} value={`${data.imuTemp}C`} color={c} />
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
        <TileFrame t={t} caption={boat ? 'DEPTH' : 'RANGE'}>{/* i18n-exempt */}
          <NumericBody t={t} reserve={20} value={`${data.range.toFixed(2)}m`} color={near ? C.warnStrong : C.text} />
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
            <div style={{ position: 'absolute', left: 8, top: 20, fontSize: 15, color: C.text3 }}>no position{/* i18n-exempt */}</div>
          )}
        </TileFrame>
      );
    case 'wp': {
      const a = ((data.wpBearing - data.yaw) * Math.PI) / 180;
      const ar = Math.min(13, t.h / 2 - 8);
      return (
        <TileFrame t={t} caption="MISSION">
          <NumericBody t={t} reserve={40} value={`WP ${data.wpNum}`} color={C.info} sub={`${Math.round(data.wpDist)}m to go`} />
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
          <div style={{ position: 'absolute', left: 6, bottom: 2, fontSize: 11, color: C.gaugeTick }}>1000m across</div>{/* i18n-exempt */}
          <div style={{ position: 'absolute', right: 6, bottom: 2, fontSize: 10, color: C.text3 }}>satellite image on radio</div>{/* i18n-exempt */}
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
  mode, data, cfg, tiles, editing, onTilesChange, selected = null, onSelect, kind = 'copter', snapping = true,
}: {
  mode: PreviewMode;
  data: PreviewData;
  cfg: HudCfg;
  tiles: TileDef[];
  editing: boolean;
  onTilesChange: (tiles: TileDef[]) => void;
  /** Index of the tile picked for the inspector; only it shows a resize handle. */
  selected?: number | null;
  onSelect?: (index: number | null) => void;
  kind?: HudVehicleKind;
  /** Grid and neighbour-edge snapping while dragging; off moves by the pixel. */
  snapping?: boolean;
}) {
  KIND = kind;
  const { t: tr } = useTranslation();
  const removeLabel = tr('common:remove');
  C = cfg.theme === 'light' ? LIGHT : DARK;
  const [drag, setDrag] = useState<DragState | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!drag) return;
    const snap = (v: number) => (snapping ? Math.round(v / SNAP) * SNAP : Math.round(v));
    const MAGNET = 7;
    // After grid snap, magnetize to neighbor edges: exact edge alignment or
    // butting against a neighbor with the standard 8px gap.
    const magnetize = (value: number, targets: number[]) => {
      if (!snapping) return value;
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
  }, [drag, tiles, onTilesChange, snapping]);

  const gridBg = {
    background: C.bgBase,
    backgroundImage: `linear-gradient(${C.grid} 1px, transparent 1px), linear-gradient(90deg, ${C.grid} 1px, transparent 1px)`,
    backgroundSize: '28px 28px',
  };

  if (!editing && (mode === 'no-link' || mode === 'no-mavlink' || mode === 'streams-off')) {
    const banner = mode === 'no-link'
      ? { state: 'NO LINK', hint: 'radio link down - check RX power / binding', color: C.danger } // i18n-exempt
      : mode === 'no-mavlink'
        ? { state: 'NO MAVLINK', hint: 'link up, no telemetry frames - ELRS MAVLink mode?', color: C.warn } // i18n-exempt
        : { state: 'STREAMS OFF', hint: 'FC not streaming - connect ArduDeck to fix rates', color: C.warn }; // i18n-exempt
    return (
      <div style={{ position: 'relative', width: SCREEN_W, height: SCREEN_H, ...gridBg, fontFamily: 'Roboto, system-ui, sans-serif' }}>
        <div style={{ position: 'absolute', top: 84, width: '100%', textAlign: 'center', fontSize: 32, fontWeight: 700, color: banner.color }}>{banner.state}</div>
        <div style={{ position: 'absolute', top: 148, width: '100%', textAlign: 'center', fontSize: 15, color: C.text2 }}>{banner.hint}</div>
        <div style={{ position: 'absolute', bottom: 22, width: '100%', textAlign: 'center', fontSize: 13, color: C.accent }}>ArduDeck</div>{/* i18n-exempt */}
      </div>
    );
  }

  return (
    <div ref={rootRef} onPointerDown={() => onSelect?.(null)} style={{ position: 'relative', width: SCREEN_W, height: SCREEN_H, ...gridBg, fontFamily: 'Roboto, system-ui, sans-serif', overflow: 'hidden', userSelect: 'none' }}>
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
          {SCREEN_W >= 400 && <span style={{ fontSize: 12, color: C.text }}>ArduDeck</span>}{/* i18n-exempt */}
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
                e.stopPropagation();
                onSelect?.(i);
                setDrag({ tileIdx: i, mode: 'move', startX: e.clientX, startY: e.clientY, orig: t });
              }}
              className={selected === i ? '' : 'hover:outline hover:outline-1 hover:outline-offset-[-1px] hover:outline-teal-400/60'}
              style={{
                position: 'absolute', left: t.x, top: t.y, width: t.w, height: t.h,
                border: selected === i ? `2px solid ${C.accent}` : 'none',
                cursor: 'move', zIndex: 5, touchAction: 'none',
              }}
            >
              {selected === i && (
                <button
                  type="button"
                  aria-label={removeLabel}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => {
                    onTilesChange(tiles.filter((_, j) => j !== i));
                    onSelect?.(null);
                  }}
                  style={{
                    position: 'absolute', right: 2, top: 2, width: 18, height: 18, lineHeight: '16px',
                    fontSize: 13, color: '#fff', background: C.danger, border: 'none', cursor: 'pointer', zIndex: 6,
                  }}
                >×</button>
              )}
              {selected === i && (
                <div
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setDrag({ tileIdx: i, mode: 'resize', startX: e.clientX, startY: e.clientY, orig: t });
                  }}
                  style={{
                    position: 'absolute', right: -2, bottom: -2, width: 12, height: 12,
                    background: C.accent, cursor: 'nwse-resize', zIndex: 6, touchAction: 'none',
                  }}
                />
              )}
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
const BW_FIELDS: Record<string, { labelKey: string; fmt: (d: PreviewData, b: BwBatt) => string }> = {
  volt: { labelKey: 'common:voltage', fmt: (d) => `${d.voltV.toFixed(1)}V` },
  cellv: { labelKey: 'radio-hud:bwFields.cellv', fmt: (d, b) => (b.cells > 0 ? `${(d.voltV / b.cells).toFixed(2)}v/c` : '--v/c') },
  pct: { labelKey: 'radio-hud:bwFields.pct', fmt: (_d, b) => (b.pct != null ? `${Math.round(b.pct)}%` : '--%') },
  cellpct: { labelKey: 'radio-hud:bwFields.cellpct', fmt: (d, b) => `${b.cells > 0 ? `${(d.voltV / b.cells).toFixed(2)}v/c` : ''}${b.pct != null ? ` ${Math.round(b.pct)}%` : ''}` || '--' },
  curr: { labelKey: 'common:current', fmt: (d) => `${d.currA.toFixed(1)}A` },
  mah: { labelKey: 'radio-hud:bwFields.mah', fmt: (d) => `${d.mahUsed}mAh` },
  alt: { labelKey: 'common:altitude', fmt: (d) => `A${Math.round(d.altM)}m` },
  spd: { labelKey: 'common:groundSpeed', fmt: (d) => `S${d.hspd.toFixed(1)}` },
  vspd: { labelKey: 'radio-hud:bwFields.vspd', fmt: (d) => `V${d.vspd >= 0 ? '+' : ''}${d.vspd.toFixed(1)}` },
  sat: { labelKey: 'radio-hud:bwFields.sat', fmt: (d) => `${d.sats}s${d.fix >= 3 ? '3D' : d.fix === 2 ? '2D' : '--'}` },
  home: { labelKey: 'radio-hud:bwFields.home', fmt: (d) => `H${Math.round(d.homeDist)}m` },
  wind: { labelKey: 'common:wind', fmt: (d) => `w${d.windMs.toFixed(1)}m` },
  hdop: { labelKey: 'radio-hud:bwFields.hdop', fmt: (d) => `hd${d.hdop.toFixed(1)}` },
  rng: { labelKey: 'common:rangefinder', fmt: (d) => `r${d.range.toFixed(1)}m` },
  imu: { labelKey: 'radio-hud:bwFields.imu', fmt: (d) => `i${Math.round(d.imuTemp)}C` },
  wp: { labelKey: 'common:waypoint', fmt: (d) => (d.wpNum > 0 ? `wp${d.wpNum} ${Math.round(d.wpDist)}m` : 'wp--') },
  thr: { labelKey: 'common:throttle', fmt: (d) => `t${Math.round(d.throttle)}%` },
  yaw: { labelKey: 'common:heading', fmt: (d) => String(Math.round(d.yaw) % 360).padStart(3, '0') },
  none: { labelKey: 'radio-hud:bwFields.none', fmt: () => '' },
};

/** Large top-left readout choices (mirrors BIG in ArduDk.lua). */
const BW_BIG: Record<string, { labelKey: string; fmt: (d: PreviewData, b: BwBatt) => [string, string] }> = {
  volt: { labelKey: 'common:voltage', fmt: (d) => [d.voltV.toFixed(1), 'V'] },
  pct: { labelKey: 'radio-hud:bwFields.pct', fmt: (_d, b) => [b.pct != null ? String(Math.round(b.pct)) : '--', '%'] },
  alt: { labelKey: 'common:altitude', fmt: (d) => [String(Math.round(d.altM)), 'm'] },
  spd: { labelKey: 'common:groundSpeed', fmt: (d) => [d.hspd.toFixed(1), 'm/s'] },
};

const BW_MONO = 'ui-monospace, SFMono-Regular, monospace';
const BW_INK = '#242b1f';
const BW_GLASS = '#c9d2bd';
const BW_FIELD_OPTIONS = Object.entries(BW_FIELDS).map(([v, f]) => [v, f.labelKey] as [string, string]);

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
  options: Array<[string, string]>; onPick: (v: string) => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); onClose(); }} />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ position: 'absolute', left: x, top: y }}
        className="z-50 w-56 p-2 rounded-lg bg-surface-raised border border-subtle shadow-xl"
      >
        <div className="grid grid-cols-3 gap-1">
          {options.map(([id, labelKey]) => {
            const label = t(labelKey);
            const meta = BW_FIELD_ICONS[id] ?? BW_FIELD_ICONS.none!;
            const active = id === value;
            return (
              <button
                key={id}
                onClick={() => { onPick(id); onClose(); }}
                data-tip={label}
                className={`flex flex-col items-center gap-0.5 px-1 py-1.5 rounded border text-[10px] transition-colors ${active
                  ? 'bg-teal-500/20 border-teal-500/50 text-teal-200'
                  : 'bg-surface-input border-subtle text-content-secondary hover:text-content hover:bg-surface-raised'}`}
              >
                <meta.Icon className={`w-3.5 h-3.5 ${active ? 'text-teal-300' : meta.color}`} />
                <span className="truncate w-full text-center">{label}</span>
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
  const { t } = useTranslation();
  const y0 = listKey === 'left' ? 27 : 9;

  if (editing) {
    return (
      <>
        {Array.from({ length: count }, (_, i) => {
          const id = list[i0 + i] ?? 'none';
          const meta = BW_FIELD_ICONS[id] ?? BW_FIELD_ICONS.none!;
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
              {t(BW_FIELDS[id]?.labelKey ?? 'radio-hud:bwFields.none')}
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
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  // open field picker: which list, which index, and where to draw it
  const [picker, setPicker] = useState<
    { key: 'left' | 'cslots' | 'slots' | 'wslots' | 'big'; index: number; x: number; y: number } | null
  >(null);
  const s = screenW > 150 ? 2 : 3; // 128->384px, 212->424px: fits the column
  const INK = '#242b1f';
  const GLASS = '#c9d2bd';
  const SML = Math.round(6.6 * s);
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
  const ladder = mode === 'no-link' ? ['NO LINK', 'check RX power / binding'] // i18n-exempt
    : mode === 'no-mavlink' ? ['NO MAVLINK', 'ELRS MAVLink mode off?'] // i18n-exempt
    : mode === 'streams-off' ? ['STREAMS OFF', 'connect ArduDeck once'] : null; // i18n-exempt
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
        data-tip={t('radio-hud:bwPreview.flipPagesTip')}
      >
        <div style={{
          position: 'relative', width: screenW * s, height: 64 * s, background: GLASS,
          overflow: 'hidden', boxShadow: 'inset 0 0 18px rgba(30,40,20,0.25)',
        }}>
          {ladder ? (
            <>
              <Txt x={screenW / 2 - ladder[0]!.length * 3.4} y={18} size={SML * 2}>{ladder[0]}</Txt>
              <Txt x={screenW / 2 - ladder[1]!.length * 1.7} y={40}>{ladder[1]}</Txt>
              <Txt x={1} y={56.6}>ArduDeck</Txt>{/* i18n-exempt */}
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
                      data-tip={t('radio-hud:bwPreview.largeReadout')}
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
                    >{t(BW_FIELDS[layout.left[3] ?? 'none']?.labelKey ?? 'radio-hud:bwFields.none')}</button>
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
                        >{mode === 'horizon' ? t('radio-hud:bwPreview.horizon') : t('radio-hud:bwPreview.slots')}</button>
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
                  <Txt x={0} y={10} size={SML * 1.2}>{data.lat != null ? data.lat.toFixed(6) : 'no position'}</Txt>{/* i18n-exempt */}
                  <Txt x={0} y={20} size={SML * 1.2}>{data.lon != null ? data.lon.toFixed(6) : ''}</Txt>
                  <Txt x={0} y={30}>{`home ${Math.round(data.homeDist)}m brg ${Math.round(data.homeBearing)}`}</Txt>{/* i18n-exempt */}
                  <Txt x={0} y={38}>{data.wpNum > 0 ? `wp ${data.wpNum}  ${Math.round(data.wpDist)}m brg ${Math.round(data.wpBearing)}` : 'no mission wp'}</Txt>{/* i18n-exempt */}
                  <Txt x={0} y={46}>{`wind ${data.windMs.toFixed(1)}m/s ${Math.round(data.windDirDeg)}  thr ${Math.round(data.throttle)}%`}</Txt>{/* i18n-exempt */}
                  <Txt x={screenW - 50} y={10}>{`alt ${Math.round(data.altM)}m`}</Txt>{/* i18n-exempt */}
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
              ? Object.entries(BW_BIG).map(([v, b]) => [v, b.labelKey] as [string, string])
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
        {t('radio-hud:bwPreview.pageHint', { page })}
        {editing && t('radio-hud:bwPreview.editingHint')}
      </p>
    </div>
  );
}

const STUDIO_STORAGE_KEY = 'radio-hud.studio';

const BUSY_STATE_KEYS = ['ejecting', 'installingWidget', 'lookingForRadio', 'lookingForTheRadio', 'removingWidget', 'writingConfig', 'writingFieldMaps'];

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
  /** Vehicle type picked while nothing was connected; null until the pilot picks one. */
  vehicleKind?: HudVehicleKind | null;
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
  const { t } = useTranslation();
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
    persisted?.pages ?? (() => {
      const mavType = useConnectionStore.getState().connectionState.mavType;
      return firstRunPages(hudVehicleKind(getVehicleClass(mavType), mavType));
    })(),
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
  // B&W slot editing is a mode; colour tiles are always editable by clicking them
  const [editing, setEditing] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [tab, setTab] = useState<'editor' | 'guide'>('editor');
  const [selectedTile, setSelectedTile] = useState<number | null>(null);
  useEffect(() => { setSelectedTile(null); }, [activePage]);
  const [gallery, setGallery] = useState<'replace' | 'add' | null>(null);
  const [pickedKind, setPickedKind] = useState<HudVehicleKind | null>(persisted?.vehicleKind ?? null);
  const [snapping, setSnapping] = useState(() => {
    try { return localStorage.getItem('radio-hud.snapping') !== '0'; } catch { return true; }
  });
  const toggleSnapping = () => setSnapping((on) => {
    try { localStorage.setItem('radio-hud.snapping', on ? '0' : '1'); } catch { /* per-viewer convenience only */ }
    return !on;
  });
  const addPage = (layout: TileDef[]) => {
    setPages((prev) => [...prev, layout]);
    setActivePage(pages.length);
  };
  const [previewMode, setPreviewMode] = useState<PreviewMode>('sample');
  const [scan, setScan] = useState<EdgeTxScanResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [applyState, setApplyState] = useState<string | null>(null);
  const applyBusy = applyState !== null && BUSY_STATE_KEYS.some((k) => t(`radio-hud:radioHudView.${k}`) === applyState);
  // Models on the card: one radio flies several machines, so a layout can be
  // written for all of them (hud.cfg) or for one (models/<name>.cfg).
  const [models, setModels] = useState<{ file: string; name: string; current: boolean; hasLayout: boolean }[]>([]);
  // Where the pages on screen came from, so applying them somewhere else is
  // recognisably a copy and not a save.
  const [pagesFrom, setPagesFrom] = useState<string | null>(null);
  const [confirmApply, setConfirmApply] = useState(false);
  // Saved screen sets, shown as "your templates" in the gallery
  const [layouts, setLayouts] = useState<SavedHudLayout[]>(() => loadLayouts());
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
      localStorage.setItem(STUDIO_STORAGE_KEY, JSON.stringify({ cfg, pages, mapCenter, screen, bw, vehicleKind: pickedKind } satisfies PersistedStudio));
    } catch {
      // storage full/unavailable; state simply won't survive a reload
    }
  }, [cfg, pages, mapCenter, screen, bw, pickedKind]);

  // default the field center to the vehicle's position when one appears
  useEffect(() => {
    if (telemetry.gps.lat && telemetry.gps.lon && mapCenter.lat === 0 && mapCenter.lon === 0) {
      setMapCenter({ lat: telemetry.gps.lat, lon: telemetry.gps.lon });
    }
  }, [telemetry.gps.lat, telemetry.gps.lon, mapCenter]);

  const handleGenerateMaps = async () => {
    if (!mapCenter.lat && !mapCenter.lon) {
      setMapGenState(t('radio-hud:radioHudView.mapsNeedCenter'));
      return;
    }
    setMapGenState(t('radio-hud:radioHudView.mapsStitching'));
    try {
      // Match the placed map tile so the image fills it instead of
      // letterboxing; the widget subtracts its own caption strip.
      const mapTile = pages.flat().find((t) => t.id === 'map');
      const size = mapTile ? { w: mapTile.w - 2, h: mapTile.h - 20 } : undefined;
      const { maps, missingTiles } = await generateFieldMaps(mapCenter.lat, mapCenter.lon, size,
        (d, total) => setMapGenState(t('radio-hud:radioHudView.mapsStitchingProgress', { done: d, total })));
      setFieldMaps(maps);
      setMapGenState(missingTiles > 0
        ? t('radio-hud:radioHudView.mapsReadyMissing', { zooms: maps.length, missing: missingTiles })
        : t('radio-hud:radioHudView.mapsReady', { zooms: maps.length }));
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
      setPreviewScale(Math.min(2, el.clientWidth / SCREEN_W));
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
    if (announce) setApplyState(t('radio-hud:radioHudView.lookingForTheRadio'));
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
          : t('radio-hud:radioHudView.noRadioYet'));
      }
    } finally {
      setIsScanning(false);
    }
  }, [loadFromCard, t]);

  useEffect(() => { rescan(); }, [rescan]);

  // Poll for card arrival/removal while the view is open, so plugging the
  // radio in is enough - no manual Rescan. The scan is a handful of stats.
  // With no card yet, look every second: the radio takes several seconds to
  // enter USB storage and mount, and a four second gap on top of that reads as
  // the app having missed it.
  useEffect(() => {
    const id = setInterval(() => {
      if (!isScanning && !applyBusy) {
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
      setApplyError(t('radio-hud:radioHudView.noVehicleData'));
      return;
    }
    setApplyError(null);
    setApplyState(connected ? null : t('radio-hud:radioHudView.loadedFromCache'));
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
    setApplyState(t('radio-hud:radioHudView.lookingForRadio'));
    const result = await window.electronAPI.edgetxScan();
    setScan(result);
    const target = result.cards[0];
    if (!target) {
      setApplyState(null);
      setApplyError(t('radio-hud:radioHudView.noRadioFound'));
      return;
    }
    // Always refresh the widget files: bundled source, instant, and it
    // guarantees the radio runs the same code this preview mirrors.
    setApplyState(t('radio-hud:radioHudView.installingWidget'));
    const variant = SCREEN_MODELS.find((m) => m.w === screen.w && m.h === screen.h)?.variant ?? 'c480x320';
    const install = await window.electronAPI.edgetxInstall(target.volumePath, 'ardudeck-hud', variant);
    if (!install.success) {
      setApplyState(null);
      setApplyError(install.error ?? t('radio-hud:radioHudView.widgetInstallFailed'));
      return;
    }
    setApplyState(t('radio-hud:radioHudView.writingConfig'));
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
    // With no vehicle on the link the class would default to copter and the radio would
    // read a rover's modes with copter names; left out, the widget goes by the live frame type.
    if (connectionState.isConnected && connectionState.mavType !== undefined) {
      const vehicleClass = getVehicleClass(connectionState.mavType);
      // the radio labels a boat's rangefinder as depth; its modes are Rover's
      cfgOut.vehicle = connectionState.mavType === MAV_TYPE_SURFACE_BOAT ? 'boat' : vehicleClass;
      cfgOut.modes = modeTableCfg(vehicleClass);
      cfgOut.voice = modeVoiceCfg(vehicleClass);
    } else if (pickedKind) {
      // offline, only a type the pilot chose is written; the widget still trusts the live frame type
      const vehicleClass: ArduPilotVehicleClass = pickedKind === 'boat' ? 'rover' : pickedKind;
      cfgOut.vehicle = pickedKind;
      cfgOut.modes = modeTableCfg(vehicleClass);
      cfgOut.voice = modeVoiceCfg(vehicleClass);
    }
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
      setApplyError(write.error ?? t('radio-hud:radioHudView.configWriteFailed'));
      return;
    }
    // mission overlay: the planner's route rides along so the radio's map
    // shows the waypoints; refreshed on every apply
    const missionWps = useMissionStore.getState().missionItems
      .filter((i) => i.latitude !== 0 && i.longitude !== 0)
      .map((i) => ({ seq: i.seq, lat: i.latitude, lon: i.longitude }));
    if (!isBw && ((fieldMaps && fieldMaps.length > 0) || missionWps.length > 0)) {
      setApplyState(t('radio-hud:radioHudView.writingFieldMaps'));
      const mapsResult = await window.electronAPI.edgetxHudMapsWrite(target.volumePath, fieldMaps ?? [], missionWps);
      if (!mapsResult.ok) {
        setApplyState(null);
        setApplyError(mapsResult.error ?? t('radio-hud:radioHudView.fieldMapsWriteFailed'));
        return;
      }
    }
    setApplyState(isBw
      ? t('radio-hud:radioHudView.appliedBw', { count: (install.screens?.added ?? 0) + (install.screens?.already ?? 0) })
      : applyTarget
        ? t('radio-hud:radioHudView.appliedModel', { model: applyTarget })
        : t('radio-hud:radioHudView.appliedAll'));
    setPagesFrom(applyTarget);
    await rescan();
  };

  const handleRemoveWidget = async () => {
    const target = scan?.cards[0];
    if (!target) return;
    setApplyError(null);
    setApplyState(t('radio-hud:radioHudView.removingWidget'));
    const result = await window.electronAPI.edgetxRemove(target.volumePath, 'ardudeck-hud');
    setApplyState(result.success ? t('radio-hud:radioHudView.widgetRemoved') : null);
    if (!result.success) setApplyError(result.error ?? t('radio-hud:radioHudView.removeFailed'));
    await rescan();
  };

  // Naming the target on the button is what stops a layout going to the wrong
  // machine; the second click is only asked for when something would be lost.
  const busyWithCard = isScanning || applyBusy;
  const applyLabel = !isBw && models.length > 0
    ? (applyTarget ? t('radio-hud:radioHudView.applyToModel', { model: applyTarget }) : t('radio-hud:radioHudView.applyToEveryModel'))
    : t('radio-hud:radioHudView.applyToRadio');
  const targetOwnsLayout = models.some((m) => m.name === applyTarget && m.hasLayout);
  const applyNeedsConfirm = !isBw && models.length > 0 && pagesFrom !== null && pagesFrom !== applyTarget
    && (applyTarget === '' || targetOwnsLayout);

  const handleEject = async () => {
    const target = scan?.cards[0];
    if (!target) return;
    setApplyError(null);
    setApplyState(t('radio-hud:radioHudView.ejecting'));
    try {
      if (typeof window.electronAPI.edgetxEject !== 'function') {
        throw new Error(t('radio-hud:radioHudView.ejectNeedsRestart'));
      }
      const result = await window.electronAPI.edgetxEject(target.volumePath);
      if (!result.ok) setApplyState(null);
      if (result.ok) {
        setApplyState(t('radio-hud:radioHudView.ejected'));
        await rescan();
      } else {
        setApplyError(result.error ?? t('radio-hud:radioHudView.ejectFailed'));
      }
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : String(e));
    }
  };

  // the vehicle on the link picks the template filter and the tiles offered first
  const connectedKind: HudVehicleKind | null = connectionState.isConnected && connectionState.mavType !== undefined
    ? hudVehicleKind(getVehicleClass(connectionState.mavType), connectionState.mavType)
    : null;
  const vehicleKind: HudVehicleKind = connectedKind ?? pickedKind ?? 'copter';

  // A plugged-in radio names its own screen; follow it unless the pilot picked another for this card.
  const autoScreenFor = useRef<string | null>(null);
  useEffect(() => {
    if (!detectedModel || !detectedCard) return;
    if (autoScreenFor.current === detectedCard.volumePath) return;
    autoScreenFor.current = detectedCard.volumePath;
    if (detectedModel.w !== screen.w || detectedModel.h !== screen.h) changeScreen(detectedModel);
    // changeScreen and screen only matter at the moment a card first appears
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectedModel, detectedCard]);

  const applyTemplate = (fitted: TileDef[][], how: 'replace' | 'add', name: string) => {
    if (how === 'replace') {
      setPages(fitted.slice(0, MAX_PAGES));
      setActivePage(0);
    } else {
      const room = MAX_PAGES - pages.length;
      if (room <= 0) return;
      setPages((prev) => [...prev, ...fitted.slice(0, 1)]);
      setActivePage(pages.length);
    }
    setPagesFrom(t('radio-hud:radioHudView.pagesFromLayout', { name }));
    setGallery(null);
  };

  const selected = selectedTile !== null ? tiles[selectedTile] ?? null : null;
  const addTile = (id: string) => {
    const meta = TILE_META[id]!;
    const next = [...tiles, {
      id, x: 8, y: TILE_TOP + 8,
      w: Math.max(meta.minW, 120), h: Math.max(meta.minH, 72),
      variant: meta.variants?.[0] ?? 'default',
    }];
    setTiles(next);
    setSelectedTile(next.length - 1);
  };

  // what the widget would work out on its own, shown where the field is left on auto
  const liveVolt = connectionState.isConnected ? telemetry.battery.voltage : 0;
  const autoCells = liveVolt > 6 ? Math.floor(liveVolt / 4.3) + 1 : 0;

  const unitField = (label: string, value: number, step: number, unit: string, onChange: (v: number) => void, autoHint?: string) => (
    <label className="block space-y-1.5">
      <span className="text-xs text-content-secondary">{label}</span>
      <span className="flex items-center rounded-lg border border-subtle bg-surface-input pr-2.5 focus-within:border-blue-500">
        <input
          type="number"
          step={step}
          value={value || ''}
          placeholder={autoHint !== undefined ? t('radio-hud:radioHudView.autoPlaceholder') : undefined}
          onChange={(e) => onChange(Number(e.target.value))}
          className="min-w-0 flex-1 bg-transparent px-2.5 py-2 text-sm text-content placeholder:text-teal-400/80 focus:outline-none"
        />
        <span className="text-xs text-content-tertiary">{unit}</span>
      </span>
      {autoHint !== undefined && !value && <span className="block text-[11px] text-teal-400/80">{autoHint}</span>}
    </label>
  );

  const cardHead = (icon: React.ReactNode, tone: string, title: string, sub: string, action?: React.ReactNode) => (
    <div className="flex items-center gap-3">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${tone}`}>{icon}</div>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-content">{title}</h3>
        <p className="truncate text-xs text-content-secondary">{sub}</p>
      </div>
      {action}
    </div>
  );

  const modelSelect = (
    <label className="block space-y-1.5">
      <span className="text-xs text-content-secondary">{t('radio-hud:studio.radioModel')}</span>
      <select
        value={`${screen.w}x${screen.h}`}
        onChange={(e) => {
          const m = SCREEN_MODELS.find((sm) => `${sm.w}x${sm.h}` === e.target.value);
          if (m) changeScreen(m);
        }}
        data-tour="hud-model"
        data-tip={t('radio-hud:radioHudView.radioModelTip')}
        className="w-full rounded-lg border border-subtle bg-surface-input px-2.5 py-2 text-sm text-content focus:border-blue-500 focus:outline-none"
      >
        {SCREEN_MODELS.map((m) => <option key={m.variant} value={`${m.w}x${m.h}`}>{m.label}</option>)}
      </select>
    </label>
  );

  const radioCard = (
    <section className="space-y-4 rounded-xl border border-subtle bg-surface-input p-5">
      {cardHead(
        <Usb className="h-4 w-4 text-blue-400" />, 'border-blue-500/20 bg-blue-500/10',
        t('radio-hud:studio.radio'),
        card ? (detectedCard?.radioLabel ?? card.volumeName) : t('radio-hud:studio.noRadio'),
      )}
      {card ? (
        <>
          <div className="flex items-center gap-2.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2.5 text-xs">
            <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
            <span className="text-content-secondary">
              <span className="font-medium text-emerald-400">{card.volumeName}</span>
              {hudInstalled ? t('radio-hud:radioHudView.widgetInstalled') : t('radio-hud:radioHudView.widgetWillInstall')}
            </span>
          </div>
          {modelSelect}
          {!isBw && models.length > 0 && (
            <div className="space-y-1.5" role="radiogroup" aria-label={t('radio-hud:studio.goesTo')}>
              <span className="text-xs text-content-secondary" data-tip={t('radio-hud:radioHudView.layoutForTip')}>{t('radio-hud:studio.goesTo')}</span>
              {[{ name: '', label: t('radio-hud:radioHudView.everyModelOnRadio'), note: t('radio-hud:studio.shared') },
                ...models
                  .filter((m, i) => models.findIndex((o) => o.name === m.name) === i)
                  .map((m) => ({
                    name: m.name,
                    label: m.name,
                    note: models.some((o) => o.name === m.name && o.current)
                      ? t('radio-hud:studio.onRadioNow')
                      : m.hasLayout ? t('radio-hud:studio.ownScreens') : t('radio-hud:studio.sharedScreens'),
                  }))].map((m) => (
                <button
                  key={m.name || '__all'}
                  type="button"
                  role="radio"
                  aria-checked={applyTarget === m.name}
                  onClick={() => { targetTouched.current = true; setConfirmApply(false); setApplyTarget(m.name); }}
                  className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors ${
                    applyTarget === m.name ? 'border-teal-500/40 bg-teal-500/10' : 'border-subtle bg-surface-input hover:border-content-tertiary'
                  }`}
                >
                  <span className={`h-3.5 w-3.5 shrink-0 rounded-full border ${applyTarget === m.name ? 'border-4 border-teal-400' : 'border-content-tertiary'}`} />
                  <span className="flex-1 truncate text-sm text-content">{m.label}</span>
                  <span className="shrink-0 text-[11px] text-content-tertiary">{m.note}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              {...ui('button', { variant: 'secondary' })}
              type="button"
              onClick={async () => {
                setApplyError(null);
                const ok = await loadFromCard(card.volumePath, applyTarget || undefined);
                if (ok) setPagesFrom(loadedSourceRef.current === 'model' ? applyTarget : '');
                setApplyState(ok
                  ? loadedSourceRef.current === 'model'
                    ? t('radio-hud:radioHudView.loadedOwnLayout', { model: applyTarget })
                    : applyTarget
                      ? t('radio-hud:radioHudView.noOwnLayout', { model: applyTarget })
                      : t('radio-hud:radioHudView.loadedShared')
                  : null);
                if (!ok) setApplyError(t('radio-hud:radioHudView.noConfigOnCard'));
              }}
              disabled={busyWithCard}
              data-tip={t('radio-hud:radioHudView.loadFromRadioTip')}
              className="flex-1 rounded-lg border border-subtle bg-surface-raised px-3 py-1.5 text-xs text-content hover:bg-surface-inset disabled:opacity-50"
            >
              {t('radio-hud:studio.openFromRadio')}
            </button>
            <button
              {...ui('button', { variant: 'secondary' })}
              type="button"
              onClick={handleEject}
              disabled={busyWithCard}
              data-tip={t('radio-hud:radioHudView.ejectTip')}
              className="rounded-lg border border-subtle bg-surface-raised px-3 py-1.5 text-xs text-content hover:bg-surface-inset disabled:opacity-50"
            >
              {t('radio-hud:radioHudView.eject')}
            </button>
            {hudInstalled && (
              <button
                {...ui('button', { variant: 'danger' })}
                type="button"
                onClick={handleRemoveWidget}
                data-tip={t('radio-hud:radioHudView.removeTip')}
                className="rounded-lg px-2.5 py-1.5 text-xs text-red-400 hover:bg-red-500/10"
              >
                {t('radio-hud:studio.removeWidget')}
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-content-tertiary/50 px-4 py-5 text-center">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-content-tertiary/30 border-t-content-secondary" />
            <span className="text-sm font-medium text-content">{t('radio-hud:studio.lookingTitle')}</span>
            <ol className="list-decimal space-y-1 pl-5 text-left text-xs leading-relaxed text-content-secondary">
              <li>{t('radio-hud:studio.lookingStep1')}</li>
              <li>{t('radio-hud:studio.lookingStep2')}</li>
              <li>{t('radio-hud:studio.lookingStep3')}</li>
            </ol>
            <button
              {...ui('button', { variant: 'secondary' })}
              type="button"
              onClick={() => { void rescan(true); }}
              disabled={busyWithCard}
              className="rounded-lg border border-subtle bg-surface-raised px-3.5 py-1.5 text-xs text-content hover:bg-surface-inset disabled:opacity-50"
            >
              {isScanning ? t('common:scanning') : t('common:rescan')}
            </button>
          </div>
          {modelSelect}
        </>
      )}
      <details className="group border-t border-subtle pt-3">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-xs text-content-secondary hover:text-content">
          <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
          {t('radio-hud:studio.advanced')}
        </summary>
        <div className="mt-3 space-y-2.5">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={cfg.debugInput} onChange={(e) => setCfg({ ...cfg, debugInput: e.target.checked })} className="rounded border bg-surface-input" />
            <span className="text-xs text-content-secondary" data-tip={t('radio-hud:radioHudView.inputDebugTip')}>{t('radio-hud:radioHudView.inputDebug')}</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={cfg.demo} onChange={(e) => setCfg({ ...cfg, demo: e.target.checked })} className="rounded border bg-surface-input" />
            <span className="text-xs text-content-secondary" data-tip={t('radio-hud:radioHudView.demoTip')}>{t('radio-hud:radioHudView.demo')}</span>
          </label>
        </div>
      </details>
    </section>
  );

  const batteryCard = (
    <section className="space-y-4 rounded-xl border border-subtle bg-surface-input p-5">
      {cardHead(
        <BatteryMedium className="h-4 w-4 text-amber-400" />, 'border-amber-500/20 bg-amber-500/10',
        t('radio-hud:studio.vehicleBattery'), t('radio-hud:studio.batteryHint'),
        <button
          {...ui('chip')}
          type="button"
          onClick={handleLoadFromVehicle}
          data-tip={t('radio-hud:radioHudView.loadFromVehicleTip')}
          className="shrink-0 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-300 hover:bg-amber-500/20"
        >
          {t('radio-hud:studio.fromVehicle')}
        </button>,
      )}
      <label className="block space-y-1.5">
        <span className="text-xs text-content-secondary">{t('radio-hud:radioHudView.vehicleName')}</span>
        <input
          type="text"
          value={cfg.name}
          onChange={(e) => setCfg({ ...cfg, name: e.target.value })}
          className="w-full rounded-lg border border-subtle bg-surface-input px-2.5 py-2 text-sm text-content focus:border-blue-500 focus:outline-none"
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        {unitField(t('radio-hud:studio.cells'), cfg.cells, 1, 'S', (v) => setCfg({ ...cfg, cells: v }),
          autoCells > 0 ? t('radio-hud:studio.autoCells', { cells: autoCells, volts: liveVolt.toFixed(1) }) : t('radio-hud:studio.autoCellsIdle'))}
        {unitField(t('radio-hud:studio.capacity'), cfg.capacity, 100, 'mAh', (v) => setCfg({ ...cfg, capacity: v }),
          t('radio-hud:studio.autoCapacity'))}
        {unitField(t('radio-hud:studio.lowWarning'), cfg.low_cell, 0.05, t('radio-hud:studio.perCell'), (v) => setCfg({ ...cfg, low_cell: v }))}
        {unitField(t('radio-hud:studio.critical'), cfg.crit_cell, 0.05, t('radio-hud:studio.perCell'), (v) => setCfg({ ...cfg, crit_cell: v }))}
      </div>
    </section>
  );

  const previewChips = (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-content-tertiary" data-tip={t('radio-hud:radioHudView.previewTip')}>{t('radio-hud:studio.previewWith')}</span>
      {([['sample', t('radio-hud:radioHudView.sampleFlight')], ['live', t('radio-hud:radioHudView.liveVehicle')]] as const).map(([m, label]) => (
        <button
          key={m}
          {...ui('chip', { active: previewMode === m })}
          type="button"
          disabled={m === 'live' && !connectionState.isConnected}
          data-tip={m === 'live' && !connectionState.isConnected ? t('radio-hud:radioHudView.liveVehicleConnectFirst') : undefined}
          onClick={() => setPreviewMode(m)}
          className={`rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-40 ${
            previewMode === m ? 'border-teal-500/40 bg-teal-500/15 text-teal-300' : 'border-subtle text-content-secondary hover:text-content'
          }`}
        >
          {label}
        </button>
      ))}
      <button
        {...ui('chip', { active: snapping })}
        type="button"
        onClick={toggleSnapping}
        aria-pressed={snapping}
        data-tip={t('radio-hud:studio.snapTip')}
        className={`ml-auto flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
          snapping ? 'border-teal-500/40 bg-teal-500/15 text-teal-300' : 'border-subtle text-content-secondary hover:text-content'
        }`}
      >
        <Magnet className="h-3.5 w-3.5" />
        {t('radio-hud:studio.snap')}
      </button>
      <div role="group" aria-label={t('radio-hud:radioHudView.theme')} className="flex items-center gap-2">
        <span className="text-xs text-content-tertiary">{t('radio-hud:radioHudView.theme')}</span>
        <div {...ui('segmented')} className="flex gap-0.5 rounded-lg border border-subtle bg-surface-input p-0.5">
          {(['dark', 'light'] as const).map((th) => (
            <button
              key={th}
              {...ui('segment', { active: cfg.theme === th })}
              type="button"
              onClick={() => setCfg({ ...cfg, theme: th })}
              className={`rounded-md px-3 py-0.5 text-xs transition-colors ${cfg.theme === th ? 'bg-surface-raised text-content' : 'text-content-secondary hover:text-content'}`}
            >
              {th === 'dark' ? t('radio-hud:radioHudView.dark') : t('radio-hud:radioHudView.light')}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const radioFrame = (children: React.ReactNode) => (
    <div className="rounded-2xl border border-subtle bg-[#111318] p-4 shadow-lg">{children}</div>
  );

  const fieldMapsCard = (
    <section data-tour="hud-maps" className="basis-full space-y-4 rounded-xl border border-subtle bg-surface-input p-5">
      {cardHead(
        <MapIcon className="h-4 w-4 text-emerald-400" />, 'border-emerald-500/20 bg-emerald-500/10',
        t('radio-hud:radioHudView.fieldMaps'), t('radio-hud:studio.fieldMapsHint'),
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => { if (telemetry.gps.lat && telemetry.gps.lon) setMapCenter({ lat: telemetry.gps.lat, lon: telemetry.gps.lon }); }}
            disabled={!telemetry.gps.lat}
            data-tip={t('radio-hud:radioHudView.useVehiclePositionTip')}
            className="rounded-lg border border-subtle bg-surface-raised px-3 py-1.5 text-xs text-content hover:bg-surface-inset disabled:opacity-50"
          >
            {t('radio-hud:radioHudView.useVehiclePosition')}
          </button>
          <button
            type="button"
            onClick={handleGenerateMaps}
            disabled={mapCenter.lat === 0}
            className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
          >
            {t('radio-hud:studio.generateMaps')}
          </button>
        </div>,
      )}
      <div className="relative overflow-hidden rounded-lg border border-subtle" style={{ height: 'min(60vh, 560px)', minHeight: 320 }}>
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
          <FollowContainerSize />
          <TileLayer url="tile-cache://satellite/{z}/{x}/{y}.png" />
          <FieldClickHandler onPick={(lat, lon) => setMapCenter({ lat, lon })} />
          <FieldRecenter lat={mapCenter.lat} lon={mapCenter.lon} />
          {mapCenter.lat !== 0 && (
            <>
              <CircleMarker center={[mapCenter.lat, mapCenter.lon]} radius={6}
                pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#2dd4bf', fillOpacity: 1 }} />
              {FIELD_MAP_SPANS.map((s) => (
                <Circle key={s} center={[mapCenter.lat, mapCenter.lon]} radius={s}
                  pathOptions={{ color: '#2dd4bf', weight: 1, fillOpacity: 0.03 }} />
              ))}
            </>
          )}
        </MapContainer>
        <div className="pointer-events-none absolute bottom-3 right-3 z-[400] flex gap-1.5">
          {FIELD_MAP_SPANS.map((s) => (
            <span key={s} className="rounded-md bg-black/70 px-2 py-0.5 text-[11px] text-white">
              {s >= 1000 ? `${s / 1000} km` : `${s} m`}
            </span>
          ))}
        </div>
      </div>
      {mapGenState && <p className="text-[11px] text-content-secondary">{mapGenState}</p>}
    </section>
  );

  const guideScale = 360 / SCREEN_W;

  return (
    <div className="flex flex-col h-full bg-surface-base">
      <div className="border-b border-subtle bg-surface-input px-6 pt-4">
        <div className="flex items-center gap-3">
          <svg className="w-6 h-6 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <rect x="4" y="7" width="16" height="11" rx="2" strokeWidth={1.5} />
            <path strokeLinecap="round" strokeWidth={1.5} d="M8 4l4 3 4-3M8 11h4M8 14h8" />
          </svg>
          <h1 className="text-xl font-semibold text-content">{t('radio-hud:radioHudView.title')}</h1>
          <span className="text-xs text-content-secondary">{t('radio-hud:radioHudView.subtitle')}</span>
        </div>
        <div {...ui('tabs')} role="tablist" className="mt-3 flex gap-1">
          {(['editor', 'guide'] as const).map((id) => (
            <button
              key={id}
              {...ui('tab', { active: tab === id })}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => (id === 'guide' && isBw ? setGuideOpen(true) : setTab(id))}
              className={`border-b-2 px-3.5 py-2 text-sm transition-colors ${
                tab === id ? 'border-teal-400 text-content' : 'border-transparent text-content-secondary hover:text-content'
              }`}
            >
              {t(`radio-hud:studio.tab.${id}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {tab === 'guide' && !isBw ? (
          <HudGuide renderState={(state) => (
            <div style={{ height: SCREEN_H * guideScale }}>
              <div style={{ transform: `scale(${guideScale})`, transformOrigin: 'top left', width: SCREEN_W, height: SCREEN_H }}>
                <HudPreview mode={state} data={SAMPLE} cfg={previewCfg} tiles={tiles} editing={false} onTilesChange={() => undefined} kind={vehicleKind} />
              </div>
            </div>
          )} />
        ) : (
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-start gap-5 p-6">
          <section className="min-w-0 space-y-4 rounded-xl border border-subtle bg-surface-input p-5" style={{ flex: '999 1 640px' }}>
            {cardHead(
              <MonitorSmartphone className="h-4 w-4 text-teal-400" />, 'border-teal-500/20 bg-teal-500/10',
              isBw ? t('radio-hud:studio.bwScreen') : t('radio-hud:studio.screens'),
              isBw ? t('radio-hud:studio.bwScreenHint') : t('radio-hud:studio.screensHint'),
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {!isBw && (connectedKind ? (
                  <span className="flex items-center gap-1.5 rounded-full border border-subtle bg-surface-input px-2.5 py-1 text-xs text-content-secondary">
                    {t(`radio-hud:studio.kind.${connectedKind}`)}
                    <span className="text-content-tertiary">{t('radio-hud:studio.fromVehicleChip')}</span>
                  </span>
                ) : (
                  <label className="flex items-center gap-1.5 rounded-full border border-subtle bg-surface-input py-0.5 pl-2.5 pr-1 text-xs text-content-tertiary"
                    data-tip={t('radio-hud:studio.pickVehicleTip')}>
                    {t('radio-hud:studio.vehicle')}
                    <select
                      value={pickedKind ?? ''}
                      onChange={(e) => setPickedKind((e.target.value || null) as HudVehicleKind | null)}
                      className="rounded-full bg-transparent py-0.5 pr-1 text-xs text-content focus:outline-none"
                    >
                      <option value="">{t('radio-hud:studio.pickVehicle')}</option>
                      {(['copter', 'plane', 'rover', 'boat', 'sub'] as const).map((k) => (
                        <option key={k} value={k}>{t(`radio-hud:studio.kind.${k}`)}</option>
                      ))}
                    </select>
                  </label>
                ))}
                {isBw ? (
                  <>
                    <button
                      {...ui('button', { variant: 'secondary' })}
                      type="button"
                      onClick={() => setEditing(!editing)}
                      data-tour="hud-edit"
                      className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${editing
                        ? 'border-teal-500/40 bg-teal-500/20 text-teal-300'
                        : 'border-subtle bg-surface-input text-content-secondary hover:text-content'}`}
                    >
                      {editing ? t('radio-hud:radioHudView.doneEditing') : t('radio-hud:radioHudView.editSlots')}
                    </button>
                    {editing && (
                      <button
                        {...ui('button', { variant: 'secondary' })}
                        type="button"
                        onClick={() => setBw(DEFAULT_BW_LAYOUT)}
                        disabled={JSON.stringify(bw) === JSON.stringify(DEFAULT_BW_LAYOUT)}
                        data-tip={t('radio-hud:radioHudView.resetTip')}
                        className="rounded-lg border border-subtle bg-surface-input px-3 py-1.5 text-xs text-content-secondary hover:text-content disabled:opacity-40"
                      >
                        {t('radio-hud:radioHudView.resetToDefault')}
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    {...ui('button', { variant: 'secondary' })}
                    type="button"
                    onClick={() => setGallery('replace')}
                    data-tour="hud-edit"
                    className="flex items-center gap-1.5 rounded-lg border border-teal-500/30 bg-teal-500/10 px-3 py-1.5 text-xs text-teal-300 hover:bg-teal-500/20"
                  >
                    <LayoutTemplate className="h-3.5 w-3.5" />
                    {t('radio-hud:studio.templates')}
                  </button>
                )}
              </div>,
            )}

            {isBw ? (
              <>
                {radioFrame(
                  <BwPreview mode={previewMode} data={previewData} cfg={previewCfg} screenW={screen.w}
                    editing={editing} layout={bw} onLayout={setBw} />,
                )}
                {previewChips}
              </>
            ) : (
              <>
                <ScreenStrip
                  renderScreen={(tilesOf) => <ScaledScreen tiles={tilesOf} data={SAMPLE} cfg={previewCfg} kind={vehicleKind} />}
                  pages={pages}
                  active={activePage}
                  screen={screen}
                  maxPages={MAX_PAGES}
                  onPick={setActivePage}
                  onRemove={(i) => {
                    setPages((prev) => prev.filter((_, j) => j !== i));
                    setActivePage((a) => Math.max(0, a >= i ? a - 1 : a));
                  }}
                  onAddEmpty={() => addPage([])}
                  onDuplicate={() => addPage(tiles.map((tile) => ({ ...tile })))}
                  onAddFromTemplate={() => setGallery('add')}
                />

                {pages.some((p) => p.some((tile) => tile.id === 'echo')) && <SonarSetupCard connected={connectionState.isConnected} />}

                {pages.length > 1 && (
                  <div className="flex flex-wrap items-center gap-2.5 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2.5 text-xs text-content-secondary">
                    <RefreshCw className="h-3.5 w-3.5 shrink-0 text-blue-400" />
                    <span className="text-content">{t('radio-hud:studio.switching')}</span>
                    <span data-tip={t('radio-hud:radioHudView.turnPagesTip')}>{t('radio-hud:studio.switchingWhy')}</span>
                    <select
                      value={cfg.pageSecs}
                      onChange={(e) => setCfg({ ...cfg, pageSecs: Number(e.target.value) })}
                      aria-label={t('radio-hud:studio.switching')}
                      className="rounded-md border border-subtle bg-surface-input px-2 py-1 text-xs text-content"
                    >
                      {[5, 8, 15, 30].map((sec) => <option key={sec} value={sec}>{t('radio-hud:studio.everySeconds', { count: sec })}</option>)}
                      <option value={0}>{t('radio-hud:studio.onlySwipe')}</option>
                    </select>
                  </div>
                )}

                <div className="flex flex-wrap items-start gap-4">
                  <div className="min-w-0 space-y-3" style={{ flex: '999 1 460px' }}>
                    {radioFrame(
                      /* scales the native canvas to the column width */
                      <div ref={previewBoxRef} className="overflow-hidden rounded"
                        style={{ width: '100%', height: SCREEN_H * previewScale }}>
                        <div style={{ transform: `scale(${previewScale})`, transformOrigin: 'top left', width: SCREEN_W, height: SCREEN_H }}>
                          <HudPreview mode={previewMode} data={previewData} cfg={previewCfg} tiles={tiles} editing kind={vehicleKind} snapping={snapping}
                            onTilesChange={setTiles} selected={selectedTile} onSelect={setSelectedTile} />
                        </div>
                      </div>,
                    )}
                    {previewChips}
                  </div>
                  <div className="min-w-0" style={{ flex: '1 1 260px' }}>
                    <TileInspector
                      tile={selected}
                      kind={vehicleKind}
                      unplaced={unplacedTiles}
                      onVariant={(variant) => setTiles(tiles.map((tile, i) => (i === selectedTile ? { ...tile, variant } : tile)))}
                      onRemove={() => {
                        setTiles(tiles.filter((_, i) => i !== selectedTile));
                        setSelectedTile(null);
                      }}
                      onAdd={addTile}
                    />
                  </div>
                </div>
              </>
            )}
          </section>

          <aside className="flex min-w-0 max-w-[420px] flex-col gap-4" style={{ flex: '1 1 340px' }}>
            {radioCard}
            {batteryCard}
          </aside>

          {!isBw && fieldMapsCard}
        </div>
        )}
      </div>

      {/* fixed action footer: status left, the one action right, clear of the cargo dock */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-subtle bg-surface-input py-3 pl-6 pr-48">
        <div className="min-w-[180px] flex-1 text-xs">
          {applyError ? (
            <span className="text-red-400">{applyError}</span>
          ) : applyState ? (
            <span className="text-content-secondary">{applyState}</span>
          ) : card ? (
            <span className="text-content-secondary">
              {!isBw && models.length > 0
                ? pagesFrom !== null && pagesFrom !== applyTarget
                  ? t('radio-hud:radioHudView.pagesCameFrom', { from: pagesFrom || t('radio-hud:radioHudView.sharedLayout') }) + (applyTarget ? t('radio-hud:radioHudView.applyingPutsOn', { model: applyTarget }) : '')
                  : applyTarget
                    ? t('radio-hud:radioHudView.onlyModelUses', { model: applyTarget })
                    : t('radio-hud:radioHudView.everyModelUses')
                : t('radio-hud:studio.readyToPut')}
            </span>
          ) : (
            <span className="text-content-tertiary">{t('radio-hud:studio.connectToPut')}</span>
          )}
        </div>
        <button
          {...ui('button', { variant: 'primary' })}
          type="button"
          onClick={() => {
            if (applyNeedsConfirm && !confirmApply) {
              setConfirmApply(true);
              return;
            }
            setConfirmApply(false);
            void handleApply();
          }}
          onBlur={() => setConfirmApply(false)}
          disabled={applyBusy || !card}
          data-tour="hud-apply"
          data-tip={t('radio-hud:radioHudView.applyTip')}
          className={`whitespace-nowrap rounded-lg px-5 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50 ${
            confirmApply ? 'bg-amber-600 hover:bg-amber-500' : 'bg-blue-600 hover:bg-blue-500'
          }`}
        >
          {confirmApply ? t('radio-hud:radioHudView.overwriteConfirm', { target: applyTarget || t('radio-hud:radioHudView.everyModel') }) : applyLabel}
        </button>
      </div>

      {gallery && (
        <TemplateGallery
          renderScreen={(tilesOf, kindOf) => <ScaledScreen tiles={tilesOf} data={SAMPLE} cfg={{ ...previewCfg, name: '' }} kind={kindOf} />}
          mode={gallery}
          kind={vehicleKind}
          connectedKind={connectedKind}
          screen={screen}
          saved={layouts}
          roomForScreens={MAX_PAGES - pages.length}
          onClose={() => setGallery(null)}
          onUse={(fitted, how) => applyTemplate(fitted, how, t('radio-hud:studio.templateFallbackName'))}
          onDeleteSaved={(name) => {
            const next = removeLayout(layouts, name);
            persistLayouts(next);
            setLayouts(next);
          }}
          onSaveCurrent={(name) => {
            const next = upsertLayout(layouts, { name, screen, pages, savedAt: new Date().toISOString() });
            persistLayouts(next);
            setLayouts(next);
          }}
        />
      )}
      {guideOpen && <BwGuide onClose={() => setGuideOpen(false)} />}
    </div>
  );
}
