// ULog primitive field types. Sizes are in bytes; reads are little-endian to
// match the on-wire format. Mirrors the dataflash field-types module but for
// ULog's C-style type names rather than single type chars.

const decoder = new TextDecoder('utf-8');

const SIZES: Record<string, number> = {
  int8_t: 1,
  uint8_t: 1,
  int16_t: 2,
  uint16_t: 2,
  int32_t: 4,
  uint32_t: 4,
  int64_t: 8,
  uint64_t: 8,
  float: 4,
  double: 8,
  bool: 1,
  char: 1,
};

/** Byte size of a single element of a ULog primitive type, or 0 if unknown. */
export function primitiveSize(type: string): number {
  return SIZES[type] ?? 0;
}

export function isPrimitive(type: string): boolean {
  return type in SIZES;
}

/** Decode a single primitive value at offset. char is treated as uint8 here;
 *  char[] strings are decoded separately by the parser. */
export function decodePrimitive(
  type: string,
  view: DataView,
  offset: number,
): number {
  switch (type) {
    case 'int8_t':
      return view.getInt8(offset);
    case 'uint8_t':
    case 'bool':
    case 'char':
      return view.getUint8(offset);
    case 'int16_t':
      return view.getInt16(offset, true);
    case 'uint16_t':
      return view.getUint16(offset, true);
    case 'int32_t':
      return view.getInt32(offset, true);
    case 'uint32_t':
      return view.getUint32(offset, true);
    case 'float':
      return view.getFloat32(offset, true);
    case 'double':
      return view.getFloat64(offset, true);
    case 'int64_t': {
      const lo = view.getUint32(offset, true);
      const hi = view.getInt32(offset + 4, true);
      return hi * 0x100000000 + lo;
    }
    case 'uint64_t': {
      const lo = view.getUint32(offset, true);
      const hi = view.getUint32(offset + 4, true);
      return hi * 0x100000000 + lo;
    }
    default:
      return 0;
  }
}

/** Decode a char[length] field as a null-trimmed string. */
export function decodeCharArray(
  view: DataView,
  offset: number,
  length: number,
): string {
  const bytes = new Uint8Array(view.buffer, view.byteOffset + offset, length);
  let end = bytes.indexOf(0);
  if (end === -1) end = length;
  return decoder.decode(bytes.subarray(0, end));
}
