import { describe, it, expect } from 'vitest';
import { runHealthChecks } from '../health-checks.js';
import type { DataFlashLog, DataFlashMessage } from '../types.js';

function makeLog(messages: Record<string, DataFlashMessage[]>): DataFlashLog {
  return {
    format: 'dataflash',
    formats: new Map(),
    messages: new Map(Object.entries(messages)),
    metadata: { vehicleType: 'copter', firmwareVersion: '4.5.1', firmwareString: '', boardType: '', gitHash: '' },
    timeRange: { startUs: 0, endUs: 60_000_000 },
    messageTypes: Object.keys(messages),
    unitLabels: new Map(),
    multValues: new Map(),
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

  it('reports real failsafes from ERR records with their time, and ignores normal EV events', () => {
    const log = makeLog({
      EV: [
        makeMsg('EV', 1000000, { TimeUS: 1000000, Id: 10 }), // armed
        makeMsg('EV', 9000000, { TimeUS: 9000000, Id: 11 }), // disarmed
        makeMsg('EV', 8000000, { TimeUS: 8000000, Id: 17 }), // land complete (maybe)
      ],
      ERR: [
        makeMsg('ERR', 3281600000, { TimeUS: 3281600000, Subsys: 5, ECode: 1 }), // radio failsafe occurred
        makeMsg('ERR', 3290000000, { TimeUS: 3290000000, Subsys: 5, ECode: 0 }), // resolved
      ],
    });
    const fs = runHealthChecks(log).find((r) => r.id === 'failsafe');
    expect(fs!.status).toBe('fail');
    expect(fs!.summary).toContain('1 failsafe');
    expect(fs!.details).toContain('Radio failsafe at 00:54:42');
  });

  it('counts any fence breach bitmask, not only the altitude bit', () => {
    const log = makeLog({ ERR: [
      makeMsg('ERR', 5e6, { TimeUS: 5e6, Subsys: 9, ECode: 4 }), // polygon
      makeMsg('ERR', 9e6, { TimeUS: 9e6, Subsys: 9, ECode: 0 }), // resolved
    ] });
    const fs = runHealthChecks(log).find((r) => r.id === 'failsafe')!;
    expect(fs.status).toBe('fail');
    expect(fs.details).toContain('Fence breach');
  });

  it('finds ArduPlane radio and GCS failsafes from their text messages, which have no ERR record', () => {
    const log = makeLog({ MSG: [
      makeMsg('MSG', 2666e6, { TimeUS: 2666e6, Message: 'RC Long Failsafe On: RTL' }),
      makeMsg('MSG', 2700e6, { TimeUS: 2700e6, Message: 'RC Long Failsafe Cleared' }),
      makeMsg('MSG', 10e6, { TimeUS: 10e6, Message: 'PreArm: Throttle below failsafe' }),
    ] });
    const fs = runHealthChecks(log).find((r) => r.id === 'failsafe')!;
    expect(fs.status).toBe('fail');
    expect(fs.summary).toContain('1 failsafe');
    expect(fs.details).toContain('RC Long Failsafe On: RTL at 00:44:26');
  });

  it('finds a low battery announcement on ArduPlane, which has no ERR record for it', () => {
    const log = makeLog({ MSG: [makeMsg('MSG', 1800e6, { TimeUS: 1800e6, Message: 'Battery 1 is low 14.10V used 2100 mAh' })] });
    const fs = runHealthChecks(log).find((r) => r.id === 'failsafe')!;
    expect(fs.status).toBe('fail');
    expect(fs.details).toContain('Battery 1 is low 14.10V used 2100 mAh at 00:30:00');
  });

  it('does not count a Copter ERR failsafe twice when its text message follows', () => {
    const log = makeLog({
      ERR: [makeMsg('ERR', 100e6, { TimeUS: 100e6, Subsys: 5, ECode: 1 })],
      MSG: [makeMsg('MSG', 100.2e6, { TimeUS: 100.2e6, Message: 'Radio Failsafe' })],
    });
    expect(runHealthChecks(log).find((r) => r.id === 'failsafe')!.summary).toContain('1 failsafe');
  });

  it('does not call a normal flight a failsafe or a crash', () => {
    const log = makeLog({
      EV: [10, 15, 16, 17, 18, 28, 11].map((id, i) => makeMsg('EV', (i + 1) * 1e6, { TimeUS: (i + 1) * 1e6, Id: id })),
    });
    expect(runHealthChecks(log).find((r) => r.id === 'failsafe')!.status).toBe('pass');
  });

  it('counts a crash check ERR as a crash', () => {
    const log = makeLog({ ERR: [makeMsg('ERR', 5e6, { TimeUS: 5e6, Subsys: 12, ECode: 1 })] });
    const fs = runHealthChecks(log).find((r) => r.id === 'failsafe');
    expect(fs!.status).toBe('fail');
    expect(fs!.summary).toContain('1 crash');
  });

  it('ignores shaking in the 15 s after arming and the last 20 s before disarm, and clips from those phases', () => {
    const rows = [];
    for (let t = 0; t <= 300; t++) {
      const launch = t < 15, landing = t > 280;
      rows.push(makeMsg('VIBE', t * 1e6, { TimeUS: t * 1e6, VibeX: launch || landing ? 45 : 6, VibeY: launch || landing ? 40 : 5, VibeZ: launch || landing ? 62 : 8, Clip0: landing ? 9 : launch ? 2 : 2, Clip1: 0, Clip2: 0 }));
    }
    const log = makeLog({ VIBE: rows, EV: [makeMsg('EV', 0, { TimeUS: 0, Id: 10 }), makeMsg('EV', 300e6, { TimeUS: 300e6, Id: 11 })] });
    const vibe = runHealthChecks(log).find((r) => r.id === 'vibration')!;
    expect(vibe.status).toBe('pass');
    expect(vibe.details).toContain('not counted');
    expect(vibe.details).toContain('0 clipping');
  });

  it('starts the window after the arming event, not at the start of the log', () => {
    // powered and idle for 100 s, armed at 100 s, shaking on launch until 112 s
    const rows = [];
    for (let t = 0; t <= 400; t++) {
      rows.push(makeMsg('VIBE', t * 1e6, { TimeUS: t * 1e6, VibeX: t >= 100 && t < 112 ? 50 : 6, VibeY: 5, VibeZ: 8, Clip0: 0, Clip1: 0, Clip2: 0 }));
    }
    const log = makeLog({ VIBE: rows, EV: [makeMsg('EV', 100e6, { TimeUS: 100e6, Id: 10 }), makeMsg('EV', 400e6, { TimeUS: 400e6, Id: 11 })] });
    const vibe = runHealthChecks(log).find((r) => r.id === 'vibration')!;
    expect(vibe.status).toBe('pass');
    expect(vibe.details).toContain('Peak in flight 8.0');
  });

  it('still reports a single landing spike in a short log without failing it', () => {
    const rows = Array.from({ length: 200 }, (_, i) => makeMsg('VIBE', i * 1e6, { TimeUS: i * 1e6, VibeX: 6, VibeY: 5, VibeZ: 8, Clip0: 0, Clip1: 0, Clip2: 0 }));
    rows.push(makeMsg('VIBE', 201e6, { TimeUS: 201e6, VibeX: 21, VibeY: 16, VibeZ: 38.7, Clip0: 0, Clip1: 0, Clip2: 0 }));
    const vibe = runHealthChecks(makeLog({ VIBE: rows })).find((r) => r.id === 'vibration')!;
    expect(vibe.status).toBe('pass');
  });

  it('warns when vibration is high for most of the flight', () => {
    const rows = Array.from({ length: 100 }, (_, i) => makeMsg('VIBE', i * 1e6, { TimeUS: i * 1e6, VibeX: 20, VibeY: 20, VibeZ: 35, Clip0: 0, Clip1: 0, Clip2: 0 }));
    expect(runHealthChecks(makeLog({ VIBE: rows })).find((r) => r.id === 'vibration')!.status).toBe('warn');
  });

  it('treats clip counters as running totals, not per-row increments', () => {
    const rows = Array.from({ length: 50 }, (_, i) => makeMsg('VIBE', i * 1e6, { TimeUS: i * 1e6, VibeX: 5, VibeY: 5, VibeZ: 5, Clip0: 0, Clip1: 0, Clip2: 0 }));
    expect(runHealthChecks(makeLog({ VIBE: rows })).find((r) => r.id === 'vibration')!.status).toBe('pass');
    const clipped = rows.map((r, i) => (i >= 40 ? makeMsg('VIBE', r.timeUs, { ...r.fields, Clip0: 3 }) : r));
    const v = runHealthChecks(makeLog({ VIBE: clipped })).find((r) => r.id === 'vibration')!;
    expect(v.status).toBe('fail');
    expect(v.summary).toContain('3 clipping');
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

  it('reads EKF3 XKF4 rows, judging the primary core by the 0.8 variance threshold', () => {
    const rows = [];
    for (let i = 0; i < 10; i++) {
      rows.push(makeMsg('XKF4', i * 1e6, { C: 0, SV: 0.05, SP: 0.04, SH: 0.1 }));
      rows.push(makeMsg('XKF4', i * 1e6, { C: 1, SV: 5, SP: 5, SH: 5 }));
    }
    const ekf = runHealthChecks(makeLog({ XKF4: rows })).find((r) => r.id === 'ekf');
    expect(ekf!.status).toBe('pass');
    expect(ekf!.explorerPreset?.types).toEqual(['XKF4']);
  });

  it('does not fail an EKF2 log only because the variances are non-zero', () => {
    const rows = Array.from({ length: 20 }, (_, i) => makeMsg('NKF4', i * 1e6, { SV: 0.1, SP: 0.2, SH: 0.1 }));
    expect(runHealthChecks(makeLog({ NKF4: rows })).find((r) => r.id === 'ekf')!.status).toBe('pass');
  });

  it('fails when variance stays above the EKF failsafe threshold', () => {
    const rows = Array.from({ length: 20 }, (_, i) => makeMsg('XKF4', i * 1e6, { C: 0, SV: 1.4, SP: 0.2, SH: 0.1 }));
    expect(runHealthChecks(makeLog({ XKF4: rows })).find((r) => r.id === 'ekf')!.status).toBe('fail');
  });
});

describe('time format', () => {
  it('formats elapsed time as zero padded HH:MM:SS', async () => {
    const { formatElapsed } = await import('../time-format.js');
    expect(formatElapsed(320.8)).toBe('00:05:21');
    expect(formatElapsed(3144)).toBe('00:52:24');
    expect(formatElapsed(3 * 3600 + 5)).toBe('03:00:05');
  });

  it('turns GPS week and time of week into a wall clock offset', async () => {
    const { wallClockOffsetMs } = await import('../time-format.js');
    // GPS week 2395 (about Nov 2025), 12 h into the week, seen at log time 100 s
    const off = wallClockOffsetMs(100e6, 2395, 12 * 3600 * 1000)!;
    const utc = new Date(off + 100e3);
    expect(utc.getUTCFullYear()).toBe(2025);
    expect(wallClockOffsetMs(0, 0, 0)).toBeNull();
  });

  it('shows the wall clock next to elapsed time when the log has GPS time', () => {
    const gps = [makeMsg('GPS', 10e6, { TimeUS: 10e6, Status: 3, GWk: 2395, GMS: 43_200_000 })];
    const log = makeLog({ GPS: gps, ERR: [makeMsg('ERR', 70e6, { TimeUS: 70e6, Subsys: 5, ECode: 1 })] });
    const fs = runHealthChecks(log).find((r) => r.id === 'failsafe')!;
    expect(fs.details).toMatch(/Radio failsafe at 00:01:10 \(\d\d:\d\d:\d\d\)/);
  });
});
