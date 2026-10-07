import { describe, it, expect } from 'vitest';
import { evaluateQa, configDeltas, matchesIgnore, paramValuesMatch, unhealthyBenchSensors, type QaInput } from './production-qa';
import { DEFAULT_PRODUCTION_RULES, type ProductionModel } from './production-types';
import type { CalibrationRecordIpc } from './calibration-quality';

const model: ProductionModel = {
  id: 'agri-octo',
  name: 'Agri Octo',
  firmware: 'ardupilot',
  firmwareVersion: '4.5.7',
  boardId: 'CubeOrange',
  vehicleType: 'copter',
  paramCount: 4,
  createdAt: 0,
  updatedAt: 0,
  rules: { ...DEFAULT_PRODUCTION_RULES },
};

const golden = [
  { id: 'FRAME_CLASS', value: 3 },
  { id: 'ATC_RAT_RLL_P', value: 0.135 },
  { id: 'COMPASS_OFS_X', value: 12 },
  { id: 'STAT_BOOTCNT', value: 40 },
];

const cal = (type: string, over: Partial<CalibrationRecordIpc> = {}): CalibrationRecordIpc => ({
  type,
  written: {},
  verdict: 'good',
  summary: '',
  completedAt: 1,
  persistence: { state: 'verified', summary: '', mismatched: [], checkedAt: 2 },
  ...over,
});

function input(over: Partial<QaInput> = {}): QaInput {
  return {
    model,
    golden,
    live: new Map([
      ['FRAME_CLASS', 3],
      ['ATC_RAT_RLL_P', Math.fround(0.135)],
      ['COMPASS_OFS_X', -80],
      ['STAT_BOOTCNT', 3],
    ]),
    liveFirmware: 'ardupilot',
    liveFirmwareVersion: '4.5.7',
    liveBoardId: 'CubeOrange',
    liveVehicleType: 'copter',
    calibrations: [cal('accel-6point'), cal('compass')],
    unhealthySensors: [],
    serial: 'AO-0001',
    serialTakenBy: null,
    now: 5,
    ...over,
  };
}

const check = (r: ReturnType<typeof evaluateQa>, id: string) => r.checks.find((c) => c.id === id)!;

