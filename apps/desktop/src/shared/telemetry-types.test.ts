import { describe, it, expect } from 'vitest';
import { getPx4ModeName } from './telemetry-types.js';

// Build a PX4 custom_mode from main/sub mode, matching the wire encoding:
//   main_mode = (customMode >> 16) & 0xFF, sub_mode = (customMode >> 24) & 0xFF
const cm = (mainMode: number, subMode = 0): number => (mainMode << 16) | (subMode << 24);

describe('getPx4ModeName', () => {
  it('decodes simple main modes', () => {
    expect(getPx4ModeName(cm(1))).toBe('Manual');
    expect(getPx4ModeName(cm(2))).toBe('Altitude');
    expect(getPx4ModeName(cm(5))).toBe('Acro');
    expect(getPx4ModeName(cm(6))).toBe('Offboard');
    expect(getPx4ModeName(cm(7))).toBe('Stabilized');
  });

  it('decodes POSCTL sub modes', () => {
    expect(getPx4ModeName(cm(3, 0))).toBe('Position');
    expect(getPx4ModeName(cm(3, 1))).toBe('Orbit');
  });

  it('decodes AUTO sub modes', () => {
    expect(getPx4ModeName(cm(4, 1))).toBe('Ready');
    expect(getPx4ModeName(cm(4, 2))).toBe('Takeoff');
    expect(getPx4ModeName(cm(4, 3))).toBe('Hold');
    expect(getPx4ModeName(cm(4, 4))).toBe('Mission');
    expect(getPx4ModeName(cm(4, 5))).toBe('Return');
    expect(getPx4ModeName(cm(4, 6))).toBe('Land');
    expect(getPx4ModeName(cm(4, 8))).toBe('Follow Me');
    expect(getPx4ModeName(cm(4, 9))).toBe('Precision Land');
  });

  it('falls back gracefully for unknown values', () => {
    expect(getPx4ModeName(cm(99))).toBe('Mode ' + cm(99));
    expect(getPx4ModeName(cm(4, 99))).toBe('Auto 99');
  });
});
