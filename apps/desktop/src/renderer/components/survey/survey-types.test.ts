import { describe, it, expect } from 'vitest';
import { DEFAULT_SURVEY_CONFIG } from './survey-types';
import type { AltitudeReference } from './survey-types';

describe('DEFAULT_SURVEY_CONFIG', () => {
  it('defaults to "relative" altitude reference', () => {
    expect(DEFAULT_SURVEY_CONFIG.altitudeReference).toBe('relative');
  });

  it('has altitude reference field instead of useTerrainFollow', () => {
    // Verify the new field exists
    expect(DEFAULT_SURVEY_CONFIG).toHaveProperty('altitudeReference');
    // Verify the old field was removed
    expect(DEFAULT_SURVEY_CONFIG).not.toHaveProperty('useTerrainFollow');
  });

  it('has sensible default values', () => {
    expect(DEFAULT_SURVEY_CONFIG.altitude).toBe(80);
    expect(DEFAULT_SURVEY_CONFIG.speed).toBe(5);
    expect(DEFAULT_SURVEY_CONFIG.frontOverlap).toBe(75);
    expect(DEFAULT_SURVEY_CONFIG.sideOverlap).toBe(60);
    expect(DEFAULT_SURVEY_CONFIG.gridAngle).toBe(0);
    expect(DEFAULT_SURVEY_CONFIG.overshoot).toBe(20);
    expect(DEFAULT_SURVEY_CONFIG.pattern).toBe('grid');
  });
});

describe('AltitudeReference type', () => {
  it('accepts all valid altitude reference values', () => {
    const validRefs: AltitudeReference[] = ['relative', 'asl', 'terrain'];
    expect(validRefs).toHaveLength(3);
    expect(validRefs).toContain('relative');
    expect(validRefs).toContain('asl');
    expect(validRefs).toContain('terrain');
  });
});