describe('evaluateQa', () => {
  it('passes a unit that matches the golden, ignoring calibration and runtime counters', () => {
    const r = evaluateQa(input());
    expect(r.passed).toBe(true);
    expect(r.configDeltas).toEqual([]);
  });

  it('fails on a portable parameter difference and on a missing parameter', () => {
    const live = new Map([['FRAME_CLASS', 1], ['COMPASS_OFS_X', 0]]);
    const r = evaluateQa(input({ live }));
    expect(r.passed).toBe(false);
    expect(check(r, 'config')).toMatchObject({ status: 'fail', code: 'configDiffers', vars: { count: 2, missing: 1 } });
    expect(r.configDeltas.map((d) => d.id)).toEqual(['ATC_RAT_RLL_P', 'FRAME_CLASS']);
  });

  it('fails with no parameters loaded instead of passing an empty comparison', () => {
    const r = evaluateQa(input({ live: new Map() }));
    expect(check(r, 'config').code).toBe('configNoParams');
    expect(r.passed).toBe(false);
  });

  it('fails a different firmware version or stack', () => {
    expect(check(evaluateQa(input({ liveFirmwareVersion: '4.6.0' })), 'firmware').code).toBe('firmwareVersionMismatch');
    expect(check(evaluateQa(input({ liveFirmware: 'px4' })), 'firmware').code).toBe('firmwareStackMismatch');
    expect(check(evaluateQa(input({ liveFirmwareVersion: undefined })), 'firmware').code).toBe('firmwareVersionUnknown');
  });

  it('fails a different board target, and a board that does not report one', () => {
    expect(check(evaluateQa(input({ liveBoardId: 'Pixhawk6X' })), 'board').code).toBe('boardMismatch');
    expect(check(evaluateQa(input({ liveBoardId: undefined })), 'board').code).toBe('boardUnknown');
  });

  it('matches vehicle labels by class, whatever source named them', () => {
    expect(check(evaluateQa(input({ model: { ...model, vehicleType: 'Quadrotor' }, liveVehicleType: 'copter' })), 'vehicle').status).toBe('pass');
    expect(check(evaluateQa(input({ model: { ...model, vehicleType: 'Fixed Wing' }, liveVehicleType: 'copter' })), 'vehicle').code).toBe('vehicleMismatch');
  });

  it('fails a golden for another vehicle type before judging its parameters', () => {
    expect(check(evaluateQa(input({ liveVehicleType: 'plane' })), 'vehicle').code).toBe('vehicleMismatch');
    expect(check(evaluateQa(input({ liveVehicleType: undefined })), 'vehicle').code).toBe('vehicleUnknown');
  });

  it('requires each calibration on record, good, and verified after reboot', () => {
    expect(check(evaluateQa(input({ calibrations: [cal('compass')] })), 'cal:accel-6point').code).toBe('calMissing');
    expect(check(evaluateQa(input({ calibrations: [cal('accel-6point', { verdict: 'marginal' }), cal('compass')] })), 'cal:accel-6point').code).toBe('calMarginal');
    expect(check(evaluateQa(input({ calibrations: [cal('accel-6point', { persistence: null }), cal('compass')] })), 'cal:accel-6point').code).toBe('calNeedsReboot');
    expect(
      check(evaluateQa(input({
        calibrations: [cal('accel-6point', { persistence: { state: 'not-persisted', summary: '', mismatched: [], checkedAt: 2 } }), cal('compass')],
      })), 'cal:accel-6point').code,
    ).toBe('calNotPersisted');
  });

  it('judges the latest record of a type, not an older good one', () => {
    const r = evaluateQa(input({ calibrations: [cal('accel-6point'), cal('accel-6point', { verdict: 'bad', completedAt: 9 }), cal('compass')] }));
    expect(check(r, 'cal:accel-6point').code).toBe('calBad');
  });

  it('accepts marginal and unverified calibrations when the model allows it', () => {
    const relaxed = { ...model, rules: { ...model.rules, allowMarginal: true, requirePersistence: false } };
    const r = evaluateQa(input({ model: relaxed, calibrations: [cal('accel-6point', { verdict: 'marginal', persistence: null }), cal('compass')] }));
    expect(r.passed).toBe(true);
  });

  it('fails unhealthy or unknown sensor health', () => {
    expect(check(evaluateQa(input({ unhealthySensors: ['GPS'] })), 'sensors').code).toBe('sensorsUnhealthy');
    expect(check(evaluateQa(input({ unhealthySensors: null })), 'sensors').code).toBe('sensorsUnknown');
  });

  it('fails a missing or duplicate serial', () => {
    expect(check(evaluateQa(input({ serial: '  ' })), 'serial').code).toBe('serialMissing');
    expect(check(evaluateQa(input({ serialTakenBy: 'board-b' })), 'serial').code).toBe('serialTaken');
  });

  it('skips firmware and board checks when the model does not pin them', () => {
    const loose = { ...model, firmware: undefined, firmwareVersion: undefined, boardId: undefined, vehicleType: undefined };
    const r = evaluateQa(input({ model: loose, liveFirmwareVersion: '9.9.9', liveBoardId: 'Other' }));
    expect(check(r, 'firmware').status).toBe('skip');
    expect(check(r, 'board').status).toBe('skip');
    expect(check(r, 'vehicle').status).toBe('skip');
    expect(r.passed).toBe(true);
  });
});

describe('helpers', () => {
  it('matches float32 round-trips', () => {
    expect(paramValuesMatch(0.135, Math.fround(0.135))).toBe(true);
    expect(paramValuesMatch(0.135, 0.136)).toBe(false);
  });

  it('matches exact names and prefixes', () => {
    expect(matchesIgnore('STAT_RUNTIME', ['STAT_*'])).toBe(true);
    expect(matchesIgnore('MIS_TOTAL', ['MIS_TOTAL'])).toBe(true);
    expect(matchesIgnore('MIS_TOTALX', ['MIS_TOTAL'])).toBe(false);
  });

  it('honours a custom ignore list', () => {
    const live = new Map([['FRAME_CLASS', 1], ['ATC_RAT_RLL_P', 0.135]]);
    expect(configDeltas(golden, live, ['FRAME_*', 'STAT_*'])).toEqual([]);
  });
});

describe('unhealthyBenchSensors', () => {
  it('reports present, enabled, unhealthy bench sensors only', () => {
    const LOG = 1 << 24;
    const GPS = 1 << 5;
    expect(unhealthyBenchSensors({ present: 0x7 | LOG | GPS, enabled: 0x7 | LOG | GPS, health: 0x3 })).toEqual(['MAG', 'LOGGING']);
    expect(unhealthyBenchSensors(null)).toBeNull();
  });
});
