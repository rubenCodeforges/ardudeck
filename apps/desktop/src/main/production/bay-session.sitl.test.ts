// Needs SITL_BIN (arducopter SITL binary): proves the bay session against real firmware.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { mkdtempSync, copyFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { TcpTransport } from '@ardudeck/comms';
import { BaySession } from './bay-session';
import type { CalibrationRecordIpc } from '../../shared/calibration-quality';
import { verifyCalibrationPersisted } from '../../shared/calibration-quality';
import type { BayState } from '../../shared/production-bay-types';

const SITL_BIN = process.env.SITL_BIN;
const INSTANCE = 9;
const PORT = 5760 + 10 * INSTANCE;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(pred: () => boolean, timeoutMs: number): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (pred()) return true;
    await sleep(100);
  }
  return pred();
}

describe.skipIf(!SITL_BIN)('BaySession against SITL', () => {
  let sitl: ChildProcess;
  let session: BaySession;
  let state: BayState;
  const records = new Map<string, CalibrationRecordIpc[]>();

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bay-sitl-'));
    copyFileSync(join(dirname(SITL_BIN!), 'defaults.parm'), join(dir, 'defaults.parm'));
    sitl = spawn(SITL_BIN!, ['--model', 'quad', `-I${INSTANCE}`, '--home', '52.0,5.0,10,0', '--defaults', 'defaults.parm', '--speedup', '1'], {
      cwd: dir,
      stdio: 'ignore',
    });
    await sleep(2500);
    session = new BaySession('bay-test', `tcp:127.0.0.1:${PORT}`, {
      openTransport: async () => new TcpTransport({ host: '127.0.0.1', port: PORT }),
      onState: (s) => { state = s; },
      log: () => undefined,
      records: {
        save: (uid, r) => records.set(uid, [r, ...(records.get(uid) ?? []).filter((x) => x.type !== r.type)]),
        list: (uid) => records.get(uid) ?? [],
        verify: async (uid, read) => {
          const list = records.get(uid) ?? [];
          const names = [...new Set(list.flatMap((r) => Object.keys(r.written)))];
          if (names.length === 0) return list;
          const back = await read(names);
          const next = list.map((r) => (r.persistence ? r : { ...r, persistence: { ...verifyCalibrationPersisted(r.written, back), checkedAt: Date.now() } }));
          records.set(uid, next);
          return next;
        },
      },
      text: (key) => key,
    });
    await session.start();
  }, 60_000);

  afterAll(async () => {
    await session?.close();
    sitl?.kill('SIGKILL');
  });

  it('identifies the board and downloads every parameter', () => {
    expect(state.phase).toBe('ready');
    expect(state.firmware).toBe('ardupilot');
    expect(state.firmwareVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(state.boardUid).toMatch(/^sitl-/);
    expect(state.paramTotal).toBeGreaterThan(500);
    expect(state.paramCount).toBe(state.paramTotal);
    expect(session.getParams().get('FRAME_CLASS')).toBe(1);
  });

  it('writes parameters with confirmation and reports unknown names', async () => {
    const res = await session.writeParams([
      { id: 'ATC_RAT_RLL_P', value: 0.17 },
      { id: 'WPNAV_SPEED', value: 750 },
      { id: 'NOT_A_PARAM', value: 1 },
    ]);
    expect(res).toEqual({ written: 2, failed: [], missing: ['NOT_A_PARAM'] });
    const back = await session.readParams(['ATC_RAT_RLL_P', 'WPNAV_SPEED']);
    expect(back.WPNAV_SPEED).toBe(750);
    expect(Math.fround(back.ATC_RAT_RLL_P!)).toBe(Math.fround(0.17));
  }, 30_000);

  it('gets sensor health from SYS_STATUS', async () => {
    expect(await until(() => state.sensors !== null, 5000)).toBe(true);
  });

  it('runs accel then level calibration and records what each wrote', async () => {
    for (const type of ['accel-quick', 'accel-level'] as const) {
      const res = await session.startCalibration(type);
      expect(res.success, res.error).toBe(true);
      expect(await until(() => state.phase === 'ready' && state.lastCalResult?.type === type, 30_000)).toBe(true);
      expect(state.lastCalResult?.success, JSON.stringify(state.lastCalResult)).toBe(true);
      expect(records.get(state.boardUid!)?.some((r) => r.type === type)).toBe(true);
    }
  }, 80_000);

  it('reboots, comes back, keeps written params and proves the calibration persisted', async () => {
    expect(await session.reboot()).toBe(true);
    expect(state.phase).toBe('ready');
    expect(session.getParams().get('WPNAV_SPEED')).toBe(750);
    for (const type of ['accel-quick', 'accel-level']) {
      expect(state.records.find((r) => r.type === type)?.persistence?.state, type).toBe('verified');
    }
  }, 90_000);

  it('resets every parameter to defaults', async () => {
    expect(await session.resetToDefaults()).toBe(true);
    expect(state.phase).toBe('ready');
    expect(session.getParams().get('WPNAV_SPEED')).not.toBe(750);
  }, 90_000);
});
