/**
 * Parameter Metadata Types
 * Structures for ArduPilot parameter definitions from XML
 */

export interface ParameterMetadata {
  name: string;
  humanName: string;
  description: string;
  range?: {
    min: number;
    max: number;
  };
  units?: string;
  values?: Record<number, string>; // For enum-like params (e.g., 0: "Disabled", 1: "Enabled")
  increment?: number;
  rebootRequired?: boolean;
  readOnly?: boolean;
  bitmask?: Record<number, string>; // For bitmask params
}

export type VehicleType = 'copter' | 'plane' | 'rover' | 'sub' | 'tracker';

export interface ParameterMetadataStore {
  [paramName: string]: ParameterMetadata;
}

// ArduPilot parameter XML URLs (apm.pdef.xml format)
export const PARAMETER_METADATA_URLS: Record<VehicleType, string> = {
  copter: 'https://autotest.ardupilot.org/Parameters/ArduCopter/apm.pdef.xml',
  plane: 'https://autotest.ardupilot.org/Parameters/ArduPlane/apm.pdef.xml',
  rover: 'https://autotest.ardupilot.org/Parameters/Rover/apm.pdef.xml',
  sub: 'https://autotest.ardupilot.org/Parameters/ArduSub/apm.pdef.xml',
  tracker: 'https://autotest.ardupilot.org/Parameters/AntennaTracker/apm.pdef.xml',
};

// Human-facing ArduPilot docs use a different slug for tracker.
// (https://ardupilot.org/tracker/... returns 404 — the live path is antennatracker)
const DOCS_SLUG: Record<VehicleType, string> = {
  copter: 'copter',
  plane: 'plane',
  rover: 'rover',
  sub: 'sub',
  tracker: 'antennatracker',
};

/** Title-case segment used in parameters-*-stable-V*.html filenames. */
const DOCS_TITLE: Record<VehicleType, string> = {
  copter: 'Copter',
  plane: 'Plane',
  rover: 'Rover',
  sub: 'Sub',
  tracker: 'AntennaTracker',
};

/** Map vehicle type to ardupilot.org path segment. */
export function vehicleTypeToDocsSlug(vehicleType: VehicleType): string {
  return DOCS_SLUG[vehicleType];
}

/** Title-case vehicle name for versioned parameter doc filenames. */
export function vehicleTypeToDocsTitle(vehicleType: VehicleType): string {
  return DOCS_TITLE[vehicleType];
}

/**
 * Sphinx/RTD section id for a param on ardupilot.org parameter pages.
 * `AHRS_GPS_MINSATS` → `ahrs-gps-minsats`
 */
export function paramNameToDocFragment(paramId: string): string {
  return paramId.trim().toLowerCase().replace(/_/g, '-');
}

/**
 * True when a version string looks like a stable release suitable for Sphinx
 * `parameters-*-stable-V*.*.*.html` pages (full three-part semver, not pre-release).
 */
export function isStableDocsVersionTag(tag: string): boolean {
  // Sphinx stable pages use full Vmajor.minor.patch (e.g. V4.5.7). Two-part
  // tags (V4.6) and pre-release markers commonly 404.
  return /^V\d+\.\d+\.\d+$/i.test(tag.trim());
}

/**
 * MAVLink AUTOPILOT_VERSION firmware type byte: official/stable release.
 * @see https://mavlink.io/en/messages/common.html#FIRMWARE_VERSION_TYPE
 */
export const FIRMWARE_VERSION_TYPE_OFFICIAL = 255;

/**
 * Derive a docs-facing firmware version tag from the packed AUTOPILOT_VERSION
 * `flight_sw_version` field (major|minor|patch|type as big-endian u32 layout on wire,
 * decoded LE in host view the same way ArduDeck main process does).
 *
 * Only official/stable (type byte 255) yields a tag for versioned Sphinx pages;
 * dev/beta/rc return undefined so callers use unversioned parameters.html.
 */
export function firmwareVersionTagFromFlightSwVersion(
  flightSwVersion: number,
): string | undefined {
  if (!flightSwVersion || flightSwVersion <= 0) return undefined;
  const major = (flightSwVersion >>> 24) & 0xff;
  const minor = (flightSwVersion >>> 16) & 0xff;
  const patch = (flightSwVersion >>> 8) & 0xff;
  const vType = flightSwVersion & 0xff;
  if (vType !== FIRMWARE_VERSION_TYPE_OFFICIAL) return undefined;
  const tag = `V${major}.${minor}.${patch}`;
  return isStableDocsVersionTag(tag) ? tag : undefined;
}

