/**
 * Preconditions for handing the sticks to a joystick.
 *
 * Mission Planner lets you tick "enable" at any stick position, so the aircraft
 * takes whatever the gamepad happens to be holding: full throttle if a trigger
 * rests there, hard roll if the stick is deflected. These checks refuse until
 * the controls are somewhere safe, and say which one is wrong.
 */

import { RC_MID, shapeAxis, type ChannelMap, type RawDevice } from './pseudo-tx';
import { t } from '../../shared/i18n/index.js';

/** Stick units (-1..1) a control may sit from centre and still count as centred. */
const CENTRE_TOLERANCE = 0.12;
/** Throttle above this fraction of its travel blocks taking control. */
const THROTTLE_MAX_FRACTION = 0.08;

export interface ControlCheck {
  ok: boolean;
  /** One line per failing condition, in the order a pilot would fix them. */
  problems: string[];
}

/** Value of one mapped channel in stick units, or null when unmapped. */
export function channelValue(mapping: ChannelMap[], dev: RawDevice, channel: number): number | null {
  const map = mapping[channel];
  if (!map || map.source.kind === 'none') return null;
  switch (map.source.kind) {
    case 'axis':
      return shapeAxis(dev.axes[map.source.index] ?? 0, map);
    case 'button':
      return (dev.buttons[map.source.index] ? 1 : -1) * (map.reverse ? -1 : 1);
    case 'button3': {
      const lo = dev.buttons[map.source.low] ?? false;
      const hi = dev.buttons[map.source.high] ?? false;
      return (hi ? 1 : lo ? -1 : 0) * (map.reverse ? -1 : 1);
    }
  }
}

/**
 * Is it safe to hand the sticks over right now? Roll, pitch and yaw must be
 * centred and throttle at the bottom, so the aircraft keeps doing what it was
 * doing at the moment of handover.
 */
export function preflightForControl(mapping: ChannelMap[], dev: RawDevice): ControlCheck {
  const problems: string[] = [];

  const roll = channelValue(mapping, dev, 0);
  const pitch = channelValue(mapping, dev, 1);
  const throttle = channelValue(mapping, dev, 2);
  const yaw = channelValue(mapping, dev, 3);

  if (roll === null || pitch === null || throttle === null || yaw === null) {
    problems.push(t('utils:joystickSafety.assignAxes'));
    return { ok: false, problems };
  }

  const offCentre: string[] = [];
  if (Math.abs(roll) > CENTRE_TOLERANCE) offCentre.push(t('utils:joystickSafety.axisRoll'));
  if (Math.abs(pitch) > CENTRE_TOLERANCE) offCentre.push(t('utils:joystickSafety.axisPitch'));
  if (Math.abs(yaw) > CENTRE_TOLERANCE) offCentre.push(t('utils:joystickSafety.axisYaw'));
  if (offCentre.length > 0) {
    problems.push(t('utils:joystickSafety.centreSticks', { axes: offCentre.join(', '), count: offCentre.length }));
  }

  // Throttle runs -1 (idle) to +1 (full), so the fraction of travel is (v+1)/2.
  if ((throttle + 1) / 2 > THROTTLE_MAX_FRACTION) problems.push(t('utils:joystickSafety.closeThrottle'));

  return { ok: problems.length === 0, problems };
}

/** PWM a channel would be commanded at right now, for the live preview. */
export function channelPwm(mapping: ChannelMap[], dev: RawDevice, channel: number): number | null {
  const v = channelValue(mapping, dev, channel);
  return v === null ? null : Math.round(RC_MID + v * 500);
}
