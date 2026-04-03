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
