// Nav config is all named settings (configurator tabs/advanced_tuning.html); GPS protocol/SBAS
// go through MSPV2_INAV_MISC like tabs/gps.js saveMiscV2, the rest through settings.

import type { MSPGpsConfig, MSPNavConfig } from './config.js';

/** A setting value as returned by MSP2_COMMON_SETTING: enum/bool settings come back as their table name. */
export type InavSettingValue = string | number | null | undefined;

type NavNumericField = Exclude<
  keyof MSPNavConfig,
  'rthAltControlMode' | 'userControlMode' | 'useThrottleMidForAlthold' | 'waypointSafeAlt'
>;

/** Numeric nav fields: renderer units equal the INAV setting units (cm, cm/s, deg, us). */
export const INAV_NAV_NUMERIC_SETTINGS: Record<NavNumericField, string> = {
  maxNavigationSpeed: 'nav_auto_speed',
  maxClimbRate: 'nav_mc_auto_climb_rate',
  maxManualSpeed: 'nav_manual_speed',
  maxManualClimbRate: 'nav_mc_manual_climb_rate',
  landDescendRate: 'nav_land_maxalt_vspd',
  landSlowdownMinAlt: 'nav_land_slowdown_minalt',
  landSlowdownMaxAlt: 'nav_land_slowdown_maxalt',
  emergencyDescentRate: 'nav_emerg_landing_speed',
  rthAbortThreshold: 'nav_rth_abort_threshold',
  rthAltitude: 'nav_rth_altitude',
  waypointRadius: 'nav_wp_radius',
  maxBankAngle: 'nav_mc_bank_angle',
  hoverThrottle: 'nav_mc_hover_thr',
};

/** Index = the number the renderer uses (NAV_RTH_ALT_MODE). */
export const INAV_RTH_ALT_MODE_NAMES = ['CURRENT', 'EXTRA', 'FIXED', 'MAX', 'AT_LEAST'] as const;
export const INAV_USER_CONTROL_MODE_NAMES = ['ATTI', 'CRUISE'] as const;

export const INAV_NAV_ENUM_SETTINGS = {
  rthAltControlMode: 'nav_rth_alt_mode',
  userControlMode: 'nav_user_control_mode',
  useThrottleMidForAlthold: 'nav_mc_althold_throttle',
} as const;

/** Every setting name read for the nav config. */
export const INAV_NAV_SETTING_NAMES: string[] = [
  ...Object.values(INAV_NAV_NUMERIC_SETTINGS),
  ...Object.values(INAV_NAV_ENUM_SETTINGS),
];

/** Fields of MSPNavConfig with no INAV setting behind them. */
export const INAV_NAV_UNMAPPED_FIELDS: Array<keyof MSPNavConfig> = ['waypointSafeAlt'];

function nameIndex(names: readonly string[], value: InavSettingValue): number | undefined {
  if (typeof value !== 'string') return undefined;
  const idx = names.indexOf(value);
  return idx >= 0 ? idx : -1;
}

/** Unknown enum values are reported as -1 so a save leaves them untouched. */
export function navConfigFromSettings(values: Record<string, InavSettingValue>): Partial<MSPNavConfig> {
  const config: Partial<MSPNavConfig> = {};

  for (const [field, name] of Object.entries(INAV_NAV_NUMERIC_SETTINGS) as Array<[NavNumericField, string]>) {
    const v = values[name];
    if (typeof v === 'number') config[field] = v;
  }

  const rth = nameIndex(INAV_RTH_ALT_MODE_NAMES, values[INAV_NAV_ENUM_SETTINGS.rthAltControlMode]);
  if (rth !== undefined) config.rthAltControlMode = rth;

  const ucm = nameIndex(INAV_USER_CONTROL_MODE_NAMES, values[INAV_NAV_ENUM_SETTINGS.userControlMode]);
  if (ucm !== undefined) config.userControlMode = ucm;

  const thr = values[INAV_NAV_ENUM_SETTINGS.useThrottleMidForAlthold];
  if (typeof thr === 'string') config.useThrottleMidForAlthold = thr === 'MID_STICK';

  return config;
}

