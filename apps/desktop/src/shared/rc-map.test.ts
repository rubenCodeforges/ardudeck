import { describe, expect, it } from 'vitest';
import { applyReversal, armStandInChannels, throttleLowPwm, DEFAULT_STICK_MAP, hasLiveRcInput, overrideChannels, overrideFields, RC_OVERRIDE_IGNORE as X, releaseChannels, reversedAxes, stickMapFrom } from './rc-map';

const reader = (p: Record<string, number>) => (n: string) => p[n];
const sticks = { roll: 1100, pitch: 1200, throttle: 1000, yaw: 1400 };

describe('stickMapFrom', () => {
  it('defaults to AETR while RCMAP is not loaded', () => {
    expect(stickMapFrom(reader({}))).toEqual(DEFAULT_STICK_MAP);
  });
  it('reads TAER', () => {
    expect(stickMapFrom(reader({ RCMAP_ROLL: 2, RCMAP_PITCH: 3, RCMAP_THROTTLE: 1, RCMAP_YAW: 4 }))).toEqual({ roll: 2, pitch: 3, throttle: 1, yaw: 4 });
  });
  it('ignores out-of-range values per axis', () => {
    expect(stickMapFrom(reader({ RCMAP_ROLL: 0, RCMAP_THROTTLE: 19, RCMAP_YAW: 2.5 }))).toEqual(DEFAULT_STICK_MAP);
  });
});

describe('overrideChannels', () => {
  it('default map: RC1..4, aux ignored', () => {
    const ch = overrideChannels(sticks);
    expect(ch.slice(0, 4)).toEqual([1100, 1200, 1000, 1400]);
    expect(ch.slice(4).every((v) => v === X)).toBe(true);
    expect(ch).toHaveLength(18);
  });
  it('TAER: throttle on RC1, roll on RC2', () => {
    const ch = overrideChannels(sticks, { roll: 2, pitch: 3, throttle: 1, yaw: 4 });
    expect(ch.slice(0, 4)).toEqual([1000, 1100, 1200, 1400]);
  });
  it('rover: steering on RCMAP_ROLL, throttle on RCMAP_THROTTLE', () => {
    const map = stickMapFrom(reader({ RCMAP_ROLL: 1, RCMAP_THROTTLE: 3 }));
    const ch = overrideChannels({ roll: 1700, pitch: X, throttle: 1500, yaw: X }, map);
    expect(ch[0]).toBe(1700);
    expect(ch[2]).toBe(1500);
  });
  it('mode pin lands on its channel but never on a stick channel', () => {
    const ch = overrideChannels(sticks, { roll: 2, pitch: 3, throttle: 1, yaw: 5 }, { 8: 1000, 5: 1900 });
    expect(ch[7]).toBe(1000);
    expect(ch[4]).toBe(1400);
  });
  it('a doubled RCMAP channel keeps the throttle value', () => {
    expect(overrideChannels(sticks, { roll: 1, pitch: 2, throttle: 1, yaw: 4 })[0]).toBe(1000);
  });
});

describe('overrideFields', () => {
  it('maps to chan1Raw..chan18Raw', () => {
    const f = overrideFields(overrideChannels(sticks, { roll: 2, pitch: 3, throttle: 1, yaw: 4 }));
    expect(f.chan1Raw).toBe(1000);
    expect(f.chan2Raw).toBe(1100);
    expect(f.chan18Raw).toBe(X);
    expect(Object.keys(f)).toHaveLength(18);
  });
});

describe('armStandInChannels (#152)', () => {
  // Issue #152: ArduPlane bench, handset live on TAER (throttle stick 0% on RC1), ArduDeck
  // believed AETR, so the arm stand-in put 1500 on the real throttle channel.
  const benchRc = [988, 1479, 1517, 1489, 1000, 1500, 1500, 1500];

  it('sends nothing while the vehicle reports a live transmitter', () => {
    expect(hasLiveRcInput(benchRc)).toBe(true);
    expect(armStandInChannels(DEFAULT_STICK_MAP, benchRc, 1100)).toBeNull();
  });
  it('stands in with the throttle at its zero pulse when no transmitter is reporting', () => {
    expect(hasLiveRcInput([])).toBe(false);
    expect(hasLiveRcInput([0, 0, 0, 0])).toBe(false);
    expect(hasLiveRcInput([65535, 65535])).toBe(false);
    const out = armStandInChannels({ roll: 2, pitch: 3, throttle: 1, yaw: 4 }, [], 1100)!;
    expect(out.slice(0, 5)).toEqual([1100, 1500, 1500, 1500, X]);
  });
  it('sends nothing while the vehicle RCMAP is not known yet', () => {
    expect(armStandInChannels(null, [], 1100)).toBeNull();
  });
  it('sends nothing when the vehicle streams no RC_CHANNELS, since a transmitter cannot be ruled out', () => {
    expect(armStandInChannels(DEFAULT_STICK_MAP, null, 1100)).toBeNull();
  });
  it('sends nothing while the throttle channel range or reversal is unknown', () => {
    expect(armStandInChannels(DEFAULT_STICK_MAP, [], null)).toBeNull();
  });
});

describe('throttleLowPwm', () => {
  it('is RCn_MIN normally and RCn_MAX when reversed', () => {
    expect(throttleLowPwm(reader({ RC3_MIN: 1100, RC3_MAX: 1900, RC3_REVERSED: 0 }), 3)).toBe(1100);
    expect(throttleLowPwm(reader({ RC1_MIN: 988, RC1_MAX: 2012, RC1_REVERSED: 1 }), 1)).toBe(2012);
  });
  it('is null while any of MIN, MAX or REVERSED is unknown', () => {
    expect(throttleLowPwm(reader({ RC3_MIN: 1100, RC3_MAX: 1900 }), 3)).toBeNull();
    expect(throttleLowPwm(reader({ RC3_MAX: 1900, RC3_REVERSED: 0 }), 3)).toBeNull();
  });
});

describe('reversedAxes / applyReversal', () => {
  it('reads RCn_REVERSED on each axis channel', () => {
    const map = { roll: 2, pitch: 3, throttle: 1, yaw: 4 };
    expect([...reversedAxes(map, reader({ RC1_REVERSED: 1, RC3_REVERSED: 0, RC4_REVERSED: 1 }))].sort()).toEqual(['throttle', 'yaw']);
  });
  it('mirrors reversed axes around 1500 and leaves ignore alone', () => {
    expect(applyReversal({ roll: 1100, pitch: X, throttle: 1000, yaw: 1500 }, new Set(['roll', 'pitch', 'throttle'])))
      .toEqual({ roll: 1900, pitch: X, throttle: 2000, yaw: 1500 });
  });
});

describe('releaseChannels', () => {
  // ArduPilot GCS_Common handle_rc_channels_override: ch1-8 release on 0, ch9-18 on UINT16_MAX-1; UINT16_MAX is ignore.
  it('hands every channel back to the radio', () => {
    const out = releaseChannels();
    expect(out).toHaveLength(18);
    expect(out.slice(0, 8)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(out.slice(8)).toEqual(new Array(10).fill(65534));
  });
});
