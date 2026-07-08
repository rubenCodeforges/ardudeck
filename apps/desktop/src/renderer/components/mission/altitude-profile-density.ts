// Level-of-detail math for the altitude profile chart, kept free of React so
// the density rules stay unit-testable. Only DRAWING is thinned here; mission
// data itself is never decimated.

// Below this many visible points the chart renders per-point interactive dots
// (drag-to-edit). At or above it, dots are DOM weight with no editing value:
// you cannot meaningfully drag one of 20k overlapping points.
export const INTERACTIVE_DOT_THRESHOLD = 300;

// Approximate pixel width of a waypoint-number label at the chart font size,
// including breathing room so neighbors never touch.
export const DEFAULT_LABEL_WIDTH_PX = 28;

export function shouldShowInteractiveDots(
  pointCount: number,
  threshold: number = INTERACTIVE_DOT_THRESHOLD,
): boolean {
  return pointCount > 0 && pointCount < threshold;
}

// Label every Nth point where N = ceil(count / slots) and slots is how many
// labels of labelWidthPx fit across availableWidthPx. Guarantees the labeled
// point count never exceeds the slot count, so labels cannot overlap.
export function labelStride(
  pointCount: number,
  availableWidthPx: number,
  labelWidthPx: number,
): number {
  if (pointCount <= 0) return 1;
  if (availableWidthPx <= 0 || labelWidthPx <= 0) return pointCount;
  const slots = Math.max(1, Math.floor(availableWidthPx / labelWidthPx));
  return Math.max(1, Math.ceil(pointCount / slots));
}

// One drawn vertex per x pixel column is the ceiling of useful detail for a
// line series; anything denser just overdraws the same pixels.
export function drawStride(pointCount: number, widthPx: number): number {
  if (pointCount <= 0) return 1;
  const columns = Math.max(1, Math.floor(widthPx));
  return Math.max(1, Math.ceil(pointCount / columns));
}

// Every Nth point plus always the last one, so the drawn path still spans the
// full mission distance. Returns the input array unchanged for stride <= 1 so
// small missions keep referential equality (and memo hits) downstream.
export function decimateForDrawing<T>(points: readonly T[], stride: number): readonly T[] {
  if (stride <= 1 || points.length === 0) return points;
  const out: T[] = [];
  for (let i = 0; i < points.length; i += stride) {
    const p = points[i];
    if (p !== undefined) out.push(p);
  }
  const last = points[points.length - 1];
  if (last !== undefined && out[out.length - 1] !== last) out.push(last);
  return out;
}

// Nearest index in an ascending array of x positions, via binary search.
// Returns -1 for an empty array.
export function nearestIndexByX(xs: readonly number[], x: number): number {
  if (xs.length === 0) return -1;
  let lo = 0;
  let hi = xs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const midX = xs[mid];
    if (midX === undefined) return -1;
    if (midX < x) lo = mid + 1;
    else hi = mid;
  }
  // lo is the first index with xs[lo] >= x; the nearest is lo or lo - 1.
  if (lo > 0) {
    const cur = xs[lo];
    const prev = xs[lo - 1];
    if (cur !== undefined && prev !== undefined && x - prev <= cur - x) return lo - 1;
  }
  return lo;
}
