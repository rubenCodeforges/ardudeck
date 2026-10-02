/**
 * Tactical icon pool - SVG path registry for vehicle types on the strategic map.
 * Each icon is designed for a 28x28 viewBox, pointing north (up) at 0 degrees.
 * Inspired by Supreme Commander strategic icons and Wargame NATO symbols.
 *
 * Adding a new vehicle type = add one entry to TACTICAL_ICON_POOL + one case in mavTypeToTacticalClass().
 */

// Extend beyond ArduPilotVehicleClass to cover future swarm vehicle diversity
export type TacticalVehicleClass =
  | 'copter'
  | 'plane'
  | 'vtol'
  | 'rover'
  | 'boat'
  | 'sub'
  | 'antenna'
  | 'unknown';

export interface TacticalIconDef {
  /** SVG path data, viewBox 0 0 28 28, pointing north */
  svgPath: string;
  /** Whether the path uses stroke-only rendering (no fill) */
  strokeOnly?: boolean;
  /** Human-readable label (i18n key) */
  labelKey: string;
  /** Short tactical designation for info labels (e.g. "QUAD", "FW") */
  defaultDesignation: string;
}

/**
 * Icon pool keyed by vehicle class.
 */
export const TACTICAL_ICON_POOL: Record<TacticalVehicleClass, TacticalIconDef> = {
  copter: {
    // Top-down quadcopter: X-frame arms radiating from center, rotor circles at tips, center body
    svgPath: [
      // Diagonal arms
      'M8.5 8.5L12.5 12.5', 'M19.5 8.5L15.5 12.5',
      'M8.5 19.5L12.5 15.5', 'M19.5 19.5L15.5 15.5',
      // Rotor circles at tips
      'M7 7m-3.5 0a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0',
      'M21 7m-3.5 0a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0',
      'M7 21m-3.5 0a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0',
      'M21 21m-3.5 0a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0',
      // Center body
      'M14 14m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
    ].join(''),
    strokeOnly: true,
    labelKey: 'map:tacticalIcon.multirotor',
    defaultDesignation: 'QUAD',
  },
  plane: {
    // Delta/chevron with swept wings - classic fixed-wing strategic icon
    svgPath: 'M14 3L4 23L14 17L24 23Z',
    labelKey: 'map:tacticalIcon.fixedWing',
    defaultDesignation: 'FW',
  },
  vtol: {
    // Chevron body with small rotor dots at wingtips
    svgPath: [
      'M14 3L4 23L14 17L24 23Z',
      'M5 21m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
      'M23 21m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
    ].join(''),
    labelKey: 'map:tacticalIcon.vtol',
    defaultDesignation: 'VTOL',
  },
  rover: {
    // Rounded rectangle with forward arrow notch - ground unit
    svgPath: 'M8 5L14 2L20 5L20 25L8 25Z',
    labelKey: 'map:tacticalIcon.rover',
    defaultDesignation: 'ROV',
  },
  boat: {
    // Pointed hull shape - naval surface vessel
    svgPath: 'M14 3L6 14L8 25L20 25L22 14Z',
    labelKey: 'map:tacticalIcon.boat',
    defaultDesignation: 'BOAT',
  },
  sub: {
    // Oval hull with periscope tick at top
    svgPath: 'M14 2L14 6M9 7Q4 14 9 23L19 23Q24 14 19 7Z',
    labelKey: 'map:tacticalIcon.sub',
    defaultDesignation: 'SUB',
  },
  antenna: {
    // Diamond - static, no heading rotation
    svgPath: 'M14 3L25 14L14 25L3 14Z',
    labelKey: 'map:tacticalIcon.tracker',
    defaultDesignation: 'ANT',
  },
  unknown: {
    // Circle
    svgPath: 'M14 14m-10 0a10 10 0 1 0 20 0a10 10 0 1 0-20 0',
    labelKey: 'map:tacticalIcon.unknown',
    defaultDesignation: '???',
  },
};

// ── State colors ──────────────────────────────────────────────────────────────

export type VehicleState = 'disarmed' | 'armed' | 'critical';

export interface StateColors {
  fill: string;
  border: string;
  glow: string | null; // CSS animation class name, or null
}

export const STATE_COLORS: Record<VehicleState, StateColors> = {
  disarmed: { fill: '#4ade80', border: '#166534', glow: null },           // green-400 / green-800
  armed:    { fill: '#f97316', border: '#7c2d12', glow: 'tactical-pulse-orange' },
  critical: { fill: '#ef4444', border: '#7f1d1d', glow: 'tactical-pulse-red' },
};

// ── Flight mode color categories ──────────────────────────────────────────────

export type ModeCategory = 'manual' | 'assisted' | 'auto' | 'emergency';

