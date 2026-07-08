/**
 * Pure math for the tiered waypoint rendering on the mission map.
 *
 * Full-fidelity survey plans carry 5,000-23,000 waypoints and a DOM marker
 * per waypoint melts the renderer. Every waypoint is always DRAWN (canvas
 * dots - the data is never thinned); what varies with the view is
 * interactivity (real markers materialize only when few waypoints are in
 * view) and label density.
 *
 * The helpers are unit-agnostic on purpose: the caller indexes waypoints
 * once in a fixed reference-zoom pixel space and converts every query into
 * that space, so the index survives pan/zoom untouched and is only rebuilt
 * when the mission itself changes.
 */

export interface XY {
  x: number;
  y: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface GridIndex {
  /** Bucket edge length, in the same units as the indexed coordinates. */
  readonly cellSize: number;
  readonly xs: Float64Array;
  readonly ys: Float64Array;
  /** "cx,cy" -> indices of points in that bucket. */
  readonly cells: Map<string, number[]>;
  readonly count: number;
}

/**
 * Cell size targeting ~1 point per cell over the data extent, so bucket scans
 * stay O(points-in-region). Degenerate extents (single point, straight line)
 * fall back to 1 unit - correctness never depends on the cell size, only
 * query cost does.
 */
export function pickCellSize(width: number, height: number, count: number): number {
  if (count <= 0 || width <= 0 || height <= 0) return 1;
  return Math.max(Math.sqrt((width * height) / count), 1e-9);
}

export function buildGridIndex(points: readonly XY[], cellSize: number): GridIndex {
  const n = points.length;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  const cells = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const p = points[i]!;
    xs[i] = p.x;
    ys[i] = p.y;
    const key = `${Math.floor(p.x / cellSize)},${Math.floor(p.y / cellSize)}`;
    const bucket = cells.get(key);
    if (bucket) bucket.push(i);
    else cells.set(key, [i]);
  }
  return { cellSize, xs, ys, cells, count: n };
}

/**
 * Visit every point whose bucket intersects the cell-aligned box. Zoomed far
 * out, the box can span millions of empty cells; iterating occupied buckets
 * instead keeps the worst case bounded by the point count.
 */
function visitCandidates(
  index: GridIndex,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  visit: (i: number) => void,
): void {
  const cs = index.cellSize;
  const minCX = Math.floor(minX / cs);
  const maxCX = Math.floor(maxX / cs);
  const minCY = Math.floor(minY / cs);
  const maxCY = Math.floor(maxY / cs);
  const cellSpan = (maxCX - minCX + 1) * (maxCY - minCY + 1);
  if (cellSpan > index.cells.size) {
    for (const [key, bucket] of index.cells) {
      const comma = key.indexOf(',');
      const cx = Number(key.slice(0, comma));
      const cy = Number(key.slice(comma + 1));
      if (cx < minCX || cx > maxCX || cy < minCY || cy > maxCY) continue;
      for (const i of bucket) visit(i);
    }
    return;
  }
  for (let cx = minCX; cx <= maxCX; cx++) {
    for (let cy = minCY; cy <= maxCY; cy++) {
      const bucket = index.cells.get(`${cx},${cy}`);
      if (!bucket) continue;
      for (const i of bucket) visit(i);
    }
  }
}

/** Index of the nearest point within `radius` of (x, y), or -1. */
export function queryNearest(index: GridIndex, x: number, y: number, radius: number): number {
  if (index.count === 0 || radius <= 0) return -1;
  const r2 = radius * radius;
  let best = -1;
  let bestD2 = r2;
  visitCandidates(index, x - radius, y - radius, x + radius, y + radius, (i) => {
    const dx = index.xs[i]! - x;
    const dy = index.ys[i]! - y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= bestD2) {
      bestD2 = d2;
      best = i;
    }
  });
  return best;
}

/** Number of points inside the box, boundaries inclusive. */
export function countInBounds(index: GridIndex, b: Bounds): number {
  let count = 0;
  visitCandidates(index, b.minX, b.minY, b.maxX, b.maxY, (i) => {
    const x = index.xs[i]!;
    const y = index.ys[i]!;
    if (x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY) count++;
  });
  return count;
}

/** Indices of the points inside the box, boundaries inclusive. */
export function collectInBounds(index: GridIndex, b: Bounds): number[] {
  const out: number[] = [];
  visitCandidates(index, b.minX, b.minY, b.maxX, b.maxY, (i) => {
    const x = index.xs[i]!;
    const y = index.ys[i]!;
    if (x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY) out.push(i);
  });
  return out;
}

/**
 * Tier-3 gate: the in-view indices when their count is at or below the
 * threshold, else null (too many to materialize as real markers).
 */
export function collectMaterializable(
  index: GridIndex,
  b: Bounds,
  threshold: number,
): number[] | null {
  if (countInBounds(index, b) > threshold) return null;
  return collectInBounds(index, b);
}

/**
 * Mean distance between consecutive points. For a flight path this tracks
 * the on-screen dot spacing far better than a global density estimate, and
 * it is what the label-density decision keys off.
 */
export function meanConsecutiveSpacing(points: readonly XY[]): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total / (points.length - 1);
}

/** Below this on-screen spacing the dots read as a line; numbers on top of it are noise. */
const MIN_LABEL_SPACING_PX = 6;
/** Breathing room so an every-Nth label never touches the next one along the path. */
const LABEL_CLEARANCE = 1.5;

/**
 * Zoom-aware label density: 0 = draw no numbers (dots too tight), 1 = number
 * every waypoint, N = number every Nth so consecutive labels stay at least a
 * label-width-and-a-half apart.
 */
export function labelStride(labelWidthPx: number, spacingPx: number): number {
  if (!(labelWidthPx > 0) || !(spacingPx >= MIN_LABEL_SPACING_PX)) return 0;
  return Math.max(1, Math.ceil((labelWidthPx * LABEL_CLEARANCE) / spacingPx));
}

/**
 * Approximate rendered width of a canvas waypoint number at the 10px label
 * font. Measuring real text per frame is wasteful when a digit-count estimate
 * is all the stride math needs.
 */
export function estimateLabelWidthPx(maxLabel: number): number {
  const digits = maxLabel >= 1 ? Math.floor(Math.log10(maxLabel)) + 1 : 1;
  return 6 * digits + 4;
}
