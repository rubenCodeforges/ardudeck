import { describe, it, expect } from 'vitest';
import { parseDecimal, isInRange, resolveDraft } from './DraftNumberField';

describe('resolveDraft', () => {
  // The complaint: the box could not be cleared and retyped. Clearing is now
  // a legal intermediate state; it just reverts if you leave it empty.
  it('treats an empty box as "no change", never as zero', () => {
    expect(resolveDraft('', 5, 180)).toBeNull();
    expect(resolveDraft('   ', 5, 180)).toBeNull();
  });

  it('takes a value that is only valid once finished typing', () => {
    expect(resolveDraft('12', 5, 180)).toBe(12);
  });

  it('refuses to guess at an out-of-range entry', () => {
    expect(resolveDraft('900', 5, 180)).toBeNull();
    expect(resolveDraft('-4', 0, 100)).toBeNull();
  });

  it('accepts a comma decimal separator', () => {
    expect(resolveDraft('2,5', 0, 10)).toBe(2.5);
  });

  it('rejects anything that is not a number', () => {
    expect(resolveDraft('abc', 0, 10)).toBeNull();
    expect(resolveDraft('1.2.3', 0, 10)).toBeNull();
  });

  it('works without bounds', () => {
    expect(resolveDraft('-40')).toBe(-40);
  });
});

describe('parseDecimal and isInRange', () => {
  it('parses both separators', () => {
    expect(parseDecimal('2.5')).toBe(2.5);
    expect(parseDecimal('2,5')).toBe(2.5);
  });

  it('bounds inclusively', () => {
    expect(isInRange(5, 5, 10)).toBe(true);
    expect(isInRange(10, 5, 10)).toBe(true);
    expect(isInRange(4.9, 5, 10)).toBe(false);
    expect(isInRange(NaN, 0, 10)).toBe(false);
  });
});
