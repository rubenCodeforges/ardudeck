// UBX framing, parser and decoders for GPS diagnostics; layouts per u-blox M10 interface description.

import type { UbxPvt, UbxRfBlock, UbxSatellite, UbxVersion } from './ubx-types.js';

export type { UbxPvt, UbxRfBlock, UbxSatellite, UbxVersion };

export const UBX = {
  NAV_PVT: [0x01, 0x07],
  NAV_SAT: [0x01, 0x35],
  MON_VER: [0x0a, 0x04],
  MON_RF: [0x0a, 0x38],
} as const;

export interface UbxMessage {
  cls: number;
  id: number;
  payload: Uint8Array;
}

/** A complete UBX frame: sync, class, id, little-endian length, payload, Fletcher-8 checksum. */
export function ubxFrame(cls: number, id: number, payload: Uint8Array = new Uint8Array(0)): Uint8Array {
  const out = new Uint8Array(8 + payload.length);
  out[0] = 0xb5;
  out[1] = 0x62;
  out[2] = cls;
  out[3] = id;
  out[4] = payload.length & 0xff;
  out[5] = payload.length >> 8;
  out.set(payload, 6);
  let a = 0;
  let b = 0;
  for (let i = 2; i < 6 + payload.length; i++) {
    a = (a + out[i]!) & 0xff;
    b = (b + a) & 0xff;
  }
  out[6 + payload.length] = a;
  out[7 + payload.length] = b;
  return out;
}

/** Poll request for a message: the frame with an empty payload. */
export const ubxPoll = (msg: readonly [number, number]) => ubxFrame(msg[0], msg[1]);

/** Pulls UBX frames out of a byte stream that also carries NMEA and noise; bad checksums are dropped. */
export class UbxParser {
  private buf = new Uint8Array(0);

  push(chunk: Uint8Array): UbxMessage[] {
    const merged = new Uint8Array(this.buf.length + chunk.length);
    merged.set(this.buf);
    merged.set(chunk, this.buf.length);
    let data = merged;
    const out: UbxMessage[] = [];

    for (;;) {
      let start = -1;
      for (let i = 0; i + 1 < data.length; i++) {
        if (data[i] === 0xb5 && data[i + 1] === 0x62) {
          start = i;
          break;
        }
      }
      if (start < 0) {
        // keep a trailing 0xB5 in case the next chunk starts with 0x62
        data = data.length && data[data.length - 1] === 0xb5 ? data.slice(-1) : new Uint8Array(0);
        break;
      }
      data = data.slice(start);
      if (data.length < 8) break;
      const len = data[4]! | (data[5]! << 8);
      if (len > 4096) {
        data = data.slice(2);
        continue;
      }
      if (data.length < 8 + len) break;
      const frame = data.slice(0, 8 + len);
      const check = ubxFrame(frame[2]!, frame[3]!, frame.slice(6, 6 + len));
      if (check[6 + len] === frame[6 + len] && check[7 + len] === frame[7 + len]) {
        out.push({ cls: frame[2]!, id: frame[3]!, payload: frame.slice(6, 6 + len) });
        data = data.slice(8 + len);
      } else {
        data = data.slice(2);
      }
    }
    this.buf = data;
    return out;
  }
}

export const GNSS_NAMES: Record<number, string> = {
  0: 'GPS',
  1: 'SBAS',
  2: 'Galileo',
  3: 'BeiDou',
  4: 'IMES',
  5: 'QZSS',
  6: 'GLONASS',
  7: 'NavIC',
};

export function decodeNavSat(p: Uint8Array): UbxSatellite[] {
  if (p.length < 8) return [];
  const v = new DataView(p.buffer, p.byteOffset, p.byteLength);
  const numSvs = p[5]!;
  const sats: UbxSatellite[] = [];
  for (let i = 0; i < numSvs && 8 + i * 12 + 12 <= p.length; i++) {
    const o = 8 + i * 12;
    const flags = v.getUint32(o + 8, true);
    sats.push({
      gnssId: p[o]!,
      svId: p[o + 1]!,
      cno: p[o + 2]!,
      elevDeg: v.getInt8(o + 3),
      azimDeg: v.getInt16(o + 4, true),
      quality: flags & 0x7,
      used: (flags & 0x8) !== 0,
      health: (flags >> 4) & 0x3,
    });
  }
  return sats;
}

export function decodeNavPvt(p: Uint8Array): UbxPvt | null {
  if (p.length < 92) return null;
  const v = new DataView(p.buffer, p.byteOffset, p.byteLength);
  return {
    fixType: p[20]!,
    numSv: p[23]!,
    hAccM: v.getUint32(40, true) / 1000,
    vAccM: v.getUint32(44, true) / 1000,
    pDop: v.getUint16(76, true) / 100,
  };
}

export function decodeMonRf(p: Uint8Array): UbxRfBlock[] {
  if (p.length < 4) return [];
  const v = new DataView(p.buffer, p.byteOffset, p.byteLength);
  const n = p[1]!;
  const blocks: UbxRfBlock[] = [];
  for (let i = 0; i < n && 4 + i * 24 + 24 <= p.length; i++) {
    const o = 4 + i * 24;
    blocks.push({
      blockId: p[o]!,
      jammingState: p[o + 1]! & 0x3,
      antStatus: p[o + 2]!,
      antPower: p[o + 3]!,
      noisePerMs: v.getUint16(o + 12, true),
      agcCnt: v.getUint16(o + 14, true),
      jamInd: p[o + 16]!,
    });
  }
  return blocks;
}

function cString(bytes: Uint8Array): string {
  const end = bytes.indexOf(0);
  return new TextDecoder().decode(end >= 0 ? bytes.slice(0, end) : bytes).trim();
}

export function decodeMonVer(p: Uint8Array): UbxVersion | null {
  if (p.length < 40) return null;
  const extensions: string[] = [];
  for (let o = 40; o + 30 <= p.length; o += 30) {
    const s = cString(p.slice(o, o + 30));
    if (s) extensions.push(s);
  }
  return { software: cString(p.slice(0, 30)), hardware: cString(p.slice(30, 40)), extensions };
}
