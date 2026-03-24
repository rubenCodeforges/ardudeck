import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Mock lucide-react since it's a renderer dependency not available in Node tests
vi.mock('lucide-react', () => ({
  Shield: 'Shield',
  Scale: 'Scale',
  Zap: 'Zap',
  Radio: 'Radio',
  Monitor: 'Monitor',
  Battery: 'Battery',
  Fence: 'Fence',
  AlertTriangle: 'AlertTriangle',
  CheckCircle: 'CheckCircle',
  XCircle: 'XCircle',
  Save: 'Save',
  Lightbulb: 'Lightbulb',
  Egg: 'Egg',
  Drama: 'Drama',
  Film: 'Film',
}));

import { SAFETY_PRESETS } from '../presets/mavlink-presets';

/**
 * Comprehensive regression tests for issue #50: Low battery settings on Safety tab.
 *
 * The bug: SafetyTab used non-existent FS_BATT_* parameters instead of the
 * correct ArduPilot BATT_* parameters, causing console errors:
 *   "Parameter FS_BATT_ENABLE does not exist on this flight controller"
 *   "Parameter FS_BATT_VOLTAGE does not exist on this flight controller"
 *   "Parameter FS_BATT_MAH does not exist on this flight controller"
 *
 * Correct ArduPilot parameters (from the issue report):
 *   BATT_LOW_VOLT      - Low battery voltage threshold
 *   BATT_LOW_MAH       - Low battery mAh remaining threshold
 *   BATT_CRT_VOLT      - Critical battery voltage threshold
 *   BATT_CRT_MAH       - Critical battery mAh remaining threshold
 *   BATT_FS_LOW_ACT    - Action on low battery (0=Disabled, 1=Land, 2=RTL)
 *   BATT_FS_CRT_ACT    - Action on critical battery (0=Disabled, 1=Land, 2=RTL)
 */

const safetyTabSource = readFileSync(
  join(__dirname, '..', 'SafetyTab.tsx'),
  'utf-8',
);

const presetsSource = readFileSync(
  join(__dirname, '..', 'presets', 'mavlink-presets.ts'),
  'utf-8',
);

describe('issue #50 - complete ArduPilot battery parameter set', () => {
  // These are the exact 6 parameters listed in the issue as correct
  const correctParams = [
    'BATT_LOW_VOLT',
    'BATT_LOW_MAH',
    'BATT_CRT_VOLT',
    'BATT_CRT_MAH',
    'BATT_FS_LOW_ACT',
    'BATT_FS_CRT_ACT',
  ];

  it.each(correctParams)(
    'SafetyTab references correct ArduPilot parameter %s',
    (param) => {
      expect(
        safetyTabSource,
        `SafetyTab.tsx is missing reference to "${param}" — one of the 6 correct battery params from issue #50`,
      ).toContain(param);
    },
  );

  it('SafetyTab references all 6 battery params from the issue', () => {
    const missing = correctParams.filter((p) => !safetyTabSource.includes(p));
    expect(
      missing,
      `SafetyTab is missing these ArduPilot battery params: ${missing.join(', ')}`,
    ).toHaveLength(0);
  });
});

describe('issue #50 - deprecated FS_BATT_* params removed from entire safety pipeline', () => {
  const deprecatedParams = ['FS_BATT_ENABLE', 'FS_BATT_VOLTAGE', 'FS_BATT_MAH'];

  describe('SafetyTab component', () => {
    it.each(deprecatedParams)(
      'does not contain deprecated %s',
      (deprecated) => {
        expect(safetyTabSource).not.toContain(deprecated);
      },
    );
  });

  describe('mavlink-presets.ts SAFETY_PRESETS section', () => {
    it.each(deprecatedParams)(
      'does not contain deprecated %s in any preset',
      (deprecated) => {
        for (const [key, preset] of Object.entries(SAFETY_PRESETS)) {
          expect(
            preset.params,
            `SAFETY_PRESETS["${key}"] still uses deprecated "${deprecated}"`,
          ).not.toHaveProperty(deprecated);
        }
      },
    );

    it.each(deprecatedParams)(
      'presets source code does not reference deprecated %s as a key',
      (deprecated) => {
        // Match the param as a quoted key in the SAFETY_PRESETS object
        const asKey = `'${deprecated}'`;
        // Only check the SAFETY_PRESETS portion of the file
        const safetyPresetsStart = presetsSource.indexOf('SAFETY_PRESETS');
        expect(safetyPresetsStart).toBeGreaterThan(-1);
        const safetyPresetsSection = presetsSource.slice(safetyPresetsStart);
        expect(
          safetyPresetsSection,
          `mavlink-presets.ts SAFETY_PRESETS section still references "${deprecated}"`,
        ).not.toContain(asKey);
      },
    );
  });
});

