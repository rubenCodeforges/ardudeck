/**
 * What speed a guided command may actually ask for.
 *
 * ArduPlane's do_change_speed REFUSES an airspeed outside
 * AIRSPEED_MIN..AIRSPEED_MAX rather than clamping it, so a control offering
 * anything wider produces commands the vehicle silently rejects. The bound
 * here was a hardcoded 50 m/s, which is both too high for most planes to
 * accept and too low for a fast one to use.
 *
 * Copters take a ground speed and clamp it themselves, so their range comes
 * from WPNAV_SPEED's own metadata (stored in cm/s) and is advisory.
 */

export interface SpeedRange {
  min: number;
  max: number;
  /** True when the firmware rejects values outside the range instead of clamping. */
  enforced: boolean;
  /** Where the numbers came from, for the hint under the control. */
  source: 'airspeed' | 'wpnav' | 'fallback';
}

/** Used when the vehicle has told us nothing: wide enough not to block anyone. */
export const FALLBACK_SPEED_RANGE: SpeedRange = { min: 0, max: 50, enforced: false, source: 'fallback' };

export interface SpeedRangeInputs {
  isFixedWing: boolean;
  /** AIRSPEED_MIN / AIRSPEED_MAX, m/s. */
  airspeedMin?: number;
  airspeedMax?: number;
  /** WPNAV_SPEED metadata range, cm/s. */
  wpnavRangeCms?: { min: number; max: number };
}

export function guidedSpeedRange(inputs: SpeedRangeInputs): SpeedRange {
  const { isFixedWing, airspeedMin, airspeedMax, wpnavRangeCms } = inputs;

  if (isFixedWing) {
    const lo = airspeedMin;
    const hi = airspeedMax;
    // Both are needed: half a range would still offer refused values.
    if (lo !== undefined && hi !== undefined && hi > lo && lo > 0) {
      return { min: lo, max: hi, enforced: true, source: 'airspeed' };
    }
    return FALLBACK_SPEED_RANGE;
  }

  if (wpnavRangeCms && wpnavRangeCms.max > wpnavRangeCms.min && wpnavRangeCms.max > 0) {
    return {
      min: 0,
      max: Math.round(wpnavRangeCms.max / 100),
      enforced: false,
      source: 'wpnav',
    };
  }
  return FALLBACK_SPEED_RANGE;
}

/** Sentence under the speed control saying where its limits come from. */
export function speedRangeHint(range: SpeedRange, unitLabel: string, toDisplay: (mps: number) => number): string | null {
  if (range.source === 'fallback') return null;
  const lo = toDisplay(range.min);
  const hi = toDisplay(range.max);
  return range.enforced
    ? `AIRSPEED_MIN..MAX is ${lo}-${hi} ${unitLabel}; outside that the vehicle refuses the command`
    : `WPNAV_SPEED allows up to ${hi} ${unitLabel}`;
}
