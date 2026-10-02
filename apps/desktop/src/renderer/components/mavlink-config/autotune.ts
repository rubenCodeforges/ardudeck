// AUTOTUNE_AXES / AUTOTUNE_AGGR semantics, ported from the mobile AutoTune tab.

import { t } from '../../../shared/i18n/index.js';

export const AXIS_ROLL = 1;
export const AXIS_PITCH = 2;
export const AXIS_YAW = 4;
export const AXIS_ALL = AXIS_ROLL | AXIS_PITCH | AXIS_YAW;

export const AXES: ReadonlyArray<{ bit: number; nameKey: string }> = [
  { bit: AXIS_ROLL, nameKey: 'common:roll' },
  { bit: AXIS_PITCH, nameKey: 'common:pitch' },
  { bit: AXIS_YAW, nameKey: 'common:yaw' },
];

/** The vehicle returns a float; treat anything unknown as the firmware default (all three). */
export function normalizeAxes(value: number | undefined): number {
  const v = Math.round(value ?? AXIS_ALL);
  return v >= 1 && v <= AXIS_ALL ? v : AXIS_ALL;
}

// Tuning nothing is not a setting, it is a mode that will refuse to run.
export function toggleAxis(mask: number, bit: number): number {
  const next = (mask & bit) !== 0 ? mask & ~bit : mask | bit;
  return next === 0 ? mask : next;
}

export function axisNames(mask: number): string {
  const names = AXES.filter((a) => (mask & a.bit) !== 0).map((a) => t(a.nameKey).toLowerCase());
  return names.length === 0 ? t('mavlink-config:autotune.axesNothing') : names.join(', ');
}

export interface AggrChoice {
  value: number;
  titleKey: string;
  blurbKey: string;
}

export const AGGR_CHOICES: ReadonlyArray<AggrChoice> = [
  { value: 0.05, titleKey: 'mavlink-config:autotune.aggrGentle', blurbKey: 'mavlink-config:autotune.aggrGentleBlurb' },
  { value: 0.075, titleKey: 'mavlink-config:autotune.aggrMiddle', blurbKey: 'mavlink-config:autotune.aggrMiddleBlurb' },
  { value: 0.1, titleKey: 'mavlink-config:autotune.aggrSnappy', blurbKey: 'mavlink-config:autotune.aggrSnappyBlurb' },
];

// Three-decimal compare: the vehicle's float32 returns 0.075 as 0.07499999832.
export function aggrMatches(current: number | undefined, choice: number): boolean {
  if (current === undefined) return false;
  return Math.round(current * 1000) === Math.round(choice * 1000);
}

/** ArduPilot AutoTune flight-mode number per vehicle class; null = no such mode. */
export function autotuneModeNumber(category: 'copter' | 'plane' | 'rover'): number | null {
  if (category === 'copter') return 15;
  if (category === 'plane') return 8;
  return null;
}
