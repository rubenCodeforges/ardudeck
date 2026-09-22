import { describe, it, expect } from 'vitest';
import { resolveParamBounds } from './useParamBounds';
import type { ParameterMetadata } from '../../shared/parameter-metadata';

function meta(partial: Partial<ParameterMetadata>): ParameterMetadata {
  return { name: 'X', humanName: 'X', description: '', ...partial };
}

describe('resolveParamBounds', () => {
  it('falls back when no metadata is loaded', () => {
    expect(resolveParamBounds('ATC_STR_RAT_P', undefined, 0, 2, 0.01)).toEqual({
      min: 0, max: 2, step: 0.01, fromMetadata: false,
    });
  });

  it('uses the range and increment from vehicle metadata', () => {
    const m = meta({ range: { min: 0, max: 3 }, increment: 0.05 });
    expect(resolveParamBounds('ATC_STR_RAT_P', m, 0, 2, 0.01)).toEqual({
      min: 0, max: 3, step: 0.05, fromMetadata: true,
    });
  });

  it('overrides a declared end the firmware treats as off', () => {
    const m = meta({ range: { min: -0.5, max: 0.95 } });
    const b = resolveParamBounds('MANUAL_STR_EXPO', m, -0.5, 0.9, 0.05);
    expect(b.max).toBe(0.9);
    expect(b.min).toBe(-0.5);
  });

  it('keeps the negative half of a symmetric range', () => {
    const m = meta({ range: { min: -1, max: 1 } });
    const b = resolveParamBounds('MOT_THST_EXPO', m, -1, 1, 0.05);
    expect(b.min).toBe(-1);
    expect(b.max).toBe(1);
  });

  it('prefers metadata over the hardcoded fallback when they disagree', () => {
    const m = meta({ range: { min: 10, max: 720 } });
    const b = resolveParamBounds('ACRO_TURN_RATE', m, 10, 360, 5);
    expect(b.max).toBe(720);
  });

  it('ignores a range too narrow to drag', () => {
    const m = meta({ range: { min: 5, max: 5 } });
    expect(resolveParamBounds('WP_RADIUS', m, 0.5, 20, 0.5)).toMatchObject({
      min: 0.5, max: 20, fromMetadata: false,
    });
  });

  it('ignores a non-finite range', () => {
    const m = meta({ range: { min: NaN, max: 10 } });
    expect(resolveParamBounds('WP_RADIUS', m, 0.5, 20, 0.5)).toMatchObject({ min: 0.5, max: 20 });
  });

  it('ignores a zero or negative increment', () => {
    const m = meta({ range: { min: 0, max: 3 }, increment: 0 });
    expect(resolveParamBounds('ATC_STR_RAT_P', m, 0, 2, 0.01).step).toBe(0.01);
  });
});
