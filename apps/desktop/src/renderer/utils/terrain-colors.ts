/**
 * Terrain elevation color mapping utilities.
 *
 * Decodes Mapzen Terrarium RGB tiles into elevation values and maps
 * them to a color gradient for visual terrain overlay.
 *
 * Terrarium encoding: height = (R * 256 + G + B / 256) - 32768
 * Tiles: https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png
 */

/** RGBA color tuple */
export type RGBA = [r: number, g: number, b: number, a: number];

/**
 * Minimum elevation threshold in meters.
 * Anything below this is treated as water/ocean (transparent).
 * Filters out coastline noise from Terrarium data.
 */
export const WATER_THRESHOLD = 2;

/** Decode Terrarium-encoded RGB pixel to elevation in meters */
export function decodeTerrarium(r: number, g: number, b: number): number {
  return (r * 256 + g + b / 256) - 32768;
}

/**
 * Color stops for elevation gradient (Mission Planner rainbow style).
 * Elevation (meters) -> [R, G, B]
 */
const COLOR_STOPS: { elev: number; color: [number, number, number] }[] = [
  { elev: 0, color: [30, 100, 180] },     // Deep blue - sea level
  { elev: 100, color: [50, 160, 80] },     // Green - low land
  { elev: 500, color: [100, 190, 60] },    // Light green - hills
  { elev: 1000, color: [200, 200, 50] },   // Yellow - mid elevation
  { elev: 1500, color: [220, 160, 40] },   // Orange - high hills
  { elev: 2000, color: [200, 100, 30] },   // Dark orange - mountains
  { elev: 3000, color: [180, 50, 30] },    // Red - high mountains
  { elev: 4500, color: [160, 40, 60] },    // Dark red - very high
  { elev: 6000, color: [220, 220, 220] },  // White - snow caps
];

/** Interpolate between two color values */
function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

/** Get RGB color for a given elevation in meters */
function elevationToRGB(elevation: number): [number, number, number] {
  if (elevation <= 0) return [0, 0, 0];

  const maxStop = COLOR_STOPS[COLOR_STOPS.length - 1]!;
  if (elevation >= maxStop.elev) return maxStop.color;

  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    const lo = COLOR_STOPS[i]!;
    const hi = COLOR_STOPS[i + 1]!;
    if (elevation >= lo.elev && elevation < hi.elev) {
      const t = (elevation - lo.elev) / (hi.elev - lo.elev);
      return [
        lerp(lo.color[0], hi.color[0], t),
        lerp(lo.color[1], hi.color[1], t),
        lerp(lo.color[2], hi.color[2], t),
      ];
    }
  }

  return COLOR_STOPS[0]!.color;
}

/**
 * Pre-computed lookup table for fast per-pixel elevation-to-color mapping.
 *
 * Maps elevation buckets (0..steps-1) to RGBA values.
 * Each step represents `maxElevation / steps` meters.
 */
export interface ColorLookupTable {
  /** RGBA values laid out as [r0, g0, b0, a0, r1, g1, b1, a1, ...] */
  data: Uint8ClampedArray;
  /** Number of entries */
  steps: number;
  /** Max elevation represented (meters) */
  maxElevation: number;
}

/**
 * Build a pre-computed color lookup table for fast elevation mapping.
 * @param steps Number of discrete color buckets (default 512)
 * @param maxElevation Maximum elevation in meters (default 7000)
 */
export function buildColorLookupTable(
  steps = 512,
  maxElevation = 7000,
): ColorLookupTable {
  const data = new Uint8ClampedArray(steps * 4);

  for (let i = 0; i < steps; i++) {
    const elev = (i / steps) * maxElevation;
    const [r, g, b] = elevationToRGB(elev);
    const offset = i * 4;
    data[offset] = r;
    data[offset + 1] = g;
    data[offset + 2] = b;
    data[offset + 3] = elev <= 0 ? 0 : 255;
  }

  return { data, steps, maxElevation };
}

/** Shared singleton lookup table */
let _sharedLut: ColorLookupTable | null = null;

/** Get or create the shared color lookup table */
export function getSharedLookupTable(): ColorLookupTable {
  if (!_sharedLut) {
    _sharedLut = buildColorLookupTable();
  }
  return _sharedLut;
}
