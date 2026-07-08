import { describe, expect, it } from 'vitest';
import {
  buildGridIndex,
  collectInBounds,
  collectMaterializable,
  countInBounds,
  estimateLabelWidthPx,
  labelStride,
  meanConsecutiveSpacing,
  pickCellSize,
  queryNearest,
} from './waypoint-tiers';

function grid(points: Array<[number, number]>, cellSize = 10) {
  return buildGridIndex(points.map(([x, y]) => ({ x, y })), cellSize);
}

describe('buildGridIndex / queryNearest', () => {
  it('returns -1 for an empty index', () => {
    expect(queryNearest(grid([]), 0, 0, 100)).toBe(-1);
  });

  it('finds a single point within the radius', () => {
    const idx = grid([[5, 5]]);
    expect(queryNearest(idx, 6, 6, 3)).toBe(0);
  });

  it('rejects a point outside the radius', () => {
    const idx = grid([[5, 5]]);
    expect(queryNearest(idx, 20, 20, 3)).toBe(-1);
  });

  it('respects the radius as a true circle, not the candidate square', () => {
    // Corner distance sqrt(2)*4 = 5.657: inside the candidate square for
    // radius 5 but outside the circle.
    const idx = grid([[4, 4]], 1);
    expect(queryNearest(idx, 0, 0, 5)).toBe(-1);
    expect(queryNearest(idx, 0, 0, 5.7)).toBe(0);
  });

  it('returns the nearest of several candidates', () => {
    const idx = grid([
      [0, 0],
      [10, 0],
      [3, 0],
    ]);
    expect(queryNearest(idx, 4, 0, 100)).toBe(2);
  });

  it('handles negative coordinates', () => {
    const idx = grid([
      [-25, -25],
      [-5, -5],
    ]);
    expect(queryNearest(idx, -6, -6, 5)).toBe(1);
  });

  it('finds neighbors across cell boundaries', () => {
    // Points in adjacent cells of a coarse grid; query sits near the edge.
    const idx = grid(
      [
        [9.9, 5],
        [10.1, 5],
      ],
      10,
    );
    expect(queryNearest(idx, 10.05, 5, 1)).toBe(1);
    expect(queryNearest(idx, 9.95, 5, 1)).toBe(0);
  });

  it('survives a radius far larger than the data extent (cell-scan fallback)', () => {
    const idx = grid(
      [
        [0, 0],
        [1, 1],
      ],
      0.5,
    );
    // Radius spans millions of candidate cells; the query must fall back to
    // scanning occupied cells instead of the cell range.
    expect(queryNearest(idx, 1e6, 1e6, 2e6)).toBe(1);
  });
});

describe('countInBounds / collectInBounds', () => {
  const points: Array<[number, number]> = [
    [0, 0],
    [5, 5],
    [10, 10],
    [50, 50],
    [-10, -10],
  ];

  it('counts points inside the box, boundaries inclusive', () => {
    const idx = grid(points);
    expect(countInBounds(idx, { minX: 0, minY: 0, maxX: 10, maxY: 10 })).toBe(3);
  });

  it('returns 0 for an empty index or empty region', () => {
    expect(countInBounds(grid([]), { minX: 0, minY: 0, maxX: 10, maxY: 10 })).toBe(0);
    expect(countInBounds(grid(points), { minX: 100, minY: 100, maxX: 110, maxY: 110 })).toBe(0);
  });

  it('counts everything when the box dwarfs the data (cell-scan fallback)', () => {
    const idx = grid(points, 0.5);
    expect(countInBounds(idx, { minX: -1e9, minY: -1e9, maxX: 1e9, maxY: 1e9 })).toBe(5);
  });

  it('collects exactly the contained indices', () => {
    const idx = grid(points);
    const got = collectInBounds(idx, { minX: -15, minY: -15, maxX: 6, maxY: 6 });
    expect(new Set(got)).toEqual(new Set([0, 1, 4]));
  });
});

describe('collectMaterializable', () => {
  const points: Array<[number, number]> = [
    [0, 0],
    [1, 1],
    [2, 2],
    [100, 100],
  ];

  it('returns indices when the in-view count is at or below the threshold', () => {
    const idx = grid(points);
    const got = collectMaterializable(idx, { minX: 0, minY: 0, maxX: 5, maxY: 5 }, 3);
    expect(got).not.toBeNull();
    expect(new Set(got!)).toEqual(new Set([0, 1, 2]));
  });

  it('returns null when the in-view count exceeds the threshold', () => {
    const idx = grid(points);
    expect(collectMaterializable(idx, { minX: 0, minY: 0, maxX: 5, maxY: 5 }, 2)).toBeNull();
  });

  it('treats a threshold equal to the count as materializable (at-or-below)', () => {
    const idx = grid(points);
    const got = collectMaterializable(idx, { minX: -1e6, minY: -1e6, maxX: 1e6, maxY: 1e6 }, 4);
    expect(got).toHaveLength(4);
  });
});

describe('pickCellSize', () => {
  it('targets roughly one point per cell over the data area', () => {
    // 100x100 extent, 100 points -> ~10 units per cell.
    expect(pickCellSize(100, 100, 100)).toBeCloseTo(10);
  });

  it('never returns zero for degenerate extents', () => {
    expect(pickCellSize(0, 0, 10)).toBeGreaterThan(0);
    expect(pickCellSize(100, 0, 10)).toBeGreaterThan(0);
    expect(pickCellSize(100, 100, 0)).toBeGreaterThan(0);
  });
});

describe('meanConsecutiveSpacing', () => {
  it('returns 0 for fewer than two points', () => {
    expect(meanConsecutiveSpacing([])).toBe(0);
    expect(meanConsecutiveSpacing([{ x: 1, y: 1 }])).toBe(0);
  });

  it('averages consecutive distances along the path', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 3, y: 4 }, // 5
      { x: 3, y: 14 }, // 10
    ];
    expect(meanConsecutiveSpacing(points)).toBeCloseTo(7.5);
  });
});

describe('labelStride', () => {
  it('returns 0 (no labels) when dots are packed too tight to read', () => {
    expect(labelStride(30, 0)).toBe(0);
    expect(labelStride(30, 2)).toBe(0);
    expect(labelStride(0, 100)).toBe(0);
  });

  it('returns 1 (all labels) when spacing comfortably exceeds the label width', () => {
    expect(labelStride(20, 40)).toBe(1);
    expect(labelStride(20, 30)).toBe(1);
  });

  it('returns every-Nth at intermediate spacing so labels never overlap', () => {
    // label 20px * 1.5 clearance = 30px needed; 8px spacing -> every 4th.
    const stride = labelStride(20, 8);
    expect(stride).toBe(4);
    expect(stride * 8).toBeGreaterThanOrEqual(30);
  });

  it('is monotonic: tighter spacing never yields a denser stride', () => {
    let prev = labelStride(20, 100);
    for (const spacing of [50, 30, 20, 12, 8, 7, 6]) {
      const s = labelStride(20, spacing);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });
});

describe('estimateLabelWidthPx', () => {
  it('grows with digit count', () => {
    expect(estimateLabelWidthPx(9)).toBeLessThan(estimateLabelWidthPx(99));
    expect(estimateLabelWidthPx(999)).toBeLessThan(estimateLabelWidthPx(23000));
  });

  it('handles non-positive input with a sane minimum', () => {
    expect(estimateLabelWidthPx(0)).toBeGreaterThan(0);
    expect(estimateLabelWidthPx(-5)).toBeGreaterThan(0);
  });
});
