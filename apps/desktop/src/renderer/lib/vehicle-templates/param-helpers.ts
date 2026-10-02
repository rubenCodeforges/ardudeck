import type { VehicleProfile } from '../../stores/settings-store.js';
import type { ParamSpec } from './types.js';
import { t } from '../../../shared/i18n/index.js';

/**
 * Low-voltage cut cell voltage (V/cell). 3.5V is standard for LiPo LOW warning.
 * Chemistry-aware: LiHV is set higher, LiFePO4 lower.
 */
const LOW_CELL_V: Record<string, number> = {
  lipo: 3.50, lihv: 3.60, lion: 3.40, life: 2.90,
};
const CRIT_CELL_V: Record<string, number> = {
  lipo: 3.30, lihv: 3.40, lion: 3.20, life: 2.70,
};

/**
 * Battery params — common across all vehicle types. Only emitted when the
 * profile supplies both `batteryCells` and `batteryCapacity`.
 */
export function batteryParams(p: VehicleProfile): ParamSpec[] {
  if (!p.batteryCells || !p.batteryCapacity) return [];
  const chem = p.batteryChemistry ?? 'lipo';
  const low = (LOW_CELL_V[chem] ?? 3.5) * p.batteryCells;
  const crit = (CRIT_CELL_V[chem] ?? 3.3) * p.batteryCells;
  return [
    {
      name: 'BATT_CAPACITY',
      value: p.batteryCapacity,
      reason: t('lib:vehicleTemplates.helpers.capacity', { capacity: p.batteryCapacity }),
    },
    {
      name: 'BATT_LOW_VOLT',
      value: round(low, 2),
      reason: t('lib:vehicleTemplates.helpers.lowVolt', { cells: p.batteryCells, volts: LOW_CELL_V[chem], chem: chem.toUpperCase() }),
    },
    {
      name: 'BATT_CRT_VOLT',
      value: round(crit, 2),
      reason: t('lib:vehicleTemplates.helpers.critVolt', { cells: p.batteryCells, volts: CRIT_CELL_V[chem], chem: chem.toUpperCase() }),
    },
    {
      name: 'BATT_MONITOR',
      value: 4, // Analog voltage + current (most common)
      reason: t('lib:vehicleTemplates.helpers.battMonitor'),
    },
  ];
}

/**
 * Airspeed envelope for fixed-wing. Derives MIN/CRUISE/MAX from stallSpeed
 * with the classic ArduPilot recommended multipliers.
 */
export function airspeedParams(p: VehicleProfile): ParamSpec[] {
  if (!p.stallSpeed || p.stallSpeed <= 0) return [];
  const stall = p.stallSpeed;
  return [
    {
      name: 'AIRSPEED_MIN',
      value: round(stall * 1.15, 1),
      reason: t('lib:vehicleTemplates.helpers.airspeedMin', { speed: round(stall * 1.15, 1) }),
    },
    {
      name: 'AIRSPEED_CRUISE',
      value: round(stall * 1.5, 1),
      reason: t('lib:vehicleTemplates.helpers.airspeedCruise', { speed: round(stall * 1.5, 1) }),
    },
    {
      name: 'AIRSPEED_MAX',
      value: round(stall * 2.2, 1),
      reason: t('lib:vehicleTemplates.helpers.airspeedMax', { speed: round(stall * 2.2, 1) }),
    },
    {
      name: 'TRIM_ARSPD_CM',
      value: Math.round(stall * 150),  // cm/s (cruise × 100)
      reason: t('lib:vehicleTemplates.helpers.trimAirspeed'),
    },
  ];
}

/**
 * Elevon output mixing for delta / flying-wing planes. Maps SERVO1 to elevon
 * left, SERVO2 to elevon right (ArduPilot function codes 77, 78).
 */
