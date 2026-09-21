import { describe, it, expect } from 'vitest';
import { transitionProgress, isAirspeedReachedText, TRANSITION_MS_MAX } from './vtol-transition';
import { VtolState } from './telemetry-types';

const base = { airspeed: 0, airspeedMin: 20, transitionMs: 5000 };

describe('transitionProgress', () => {
  it('is nothing at all when the aircraft is not transitioning', () => {
    expect(transitionProgress({ ...base, state: VtolState.Multicopter })).toBeNull();
    expect(transitionProgress({ ...base, state: VtolState.FixedWing })).toBeNull();
    expect(transitionProgress({ ...base, state: null })).toBeNull();
  });

  it('tracks airspeed against AIRSPEED_MIN, the gate that ends the wait', () => {
    const half = transitionProgress({ ...base, state: VtolState.TransitionToFixedWing, airspeed: 10 });
    expect(half?.fraction).toBeCloseTo(0.5, 5);
    expect(half?.stage).toBe('accelerating');
  });

  it('never exceeds full once past the gate', () => {
    const over = transitionProgress({ ...base, state: VtolState.TransitionToFixedWing, airspeed: 40 });
    expect(over?.fraction).toBe(1);
  });

  it('switches to the timer once the vehicle reports the airspeed reached', () => {
    const p = transitionProgress({
      ...base,
      state: VtolState.TransitionToFixedWing,
      airspeed: 25,
      sinceAirspeedReachedMs: 2500,
    });
    expect(p?.stage).toBe('settling');
    expect(p?.fraction).toBeCloseTo(0.5, 5);
  });

  it('clamps Q_TRANSITION_MS the way ArduPlane does', () => {
    const p = transitionProgress({
      ...base,
      state: VtolState.TransitionToFixedWing,
      transitionMs: 999_999,
      sinceAirspeedReachedMs: TRANSITION_MS_MAX,
    });
    expect(p?.fraction).toBe(1);
  });

  it('reports the phase but no number without an airspeed reference', () => {
    const p = transitionProgress({
      state: VtolState.TransitionToFixedWing,
      airspeed: 12,
      airspeedMin: undefined,
      transitionMs: 5000,
    });
    expect(p?.fraction).toBeNull();
    expect(p?.label).toBe('TO WING');
  });

  it('refuses to invent a number for the transition back to hover', () => {
    // ArduPlane publishes no completion gate for this direction, and a made-up
    // percentage on a flight instrument is worse than none.
    const p = transitionProgress({ ...base, state: VtolState.TransitionToMulticopter, airspeed: 18 });
    expect(p?.fraction).toBeNull();
    expect(p?.stage).toBe('to-hover');
  });
});

describe('isAirspeedReachedText', () => {
  it('matches ArduPlane\'s status text', () => {
    expect(isAirspeedReachedText('Transition airspeed reached 12.3')).toBe(true);
  });

  it('ignores unrelated chatter', () => {
    expect(isAirspeedReachedText('Transition failed, exceeded time limit')).toBe(false);
    expect(isAirspeedReachedText('AHRS: EKF3 active')).toBe(false);
  });
});
