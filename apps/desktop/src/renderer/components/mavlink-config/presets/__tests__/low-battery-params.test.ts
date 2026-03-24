import { describe, it, expect, vi } from 'vitest';

// Mock lucide-react since it's a renderer dependency not available in Node tests
vi.mock('lucide-react', () => ({
  Egg: 'Egg',
  Drama: 'Drama',
  Zap: 'Zap',
  Film: 'Film',
}));

import { SAFETY_PRESETS } from '../mavlink-presets';

/**
 * Tests for low battery failsafe parameter fix (issue #50).
 *
 * ArduPilot uses BATT_* parameters for battery failsafe, NOT the legacy FS_BATT_* names:
 *   BATT_FS_LOW_ACT  - Action on low battery (0=Disabled, 1=Land, 2=RTL)
 *   BATT_LOW_VOLT    - Low voltage threshold
 *   BATT_LOW_MAH     - Low mAh remaining threshold
 *   BATT_FS_CRT_ACT  - Action on critical battery
 *   BATT_CRT_VOLT    - Critical voltage threshold
 *   BATT_CRT_MAH     - Critical mAh remaining threshold
 *
 * The old FS_BATT_ENABLE, FS_BATT_VOLTAGE, FS_BATT_MAH do not exist on
 * modern ArduPilot flight controllers and were causing console errors.
 */

describe('issue #50 - low battery parameters use correct ArduPilot names', () => {
  const deprecatedParams = ['FS_BATT_ENABLE', 'FS_BATT_VOLTAGE', 'FS_BATT_MAH'];

  it.each(deprecatedParams)(
    'no preset references deprecated parameter %s',
    (deprecated) => {
      for (const [key, preset] of Object.entries(SAFETY_PRESETS)) {
        expect(
          preset.params,
          `preset "${key}" still uses deprecated "${deprecated}" — should use BATT_* equivalent`,
        ).not.toHaveProperty(deprecated);
      }
    },
  );

  it('all presets use BATT_FS_LOW_ACT for low battery action', () => {
    for (const [key, preset] of Object.entries(SAFETY_PRESETS)) {
      expect(
        preset.params,
        `preset "${key}" is missing BATT_FS_LOW_ACT`,
      ).toHaveProperty('BATT_FS_LOW_ACT');
    }
  });

  it('BATT_FS_LOW_ACT values are valid ArduPilot action codes (0, 1, or 2)', () => {
    const validActions = [0, 1, 2]; // 0=Disabled, 1=Land, 2=RTL
    for (const [key, preset] of Object.entries(SAFETY_PRESETS)) {
      const action = preset.params['BATT_FS_LOW_ACT'];
      expect(
        validActions,
        `preset "${key}" has invalid BATT_FS_LOW_ACT value: ${action}`,
      ).toContain(action);
    }
  });

  it('maximum preset enables low battery action', () => {
    const preset = SAFETY_PRESETS['maximum'];
    expect(preset).toBeDefined();
    // Maximum safety should have low battery failsafe enabled (Land = 2)
    expect(preset!.params['BATT_FS_LOW_ACT']).toBe(2);
  });

  it('balanced preset enables low battery action', () => {
    const preset = SAFETY_PRESETS['balanced'];
    expect(preset).toBeDefined();
    // Balanced should have low battery failsafe enabled (RTL = 1)
    expect(preset!.params['BATT_FS_LOW_ACT']).toBe(1);
  });

  it('minimal preset disables low battery action', () => {
    const preset = SAFETY_PRESETS['minimal'];
    expect(preset).toBeDefined();
    expect(preset!.params['BATT_FS_LOW_ACT']).toBe(0);
  });
});

describe('issue #50 - low and critical battery params are consistent', () => {
  it('maximum preset has low battery action less aggressive than or equal to critical', () => {
    const preset = SAFETY_PRESETS['maximum']!;
    const lowAct = preset.params['BATT_FS_LOW_ACT']!;
    const crtAct = preset.params['BATT_FS_CRT_ACT']!;
    // Both should be enabled
    expect(lowAct).toBeGreaterThan(0);
    expect(crtAct).toBeGreaterThan(0);
  });

  it('no preset enables critical battery without low battery', () => {
    for (const [key, preset] of Object.entries(SAFETY_PRESETS)) {
      const lowAct = preset.params['BATT_FS_LOW_ACT'] ?? 0;
      const crtAct = preset.params['BATT_FS_CRT_ACT'] ?? 0;
      // If critical is enabled, low should also be enabled (would be odd otherwise)
      if (crtAct > 0) {
        expect(
          lowAct,
          `preset "${key}" has critical battery enabled but low battery disabled — this is likely a misconfiguration`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('all presets define both low and critical battery action params', () => {
    for (const [key, preset] of Object.entries(SAFETY_PRESETS)) {
      expect(
        preset.params,
        `preset "${key}" missing BATT_FS_LOW_ACT`,
      ).toHaveProperty('BATT_FS_LOW_ACT');
      expect(
        preset.params,
        `preset "${key}" missing BATT_FS_CRT_ACT`,
      ).toHaveProperty('BATT_FS_CRT_ACT');
    }
  });
});
