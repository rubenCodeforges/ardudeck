/**
 * CRSF telemetry decode: the downlink an ELRS TX backpack broadcasts over WiFi.
 *
 * Pure: bytes in, telemetry out. Framing and CRC come from the Link Doctor's
 * codec; this adds the telemetry frame bodies and maps them onto the same
 * telemetry batch the MAVLink and MSP paths emit. Every multi-byte field in a
 * CRSF telemetry frame is big-endian. The link is one-way, so there is no
 * command, mission or parameter path here.
 */

import type {
  AttitudeData,
  BatteryData,
  FlightState,
  GpsData,
  PositionData,
  RadioStatusData,
  RcChannelsData,
  VfrHudData,
} from '../../shared/telemetry-types.js';
import { CRSF_FRAMETYPE_LINK_STATISTICS, type CrsfFrame } from '../link-doctor/crsf-protocol.js';

export const CRSF_FRAMETYPE_GPS = 0x02;
export const CRSF_FRAMETYPE_VARIO = 0x07;
export const CRSF_FRAMETYPE_BATTERY_SENSOR = 0x08;
export const CRSF_FRAMETYPE_BARO_ALTITUDE = 0x09;
export const CRSF_FRAMETYPE_HEARTBEAT = 0x0b;
export const CRSF_FRAMETYPE_RC_CHANNELS_PACKED = 0x16;
export const CRSF_FRAMETYPE_ATTITUDE = 0x1e;
export const CRSF_FRAMETYPE_FLIGHT_MODE = 0x21;

const RAD_TO_DEG = 180 / Math.PI;

/** ELRS transmit power by the index the link statistics frame reports, in mW. */
const TX_POWER_MW = [0, 10, 25, 100, 500, 1000, 2000, 250, 50] as const;

/** frame.body is [type][payload...]; every decoder below works on the payload. */
function payloadOf(frame: CrsfFrame): Uint8Array {
  return frame.body.subarray(1);
}

function view(p: Uint8Array): DataView {
  return new DataView(p.buffer, p.byteOffset, p.byteLength);
}

export interface CrsfGps {
  lat: number;
  lon: number;
  /** Ground speed in m/s (the wire carries km/h in tenths). */
  groundspeedMs: number;
  headingDeg: number;
  /** Altitude MSL in meters (the wire carries whole meters offset by 1000). */
  altitudeM: number;
  satellites: number;
}

/** 0x02: [i32 lat][i32 lon][u16 km/h*10][u16 deg*100][u16 m+1000][u8 sats] */
export function decodeGps(frame: CrsfFrame): CrsfGps | null {
  const p = payloadOf(frame);
  if (p.length < 15) return null;
  const v = view(p);
  return {
    lat: v.getInt32(0, false) / 1e7,
    lon: v.getInt32(4, false) / 1e7,
    groundspeedMs: v.getUint16(8, false) / 10 / 3.6,
    headingDeg: v.getUint16(10, false) / 100,
    altitudeM: v.getUint16(12, false) - 1000,
    satellites: p[14]!,
  };
}

/** 0x07: [i16 cm/s] vertical speed. */
export function decodeVario(frame: CrsfFrame): number | null {
  const p = payloadOf(frame);
  if (p.length < 2) return null;
  return view(p).getInt16(0, false) / 100;
}

export interface CrsfBattery {
  voltage: number;
  current: number;
  mahDrawn: number;
  /** Percent remaining as the flight controller estimates it, 0-100. */
  remaining: number;
}

/** 0x08: [u16 dV][u16 dA][u24 mAh][u8 percent] */
export function decodeBattery(frame: CrsfFrame): CrsfBattery | null {
  const p = payloadOf(frame);
  if (p.length < 8) return null;
  const v = view(p);
  return {
    voltage: v.getUint16(0, false) / 10,
    current: v.getUint16(2, false) / 10,
    mahDrawn: (p[4]! << 16) | (p[5]! << 8) | p[6]!,
    remaining: p[7]!,
  };
}

/**
 * 0x09: one packed u16 altitude above the arming point. The top bit picks the
 * scale: set means whole meters in the low 15 bits, clear means decimeters
 * offset by 10000 (so the frame can also express a metre below the start).
 * A third byte carrying packed vertical speed exists in newer senders; the
 * vario frame is the reliable source for climb rate, so it is ignored here.
 */