/** Pack major.minor.patch + type into the AUTOPILOT_VERSION flight_sw_version layout (for tests). */
export function packFlightSwVersion(
  major: number,
  minor: number,
  patch: number,
  vType: number,
): number {
  return (
    ((major & 0xff) << 24) |
    ((minor & 0xff) << 16) |
    ((patch & 0xff) << 8) |
    (vType & 0xff)
  ) >>> 0;
}

/**
 * Extract a stable version tag (e.g. V4.6.3) from AUTOPILOT_VERSION / display strings.
 * Returns null when no stable three-part semver is present (caller uses unversioned parameters.html).
 *
 * Note: ardupilot.org has no `parameters-*-stable-latest.html` page — only specific V*.*.*
 * builds or the live `parameters.html` index. Dev/beta/rc strings intentionally return null.
 */
export function parseFirmwareVersionTag(
  firmwareVersionString: string | undefined | null,
): string | null {
  if (!firmwareVersionString || !firmwareVersionString.trim()) return null;
  const s = firmwareVersionString.trim();

  // Pre-release / custom builds: force unversioned parameters.html (Sphinx stable pages 404)
  if (/\b(dev|alpha|beta|rc\d*|devel|custom)\b/i.test(s)) return null;
  if (/V?\d+\.\d+\.\d+[-+][A-Za-z0-9]/i.test(s)) return null; // e.g. 4.5.7-dev, V4.6.0-rc1

  // Prefer explicit V-prefixed full three-part semver (ArduCopter V4.6.3)
  const vPrefixed = s.match(/\bV(\d+\.\d+\.\d+)\b/i);
  if (vPrefixed) return `V${vPrefixed[1]}`;

  // Plain three-part semver (APM:Copter 4.5.7). Require patch — V4.6 alone is not a Sphinx page.
  const plain = s.match(/(?:^|[\s:])(\d+\.\d+\.\d+)(?:\b|$)/);
  if (plain) return `V${plain[1]}`;

  return null;
}

/**
 * Official ArduPilot parameter docs URL for a single parameter.
 *
 * Versioned (when known stable): `…/parameters-Copter-stable-V4.5.7.html#ahrs-gps-minsats`
 * Fallback (dev / unknown / incomplete version): `…/parameters.html#ahrs-gps-minsats`
 *
 * @param versionTag Optional firmware version (e.g. "V4.5.7", "4.5.7"). Pass null/omit for unversioned.
 */
export function getParameterDocsUrl(
  vehicleType: VehicleType,
  paramId: string,
  versionTag: string | null = null,
): string {
  const slug = DOCS_SLUG[vehicleType];
  const title = DOCS_TITLE[vehicleType];
  const fragment = paramNameToDocFragment(paramId);

  // Never emit parameters-*-stable-latest.html — only specific V*.*.* or unversioned parameters.html
  let ver: string | null = null;
  if (versionTag && versionTag !== 'latest') {
    const normalized = versionTag.startsWith('V') || versionTag.startsWith('v')
      ? `V${versionTag.slice(1)}`
      : `V${versionTag}`;
    if (isStableDocsVersionTag(normalized)) ver = normalized;
  }

  if (ver) {
    return `https://ardupilot.org/${slug}/docs/parameters-${title}-stable-${ver}.html#${fragment}`;
  }
  return `https://ardupilot.org/${slug}/docs/parameters.html#${fragment}`;
}

/**
 * Resolve ArduPilot docs vehicle + version from connection/offline context.
 * Returns null for non-ArduPilot (MSP, PX4, unknown) so UI can hide docs links.
 */
function isArduPilotAutopilotLabel(autopilot: string | null | undefined): boolean {
  if (!autopilot) return false;
  return /ardupilot/i.test(autopilot);
}

function isNonArduPilotAutopilotLabel(autopilot: string | null | undefined): boolean {
  if (!autopilot || autopilot === 'Unknown') return false;
  return !isArduPilotAutopilotLabel(autopilot);
}

