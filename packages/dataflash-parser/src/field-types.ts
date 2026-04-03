const decoder = new TextDecoder('utf-8');

/** Size in bytes of each DataFlash type character */
const SIZES: Record<string, number> = {
  b: 1, B: 1,     // int8, uint8
  h: 2, H: 2,     // int16, uint16
  i: 4, I: 4,     // int32, uint32
  f: 4,           // float32
  d: 8,           // float64
  q: 8, Q: 8,     // int64, uint64
  n: 4,           // char[4]
  N: 16,          // char[16]
  Z: 64,          // char[64]
  c: 2, C: 2,     // centi int16, centi uint16
  e: 4, E: 4,     // centi int32, centi uint32
  L: 4,           // int32 lat/lon (× 1e-7)
  M: 1,           // uint8 flight mode
  a: 64,          // int16[32] array
};

export function fieldSize(typeChar: string): number {
  return SIZES[typeChar] ?? 0;
}

function decodeString(view: DataView, offset: number, length: number): string {
  const bytes = new Uint8Array(view.buffer, view.byteOffset + offset, length);
  // Find null terminator
  let end = bytes.indexOf(0);
  if (end === -1) end = length;
  return decoder.decode(bytes.subarray(0, end));
}

export function decodeField(
  typeChar: string,
  view: DataView,
  offset: number,
): number | string | number[] {
  switch (typeChar) {
    case 'b': return view.getInt8(offset);
    case 'B': return view.getUint8(offset);
    case 'h': return view.getInt16(offset, true);
    case 'H': return view.getUint16(offset, true);
    case 'i': return view.getInt32(offset, true);
    case 'I': return view.getUint32(offset, true);
    case 'f': return view.getFloat32(offset, true);
    case 'd': return view.getFloat64(offset, true);
    case 'q': {
      const lo = view.getUint32(offset, true);
      const hi = view.getInt32(offset + 4, true);
      return hi * 0x100000000 + lo;
    }
    case 'Q': {
      const lo = view.getUint32(offset, true);
      const hi = view.getUint32(offset + 4, true);
      return hi * 0x100000000 + lo;
    }
    case 'n': return decodeString(view, offset, 4);
    case 'N': return decodeString(view, offset, 16);
    case 'Z': return decodeString(view, offset, 64);
    case 'c': return view.getInt16(offset, true) * 0.01;
    case 'C': return view.getUint16(offset, true) * 0.01;
    case 'e': return view.getInt32(offset, true) * 0.01;
    case 'E': return view.getUint32(offset, true) * 0.01;
    case 'L': return view.getInt32(offset, true) * 1e-7;
    case 'M': return view.getUint8(offset);
    case 'a': {
      const arr: number[] = [];
      for (let i = 0; i < 32; i++) {
        arr.push(view.getInt16(offset + i * 2, true));
      }
      return arr;
    }
    default: return 0;
  }
}
