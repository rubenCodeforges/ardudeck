// Production QA gate: pure so the rule that ships aircraft is testable without a board.
import { isCalibrationParam } from './calibration-params';
import type { CalibrationRecordIpc } from './calibration-quality';
import type {
  ProductionModel,
  QaCheck,
  QaConfigDelta,
  QaReport,
} from './production-types';

/** Firmware family a vehicle label belongs to; labels come as MAV_TYPE names ("Quadrotor") or classes ("copter"). */
export function vehicleClass(label: string | undefined): string | undefined {
  if (!label) return undefined;
  const v = label.trim().toLowerCase();
  if (/copter|rotor|coaxial|helicopter|heli/.test(v) && !/vtol/.test(v)) return 'copter';
  if (/plane|fixed wing|vtol|wing|airship|balloon|kite|parafoil/.test(v)) return 'plane';
  if (/rover|boat/.test(v)) return 'rover';
  if (/sub/.test(v)) return 'sub';
  if (/tracker/.test(v)) return 'tracker';
  return v;
}

export interface QaInput {
  model: ProductionModel;
  golden: Array<{ id: string; value: number }>;
  /** Live parameters of the unit on the station. */
  live: ReadonlyMap<string, number>;
  liveFirmware?: string;
  liveFirmwareVersion?: string;
  liveBoardId?: string;
  liveVehicleType?: string;
  calibrations: CalibrationRecordIpc[];
  /** Names of present+enabled sensors the autopilot reports unhealthy; null = no SYS_STATUS seen. */
  unhealthySensors: string[] | null;
  serial: string;
  /** Unit that already carries this serial, when it is a different board. */
  serialTakenBy: string | null;
  now?: number;
}

// GPS, RC, AHRS and PREARM excluded: legitimately unhealthy on an indoor bench.
const BENCH_SENSORS: ReadonlyArray<[number, string]> = [
  [1 << 0, 'GYRO'],
  [1 << 1, 'ACCEL'],
  [1 << 2, 'MAG'],
  [1 << 3, 'BARO'],
  [1 << 4, 'AIRSPEED'],
  [1 << 17, 'GYRO2'],
  [1 << 18, 'ACCEL2'],
  [1 << 19, 'MAG2'],
  [1 << 24, 'LOGGING'],
];

export function unhealthyBenchSensors(
  health: { present: number; enabled: number; health: number } | null | undefined,
): string[] | null {
  if (!health) return null;
  return BENCH_SENSORS
    .filter(([bit]) => (health.present & bit) && (health.enabled & bit) && !(health.health & bit))
    .map(([, name]) => name);
}

/** Same value as the autopilot would store it: float32, with a little slack for formatting. */
export function paramValuesMatch(a: number, b: number): boolean {
  if (Math.fround(a) === Math.fround(b)) return true;
  return Math.abs(a - b) <= Math.max(1e-6, 1e-5 * Math.max(Math.abs(a), Math.abs(b)));
}

export function matchesIgnore(id: string, patterns: readonly string[]): boolean {
  for (const p of patterns) {
    if (p.endsWith('*') ? id.startsWith(p.slice(0, -1)) : id === p) return true;
  }
  return false;
}

/** Golden parameters this unit must carry: everything except calibration and the ignore list. */
export function portableGoldenParams(
  golden: Array<{ id: string; value: number }>,
  ignore: readonly string[],
): Array<{ id: string; value: number }> {
  return golden.filter((p) => !isCalibrationParam(p.id) && !matchesIgnore(p.id, ignore));
}