export function decodeBaroAltitude(frame: CrsfFrame): number | null {
  const p = payloadOf(frame);
  if (p.length < 2) return null;
  const raw = view(p).getUint16(0, false);
  return raw & 0x8000 ? raw & 0x7fff : (raw - 10000) / 10;
}

export interface CrsfAttitude {
  rollDeg: number;
  pitchDeg: number;
  yawDeg: number;
}

/** 0x1E: [i16 pitch][i16 roll][i16 yaw], each radians * 10000. */
export function decodeAttitude(frame: CrsfFrame): CrsfAttitude | null {
  const p = payloadOf(frame);
  if (p.length < 6) return null;
  const v = view(p);
  const yaw = (v.getInt16(4, false) / 10000) * RAD_TO_DEG;
  return {
    pitchDeg: (v.getInt16(0, false) / 10000) * RAD_TO_DEG,
    rollDeg: (v.getInt16(2, false) / 10000) * RAD_TO_DEG,
    yawDeg: ((yaw % 360) + 360) % 360,
  };
}

/** 0x21: a null-terminated flight mode string, e.g. "ANGL", "WAIT", "!ERR". */
export function decodeFlightMode(frame: CrsfFrame): string | null {
  const p = payloadOf(frame);
  if (p.length === 0) return null;
  const end = p.indexOf(0);
  const text = new TextDecoder().decode(end < 0 ? p : p.subarray(0, end)).trim();
  return text.length > 0 ? text : null;
}

export interface CrsfLinkStats {
  /** Receiver's signal strength in dBm (negative), best antenna. */
  uplinkRssiDbm: number;
  /** Receiver's link quality, 0-100: the number an ELRS pilot actually flies by. */
  uplinkLq: number;
  uplinkSnrDb: number;
  /** Transmitter's signal strength in dBm for the telemetry coming back. */
  downlinkRssiDbm: number;
  downlinkLq: number;
  downlinkSnrDb: number;
  activeAntenna: number;
  rfMode: number;
  txPowerMw: number;
}

/** 0x14: the ELRS link report, ten bytes, sent whether or not the FC is alive. */
export function decodeLinkStatistics(frame: CrsfFrame): CrsfLinkStats | null {
  const p = payloadOf(frame);
  if (p.length < 10) return null;
  const v = view(p);
  // Both antenna RSSIs are reported as positive dBm magnitudes; the better
  // (smaller magnitude) one is what the receiver is actually hearing on.
  const bestUplink = Math.min(p[0]!, p[1]!);
  return {
    uplinkRssiDbm: -bestUplink,
    uplinkLq: p[2]!,
    uplinkSnrDb: v.getInt8(3),
    activeAntenna: p[4]!,
    rfMode: p[5]!,
    txPowerMw: TX_POWER_MW[p[6]!] ?? 0,
    downlinkRssiDbm: -p[7]!,
    downlinkLq: p[8]!,
    downlinkSnrDb: v.getInt8(9),
  };
}

/** 0x16: 16 channels of 11 bits, packed little-end first across 22 bytes. */
export function decodeRcChannels(frame: CrsfFrame): number[] | null {
  const p = payloadOf(frame);
  if (p.length < 22) return null;
  const channels: number[] = [];
  let bits = 0;
  let acc = 0;
  let at = 0;
  while (channels.length < 16) {
    while (bits < 11) {
      acc |= p[at++]! << bits;
      bits += 8;
    }
    // Betaflight's conversion from CRSF ticks to microseconds.
    channels.push(Math.round(0.62477120195241 * (acc & 0x7ff) + 881));
    acc >>= 11;
    bits -= 11;
  }
  return channels;
}

/**
 * INAV reports these instead of a mode when the aircraft is on the ground;
 * Betaflight keeps the mode name and appends '*'. CRSF has no arming bit, so
 * the mode string is the only thing that says whether the props can turn.
 */
const DISARMED_MODES = new Set(['OK', 'WAIT', '!ERR', 'ERR']);

export function armedFromMode(mode: string): boolean {
  const text = mode.trim();
  if (text.endsWith('*')) return false;
  return !DISARMED_MODES.has(text.toUpperCase());
}

