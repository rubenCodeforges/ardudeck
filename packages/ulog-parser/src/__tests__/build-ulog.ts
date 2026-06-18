// In-memory ULog (.ulg) buffer builder for tests. Produces byte-exact buffers
// that the parser must consume, so the tests exercise real binary decoding
// rather than mocked structures.

const MAGIC = new Uint8Array([0x55, 0x4c, 0x6f, 0x67, 0x01, 0x12, 0x35]);

function ascii(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** Concatenate any number of byte arrays into one. */
function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

/** Wrap a payload as a ULog message: uint16 LE size, uint8 type, payload. */
function message(type: string, payload: Uint8Array): Uint8Array {
  const header = new Uint8Array(3);
  const view = new DataView(header.buffer);
  view.setUint16(0, payload.length, true);
  view.setUint8(2, type.charCodeAt(0));
  return concat([header, payload]);
}

export function header(): Uint8Array {
  const out = new Uint8Array(16);
  out.set(MAGIC, 0);
  out[7] = 0; // version
  // timestamp left zero; not used by parser
  return out;
}

/** 'F' format definition message, body is the raw definition string. */
export function format(def: string): Uint8Array {
  return message('F', ascii(def));
}

/** 'A' add-logged-message: uint8 multiId, uint16 LE msgId, name ascii. */
export function addLogged(multiId: number, msgId: number, name: string): Uint8Array {
  const head = new Uint8Array(3);
  const view = new DataView(head.buffer);
  view.setUint8(0, multiId);
  view.setUint16(1, msgId, true);
  return message('A', concat([head, ascii(name)]));
}

/** 'D' data message: uint16 LE msgId, then struct bytes. */
export function data(msgId: number, struct: Uint8Array): Uint8Array {
  const head = new Uint8Array(2);
  new DataView(head.buffer).setUint16(0, msgId, true);
  return message('D', concat([head, struct]));
}

/** Build a struct payload from typed values. Helpers below. */
export function u64(value: number): Uint8Array {
  const out = new Uint8Array(8);
  const view = new DataView(out.buffer);
  view.setUint32(0, value >>> 0, true);
  view.setUint32(4, Math.floor(value / 0x100000000), true);
  return out;
}

export function f32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setFloat32(0, value, true);
  return out;
}

export function i32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setInt32(0, value, true);
  return out;
}

export function f64(value: number): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setFloat64(0, value, true);
  return out;
}

export function i8(value: number): Uint8Array {
  const out = new Uint8Array(1);
  new DataView(out.buffer).setInt8(0, value);
  return out;
}

export function u8(value: number): Uint8Array {
  return new Uint8Array([value & 0xff]);
}

export function i16(value: number): Uint8Array {
  const out = new Uint8Array(2);
  new DataView(out.buffer).setInt16(0, value, true);
  return out;
}

export function u16(value: number): Uint8Array {
  const out = new Uint8Array(2);
  new DataView(out.buffer).setUint16(0, value, true);
  return out;
}

// Signed 64-bit. Splits into lo/hi uint32 the same way the parser recombines
// them (hi * 2^32 + lo), so round-trips negative values via two's complement.
export function i64(value: number): Uint8Array {
  const out = new Uint8Array(8);
  const view = new DataView(out.buffer);
  const lo = value >>> 0;
  const hi = Math.floor(value / 0x100000000);
  view.setUint32(0, lo, true);
  view.setInt32(4, hi, true);
  return out;
}

/** 'I' information message: uint8 keyLen, key ascii, value bytes. */
export function info(key: string, value: Uint8Array): Uint8Array {
  const keyBytes = ascii(key);
  const head = new Uint8Array(1);
  head[0] = keyBytes.length;
  return message('I', concat([head, keyBytes, value]));
}

/** 'P' parameter message: uint8 keyLen, key ascii, value bytes. */
export function param(key: string, value: Uint8Array): Uint8Array {
  const keyBytes = ascii(key);
  const head = new Uint8Array(1);
  head[0] = keyBytes.length;
  return message('P', concat([head, keyBytes, value]));
}

/** 'M' multi-info: uint8 is_continued, uint8 keyLen, key ascii, value bytes. */
export function multiInfo(key: string, value: Uint8Array): Uint8Array {
  const keyBytes = ascii(key);
  const head = new Uint8Array(2);
  head[0] = 0; // is_continued
  head[1] = keyBytes.length;
  return message('M', concat([head, keyBytes, value]));
}

/** 'Q' default-param: uint8 default_types, uint8 keyLen, key ascii, value bytes. */
export function defaultParam(key: string, value: Uint8Array): Uint8Array {
  const keyBytes = ascii(key);
  const head = new Uint8Array(2);
  head[0] = 1; // default_types bitfield
  head[1] = keyBytes.length;
  return message('Q', concat([head, keyBytes, value]));
}

/** 'L' logged string: uint8 logLevel, uint64 LE timestamp, message ascii. */
export function loggedString(level: number, timestamp: number, text: string): Uint8Array {
  const head = new Uint8Array(9);
  const view = new DataView(head.buffer);
  view.setUint8(0, level);
  view.setUint32(1, timestamp >>> 0, true);
  view.setUint32(5, Math.floor(timestamp / 0x100000000), true);
  return message('L', concat([head, ascii(text)]));
}

/** 'C' tagged logged string: uint8 logLevel, uint16 LE tag, uint64 LE
 *  timestamp, message ascii. The tag is the +2 offset the parser must skip. */
export function taggedLoggedString(
  level: number,
  tag: number,
  timestamp: number,
  text: string,
): Uint8Array {
  const head = new Uint8Array(11);
  const view = new DataView(head.buffer);
  view.setUint8(0, level);
  view.setUint16(1, tag, true);
  view.setUint32(3, timestamp >>> 0, true);
  view.setUint32(7, Math.floor(timestamp / 0x100000000), true);
  return message('C', concat([head, ascii(text)]));
}

export { concat, ascii };
