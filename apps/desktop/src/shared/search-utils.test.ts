import { describe, it, expect } from 'vitest';
import { createSearchRegex, matchesSearchQuery } from './search-utils.js';

describe('createSearchRegex', () => {
  it('creates a case-insensitive regex from a plain string', () => {
    const regex = createSearchRegex('batt');
    expect(regex.flags).toContain('i');
    expect(regex.test('BATT_ARM_VOLT')).toBe(true);
    expect(regex.test('batt_arm_volt')).toBe(true);
  });

  it('supports character class patterns like serial[56]', () => {
    const regex = createSearchRegex('serial[56]_baud');
    expect(regex.test('SERIAL5_BAUD')).toBe(true);
    expect(regex.test('SERIAL6_BAUD')).toBe(true);
    expect(regex.test('SERIAL1_BAUD')).toBe(false);
    expect(regex.test('SERIAL4_BAUD')).toBe(false);
  });

  it('supports dot as wildcard', () => {
    const regex = createSearchRegex('SERIAL._BAUD');
    expect(regex.test('SERIAL1_BAUD')).toBe(true);
    expect(regex.test('SERIAL9_BAUD')).toBe(true);
  });

  it('supports alternation with pipe', () => {
    const regex = createSearchRegex('GPS|COMPASS');
    expect(regex.test('GPS_TYPE')).toBe(true);
    expect(regex.test('COMPASS_DEC')).toBe(true);
    expect(regex.test('BATT_ARM_VOLT')).toBe(false);
  });

  it('supports anchors', () => {
    const regex = createSearchRegex('^BATT');
    expect(regex.test('BATT_ARM_VOLT')).toBe(true);
    expect(regex.test('RC_BATT')).toBe(false);
  });

  it('supports quantifiers', () => {
    const regex = createSearchRegex('SERIAL\\d+_BAUD');
    expect(regex.test('SERIAL1_BAUD')).toBe(true);
    expect(regex.test('SERIAL12_BAUD')).toBe(true);
  });

  it('falls back to literal match for invalid regex', () => {
    // Unmatched bracket is invalid regex
    const regex = createSearchRegex('[invalid');
    expect(regex.test('[invalid')).toBe(true);
    expect(regex.test('something_else')).toBe(false);
  });

  it('falls back to literal match for unmatched parenthesis', () => {
    const regex = createSearchRegex('(unclosed');
    expect(regex.test('(unclosed')).toBe(true);
  });

  it('escapes all special characters when falling back to literal', () => {
    // This is invalid regex due to unmatched [
    const regex = createSearchRegex('a[b');
    expect(regex.test('a[b')).toBe(true);
    expect(regex.test('ab')).toBe(false);
  });
});

describe('matchesSearchQuery', () => {
  it('returns true for empty query', () => {
    expect(matchesSearchQuery('ANYTHING', '')).toBe(true);
  });

  it('returns true for whitespace-only query', () => {
    expect(matchesSearchQuery('ANYTHING', '   ')).toBe(true);
  });

  it('matches case-insensitively with plain text', () => {
    expect(matchesSearchQuery('BATT_ARM_VOLT', 'batt')).toBe(true);
    expect(matchesSearchQuery('BATT_ARM_VOLT', 'BATT')).toBe(true);
    expect(matchesSearchQuery('BATT_ARM_VOLT', 'Batt')).toBe(true);
  });

  it('matches using regex character classes (issue #71 use case)', () => {
    expect(matchesSearchQuery('SERIAL5_BAUD', 'serial[56]_baud')).toBe(true);
    expect(matchesSearchQuery('SERIAL6_BAUD', 'serial[56]_baud')).toBe(true);
    expect(matchesSearchQuery('SERIAL1_BAUD', 'serial[56]_baud')).toBe(false);
    expect(matchesSearchQuery('SERIAL7_BAUD', 'serial[56]_baud')).toBe(false);
  });

  it('matches partial strings (not anchored)', () => {
    expect(matchesSearchQuery('BATT_ARM_VOLT', 'arm')).toBe(true);
    expect(matchesSearchQuery('BATT_ARM_VOLT', 'volt')).toBe(true);
  });

  it('does not match unrelated params', () => {
    expect(matchesSearchQuery('GPS_TYPE', 'serial')).toBe(false);
  });

  it('handles invalid regex gracefully', () => {
    // Should not throw, should fall back to literal
    expect(() => matchesSearchQuery('PARAM', '[bad')).not.toThrow();
    expect(matchesSearchQuery('[bad_param', '[bad')).toBe(true);
  });

  it('supports complex regex patterns', () => {
    // Match any RC input channel parameter
    expect(matchesSearchQuery('RC1_MIN', '^rc\\d+_(min|max)$')).toBe(true);
    expect(matchesSearchQuery('RC12_MAX', '^rc\\d+_(min|max)$')).toBe(true);
    expect(matchesSearchQuery('RC1_TRIM', '^rc\\d+_(min|max)$')).toBe(false);
  });

  it('supports range patterns in character classes', () => {
    expect(matchesSearchQuery('SERIAL3_BAUD', 'serial[1-4]_baud')).toBe(true);
    expect(matchesSearchQuery('SERIAL7_BAUD', 'serial[1-4]_baud')).toBe(false);
  });
});
