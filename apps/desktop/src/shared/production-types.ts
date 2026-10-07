// Vault layout: models/<id>/{golden.param,model.json}, units/<uid>/birth.json, production/runs/<day>.jsonl
import type { CalibrationTypeId } from './calibration-types';

/** Optical flow is iNav-only and never part of a MAVLink production line. */
export type ProductionCalibrationType = Exclude<CalibrationTypeId, 'opflow'>;

export interface ProductionRules {
  /** Calibrations each unit must have on record before it can pass. */
  requiredCalibrations: ProductionCalibrationType[];
  /** Accept a 'marginal' calibration verdict instead of only 'good'. */
  allowMarginal: boolean;
  /** Calibrations must be proven to have survived a reboot. */
  requirePersistence: boolean;
  /** Parameter names (trailing * = prefix) that may differ from the golden config. */
  ignoreParams: string[];
  /** Every sensor the autopilot reports as present and enabled must be healthy. */
  requireSensorsHealthy: boolean;
  /** Prepare wipes the board to firmware defaults first, so leftovers from supplier tests cannot ship. */
  resetParams: boolean;
  /** Prepare starts by itself when a board is plugged into a bay assigned to this model. */
  autoPrepare: boolean;
}

export interface ProductionModel {
  /** Folder name under models/ */
  id: string;
  name: string;
  vehicleType?: string;
  /** Flight stack family of the golden ('ardupilot' | 'px4'). */
  firmware?: string;
  /** Exact firmware version the golden was taken from, e.g. "4.5.7". Units must match. */
  firmwareVersion?: string;
  /** Board target the golden was taken from (connection boardId). */
  boardId?: string;
  paramCount: number;
  createdAt: number;
  updatedAt: number;
  /** Vault unit the golden was captured from, for traceability. */
  sourceUnit?: string;
  /** Firmware every unit is flashed with: models/<id>/firmware.apj */
  firmwareFile?: string;
  firmwareSha256?: string;
  /** APJ board_id of the attached firmware. */
  firmwareBoardId?: number;
  rules: ProductionRules;
}

/** Runtime counters the autopilot rewrites itself; they would fail every unit. */
export const DEFAULT_IGNORE_PARAMS: readonly string[] = [
  'STAT_*',
  'FORMAT_VERSION',
  'MIS_TOTAL',
  'FENCE_TOTAL',
  'RALLY_TOTAL',
  'SYSID_SW_*',
];

export const DEFAULT_PRODUCTION_RULES: ProductionRules = {
  requiredCalibrations: ['accel-6point', 'compass'],
  allowMarginal: false,
  requirePersistence: true,
  ignoreParams: [...DEFAULT_IGNORE_PARAMS],
  requireSensorsHealthy: true,
  resetParams: true,
  autoPrepare: false,
};

export type QaStatus = 'pass' | 'fail' | 'skip';

/** Codes and numbers only, never prose: certificates must stay auditable in any language. */
export interface QaCheck {
  /** 'firmware' | 'board' | 'config' | 'cal:<type>' | 'sensors' | 'serial' */
  id: string;
  status: QaStatus;
  code: string;
  vars?: Record<string, string | number>;
}

export interface QaConfigDelta {
  id: string;
  expected: number;
  /** null = the unit does not have this parameter at all */
  actual: number | null;
}

export interface QaReport {
  passed: boolean;
  checks: QaCheck[];
  /** Non-calibration parameters that differ from the golden config. */
  configDeltas: QaConfigDelta[];
  evaluatedAt: number;
}

export interface BirthCertificate {
  serial: string;
  unitUid: string;
  modelId: string;
  modelName: string;
  /** Vault commit holding the golden at the time this unit passed. */
  goldenOid?: string;
  firmware?: string;
  firmwareVersion?: string;
  boardId?: string;
  vehicleType?: string;
  operator: string;
  station: string;
  issuedAt: number;
  /** Calibration values and verdicts as recorded at QA time. */
  calibrations: Array<{ type: string; verdict: string; completedAt: number; written: Record<string, number> }>;
  qa: QaReport;
  notes?: string;
}

export interface ProductionRun {
  /** Random id so a run can be referenced from a ticket. */
  id: string;
  passed: boolean;
  serial: string;
  unitUid: string;
  modelId: string;
  operator: string;
  station: string;
  at: number;
  /** Failing check ids, empty on a pass. */
  failed: string[];
  notes?: string;
}
