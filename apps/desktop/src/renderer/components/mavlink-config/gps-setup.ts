/**
 * Where a GPS is wired and whether the firmware is set up to talk to it.
 *
 * The question a pilot actually has is "I plugged it in and nothing appeared":
 * answering it means knowing which port carries the GPS protocol, not reading
 * GPS_TYPE in isolation. ArduPilot assigns a protocol per serial port and PX4
 * assigns a port per GPS, so the two firmwares are inverted and both are
 * modelled here.
 */

import { t } from '../../../shared/i18n/index.js';

export type GpsBus = 'serial' | 'can' | 'none';

export interface GpsPortOption {
  /** Human name of the socket on the board. */
  label: string;
  labelKey?: string;
  /** ArduPilot: SERIALn index. PX4: the GPS_n_CONFIG value. */
  value: number;
}

/** ArduPilot SERIALn_PROTOCOL value for a GPS. */
export const AP_PROTOCOL_GPS = 5;
/** ArduPilot GPS_TYPE values used here. */
export const AP_GPS_TYPE_AUTO = 1;
export const AP_GPS_TYPE_UBLOX = 2;
export const AP_GPS_TYPE_DRONECAN = 9;
/** ArduPilot baud code: the parameter is baud/1000 for rates above 1k. */
export const AP_BAUD_230400 = 230;

/**
 * Which socket a SERIALn belongs to is a board convention, not a firmware
 * fact: SERIAL3 is the GPS1 port on Pixhawk-derived carriers and something
 * else on a Matek. So ports are enumerated from the parameters the board
 * actually exposes and labelled by their real name, never guessed.
 */
export function apSerialPorts(
  get: (name: string) => number | undefined,
): Array<{ index: number; protocol: number }> {
  const out: Array<{ index: number; protocol: number }> = [];
  for (let n = 0; n <= 9; n++) {
    const protocol = get(`SERIAL${n}_PROTOCOL`);
    if (protocol === undefined) continue;
    out.push({ index: n, protocol });
  }
  return out;
}

/** Short names for the protocols a pilot is likely to meet on a spare port. */
const AP_PROTOCOL_NAMES: Record<number, string> = {
  [-1]: 'mavlink-config:gpsSetup.protoUnused',
  0: 'mavlink-config:gpsSetup.protoConsole',
  1: 'MAVLink',
  2: 'MAVLink2',
  3: 'FrSky D',
  4: 'FrSky SPort',
  5: 'GPS',
  9: 'mavlink-config:gpsSetup.protoRangefinder',
  10: 'FrSky passthrough',
  11: 'mavlink-config:gpsSetup.protoLidar',
  13: 'mavlink-config:gpsSetup.protoBeacon',
  16: 'mavlink-config:gpsSetup.protoEscTelemetry',
  19: 'mavlink-config:gpsSetup.protoServoBus',
  21: 'mavlink-config:gpsSetup.protoWindVane',
  23: 'mavlink-config:gpsSetup.protoRcIn',
  26: 'RunCam',
  28: 'mavlink-config:gpsSetup.protoScripting',
  29: 'CRSF',
  32: 'MSP',
  36: 'AHRS',
  40: 'AIS',
};

export function apProtocolName(protocol: number): string {
  const name = AP_PROTOCOL_NAMES[protocol];
  if (name === undefined) return t('mavlink-config:gpsSetup.protoN', { n: protocol });
  return name.startsWith('mavlink-config:') ? t(name) : name;
}

export interface ApGpsSetup {
  /**
   * GPS1_TYPE (GPS_TYPE on firmware before the GPS1_ subgroup), or null when
   * the board exposes neither. Null is NOT 0: "we have not been told" must
   * never be reported as "the GPS is disabled".
   */
  type: number | null;
  /** SERIALn indexes currently set to the GPS protocol. */
  gpsPorts: number[];
  /** True when GPS_TYPE asks for DroneCAN. */
  wantsCan: boolean;
  /** True when a CAN port is enabled AND set to DroneCAN. */
  canReady: boolean;
  bus: GpsBus;
  /**
   * Set when the configuration cannot work as it stands, in the pilot's
   * words. Null when nothing is obviously wrong.
   */
  problem: string | null;
}

export function readApGpsSetup(get: (name: string) => number | undefined): ApGpsSetup {
  const type = get('GPS1_TYPE') ?? get('GPS_TYPE') ?? null;
  const gpsPorts: number[] = [];
  for (let n = 0; n <= 8; n++) {
    if (get(`SERIAL${n}_PROTOCOL`) === AP_PROTOCOL_GPS) gpsPorts.push(n);
  }
  const wantsCan = type === AP_GPS_TYPE_DRONECAN;
  const canReady = (get('CAN_P1_DRIVER') ?? 0) > 0 && (get('CAN_D1_PROTOCOL') ?? 0) === 1;

  let bus: GpsBus = 'none';
  if (wantsCan) bus = 'can';
  else if (type !== 0 && gpsPorts.length > 0) bus = 'serial';

  let problem: string | null = null;
  if (type === 0) {
    problem = t('mavlink-config:gpsSetup.problemTypeNone');
  } else if (wantsCan && !canReady) {
    problem = t('mavlink-config:gpsSetup.problemCanDisabled');
  } else if (!wantsCan && gpsPorts.length === 0) {
    problem = t('mavlink-config:gpsSetup.problemNoSerial');
  }

  return { type, gpsPorts, wantsCan, canReady, bus, problem };
}

