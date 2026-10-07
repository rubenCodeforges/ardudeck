import { describe, it, expect } from 'vitest';
import { assessHealth } from './health';
import type { VehicleState } from './vehicle-state';

const GYRO = 0x01, ACCEL = 0x02, MAG = 0x04, GPS = 0x20, PREARM = 0x10000000;
const NOW = 1_000_000;

function vehicle(patch: Partial<VehicleState> = {}): VehicleState {
  return {
    sysid: 1, compid: 1, connected: true, lastHeartbeat: NOW, mavlinkVersion: 2, uid: 'u', uidFromBoard: true,
    firmware: 'ardupilot', firmwareVersion: null, boardVersion: null, mavType: 2, autopilot: 3, armed: false,
    customMode: 0, mode: 'Stabilize', systemStatus: 3,
    battery: { voltage: 12.4, current: 1, remaining: 80 },
    sensors: { present: GYRO | ACCEL | MAG | GPS, enabled: GYRO | ACCEL | MAG | GPS, health: GYRO | ACCEL | MAG | GPS },
    ekfFlags: 0x01 | 0x10,
    gps: { fixType: 3, satellites: 12, hdop: 0.8 },
    position: null, attitude: null, hud: null, messages: [],
    ...patch,
  };
}

describe('assessHealth', () => {
  it('is ok when every enabled sensor is healthy and the EKF has a position', () => {
    expect(assessHealth(vehicle(), NOW)).toMatchObject({ level: 'ok', issues: [] });
  });

  it('names an unhealthy sensor as a fault', () => {
    const h = assessHealth(vehicle({ sensors: { present: GYRO | MAG, enabled: GYRO | MAG, health: GYRO } }), NOW);
    expect(h.level).toBe('bad');
    expect(h.issues).toContain('Compass unhealthy');
  });

  it('warns with the vehicle pre-arm reasons while disarmed', () => {
    const h = assessHealth(vehicle({
      sensors: { present: GYRO | PREARM, enabled: GYRO | PREARM, health: GYRO },
      messages: [{ time: NOW - 2000, severity: 3, text: 'PreArm: Compass not calibrated' }],
    }), NOW);
    expect(h.level).toBe('warn');
    expect(h.issues).toEqual(['Compass not calibrated']);
  });

  it('ignores pre-arm messages that are no longer repeated', () => {
    const h = assessHealth(vehicle({ messages: [{ time: NOW - 60_000, severity: 3, text: 'PreArm: Old reason' }] }), NOW);
    expect(h.issues).toEqual([]);
  });

  it('reports a vehicle without heartbeat as unknown', () => {
    expect(assessHealth(vehicle({ connected: false }), NOW).level).toBe('unknown');
  });
});
