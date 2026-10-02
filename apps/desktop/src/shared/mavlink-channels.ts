import { t } from './i18n/index.js';

/**
 * Which stream-rate parameters belong to which serial port.
 *
 * ArduPilot numbers MAVLink channels by the ORDER of the serial ports set to
 * MAVLink, not by the port number: if SERIAL7 is the only MAVLink port it is
 * channel 0 and its stream rates live in SR0_*. Pilots lose hours to that, so
 * the mapping is computed from the vehicle's own parameters and put on screen
 * instead of being folklore.
 *
 * The rate parameter prefix is likewise resolved against the parameter table
 * the vehicle actually reported (newer firmware carries MAVn_*, older SRn_*),
 * never assumed from a version number.
 */

/** SERIALn_PROTOCOL values that make a port a MAVLink channel. */
const MAVLINK_PROTOCOLS = new Set([1, 2]);

/** ArduPilot's SERIALn_BAUD codes (same table the Serial Ports tab shows). */
const BAUD_CODES: Record<number, number> = {
  1: 1200, 2: 2400, 4: 4800, 9: 9600, 19: 19200, 38: 38400, 57: 57600,
  111: 111100, 115: 115200, 230: 230400, 256: 256000, 460: 460800,
  500: 500000, 921: 921600, 1500: 1500000, 2000: 2000000,
};

const PORT_LABELS: Record<number, string> = {
  0: 'USB', 1: 'TELEM1', 2: 'TELEM2', 3: 'GPS1', 4: 'GPS2',
  5: 'SERIAL5', 6: 'SERIAL6', 7: 'SERIAL7',
};

/** Highest SERIALn index ArduPilot exposes. */
const MAX_SERIAL = 8;

export interface MavlinkLink {
  /** SERIALn port index. */
  serial: number;
  /** MAVLink channel: the number in SRn_/MAVn_. */
  channel: number;
  /** 1 = MAVLink1, 2 = MAVLink2. */
  protocol: number;
  /** Resolved bits per second, or null when the port has no baud parameter. */
  baud: number | null;
  /** "TELEM1", "USB", ... */
  label: string;
}

export type ParamLookup = (name: string) => number | undefined;

/** Build a lookup over any map-like parameter collection. */
export function paramLookup(params: Map<string, { value: number }>): ParamLookup {
  return (name) => params.get(name)?.value;
}

/**
 * Every MAVLink-capable serial port with the channel ArduPilot gives it.
 * Ports are enumerated in index order, which is the order the channels are
 * assigned in.
 */
export function mavlinkLinks(get: ParamLookup): MavlinkLink[] {
  const links: MavlinkLink[] = [];
  for (let serial = 0; serial < MAX_SERIAL; serial++) {
    const protocol = get(`SERIAL${serial}_PROTOCOL`);
    if (protocol === undefined || !MAVLINK_PROTOCOLS.has(protocol)) continue;
    const code = get(`SERIAL${serial}_BAUD`);
    links.push({
      serial,
      channel: links.length,
      protocol,
      baud: code === undefined ? null : (BAUD_CODES[code] ?? code),
      label: PORT_LABELS[serial] ?? `SERIAL${serial}`,
    });
  }
  return links;
}

/** A stream group, named for what the pilot sees rather than its parameter. */
export interface RateGroup {
  id: string;
  /** Parameter suffix, e.g. "EXTRA1". */
  suffix: string;
  label: string;
  /** What it actually turns on, shown when the row is expanded. */
  messages: string[];
  /** MAVLink ids of those messages, for the session-only "Try now" path. */
  msgIds: number[];
  /** Bytes on the wire for one cycle of the group, MAVLink2 framing. */
  bytesPerCycle: number;
  /** Rates above this are pointless for the messages involved. */
  maxHz: number;
}

/**
 * Byte costs are payload + 12 bytes of MAVLink2 header + 2 bytes CRC per
 * message, summed over the messages a group carries.
 */