export function resolveArduPilotDocsContext(opts: {
  protocol?: string | null;
  autopilot?: string | null;
  mavType?: number | null;
  vehicleType?: string | null;
  firmwareVersion?: string | null;
  offlineVehicleType?: string | null;
}): { vehicleType: VehicleType; versionTag: string | null } | null {
  const { protocol, autopilot, mavType, vehicleType, firmwareVersion, offlineVehicleType } = opts;

  // MSP / Betaflight / iNav are not ArduPilot docs
  if (protocol === 'msp') return null;

  // Non-ArduPilot autopilot labels (PX4, BTFL, …) never get ardupilot.org param pages,
  // even when protocol is missing or not yet classified.
  if (isNonArduPilotAutopilotLabel(autopilot)) return null;

  // Require a positive ArduPilot context signal before emitting docs links.
  // Bare vehicleType alone (without offline file / mavlink / ArduPilot autopilot)
  // is not enough — avoids inappropriate docs for generic "copter" labels.
  const offlineResolved = offlineVehicleType
    ? vehicleNameToVehicleType(offlineVehicleType)
    : null;
  const hasApContext =
    offlineResolved != null ||
    protocol === 'mavlink' ||
    isArduPilotAutopilotLabel(autopilot);
  if (!hasApContext) return null;

  // Prefer offline vehicle type when explicitly provided (offline editor),
  // so a stale live connection vehicleType cannot override the file's vehicle.
  let resolved: VehicleType | null = offlineResolved;
  if (!resolved && mavType != null) {
    resolved = mavTypeToVehicleTypeStrict(mavType);
  }
  if (!resolved) {
    resolved = vehicleNameToVehicleType(vehicleType);
  }
  if (!resolved) return null;

  return {
    vehicleType: resolved,
    versionTag: parseFirmwareVersionTag(firmwareVersion),
  };
}

/**
 * Parse a vehicle display/header name into VehicleType (null if unknown).
 * Only maps known ArduPilot vehicle families / MAV type display names — never invents a default.
 */
export function vehicleNameToVehicleType(name: string | null | undefined): VehicleType | null {
  if (!name) return null;
  const lower = name.trim().toLowerCase();
  // Reject non-ArduPilot FC labels that might appear in headers/connection state
  if (
    /^(btfl|inav|clfl|betaflight|px4|emuflight|arducopter-msp)/i.test(lower) ||
    lower.includes('betaflight') ||
    lower.includes('px4')
  ) {
    return null;
  }

  // Exact VehicleType keys
  if (lower === 'copter' || lower === 'plane' || lower === 'rover' || lower === 'sub' || lower === 'tracker') {
    return lower;
  }

  // Common MAV_TYPE / heartbeat display names used in save headers and UI
  if (
    lower.includes('copter') ||
    lower === 'quadcopter' ||
    lower === 'quadrotor' ||
    lower === 'hexarotor' ||
    lower === 'hexa' ||
    lower === 'octorotor' ||
    lower === 'octo' ||
    lower === 'tricopter' ||
    lower === 'tri' ||
    lower === 'dodecarotor' ||
    lower === 'decarotor' ||
    lower === 'helicopter' ||
    lower === 'coaxial'
  ) {
    return 'copter';
  }
  if (
    lower.includes('plane') ||
    lower.includes('fixed') ||
    lower === 'fixed-wing' ||
    lower === 'fixed wing' ||
    lower.includes('vtol') ||
    lower === 'airship' ||
    lower === 'flapping wing' ||
    lower === 'kite' ||
    lower === 'parafoil'
  ) {
    return 'plane';
  }
  if (lower.includes('rover') || lower.includes('boat') || lower === 'ground rover' || lower === 'surface boat') {
    return 'rover';
  }
  if (lower.includes('sub') || lower === 'submarine') return 'sub';
  if (lower.includes('tracker') || lower === 'antenna tracker' || lower === 'antennatracker') {
    return 'tracker';
  }

  const mav = vehicleTypeToMavType(name);
  return mav != null ? mavTypeToVehicleTypeStrict(mav) : null;
}

/** Map MAV_TYPE to VehicleType without defaulting unknown types to copter. */
function mavTypeToVehicleTypeStrict(mavType: number): VehicleType | null {
  switch (mavType) {
    case 1: case 7: case 8: case 16: case 17: case 19: case 20: case 21:
    case 22: case 23: case 24: case 25: case 28:
      return 'plane';
    case 2: case 3: case 4: case 13: case 14: case 15: case 29: case 35:
      return 'copter';
    case 10: case 11:
      return 'rover';
    case 12:
      return 'sub';
    case 5:
      return 'tracker';
    default:
      return null;
  }
}

// Map MAVLink MAV_TYPE to our VehicleType
/**
 * Validation result for parameter values
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  warning?: string;
}

/**
 * Validate a parameter value against its metadata
 */
