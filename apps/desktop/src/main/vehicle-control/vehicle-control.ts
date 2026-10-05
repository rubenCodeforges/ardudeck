// Vehicle control for cargos: commands and setpoints behind one safety gate, plus raw MAVLink taps.

import {
  serializeCommandLong,
  serializeCommandInt,
  serializeSetPositionTargetLocalNed,
  serializeSetPositionTargetGlobalInt,
  COMMAND_LONG_ID,
  COMMAND_LONG_CRC_EXTRA,
  COMMAND_INT_ID,
  COMMAND_INT_CRC_EXTRA,
  SET_POSITION_TARGET_LOCAL_NED_ID,
  SET_POSITION_TARGET_LOCAL_NED_CRC_EXTRA,
  SET_POSITION_TARGET_GLOBAL_INT_ID,
  SET_POSITION_TARGET_GLOBAL_INT_CRC_EXTRA,
} from '@ardudeck/mavlink-ts';
import type {
  GuidedState,
  VehicleClass,
  VehicleCommandRequest,
  VehicleCommandResult,
  VehicleSetpoint,
  VehicleSetpointResult,
  MavlinkFrame,
} from '@ardudeck/module-sdk';

export interface VehicleControlBackend {
  /** The vehicle the pilot is commanding (fleet selection, else the primary link). */
  target(): { sysid: number; compid: number } | null;
  send(msgid: number, payload: Uint8Array, crcExtra: number): Promise<boolean>;
}

const HEARTBEAT_STALE_MS = 3000;
const ACK_TIMEOUT_MS = 1500;
const MIN_SETPOINT_INTERVAL_MS = 20;
const MAV_AUTOPILOT_ARDUPILOTMEGA = 3;

/** ArduPilot GUIDED custom_mode per vehicle class. */
const GUIDED_MODE: Partial<Record<VehicleClass, number>> = { copter: 4, plane: 15 };

/** Commands that move the aircraft: refused unless armed and in Guided. */
const MOTION_COMMANDS = new Set([
  115, // CONDITION_YAW
  178, // DO_CHANGE_SPEED
  192, // DO_REPOSITION
  195, // DO_SET_ROI_LOCATION (yaws the airframe in Guided)
  197, // DO_SET_ROI_NONE
  198, // DO_SET_ROI_SYSID
]);
/** Camera and gimbal: aim the payload, never move the aircraft. */
const PAYLOAD_COMMANDS = new Set([
  205, // DO_MOUNT_CONTROL
  531, // SET_CAMERA_ZOOM
  532, // SET_CAMERA_FOCUS
  1000, // DO_GIMBAL_MANAGER_PITCHYAW
  2004, // CAMERA_TRACK_POINT
  2005, // CAMERA_TRACK_RECTANGLE
  2010, // CAMERA_STOP_TRACKING
]);

interface HeartbeatInfo { at: number; armed: boolean; customMode: number; mavType: number; autopilot: number }

export function vehicleClassOf(mavType: number): VehicleClass {
  if (mavType === 1 || (mavType >= 19 && mavType <= 25)) return 'plane';
  if (mavType === 2 || mavType === 3 || mavType === 4 || (mavType >= 13 && mavType <= 15) || mavType === 29 || mavType === 35) return 'copter';
  return 'other';
}

export class VehicleControl {
  private backend: VehicleControlBackend | null = null;
  private heartbeats = new Map<number, HeartbeatInfo>();
  private taps = new Set<{ ids: Set<number> | null; cb: (f: MavlinkFrame) => void }>();
  private pendingAcks = new Map<number, (result: number) => void>();
  private lastSetpointAt = new Map<string, number>();

  constructor(private now: () => number = Date.now) {}

  setBackend(backend: VehicleControlBackend | null): void {
    this.backend = backend;
  }

  /** Every frame from the vehicle link, for the gate, command ACKs and cargo taps. */
  notePacket(frame: MavlinkFrame): void {
    const p = frame.payload;
    if (frame.msgid === 0 && p.length >= 9) {
      this.heartbeats.set(frame.sysid, {
        at: this.now(),
        customMode: new DataView(p.buffer, p.byteOffset, p.byteLength).getUint32(0, true),
        mavType: p[4]!,
        autopilot: p[5]!,
        armed: (p[6]! & 0x80) !== 0,
      });
    } else if (frame.msgid === 77 && p.length >= 3) {
      const command = p[0]! | (p[1]! << 8);
      const resolve = this.pendingAcks.get(command);
      if (resolve) { this.pendingAcks.delete(command); resolve(p[2]!); }
    }
    for (const tap of this.taps) {
      if (tap.ids && !tap.ids.has(frame.msgid)) continue;
      try { tap.cb(frame); } catch { /* a cargo's listener must not break the link */ }
    }
  }

  subscribe(msgIds: number[] | null, cb: (f: MavlinkFrame) => void): () => void {
    const tap = { ids: msgIds ? new Set(msgIds) : null, cb };
    this.taps.add(tap);
    return () => { this.taps.delete(tap); };
  }

  guidedState(): GuidedState {
    const target = this.backend?.target() ?? null;
    const hb = target ? this.heartbeats.get(target.sysid) : undefined;
    if (!target || !hb || this.now() - hb.at > HEARTBEAT_STALE_MS) {
      return { connected: false, sysid: target?.sysid ?? null, armed: false, guided: false, vehicleClass: 'other', ardupilot: false };
    }
    const vehicleClass = vehicleClassOf(hb.mavType);
    const ardupilot = hb.autopilot === MAV_AUTOPILOT_ARDUPILOTMEGA;
    return {
      connected: true,
      sysid: target.sysid,
      armed: hb.armed,
      guided: ardupilot && GUIDED_MODE[vehicleClass] === hb.customMode,
      vehicleClass,
      ardupilot,
    };
  }

