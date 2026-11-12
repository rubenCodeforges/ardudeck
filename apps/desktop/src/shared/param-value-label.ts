/** What a raw value means: its enum label, or the names of the bits set in a bitmask. Null when the metadata says nothing. */
export function describeParamValue(
  value: number,
  meta: { values?: Record<number, string>; bitmask?: Record<number, string> } | null | undefined,
): { kind: 'enum' | 'bitmask'; text: string; bits?: string[] } | null {
  if (!meta || !Number.isFinite(value)) return null;
  if (meta.bitmask && Object.keys(meta.bitmask).length > 0) {
    const n = Math.round(value);
    if (n === 0) return { kind: 'bitmask', text: '', bits: [] };
    const bits: string[] = [];
    for (const [bit, label] of Object.entries(meta.bitmask)) {
      const b = Number(bit);
      if (b >= 0 && b < 31 && (n & (1 << b)) !== 0) bits.push(label);
    }
    return { kind: 'bitmask', text: bits.join(', '), bits };
  }
  if (meta.values) {
    const label = meta.values[Math.fround(value) === Math.round(value) ? Math.round(value) : value];
    return label === undefined ? null : { kind: 'enum', text: label };
  }
  return null;
}
