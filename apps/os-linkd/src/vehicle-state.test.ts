import { describe, it, expect } from 'vitest';
import {
  type MAVLinkPacket,
  HEARTBEAT_ID, serializeHeartbeat,
  SYS_STATUS_ID, serializeSysStatus,
  STATUSTEXT_ID, serializeStatustext,
  AUTOPILOT_VERSION_ID, serializeAutopilotVersion,
} from '@ardudeck/mavlink-ts';
import { VehicleTracker, LINK_TIMEOUT_MS } from './vehicle-state.js';

function packet(msgid: number, payload: Uint8Array, sysid = 1, compid = 1): MAVLinkPacket {
  return {
    sysid, compid, msgid, seq: 0, payload, isMavlink2: true, isSigned: false, crcValidated: true,
    rxtime: Date.now(), buffer: payload,
  } as unknown as MAVLinkPacket;
}

function heartbeat(opts: { type?: number; autopilot?: number; baseMode?: number; customMode?: number; systemStatus?: number } = {}) {
  return serializeHeartbeat({
    type: opts.type ?? 2,
    autopilot: opts.autopilot ?? 3,
    baseMode: opts.baseMode ?? 0,
    customMode: opts.customMode ?? 5,
    systemStatus: opts.systemStatus ?? 3,
    mavlinkVersion: 3,
  });
}

describe('VehicleTracker', () => {
  it('tracks an ArduPilot copter from its heartbeat', () => {
    const t = new VehicleTracker();
    expect(t.handle(packet(HEARTBEAT_ID, heartbeat()), 1000)).toBe('new');
    const v = t.current!;
    expect(v).toMatchObject({ connected: true, firmware: 'ardupilot', mode: 'Loiter', armed: false, uid: 'mavlink-1' });
  });

  it('reads armed from base_mode only once the vehicle is past boot', () => {
    const t = new VehicleTracker();
    t.handle(packet(HEARTBEAT_ID, heartbeat({ baseMode: 0x80, systemStatus: 4 })));
    expect(t.current!.armed).toBe(true);
    t.handle(packet(HEARTBEAT_ID, heartbeat({ baseMode: 0x80, systemStatus: 1 })));
    expect(t.current!.armed).toBe(false);
  });

  it('ignores GCS and telemetry-radio heartbeats', () => {
    const t = new VehicleTracker();
    expect(t.handle(packet(HEARTBEAT_ID, heartbeat({ type: 6, autopilot: 8 }), 255, 190))).toBeNull();
    expect(t.handle(packet(HEARTBEAT_ID, heartbeat(), 1, 68))).toBeNull();
    expect(t.current).toBeNull();
  });

  it('decodes battery and keeps unknown values as null', () => {
    const t = new VehicleTracker();
    t.handle(packet(HEARTBEAT_ID, heartbeat()));
    t.handle(packet(SYS_STATUS_ID, serializeSysStatus({
      onboardControlSensorsPresent: 0, onboardControlSensorsEnabled: 0, onboardControlSensorsHealth: 0,
      load: 0, voltageBattery: 15800, currentBattery: -1, batteryRemaining: 76, dropRateComm: 0,
      errorsComm: 0, errorsCount1: 0, errorsCount2: 0, errorsCount3: 0, errorsCount4: 0,
    } as never)));
    expect(t.current!.battery).toEqual({ voltage: 15.8, current: null, remaining: 76 });
  });

  it('keeps the last status messages', () => {
    const t = new VehicleTracker();
    t.handle(packet(HEARTBEAT_ID, heartbeat()));
    t.handle(packet(STATUSTEXT_ID, serializeStatustext({ severity: 4, text: 'PreArm: GPS not healthy', id: 0, chunkSeq: 0 })));
    expect(t.current!.messages.at(-1)).toMatchObject({ severity: 4, text: 'PreArm: GPS not healthy' });
  });

  it('switches to the board UID from AUTOPILOT_VERSION', () => {
    const t = new VehicleTracker();
    t.handle(packet(HEARTBEAT_ID, heartbeat()));
    const uid2 = Array.from({ length: 18 }, (_, i) => (i < 4 ? 0xab : 0));
    const event = t.handle(packet(AUTOPILOT_VERSION_ID, serializeAutopilotVersion({
      capabilities: 0n, flightSwVersion: (4 << 24) | (7 << 16) | (1 << 8), middlewareSwVersion: 0, osSwVersion: 0,
      boardVersion: 0, flightCustomVersion: [0, 0, 0, 0, 0, 0, 0, 0], middlewareCustomVersion: [0, 0, 0, 0, 0, 0, 0, 0],
      osCustomVersion: [0, 0, 0, 0, 0, 0, 0, 0], vendorId: 0, productId: 0, uid: 0n, uid2,
    })));
    expect(event).toBe('identity');
    expect(t.current).toMatchObject({ uid: `abababab${'00'.repeat(14)}`, uidFromBoard: true, firmwareVersion: '4.7.1' });
  });

  it('marks the link lost after the heartbeat timeout and re-announces on return', () => {
    const t = new VehicleTracker();
    t.handle(packet(HEARTBEAT_ID, heartbeat()), 1000);
    expect(t.checkTimeout(1000 + LINK_TIMEOUT_MS - 1)).toBe(false);
    expect(t.checkTimeout(1000 + LINK_TIMEOUT_MS + 1)).toBe(true);
    expect(t.current!.connected).toBe(false);
    expect(t.handle(packet(HEARTBEAT_ID, heartbeat()), 9000)).toBe('new');
  });
});
