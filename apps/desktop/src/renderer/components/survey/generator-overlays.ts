/**
 * Generic map decorations contributed by survey generators.
 *
 * A generator (typically a module, e.g. TOPAS) may put an `overlays` array on
 * its `generatorResult`; the host renders them as non-interactive map shapes
 * under the survey group. The shape data is opaque module output persisted in
 * mission files, so everything is runtime-validated here - a malformed or
 * hostile entry is dropped, never thrown on.
 */

export interface GeneratorOverlay {
  type: 'polygon' | 'polyline';
  points: Array<{ lat: number; lng: number }>;
  /** CSS color. Defaults to the group color at the render site. */
  color?: string;
  dashed?: boolean;
  /** Short hover label, e.g. "Cell 3 - flown 2nd". */
  label?: string;
}

// Backstop against raw geometry dumps, sized so real plans fit: TOPAS
// decomposes large areas into hundreds of cells (337 observed) plus up to
// ~10 leading path chunks. Entries beyond the cap are dropped in order, so
// generators emit their must-render overlays (the flight path) first.
const MAX_OVERLAYS = 480;
const MAX_POINTS = 2000;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function parsePoints(raw: unknown): Array<{ lat: number; lng: number }> | null {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > MAX_POINTS) return null;
  const points: Array<{ lat: number; lng: number }> = [];
  for (const p of raw) {
    const pt = p as { lat?: unknown; lng?: unknown };
    if (!isFiniteNumber(pt?.lat) || !isFiniteNumber(pt?.lng)) return null;
    if (Math.abs(pt.lat) > 90 || Math.abs(pt.lng) > 180) return null;
    points.push({ lat: pt.lat, lng: pt.lng });
  }
  return points;
}

/** Extract renderable overlays from an opaque generatorResult. Never throws. */
export function extractGeneratorOverlays(generatorResult: unknown): GeneratorOverlay[] {
  const raw = (generatorResult as { overlays?: unknown } | null | undefined)?.overlays;
  if (!Array.isArray(raw)) return [];
  const overlays: GeneratorOverlay[] = [];
  for (const entry of raw.slice(0, MAX_OVERLAYS)) {
    const o = entry as { type?: unknown; points?: unknown; color?: unknown; dashed?: unknown };
    if (o?.type !== 'polygon' && o?.type !== 'polyline') continue;
    const points = parsePoints(o.points);
    if (!points) continue;
    if (o.type === 'polygon' && points.length < 3) continue;
    const label = (o as { label?: unknown }).label;
    overlays.push({
      type: o.type,
      points,
      ...(typeof o.color === 'string' && o.color.length <= 32 ? { color: o.color } : {}),
      ...(o.dashed === true ? { dashed: true } : {}),
      ...(typeof label === 'string' && label.length <= 80 ? { label } : {}),
    });
  }
  return overlays;
}
