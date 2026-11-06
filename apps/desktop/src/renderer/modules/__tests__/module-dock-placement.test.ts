import { describe, expect, it } from 'vitest';
import { dockLeftClearOf } from '../ModuleDock';

const SIZE = { w: 135, h: 38 };
const rect = (left: number, top: number, w: number, h: number) => ({ left, top, right: left + w, bottom: top + h });
const corner = { left: 1361, top: 859 };

describe('dockLeftClearOf', () => {
  it('stays put when nothing is parked under the launcher', () => {
    expect(dockLeftClearOf(corner, SIZE, [])).toBe(1361);
    expect(dockLeftClearOf(corner, SIZE, [rect(10, 10, 200, 200)])).toBe(1361);
  });
  it('steps left of a panel under it, the Fleet Ops case on the live screen', () => {
    const fleetOps = rect(1260, 698, 240, 238.5);
    expect(dockLeftClearOf({ left: 1361, top: 820 }, SIZE, [fleetOps])).toBe(1260 - 135 - 12);
  });
  it('keeps stepping when the first step meets another panel, and never leaves the screen', () => {
    const a = rect(1260, 698, 240, 240);
    const b = rect(1050, 800, 150, 100);
    expect(dockLeftClearOf(corner, SIZE, [a, b])).toBe(1050 - 135 - 12);
    expect(dockLeftClearOf({ left: 20, top: 859 }, SIZE, [rect(0, 800, 300, 100)])).toBe(8);
  });
});
