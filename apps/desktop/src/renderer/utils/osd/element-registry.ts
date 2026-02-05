/**
 * OSD Element Registry
 *
 * Central catalog of all OSD elements with metadata, categories,
 * preview info, and default positions. This is the single source
 * of truth for what OSD elements exist and their properties.
 */

import { SYM } from './osd-symbols';
import type { OsdElementCategory } from './element-categories';

/** Size of an OSD element in character units */
export interface ElementSize {
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Element ID type - expanded from the original 16 to 55+
// ---------------------------------------------------------------------------

export type OsdElementId =
  // General
  | 'flymode'
  | 'armed_status'
  | 'craft_name'
  | 'warnings'
  | 'messages'
  // Battery & Power
  | 'battery_voltage'
  | 'battery_cell_voltage'
  | 'battery_percent'
  | 'current_draw'
  | 'mah_drawn'
  | 'power_watts'
  | 'efficiency'
  // Altitude & Vario
  | 'altitude'
  | 'msl_altitude'
  | 'vario'
  // Speed & Distance
  | 'speed'
  | 'airspeed'
  | 'max_speed'
  | 'distance'
  | 'home_direction'
  // GPS
  | 'gps_sats'
  | 'gps_hdop'
  | 'latitude'
  | 'longitude'
  | 'coordinates'
  // Attitude
  | 'crosshairs'
  | 'artificial_horizon'
  | 'horizon_sidebars'
  | 'pitch'
  | 'roll'
  | 'heading'
  | 'heading_graph'
  // Timers
  | 'flight_time'
  | 'on_time'
  | 'rtc_time'
  | 'remaining_flight_time'
  // Radio & Control
  | 'rssi'
  | 'rssi_dbm'
  | 'throttle'
  | 'throttle_gauge'
  // Sensors
  | 'baro_temp'
  | 'imu_temp'
  | 'esc_temp'
  | 'g_force'
  | 'esc_rpm'
  // Mission
  | 'ccrp_indicator'
  | 'vtx_channel'
  | 'wind_horizontal'
  | 'wind_vertical';

// ---------------------------------------------------------------------------
// Element Definition
// ---------------------------------------------------------------------------

export interface OsdElementDefinition {
  id: OsdElementId;
  name: string;
  category: OsdElementCategory;
  description: string;
  /** Primary symbol character index for inline preview in element browser */
  previewSymbol: number;
  /** Sample text shown in preview (e.g. "11.8V") */
  previewText: string;
  size: ElementSize;
  defaultPosition: { x: number; y: number; enabled: boolean };
  /** Betaflight OSD element index for FC sync */
  betaflightIndex?: number;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const ELEMENT_REGISTRY: OsdElementDefinition[] = [
  // ── General ───────────────────────────────────────────────────────────
  {
    id: 'flymode',
    name: 'Flight Mode',
    category: 'general',
    description: 'Current flight mode name (ANGLE, HORIZON, etc.)',
    previewSymbol: SYM.HEADING,
    previewText: 'ANGLE',
    size: { width: 8, height: 1 },
    defaultPosition: { x: 12, y: 12, enabled: false },
    betaflightIndex: 7,
  },
  {
    id: 'armed_status',
    name: 'Armed Status',
    category: 'general',
    description: 'Shows ARMED or DISARMED state',
    previewSymbol: SYM.ALERT,
    previewText: 'ARMED',
    size: { width: 8, height: 1 },
    defaultPosition: { x: 12, y: 13, enabled: false },
    betaflightIndex: 29,
  },
  {
    id: 'craft_name',
    name: 'Craft Name',
    category: 'general',
    description: 'User-configured aircraft name',
    previewSymbol: SYM.HEADING,
    previewText: 'ARDUDECK',
    size: { width: 10, height: 1 },
    defaultPosition: { x: 10, y: 15, enabled: false },
    betaflightIndex: 8,
  },
  {
    id: 'warnings',
    name: 'Warnings',
    category: 'general',
    description: 'System warnings (low battery, GPS lost, etc.)',
    previewSymbol: SYM.ALERT,
    previewText: 'LOW BATT',
    size: { width: 12, height: 1 },
    defaultPosition: { x: 9, y: 10, enabled: false },
    betaflightIndex: 21,
  },
  {
    id: 'messages',
    name: 'Messages',
    category: 'general',
    description: 'FC status messages and notifications',
    previewSymbol: SYM.HEADING,
    previewText: 'MSG',
    size: { width: 12, height: 1 },
    defaultPosition: { x: 9, y: 11, enabled: false },
  },

  // ── Battery & Power ───────────────────────────────────────────────────
  {
    id: 'battery_voltage',
    name: 'Battery Voltage',
    category: 'battery',
    description: 'Total battery pack voltage',
    previewSymbol: SYM.BATT,
    previewText: '11.8V',
    size: { width: 6, height: 1 },
    defaultPosition: { x: 1, y: 0, enabled: true },
    betaflightIndex: 1,
  },
  {
    id: 'battery_cell_voltage',
    name: 'Cell Voltage',
    category: 'battery',
    description: 'Average voltage per cell',
    previewSymbol: SYM.BATT,
    previewText: '3.95V',
    size: { width: 6, height: 1 },
    defaultPosition: { x: 1, y: 1, enabled: false },
    betaflightIndex: 22,
  },
  {
    id: 'battery_percent',
    name: 'Battery Percent',
    category: 'battery',
    description: 'Battery charge remaining percentage',
    previewSymbol: SYM.BATT,
    previewText: ' 75%',
    size: { width: 5, height: 1 },
    defaultPosition: { x: 24, y: 0, enabled: true },
    betaflightIndex: 28,
  },
  {
    id: 'current_draw',
    name: 'Current Draw',
    category: 'battery',
    description: 'Instantaneous current draw in amps',
    previewSymbol: SYM.AMP,
    previewText: ' 8.5A',
    size: { width: 6, height: 1 },
    defaultPosition: { x: 1, y: 5, enabled: false },
    betaflightIndex: 11,
  },
  {
    id: 'mah_drawn',
    name: 'mAh Drawn',
    category: 'battery',
    description: 'Total milliamp-hours consumed',
    previewSymbol: SYM.MAH,
    previewText: ' 850',
    size: { width: 6, height: 1 },
    defaultPosition: { x: 1, y: 6, enabled: false },
    betaflightIndex: 12,
  },
  {
    id: 'power_watts',
    name: 'Power (Watts)',
    category: 'battery',
    description: 'Instantaneous power consumption',
    previewSymbol: SYM.WATT,
    previewText: '100W',
    size: { width: 5, height: 1 },
    defaultPosition: { x: 1, y: 7, enabled: false },
  },
  {
    id: 'efficiency',
    name: 'Efficiency',
    category: 'battery',
    description: 'mAh per km efficiency indicator',
    previewSymbol: SYM.MAH_KM_0,
    previewText: '120',
    size: { width: 6, height: 1 },
    defaultPosition: { x: 1, y: 8, enabled: false },
  },

  // ── Altitude & Vario ──────────────────────────────────────────────────
  {
    id: 'altitude',
    name: 'Altitude (AGL)',
    category: 'altitude',
    description: 'Altitude above ground level / home',
    previewSymbol: SYM.ALT_M,
    previewText: ' 120m',
    size: { width: 6, height: 1 },
    defaultPosition: { x: 1, y: 2, enabled: true },
    betaflightIndex: 15,
  },
  {
    id: 'msl_altitude',
    name: 'MSL Altitude',
    category: 'altitude',
    description: 'Altitude above mean sea level',
    previewSymbol: SYM.ALT_M,
    previewText: ' 450m',
    size: { width: 6, height: 1 },
    defaultPosition: { x: 1, y: 3, enabled: false },
  },
  {
    id: 'vario',
    name: 'Variometer',
    category: 'altitude',
    description: 'Vertical speed indicator (climb/sink)',
    previewSymbol: SYM.VARIO_UP_2A,
    previewText: '+2.5',
    size: { width: 5, height: 1 },
    defaultPosition: { x: 7, y: 2, enabled: false },
  },

  // ── Speed & Distance ──────────────────────────────────────────────────
  {
    id: 'speed',
    name: 'Ground Speed',
    category: 'speed',
    description: 'Speed over ground',
    previewSymbol: SYM.KMH,
    previewText: ' 54',
    size: { width: 4, height: 1 },
    defaultPosition: { x: 1, y: 3, enabled: true },
    betaflightIndex: 13,
  },
  {
    id: 'airspeed',
    name: 'Airspeed',
    category: 'speed',
    description: 'Indicated airspeed from pitot tube',
    previewSymbol: SYM.AIR,
    previewText: ' 65',
    size: { width: 5, height: 1 },
    defaultPosition: { x: 1, y: 4, enabled: false },
  },
  {
    id: 'max_speed',
    name: 'Max Speed',
    category: 'speed',
    description: 'Maximum speed achieved in flight',
    previewSymbol: SYM.MAX,
    previewText: ' 72',
    size: { width: 5, height: 1 },
    defaultPosition: { x: 1, y: 5, enabled: false },
  },
  {
    id: 'distance',
    name: 'Home Distance',
    category: 'speed',
    description: 'Distance from home point',
    previewSymbol: SYM.HOME,
    previewText: ' 350m',
    size: { width: 6, height: 1 },
    defaultPosition: { x: 1, y: 4, enabled: true },
    betaflightIndex: 31,
  },
  {
    id: 'home_direction',
    name: 'Home Direction',
    category: 'speed',
    description: 'Arrow pointing towards home',
    previewSymbol: SYM.DIR_TO_HOME,
    previewText: '',
    size: { width: 2, height: 1 },
    defaultPosition: { x: 1, y: 5, enabled: false },
    betaflightIndex: 30,
  },

  // ── GPS ───────────────────────────────────────────────────────────────
  {
    id: 'gps_sats',
    name: 'GPS Satellites',
    category: 'gps',
    description: 'Number of GPS satellites in view',
    previewSymbol: SYM.GPS_SAT1,
    previewText: '12',
    size: { width: 4, height: 1 },
    defaultPosition: { x: 24, y: 1, enabled: true },
    betaflightIndex: 14,
  },
  {
    id: 'gps_hdop',
    name: 'GPS HDOP',
    category: 'gps',
    description: 'Horizontal dilution of precision',
    previewSymbol: SYM.GPS_HDP1,
    previewText: '0.9',
    size: { width: 5, height: 1 },
    defaultPosition: { x: 24, y: 2, enabled: false },
  },
  {
    id: 'latitude',
    name: 'Latitude',
    category: 'gps',
    description: 'Current latitude coordinate',
    previewSymbol: SYM.LAT,
    previewText: '37.7749',
    size: { width: 10, height: 1 },
    defaultPosition: { x: 1, y: 14, enabled: false },
    betaflightIndex: 24,
  },
  {
    id: 'longitude',
    name: 'Longitude',
    category: 'gps',
    description: 'Current longitude coordinate',
    previewSymbol: SYM.LON,
    previewText: '-122.42',
    size: { width: 10, height: 1 },
    defaultPosition: { x: 1, y: 15, enabled: false },
    betaflightIndex: 23,
  },
  {
    id: 'coordinates',
    name: 'Coordinates',
    category: 'gps',
    description: 'Latitude and longitude on two lines',
    previewSymbol: SYM.LAT,
    previewText: '37.77/-122.4',
    size: { width: 11, height: 2 },
    defaultPosition: { x: 1, y: 14, enabled: true },
  },

  // ── Attitude ──────────────────────────────────────────────────────────
  {
    id: 'crosshairs',
    name: 'Crosshairs',
    category: 'attitude',
    description: 'Center screen aircraft indicator',
    previewSymbol: SYM.AH_AIRCRAFT2,
    previewText: '',
    size: { width: 3, height: 1 },
    defaultPosition: { x: 14, y: 7, enabled: true },
    betaflightIndex: 2,
  },
  {
    id: 'artificial_horizon',
    name: 'Artificial Horizon',
    category: 'attitude',
    description: 'Attitude horizon line indicator',
    previewSymbol: SYM.AH_BAR9_0,
    previewText: '',
    size: { width: 9, height: 1 },
    defaultPosition: { x: 14, y: 7, enabled: true },
    betaflightIndex: 3,
  },
  {
    id: 'horizon_sidebars',
    name: 'Horizon Sidebars',
    category: 'attitude',
    description: 'Side markers for artificial horizon',
    previewSymbol: SYM.AH_LEFT,
    previewText: '',
    size: { width: 15, height: 7 },
    defaultPosition: { x: 14, y: 7, enabled: false },
    betaflightIndex: 4,
  },
  {
    id: 'pitch',
    name: 'Pitch Angle',
    category: 'attitude',
    description: 'Aircraft pitch angle in degrees',
    previewSymbol: SYM.PITCH_UP,
    previewText: '  5',
    size: { width: 5, height: 1 },
    defaultPosition: { x: 24, y: 4, enabled: true },
    betaflightIndex: 26,
  },
  {
    id: 'roll',
    name: 'Roll Angle',
    category: 'attitude',
    description: 'Aircraft roll/bank angle in degrees',
    previewSymbol: SYM.ROLL_LEVEL,
    previewText: ' -3',
    size: { width: 5, height: 1 },
    defaultPosition: { x: 24, y: 5, enabled: true },
    betaflightIndex: 27,
  },
  {
    id: 'heading',
    name: 'Heading',
    category: 'attitude',
    description: 'Compass heading in degrees',
    previewSymbol: SYM.HEADING,
    previewText: '270',
    size: { width: 5, height: 1 },
    defaultPosition: { x: 14, y: 0, enabled: true },
    betaflightIndex: 32,
  },
  {
    id: 'heading_graph',
    name: 'Heading Graph',
    category: 'attitude',
    description: 'Graphical compass heading tape',
    previewSymbol: SYM.HEADING_N,
    previewText: 'N--E--S',
    size: { width: 9, height: 1 },
    defaultPosition: { x: 11, y: 1, enabled: false },
  },

  // ── Timers ────────────────────────────────────────────────────────────
  {
    id: 'flight_time',
    name: 'Flight Time',
    category: 'timers',
    description: 'Time since arming',
    previewSymbol: SYM.FLY_M,
    previewText: '03:05',
    size: { width: 6, height: 1 },
    defaultPosition: { x: 24, y: 12, enabled: true },
    betaflightIndex: 5,
  },
  {
    id: 'on_time',
    name: 'On Time',
    category: 'timers',
    description: 'Time since power on',
    previewSymbol: SYM.ON_M,
    previewText: '12:30',
    size: { width: 6, height: 1 },
    defaultPosition: { x: 24, y: 13, enabled: false },
    betaflightIndex: 6,
  },
  {
    id: 'rtc_time',
    name: 'RTC Time',
    category: 'timers',
    description: 'Real-time clock (current time)',
    previewSymbol: SYM.CLOCK,
    previewText: '14:23',
    size: { width: 6, height: 1 },
    defaultPosition: { x: 24, y: 14, enabled: false },
  },
  {
    id: 'remaining_flight_time',
    name: 'Remaining Time',
    category: 'timers',
    description: 'Estimated remaining flight time',
    previewSymbol: SYM.FLIGHT_MINS_REMAINING,
    previewText: '08:15',
    size: { width: 6, height: 1 },
    defaultPosition: { x: 24, y: 15, enabled: false },
  },

  // ── Radio & Control ───────────────────────────────────────────────────
  {
    id: 'rssi',
    name: 'RSSI',
    category: 'radio',
    description: 'Received signal strength indicator (%)',
    previewSymbol: SYM.RSSI,
    previewText: ' 85',
    size: { width: 4, height: 1 },
    defaultPosition: { x: 1, y: 1, enabled: true },
    betaflightIndex: 0,
  },
  {
    id: 'rssi_dbm',
    name: 'RSSI (dBm)',
    category: 'radio',
    description: 'Signal strength in dBm (ELRS, Crossfire)',
    previewSymbol: SYM.DBM,
    previewText: '-62',
    size: { width: 5, height: 1 },
    defaultPosition: { x: 1, y: 2, enabled: false },
  },
  {
    id: 'throttle',
    name: 'Throttle',
    category: 'radio',
    description: 'Current throttle position percentage',
    previewSymbol: SYM.THR,
    previewText: ' 45%',
    size: { width: 5, height: 1 },
    defaultPosition: { x: 1, y: 12, enabled: true },
    betaflightIndex: 9,
  },
  {
    id: 'throttle_gauge',
    name: 'Throttle Gauge',
    category: 'radio',
    description: 'Visual throttle bar gauge',
    previewSymbol: SYM.THROTTLE_GAUGE_FULL,
    previewText: '',
    size: { width: 1, height: 5 },
    defaultPosition: { x: 0, y: 6, enabled: false },
  },

  // ── Sensors ───────────────────────────────────────────────────────────
  {
    id: 'baro_temp',
    name: 'Baro Temperature',
    category: 'sensors',
    description: 'Barometer sensor temperature',
    previewSymbol: SYM.BARO_TEMP,
    previewText: '32C',
    size: { width: 5, height: 1 },
    defaultPosition: { x: 24, y: 6, enabled: false },
  },
  {
    id: 'imu_temp',
    name: 'IMU Temperature',
    category: 'sensors',
    description: 'IMU/gyro sensor temperature',
    previewSymbol: SYM.IMU_TEMP,
    previewText: '45C',
    size: { width: 5, height: 1 },
    defaultPosition: { x: 24, y: 7, enabled: false },
  },
  {
    id: 'esc_temp',
    name: 'ESC Temperature',
    category: 'sensors',
    description: 'Electronic speed controller temperature',
    previewSymbol: SYM.ESC_TEMPERATURE,
    previewText: '55C',
    size: { width: 5, height: 1 },
    defaultPosition: { x: 24, y: 8, enabled: false },
  },
  {
    id: 'g_force',
    name: 'G-Force',
    category: 'sensors',
    description: 'Current G-force loading',
    previewSymbol: SYM.GFORCE,
    previewText: '1.2G',
    size: { width: 5, height: 1 },
    defaultPosition: { x: 24, y: 9, enabled: false },
  },
  {
    id: 'esc_rpm',
    name: 'ESC RPM',
    category: 'sensors',
    description: 'Motor RPM from ESC telemetry',
    previewSymbol: SYM.RPM,
    previewText: '12500',
    size: { width: 7, height: 1 },
    defaultPosition: { x: 23, y: 10, enabled: false },
  },

  // ── Mission ───────────────────────────────────────────────────────────
  {
    id: 'ccrp_indicator',
    name: 'CCRP Indicator',
    category: 'mission',
    description: 'Continuously Computed Release Point gauge',
    previewSymbol: SYM.CROSS_TRACK_ERROR,
    previewText: 'CCRP',
    size: { width: 5, height: 9 },
    defaultPosition: { x: 26, y: 3, enabled: false },
  },
  {
    id: 'vtx_channel',
    name: 'VTX Channel',
    category: 'mission',
    description: 'Video transmitter band/channel/power',
    previewSymbol: SYM.VTX_POWER,
    previewText: 'R:4:25',
    size: { width: 7, height: 1 },
    defaultPosition: { x: 23, y: 11, enabled: false },
    betaflightIndex: 10,
  },
  {
    id: 'wind_horizontal',
    name: 'Wind (Horizontal)',
    category: 'mission',
    description: 'Horizontal wind speed and direction',
    previewSymbol: SYM.WIND_SPEED_HORIZONTAL,
    previewText: '12',
    size: { width: 5, height: 1 },
    defaultPosition: { x: 24, y: 3, enabled: false },
  },
  {
    id: 'wind_vertical',
    name: 'Wind (Vertical)',
    category: 'mission',
    description: 'Vertical wind component',
    previewSymbol: SYM.WIND_SPEED_VERTICAL,
    previewText: '+2',
    size: { width: 5, height: 1 },
    defaultPosition: { x: 24, y: 4, enabled: false },
  },
];

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

const _registryMap = new Map<OsdElementId, OsdElementDefinition>();
for (const def of ELEMENT_REGISTRY) {
  _registryMap.set(def.id, def);
}

/** Get element definition by ID */
export function getElementDef(id: OsdElementId): OsdElementDefinition | undefined {
  return _registryMap.get(id);
}

/** Get all element IDs */
export function getAllElementIds(): OsdElementId[] {
  return ELEMENT_REGISTRY.map((d) => d.id);
}

/** Get elements grouped by category */
export function getElementsByCategory(): Map<OsdElementCategory, OsdElementDefinition[]> {
  const map = new Map<OsdElementCategory, OsdElementDefinition[]>();
  for (const def of ELEMENT_REGISTRY) {
    const list = map.get(def.category) || [];
    list.push(def);
    map.set(def.category, list);
  }
  return map;
}

/** Build default positions record from registry */
export function buildDefaultPositions(): Record<OsdElementId, { x: number; y: number; enabled: boolean }> {
  const positions = {} as Record<OsdElementId, { x: number; y: number; enabled: boolean }>;
  for (const def of ELEMENT_REGISTRY) {
    positions[def.id] = { ...def.defaultPosition };
  }
  return positions;
}

/** Build Betaflight index map from registry */
export function buildBfIndexMap(): Record<number, OsdElementId> {
  const map: Record<number, OsdElementId> = {};
  for (const def of ELEMENT_REGISTRY) {
    if (def.betaflightIndex !== undefined) {
      map[def.betaflightIndex] = def.id;
    }
  }
  return map;
}

/** Get element size from registry with fallback */
export function getElementSizeFromRegistry(id: OsdElementId): ElementSize {
  const def = _registryMap.get(id);
  return def?.size ?? { width: 4, height: 1 };
}
