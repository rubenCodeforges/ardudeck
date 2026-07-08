import { describe, it, expect } from 'vitest';
import { cullPathForViewport, metersPerPixel, type ViewBox } from './path-culling';
import type { LatLng } from './survey-types';

// ~1 deg lat = 111 km; test geometry lives around lat 54 like the OKL-A plan.
const LAT = 54;

/** Dense straight west-east line at `lat`, `n` points, 0.0001 deg (~6.5 m) apart. */
function denseLine(n: number, lat = LAT, startLng = 10): LatLng[] {
  return Array.from({ length: n }, (_, i) => ({ lat, lng: startLng + i * 0.0001 }));
}

const view = (west: number, south: number, east: number, north: number): ViewBox => ({
  west,
  south,
  east,
  north,
});

describe('metersPerPixel', () => {
  it('halves per zoom level and shrinks with latitude', () => {
    const z14 = metersPerPixel(14, LAT);
    expect(metersPerPixel(15, LAT)).toBeCloseTo(z14 / 2, 6);
    expect(metersPerPixel(14, 0)).toBeGreaterThan(z14);
  });
});

describe('cullPathForViewport', () => {
  it('returns nothing for paths fully outside the padded view', () => {
    const runs = cullPathForViewport(denseLine(100), view(11, 55, 12, 56), 15);
    expect(runs).toHaveLength(0);
  });

  it('keeps one run crossing the view, extended past the edges', () => {
    // Line spans lng 10..10.01; view covers the middle slice.
    const runs = cullPathForViewport(denseLine(101), view(10.004, LAT - 0.001, 10.006, LAT + 0.001), 15);
    expect(runs).toHaveLength(1);
    const run = runs[0]!;
    // Extends beyond the padded west/east edge rather than stopping at it.
    expect(run[0]!.lng).toBeLessThan(10.004);
    expect(run[run.length - 1]!.lng).toBeGreaterThan(10.006);
    // Straight and dense: collapses to its endpoints, no polygon fallback.
    expect(run.length).toBe(2);
  });

  it('splits a path that leaves and re-enters the view into separate runs', () => {
    // West run, far-north detour, back to an east run through the same view.
    const path: LatLng[] = [
      ...denseLine(20, LAT, 10),
      ...denseLine(20, LAT + 1, 10.002), // far outside
      ...denseLine(20, LAT, 10.004),
    ];
    const runs = cullPathForViewport(path, view(10, LAT - 0.001, 10.007, LAT + 0.001), 15);
    expect(runs.length).toBe(2);
  });

  /** Boustrophedon corners: 2 points per track, alternating direction. */
  function lawnmower(tracks: number, trackHeightDeg: number): LatLng[] {
    const path: LatLng[] = [];
    for (let t = 0; t < tracks; t++) {
      const lng = 10 + t * 0.00025; // ~16 m track spacing at 54N
      const a = { lat: LAT, lng };
      const b = { lat: LAT + trackHeightDeg, lng };
      path.push(...(t % 2 ? [b, a] : [a, b]));
    }
    return path;
  }

  it('keeps every in-view corner when zoomed in', () => {
    // Corners must survive a close zoom (z19 ~ 0.18 m/px at 54N).
    const zigzag = lawnmower(20, 0.001);
    const runs = cullPathForViewport(zigzag, view(9.99, LAT - 0.01, 10.01, LAT + 0.01), 19);
    const kept = runs.reduce((n, r) => n + r.length, 0);
    expect(kept).toBe(zigzag.length);
  });

  it('simplifies hard when zoomed far out', () => {
    // 2000 tracks ~22 m tall at world-ish zoom: the weave is sub-pixel, so
    // almost nothing survives, but the path is still represented.
    const zigzag = lawnmower(2000, 0.0002);
    const runs = cullPathForViewport(zigzag, view(9, 53, 12, 55), 8);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.length).toBeLessThan(50);
  });

  it('handles degenerate input', () => {
    expect(cullPathForViewport([], view(0, 0, 1, 1), 10)).toHaveLength(0);
    expect(cullPathForViewport([{ lat: 0.5, lng: 0.5 }], view(0, 0, 1, 1), 10)).toHaveLength(0);
  });
});
