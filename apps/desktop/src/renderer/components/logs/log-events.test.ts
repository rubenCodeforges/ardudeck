import { describe, it, expect } from 'vitest';
import { extractLogEvents, decodeErr, decodeEv, fmtEventTime, getModeName } from './log-events';
import { columnsFromRows } from '../../utils/log-columns';

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
        ERR: columnsFromRows([msg('ERR', 30_000_000, { Subsys: 12, ECode: 1 })]),
        EV: columnsFromRows([msg('EV', 10_000_000, { Id: 10 })]),
        MSG: columnsFromRows([msg('MSG', 20_000_000, { Message: 'PreArm: Compass not calibrated' })]),
        MODE: columnsFromRows([msg('MODE', 5_000_000, { ModeNum: 5, Rsn: 1 })]),
        CMD: columnsFromRows([msg('CMD', 25_000_000, { CNum: 2, CId: 16 })]),
      },
    });
    expect(events.map((e) => e.kind)).toEqual(['MODE', 'EV', 'MSG', 'CMD', 'ERR']);
    expect(events[0]!.label).toBe('Mode: LOITER');
    expect(events[1]!.severity).toBe('info');
    expect(events[2]!.severity).toBe('warn'); // PreArm message
    expect(events[4]!.severity).toBe('error');
  });

  it('collapses the mission dump written at log start and keeps the items that were actually flown', () => {
    const dump = Array.from({ length: 18 }, (_, i) => msg('CMD', 320_800_000 + i * 1000, { CNum: i, CId: 16 }));
    const flown = [msg('CMD', 349_300_000, { CNum: 1, CId: 16 }), msg('CMD', 424_200_000, { CNum: 2, CId: 16 })];
    const events = extractLogEvents({
      messages: {
        MSG: columnsFromRows([msg('MSG', 320_800_000, { Message: 'ArduPlane V4.6.3' })]),
        CMD: columnsFromRows([...dump, ...flown]),
      },
    });
    const cmd = events.filter((e) => e.kind === 'CMD');
    expect(cmd).toHaveLength(3);
    expect(cmd[0]!.label).toContain('18');
    expect(cmd[1]!.timeS).toBeCloseTo(349.3, 1);
    expect(cmd[2]!.timeS).toBeCloseTo(424.2, 1);
  });

  it('keeps a short list of mission commands that were really started one after another', () => {
    const events = extractLogEvents({
      messages: {
        MSG: columnsFromRows([msg('MSG', 1_000_000, { Message: 'boot' })]),
        CMD: columnsFromRows([msg('CMD', 100_000_000, { CNum: 1, CId: 16 }), msg('CMD', 200_000_000, { CNum: 2, CId: 16 })]),
      },
    });
    expect(events.filter((e) => e.kind === 'CMD')).toHaveLength(2);
  });

  it('handles logs with none of the event types', () => {
    expect(extractLogEvents({ messages: {} })).toEqual([]);
  });
});

describe('helpers', () => {
  it('formats event times as zero padded HH:MM:SS', () => {
    expect(fmtEventTime(65.25)).toBe('00:01:05');
    expect(fmtEventTime(5)).toBe('00:00:05');
    expect(fmtEventTime(3144)).toBe('00:52:24');
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
      messages: { MODE: columnsFromRows([msg('MODE', 1_000_000, { ModeNum: 10 })]) },
    });
    expect(events[0]!.label).toBe('Mode: AUTO');
  });
});
