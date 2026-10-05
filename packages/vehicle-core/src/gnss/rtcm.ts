/**
 * RTCM3 stream framing + MAVLink GPS_RTCM_DATA fragmentation (issue #60).
 *
 * The caster delivers a raw byte stream; TCP segmentation does not respect
 * RTCM message boundaries, so a stateful framer re-assembles complete,
 * CRC-verified RTCM3 frames before anything is injected into the vehicle.
 * Injecting torn or corrupt frames would make the GPS silently discard the
 * whole correction epoch.
 */

/** GPS_RTCM_DATA payload capacity per MAVLink spec. */
export const RTCM_FRAGMENT_SIZE = 180;
/** flags field encodes at most 4 fragments (2 bits), so 720 bytes max. */
export const RTCM_MAX_INJECT_SIZE = RTCM_FRAGMENT_SIZE * 4;

const RTCM3_PREAMBLE = 0xd3;
/** Sync recovery bound: if no valid frame fits in this window, drop the head. */
const MAX_BUFFER = 8192;

/** CRC-24Q (poly 0x1864CFB, init 0), as used by RTCM3 framing. */
export function crc24q(data: Uint8Array, length: number): number {
  let crc = 0;
  for (let i = 0; i < length; i++) {
    crc ^= data[i]! << 16;
    for (let bit = 0; bit < 8; bit++) {
      crc <<= 1;
      if (crc & 0x1000000) crc ^= 0x1864cfb;
    }
  }
  return crc & 0xffffff;
}

export interface RtcmFrame {
  /** Complete frame including preamble, length header and CRC. */
  bytes: Uint8Array;
  /** RTCM message type (first 12 bits of the payload), e.g. 1005, 1074. */
  type: number;
}

/** Incremental RTCM3 framer: feed it socket chunks, get whole frames back. */
export class RtcmFramer {
  private buf: Uint8Array = new Uint8Array(0);
  /** Frames discarded due to CRC mismatch (corrupt link or lost sync). */
  crcErrors = 0;

  push(chunk: Uint8Array): RtcmFrame[] {
    const merged = new Uint8Array(this.buf.length + chunk.length);
    merged.set(this.buf);
    merged.set(chunk, this.buf.length);
    this.buf = merged;

    const frames: RtcmFrame[] = [];
    let offset = 0;

    while (this.buf.length - offset >= 6) {
      if (this.buf[offset] !== RTCM3_PREAMBLE) {
        offset++;
        continue;
      }
      // The 6 bits after the preamble are reserved zero in RTCM3; a nonzero
      // value is a false preamble inside data. Rejecting it here avoids
      // stalling on a bogus (huge) length while waiting for bytes that never
      // belonged to a real frame.
      if ((this.buf[offset + 1]! & 0xfc) !== 0) {
        offset++;
        continue;
      }
      const len = ((this.buf[offset + 1]! & 0x03) << 8) | this.buf[offset + 2]!;
      const total = len + 6; // preamble + 2-byte header + payload + 3-byte CRC
      if (this.buf.length - offset < total) break; // wait for more data

      const frame = this.buf.subarray(offset, offset + total);
      const expected = (frame[total - 3]! << 16) | (frame[total - 2]! << 8) | frame[total - 1]!;
      if (crc24q(frame, total - 3) === expected) {
        const type = len >= 2 ? ((frame[3]! << 4) | (frame[4]! >> 4)) : 0;
        frames.push({ bytes: frame.slice(), type });
        offset += total;
      } else {
        // False preamble inside data, or corruption: resync one byte on.
        this.crcErrors++;
        offset++;
      }
    }

    this.buf = this.buf.subarray(offset);
    if (this.buf.length > MAX_BUFFER) {
      // Runaway garbage with no sync: keep only the tail.
      this.buf = this.buf.subarray(this.buf.length - 1024);
    }
    return frames;
  }

  reset(): void {
    this.buf = new Uint8Array(0);
  }
}

/** Reads big-endian bit fields out of an RTCM payload (fields cross bytes). */
class BitReader {
  private pos = 0;
  constructor(private data: Uint8Array) {}

  read(bits: number): number {
    return Number(this.readBig(bits));
  }

  /** Signed two's-complement read (RTCM DF025/026/027 are 38-bit signed). */
  readSigned(bits: number): number {
    const raw = this.readBig(bits);
    const signBit = 1n << BigInt(bits - 1);
    return Number(raw & signBit ? raw - (signBit << 1n) : raw);
  }