  /** Why the aircraft may not be moved right now, or null when it may. */
  motionRefusal(): string | null {
    const s = this.guidedState();
    if (!s.connected) return 'no vehicle';
    if (!s.ardupilot) return 'only ArduPilot vehicles can be steered';
    if (s.vehicleClass === 'other') return 'vehicle type not supported';
    if (!s.armed) return 'vehicle is not armed';
    if (!s.guided) return 'vehicle is not in Guided mode';
    return null;
  }

  async command(req: VehicleCommandRequest): Promise<VehicleCommandResult> {
    const moves = MOTION_COMMANDS.has(req.command);
    if (!moves && !PAYLOAD_COMMANDS.has(req.command)) return { ok: false, error: `command ${req.command} is not allowed for cargos` };
    if (moves) {
      const refusal = this.motionRefusal();
      if (refusal) return { ok: false, error: refusal };
    }
    const target = this.backend?.target();
    if (!this.backend || !target) return { ok: false, error: 'no vehicle' };
    const p = req.params ?? [];
    const asInt = req.latitude !== undefined && req.longitude !== undefined;
    const payload = asInt
      ? serializeCommandInt({
        targetSystem: target.sysid, targetComponent: req.targetComponent ?? 1, frame: req.frame ?? 6,
        command: req.command, current: 0, autocontinue: 0,
        param1: p[0] ?? 0, param2: p[1] ?? 0, param3: p[2] ?? 0, param4: p[3] ?? 0,
        x: Math.round(req.latitude! * 1e7), y: Math.round(req.longitude! * 1e7), z: req.altitude ?? 0,
      })
      : serializeCommandLong({
        targetSystem: target.sysid, targetComponent: req.targetComponent ?? 1, command: req.command, confirmation: 0,
        param1: p[0] ?? 0, param2: p[1] ?? 0, param3: p[2] ?? 0, param4: p[3] ?? 0,
        param5: p[4] ?? 0, param6: p[5] ?? 0, param7: p[6] ?? 0,
      });
    const ack = new Promise<number | null>((resolve) => {
      const timer = setTimeout(() => { this.pendingAcks.delete(req.command); resolve(null); }, ACK_TIMEOUT_MS);
      this.pendingAcks.set(req.command, (r) => { clearTimeout(timer); resolve(r); });
    });
    const sent = asInt
      ? await this.backend.send(COMMAND_INT_ID, payload, COMMAND_INT_CRC_EXTRA)
      : await this.backend.send(COMMAND_LONG_ID, payload, COMMAND_LONG_CRC_EXTRA);
    if (!sent) { this.pendingAcks.delete(req.command); return { ok: false, error: 'link is closed' }; }
    if (req.noAck) return { ok: true };
    const result = await ack;
    if (result === null) return { ok: false, error: 'no answer from the vehicle' };
    return result === 0 ? { ok: true, result } : { ok: false, result, error: `vehicle refused (MAV_RESULT ${result})` };
  }

  /** Fire-and-forget steering, refused at the gate. Rate-limited per cargo. */
  async setpoint(owner: string, sp: VehicleSetpoint): Promise<VehicleSetpointResult> {
    const refusal = this.motionRefusal();
    if (refusal) return { ok: false, error: refusal };
    const target = this.backend?.target();
    if (!this.backend || !target) return { ok: false, error: 'no vehicle' };
    const values = sp.kind === 'velocityBody' ? [sp.forward, sp.right, sp.down, sp.yawRate] : [sp.latitude, sp.longitude, sp.altitude];
    if (!values.every(Number.isFinite)) return { ok: false, error: 'non-finite setpoint' };
    const now = this.now();
    if (now - (this.lastSetpointAt.get(owner) ?? -Infinity) < MIN_SETPOINT_INTERVAL_MS) return { ok: false, error: 'too fast' };
    this.lastSetpointAt.set(owner, now);
    const base = { timeBootMs: 0, targetSystem: target.sysid, targetComponent: 1 };
    if (sp.kind === 'velocityBody') {
      // MAV_FRAME_BODY_OFFSET_NED; use velocity + yaw rate only
      const payload = serializeSetPositionTargetLocalNed({
        ...base, coordinateFrame: 9, typeMask: 0b0000_0101_1100_0111,
        x: 0, y: 0, z: 0, vx: sp.forward, vy: sp.right, vz: sp.down, afx: 0, afy: 0, afz: 0, yaw: 0, yawRate: sp.yawRate,
      });
      const ok = await this.backend.send(SET_POSITION_TARGET_LOCAL_NED_ID, payload, SET_POSITION_TARGET_LOCAL_NED_CRC_EXTRA);
      return ok ? { ok: true } : { ok: false, error: 'link is closed' };
    }
    // MAV_FRAME_GLOBAL_RELATIVE_ALT_INT; use position only
    const payload = serializeSetPositionTargetGlobalInt({
      ...base, coordinateFrame: 6, typeMask: 0b0000_1101_1111_1000,
      latInt: Math.round(sp.latitude * 1e7), lonInt: Math.round(sp.longitude * 1e7), alt: sp.altitude,
      vx: 0, vy: 0, vz: 0, afx: 0, afy: 0, afz: 0, yaw: 0, yawRate: 0,
    });
    const ok = await this.backend.send(SET_POSITION_TARGET_GLOBAL_INT_ID, payload, SET_POSITION_TARGET_GLOBAL_INT_CRC_EXTRA);
    return ok ? { ok: true } : { ok: false, error: 'link is closed' };
  }
}

export const vehicleControl = new VehicleControl();
