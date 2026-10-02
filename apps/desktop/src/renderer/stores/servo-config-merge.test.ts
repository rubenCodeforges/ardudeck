import { describe, it, expect } from 'vitest';
import { mergeServoEdit } from './servo-config-merge';

const cfg = (middle: number, rate: number) => ({
  min: 1000, max: 2000, middle, rate, forwardFromChannel: 255, reversedSources: 0,
});

describe('mergeServoEdit', () => {
  it('writes nothing for a servo the tab did not change', () => {
    expect(mergeServoEdit(cfg(1500, 100), cfg(1500, 100), cfg(1480, -100))).toBeNull();
  });

  it('keeps another tab\'s saved reverse when this tab only moved the center', () => {
    // Mixer loaded FWD/1500 and moved center; Tuning already wrote REV to the FC
    expect(mergeServoEdit(cfg(1500, 100), cfg(1520, 100), cfg(1500, -100))).toEqual(cfg(1520, -100));
  });

  it('falls back to the edited config when the live read failed', () => {
    expect(mergeServoEdit(cfg(1500, 100), cfg(1520, 100), undefined)).toEqual(cfg(1520, 100));
  });
});