/**
 * Parameter writes that put an ArduPilot GPS on a serial port. The type
 * parameter was renamed when GPS moved to the GPS1_ subgroup, so both names
 * are offered and the caller writes whichever the board actually has.
 */
export function apSerialGpsWrites(serialIndex: number): Array<{ name: string; value: number }> {
  return [
    { name: `SERIAL${serialIndex}_PROTOCOL`, value: AP_PROTOCOL_GPS },
    { name: `SERIAL${serialIndex}_BAUD`, value: AP_BAUD_230400 },
    { name: 'GPS1_TYPE', value: AP_GPS_TYPE_AUTO },
    { name: 'GPS_TYPE', value: AP_GPS_TYPE_AUTO },
  ];
}

/** Parameter writes that put an ArduPilot GPS on DroneCAN. */
export function apCanGpsWrites(): Array<{ name: string; value: number }> {
  return [
    { name: 'CAN_P1_DRIVER', value: 1 },
    { name: 'CAN_D1_PROTOCOL', value: 1 },
    { name: 'CAN_P1_BITRATE', value: 1000000 },
    { name: 'GPS1_TYPE', value: AP_GPS_TYPE_DRONECAN },
    { name: 'GPS_TYPE', value: AP_GPS_TYPE_DRONECAN },
  ];
}

// ── PX4 ──────────────────────────────────────────────────────────────────────

/**
 * PX4 GPS_n_CONFIG values: the port a GPS is attached to. 0 disables the
 * instance; the rest are PX4's serial-port ids.
 */
export const PX4_GPS_PORTS: GpsPortOption[] = [
  { label: 'Disabled', labelKey: 'mavlink-config:gpsSetup.portDisabled', value: 0 }, // i18n-exempt
  { label: 'GPS1', value: 201 },
  { label: 'GPS2', value: 202 },
  { label: 'TELEM1', value: 101 },
  { label: 'TELEM2', value: 102 },
];

export interface Px4GpsSetup {
  /** GPS_1_CONFIG: which port instance 1 is on, 0 = off. */
  port: number;
  /** SER_GPS1_BAUD, 0 = auto. */
  baud: number;
  /** UAVCAN_ENABLE > 0 means DroneCAN is running. */
  canEnabled: boolean;
  bus: GpsBus;
  problem: string | null;
}

export function readPx4GpsSetup(get: (name: string) => number | undefined): Px4GpsSetup {
  const port = get('GPS_1_CONFIG') ?? 0;
  const baud = get('SER_GPS1_BAUD') ?? 0;
  const canEnabled = (get('UAVCAN_ENABLE') ?? 0) > 0;

  let bus: GpsBus = 'none';
  if (port > 0) bus = 'serial';
  else if (canEnabled) bus = 'can';

  let problem: string | null = null;
  if (port === 0 && !canEnabled) {
    problem = t('mavlink-config:gpsSetup.problemPx4NoGps');
  }

  return { port, baud, canEnabled, bus, problem };
}

/** Parameter writes that put a PX4 GPS on a serial port. */
export function px4SerialGpsWrites(portValue: number): Array<{ name: string; value: number }> {
  return [
    { name: 'GPS_1_CONFIG', value: portValue },
    { name: 'SER_GPS1_BAUD', value: 0 },
  ];
}

/** Parameter writes that enable DroneCAN on PX4 (sensors, not dynamic node id). */
export function px4CanGpsWrites(): Array<{ name: string; value: number }> {
  return [{ name: 'UAVCAN_ENABLE', value: 2 }];
}

/** Port label for a value, for whichever firmware's list is passed. */
export function portLabel(options: GpsPortOption[], value: number): string {
  const option = options.find((o) => o.value === value);
  if (!option) return t('mavlink-config:gpsSetup.portN', { value });
  return option.labelKey ? t(option.labelKey) : option.label;
}

/**
 * The socket a SERIALn is usually wired to, for the boards where the mapping
 * is a well-known convention. Shown as a hint beside the real name, never in
 * place of it, because a board is free to wire it differently.
 */
export function apSocketHint(index: number): string | null {
  const sockets: Record<number, string> = { 3: 'GPS1', 4: 'GPS2', 1: 'TELEM1', 2: 'TELEM2' };
  const socket = sockets[index];
  if (socket) return t('mavlink-config:gpsSetup.socketHint', { socket });
  return null;
}