/** Drop Betaflight's disarmed marker from what the pilot reads. */
export function displayMode(mode: string): string {
  return mode.trim().replace(/\*$/, '');
}

/** Everything decoded so far. Frames arrive at their own rates, so each slot
 * holds the newest value rather than one snapshot per frame. */
export interface CrsfTelemetryState {
  gps: CrsfGps | null;
  battery: CrsfBattery | null;
  attitude: CrsfAttitude | null;
  baroAltitudeM: number | null;
  varioMs: number | null;
  mode: string | null;
  link: CrsfLinkStats | null;
  rcChannelsUs: number[] | null;
  /** Timestamp of the last frame we understood, for liveness. */
  lastFrameAtMs: number;
  framesDecoded: number;
  /** Valid CRSF frames of a type we do not map (device info, params, ...). */
  framesIgnored: number;
}

export function createCrsfState(): CrsfTelemetryState {
  return {
    gps: null,
    battery: null,
    attitude: null,
    baroAltitudeM: null,
    varioMs: null,
    mode: null,
    link: null,
    rcChannelsUs: null,
    lastFrameAtMs: 0,
    framesDecoded: 0,
    framesIgnored: 0,
  };
}

/**
 * Fold one frame into the state. Returns true when it carried telemetry we
 * understood, so a caller can tell "the aircraft is talking" apart from "the
 * transmitter is talking to itself" (link statistics keep flowing with the
 * model switched off, which is exactly the case a pilot must not misread as a
 * live vehicle).
 */
export function applyCrsfFrame(state: CrsfTelemetryState, frame: CrsfFrame, atMs: number): boolean {
  switch (frame.type) {
    case CRSF_FRAMETYPE_GPS: {
      const gps = decodeGps(frame);
      if (!gps) return false;
      state.gps = gps;
      break;
    }
    case CRSF_FRAMETYPE_VARIO: {
      const vario = decodeVario(frame);
      if (vario === null) return false;
      state.varioMs = vario;
      break;
    }
    case CRSF_FRAMETYPE_BATTERY_SENSOR: {
      const battery = decodeBattery(frame);
      if (!battery) return false;
      state.battery = battery;
      break;
    }
    case CRSF_FRAMETYPE_BARO_ALTITUDE: {
      const alt = decodeBaroAltitude(frame);
      if (alt === null) return false;
      state.baroAltitudeM = alt;
      break;
    }
    case CRSF_FRAMETYPE_ATTITUDE: {
      const attitude = decodeAttitude(frame);
      if (!attitude) return false;
      state.attitude = attitude;
      break;
    }
    case CRSF_FRAMETYPE_FLIGHT_MODE: {
      const mode = decodeFlightMode(frame);
      if (mode === null) return false;
      state.mode = mode;
      break;
    }
    case CRSF_FRAMETYPE_RC_CHANNELS_PACKED: {
      const channels = decodeRcChannels(frame);
      if (!channels) return false;
      state.rcChannelsUs = channels;
      break;
    }
    case CRSF_FRAMETYPE_LINK_STATISTICS: {
      const link = decodeLinkStatistics(frame);
      if (!link) return false;
      state.link = link;
      // The transmitter sends this on its own schedule, with or without a
      // vehicle, so it updates the link readout but never vehicle liveness.
      return false;
    }
    default:
      state.framesIgnored++;
      return false;
  }
  state.lastFrameAtMs = atMs;
  state.framesDecoded++;
  return true;
}

/** The subset of the telemetry batch a CRSF downlink can actually fill. */
export interface CrsfBatch {
  attitude?: AttitudeData;
  position?: PositionData;
  gps?: GpsData;
  battery?: BatteryData;
  vfrHud?: VfrHudData;
  flight?: FlightState;
  rcChannels?: RcChannelsData;
  radioStatus?: RadioStatusData;
}

/**
 * CRSF carries no fix type, only a satellite count, so infer one the way a
 * pilot would read the same number: enough satellites for a 3D fix, enough for
 * a 2D fix, or nothing worth trusting.
 */
export function fixTypeFromSatellites(satellites: number): number {
  if (satellites >= 5) return 3;
  if (satellites >= 3) return 2;
  return 0;
}

