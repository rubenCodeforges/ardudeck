import { describe, it, expect } from 'vitest';
import { createDataFlashParser, parseDataFlashLog } from '../parser.js';

/**
 * Build a raw FMT message (type 128) that defines another message type.
 * FMT format: BBnNZ — type(B), length(B), name(n4), format(N16), labels(Z64)
 * FMT itself is type=128, length=89
 */
function buildFmtMessage(
  typeId: number,
  length: number,
  name: string,
  format: string,
  labels: string,
): Uint8Array {
  const msg = new Uint8Array(89);
  msg[0] = 0xA3;
  msg[1] = 0x95;
  msg[2] = 128;
  msg[3] = typeId;
  msg[4] = length;
  for (let i = 0; i < Math.min(name.length, 4); i++) msg[5 + i] = name.charCodeAt(i);
  for (let i = 0; i < Math.min(format.length, 16); i++) msg[9 + i] = format.charCodeAt(i);
  for (let i = 0; i < Math.min(labels.length, 64); i++) msg[25 + i] = labels.charCodeAt(i);
  return msg;
}

function buildDataMessage(typeId: number, payload: Uint8Array): Uint8Array {
  const msg = new Uint8Array(3 + payload.length);
  msg[0] = 0xA3;
  msg[1] = 0x95;
  msg[2] = typeId;
  msg.set(payload, 3);
  return msg;
}

describe('createDataFlashParser', () => {
  it('parses FMT messages to build format table', () => {
    const parser = createDataFlashParser();

    const fmtFmt = buildFmtMessage(128, 89, 'FMT', 'BBnNZ', 'Type,Length,Name,Format,Columns');
    const attFmt = buildFmtMessage(
      1, 3 + 8 + 2 * 4 + 2 * 3, 'ATT', 'QccccCCC',
      'TimeUS,DesRoll,Roll,DesPitch,Pitch,DesYaw,Yaw,ErrRP',
    );

    const data = new Uint8Array(fmtFmt.length + attFmt.length);
    data.set(fmtFmt, 0);
    data.set(attFmt, fmtFmt.length);

    parser.feed(data);
    const log = parser.finalize();

    expect(log.formats.size).toBe(2);
    expect(log.formats.get(128)?.name).toBe('FMT');
    expect(log.formats.get(1)?.name).toBe('ATT');
    expect(log.formats.get(1)?.fields).toEqual([
      'TimeUS', 'DesRoll', 'Roll', 'DesPitch', 'Pitch', 'DesYaw', 'Yaw', 'ErrRP',
    ]);
  });

  it('parses data messages using format table', () => {
    const parser = createDataFlashParser();

    const fmtFmt = buildFmtMessage(128, 89, 'FMT', 'BBnNZ', 'Type,Length,Name,Format,Columns');
    // GPS: type=2, format="QBf" (TimeUS, Status, Alt) => payload=8+1+4=13, total=16
    const gpsFmt = buildFmtMessage(2, 16, 'GPS', 'QBf', 'TimeUS,Status,Alt');

    const gpsPayload = new Uint8Array(13);
    const gpsView = new DataView(gpsPayload.buffer);
    gpsView.setUint32(0, 1000000, true);
    gpsView.setUint32(4, 0, true);
    gpsPayload[8] = 3;
    gpsView.setFloat32(9, 100.5, true);

    const allData = new Uint8Array(fmtFmt.length + gpsFmt.length + 3 + gpsPayload.length);
    let offset = 0;
    allData.set(fmtFmt, offset); offset += fmtFmt.length;
    allData.set(gpsFmt, offset); offset += gpsFmt.length;
    const gpsMsg = buildDataMessage(2, gpsPayload);
    allData.set(gpsMsg, offset);

    parser.feed(allData);
    const log = parser.finalize();

    const gpsMessages = log.messages.get('GPS');
    expect(gpsMessages).toBeDefined();
    expect(gpsMessages!.length).toBe(1);
    expect(gpsMessages![0]!.timeUs).toBe(1000000);
    expect(gpsMessages![0]!.fields['Status']).toBe(3);
    expect(gpsMessages![0]!.fields['Alt']).toBeCloseTo(100.5, 1);
  });

  it('handles partial data across feed calls', () => {
    const parser = createDataFlashParser();

    const fmtFmt = buildFmtMessage(128, 89, 'FMT', 'BBnNZ', 'Type,Length,Name,Format,Columns');
    const gpsFmt = buildFmtMessage(2, 16, 'GPS', 'QBf', 'TimeUS,Status,Alt');

    const gpsPayload = new Uint8Array(13);
    const gpsView = new DataView(gpsPayload.buffer);
    gpsView.setUint32(0, 500000, true);
    gpsView.setUint32(4, 0, true);
    gpsPayload[8] = 2;
    gpsView.setFloat32(9, 50.0, true);
    const gpsMsg = buildDataMessage(2, gpsPayload);

    const allData = new Uint8Array(fmtFmt.length + gpsFmt.length + gpsMsg.length);
    allData.set(fmtFmt, 0);
    allData.set(gpsFmt, fmtFmt.length);
    allData.set(gpsMsg, fmtFmt.length + gpsFmt.length);

    // Feed in small chunks
    const chunkSize = 20;
    for (let i = 0; i < allData.length; i += chunkSize) {
      parser.feed(allData.subarray(i, Math.min(i + chunkSize, allData.length)));
    }

    const log = parser.finalize();
    const gpsMessages = log.messages.get('GPS');
    expect(gpsMessages).toBeDefined();
    expect(gpsMessages!.length).toBe(1);
    expect(gpsMessages![0]!.fields['Status']).toBe(2);
  });
});

