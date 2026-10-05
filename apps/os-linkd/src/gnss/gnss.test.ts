import { describe, it, expect } from 'vitest';
import { serializeV2, HEARTBEAT_ID, HEARTBEAT_CRC_EXTRA, serializeHeartbeat } from '@ardudeck/mavlink-ts';
import { ubxFrame } from '@ardudeck/vehicle-core';
import { StreamSniffer, nmeaChecksumOk } from './sniff.js';
import { identifyUblox } from './receiver.js';
import { NmeaFixReader } from './nmea.js';

const enc = (s: string) => new TextEncoder().encode(s);
const GGA = '$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47\r\n';

describe('StreamSniffer', () => {
  it('recognises NMEA by valid checksums only', () => {
    const s = new StreamSniffer();
    s.push(enc(GGA + '$GPGGA,garbage*00\r\n'));
    expect(s.counts.nmea).toBe(1);
    expect(s.verdict()).toBe('nmea');
  });

  it('recognises UBX', () => {
    const s = new StreamSniffer();
    s.push(ubxFrame(0x01, 0x07, new Uint8Array(92)));
    expect(s.verdict()).toBe('ubx');
  });

  it('recognises a MAVLink telemetry radio', () => {
    const s = new StreamSniffer();
    const hb = serializeHeartbeat({ type: 2, autopilot: 3, baseMode: 0, customMode: 0, systemStatus: 3, mavlinkVersion: 3 });
    s.push(serializeV2(HEARTBEAT_ID, hb, HEARTBEAT_CRC_EXTRA, { sysid: 1, compid: 1 }));
    expect(s.verdict()).toBe('mavlink');
  });

  it('calls random bytes unknown and nothing silent', () => {
    const s = new StreamSniffer();
    expect(s.verdict()).toBe('silent');
    s.push(Uint8Array.from({ length: 300 }, (_, i) => (i * 37) & 0xff));
    expect(s.verdict()).toBe('unknown');
  });

  it('validates NMEA checksums', () => {
    expect(nmeaChecksumOk(GGA.trim())).toBe(true);
    expect(nmeaChecksumOk(GGA.trim().replace('*47', '*48'))).toBe(false);
  });
});

describe('identifyUblox', () => {
  const ver = (mod: string, fw: string) => ({ software: 'EXT CORE', hardware: '00190000', extensions: [`FWVER=${fw}`, `MOD=${mod}`, 'PROTVER=27.12', 'GPS;GLO;GAL;BDS'] });

  it('treats standard-precision modules as position only', () => {
    expect(identifyUblox(ver('NEO-M8N-0', 'SPG 3.01'))).toMatchObject({ model: 'NEO-M8N-0', rtkBase: false, rtkRover: false });
  });

  it('treats RTK modules as base capable', () => {
    expect(identifyUblox(ver('ZED-F9P', 'HPG 1.32'))).toMatchObject({ rtkBase: true, rtkRover: true, constellations: ['GPS', 'GLO', 'GAL', 'BDS'] });
    expect(identifyUblox(ver('NEO-M8P-2', 'HPG 1.40'))).toMatchObject({ rtkBase: true });
  });

  it('treats the F9R as a rover, not a base', () => {
    expect(identifyUblox(ver('ZED-F9R', 'HPS 1.30'))).toMatchObject({ rtkBase: false, rtkRover: true });
  });
});

describe('NmeaFixReader', () => {
  it('keeps the latest GGA fix', () => {
    const r = new NmeaFixReader();
    r.push(enc(GGA), 1000);
    expect(r.fix).toMatchObject({ quality: 1, satellitesUsed: 8, hdop: 0.9, altMsl: 545.4, updatedAt: 1000 });
    expect(r.fix.lat).toBeCloseTo(48.1173, 4);
    expect(r.fix.lon).toBeCloseTo(11.5167, 4);
  });

  it('handles sentences split across chunks', () => {
    const r = new NmeaFixReader();
    r.push(enc(GGA.slice(0, 20)));
    r.push(enc(GGA.slice(20)));
    expect(r.fix.satellitesUsed).toBe(8);
  });
});
