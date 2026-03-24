import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Tests for SafetyTab parameter name correctness (issue #50).
 *
 * Verifies the component source uses correct ArduPilot parameter names
 * for battery failsafe settings. The bug was that SafetyTab referenced
 * non-existent FS_BATT_* parameters instead of the correct BATT_* ones.
 *
 * Correct ArduPilot low battery params:
 *   BATT_FS_LOW_ACT  (not FS_BATT_ENABLE)
 *   BATT_LOW_VOLT    (not FS_BATT_VOLTAGE)
 *   BATT_LOW_MAH     (not FS_BATT_MAH)
 */

const safetyTabSource = readFileSync(
  join(__dirname, '..', 'SafetyTab.tsx'),
  'utf-8',
);

describe('issue #50 - SafetyTab uses correct low battery parameter names', () => {
  const deprecatedToCorrect: Record<string, string> = {
    'FS_BATT_ENABLE': 'BATT_FS_LOW_ACT',
    'FS_BATT_VOLTAGE': 'BATT_LOW_VOLT',
    'FS_BATT_MAH': 'BATT_LOW_MAH',
  };

  it.each(Object.entries(deprecatedToCorrect))(
    'does not reference deprecated %s (should use %s)',
    (deprecated, _correct) => {
      expect(
        safetyTabSource,
        `SafetyTab.tsx still references "${deprecated}" which does not exist on ArduPilot FCs`,
      ).not.toContain(deprecated);
    },
  );

  it.each(Object.entries(deprecatedToCorrect))(
    'references correct parameter %s instead of %s',
    (_deprecated, correct) => {
      expect(
        safetyTabSource,
        `SafetyTab.tsx is missing reference to "${correct}"`,
      ).toContain(correct);
    },
  );
});

describe('issue #50 - SafetyTab reads low battery values from parameter store', () => {
  it('reads BATT_FS_LOW_ACT for low battery action', () => {
    expect(safetyTabSource).toContain("parameters.get('BATT_FS_LOW_ACT')");
  });

  it('reads BATT_LOW_VOLT for low battery voltage threshold', () => {
    expect(safetyTabSource).toContain("parameters.get('BATT_LOW_VOLT')");
  });

  it('reads BATT_LOW_MAH for low battery mAh threshold', () => {
    expect(safetyTabSource).toContain("parameters.get('BATT_LOW_MAH')");
  });
});

describe('issue #50 - SafetyTab writes low battery values via setParameter', () => {
  it('writes BATT_FS_LOW_ACT when low battery action is changed', () => {
    expect(safetyTabSource).toContain("setParameter('BATT_FS_LOW_ACT'");
  });

  it('writes BATT_LOW_VOLT when low voltage slider is changed', () => {
    expect(safetyTabSource).toContain("setParameter('BATT_LOW_VOLT'");
  });

  it('writes BATT_LOW_MAH when low mAh slider is changed', () => {
    expect(safetyTabSource).toContain("setParameter('BATT_LOW_MAH'");
  });
});

describe('issue #50 - SafetyTab critical battery params are also correct', () => {
  it('reads BATT_FS_CRT_ACT for critical battery action', () => {
    expect(safetyTabSource).toContain("parameters.get('BATT_FS_CRT_ACT')");
  });

  it('reads BATT_CRT_VOLT for critical battery voltage', () => {
    expect(safetyTabSource).toContain("parameters.get('BATT_CRT_VOLT')");
  });

  it('reads BATT_CRT_MAH for critical battery mAh', () => {
    expect(safetyTabSource).toContain("parameters.get('BATT_CRT_MAH')");
  });

  it('writes BATT_FS_CRT_ACT when critical battery action is changed', () => {
    expect(safetyTabSource).toContain("setParameter('BATT_FS_CRT_ACT'");
  });

  it('writes BATT_CRT_VOLT when critical voltage slider is changed', () => {
    expect(safetyTabSource).toContain("setParameter('BATT_CRT_VOLT'");
  });

  it('writes BATT_CRT_MAH when critical mAh slider is changed', () => {
    expect(safetyTabSource).toContain("setParameter('BATT_CRT_MAH'");
  });
});
