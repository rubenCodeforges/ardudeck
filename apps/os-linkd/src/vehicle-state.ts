import {
  type MAVLinkPacket,
  HEARTBEAT_ID, deserializeHeartbeat,
  SYS_STATUS_ID, deserializeSysStatus,
  GPS_RAW_INT_ID, deserializeGpsRawInt,
  GLOBAL_POSITION_INT_ID, deserializeGlobalPositionInt,
  VFR_HUD_ID, deserializeVfrHud,
  ATTITUDE_ID, deserializeAttitude,
  STATUSTEXT_ID, deserializeStatustext,
  AUTOPILOT_VERSION_ID, deserializeAutopilotVersion,
} from '@ardudeck/mavlink-ts';
import { getFlightModeName, isVehicleHeartbeat } from '@ardudeck/vehicle-core';

const MAV_AUTOPILOT_ARDUPILOTMEGA = 3;
const MAV_AUTOPILOT_PX4 = 12;
const MAV_MODE_FLAG_SAFETY_ARMED = 0x80;
const MAV_STATE_STANDBY = 3;

/** A vehicle is gone after this long without a heartbeat. */
export const LINK_TIMEOUT_MS = 3000;
const MAX_MESSAGES = 50;

export interface StatusMessage {
  time: number;
  severity: number;
  text: string;
}

export interface VehicleState {
  sysid: number;
  compid: number;
  connected: boolean;
  lastHeartbeat: number;
  mavlinkVersion: 1 | 2;
  /** Stable per-board identity from AUTOPILOT_VERSION, or `mavlink-<sysid>` until it arrives. */
  uid: string;
  uidFromBoard: boolean;
  firmware: 'ardupilot' | 'px4' | 'other';
  firmwareVersion: string | null;
  boardVersion: number | null;
  mavType: number;
  autopilot: number;
  armed: boolean;
  customMode: number;
  mode: string;
  systemStatus: number;
  battery: { voltage: number | null; current: number | null; remaining: number | null };
  gps: { fixType: number; satellites: number | null; hdop: number | null };
  position: { lat: number; lon: number; altMsl: number; altRel: number; heading: number | null } | null;
  attitude: { roll: number; pitch: number; yaw: number } | null;
  hud: { airspeed: number; groundspeed: number; climb: number; throttle: number; heading: number } | null;
  messages: StatusMessage[];
}

function decodeFlightSwVersion(v: number): string | null {
  if (!v) return null;
  const major = (v >>> 24) & 0xff;
  const minor = (v >>> 16) & 0xff;
  const patch = (v >>> 8) & 0xff;
  return `${major}.${minor}.${patch}`;
}

function boardUid(uid: bigint, uid2: number[]): string | null {
  if (uid2.some((b) => b !== 0)) return uid2.map((b) => b.toString(16).padStart(2, '0')).join('');
  if (uid !== 0n) return uid.toString(16).padStart(16, '0');
  return null;
}

function blankVehicle(sysid: number, compid: number): VehicleState {
  return {
    sysid,
    compid,
    connected: false,
    lastHeartbeat: 0,
    mavlinkVersion: 1,
    uid: `mavlink-${sysid}`,
    uidFromBoard: false,
    firmware: 'other',
    firmwareVersion: null,
    boardVersion: null,
    mavType: 0,
    autopilot: 0,
    armed: false,
    customMode: 0,
    mode: '',
    systemStatus: 0,
    battery: { voltage: null, current: null, remaining: null },
    gps: { fixType: 0, satellites: null, hdop: null },
    position: null,
    attitude: null,
    hud: null,
    messages: [],
  };
}

/**
 * Tracks the primary vehicle on the link from decoded packets. Only the
 * autopilot component of the first vehicle seen is followed; multi-vehicle
 * fleets are a later concern of the service, not of this tracker.
 */
export class VehicleTracker {
  private vehicle: VehicleState | null = null;

