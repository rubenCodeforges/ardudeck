/**
 * Arming checks across firmware generations.
 *
 * Up to ArduPilot 4.6 the parameter was ARMING_CHECK, a mask of checks to RUN,
 * with bit 0 meaning "all". From 4.7 it is ARMING_SKIPCHK, a mask of checks to
 * SKIP, where 0 means everything runs and -1 skips every non-mandatory one.
 * Same bit positions, opposite meaning, so a UI written against one silently
 * inverts on the other: showing every check as disabled, or worse, turning them
 * off while claiming to turn them on.
 */

export type ArmingParam = 'ARMING_CHECK' | 'ARMING_SKIPCHK';

export interface ArmingModel {
  param: ArmingParam;
  /** 'run' = bits are checks that run; 'skip' = bits are checks that are skipped. */
  sense: 'run' | 'skip';
}

export interface ArmingCheckBit {
  /** Bit index, identical in both parameters. */
  bit: number;
  name: string;
  descriptionKey: string;
  /** Plane-only check, hidden elsewhere. */
  planeOnly?: boolean;
}

/** Bit list from AP_Arming's own documentation. Bit 0 was "all" on the old
 * parameter and has no equivalent on the new one. */
export const ARMING_CHECK_BITS: ArmingCheckBit[] = [
  { bit: 1, name: 'Barometer', descriptionKey: 'mavlink-config:armingChecks.bit1Desc' },
  { bit: 2, name: 'Compass', descriptionKey: 'mavlink-config:armingChecks.bit2Desc' },
  { bit: 3, name: 'GPS lock', descriptionKey: 'mavlink-config:armingChecks.bit3Desc' },
  { bit: 4, name: 'INS', descriptionKey: 'mavlink-config:armingChecks.bit4Desc' },
  { bit: 5, name: 'Parameters', descriptionKey: 'mavlink-config:armingChecks.bit5Desc' },
  { bit: 6, name: 'RC channels', descriptionKey: 'mavlink-config:armingChecks.bit6Desc' },
  { bit: 7, name: 'Board voltage', descriptionKey: 'mavlink-config:armingChecks.bit7Desc' }, // i18n-exempt
  { bit: 8, name: 'Battery level', descriptionKey: 'mavlink-config:armingChecks.bit8Desc' }, // i18n-exempt
  { bit: 9, name: 'Airspeed', descriptionKey: 'mavlink-config:armingChecks.bit9Desc', planeOnly: true },
  { bit: 10, name: 'Logging', descriptionKey: 'mavlink-config:armingChecks.bit10Desc' },
  { bit: 11, name: 'Safety switch', descriptionKey: 'mavlink-config:armingChecks.bit11Desc' }, // i18n-exempt
  { bit: 12, name: 'GPS configuration', descriptionKey: 'mavlink-config:armingChecks.bit12Desc' },
  { bit: 13, name: 'System', descriptionKey: 'mavlink-config:armingChecks.bit13Desc' },
  { bit: 14, name: 'Mission', descriptionKey: 'mavlink-config:armingChecks.bit14Desc' },
  { bit: 15, name: 'Rangefinder', descriptionKey: 'mavlink-config:armingChecks.bit15Desc' },
  { bit: 16, name: 'Camera', descriptionKey: 'mavlink-config:armingChecks.bit16Desc' },
  { bit: 17, name: 'AuxAuth', descriptionKey: 'mavlink-config:armingChecks.bit17Desc' },
  { bit: 18, name: 'Visual odometry', descriptionKey: 'mavlink-config:armingChecks.bit18Desc' }, // i18n-exempt
  { bit: 19, name: 'FFT', descriptionKey: 'mavlink-config:armingChecks.bit19Desc' },
];

/** Which parameter this board speaks. SKIPCHK wins when both are present, as
 * that is the one 4.7 acts on. */
export function detectArmingModel(has: (param: string) => boolean): ArmingModel | null {
  if (has('ARMING_SKIPCHK')) return { param: 'ARMING_SKIPCHK', sense: 'skip' };
  if (has('ARMING_CHECK')) return { param: 'ARMING_CHECK', sense: 'run' };
  return null;
}

/** Value meaning "every check runs". */
export function allChecksValue(model: ArmingModel): number {
  return model.sense === 'skip' ? 0 : 1;
}

/** Value meaning "skip everything that may be skipped". */
export function noChecksValue(model: ArmingModel): number {
  return model.sense === 'skip' ? -1 : 0;
}

export function isAllChecks(model: ArmingModel, value: number): boolean {
  return value === allChecksValue(model);
}

export function isNoChecks(model: ArmingModel, value: number): boolean {
  return value === noChecksValue(model);
}

/** True when this check runs, whichever way the parameter is written. */
export function isCheckEnabled(model: ArmingModel, value: number, bit: number): boolean {
  if (model.sense === 'skip') {
    if (value === -1) return false;
    return (value & (1 << bit)) === 0;
  }
  if (value === 1) return true;
  return (value & (1 << bit)) !== 0;
}

/**
 * The value that flips one check, expanding the shorthand first: "all" on the
 * old parameter and -1 on the new one carry no per-bit detail, so turning one
 * check off from either would otherwise change every other check too.
 */
export function toggleCheck(
  model: ArmingModel,
  value: number,
  bit: number,
  bits: ArmingCheckBit[] = ARMING_CHECK_BITS,
): number {
  const mask = bits.reduce((acc, b) => acc | (1 << b.bit), 0);
  if (model.sense === 'skip') {
    const base = value === -1 ? mask : value;
    return base ^ (1 << bit);
  }
  const base = value === 1 ? mask : value;
  return base ^ (1 << bit);
}

/** The value with one check forced off, used where a card offers to silence a
 * specific refusal (logging with no SD card, say). */
export function withCheckDisabled(
  model: ArmingModel,
  value: number,
  bit: number,
  bits: ArmingCheckBit[] = ARMING_CHECK_BITS,
): number {
  if (!isCheckEnabled(model, value, bit)) return value;
  return toggleCheck(model, value, bit, bits);
}
