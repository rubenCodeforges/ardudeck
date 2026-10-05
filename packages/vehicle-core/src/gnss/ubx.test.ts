import { describe, it, expect } from 'vitest';
import { UBX, UbxParser, decodeMonRf, decodeMonVer, decodeNavSat, ubxFrame, ubxPoll } from './ubx.js';

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(' ');

describe('UBX framing', () => {
  it('builds the poll requests u-center sends', () => {
    expect(hex(ubxPoll(UBX.MON_VER))).toBe('b5 62 0a 04 00 00 0e 34');
    expect(hex(ubxPoll(UBX.NAV_PVT))).toBe('b5 62 01 07 00 00 08 19');
  });
});

describe('UbxParser', () => {
  it('finds frames between NMEA text and across chunk boundaries', () => {
    const frame = ubxFrame(0x0a, 0x38, new Uint8Array([1, 0, 0, 0]));
    const nmea = new TextEncoder().encode('$GNGGA,123,,*55\r\n');
    const stream = new Uint8Array([...nmea, ...frame, ...nmea]);
    const p = new UbxParser();
    const first = p.push(stream.slice(0, nmea.length + 3));
    const rest = p.push(stream.slice(nmea.length + 3));
    expect(first).toEqual([]);
    expect(rest).toHaveLength(1);
    expect(rest[0]).toMatchObject({ cls: 0x0a, id: 0x38 });
  });

  it('drops a frame with a bad checksum and keeps going', () => {
    const bad = ubxFrame(0x01, 0x35, new Uint8Array([9, 9]));
    bad[bad.length - 1] = bad[bad.length - 1]! ^ 0xff;
    const good = ubxFrame(0x01, 0x07, new Uint8Array([7]));
    const out = new UbxParser().push(new Uint8Array([...bad, ...good]));
    expect(out.map((m) => m.id)).toEqual([0x07]);
  });
});

describe('decoders', () => {
  it('reads satellites from NAV-SAT', () => {
    const p = new Uint8Array(8 + 2 * 12);
    const v = new DataView(p.buffer);
    p[4] = 1;
    p[5] = 2;
    // Galileo 11, 42 dBHz, elev 55, azim 270, used, healthy, quality 7
    p.set([2, 11, 42], 8);
    v.setInt8(11, 55);
    v.setInt16(12, 270, true);
    v.setUint32(16, 7 | 0x8 | (1 << 4), true);
    // GPS 3, not received
    p.set([0, 3, 0], 20);
    v.setInt8(23, -5);
    const sats = decodeNavSat(p);
    expect(sats).toEqual([
      { gnssId: 2, svId: 11, cno: 42, elevDeg: 55, azimDeg: 270, quality: 7, used: true, health: 1 },
      { gnssId: 0, svId: 3, cno: 0, elevDeg: -5, azimDeg: 0, quality: 0, used: false, health: 0 },
    ]);
  });

  it('reads jamming and antenna state from MON-RF', () => {
    const p = new Uint8Array(4 + 24);
    const v = new DataView(p.buffer);
    p[1] = 1;
    p.set([0, 2, 2, 1], 4);
    v.setUint16(16, 87, true);
    v.setUint16(18, 4200, true);
    p[20] = 140;
    expect(decodeMonRf(p)).toEqual([
      { blockId: 0, jammingState: 2, antStatus: 2, antPower: 1, noisePerMs: 87, agcCnt: 4200, jamInd: 140 },
    ]);
  });

  it('reads the software and hardware version from MON-VER', () => {
    const p = new Uint8Array(40 + 30);
    p.set(new TextEncoder().encode('ROM SPG 5.10 (7b202e)'), 0);
    p.set(new TextEncoder().encode('000A0000'), 30);
    p.set(new TextEncoder().encode('PROTVER=34.10'), 40);
    expect(decodeMonVer(p)).toEqual({ software: 'ROM SPG 5.10 (7b202e)', hardware: '000A0000', extensions: ['PROTVER=34.10'] });
  });
});