export function validateParameterValue(
  value: number,
  metadata: ParameterMetadata | undefined
): ValidationResult {
  if (!metadata) {
    // No metadata available - allow any value
    return { valid: true };
  }

  // Bitmask params: validate value is non-negative integer, skip enum check
  if (metadata.bitmask && Object.keys(metadata.bitmask).length > 0) {
    if (value < 0 || !Number.isInteger(value)) {
      return {
        valid: false,
        error: 'Bitmask value must be a non-negative integer',
      };
    }
    return { valid: true };
  }

  // Check if value is in allowed values list (enum-like params)
  if (metadata.values && Object.keys(metadata.values).length > 0) {
    const allowedValues = Object.keys(metadata.values).map(Number);
    if (!allowedValues.includes(value)) {
      // Warn but don't block - ArduPilot may accept values not in metadata
      return {
        valid: true,
        warning: `Value ${value} is not in the known values list`,
      };
    }
    return { valid: true };
  }

  // Check range bounds
  if (metadata.range) {
    const { min, max } = metadata.range;
    if (value < min || value > max) {
      return {
        valid: false,
        error: `Value must be between ${min} and ${max}${metadata.units ? ` ${metadata.units}` : ''}`,
      };
    }
  }

  // Check increment (warn but don't block)
  if (metadata.increment && metadata.increment > 0) {
    const remainder = Math.abs(value % metadata.increment);
    if (remainder > 0.0001 && Math.abs(remainder - metadata.increment) > 0.0001) {
      return {
        valid: true,
        warning: `Value should be a multiple of ${metadata.increment}`,
      };
    }
  }

  return { valid: true };
}

// Map vehicle type string (from file header) to a representative MAV_TYPE number for metadata fetching
export function vehicleTypeToMavType(vehicleType: string): number | null {
  switch (vehicleType.toLowerCase()) {
    case 'copter':
    case 'arducopter':
      return 2; // MAV_TYPE_QUADROTOR
    case 'plane':
    case 'arduplane':
      return 1; // MAV_TYPE_FIXED_WING
    case 'rover':
    case 'ardurover':
      return 10; // MAV_TYPE_GROUND_ROVER
    case 'sub':
    case 'ardusub':
      return 12; // MAV_TYPE_SUBMARINE
    case 'tracker':
    case 'antennatracker':
      return 5; // MAV_TYPE_ANTENNA_TRACKER
    default:
      return null;
  }
}

// Map MAVLink MAV_TYPE to our VehicleType
export function mavTypeToVehicleType(mavType: number): VehicleType | null {
  // MAV_TYPE values from MAVLink
  switch (mavType) {
    case 1: // MAV_TYPE_FIXED_WING
    case 7: // MAV_TYPE_AIRSHIP
    case 8: // MAV_TYPE_FREE_BALLOON
    case 16: // MAV_TYPE_FLAPPING_WING
    case 17: // MAV_TYPE_KITE
    case 19: // MAV_TYPE_VTOL_DUOROTOR
    case 20: // MAV_TYPE_VTOL_QUADROTOR
    case 21: // MAV_TYPE_VTOL_TILTROTOR
    case 22: // MAV_TYPE_VTOL_FIXEDROTOR
    case 23: // MAV_TYPE_VTOL_TAILSITTER
    case 24: // MAV_TYPE_VTOL_TILTWING
    case 25: // MAV_TYPE_VTOL_RESERVED5
    case 28: // MAV_TYPE_PARAFOIL
      return 'plane';
    case 2: // MAV_TYPE_QUADROTOR
    case 3: // MAV_TYPE_COAXIAL
    case 4: // MAV_TYPE_HELICOPTER
    case 13: // MAV_TYPE_HEXAROTOR
    case 14: // MAV_TYPE_OCTOROTOR
    case 15: // MAV_TYPE_TRICOPTER
    case 29: // MAV_TYPE_DODECAROTOR
    case 35: // MAV_TYPE_DECAROTOR
      return 'copter';
    case 10: // MAV_TYPE_GROUND_ROVER
    case 11: // MAV_TYPE_SURFACE_BOAT
      return 'rover';
    case 12: // MAV_TYPE_SUBMARINE
      return 'sub';
    case 5: // MAV_TYPE_ANTENNA_TRACKER
      return 'tracker';
    default:
      // Default to copter for unknown types (most comprehensive param set)
      return 'copter';
  }
}