const MODE_CATEGORY_COLORS: Record<ModeCategory, string> = {
  manual:    '#e5e7eb', // gray-200
  assisted:  '#facc15', // yellow-400
  auto:      '#4ade80', // green-400
  emergency: '#f87171', // red-400
};

/**
 * Classify a flight mode string into a color category.
 * Mode names come from ArduPilot telemetry (e.g. "Stabilize", "Guided", "RTL").
 */
/** Category for a mode string (shared by the hex + CSS-var color helpers). */
export function getModeCategory(mode: string): ModeCategory {
  const m = mode.toUpperCase();
  if (m === 'LAND' || m === 'BRAKE' || m === 'SMARTRTL' || m === 'SURFACE') return 'emergency';
  if (m === 'AUTO' || m === 'GUIDED' || m === 'RTL' || m === 'MISSION' || m === 'QRTL') return 'auto';
  if (
    m === 'LOITER' || m === 'ALTHOLD' || m === 'ALT_HOLD' || m === 'POSHOLD' ||
    m === 'POS_HOLD' || m === 'HOLD' || m === 'CIRCLE' || m === 'QLOITER' ||
    m === 'QHOVER' || m === 'CRUISE' || m === 'FBWA' || m === 'FBWB' ||
    m === 'FLYBYWIREA' || m === 'FLYBYWIREB' || m === 'FLOWHOLD'
  ) return 'assisted';
  return 'manual';
}

/**
 * Theme-aware mode color for text ON A SURFACE (fleet cards/lists). Returns a CSS var
 * that resolves bright in dark mode and darker/saturated in light mode, so it stays
 * readable on either background. The map icon uses getModeCategoryColor (bright hex)
 * because its label sits on a fixed dark disc.
 */
export function getModeCategoryVar(mode: string): string {
  return `var(--mode-${getModeCategory(mode)})`;
}

export function getModeCategoryColor(mode: string): string {
  const m = mode.toUpperCase();

  // Emergency
  if (m === 'LAND' || m === 'BRAKE' || m === 'SMARTRTL' || m === 'SURFACE') {
    return MODE_CATEGORY_COLORS.emergency;
  }
  // Auto modes
  if (m === 'AUTO' || m === 'GUIDED' || m === 'RTL' || m === 'MISSION' || m === 'QRTL') {
    return MODE_CATEGORY_COLORS.auto;
  }
  // Assisted modes
  if (
    m === 'LOITER' || m === 'ALTHOLD' || m === 'ALT_HOLD' || m === 'POSHOLD' ||
    m === 'POS_HOLD' || m === 'HOLD' || m === 'CIRCLE' || m === 'QLOITER' ||
    m === 'QHOVER' || m === 'CRUISE' || m === 'FBWA' || m === 'FBWB' ||
    m === 'FLYBYWIREA' || m === 'FLYBYWIREB' || m === 'FLOWHOLD'
  ) {
    return MODE_CATEGORY_COLORS.assisted;
  }
  // Everything else is manual
  return MODE_CATEGORY_COLORS.manual;
}

// ── MAV_TYPE to TacticalVehicleClass mapping ──────────────────────────────────

/**
 * Map raw MAVLink MAV_TYPE to our tactical icon class.
 * More granular than ArduPilotVehicleClass - separates VTOL, boat, antenna.
 */
export function mavTypeToTacticalClass(mavType: number | undefined): TacticalVehicleClass {
  if (mavType === undefined) return 'unknown';
  switch (mavType) {
    // Fixed wing
    case 1:  // FIXED_WING
    case 7:  // AIRSHIP
    case 8:  // FREE_BALLOON
    case 16: // FLAPPING_WING
    case 17: // KITE
    case 28: // PARAFOIL
      return 'plane';
    // VTOL (separate from plane for distinct icon)
    case 19: // VTOL_DUOROTOR
    case 20: // VTOL_QUADROTOR
    case 21: // VTOL_TILTROTOR
    case 22: // VTOL_FIXEDROTOR
    case 23: // VTOL_TAILSITTER
    case 24: // VTOL_TILTWING
    case 25: // VTOL_RESERVED5
      return 'vtol';
    // Multirotor
    case 2:  // QUADROTOR
    case 3:  // COAXIAL
    case 4:  // HELICOPTER
    case 13: // HEXAROTOR
    case 14: // OCTOROTOR
    case 15: // TRICOPTER
    case 29: // DODECAROTOR
    case 35: // DECAROTOR
      return 'copter';
    // Ground
    case 10: // GROUND_ROVER
      return 'rover';
    // Surface boat (split from rover)
    case 11: // SURFACE_BOAT
      return 'boat';
    // Submarine
    case 12: // SUBMARINE
      return 'sub';
    // Antenna tracker
    case 5:  // ANTENNA_TRACKER
      return 'antenna';
    default:
      return 'unknown';
  }
}
