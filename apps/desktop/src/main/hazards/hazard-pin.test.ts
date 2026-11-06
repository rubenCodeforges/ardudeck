import { describe, expect, it } from 'vitest';
import { hashPin, isAcceptablePin, verifyPin } from './hazard-pin';

describe('hazard PIN', () => {
  it('accepts the right PIN and rejects a wrong one', () => {
    const stored = hashPin('482913');
    expect(verifyPin('482913', stored)).toBe(true);
    expect(verifyPin('482914', stored)).toBe(false);
  });

  it('salts every hash and never stores the PIN', () => {
    const a = hashPin('1234');
    const b = hashPin('1234');
    expect(a.hash).not.toBe(b.hash);
    expect(JSON.stringify(a)).not.toContain('1234');
  });

  it('refuses a PIN shorter than the minimum', () => {
    expect(isAcceptablePin('123')).toBe(false);
    expect(isAcceptablePin('1234')).toBe(true);
    expect(isAcceptablePin(1234)).toBe(false);
  });
});