describe('issue #50 - semantic label fix for mAh threshold', () => {
  it('uses "Low mAh Remaining" not "Low mAh Used" for the low battery slider', () => {
    // The fix changed the label from "Low mAh Used" to "Low mAh Remaining"
    // because BATT_LOW_MAH is a *remaining* threshold, not a *consumed* counter
    expect(safetyTabSource).toContain('Low mAh Remaining');
    expect(safetyTabSource).not.toContain('Low mAh Used');
  });

  it('hint describes "remaining mAh drops below" not "mAh consumed exceeds"', () => {
    // The semantic meaning changed: old FS_BATT_MAH was "consumed", new BATT_LOW_MAH is "remaining"
    expect(safetyTabSource).toContain('remaining mAh drops below');
    expect(safetyTabSource).not.toContain('mAh consumed exceeds');
  });

  it('critical battery also uses "remaining" semantics', () => {
    expect(safetyTabSource).toContain('Critical mAh Remaining');
  });
});

describe('issue #50 - preset values produce valid setParameter calls', () => {
  // When applyPreset() is called, it iterates preset.params and calls
  // setParameter(key, value) for each. Verify the keys are valid battery
  // params that the component actually reads.

  const paramsReadByComponent = [
    'BATT_FS_LOW_ACT',
    'BATT_LOW_VOLT',
    'BATT_LOW_MAH',
    'BATT_FS_CRT_ACT',
    'BATT_CRT_VOLT',
    'BATT_CRT_MAH',
  ];

  it('all battery-related preset keys are params the component reads', () => {
    for (const [key, preset] of Object.entries(SAFETY_PRESETS)) {
      const presetBattKeys = Object.keys(preset.params).filter(
        (k) => k.startsWith('BATT_') || k.startsWith('FS_BATT'),
      );
      for (const battKey of presetBattKeys) {
        expect(
          paramsReadByComponent,
          `SAFETY_PRESETS["${key}"] has battery param "${battKey}" but SafetyTab doesn't read it`,
        ).toContain(battKey);
      }
    }
  });

  it('maximum preset action params would produce working setParameter calls', () => {
    const preset = SAFETY_PRESETS['maximum']!;
    // These must be valid: setParameter('BATT_FS_LOW_ACT', 2) and setParameter('BATT_FS_CRT_ACT', 1)
    expect(preset.params).toHaveProperty('BATT_FS_LOW_ACT');
    expect(typeof preset.params['BATT_FS_LOW_ACT']).toBe('number');
    expect(preset.params).toHaveProperty('BATT_FS_CRT_ACT');
    expect(typeof preset.params['BATT_FS_CRT_ACT']).toBe('number');
  });
});

describe('issue #50 - component state variable mapping', () => {
  // The useMemo in SafetyTab maps JS variable names to parameters.get() calls.
  // Verify the mappings are correct and complete.

  const variableToParam: Record<string, string> = {
    battFsLowAct: 'BATT_FS_LOW_ACT',
    battLowVolt: 'BATT_LOW_VOLT',
    battLowMah: 'BATT_LOW_MAH',
    battFsCrtAct: 'BATT_FS_CRT_ACT',
    battCrtVolt: 'BATT_CRT_VOLT',
    battCrtMah: 'BATT_CRT_MAH',
  };

  it.each(Object.entries(variableToParam))(
    'variable %s maps to parameters.get("%s")',
    (variable, param) => {
      // Verify the variable name and parameter get() are both in the source
      // and that the variable is assigned from the correct param
      const pattern = `${variable}: parameters.get('${param}')`;
      expect(
        safetyTabSource,
        `Expected "${variable}" to be assigned from parameters.get('${param}')`,
      ).toContain(pattern);
    },
  );

  it('does not have any fsBatt-prefixed variables (old naming)', () => {
    // The old code used fsBattEnable, fsBattVoltage, fsBattMah
    expect(safetyTabSource).not.toContain('fsBattEnable');
    expect(safetyTabSource).not.toContain('fsBattVoltage');
    expect(safetyTabSource).not.toContain('fsBattMah');
  });
});

describe('issue #50 - low battery UI wiring', () => {
  it('low battery action select is wired to BATT_FS_LOW_ACT value and onChange', () => {
    // The select value should read from battFsLowAct and write to BATT_FS_LOW_ACT
    expect(safetyTabSource).toContain('value={safetyValues.battFsLowAct}');
    expect(safetyTabSource).toContain("setParameter('BATT_FS_LOW_ACT'");
  });

  it('low voltage slider is wired to BATT_LOW_VOLT value and onChange', () => {
    expect(safetyTabSource).toContain('safetyValues.battLowVolt');
    expect(safetyTabSource).toContain("setParameter('BATT_LOW_VOLT'");
  });

  it('low mAh slider is wired to BATT_LOW_MAH value and onChange', () => {
    expect(safetyTabSource).toContain('safetyValues.battLowMah');
    expect(safetyTabSource).toContain("setParameter('BATT_LOW_MAH'");
  });

  it('low battery action options include Disabled, Land, and RTL', () => {
    // Verify the select has all 3 valid BATT_FS_LOW_ACT values
    // These must be within the low battery section (before critical battery)
    const lowBattSection = safetyTabSource.slice(
      safetyTabSource.indexOf('Low Battery'),
      safetyTabSource.indexOf('Critical Battery'),
    );
    expect(lowBattSection).toContain('value={0}>Disabled');
    expect(lowBattSection).toContain('value={1}>Land Immediately');
    expect(lowBattSection).toContain('value={2}>RTL');
  });
});
