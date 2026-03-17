import { describe, it, expect } from 'vitest';
import { createSearchRegex, matchesSearchQuery } from '../search-utils.js';

describe('createSearchRegex', () => {
  it('creates a case-insensitive regex from a plain string', () => {
    const regex = createSearchRegex('SERIAL');
    expect(regex.flags).toContain('i');
    expect(regex.test('SERIAL1_BAUD')).toBe(true);
    expect(regex.test('serial1_baud')).toBe(true);
    expect(regex.test('Serial1_Baud')).toBe(true);
  });

  it('supports character class patterns like serial[56]_baud', () => {
    const regex = createSearchRegex('serial[56]_baud');
    expect(regex.test('SERIAL5_BAUD')).toBe(true);
    expect(regex.test('SERIAL6_BAUD')).toBe(true);
    expect(regex.test('SERIAL1_BAUD')).toBe(false);
    expect(regex.test('SERIAL7_BAUD')).toBe(false);
  });

  it('supports dot wildcard', () => {
    const regex = createSearchRegex('SERIAL._BAUD');
    expect(regex.test('SERIAL1_BAUD')).toBe(true);
    expect(regex.test('SERIAL9_BAUD')).toBe(true);
  });

  it('supports alternation with pipe', () => {
    const regex = createSearchRegex('SERIAL1|SERIAL2');
    expect(regex.test('SERIAL1_BAUD')).toBe(true);
    expect(regex.test('SERIAL2_BAUD')).toBe(true);
    expect(regex.test('SERIAL3_BAUD')).toBe(false);
  });

  it('supports quantifiers', () => {
    const regex = createSearchRegex('SERVO\\d+_MIN');
    expect(regex.test('SERVO1_MIN')).toBe(true);
    expect(regex.test('SERVO12_MIN')).toBe(true);
    expect(regex.test('SERVO_MIN')).toBe(false);
  });

  it('supports anchors', () => {
    const regex = createSearchRegex('^SERIAL');
    expect(regex.test('SERIAL1_BAUD')).toBe(true);
    expect(regex.test('AUX_SERIAL')).toBe(false);
  });

  it('falls back to literal match for invalid regex', () => {
    // Unbalanced bracket is invalid regex
    const regex = createSearchRegex('serial[bad');
    expect(regex.test('serial[bad')).toBe(true);
    expect(regex.test('SERIAL[BAD')).toBe(true);
    // Should not match partial strings that would match if regex were valid
    expect(regex.test('serialbad')).toBe(false);
  });

  it('falls back to literal match for unbalanced parentheses', () => {
    const regex = createSearchRegex('foo(bar');
    expect(regex.test('foo(bar')).toBe(true);
    expect(regex.test('foobar')).toBe(false);
  });

  it('falls back escapes all special chars in invalid regex fallback', () => {
    const regex = createSearchRegex('test[.*+?^${}()|\\');
    expect(regex.test('test[.*+?^${}()|\\' )).toBe(true);
  });
});

describe('matchesSearchQuery', () => {
  const params = [
    'SERIAL1_BAUD',
    'SERIAL2_BAUD',
    'SERIAL5_BAUD',
    'SERIAL6_BAUD',
    'SERVO1_MIN',
    'SERVO1_MAX',
    'SERVO2_MIN',
    'SERVO2_MAX',
    'ARMING_CHECK',
    'BATT_MONITOR',
    'GPS_TYPE',
  ];

  it('matches everything for empty query', () => {
    for (const p of params) {
      expect(matchesSearchQuery(p, '')).toBe(true);
      expect(matchesSearchQuery(p, '   ')).toBe(true);
    }
  });

  it('filters with plain substring (case-insensitive)', () => {
    const matches = params.filter(p => matchesSearchQuery(p, 'serial'));
    expect(matches).toEqual([
      'SERIAL1_BAUD',
      'SERIAL2_BAUD',
      'SERIAL5_BAUD',
      'SERIAL6_BAUD',
    ]);
  });

  it('filters with character class regex pattern', () => {
    const matches = params.filter(p => matchesSearchQuery(p, 'serial[56]_baud'));
    expect(matches).toEqual(['SERIAL5_BAUD', 'SERIAL6_BAUD']);
  });

  it('filters with alternation regex pattern', () => {
    const matches = params.filter(p => matchesSearchQuery(p, 'arming|batt'));
    expect(matches).toEqual(['ARMING_CHECK', 'BATT_MONITOR']);
  });

  it('filters with dot wildcard regex pattern', () => {
    const matches = params.filter(p => matchesSearchQuery(p, 'servo._min'));
    expect(matches).toEqual(['SERVO1_MIN', 'SERVO2_MIN']);
  });

  it('filters with anchor regex pattern', () => {
    const matches = params.filter(p => matchesSearchQuery(p, '^gps'));
    expect(matches).toEqual(['GPS_TYPE']);
  });

  it('filters with suffix anchor', () => {
    const matches = params.filter(p => matchesSearchQuery(p, 'max$'));
    expect(matches).toEqual(['SERVO1_MAX', 'SERVO2_MAX']);
  });

  it('handles invalid regex gracefully as literal match', () => {
    // No params contain the literal string "serial[bad"
    const matches = params.filter(p => matchesSearchQuery(p, 'serial[bad'));
    expect(matches).toEqual([]);
  });
});
