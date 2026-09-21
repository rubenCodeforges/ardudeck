// Pure math for the GPS antenna offset diagrams. ArduPilot body frame:
// X forward, Y right, Z DOWN (antenna above the flight controller = negative Z).

export interface Offsets {
  x: number;
  y: number;
  z: number;
}

export const OFFSET_LIMIT_M = 5;

export function roundCm(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

export function clampOffset(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return roundCm(Math.min(OFFSET_LIMIT_M, Math.max(-OFFSET_LIMIT_M, v)));
}

/** Float32 round-trips add noise (0.18 -> 0.18000000715...); compare at half-cm. */
export function offsetsEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}

export function offsetDistance(o: Offsets): number {
  return Math.sqrt(o.x * o.x + o.y * o.y + o.z * o.z);
}

export function niceHalfRange(maxAbsMeters: number): number {
  const steps = [0.5, 1, 2.5, 5];
  for (const s of steps) {
    if (maxAbsMeters * 1.1 <= s) return s;
  }
  return steps[steps.length - 1]!;
}

// Top view: screen up = +X (nose), screen right = +Y; px relative to center, y grows downward.
export function topViewToOffsets(dxPx: number, dyPx: number, pxPerMeter: number): { x: number; y: number } {
  return {
    x: clampOffset(-dyPx / pxPerMeter),
    y: clampOffset(dxPx / pxPerMeter),
  };
}

export function offsetsToTopView(x: number, y: number, pxPerMeter: number): { dx: number; dy: number } {
  return { dx: y * pxPerMeter, dy: -x * pxPerMeter };
}

// Side view: screen right = +X, screen DOWN = +Z (screen y and body Z agree, so dragging up = negative Z).
export function sideViewToOffsets(dxPx: number, dyPx: number, pxPerMeter: number): { x: number; z: number } {
  return {
    x: clampOffset(dxPx / pxPerMeter),
    z: clampOffset(dyPx / pxPerMeter),
  };
}

export function offsetsToSideView(x: number, z: number, pxPerMeter: number): { dx: number; dy: number } {
  return { dx: x * pxPerMeter, dy: z * pxPerMeter };
}

// ArduPilot 4.6 renamed the antenna offsets: GPS_POS1_X (legacy) became GPS1_POS_X (modern).
export type OffsetScheme = 'modern' | 'legacy' | 'px4';

export function resolveOffsetScheme(has: (id: string) => boolean): OffsetScheme | null {
  if (has('GPS1_POS_X')) return 'modern';
  if (has('GPS_POS1_X')) return 'legacy';
  // PX4 keeps the lever arm on the estimator, and only for one receiver.
  if (has('EKF2_GPS_POS_X')) return 'px4';
  return null;
}

export function offsetParamIds(scheme: OffsetScheme, instance: 1 | 2): { x: string; y: string; z: string } {
  if (scheme === 'px4') {
    return { x: 'EKF2_GPS_POS_X', y: 'EKF2_GPS_POS_Y', z: 'EKF2_GPS_POS_Z' };
  }
  if (scheme === 'modern') {
    return {
      x: `GPS${instance}_POS_X`,
      y: `GPS${instance}_POS_Y`,
      z: `GPS${instance}_POS_Z`,
    };
  }
  return {
    x: `GPS_POS${instance}_X`,
    y: `GPS_POS${instance}_Y`,
    z: `GPS_POS${instance}_Z`,
  };
}

export function dirtyParams(
  ids: { x: string; y: string; z: string },
  current: Offsets,
  staged: Offsets,
): Array<{ id: string; value: number }> {
  const out: Array<{ id: string; value: number }> = [];
  if (!offsetsEqual(current.x, staged.x)) out.push({ id: ids.x, value: staged.x });
  if (!offsetsEqual(current.y, staged.y)) out.push({ id: ids.y, value: staged.y });
  if (!offsetsEqual(current.z, staged.z)) out.push({ id: ids.z, value: staged.z });
  return out;
}

export function formatMeters(v: number): string {
  const r = roundCm(v);
  return (Object.is(r, -0) ? 0 : r).toFixed(2);
}
