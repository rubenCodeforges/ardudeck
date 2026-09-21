import { describe, it, expect } from 'vitest';
import { stripFlightOrder } from './strip-order';

const coversAll = (order: number[], count: number) =>
  new Set(order).size === count && order.length === count;

describe('stripFlightOrder', () => {
  it('flies them in order when a copter turns on the spot', () => {
    const plan = stripFlightOrder(6, 30, 0);
    expect(plan.order).toEqual([0, 1, 2, 3, 4, 5]);
    expect(plan.stride).toBe(1);
  });

  it('flies them in order when the lines are already far enough apart', () => {
    // 100 m spacing, 37 m radius: a 74 m turn fits between neighbours.
    const plan = stripFlightOrder(6, 100, 37);
    expect(plan.order).toEqual([0, 1, 2, 3, 4, 5]);
    expect(plan.turnsFit).toBe(true);
  });

  // The real case: 30 m lines, 37 m radius. A 74 m turn does not fit between
  // neighbours, so flying 1,2,3 rolls out off the line every time.
  it('skips strips when a neighbour is inside the turn diameter', () => {
    const plan = stripFlightOrder(9, 30, 37);
    expect(plan.stride).toBe(3);
    expect(plan.order).toEqual([0, 3, 6, 1, 4, 7, 2, 5, 8]);
    expect(plan.turnsFit).toBe(true);
    expect(plan.tightestTurnM).toBeGreaterThanOrEqual(74);
  });

  it('still flies every strip exactly once', () => {
    for (const [count, spacing, radius] of [[9, 30, 37], [7, 25, 50], [12, 40, 35], [5, 10, 80]] as const) {
      const plan = stripFlightOrder(count, spacing, radius);
      expect(coversAll(plan.order, count), `${count}/${spacing}/${radius}`).toBe(true);
    }
  });

  it('every consecutive turn gets at least the diameter, when it can', () => {
    const plan = stripFlightOrder(9, 30, 37);
    for (let i = 1; i < plan.order.length; i++) {
      const gap = Math.abs(plan.order[i]! - plan.order[i - 1]!) * 30;
      expect(gap).toBeGreaterThanOrEqual(74);
    }
  });

  // Two strips 30 m apart cannot be reordered into a turn a plane can make;
  // saying so beats silently planning a turn it will blow through.
  it('admits when no ordering can make the turn fit', () => {
    const plan = stripFlightOrder(2, 30, 37);
    expect(plan.turnsFit).toBe(false);
    expect(plan.tightestTurnM).toBe(30);
  });

  it('never strides past the last strip', () => {
    const plan = stripFlightOrder(4, 5, 200);
    expect(plan.stride).toBeLessThanOrEqual(3);
    expect(coversAll(plan.order, 4)).toBe(true);
  });

  it('handles the degenerate counts', () => {
    expect(stripFlightOrder(0, 30, 37).order).toEqual([]);
    expect(stripFlightOrder(1, 30, 37).order).toEqual([0]);
    expect(stripFlightOrder(1, 30, 37).turnsFit).toBe(true);
  });
});
