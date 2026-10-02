import { describe, it, expect } from 'vitest';
import { settingValueInRange } from './msp-settings';

describe('settingValueInRange', () => {
  const vspd = { type: 'uint16_t' as const, min: 100, max: 2000 };

  it('refuses what the INAV CLI would refuse (nav_land_maxalt_vspd 100..2000)', () => {
    expect(settingValueInRange(vspd, 50)).toBe(false);
    expect(settingValueInRange(vspd, 2001)).toBe(false);
    expect(settingValueInRange(vspd, 100)).toBe(true);
    expect(settingValueInRange(vspd, 2000)).toBe(true);
  });

  it('leaves strings alone', () => {
    expect(settingValueInRange({ type: 'string', min: 0, max: 0 }, 'abc')).toBe(true);
  });
});