/** Only changed settings are written; `unsupported` lists fields the FC cannot take. */
export function navConfigToSettingWrites(
  config: Partial<MSPNavConfig>,
  current: Record<string, InavSettingValue>,
): { writes: Record<string, string | number>; unsupported: string[] } {
  const writes: Record<string, string | number> = {};
  const unsupported: string[] = [];

  for (const [field, name] of Object.entries(INAV_NAV_NUMERIC_SETTINGS) as Array<[NavNumericField, string]>) {
    const v = config[field];
    if (v === undefined || v === null) continue;
    if (current[name] === null || current[name] === undefined) {
      unsupported.push(field);
      continue;
    }
    const rounded = Math.round(Number(v));
    if (current[name] !== rounded) writes[name] = rounded;
  }

  const enumWrite = (
    field: keyof MSPNavConfig,
    name: string,
    names: readonly string[],
  ) => {
    const v = config[field];
    if (typeof v !== 'number' || v < 0) return;
    const target = names[v];
    if (!target) {
      unsupported.push(field);
      return;
    }
    if (current[name] === null || current[name] === undefined) {
      unsupported.push(field);
      return;
    }
    if (current[name] !== target) writes[name] = target;
  };
  enumWrite('rthAltControlMode', INAV_NAV_ENUM_SETTINGS.rthAltControlMode, INAV_RTH_ALT_MODE_NAMES);
  enumWrite('userControlMode', INAV_NAV_ENUM_SETTINGS.userControlMode, INAV_USER_CONTROL_MODE_NAMES);

  const mid = config.useThrottleMidForAlthold;
  const thrName = INAV_NAV_ENUM_SETTINGS.useThrottleMidForAlthold;
  const thrCurrent = current[thrName];
  if (typeof mid === 'boolean' && typeof thrCurrent === 'string') {
    // false only moves off MID_STICK; it must not clobber HOVER.
    if (mid && thrCurrent !== 'MID_STICK') writes[thrName] = 'MID_STICK';
    if (!mid && thrCurrent === 'MID_STICK') writes[thrName] = 'STICK';
  }

  return { writes, unsupported };
}

// =============================================================================
// GPS
// =============================================================================

/** gps_type index in MSPV2_INAV_MISC, from inav-configurator js/fc.js getGpsProtocols(). */
export const INAV_GPS_PROTOCOLS = ['UBLOX', 'MSP', 'FAKE'] as const;
/** gps_ubx_sbas index in MSPV2_INAV_MISC, from inav-configurator js/fc.js getGpsSbasProviders(). */
export const INAV_GPS_SBAS = ['AUTO', 'EGNOS', 'WAAS', 'MSAS', 'GAGAN', 'SPAN', 'NONE'] as const;

/** Renderer provider numbers (GPS_PROVIDER): 0 NMEA, 1 UBLOX, 2 MSP, 3 FAKE. */
const RENDERER_PROVIDERS = ['NMEA', 'UBLOX', 'MSP', 'FAKE'] as const;
/** Renderer SBAS numbers (GPS_SBAS_MODE) 0..5; 6 is used for SouthPAN, which the renderer has no slot for. */
const RENDERER_SBAS = ['AUTO', 'EGNOS', 'WAAS', 'MSAS', 'GAGAN', 'NONE', 'SPAN'] as const;

export const INAV_MISC_GPS_TYPE_OFFSET = 10;
export const INAV_MISC_GPS_SBAS_OFFSET = 12;

export const INAV_GPS_SETTINGS = {
  ubloxUseGalileo: 'gps_ublox_use_galileo',
  autoConfig: 'gps_auto_config',
  autoBaud: 'gps_auto_baud',
} as const;

export const INAV_GPS_SETTING_NAMES: string[] = Object.values(INAV_GPS_SETTINGS);

