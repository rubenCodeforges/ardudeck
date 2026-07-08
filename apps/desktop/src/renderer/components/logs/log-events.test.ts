import { describe, it, expect } from 'vitest';
import { extractLogEvents, decodeErr, decodeEv, fmtEventTime, getModeName } from './log-events';

function msg(type: string, timeUs: number, fields: Record<string, number | string>) {
  return { type, timeUs, fields };
}

describe('decodeErr', () => {
  it('decodes crash-check crash as an error', () => {
    const d = decodeErr(12, 1);
    expect(d.label).toBe('Crash check');
    expect(d.detail).toBe('CRASH DETECTED');
    expect(d.severity).toBe('error');
  });

  it('treats code 0 as resolved/info', () => {
    const d = decodeErr(16, 0);
    expect(d.severity).toBe('info');
    expect(d.detail).toBe('variance cleared');
  });

  it('decodes flight-mode refusals with the mode name', () => {
    const d = decodeErr(10, 6);
    expect(d.detail).toContain('RTL');
  });

  it('falls back gracefully on unknown ids', () => {
    const d = decodeErr(99, 7);
    expect(d.label).toBe('Subsystem 99');
    expect(d.detail).toBe('code 7');
  });
});

describe('decodeEv', () => {
  it('names common events', () => {
    expect(decodeEv(10).label).toBe('Armed');
    expect(decodeEv(11).label).toBe('Disarmed');
  });

  it('grades hazardous events as warnings', () => {
    expect(decodeEv(54).severity).toBe('warn'); // motors emergency stopped
    expect(decodeEv(10).severity).toBe('info');
  });
});

describe('extractLogEvents', () => {
  it('merges ERR/EV/MSG/MODE/CMD chronologically with severities', () => {
    const events = extractLogEvents({
      messages: {
        ERR: [msg('ERR', 30_000_000, { Subsys: 12, ECode: 1 })],
        EV: [msg('EV', 10_000_000, { Id: 10 })],
        MSG: [msg('MSG', 20_000_000, { Message: 'PreArm: Compass not calibrated' })],
        MODE: [msg('MODE', 5_000_000, { ModeNum: 5, Rsn: 1 })],
        CMD: [msg('CMD', 25_000_000, { CNum: 2, CId: 16 })],
      },
    });
    expect(events.map((e) => e.kind)).toEqual(['MODE', 'EV', 'MSG', 'CMD', 'ERR']);
    expect(events[0]!.label).toBe('Mode: LOITER');
    expect(events[1]!.severity).toBe('info');
    expect(events[2]!.severity).toBe('warn'); // PreArm message
    expect(events[4]!.severity).toBe('error');
  });

  it('handles logs with none of the event types', () => {
    expect(extractLogEvents({ messages: {} })).toEqual([]);
  });
});

describe('helpers', () => {
  it('formats event times as m:ss.s', () => {
    expect(fmtEventTime(65.25)).toBe('1:05.3');
    expect(fmtEventTime(5)).toBe('0:05.0');
  });

  it('maps mode numbers', () => {
    expect(getModeName(6)).toBe('RTL');
    expect(getModeName(99)).toBe('MODE_99');
  });

  it('maps mode numbers per vehicle type', () => {
    // 10 = AUTO on plane and rover; the copter table has no 10.
    expect(getModeName(10, 'plane')).toBe('AUTO');
    expect(getModeName(10, 'rover')).toBe('AUTO');
    expect(getModeName(10, 'copter')).toBe('MODE_10');
    // 11 = copter DRIFT but plane/rover RTL.
    expect(getModeName(11, 'copter')).toBe('DRIFT');
    expect(getModeName(11, 'plane')).toBe('RTL');
    expect(getModeName(11, 'rover')).toBe('RTL');
    // No vehicle type falls back to the copter table.
    expect(getModeName(3)).toBe('AUTO');
  });

  it('uses the log vehicle type for MODE events', () => {
    const events = extractLogEvents({
      metadata: { vehicleType: 'plane' },
      messages: { MODE: [msg('MODE', 1_000_000, { ModeNum: 10 })] },
    });
    expect(events[0]!.label).toBe('Mode: AUTO');
  });
});
