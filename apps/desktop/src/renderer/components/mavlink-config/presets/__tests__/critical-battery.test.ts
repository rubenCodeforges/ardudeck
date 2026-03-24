import { describe, it, expect } from 'vitest';
import {
  SAFETY_PRESETS,
  BATTERY_CHEMISTRIES,
  getCellVoltages,
  type BatteryChemistry,
} from '../mavlink-presets';

/**
 * Tests for critical battery feature (issue #35).
 *
 * Covers:
 * - Battery chemistry critical thresholds are sane
 * - getCellVoltages() returns correct critical voltages
 * - Safety presets critical-vs-low battery action consistency
 */

// =============================================================================
// Battery Chemistry Critical Thresholds
// =============================================================================

describe('BATTERY_CHEMISTRIES - critical voltage thresholds', () => {
  const chemistries = Object.entries(BATTERY_CHEMISTRIES) as [BatteryChemistry, typeof BATTERY_CHEMISTRIES[BatteryChemistry]][];

  it('all chemistries define a cellCritical value', () => {
    for (const [name, chem] of chemistries) {
      expect(chem.cellCritical, `${name} missing cellCritical`).toBeDefined();
      expect(chem.cellCritical, `${name} cellCritical should be > 0`).toBeGreaterThan(0);
    }
  });

  it('cellCritical < cellLow for all chemistries', () => {
    for (const [name, chem] of chemistries) {
      expect(
        chem.cellCritical,
        `${name}: cellCritical (${chem.cellCritical}) should be < cellLow (${chem.cellLow})`,
      ).toBeLessThan(chem.cellLow);
    }
  });

  it('cellCritical > cellMin for all chemistries (critical is not dead)', () => {
    for (const [name, chem] of chemistries) {
      expect(
        chem.cellCritical,
        `${name}: cellCritical (${chem.cellCritical}) should be > cellMin (${chem.cellMin})`,
      ).toBeGreaterThan(chem.cellMin);
    }
  });

  it('voltage ordering is correct: min < critical < low < nominal < full', () => {
    for (const [name, chem] of chemistries) {
      expect(chem.cellMin, `${name} min`).toBeLessThan(chem.cellCritical);
      expect(chem.cellCritical, `${name} critical`).toBeLessThan(chem.cellLow);
      expect(chem.cellLow, `${name} low`).toBeLessThan(chem.cellNominal);
      expect(chem.cellNominal, `${name} nominal`).toBeLessThan(chem.cellFull);
    }
  });
});

// =============================================================================
// getCellVoltages - Critical Voltage Output
// =============================================================================

describe('getCellVoltages - critical voltage calculations', () => {
  it('returns a critical field', () => {
    const voltages = getCellVoltages(4);
    expect(voltages).toHaveProperty('critical');
  });

  it('critical voltage scales with cell count', () => {
    const v3s = getCellVoltages(3);
    const v4s = getCellVoltages(4);
    const v6s = getCellVoltages(6);

    // 4S critical should be 4/3 of 3S critical
    expect(v4s.critical).toBeCloseTo(v3s.critical * (4 / 3), 5);
    // 6S critical should be 6/3 of 3S critical
    expect(v6s.critical).toBeCloseTo(v3s.critical * 2, 5);
  });

  it('critical < low for standard LiPo cell counts (3S, 4S, 6S)', () => {
    for (const cells of [3, 4, 6]) {
      const v = getCellVoltages(cells, 'lipo');
      expect(
        v.critical,
        `${cells}S LiPo: critical (${v.critical}) should be < low (${v.low})`,
      ).toBeLessThan(v.low);
    }
  });

  it('critical < low for all chemistries at 4S', () => {
    const chemistries: BatteryChemistry[] = ['lipo', 'lihv', 'lion', 'life'];
    for (const chem of chemistries) {
      const v = getCellVoltages(4, chem);
      expect(
        v.critical,
        `4S ${chem}: critical (${v.critical}) should be < low (${v.low})`,
      ).toBeLessThan(v.low);
    }
  });

  it('returns correct critical voltage for 4S LiPo', () => {
    const v = getCellVoltages(4, 'lipo');
    // 4 cells * 3.5V critical per cell = 14.0V
    expect(v.critical).toBeCloseTo(14.0, 1);
  });

  it('returns correct critical voltage for 6S LiHV', () => {
    const v = getCellVoltages(6, 'lihv');
    // 6 cells * 3.6V critical per cell = 21.6V
    expect(v.critical).toBeCloseTo(21.6, 1);
  });

  it('0 cells returns 0 critical voltage', () => {
    const v = getCellVoltages(0);
    expect(v.critical).toBe(0);
  });
});

// =============================================================================
// Safety Presets - Critical vs Low Battery Consistency
// =============================================================================

describe('SAFETY_PRESETS - critical vs low battery action consistency', () => {
  // BATT_FS_CRT_ACT: 0=Disabled, 1=Land Immediately, 2=RTL
  // FS_BATT_ENABLE:  0=Disabled, 1=Land, 2=RTL

  it('if low battery is disabled, critical battery is also disabled', () => {
    for (const [key, preset] of Object.entries(SAFETY_PRESETS)) {
      const lowAction = preset.params['FS_BATT_ENABLE'] ?? 0;
      const critAction = preset.params['BATT_FS_CRT_ACT'] ?? 0;
      if (lowAction === 0) {
        expect(
          critAction,
          `preset "${key}": critical battery enabled but low battery disabled - makes no sense`,
        ).toBe(0);
      }
    }
  });

  it('critical action is at least as aggressive as low battery action in maximum preset', () => {
    const preset = SAFETY_PRESETS['maximum']!;
    const lowAction = preset.params['FS_BATT_ENABLE']!;
    const critAction = preset.params['BATT_FS_CRT_ACT']!;

    // Both enabled
    expect(lowAction).toBeGreaterThan(0);
    expect(critAction).toBeGreaterThan(0);

    // For ArduPilot: Land (1) is more aggressive than RTL (2)
    // So critical action value should be <= low action value (lower number = more aggressive)
    expect(
      critAction,
      `maximum: critical action (${critAction}) should be at least as aggressive as low (${lowAction})`,
    ).toBeLessThanOrEqual(lowAction);
  });

  it('balanced preset has both battery failsafe levels enabled', () => {
    const preset = SAFETY_PRESETS['balanced']!;
    expect(preset.params['FS_BATT_ENABLE']).toBeGreaterThan(0);
    expect(preset.params['BATT_FS_CRT_ACT']).toBeGreaterThan(0);
  });

  it('minimal preset has both battery failsafe levels disabled', () => {
    const preset = SAFETY_PRESETS['minimal']!;
    expect(preset.params['FS_BATT_ENABLE']).toBe(0);
    expect(preset.params['BATT_FS_CRT_ACT']).toBe(0);
  });

  it('no preset uses an invalid critical battery action code', () => {
    const validActions = new Set([0, 1, 2]);
    for (const [key, preset] of Object.entries(SAFETY_PRESETS)) {
      const action = preset.params['BATT_FS_CRT_ACT'];
      expect(
        validActions.has(action!),
        `preset "${key}" has unknown BATT_FS_CRT_ACT value: ${action}`,
      ).toBe(true);
    }
  });
});