/** The link instrument reads 0-254 like a SiK modem; CRSF reports percent. */
function lqToGaugeScale(lq: number): number {
  return Math.round((Math.min(Math.max(lq, 0), 100) / 100) * 254);
}

/**
 * Build a telemetry batch from what has been decoded so far. Slots that never
 * arrived stay absent rather than being filled with zeros, so the HUD shows a
 * stale-or-missing reading instead of a confident wrong one.
 */
export function crsfBatch(state: CrsfTelemetryState): CrsfBatch {
  const batch: CrsfBatch = {};

  if (state.attitude) {
    batch.attitude = {
      roll: state.attitude.rollDeg,
      pitch: state.attitude.pitchDeg,
      yaw: state.attitude.yawDeg,
      rollSpeed: 0,
      pitchSpeed: 0,
      yawSpeed: 0,
    };
  }

  if (state.gps) {
    batch.gps = {
      fixType: fixTypeFromSatellites(state.gps.satellites),
      satellites: state.gps.satellites,
      // CRSF reports neither dilution figure; 99 is this app's "unknown".
      hdop: 99,
      vdop: 99,
      lat: state.gps.lat,
      lon: state.gps.lon,
      alt: state.gps.altitudeM,
    };
    batch.position = {
      lat: state.gps.lat,
      lon: state.gps.lon,
      alt: state.gps.altitudeM,
      relativeAlt: state.baroAltitudeM ?? 0,
      vx: 0,
      vy: 0,
      vz: 0,
    };
  }

  if (state.battery) {
    batch.battery = {
      voltage: state.battery.voltage,
      current: state.battery.current,
      remaining: state.battery.remaining,
      mahDrawn: state.battery.mahDrawn,
    };
  }

  if (state.gps || state.baroAltitudeM !== null || state.varioMs !== null || state.attitude) {
    batch.vfrHud = {
      // No airspeed sensor reaches the ground over CRSF; ground speed is all
      // there is, and claiming it as airspeed would mislead a plane pilot.
      airspeed: 0,
      groundspeed: state.gps?.groundspeedMs ?? 0,
      heading: state.gps?.headingDeg ?? state.attitude?.yawDeg ?? 0,
      throttle: throttlePercent(state.rcChannelsUs),
      alt: state.baroAltitudeM ?? state.gps?.altitudeM ?? 0,
      climb: state.varioMs ?? 0,
    };
  }

  if (state.mode !== null) {
    batch.flight = {
      mode: displayMode(state.mode),
      modeNum: 0,
      armed: armedFromMode(state.mode),
      isFlying: armedFromMode(state.mode),
    };
  } else if (state.framesDecoded > 0) {
    // The flight slot is what stamps heartbeat freshness, so a stream without
    // a mode frame still has to report, and says only what it knows.
    batch.flight = { mode: 'Unknown', modeNum: 0, armed: false, isFlying: false };
  }

  if (state.rcChannelsUs) {
    batch.rcChannels = {
      channels: state.rcChannelsUs,
      chancount: state.rcChannelsUs.length,
      rssi: state.link ? lqToGaugeScale(state.link.uplinkLq) : 0,
    };
  }

  if (state.link) {
    // CRSF has no error or FEC counters and no noise floor, so those stay at
    // zero and the instrument shows link quality, which is what ELRS measures.
    batch.radioStatus = {
      rssi: lqToGaugeScale(state.link.uplinkLq),
      remRssi: lqToGaugeScale(state.link.downlinkLq),
      txbuf: 100,
      noise: 0,
      remNoise: 0,
      rxErrors: 0,
      fixed: 0,
    };
  }

  return batch;
}

/** Throttle stick position as a percentage, when the stream carries RC at all. */
function throttlePercent(channels: number[] | null): number {
  const raw = channels?.[2];
  if (raw === undefined) return 0;
  return Math.round(Math.min(Math.max((raw - 1000) / 10, 0), 100));
}

/** One line for the log when a CRSF link comes up or its quality changes. */
export function linkSummary(link: CrsfLinkStats): string {
  return `LQ ${link.uplinkLq}% - RSSI ${link.uplinkRssiDbm} dBm - SNR ${link.uplinkSnrDb} dB - ${link.txPowerMw} mW`;
}