export function inavGpsTypeToRenderer(fcIndex: number): number {
  const name = INAV_GPS_PROTOCOLS[fcIndex];
  return name ? RENDERER_PROVIDERS.indexOf(name) : -1;
}

export function rendererGpsProviderToInav(provider: number): number {
  const name = RENDERER_PROVIDERS[provider];
  return name ? (INAV_GPS_PROTOCOLS as readonly string[]).indexOf(name) : -1;
}

export function inavSbasToRenderer(fcIndex: number): number {
  const name = INAV_GPS_SBAS[fcIndex];
  return name ? RENDERER_SBAS.indexOf(name) : -1;
}

export function rendererSbasToInav(sbas: number): number {
  const name = RENDERER_SBAS[sbas];
  return name ? (INAV_GPS_SBAS as readonly string[]).indexOf(name) : -1;
}

export function gpsConfigFromInav(
  misc: Uint8Array,
  values: Record<string, InavSettingValue>,
): MSPGpsConfig | null {
  if (misc.length <= INAV_MISC_GPS_SBAS_OFFSET) return null;
  const sbasRaw = misc[INAV_MISC_GPS_SBAS_OFFSET]!;
  const sbasSigned = sbasRaw > 127 ? sbasRaw - 256 : sbasRaw;
  return {
    provider: inavGpsTypeToRenderer(misc[INAV_MISC_GPS_TYPE_OFFSET]!),
    sbasMode: inavSbasToRenderer(sbasSigned),
    ubloxUseGalileo: values[INAV_GPS_SETTINGS.ubloxUseGalileo] === 'ON',
    autoConfig: values[INAV_GPS_SETTINGS.autoConfig] === 'ON',
    autoBaud: values[INAV_GPS_SETTINGS.autoBaud] === 'ON',
    // INAV has no "set home once" setting.
    homePointOnce: false,
  };
}

/** `misc` is the patched SET_MISC payload, or null when protocol and SBAS are unchanged. */
export function planInavGpsWrite(
  config: MSPGpsConfig,
  currentMisc: Uint8Array,
  current: Record<string, InavSettingValue>,
): { misc: Uint8Array | null; writes: Record<string, string>; unsupported: string[] } {
  const unsupported: string[] = [];
  const writes: Record<string, string> = {};
  let misc: Uint8Array | null = null;

  if (currentMisc.length <= INAV_MISC_GPS_SBAS_OFFSET) {
    return { misc: null, writes, unsupported: ['provider', 'sbasMode'] };
  }

  const reported = gpsConfigFromInav(currentMisc, current)!;
  let gpsType = currentMisc[INAV_MISC_GPS_TYPE_OFFSET]!;
  let sbas = currentMisc[INAV_MISC_GPS_SBAS_OFFSET]!;

  if (config.provider !== reported.provider) {
    const idx = rendererGpsProviderToInav(config.provider);
    if (idx < 0) unsupported.push('provider');
    else gpsType = idx;
  }
  if (config.sbasMode !== reported.sbasMode) {
    const idx = rendererSbasToInav(config.sbasMode);
    if (idx < 0) unsupported.push('sbasMode');
    else sbas = idx & 0xff;
  }
  if (gpsType !== currentMisc[INAV_MISC_GPS_TYPE_OFFSET] || sbas !== currentMisc[INAV_MISC_GPS_SBAS_OFFSET]) {
    misc = new Uint8Array(currentMisc);
    misc[INAV_MISC_GPS_TYPE_OFFSET] = gpsType;
    misc[INAV_MISC_GPS_SBAS_OFFSET] = sbas;
  }

  for (const [field, name] of Object.entries(INAV_GPS_SETTINGS) as Array<[keyof typeof INAV_GPS_SETTINGS, string]>) {
    const want = config[field] ? 'ON' : 'OFF';
    const have = current[name];
    if (have === null || have === undefined) {
      if (config[field]) unsupported.push(field);
      continue;
    }
    if (have !== want) writes[name] = want;
  }

  if (config.homePointOnce) unsupported.push('homePointOnce');

  return { misc, writes, unsupported };
}
