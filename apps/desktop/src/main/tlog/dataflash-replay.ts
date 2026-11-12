import { createDataFlashParser, type DataFlashMessage } from '@ardudeck/dataflash-parser';
import {
  serializeV2,
  getMessageInfo,
  serializeHeartbeat, HEARTBEAT_ID,
  serializeAttitude, ATTITUDE_ID,
  serializeGlobalPositionInt, GLOBAL_POSITION_INT_ID,
  serializeGpsRawInt, GPS_RAW_INT_ID,
  serializeVfrHud, VFR_HUD_ID,
  serializeSysStatus, SYS_STATUS_ID,
  serializeStatustext, STATUSTEXT_ID,
} from '@ardudeck/mavlink-ts';
import type { TlogRecord } from './tlog-replay.js';

/** First two bytes of every dataflash record. */
const DATAFLASH_HEAD = [0xa3, 0x95] as const;

export function isDataflash(buf: Uint8Array): boolean {
  return buf.length > 2 && buf[0] === DATAFLASH_HEAD[0] && buf[1] === DATAFLASH_HEAD[1];
}

const USED_TYPES = new Set(['ATT', 'POS', 'GPS', 'BAT', 'MODE', 'EV', 'ARM', 'MSG', 'CTUN']);
const CHUNK = 4 * 1024 * 1024;
const DEG = Math.PI / 180;

const MAV_TYPE: Record<string, number> = { copter: 2, plane: 1, rover: 10, sub: 12 };
const MAV_AUTOPILOT_ARDUPILOTMEGA = 3;
const MAV_MODE_FLAG_CUSTOM_MODE_ENABLED = 1;
const MAV_MODE_FLAG_SAFETY_ARMED = 128;
const MAV_STATE_STANDBY = 3;
const MAV_STATE_ACTIVE = 4;
const EV_ARMED = 10;
const EV_DISARMED = 11;
const SYSID = 1;
const COMPID = 1;

