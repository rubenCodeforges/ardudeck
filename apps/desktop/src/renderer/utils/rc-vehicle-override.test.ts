import { describe, it, expect } from 'vitest';
import { packOverrideChannels, packStickChannels, OVERRIDE_IGNORE, OVERRIDE_CHANNELS } from './rc-vehicle-override';
import { RC_CHANNEL_COUNT, defaultChannelMap, type ChannelMap } from './pseudo-tx';

function unmapped(): ChannelMap[] {
  return Array.from({ length: RC_CHANNEL_COUNT }, () => defaultChannelMap());
}

function mapped(count: number): ChannelMap[] {
  const m = unmapped();
  for (let i = 0; i < count; i++) m[i] = { ...m[i]!, source: { kind: 'axis', index: i } };
  return m;
}

describe('packOverrideChannels', () => {
  it('sends 65535 for every unmapped channel, never a held value', () => {
    const out = packOverrideChannels(new Array(16).fill(1500), unmapped());
    expect(out).toHaveLength(OVERRIDE_CHANNELS);
    expect(out.every((v) => v === OVERRIDE_IGNORE)).toBe(true);
  });

  it('passes mapped channels through and ignores the rest', () => {
    const ch = new Array(16).fill(1500);
    ch[0] = 1200;
    ch[3] = 1900;
    const out = packOverrideChannels(ch, mapped(4));
    expect(out[0]).toBe(1200);
    expect(out[1]).toBe(1500);
    expect(out[3]).toBe(1900);
    expect(out[4]).toBe(OVERRIDE_IGNORE);
    expect(out[17]).toBe(OVERRIDE_IGNORE);
  });

  it('clamps mapped values into a sane pwm range', () => {
    const ch = new Array(16).fill(1500);
    ch[0] = 50;
    ch[1] = 9000;
    const out = packOverrideChannels(ch, mapped(2));
    expect(out[0]).toBe(800);
    expect(out[1]).toBe(2200);
  });

  it('channels beyond the mapping length stay ignored', () => {
    const out = packOverrideChannels(new Array(16).fill(1600), mapped(16));
    expect(out[16]).toBe(OVERRIDE_IGNORE);
    expect(out[17]).toBe(OVERRIDE_IGNORE);
    expect(out[15]).toBe(1600);
  });
});

describe('packStickChannels', () => {
  it('sends only the four stick channels, never the flight-mode or aux channels', () => {
    const ch = new Array(16).fill(1500);
    ch[2] = 1100;
    const out = packStickChannels(ch, { roll: 1, pitch: 2, throttle: 3, yaw: 4 });
    expect(out.slice(0, 4)).toEqual([1500, 1500, 1100, 1500]);
    expect(out.slice(4).every((v) => v === OVERRIDE_IGNORE)).toBe(true);
    expect(out).toHaveLength(OVERRIDE_CHANNELS);
  });

  it('follows RCMAP', () => {
    const out = packStickChannels(new Array(16).fill(1500), { roll: 2, pitch: 3, throttle: 1, yaw: 9 });
    expect(out[8]).toBe(1500);
    expect(out[3]).toBe(OVERRIDE_IGNORE);
  });
});
