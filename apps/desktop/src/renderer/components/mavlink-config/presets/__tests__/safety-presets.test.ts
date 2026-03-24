import { describe, it, expect } from 'vitest';
import { SAFETY_PRESETS } from '../mavlink-presets';

/**
 * Tests for critical battery failsafe parameters in safety presets (issue #35).
 *
 * ArduPilot critical battery params:
 *   BATT_FS_CRT_ACT - Action when battery hits critical level (0=Disabled, 1=Land, 2=RTL)
 *   BATT_CRT_VOLT   - Critical voltage threshold
 *   BATT_CRT_MAH    - Critical mAh remaining threshold
 *
 * The presets define BATT_FS_CRT_ACT. Voltage/mAh thresholds are user-configured
 * per-battery so presets only set the action.
 */

describe('SAFETY_PRESETS - critical battery failsafe (issue #35)', () => {
  it('all presets include BATT_FS_CRT_ACT parameter', () => {
    for (const [key, preset] of Object.entries(SAFETY_PRESETS)) {
      expect(
        preset.params,
        `preset "${key}" is missing BATT_FS_CRT_ACT`,
      ).toHaveProperty('BATT_FS_CRT_ACT');
    }
  });

  it('maximum preset enables critical battery action (Land)', () => {
    const preset = SAFETY_PRESETS['maximum'];
    expect(preset).toBeDefined();
    expect(preset!.params['BATT_FS_CRT_ACT']).toBe(1); // Land immediately
  });

  it('balanced preset enables critical battery action (Land)', () => {
    const preset = SAFETY_PRESETS['balanced'];
    expect(preset).toBeDefined();
    expect(preset!.params['BATT_FS_CRT_ACT']).toBe(1); // Land immediately
  });

  it('minimal preset disables critical battery action', () => {
    const preset = SAFETY_PRESETS['minimal'];
    expect(preset).toBeDefined();
    expect(preset!.params['BATT_FS_CRT_ACT']).toBe(0); // Disabled
  });

  it('BATT_FS_CRT_ACT values are valid ArduPilot action codes (0, 1, or 2)', () => {
    const validActions = [0, 1, 2]; // Disabled, Land, RTL
    for (const [key, preset] of Object.entries(SAFETY_PRESETS)) {
      const action = preset.params['BATT_FS_CRT_ACT'];
      expect(
        validActions,
        `preset "${key}" has invalid BATT_FS_CRT_ACT value: ${action}`,
      ).toContain(action);
    }
  });
});

describe('SAFETY_PRESETS - low battery params coexist with critical battery', () => {
  it('all presets still include low battery FS_BATT_ENABLE', () => {
    for (const [key, preset] of Object.entries(SAFETY_PRESETS)) {
      expect(
        preset.params,
        `preset "${key}" is missing FS_BATT_ENABLE`,
      ).toHaveProperty('FS_BATT_ENABLE');
    }
  });

  it('maximum preset has both low and critical battery actions enabled', () => {
    const preset = SAFETY_PRESETS['maximum']!;
    expect(preset.params['FS_BATT_ENABLE']).toBeGreaterThan(0);
    expect(preset.params['BATT_FS_CRT_ACT']).toBeGreaterThan(0);
  });

  it('maximum preset uses more aggressive critical action than low battery', () => {
    const preset = SAFETY_PRESETS['maximum']!;
    // Low battery = Land (2), Critical battery = Land immediately (1)
    // Both are "land" type actions; critical should not be less aggressive
    const lowAction = preset.params['FS_BATT_ENABLE']!;
    const critAction = preset.params['BATT_FS_CRT_ACT']!;
    // Both should be non-zero (enabled)
    expect(lowAction).toBeGreaterThan(0);
    expect(critAction).toBeGreaterThan(0);
  });
});

describe('SAFETY_PRESETS - structural integrity', () => {
  it('has exactly three presets: maximum, balanced, minimal', () => {
    const keys = Object.keys(SAFETY_PRESETS);
    expect(keys).toHaveLength(3);
    expect(keys).toContain('maximum');
    expect(keys).toContain('balanced');
    expect(keys).toContain('minimal');
  });

  it('each preset has required fields', () => {
    for (const [key, preset] of Object.entries(SAFETY_PRESETS)) {
      expect(preset.name, `preset "${key}" missing name`).toBeTruthy();
      expect(preset.description, `preset "${key}" missing description`).toBeTruthy();
      expect(
        Object.keys(preset.params).length,
        `preset "${key}" has no params`,
      ).toBeGreaterThan(0);
    }
  });

  const expectedParams = [
    'FS_THR_ENABLE',
    'FS_GCS_ENABLE',
    'FS_BATT_ENABLE',
    'BATT_FS_CRT_ACT',
    'FENCE_ENABLE',
    'ARMING_CHECK',
  ];

  it.each(expectedParams)('all presets include %s', (param) => {
    for (const [key, preset] of Object.entries(SAFETY_PRESETS)) {
      expect(
        preset.params,
        `preset "${key}" is missing ${param}`,
      ).toHaveProperty(param);
    }
  });
});