  /** Feed one parsed packet. Returns 'identity' when the board UID was learned, 'new' for a new vehicle. */
  handle(packet: MAVLinkPacket, now = Date.now()): 'new' | 'identity' | null {
    if (packet.msgid === HEARTBEAT_ID) return this.onHeartbeat(packet, now);
    const v = this.vehicle;
    if (!v || packet.sysid !== v.sysid || packet.compid !== v.compid) return null;

    switch (packet.msgid) {
      case SYS_STATUS_ID: {
        const m = deserializeSysStatus(packet.payload);
        v.battery = {
          voltage: m.voltageBattery === 0xffff ? null : m.voltageBattery / 1000,
          current: m.currentBattery === -1 ? null : m.currentBattery / 100,
          remaining: m.batteryRemaining === -1 ? null : m.batteryRemaining,
        };
        break;
      }
      case GPS_RAW_INT_ID: {
        const m = deserializeGpsRawInt(packet.payload);
        v.gps = {
          fixType: m.fixType,
          satellites: m.satellitesVisible === 255 ? null : m.satellitesVisible,
          hdop: m.eph === 0xffff ? null : m.eph / 100,
        };
        break;
      }
      case GLOBAL_POSITION_INT_ID: {
        const m = deserializeGlobalPositionInt(packet.payload);
        v.position = {
          lat: m.lat / 1e7,
          lon: m.lon / 1e7,
          altMsl: m.alt / 1000,
          altRel: m.relativeAlt / 1000,
          heading: m.hdg === 0xffff ? null : m.hdg / 100,
        };
        break;
      }
      case ATTITUDE_ID: {
        const m = deserializeAttitude(packet.payload);
        const deg = 180 / Math.PI;
        v.attitude = { roll: m.roll * deg, pitch: m.pitch * deg, yaw: m.yaw * deg };
        break;
      }
      case VFR_HUD_ID: {
        const m = deserializeVfrHud(packet.payload);
        v.hud = { airspeed: m.airspeed, groundspeed: m.groundspeed, climb: m.climb, throttle: m.throttle, heading: m.heading };
        break;
      }
      case STATUSTEXT_ID: {
        const m = deserializeStatustext(packet.payload);
        v.messages.push({ time: now, severity: m.severity, text: m.text });
        if (v.messages.length > MAX_MESSAGES) v.messages.splice(0, v.messages.length - MAX_MESSAGES);
        break;
      }
      case AUTOPILOT_VERSION_ID: {
        const m = deserializeAutopilotVersion(packet.payload);
        v.firmwareVersion = decodeFlightSwVersion(m.flightSwVersion);
        v.boardVersion = m.boardVersion || null;
        const uid = boardUid(m.uid, m.uid2);
        if (uid && uid !== v.uid) {
          v.uid = uid;
          v.uidFromBoard = true;
          return 'identity';
        }
        break;
      }
    }
    return null;
  }

  private onHeartbeat(packet: MAVLinkPacket, now: number): 'new' | null {
    const hb = deserializeHeartbeat(packet.payload);
    if (!isVehicleHeartbeat(hb.type, hb.autopilot, packet.compid)) return null;

    let isNew = false;
    let v = this.vehicle;
    if (!v || !v.connected) {
      // Every (re)connect starts from scratch: a different airframe can come
      // back on the same sysid, so identity and cache key must be re-learned.
      v = blankVehicle(packet.sysid, packet.compid);
      this.vehicle = v;
      isNew = true;
    } else if (v.sysid !== packet.sysid || v.compid !== packet.compid) {
      return null; // a second vehicle while the first is live: not tracked yet
    }

    v.connected = true;
    v.lastHeartbeat = now;
    v.mavlinkVersion = packet.isMavlink2 ? 2 : 1;
    v.mavType = hb.type;
    v.autopilot = hb.autopilot;
    v.firmware = hb.autopilot === MAV_AUTOPILOT_ARDUPILOTMEGA ? 'ardupilot' : hb.autopilot === MAV_AUTOPILOT_PX4 ? 'px4' : 'other';
    v.armed = (hb.baseMode & MAV_MODE_FLAG_SAFETY_ARMED) !== 0 && hb.systemStatus >= MAV_STATE_STANDBY;
    v.customMode = hb.customMode;
    v.mode = getFlightModeName(hb.autopilot, hb.type, hb.customMode);
    v.systemStatus = hb.systemStatus;
    return isNew ? 'new' : null;
  }

  /** Mark the vehicle disconnected once heartbeats stop. Returns true on the transition. */
  checkTimeout(now = Date.now()): boolean {
    const v = this.vehicle;
    if (v?.connected && now - v.lastHeartbeat > LINK_TIMEOUT_MS) {
      v.connected = false;
      return true;
    }
    return false;
  }

  /** Forget the vehicle (the link was switched or closed). */
  reset(): void {
    this.vehicle = null;
  }

  get current(): VehicleState | null {
    return this.vehicle;
  }
}
