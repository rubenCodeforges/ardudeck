import { describe, it, expect } from 'vitest';
import { virtualChannels, mappingFromRcFunctions, DEFAULT_RC_FUNCTIONS, RC_MID, RC_MIN, RC_MAX } from './pseudo-tx';

/** Gamepad convention: [leftX, leftY, rightX, rightY], y positive downward. */
const centred = [0, 0, 0, 0];

describe('virtualChannels', () => {
  it('parks every channel neutral with the sticks centred', () => {
    const ch = virtualChannels([0, 1, 0, 0]); // throttle stick fully down
    expect(ch[0]).toBe(RC_MID); // roll
    expect(ch[1]).toBe(RC_MID); // pitch
    expect(ch[3]).toBe(RC_MID); // yaw
    expect(ch[2]).toBe(RC_MIN); // throttle at the bottom
  });

  it('puts stick-up on full throttle, not minimum', () => {
    expect(virtualChannels([0, -1, 0, 0])[2]).toBe(RC_MAX);
    expect(virtualChannels([0, 0, 0, 0])[2]).toBe(RC_MID);
  });

  it('sends roll and yaw to different channels', () => {
    // The bug this guards: mapping channel n to axis n put yaw on roll.
    const ch = virtualChannels([1, 0, -1, 0]); // yaw right, roll left
    expect(ch[DEFAULT_RC_FUNCTIONS.yaw - 1]).toBe(RC_MAX);
    expect(ch[DEFAULT_RC_FUNCTIONS.roll - 1]).toBe(RC_MIN);
  });

  it('follows a non-default RCMAP', () => {
    const swapped = { roll: 2, pitch: 1, throttle: 4, yaw: 3 };
    const ch = virtualChannels([0, -1, 1, 0], swapped);
    expect(ch[1]).toBe(RC_MAX); // roll on channel 2
    expect(ch[3]).toBe(RC_MAX); // throttle on channel 4
  });

  it('clamps out-of-range axes instead of emitting illegal pwm', () => {
    const ch = virtualChannels([5, -5, -5, 5]);
    for (const v of ch) {
      expect(v).toBeGreaterThanOrEqual(RC_MIN);
      expect(v).toBeLessThanOrEqual(RC_MAX);
    }
  });

  it('leaves unassigned channels at neutral, never zero', () => {
    // A flight controller reads a channel at zero as a dead receiver.
    for (const v of virtualChannels(centred)) expect(v).toBeGreaterThanOrEqual(RC_MIN);
  });
});

describe('mappingFromRcFunctions', () => {
  it('puts a console pad on the channels the vehicle names', () => {
    const m = mappingFromRcFunctions({ roll: 1, pitch: 2, throttle: 3, yaw: 4 });
    expect(m[0]!.source).toEqual({ kind: 'axis', index: 2 }); // roll  <- right X
    expect(m[1]!.source).toEqual({ kind: 'axis', index: 3 }); // pitch <- right Y
    expect(m[2]!.source).toEqual({ kind: 'axis', index: 1 }); // throttle <- left Y
    expect(m[3]!.source).toEqual({ kind: 'axis', index: 0 }); // yaw   <- left X
  });

  it('follows a remapped RCMAP instead of assuming 1/2/3/4', () => {
    // Identity mapping silently swaps controls the moment RCMAP moves.
    const m = mappingFromRcFunctions({ roll: 4, pitch: 3, throttle: 2, yaw: 1 });
    expect(m[3]!.source).toEqual({ kind: 'axis', index: 2 }); // roll now on ch4
    expect(m[1]!.source).toEqual({ kind: 'axis', index: 1 }); // throttle on ch2
  });

  it('leaves switch channels on the axis-order assumption', () => {
    const m = mappingFromRcFunctions();
    expect(m[4]!.source).toEqual({ kind: 'axis', index: 4 });
  });
});