  private readBig(bits: number): bigint {
    let value = 0n;
    for (let i = 0; i < bits; i++) {
      const byte = this.data[this.pos >> 3];
      if (byte === undefined) return value << BigInt(bits - i);
      const bit = (byte >> (7 - (this.pos & 7))) & 1;
      value = (value << 1n) | BigInt(bit);
      this.pos++;
    }
    return value;
  }
}

const WGS84_A = 6378137;
const WGS84_F = 1 / 298.257223563;

function ecefToGeodetic(x: number, y: number, z: number): { lat: number; lon: number; altM: number } {
  const a = WGS84_A;
  const b = a * (1 - WGS84_F);
  const e2 = WGS84_F * (2 - WGS84_F);
  const ep2 = (a * a - b * b) / (b * b);
  const p = Math.sqrt(x * x + y * y);
  const theta = Math.atan2(z * a, p * b);
  const lat = Math.atan2(
    z + ep2 * b * Math.sin(theta) ** 3,
    p - e2 * a * Math.cos(theta) ** 3,
  );
  const n = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
  const altM = p / Math.cos(lat) - n;
  return { lat: (lat * 180) / Math.PI, lon: (Math.atan2(y, x) * 180) / Math.PI, altM };
}

/** Base position from RTCM 1005/1006; null for other types or unsurveyed (all-zero ECEF). */
export function parseBasePosition(frame: RtcmFrame): { lat: number; lon: number; altM: number } | null {
  if (frame.type !== 1005 && frame.type !== 1006) return null;
  const payload = frame.bytes.subarray(3, frame.bytes.length - 3);
  if (payload.length < 19) return null;
  const r = new BitReader(payload);
  r.read(12); // message number
  r.read(12); // station id
  r.read(6 + 1 + 1 + 1 + 1); // ITRF year + GPS/GLONASS/Galileo/ref-station flags
  const x = r.readSigned(38);
  r.read(1 + 1); // single receiver oscillator + reserved
  const y = r.readSigned(38);
  r.read(2); // quarter cycle indicator
  const z = r.readSigned(38);
  if (x === 0 && y === 0 && z === 0) return null;
  return ecefToGeodetic(x * 1e-4, y * 1e-4, z * 1e-4);
}

export interface RtcmInjectFragment {
  flags: number;
  len: number;
  data: number[];
}

function toPayloadArray(slice: Uint8Array): number[] {
  const data = new Array<number>(RTCM_FRAGMENT_SIZE).fill(0);
  for (let i = 0; i < slice.length; i++) data[i] = slice[i]!;
  return data;
}

/**
 * Split one RTCM frame into GPS_RTCM_DATA payloads per the MAVLink flags
 * contract: bit 0 = fragmented, bits 1-2 = fragment id, bits 3-7 = sequence.
 * A fragmented message whose last fragment is exactly full needs a trailing
 * zero-length fragment so the autopilot knows the message is complete (except
 * when all 4 fragment slots are used, which is already terminal).
 * Returns [] for frames too large to inject (> 720 bytes).
 */
export function fragmentRtcm(frame: Uint8Array, sequence: number): RtcmInjectFragment[] {
  const seqBits = (sequence & 0x1f) << 3;

  if (frame.length < RTCM_FRAGMENT_SIZE) {
    return [{ flags: seqBits, len: frame.length, data: toPayloadArray(frame) }];
  }
  if (frame.length > RTCM_MAX_INJECT_SIZE) return [];

  const fragments: RtcmInjectFragment[] = [];
  let fragId = 0;
  for (let off = 0; off < frame.length; off += RTCM_FRAGMENT_SIZE, fragId++) {
    const slice = frame.subarray(off, off + RTCM_FRAGMENT_SIZE);
    fragments.push({
      flags: 0x01 | (fragId << 1) | seqBits,
      len: slice.length,
      data: toPayloadArray(slice),
    });
  }
  if (frame.length % RTCM_FRAGMENT_SIZE === 0 && fragId <= 3) {
    fragments.push({
      flags: 0x01 | (fragId << 1) | seqBits,
      len: 0,
      data: toPayloadArray(new Uint8Array(0)),
    });
  }
  return fragments;
}
