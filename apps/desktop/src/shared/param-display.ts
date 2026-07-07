/**
 * Human-readable parameter value formatting (enums, bitmasks).
 * Used for non-editing grid/table cells; editors keep select/bitmask/raw controls.
 */

/** Minimal metadata shape needed for display (matches store partial metadata). */
export interface ParamDisplayMeta {
  values?: Record<number, string>;
  bitmask?: Record<number, string>;
}

/** Decoded view of a bitmask value. */
export interface DecodedBitmask {
  set: string[];
  unknownBits: number[];
}

/**
 * Decode a numeric bitmask value against its bit→label metadata.
 * Bits set in the value but absent from the metadata are returned in
 * `unknownBits` so the UI can surface (and never silently drop) them.
 */
export function decodeBitmaskFlags(
  value: number,
  bitmask: Record<number, string>,
): DecodedBitmask {
  const intVal = Math.trunc(value) >>> 0;
  const set: string[] = [];
  const entries = Object.entries(bitmask)
    .map(([k, v]) => [Number(k), v] as const)
    .sort((a, b) => a[0] - b[0]);
  for (const [bit, label] of entries) {
    if (bit >= 0 && bit < 32 && (intVal & (1 << bit)) !== 0) set.push(label);
  }
  const known = new Set(entries.map(([b]) => b));
  const unknownBits: number[] = [];
  for (let i = 0; i < 32; i++) {
    if ((intVal & (1 << i)) !== 0 && !known.has(i)) unknownBits.push(i);
  }
  return { set, unknownBits };
}

/**
 * Compact summary of a bitmask value for a grid cell.
 * `0` → "0"; few flags → "Label A, Label B (5)"; many → "A, B +3 (255)".
 */
export function summarizeBitmask(
  value: number,
  bitmask: Record<number, string>,
  maxLabels = 2,
): string {
  const intVal = Math.trunc(value) >>> 0;
  if (intVal === 0) return '0';
  const { set, unknownBits } = decodeBitmaskFlags(value, bitmask);
  const labels = [...set, ...unknownBits.map((b) => `bit${b}`)];
  if (labels.length === 0) return String(intVal);
  if (labels.length <= maxLabels) return `${labels.join(', ')} (${intVal})`;
  const shown = labels.slice(0, maxLabels).join(', ');
  return `${shown} +${labels.length - maxLabels} (${intVal})`;
}

/**
 * True when a MAVLink param value is integer-like after float32 normalization.
 * Handles classic float32 noise (e.g. 5 stored as 4.999999… / 5.0000002).
 * Use for enum select gating and enum label display decisions.
 */
export function isIntegerishParamValue(value: number): boolean {
  if (!Number.isFinite(value)) return false;
  const f = Math.fround(value);
  return f === Math.fround(Math.round(f));
}

/** Canonical integer key for enum/bitmask metadata lookup under float32 noise. */
export function paramValueAsEnumKey(value: number): number {
  return Math.round(Math.fround(value));
}

/**
 * Format a numeric param value for read-only display.
 * Bitmask params become a decoded summary; enum params become "5 — Loiter";
 * others return the numeric string (float32-safe).
 */
export function formatParamDisplayValue(
  value: number,
  meta?: ParamDisplayMeta | null,
): string {
  if (meta?.bitmask && Object.keys(meta.bitmask).length > 0) {
    return summarizeBitmask(value, meta.bitmask);
  }
  if (meta?.values && Object.keys(meta.values).length > 0) {
    const intKey = paramValueAsEnumKey(value);
    const label =
      meta.values[value] ??
      meta.values[intKey] ??
      meta.values[Math.trunc(value)];
    if (label !== undefined && isIntegerishParamValue(value)) {
      return `${intKey} \u2014 ${label}`;
    }
    // Non-integer-ish but exact key match (rare float enums)
    if (label !== undefined && meta.values[value] !== undefined) {
      return `${parseFloat(value.toPrecision(7))} \u2014 ${label}`;
    }
  }
  if (isIntegerishParamValue(value)) return String(paramValueAsEnumKey(value));
  if (Number.isInteger(value)) return String(value);
  return String(parseFloat(value.toPrecision(7)));
}
