/**
 * Tests for the grid generator's margin (polygon buffer) and plane-mode turn
 * alignment. Geometry sanity only — exact waypoint coordinates depend on the
 * camera/overlap math covered elsewhere.
 */
import { describe, it, expect } from 'vitest';
import { generateGrid } from './grid-generator';
import { generateCrosshatch } from './crosshatch-generator';
import { DEFAULT_SURVEY_CONFIG, type SurveyConfig, type LatLng } from '../survey-types';
import { latLngToLocal, polygonCentroid } from '../geo-math';

// ~300 m square near 47°N (big enough for several scan lines at the default camera).
const SQUARE: LatLng[] = [
  { lat: 47.0000, lng: 8.0000 },
  { lat: 47.0000, lng: 8.0040 },
  { lat: 47.0027, lng: 8.0040 },
  { lat: 47.0027, lng: 8.0000 },
];

// A slanted parallelogram so adjacent scan lines end at different offsets
// (this is where plane-mode turn alignment changes the path).
const SLANT: LatLng[] = [
  { lat: 47.0000, lng: 8.0000 },
  { lat: 47.0000, lng: 8.0040 },
  { lat: 47.0027, lng: 8.0060 },
  { lat: 47.0027, lng: 8.0020 },
];

function cfg(polygon: LatLng[], over: Partial<SurveyConfig> = {}): SurveyConfig {
  return { ...DEFAULT_SURVEY_CONFIG, polygon, ...over };
}

/** East-west span (m) of the waypoint set in the polygon's local frame. */
function localXSpan(polygon: LatLng[], wps: LatLng[]): number {
  const o = polygonCentroid(polygon);
  const xs = wps.map((p) => latLngToLocal(o, p).x);
  return Math.max(...xs) - Math.min(...xs);
}

describe('grid margin', () => {
  it('positive margin grows coverage, negative shrinks it', () => {
    const base = generateGrid(cfg(SQUARE, { margin: 0 }));
    const grown = generateGrid(cfg(SQUARE, { margin: 30 }));
    const shrunk = generateGrid(cfg(SQUARE, { margin: -30 }));

    const baseSpan = localXSpan(SQUARE, base.waypoints);
    const grownSpan = localXSpan(SQUARE, grown.waypoints);
    const shrunkSpan = localXSpan(SQUARE, shrunk.waypoints);

    expect(grownSpan).toBeGreaterThan(baseSpan);
    expect(shrunkSpan).toBeLessThan(baseSpan);
  });

  it('an over-shrink that would collapse the polygon falls back to no offset', () => {
    // 300 m square shrunk by 1 km -> degenerate; generator keeps the original.
    const collapsed = generateGrid(cfg(SQUARE, { margin: -1000 }));
    const base = generateGrid(cfg(SQUARE, { margin: 0 }));
    expect(collapsed.waypoints.length).toBe(base.waypoints.length);
  });
});

describe('grid plane-mode turns', () => {
  it('plane mode lengthens the path vs copter on a slanted polygon', () => {
    const copter = generateGrid(cfg(SLANT, { gridMode: 'copter' }));
    const plane = generateGrid(cfg(SLANT, { gridMode: 'plane' }));
    // Extending the shorter line end at each turn can only add distance.
    expect(plane.stats.flightDistance).toBeGreaterThan(copter.stats.flightDistance);
    expect(plane.waypoints.length).toBe(copter.waypoints.length); // same WP count, just shifted
  });

  it('on an axis-aligned rectangle the ends already match (no extra distance)', () => {
    const copter = generateGrid(cfg(SQUARE, { gridMode: 'copter' }));
    const plane = generateGrid(cfg(SQUARE, { gridMode: 'plane' }));
    expect(plane.stats.flightDistance).toBeCloseTo(copter.stats.flightDistance, 0);
  });
});

// ── No-fly holes ─────────────────────────────────────────────────────────────

// ~110 m square hole centered in SQUARE: big enough to split several scan
// rows into left/right spans at the default ~45 m line spacing.
const HOLE: LatLng[] = [
  { lat: 47.0009, lng: 8.0013 },
  { lat: 47.0009, lng: 8.0027 },
  { lat: 47.0018, lng: 8.0027 },
  { lat: 47.0018, lng: 8.0013 },
];