export const RATE_GROUPS: RateGroup[] = [
  {
    id: 'attitude',
    suffix: 'EXTRA1',
    label: 'Horizon smoothness', // i18n-exempt
    messages: ['ATTITUDE', 'AHRS2'],
    msgIds: [30, 178],
    bytesPerCycle: 42 + 38,
    maxHz: 25,
  },
  {
    id: 'position',
    suffix: 'POSITION',
    label: 'Map / position', // i18n-exempt
    messages: ['GLOBAL_POSITION_INT', 'GPS_RAW_INT'],
    msgIds: [33, 24],
    bytesPerCycle: 42 + 66,
    maxHz: 10,
  },
  {
    id: 'vfr',
    suffix: 'EXTRA2',
    label: 'Speed, altitude, throttle', // i18n-exempt
    messages: ['VFR_HUD'],
    msgIds: [74],
    bytesPerCycle: 34,
    maxHz: 10,
  },
  {
    id: 'status',
    suffix: 'EXT_STAT',
    label: 'Battery & status', // i18n-exempt
    messages: ['SYS_STATUS', 'BATTERY_STATUS', 'GPS_RAW_INT', 'MISSION_CURRENT'],
    msgIds: [1, 147, 24, 42],
    bytesPerCycle: 45 + 50 + 66 + 20,
    maxHz: 10,
  },
  {
    id: 'rc',
    suffix: 'RC_CHAN',
    label: 'RC inputs', // i18n-exempt
    messages: ['RC_CHANNELS', 'SERVO_OUTPUT_RAW'],
    msgIds: [65, 36],
    bytesPerCycle: 56 + 35,
    maxHz: 10,
  },
  {
    id: 'raw',
    suffix: 'RAW_SENS',
    label: 'Raw IMU (tuning only)', // i18n-exempt
    messages: ['RAW_IMU', 'SCALED_PRESSURE'],
    msgIds: [27, 29],
    bytesPerCycle: 40 + 28,
    maxHz: 20,
  },
  {
    id: 'extra3',
    suffix: 'EXTRA3',
    label: 'Extra sensors', // i18n-exempt
    messages: ['RANGEFINDER', 'BATTERY2', 'SYSTEM_TIME'],
    msgIds: [173, 181, 2],
    bytesPerCycle: 22 + 18 + 26,
    maxHz: 10,
  },
];

export function rateGroupLabel(group: Pick<RateGroup, 'id'>): string {
  return t(`shared:mavlinkChannels.rateGroup.${group.id}`);
}

/**
 * Name of the parameter that carries a group's rate on a channel.
 *
 * Both schemes are probed against the reported parameter table: whichever
 * the vehicle actually has wins, and an unknown one returns null rather than
 * a name that would fail to write.
 */
export function rateParamName(get: ParamLookup, channel: number, suffix: string): string | null {
  for (const prefix of [`MAV${channel}_`, `SR${channel}_`]) {
    const name = `${prefix}${suffix}`;
    if (get(name) !== undefined) return name;
  }
  return null;
}

/** Which scheme this vehicle uses, for the label above the sliders. */
export function rateScheme(get: ParamLookup, channel: number): 'MAV' | 'SR' | null {
  if (get(`MAV${channel}_EXTRA1`) !== undefined) return 'MAV';
  if (get(`SR${channel}_EXTRA1`) !== undefined) return 'SR';
  return null;
}

/** Current rate of every group on a channel, in Hz. */
export function readRates(get: ParamLookup, channel: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const group of RATE_GROUPS) {
    const name = rateParamName(get, channel, group.suffix);
    if (name === null) continue;
    out[group.id] = get(name) ?? 0;
  }
  return out;
}

/** Bytes per second the requested rates will cost on the link. */
export function bandwidthCost(rates: Record<string, number>): number {
  let total = 0;
  for (const group of RATE_GROUPS) {
    const hz = rates[group.id];
    if (hz && hz > 0) total += hz * group.bytesPerCycle;
  }
  // HEARTBEAT and the other always-on traffic ArduPilot sends regardless
  return Math.round(total + 30);
}

/**
 * Usable bytes per second of a link, from its baud rate. Serial framing is
 * 10 bits per byte, and a radio link never delivers its full air rate, so
 * this is deliberately an over-estimate of capacity only for wired ports.
 */
export function serialCapacity(baud: number | null): number | null {
  if (baud === null || baud <= 0) return null;
  return Math.floor(baud / 10);
}
