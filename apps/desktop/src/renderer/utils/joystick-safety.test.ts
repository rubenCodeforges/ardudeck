import { describe, it, expect } from 'vitest';
import { checkHandover, handoverTargets, channelValue, channelPwm, type HandoverContext } from './joystick-safety';
import { defaultChannelMap, DEFAULT_RC_FUNCTIONS, type ChannelMap, type RawDevice } from './pseudo-tx';

function ctx(over: Partial<HandoverContext> & { params?: Record<string, number> } = {}): HandoverContext {
  const params = over.params ?? { RCMAP_THROTTLE: 3 };
  return {
    roles: DEFAULT_RC_FUNCTIONS,
    vehicleClass: 'copter',
    param: (n) => params[n],
    liveRc: null,
    safeAt: [],
    ...over,
  };
}

/** What the joystick sends, by 1-based channel; missing channels are not driven. */
function sending(pwm: Record<number, number>) {
  return (ch: number) => pwm[ch] ?? null;
}

const COPTER_SAFE = { 1: 1500, 2: 1500, 3: 1000, 4: 1500 };

describe('checkHandover', () => {
  it('passes a copter with sticks centred and throttle closed', () => {
    const c = checkHandover(ctx(), sending(COPTER_SAFE));
    expect(c.ok).toBe(true);
    expect(c.basis).toBe('rules');
  });

  it('refuses an open copter throttle and says where it has to go', () => {
    const c = checkHandover(ctx(), sending({ ...COPTER_SAFE, 3: 1500 }));
    expect(c.ok).toBe(false);
    expect(c.problems[0]).toMatch(/Throttle \(CH3\) at 1500/);
    expect(c.problems[0]).toMatch(/1080/);
  });

  it('follows RCMAP when the sticks live on non-standard channels', () => {
    const roles = { roll: 2, pitch: 3, throttle: 1, yaw: 4 };
    // throttle on CH1 at the bottom, CH3 (pitch) centred: this used to be refused
    expect(checkHandover(ctx({ roles }), sending({ 1: 1000, 2: 1500, 3: 1500, 4: 1500 })).ok).toBe(true);
    const bad = checkHandover(ctx({ roles }), sending({ 1: 1500, 2: 1500, 3: 1000, 4: 1500 }));
    expect(bad.problems.join(' ')).toMatch(/Throttle \(CH1\)/);
    expect(bad.problems.join(' ')).toMatch(/Pitch \(CH3\)/);
  });

  it('wants a reversible throttle at zero thrust, not at the bottom', () => {
    const rover = ctx({ vehicleClass: 'rover' });
    expect(checkHandover(rover, sending({ ...COPTER_SAFE, 3: 1500 })).ok).toBe(true);
    const full = checkHandover(rover, sending({ ...COPTER_SAFE, 3: 1000 }));
    expect(full.ok).toBe(false);
    expect(full.problems[0]).toMatch(/zero thrust/);
  });

  it('treats a plane with reverse thrust as reversible, and one without as idle-at-bottom', () => {
    const reverse = ctx({ vehicleClass: 'plane', params: { RCMAP_THROTTLE: 3, THR_MIN: -60 } });
    expect(checkHandover(reverse, sending({ ...COPTER_SAFE, 3: 1500 })).ok).toBe(true);
    const normal = ctx({ vehicleClass: 'plane', params: { RCMAP_THROTTLE: 3, THR_MIN: 0 } });
    expect(checkHandover(normal, sending({ ...COPTER_SAFE, 3: 1500 })).ok).toBe(false);
  });

  it('uses the channel trim and a reversed throttle end', () => {
    const c = ctx({ params: { RCMAP_THROTTLE: 3, RC1_TRIM: 1520, RC3_REVERSED: 1, RC3_MAX: 1950 } });
    expect(checkHandover(c, sending({ 1: 1520, 2: 1500, 3: 1950, 4: 1500 })).ok).toBe(true);
    expect(checkHandover(c, sending({ 1: 1520, 2: 1500, 3: 1000, 4: 1500 })).ok).toBe(false);
  });

  it('matches a live radio instead of the rules, so the handover moves nothing', () => {
    const live = [1500, 1500, 1420, 1500];
    const c = ctx({ liveRc: live });
    expect(checkHandover(c, sending({ 1: 1500, 2: 1500, 3: 1430, 4: 1500 }))).toMatchObject({ ok: true, basis: 'radio' });
    expect(checkHandover(c, sending(COPTER_SAFE)).problems[0]).toMatch(/your radio/);
  });

  it('ignores a radio in failsafe and falls back to the rules', () => {
    const c = ctx({ liveRc: [0, 0, 0, 0] });
    expect(checkHandover(c, sending(COPTER_SAFE))).toMatchObject({ ok: true, basis: 'rules' });
  });

  it('honours a per-channel override, including leaving a channel unchecked', () => {
    const safeAt = [undefined, undefined, 'any' as const, undefined, 'low' as const];
    const c = ctx({ safeAt });
    expect(checkHandover(c, sending({ ...COPTER_SAFE, 3: 1900, 5: 1000 })).ok).toBe(true);
    expect(checkHandover(c, sending({ ...COPTER_SAFE, 3: 1900, 5: 2000 })).ok).toBe(false);
  });

  it('asks for unassigned stick channels by name', () => {
    const c = checkHandover(ctx(), sending({ 1: 1500, 2: 1500, 3: 1000 }));
    expect(c.problems[0]).toMatch(/Yaw \(CH4\)/);
  });

  it('says when the parameters are not loaded yet', () => {
    expect(checkHandover(ctx({ params: {} }), sending(COPTER_SAFE)).basis).toBe('defaults');
  });

  it('only checks channels that matter', () => {
    expect(handoverTargets(ctx()).map((t) => t.channel)).toEqual([1, 2, 3, 4]);
  });
});

function mapping(): ChannelMap[] {
  return [0, 1, 2, 3].map((i) => ({ ...defaultChannelMap(), source: { kind: 'axis', index: i } as ChannelMap['source'] }));
}
const SAFE: RawDevice = { axes: [0, 0, -1, 0], buttons: [] };

describe('channelValue / channelPwm', () => {
  it('returns null for an unmapped channel rather than a neutral lie', () => {
    expect(channelValue(mapping(), SAFE, 7)).toBeNull();
    expect(channelPwm(mapping(), SAFE, 7)).toBeNull();
  });

  it('maps stick travel onto 1000-2000', () => {
    expect(channelPwm(mapping(), { axes: [1, 0, -1, 0], buttons: [] }, 0)).toBe(2000);
    expect(channelPwm(mapping(), SAFE, 2)).toBe(1000);
    expect(channelPwm(mapping(), SAFE, 1)).toBe(1500);
  });
});
