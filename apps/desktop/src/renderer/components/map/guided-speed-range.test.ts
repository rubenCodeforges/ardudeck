import { describe, it, expect } from 'vitest';
import { guidedSpeedRange, speedRangeHint, FALLBACK_SPEED_RANGE } from './guided-speed-range';

describe('guidedSpeedRange', () => {
  // ArduPlane's do_change_speed refuses anything outside the envelope rather
  // than clamping, so the control must not be able to ask for it.
  it('takes a fixed wing range straight from the airspeed envelope', () => {
    const r = guidedSpeedRange({ isFixedWing: true, airspeedMin: 12, airspeedMax: 28 });
    expect(r).toEqual({ min: 12, max: 28, enforced: true, source: 'airspeed' });
  });

  it('applies the same envelope to a VTOL, which cruises as a plane', () => {
    const r = guidedSpeedRange({ isFixedWing: true, airspeedMin: 15, airspeedMax: 30 });
    expect(r.max).toBe(30);
    expect(r.enforced).toBe(true);
  });

  it('falls back when only half the envelope has been read', () => {
    expect(guidedSpeedRange({ isFixedWing: true, airspeedMin: 12 })).toEqual(FALLBACK_SPEED_RANGE);
    expect(guidedSpeedRange({ isFixedWing: true, airspeedMax: 28 })).toEqual(FALLBACK_SPEED_RANGE);
    expect(guidedSpeedRange({ isFixedWing: true })).toEqual(FALLBACK_SPEED_RANGE);
  });

  it('rejects a nonsense envelope rather than trusting it', () => {
    expect(guidedSpeedRange({ isFixedWing: true, airspeedMin: 30, airspeedMax: 12 })).toEqual(FALLBACK_SPEED_RANGE);
    expect(guidedSpeedRange({ isFixedWing: true, airspeedMin: 0, airspeedMax: 20 })).toEqual(FALLBACK_SPEED_RANGE);
  });

  it('converts a copter range from WPNAV_SPEED cm/s', () => {
    const r = guidedSpeedRange({ isFixedWing: false, wpnavRangeCms: { min: 20, max: 2000 } });
    expect(r).toEqual({ min: 0, max: 20, enforced: false, source: 'wpnav' });
  });

  it('leaves a copter at the fallback with no metadata', () => {
    expect(guidedSpeedRange({ isFixedWing: false })).toEqual(FALLBACK_SPEED_RANGE);
  });

  it('ignores the airspeed envelope on a copter', () => {
    const r = guidedSpeedRange({ isFixedWing: false, airspeedMin: 12, airspeedMax: 28 });
    expect(r).toEqual(FALLBACK_SPEED_RANGE);
  });
});

describe('speedRangeHint', () => {
  const asIs = (v: number) => v;

  it('says the vehicle will refuse, when it will', () => {
    const r = guidedSpeedRange({ isFixedWing: true, airspeedMin: 12, airspeedMax: 28 });
    expect(speedRangeHint(r, 'm/s', asIs)).toContain('refuses');
    expect(speedRangeHint(r, 'm/s', asIs)).toContain('12-28');
  });

  it('is advisory for a copter', () => {
    const r = guidedSpeedRange({ isFixedWing: false, wpnavRangeCms: { min: 20, max: 2000 } });
    expect(speedRangeHint(r, 'm/s', asIs)).toContain('WPNAV_SPEED');
    expect(speedRangeHint(r, 'm/s', asIs)).not.toContain('refuses');
  });

  it('says nothing when the numbers were invented', () => {
    expect(speedRangeHint(FALLBACK_SPEED_RANGE, 'm/s', asIs)).toBeNull();
  });

  it('reports in the display unit', () => {
    const r = guidedSpeedRange({ isFixedWing: true, airspeedMin: 10, airspeedMax: 20 });
    expect(speedRangeHint(r, 'km/h', (v) => Math.round(v * 3.6))).toContain('36-72');
  });
});
