import { t } from '../../shared/i18n/index.js';

/**
 * Putting a flight function on a different stick.
 *
 * RCMAP_ROLL/PITCH/THROTTLE/YAW say which RC channel carries which function,
 * so moving throttle to the elevator stick is a parameter change on the
 * vehicle, not a mixer edit on the radio: it works with any transmitter and
 * undoes cleanly. Two functions must never share a channel (the second one
 * silently wins), so an assignment always swaps rather than overwrites.
 */

export type StickFunction = 'roll' | 'pitch' | 'throttle' | 'yaw';

export interface Rcmap {
  roll: number;
  pitch: number;
  throttle: number;
  yaw: number;
}

export const STICK_FUNCTIONS: StickFunction[] = ['roll', 'pitch', 'throttle', 'yaw'];

export const RCMAP_PARAM: Record<StickFunction, string> = {
  roll: 'RCMAP_ROLL',
  pitch: 'RCMAP_PITCH',
  throttle: 'RCMAP_THROTTLE',
  yaw: 'RCMAP_YAW',
};

export const DEFAULT_RCMAP: Rcmap = { roll: 1, pitch: 2, throttle: 3, yaw: 4 };

/** Throttle on the self-centering elevator stick, the usual ask for driving a
 * rover with an aircraft transmitter. */
export const ELEVATOR_THROTTLE_RCMAP: Rcmap = { roll: 1, pitch: 3, throttle: 2, yaw: 4 };

export const MIN_CHANNEL = 1;
export const MAX_CHANNEL = 16;

/** Assign `fn` to `channel`, handing whatever was there the channel `fn` left. */
export function assignChannel(map: Rcmap, fn: StickFunction, channel: number): Rcmap {
  if (channel < MIN_CHANNEL || channel > MAX_CHANNEL || !Number.isInteger(channel)) return map;
  const next = { ...map };
  const previous = map[fn];
  if (previous === channel) return map;
  const displaced = STICK_FUNCTIONS.find((f) => f !== fn && map[f] === channel);
  next[fn] = channel;
  if (displaced) next[displaced] = previous;
  return next;
}

/** The RCMAP writes needed to get from `from` to `to`, in parameter order. */
export function rcmapChanges(from: Rcmap, to: Rcmap): Array<{ param: string; value: number }> {
  return STICK_FUNCTIONS
    .filter((fn) => from[fn] !== to[fn])
    .map((fn) => ({ param: RCMAP_PARAM[fn], value: to[fn] }));
}

/**
 * Which channel the pilot is moving: the one that has travelled furthest from
 * where it sat when learning started, and by a margin over the runner-up so a
 * twitchy channel or a noisy receiver cannot win by a few microseconds.
 */
export function movedChannel(
  baseline: number[],
  current: number[],
  opts: { minTravel?: number; margin?: number } = {},
): number | null {
  const minTravel = opts.minTravel ?? 150;
  const margin = opts.margin ?? 2;
  let best = -1;
  let bestTravel = 0;
  let runnerUp = 0;
  for (let i = 0; i < current.length; i++) {
    const from = baseline[i];
    const to = current[i];
    if (from === undefined || to === undefined || from === 0 || to === 0) continue;
    const travel = Math.abs(to - from);
    if (travel > bestTravel) {
      runnerUp = bestTravel;
      bestTravel = travel;
      best = i;
    } else if (travel > runnerUp) {
      runnerUp = travel;
    }
  }
  if (best < 0 || bestTravel < minTravel) return null;
  if (runnerUp > 0 && bestTravel < runnerUp * margin) return null;
  return best + 1;
}

/** What each stick is called on this kind of vehicle. */
export function stickLabel(fn: StickFunction, isGround: boolean): string {
  if (!isGround) {
    return t(`utils:stickAssign.air.${fn}`);
  }
  return t(`utils:stickAssign.ground.${fn}`);
}
