import { describe, it, expect } from 'vitest';
import {
  FLIGHT_MODES,
  GROUP_ORDER,
  modeBlockedReason,
  modeMetaFor,
  modeSubline,
  type ModeGroup,
} from './flight-mode-meta';
import type { ArduPilotVehicleClass } from './telemetry-types';

const CLASSES: ArduPilotVehicleClass[] = ['copter', 'plane', 'vtol', 'rover', 'sub'];

describe('flight-mode-meta tables', () => {
  it('has no duplicate mode numbers within a vehicle class', () => {
    for (const cls of CLASSES) {
      const nums = FLIGHT_MODES[cls].map((m) => m.modeNum);
      expect(new Set(nums).size, `${cls} has duplicate mode numbers`).toBe(nums.length);
    }
  });

  it('only uses declared groups', () => {
    const valid = new Set<ModeGroup>(GROUP_ORDER);
    for (const cls of CLASSES) {
      for (const m of FLIGHT_MODES[cls]) {
        expect(valid.has(m.group), `${cls}/${m.name} bad group`).toBe(true);
      }
    }
  });

  it('marks the return-to-home / land modes as committing', () => {
    // A mis-flagged commit is a safety bug: RTL/Land must ask for confirm.
    const copterRtl = modeMetaFor('copter', 6);
    const copterLand = modeMetaFor('copter', 9);
    expect(copterRtl?.commit).toBe(true);
    expect(copterLand?.commit).toBe(true);
  });

  it('flags GPS-dependent copter modes', () => {
    expect(modeMetaFor('copter', 5 /* Loiter */)?.gps).toBe(true);
    expect(modeMetaFor('copter', 16 /* PosHold */)?.gps).toBe(true);
    // Stabilize needs nothing.
    expect(modeMetaFor('copter', 0)?.gps).toBeUndefined();
  });
});

describe('modeBlockedReason', () => {
  it('blocks GPS modes without a fix', () => {
    const loiter = modeMetaFor('copter', 5)!;
    expect(modeBlockedReason(loiter, { gpsOk: false, armed: true })).toMatch(/GPS/);
    expect(modeBlockedReason(loiter, { gpsOk: true, armed: true })).toBeNull();
  });

  it('blocks arm-required modes while disarmed', () => {
    const auto = modeMetaFor('copter', 3)!;
    expect(modeBlockedReason(auto, { gpsOk: true, armed: false })).toMatch(/armed/);
    expect(modeBlockedReason(auto, { gpsOk: true, armed: true })).toBeNull();
  });

  it('never blocks an always-safe manual mode', () => {
    const stab = modeMetaFor('copter', 0)!;
    expect(modeBlockedReason(stab, { gpsOk: false, armed: false })).toBeNull();
  });
});

describe('modeSubline', () => {
  it('summarises group and preconditions', () => {
    expect(modeSubline(modeMetaFor('copter', 5))).toContain('GPS');
    expect(modeSubline(modeMetaFor('copter', 6))).toContain('commit');
    expect(modeSubline(modeMetaFor('copter', 0))).toContain('no GPS needed');
    expect(modeSubline(undefined)).toBe('');
  });
});