describe('parseDataFlashLog', () => {
  it('parses a complete buffer in one call', () => {
    const fmtFmt = buildFmtMessage(128, 89, 'FMT', 'BBnNZ', 'Type,Length,Name,Format,Columns');
    const gpsFmt = buildFmtMessage(2, 16, 'GPS', 'QBf', 'TimeUS,Status,Alt');

    const gpsPayload = new Uint8Array(13);
    const gpsView = new DataView(gpsPayload.buffer);
    gpsView.setUint32(0, 2000000, true);
    gpsView.setUint32(4, 0, true);
    gpsPayload[8] = 3;
    gpsView.setFloat32(9, 200.0, true);
    const gpsMsg = buildDataMessage(2, gpsPayload);

    const allData = new Uint8Array(fmtFmt.length + gpsFmt.length + gpsMsg.length);
    allData.set(fmtFmt, 0);
    allData.set(gpsFmt, fmtFmt.length);
    allData.set(gpsMsg, fmtFmt.length + gpsFmt.length);

    const log = parseDataFlashLog(allData);
    expect(log.formats.size).toBe(2);
    expect(log.messages.get('GPS')!.length).toBe(1);
    expect(log.timeRange.startUs).toBe(2000000);
    expect(log.timeRange.endUs).toBe(2000000);
    expect(log.messageTypes).toContain('GPS');
  });
});

describe('columnar parse (#145)', () => {
  // GPS (kept as rows for health checks) and IMU (columns only), 3000 records each so the builders grow.
  function bigLog(): Uint8Array {
    const parts: Uint8Array[] = [
      buildFmtMessage(128, 89, 'FMT', 'BBnNZ', 'Type,Length,Name,Format,Columns'),
      buildFmtMessage(2, 16, 'GPS', 'QBf', 'TimeUS,Status,Alt'),
      buildFmtMessage(3, 15, 'IMU', 'Qf', 'TimeUS,AccX'),
      buildFmtMessage(4, 75, 'MSG', 'QZ', 'TimeUS,Message'),
    ];
    for (let i = 0; i < 3000; i++) {
      const gps = new Uint8Array(13);
      const g = new DataView(gps.buffer);
      g.setUint32(0, 1000 * i, true);
      gps[8] = 3;
      g.setFloat32(9, i, true);
      parts.push(buildDataMessage(2, gps));
      const imu = new Uint8Array(12);
      const m = new DataView(imu.buffer);
      m.setUint32(0, 1000 * i + 500, true);
      m.setFloat32(8, -i, true);
      parts.push(buildDataMessage(3, imu));
    }
    const msg = new Uint8Array(72);
    new DataView(msg.buffer).setUint32(0, 42, true);
    msg.set(new TextEncoder().encode('ArduPlane V4.7.0'), 8);
    parts.push(buildDataMessage(4, msg));
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }

  it('builds the same values as the row parse, and keeps rows only for keepRows types', () => {
    const rows = createDataFlashParser();
    rows.feed(bigLog());
    const r = rows.finalize();

    const cols = createDataFlashParser({ columnar: true, keepRows: new Set(['GPS']) });
    cols.feed(bigLog());
    const c = cols.finalize();

    expect([...c.messages.keys()]).toEqual(['GPS']);
    expect(c.messages.get('GPS')).toEqual(r.messages.get('GPS'));
    expect(c.messageTypes).toEqual(r.messageTypes);
    expect(c.timeRange).toEqual(r.timeRange);
    expect(c.metadata).toEqual(r.metadata);

    const imu = c.columns!.get('IMU')!;
    expect(imu.count).toBe(3000);
    expect(imu.timeUs.length).toBe(3000);
    expect(Array.from(imu.num['AccX']!)).toEqual(r.messages.get('IMU')!.map((m) => m.fields['AccX']));
    expect(c.columns!.get('MSG')!.txt['Message']).toEqual(['ArduPlane V4.7.0']);
  });

  it('leaves the default parse unchanged (no columns)', () => {
    const p = createDataFlashParser();
    p.feed(bigLog());
    expect(p.finalize().columns).toBeUndefined();
  });
});

describe('chunk boundaries', () => {
  it('loses no record when a chunk ends inside a header', () => {
    const fmtFmt = buildFmtMessage(128, 89, 'FMT', 'BBnNZ', 'Type,Length,Name,Format,Columns');
    const imuFmt = buildFmtMessage(3, 15, 'IMU', 'Qf', 'TimeUS,AccX');
    const recs: Uint8Array[] = [];
    for (let i = 0; i < 50; i++) {
      const p = new Uint8Array(12);
      new DataView(p.buffer).setUint32(0, i + 1, true);
      recs.push(buildDataMessage(3, p));
    }
    const all = new Uint8Array(fmtFmt.length + imuFmt.length + recs.length * 15);
    let o = 0;
    for (const part of [fmtFmt, imuFmt, ...recs]) { all.set(part, o); o += part.length; }
    // Every split point, including right after the first header byte of a record.
    for (const chunk of [1, 2, 7, 16, 31]) {
      const parser = createDataFlashParser();
      for (let off = 0; off < all.length; off += chunk) parser.feed(all.subarray(off, Math.min(off + chunk, all.length)));
      expect(parser.finalize().messages.get('IMU')?.length).toBe(50);
    }
  });
});