function num(m: DataFlashMessage, ...names: string[]): number | undefined {
  for (const n of names) {
    const v = m.fields[n];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return undefined;
}

const wrapDeg = (d: number): number => ((d % 360) + 360) % 360;
const i32 = (v: number): number => Math.max(-2147483648, Math.min(2147483647, Math.round(v)));
const u16 = (v: number): number => Math.max(0, Math.min(65535, Math.round(v)));
const i16 = (v: number): number => Math.max(-32768, Math.min(32767, Math.round(v)));

/** Rebuild the cockpit's MAVLink (attitude, position, GPS, battery, mode, arming, messages) from a dataflash .bin, at its logged rate. */
export async function dataflashToRecords(buf: Uint8Array): Promise<TlogRecord[]> {
  const parser = createDataFlashParser({ columnar: true, keepRows: USED_TYPES });
  for (let off = 0; off < buf.length; off += CHUNK) {
    parser.feed(buf.subarray(off, Math.min(buf.length, off + CHUNK)));
    await new Promise((r) => setImmediate(r));
  }
  const log = parser.finalize();

  const events: DataFlashMessage[] = [];
  for (const type of USED_TYPES) events.push(...(log.messages.get(type) ?? []));
  events.sort((a, b) => a.timeUs - b.timeUs);
  const flight = events.filter((m) => m.type === 'ATT' || m.type === 'POS' || m.type === 'GPS');
  if (flight.length === 0) return [];

  const startUs = flight[0]!.timeUs;
  const endUs = flight[flight.length - 1]!.timeUs;
  const mavType = MAV_TYPE[log.metadata.vehicleType] ?? 2;
  const out: TlogRecord[] = [];
  const opts = { sysid: SYSID, compid: COMPID };
  // CRC extras come from the registry: some generated *_CRC_EXTRA constants are wrong.
  const push = (t: number, msgid: number, payload: Uint8Array): void => {
    const info = getMessageInfo(msgid);
    if (!info) return;
    out.push({ t, msgid, packet: serializeV2(msgid, payload, info.crcExtra, opts) });
  };

  let armed = false;
  let mode = 0;
  let yawDeg = 0;
  let speed = 0;
  let course = 0;
  let climb = 0;
  let throttle = 0;
  let nextHeartbeatUs = startUs;
  const hasPos = (log.messages.get('POS')?.length ?? 0) > 0;
  let homeAlt: number | null = null;

  const heartbeat = (t: number): void => {
    push(t, HEARTBEAT_ID, serializeHeartbeat({
      type: mavType,
      autopilot: MAV_AUTOPILOT_ARDUPILOTMEGA,
      baseMode: MAV_MODE_FLAG_CUSTOM_MODE_ENABLED | (armed ? MAV_MODE_FLAG_SAFETY_ARMED : 0),
      customMode: mode,
      systemStatus: armed ? MAV_STATE_ACTIVE : MAV_STATE_STANDBY,
      mavlinkVersion: 3,
    }));
  };

  const position = (t: number, bootMs: number, lat: number, lng: number, alt: number, rel: number): void => {
    const vn = speed * Math.cos(course * DEG);
    const ve = speed * Math.sin(course * DEG);
    push(t, GLOBAL_POSITION_INT_ID, serializeGlobalPositionInt({
      timeBootMs: bootMs, lat: i32(lat * 1e7), lon: i32(lng * 1e7), alt: i32(alt * 1000), relativeAlt: i32(rel * 1000),
      vx: i16(vn * 100), vy: i16(ve * 100), vz: i16(-climb * 100), hdg: u16(yawDeg * 100),
    }));
    push(t, VFR_HUD_ID, serializeVfrHud({
      airspeed: speed, groundspeed: speed, heading: Math.round(yawDeg) % 360, throttle: Math.round(throttle), alt, climb,
    }));
  };

  for (const m of events) {
    if (m.timeUs < startUs) {
      // State before the flight data starts still decides the first heartbeat.
      if (m.type === 'MODE') mode = num(m, 'ModeNum', 'Mode') ?? mode;
      if (m.type === 'ARM') armed = (num(m, 'ArmState') ?? 0) !== 0;
      if (m.type === 'EV') { const id = num(m, 'Id'); if (id === EV_ARMED) armed = true; if (id === EV_DISARMED) armed = false; }
      continue;
    }
    if (m.timeUs > endUs) break;
    while (nextHeartbeatUs <= m.timeUs) {
      heartbeat((nextHeartbeatUs - startUs) / 1000);
      nextHeartbeatUs += 1_000_000;
    }
    const t = (m.timeUs - startUs) / 1000;
    const bootMs = Math.round(m.timeUs / 1000) >>> 0;

    switch (m.type) {
      case 'ATT': {
        const roll = num(m, 'Roll') ?? 0;
        const pitch = num(m, 'Pitch') ?? 0;
        yawDeg = wrapDeg(num(m, 'Yaw') ?? 0);
        push(t, ATTITUDE_ID, serializeAttitude({
          timeBootMs: bootMs, roll: roll * DEG, pitch: pitch * DEG, yaw: (yawDeg > 180 ? yawDeg - 360 : yawDeg) * DEG,
          rollspeed: 0, pitchspeed: 0, yawspeed: 0,
        }));
        break;
      }
      case 'POS': {
        const lat = num(m, 'Lat');
        const lng = num(m, 'Lng');
        if (lat === undefined || lng === undefined || (lat === 0 && lng === 0)) break;
        position(t, bootMs, lat, lng, num(m, 'Alt') ?? 0, num(m, 'RelHomeAlt', 'RelOriginAlt') ?? 0);
        break;
      }
      case 'GPS': {
        speed = num(m, 'Spd') ?? speed;
        course = num(m, 'GCrs') ?? course;
        const vz = num(m, 'VZ');
        if (vz !== undefined) climb = -vz;
        const lat = num(m, 'Lat') ?? 0;
        const lng = num(m, 'Lng') ?? 0;
        push(t, GPS_RAW_INT_ID, serializeGpsRawInt({
          timeUsec: BigInt(Math.max(0, Math.round(m.timeUs))),
          fixType: num(m, 'Status', 'Stat') ?? 0,
          lat: i32(lat * 1e7), lon: i32(lng * 1e7), alt: i32((num(m, 'Alt') ?? 0) * 1000),
          eph: u16((num(m, 'HDop') ?? 99) * 100), epv: 65535,
          vel: u16(speed * 100), cog: u16(wrapDeg(course) * 100),
          satellitesVisible: num(m, 'NSats') ?? 0,
          altEllipsoid: 0, hAcc: 0, vAcc: 0, velAcc: 0, hdgAcc: 0, yaw: 0,
        }));
        if (!hasPos && (num(m, 'Status', 'Stat') ?? 0) >= 3 && !(lat === 0 && lng === 0)) {
          const alt = num(m, 'Alt') ?? 0;
          homeAlt ??= alt;
          position(t, bootMs, lat, lng, alt, alt - homeAlt);
        }
        break;
      }
      case 'BAT': {
        if ((num(m, 'Inst', 'Instance') ?? 0) !== 0) break;
        push(t, SYS_STATUS_ID, serializeSysStatus({
          onboardControlSensorsPresent: 0, onboardControlSensorsEnabled: 0, onboardControlSensorsHealth: 0, load: 0,
          voltageBattery: u16((num(m, 'Volt') ?? 0) * 1000),
          currentBattery: i16((num(m, 'Curr') ?? -0.01) * 100),
          batteryRemaining: Math.round(num(m, 'RemPct') ?? -1),
          dropRateComm: 0, errorsComm: 0, errorsCount1: 0, errorsCount2: 0, errorsCount3: 0, errorsCount4: 0,
        } as Parameters<typeof serializeSysStatus>[0]));
        break;
      }
      case 'CTUN': {
        const tho = num(m, 'ThO', 'ThrOut');
        if (tho !== undefined) throttle = tho <= 1 ? tho * 100 : tho;
        break;
      }
      case 'MODE': {
        mode = num(m, 'ModeNum', 'Mode') ?? mode;
        heartbeat(t);
        break;
      }
      case 'ARM': {
        armed = (num(m, 'ArmState') ?? 0) !== 0;
        heartbeat(t);
        break;
      }
      case 'EV': {
        const id = num(m, 'Id');
        if (id === EV_ARMED || id === EV_DISARMED) { armed = id === EV_ARMED; heartbeat(t); }
        break;
      }
      case 'MSG': {
        const text = m.fields['Message'];
        if (typeof text === 'string' && text) {
          push(t, STATUSTEXT_ID, serializeStatustext({ severity: 6, text: text.slice(0, 50), id: 0, chunkSeq: 0 }));
        }
        break;
      }
    }
  }
  return out;
}