/** 2D segment-segment proper/touching intersection. */
function segsIntersect(
  a: { x: number; y: number }, b: { x: number; y: number },
  c: { x: number; y: number }, d: { x: number; y: number },
): boolean {
  const cross = (o: { x: number; y: number }, p: { x: number; y: number }, q: { x: number; y: number }) =>
    (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Assert that no leg between consecutive waypoints cuts through the hole. */
function assertNoLegCrossesHole(polygon: LatLng[], hole: LatLng[], wps: LatLng[]): void {
  const o = polygonCentroid(polygon);
  const local = wps.map((p) => latLngToLocal(o, p));
  const holeLocal = hole.map((p) => latLngToLocal(o, p));
  // Shrink the hole ring by a hair so legs that legally hug the hole edge
  // (clearance offsets, shared boundary points) don't count as crossings.
  const cx = holeLocal.reduce((s, p) => s + p.x, 0) / holeLocal.length;
  const cy = holeLocal.reduce((s, p) => s + p.y, 0) / holeLocal.length;
  const shrunk = holeLocal.map((p) => ({ x: cx + (p.x - cx) * 0.98, y: cy + (p.y - cy) * 0.98 }));
  for (let i = 0; i + 1 < local.length; i++) {
    for (let j = 0; j < shrunk.length; j++) {
      const c = shrunk[j]!;
      const d = shrunk[(j + 1) % shrunk.length]!;
      expect(
        segsIntersect(local[i]!, local[i + 1]!, c, d),
        `leg ${i} crosses hole edge ${j}`,
      ).toBe(false);
    }
  }
}

// Tall narrow slot reaching close to the top edge: the arms only connect at
// the bottom, so a greedy nearest-endpoint router wants to hop straight
// across the slot near the top (38 m across beats 200 m around).
const TALL_SLOT: LatLng[] = [
  { lat: 47.0006, lng: 8.0018 },
  { lat: 47.0006, lng: 8.0023 },
  { lat: 47.0025, lng: 8.0023 },
  { lat: 47.0025, lng: 8.0018 },
];

describe('no-fly holes', () => {
  it('no flight leg crosses a tall narrow slot (adversarial for greedy routing)', () => {
    const result = generateGrid(cfg(SQUARE, { holes: [TALL_SLOT], gridAngle: 0 }));
    expect(result.waypoints.length).toBeGreaterThan(4);
    assertNoLegCrossesHole(SQUARE, TALL_SLOT, result.waypoints);
  });

  it('no flight leg crosses the hole (copter mode)', () => {
    const result = generateGrid(cfg(SQUARE, { holes: [HOLE], gridAngle: 0 }));
    expect(result.waypoints.length).toBeGreaterThan(4);
    assertNoLegCrossesHole(SQUARE, HOLE, result.waypoints);
  });

  it('no flight leg crosses the hole (plane mode with overshoot)', () => {
    const result = generateGrid(
      cfg(SQUARE, { holes: [HOLE], gridAngle: 0, gridMode: 'plane', overshoot: 20 }),
    );
    expect(result.waypoints.length).toBeGreaterThan(4);
    assertNoLegCrossesHole(SQUARE, HOLE, result.waypoints);
  });

  it('no photo positions inside the hole', () => {
    const result = generateGrid(cfg(SQUARE, { holes: [HOLE], gridAngle: 0 }));
    const o = polygonCentroid(SQUARE);
    const holeLocal = HOLE.map((p) => latLngToLocal(o, p));
    const minX = Math.min(...holeLocal.map((p) => p.x));
    const maxX = Math.max(...holeLocal.map((p) => p.x));
    const minY = Math.min(...holeLocal.map((p) => p.y));
    const maxY = Math.max(...holeLocal.map((p) => p.y));
    for (const photo of result.photoPositions) {
      const p = latLngToLocal(o, photo);
      const inside = p.x > minX + 1 && p.x < maxX - 1 && p.y > minY + 1 && p.y < maxY - 1;
      expect(inside, 'photo inside hole').toBe(false);
    }
  });
});

describe('crosshatch no-fly holes', () => {
  it('neither pass nor the junction leg crosses the hole', () => {
    const result = generateCrosshatch(cfg(SQUARE, { holes: [TALL_SLOT], gridAngle: 0 }));
    expect(result.waypoints.length).toBeGreaterThan(8);
    assertNoLegCrossesHole(SQUARE, TALL_SLOT, result.waypoints);
  });
});

describe('area survey start corner', () => {
  const start = (over: Partial<SurveyConfig>) => {
    const o = polygonCentroid(SQUARE);
    const wps = generateGrid(cfg(SQUARE, { gridAngle: 0, ...over })).waypoints;
    return latLngToLocal(o, wps[0]!);
  };

  it('starts in the same corner every time by default', () => {
    const a = start({});
    const b = start({});
    expect(a).toEqual(b);
  });

  // The pilot launches from a corner of their choosing, not the one the
  // router happens to pick.
  it('reaches all four corners with the two toggles', () => {
    const corners = [
      start({}),
      start({ invertPath: true }),
      start({ flipLegs: true }),
      start({ flipLegs: true, invertPath: true }),
    ];
    const keys = new Set(corners.map((p) => `${Math.round(p.x / 10)},${Math.round(p.y / 10)}`));
    expect(keys.size).toBe(4);
  });

  it('inverting the path starts the first line at its other end', () => {
    const plain = start({});
    const inverted = start({ invertPath: true });
    expect(inverted.y).toBeCloseTo(plain.y, 3);
    expect(Math.sign(inverted.x)).toBe(-Math.sign(plain.x));
  });

  it('flipping the legs starts on the far side', () => {
    const plain = start({});
    const flipped = start({ flipLegs: true });
    expect(Math.sign(flipped.y)).toBe(-Math.sign(plain.y));
  });

  it('covers the same ground whichever corner it starts from', () => {
    const counts = [{}, { invertPath: true }, { flipLegs: true }, { flipLegs: true, invertPath: true }]
      .map((over) => generateGrid(cfg(SQUARE, { gridAngle: 0, ...over })).waypoints.length);
    expect(new Set(counts).size).toBe(1);
  });
});