export function configDeltas(
  golden: Array<{ id: string; value: number }>,
  live: ReadonlyMap<string, number>,
  ignore: readonly string[],
): QaConfigDelta[] {
  const out: QaConfigDelta[] = [];
  for (const p of portableGoldenParams(golden, ignore)) {
    const actual = live.get(p.id);
    if (actual === undefined) out.push({ id: p.id, expected: p.value, actual: null });
    else if (!paramValuesMatch(actual, p.value)) out.push({ id: p.id, expected: p.value, actual });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/** Latest record per calibration type. */
function latestByType(records: CalibrationRecordIpc[]): Map<string, CalibrationRecordIpc> {
  const out = new Map<string, CalibrationRecordIpc>();
  for (const r of records) {
    const prev = out.get(r.type);
    if (!prev || r.completedAt > prev.completedAt) out.set(r.type, r);
  }
  return out;
}

export function evaluateQa(input: QaInput): QaReport {
  const { model, golden, live } = input;
  const rules = model.rules;
  const checks: QaCheck[] = [];

  if (!model.firmwareVersion && !model.firmware) {
    checks.push({ id: 'firmware', status: 'skip', code: 'firmwareNotPinned' });
  } else if (model.firmware && input.liveFirmware && model.firmware !== input.liveFirmware) {
    checks.push({ id: 'firmware', status: 'fail', code: 'firmwareStackMismatch', vars: { expected: model.firmware, actual: input.liveFirmware } });
  } else if (model.firmwareVersion && input.liveFirmwareVersion !== model.firmwareVersion) {
    checks.push({
      id: 'firmware',
      status: 'fail',
      code: input.liveFirmwareVersion ? 'firmwareVersionMismatch' : 'firmwareVersionUnknown',
      vars: { expected: model.firmwareVersion, actual: input.liveFirmwareVersion ?? '' },
    });
  } else {
    checks.push({ id: 'firmware', status: 'pass', code: 'firmwareOk', vars: { version: input.liveFirmwareVersion ?? model.firmware ?? '' } });
  }

  if (!model.vehicleType) {
    checks.push({ id: 'vehicle', status: 'skip', code: 'vehicleNotPinned' });
  } else if (vehicleClass(input.liveVehicleType) !== vehicleClass(model.vehicleType)) {
    checks.push({
      id: 'vehicle',
      status: 'fail',
      code: input.liveVehicleType ? 'vehicleMismatch' : 'vehicleUnknown',
      vars: { expected: model.vehicleType, actual: input.liveVehicleType ?? '' },
    });
  } else {
    checks.push({ id: 'vehicle', status: 'pass', code: 'vehicleOk', vars: { vehicle: model.vehicleType } });
  }

  // A board that does not report its target (SITL, some boards) cannot prove it is the pinned one.
  if (!model.boardId) {
    checks.push({ id: 'board', status: 'skip', code: 'boardNotPinned' });
  } else if (!input.liveBoardId) {
    checks.push({ id: 'board', status: 'fail', code: 'boardUnknown', vars: { expected: model.boardId } });
  } else if (input.liveBoardId !== model.boardId) {
    checks.push({ id: 'board', status: 'fail', code: 'boardMismatch', vars: { expected: model.boardId, actual: input.liveBoardId } });
  } else {
    checks.push({ id: 'board', status: 'pass', code: 'boardOk', vars: { board: model.boardId } });
  }

  const deltas = live.size === 0 ? [] : configDeltas(golden, live, rules.ignoreParams);
  if (live.size === 0) {
    checks.push({ id: 'config', status: 'fail', code: 'configNoParams' });
  } else if (deltas.length > 0) {
    const missing = deltas.filter((d) => d.actual === null).length;
    checks.push({ id: 'config', status: 'fail', code: 'configDiffers', vars: { count: deltas.length, missing } });
  } else {
    checks.push({ id: 'config', status: 'pass', code: 'configMatches', vars: { count: portableGoldenParams(golden, rules.ignoreParams).length } });
  }

  const latest = latestByType(input.calibrations);
  for (const type of rules.requiredCalibrations) {
    const id = `cal:${type}`;
    const rec = latest.get(type);
    if (!rec) {
      checks.push({ id, status: 'fail', code: 'calMissing' });
      continue;
    }
    if (rec.verdict === 'bad' || (rec.verdict === 'marginal' && !rules.allowMarginal)) {
      checks.push({ id, status: 'fail', code: rec.verdict === 'bad' ? 'calBad' : 'calMarginal', vars: { summary: rec.summary } });
      continue;
    }
    if (rules.requirePersistence) {
      const state = rec.persistence?.state;
      if (state !== 'verified') {
        checks.push({ id, status: 'fail', code: state ? 'calNotPersisted' : 'calNeedsReboot', vars: { state: state ?? '' } });
        continue;
      }
    }
    checks.push({ id, status: 'pass', code: 'calOk', vars: { verdict: rec.verdict } });
  }

  if (!rules.requireSensorsHealthy) {
    checks.push({ id: 'sensors', status: 'skip', code: 'sensorsNotRequired' });
  } else if (input.unhealthySensors === null) {
    checks.push({ id: 'sensors', status: 'fail', code: 'sensorsUnknown' });
  } else if (input.unhealthySensors.length > 0) {
    checks.push({ id: 'sensors', status: 'fail', code: 'sensorsUnhealthy', vars: { sensors: input.unhealthySensors.join(', ') } });
  } else {
    checks.push({ id: 'sensors', status: 'pass', code: 'sensorsHealthy' });
  }

  const serial = input.serial.trim();
  if (!serial) {
    checks.push({ id: 'serial', status: 'fail', code: 'serialMissing' });
  } else if (input.serialTakenBy) {
    checks.push({ id: 'serial', status: 'fail', code: 'serialTaken', vars: { serial, unit: input.serialTakenBy } });
  } else {
    checks.push({ id: 'serial', status: 'pass', code: 'serialOk', vars: { serial } });
  }

  return {
    passed: checks.every((c) => c.status !== 'fail'),
    checks,
    configDeltas: deltas,
    evaluatedAt: input.now ?? Date.now(),
  };
}
