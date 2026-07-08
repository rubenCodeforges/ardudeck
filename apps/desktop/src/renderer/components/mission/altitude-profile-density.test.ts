import { describe, it, expect } from 'vitest';
import {
  DEFAULT_LABEL_WIDTH_PX,
  INTERACTIVE_DOT_THRESHOLD,
  decimateForDrawing,
  drawStride,
  labelStride,
  nearestIndexByX,
  shouldShowInteractiveDots,
} from './altitude-profile-density';

describe('labelStride', () => {
  it('labels every point when all labels fit', () => {
    // 30 labels of 28px need 840px; 900px available -> stride 1
    expect(labelStride(30, 900, 28)).toBe(1);
  });

  it('thins labels when they would overlap', () => {
    // 563 points, 800px, 28px labels -> 28 slots -> every 21st
    expect(labelStride(563, 800, 28)).toBe(21);
  });

  it('produces few labels at survey scale', () => {
    const n = labelStride(23000, 1000, 28);
    expect(n).toBe(Math.ceil(23000 / Math.floor(1000 / 28)));
    // Labeled point count never exceeds available slots
    expect(Math.ceil(23000 / n)).toBeLessThanOrEqual(Math.floor(1000 / 28));
  });

  it('never emits more labels than fit, across a sweep of counts and widths', () => {
    for (const count of [1, 2, 7, 50, 299, 563, 5000, 23000]) {
      for (const width of [120, 400, 800, 1600]) {
        const n = labelStride(count, width, DEFAULT_LABEL_WIDTH_PX);
        const slots = Math.max(1, Math.floor(width / DEFAULT_LABEL_WIDTH_PX));
        expect(n).toBeGreaterThanOrEqual(1);
        expect(Math.ceil(count / n)).toBeLessThanOrEqual(slots);
      }
    }
  });

  it('handles degenerate inputs', () => {
    expect(labelStride(0, 800, 28)).toBe(1);
    expect(labelStride(-5, 800, 28)).toBe(1);
    // No room at all: only the first point gets a label
    expect(labelStride(100, 0, 28)).toBe(100);
    expect(labelStride(100, 800, 0)).toBe(100);
  });
});

describe('drawStride', () => {
  it('keeps every point when count fits in the pixel columns', () => {
    expect(drawStride(500, 800)).toBe(1);
    expect(drawStride(800, 800)).toBe(1);
  });

  it('caps drawn points at roughly one per pixel column', () => {
    expect(drawStride(23000, 800)).toBe(Math.ceil(23000 / 800));
    const stride = drawStride(23000, 800);
    expect(Math.ceil(23000 / stride)).toBeLessThanOrEqual(800);
  });

  it('handles degenerate inputs', () => {
    expect(drawStride(0, 800)).toBe(1);
    expect(drawStride(100, 0)).toBe(100);
  });
});

describe('decimateForDrawing', () => {
  const points = Array.from({ length: 100 }, (_, i) => ({ i }));

  it('returns the same array reference for stride 1 (small missions untouched)', () => {
    expect(decimateForDrawing(points, 1)).toBe(points);
    expect(decimateForDrawing(points, 0)).toBe(points);
  });

  it('keeps first and last points so the path spans the full width', () => {
    const out = decimateForDrawing(points, 7);
    expect(out[0]).toBe(points[0]);
    expect(out[out.length - 1]).toBe(points[points.length - 1]);
  });

  it('thins to roughly count/stride points', () => {
    const out = decimateForDrawing(points, 10);
    expect(out.length).toBeGreaterThanOrEqual(10);
    expect(out.length).toBeLessThanOrEqual(12);
  });

  it('handles empty input', () => {
    expect(decimateForDrawing([], 5)).toEqual([]);
  });
});

describe('shouldShowInteractiveDots', () => {
  it('shows dots below the threshold', () => {
    expect(shouldShowInteractiveDots(1)).toBe(true);
    expect(shouldShowInteractiveDots(INTERACTIVE_DOT_THRESHOLD - 1)).toBe(true);
  });

  it('hides dots at and above the threshold', () => {
    expect(shouldShowInteractiveDots(INTERACTIVE_DOT_THRESHOLD)).toBe(false);
    expect(shouldShowInteractiveDots(23000)).toBe(false);
  });

  it('hides dots for an empty profile', () => {
    expect(shouldShowInteractiveDots(0)).toBe(false);
  });
});

describe('nearestIndexByX', () => {
  const xs = [0, 10, 20, 30, 100];

  it('returns -1 for an empty array', () => {
    expect(nearestIndexByX([], 5)).toBe(-1);
  });

  it('finds exact matches', () => {
    expect(nearestIndexByX(xs, 0)).toBe(0);
    expect(nearestIndexByX(xs, 20)).toBe(2);
    expect(nearestIndexByX(xs, 100)).toBe(4);
  });

  it('snaps to the nearer neighbor', () => {
    expect(nearestIndexByX(xs, 13)).toBe(1);
    expect(nearestIndexByX(xs, 17)).toBe(2);
    expect(nearestIndexByX(xs, 40)).toBe(3);
    expect(nearestIndexByX(xs, 90)).toBe(4);
  });

  it('clamps outside the range', () => {
    expect(nearestIndexByX(xs, -50)).toBe(0);
    expect(nearestIndexByX(xs, 500)).toBe(4);
  });

  it('works on a single-element array', () => {
    expect(nearestIndexByX([42], -1)).toBe(0);
    expect(nearestIndexByX([42], 99)).toBe(0);
  });
});
