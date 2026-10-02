/**
 * AHRS_ORIENTATION, in words a person can act on.
 *
 * The parameter is the same on copter, plane and rover, and its stock labels
 * ("Yaw270Roll180") describe a rotation rather than a mounting, which is why
 * people guess. The common mountings are named here; the rest stay available
 * in a full list.
 */

import { t } from '../../../shared/i18n/index.js';

export interface BoardOrientation {
  value: number;
  /** ArduPilot's own name, so a value looked up elsewhere still matches. */
  code: string;
  label: string;
  labelKey: string;
  hintKey?: string;
}

/** What people actually mount. Order is deliberate: upright, upside down, then
 * the quarter turns, which is roughly how often each one happens. */
export const COMMON_ORIENTATIONS: BoardOrientation[] = [
  { value: 0, code: 'None', label: 'Upright, arrow forward', labelKey: 'mavlink-config:boardOrientation.uprightForward', hintKey: 'mavlink-config:boardOrientation.uprightForwardHint' }, // i18n-exempt
  { value: 8, code: 'Roll180', label: 'Upside down, arrow forward', labelKey: 'mavlink-config:boardOrientation.upsideDownForward', hintKey: 'mavlink-config:boardOrientation.upsideDownForwardHint' }, // i18n-exempt
  { value: 2, code: 'Yaw90', label: 'Upright, arrow right', labelKey: 'mavlink-config:boardOrientation.uprightRight' }, // i18n-exempt
  { value: 4, code: 'Yaw180', label: 'Upright, arrow backward', labelKey: 'mavlink-config:boardOrientation.uprightBackward' }, // i18n-exempt
  { value: 6, code: 'Yaw270', label: 'Upright, arrow left', labelKey: 'mavlink-config:boardOrientation.uprightLeft' }, // i18n-exempt
  { value: 10, code: 'Yaw90Roll180', label: 'Upside down, arrow right', labelKey: 'mavlink-config:boardOrientation.upsideDownRight' }, // i18n-exempt
  { value: 12, code: 'Pitch180', label: 'Upside down, arrow backward', labelKey: 'mavlink-config:boardOrientation.upsideDownBackward' }, // i18n-exempt
  { value: 14, code: 'Yaw270Roll180', label: 'Upside down, arrow left', labelKey: 'mavlink-config:boardOrientation.upsideDownLeft' }, // i18n-exempt
  { value: 16, code: 'Roll90', label: 'On its right edge', labelKey: 'mavlink-config:boardOrientation.rightEdge' }, // i18n-exempt
  { value: 20, code: 'Roll270', label: 'On its left edge', labelKey: 'mavlink-config:boardOrientation.leftEdge' }, // i18n-exempt
  // Pitch90 turns the arrow up (positive pitch is nose up), Pitch270 down.
  { value: 24, code: 'Pitch90', label: 'Standing, arrow up', labelKey: 'mavlink-config:boardOrientation.standingUp' }, // i18n-exempt
  { value: 25, code: 'Pitch270', label: 'Standing, arrow down', labelKey: 'mavlink-config:boardOrientation.standingDown' }, // i18n-exempt
];

/** Every value ArduPilot accepts, for the cases the common list does not name. */
export const ALL_ORIENTATIONS: Record<number, string> = {
  0: 'None', 1: 'Yaw45', 2: 'Yaw90', 3: 'Yaw135', 4: 'Yaw180', 5: 'Yaw225',
  6: 'Yaw270', 7: 'Yaw315', 8: 'Roll180', 9: 'Yaw45Roll180', 10: 'Yaw90Roll180',
  11: 'Yaw135Roll180', 12: 'Pitch180', 13: 'Yaw225Roll180', 14: 'Yaw270Roll180',
  15: 'Yaw315Roll180', 16: 'Roll90', 17: 'Yaw45Roll90', 18: 'Yaw90Roll90',
  19: 'Yaw135Roll90', 20: 'Roll270', 21: 'Yaw45Roll270', 22: 'Yaw90Roll270',
  23: 'Yaw135Roll270', 24: 'Pitch90', 25: 'Pitch270', 26: 'Yaw90Pitch180',
  27: 'Yaw270Pitch180', 28: 'Pitch90Roll90', 29: 'Pitch90Roll180',
  30: 'Pitch90Roll270', 31: 'Pitch180Roll90', 32: 'Pitch180Roll270',
  33: 'Pitch270Roll90', 34: 'Pitch270Roll180', 35: 'Pitch270Roll270',
  36: 'Yaw90Pitch180Roll90', 37: 'Yaw270Roll90', 38: 'Yaw293Pitch68Roll180',
  39: 'Pitch315', 40: 'Pitch315Roll90', 42: 'Roll45', 43: 'Roll315',
  100: 'Custom 4.1 and older', 101: 'Custom 1', 102: 'Custom 2',
};

export function orientationName(value: number): string {
  const common = COMMON_ORIENTATIONS.find((o) => o.value === value);
  if (common) return t(common.labelKey);
  return ALL_ORIENTATIONS[value] ?? t('mavlink-config:boardOrientation.valueN', { value });
}

/**
 * The check that catches a wrong choice on the bench: with the board mounted
 * as declared, tipping the vehicle nose up must read pitch up, and rolling it
 * right must read roll right. A sign flip here is the classic upside-down
 * mounting left at 0.
 */
export function orientationCheck(
  roll: number,
  pitch: number,
): { level: boolean; note: string } {
  const level = Math.abs(roll) < 5 && Math.abs(pitch) < 5;
  return {
    level,
    note: level
      ? t('mavlink-config:boardOrientation.checkLevel')
      : t('mavlink-config:boardOrientation.checkTilted', { roll: Math.round(roll), pitch: Math.round(pitch) }),
  };
}

/** Rotation encoded in an ArduPilot orientation name, in degrees. The names are
 * built from the rotations themselves ("Yaw270Roll180"), so the picture can be
 * drawn from the name instead of a hand-kept table of 46 transforms. */
export function orientationRotation(value: number): { yaw: number; pitch: number; roll: number } {
  const code = ALL_ORIENTATIONS[value] ?? '';
  const part = (axis: string) => Number(new RegExp(`${axis}(\\d+)`).exec(code)?.[1] ?? 0);
  return { yaw: part('Yaw'), pitch: part('Pitch'), roll: part('Roll') };
}

/** True when the board ends up with its top face pointing down. */
export function isInverted(value: number): boolean {
  const { roll, pitch } = orientationRotation(value);
  return roll === 180 || pitch === 180;
}