export function elevonServoParams(): ParamSpec[] {
  return [
    { name: 'SERVO1_FUNCTION', value: 77, reason: t('lib:vehicleTemplates.helpers.elevonLeft'), requiresReboot: true },
    { name: 'SERVO2_FUNCTION', value: 78, reason: t('lib:vehicleTemplates.helpers.elevonRight'), requiresReboot: true },
    { name: 'MIXING_GAIN', value: 0.5, reason: t('lib:vehicleTemplates.helpers.elevonGain') },
  ];
}

/**
 * V-tail mixing — two surfaces combine yaw+pitch (ArduPilot functions 79, 80).
 */
export function vtailServoParams(): ParamSpec[] {
  return [
    { name: 'SERVO1_FUNCTION', value: 79, reason: t('lib:vehicleTemplates.helpers.vtailLeft'), requiresReboot: true },
    { name: 'SERVO2_FUNCTION', value: 80, reason: t('lib:vehicleTemplates.helpers.vtailRight'), requiresReboot: true },
    { name: 'MIXING_GAIN', value: 0.5, reason: t('lib:vehicleTemplates.helpers.vtailGain') },
  ];
}

/**
 * SITL physics params — always safe to emit (server silently ignores on real FC
 * because these only exist in SITL builds). We only include SIM_BATT_* when we
 * have cell data and SIM_ENGINE_MUL when thrustToWeight is known.
 */
export function simPhysicsParams(p: VehicleProfile): ParamSpec[] {
  const out: ParamSpec[] = [];
  if (p.batteryCells) {
    const chem = p.batteryChemistry ?? 'lipo';
    const nominal: Record<string, number> = { lipo: 3.7, lihv: 3.8, lion: 3.6, life: 3.3 };
    const fullVolt = p.batteryCells * 4.20;
    const nominalVolt = p.batteryCells * (nominal[chem] ?? 3.7);
    out.push(
      { name: 'SIM_BATT_VOLTAGE', value: round(fullVolt, 2), reason: t('lib:vehicleTemplates.helpers.simVoltage', { cells: p.batteryCells }) },
    );
    if (p.batteryCapacity) {
      out.push({ name: 'SIM_BATT_CAP_AH', value: round(p.batteryCapacity / 1000, 3), reason: t('lib:vehicleTemplates.helpers.simCapacity', { capacity: p.batteryCapacity }) });
    }
    void nominalVolt; // kept for future extension (discharge curve)
  }
  if (p.thrustToWeight && p.thrustToWeight > 0) {
    // SIM_ENGINE_MUL multiplies the default engine power. Clamp to a reasonable range.
    const mul = Math.min(Math.max(p.thrustToWeight / 2.0, 0.3), 3.0);
    out.push({ name: 'SIM_ENGINE_MUL', value: round(mul, 3), reason: t('lib:vehicleTemplates.helpers.simEngine', { ratio: p.thrustToWeight }) });
  }
  if (p.dragCoefficient && p.dragCoefficient > 0) {
    out.push({ name: 'SIM_DRAG_COEF', value: round(p.dragCoefficient, 3), reason: t('lib:vehicleTemplates.helpers.simDrag') });
  }
  if (p.servoSpeed && p.servoSpeed > 0) {
    out.push({ name: 'SIM_SERVO_SPEED', value: round(1000 / p.servoSpeed, 4), reason: t('lib:vehicleTemplates.helpers.simServo', { speed: p.servoSpeed }) });
  }
  return out;
}

/**
 * Arming / safety defaults that belong on any template. Kept small —
 * templates can still override via their own toParams.
 */
export function commonSafetyParams(): ParamSpec[] {
  return [
    { name: 'ARMING_CHECK', value: 1, reason: t('lib:vehicleTemplates.helpers.armingCheck') },
  ];
}

function round(n: number, digits: number): number {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}

/**
 * inferFrom helper: matches that a param exists with a specific value.
 * Returns 1 if match, 0 if mismatch, 0 if absent. Callers average / sum
 * these across several "signature" params to build a confidence score.
 */
export function matches(paramMap: Map<string, number>, name: string, value: number): 0 | 1 {
  const v = paramMap.get(name);
  if (v === undefined) return 0;
  return Math.abs(v - value) < 0.5 ? 1 : 0;
}
