import { describe, it, expect } from 'vitest';
import { runHealthChecks } from '../health-checks.js';
import type { DataFlashLog, DataFlashMessage } from '../types.js';

function makeLog(messages: Record<string, DataFlashMessage[]>): DataFlashLog {
  return {
    formats: new Map(),
    messages: new Map(Object.entries(messages)),
    metadata: { vehicleType: 'copter', firmwareVersion: '4.5.1', firmwareString: '', boardType: '', gitHash: '' },
    timeRange: { startUs: 0, endUs: 60_000_000 },
    messageTypes: Object.keys(messages),
  };
}

function makeMsg(type: string, timeUs: number, fields: Record<string, number | string>): DataFlashMessage {
  return { type, timeUs, fields };
}

describe('runHealthChecks', () => {
  it('returns pass for good vibration data', () => {
    const log = makeLog({
      VIBE: [
        makeMsg('VIBE', 1000000, { TimeUS: 1000000, VibeX: 10, VibeY: 12, VibeZ: 15, Clip0: 0, Clip1: 0, Clip2: 0 }),
        makeMsg('VIBE', 2000000, { TimeUS: 2000000, VibeX: 8, VibeY: 11, VibeZ: 14, Clip0: 0, Clip1: 0, Clip2: 0 }),
      ],
    });
    const results = runHealthChecks(log);
    const vibe = results.find((r) => r.id === 'vibration');
    expect(vibe).toBeDefined();
    expect(vibe!.status).toBe('pass');
  });

  it('returns warn for elevated vibration', () => {
    const log = makeLog({
      VIBE: [
        makeMsg('VIBE', 1000000, { TimeUS: 1000000, VibeX: 35, VibeY: 32, VibeZ: 40, Clip0: 0, Clip1: 0, Clip2: 0 }),
      ],
    });
    const results = runHealthChecks(log);
    const vibe = results.find((r) => r.id === 'vibration');
    expect(vibe!.status).toBe('warn');
  });

  it('returns fail for extreme vibration', () => {
    const log = makeLog({
      VIBE: [
        makeMsg('VIBE', 1000000, { TimeUS: 1000000, VibeX: 70, VibeY: 65, VibeZ: 80, Clip0: 100, Clip1: 0, Clip2: 0 }),
      ],
    });
    const results = runHealthChecks(log);
    const vibe = results.find((r) => r.id === 'vibration');
    expect(vibe!.status).toBe('fail');
  });

  it('returns pass for good GPS data', () => {
    const log = makeLog({
      GPS: [
        makeMsg('GPS', 1000000, { TimeUS: 1000000, NSats: 14, HDop: 0.8, Status: 3 }),
        makeMsg('GPS', 2000000, { TimeUS: 2000000, NSats: 12, HDop: 1.1, Status: 3 }),
      ],
    });
    const results = runHealthChecks(log);
    const gps = results.find((r) => r.id === 'gps');
    expect(gps!.status).toBe('pass');
  });

  it('returns warn for poor GPS quality', () => {
    const log = makeLog({
      GPS: [
        makeMsg('GPS', 1000000, { TimeUS: 1000000, NSats: 7, HDop: 2.5, Status: 3 }),
      ],
    });
    const results = runHealthChecks(log);
    const gps = results.find((r) => r.id === 'gps');
    expect(gps!.status).toBe('warn');
  });

  it('detects battery voltage sag', () => {
    const log = makeLog({
      BAT: [
        makeMsg('BAT', 1000000, { TimeUS: 1000000, Volt: 16.5, Curr: 2.0 }),
        makeMsg('BAT', 2000000, { TimeUS: 2000000, Volt: 14.8, Curr: 25.0 }),
        makeMsg('BAT', 3000000, { TimeUS: 3000000, Volt: 16.2, Curr: 3.0 }),
      ],
    });
    const results = runHealthChecks(log);
    const batt = results.find((r) => r.id === 'battery');
    expect(batt).toBeDefined();
    expect(batt!.status).toBe('warn');
  });

  it('detects failsafe events from EV messages', () => {
    const log = makeLog({
      EV: [
        makeMsg('EV', 1000000, { TimeUS: 1000000, Id: 9 }),
        makeMsg('EV', 2000000, { TimeUS: 2000000, Id: 10 }),
      ],
    });
    const results = runHealthChecks(log);
    const fs = results.find((r) => r.id === 'failsafe');
    expect(fs!.status).toBe('fail');
    expect(fs!.details).toContain('2 failsafe');
  });

  it('returns skip for missing data', () => {
    const log = makeLog({});
    const results = runHealthChecks(log);
    const vibe = results.find((r) => r.id === 'vibration');
    expect(vibe!.status).toBe('skip');
  });

  it('extracts flight mode timeline', () => {
    const log = makeLog({
      MODE: [
        makeMsg('MODE', 1000000, { TimeUS: 1000000, Mode: 0, ModeNum: 0 }),
        makeMsg('MODE', 5000000, { TimeUS: 5000000, Mode: 5, ModeNum: 5 }),
      ],
    });
    const results = runHealthChecks(log);
    const modes = results.find((r) => r.id === 'flight-modes');
    expect(modes).toBeDefined();
    expect(modes!.status).toBe('info');
  });
});
