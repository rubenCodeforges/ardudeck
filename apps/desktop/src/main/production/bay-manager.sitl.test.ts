// Needs SITL_BIN: two SITL boards as two bays, through prepare, calibration, QA and certificate.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { mkdtempSync, copyFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';

const HOME = mkdtempSync(join(tmpdir(), 'bay-mgr-home-'));

vi.mock('electron', () => ({
  app: { getPath: () => HOME, getVersion: () => '0.1.2' },
  safeStorage: { encryptString: (s: string) => Buffer.from(s), decryptString: (b: Buffer) => b.toString() },
  shell: { openPath: vi.fn() },
  BrowserWindow: class {},
}));
vi.mock('electron-store', () => ({
  default: class {
    private data: Record<string, unknown>;
    constructor(opts?: { defaults?: Record<string, unknown> }) {
      this.data = JSON.parse(JSON.stringify(opts?.defaults ?? {}));
    }
    get(k: string) { return this.data[k]; }
    set(k: string, v: unknown) { this.data[k] = v; }
    delete(k: string) { delete this.data[k]; }
  },
}));

const SITL_BIN = process.env.SITL_BIN;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!SITL_BIN)('BayManager with two SITL bays', () => {
  const procs: ChildProcess[] = [];
  let manager: import('./bay-manager').BayManager;
  let states: import('../../shared/production-bay-types').BayState[] = [];
  let records: typeof import('../fleet-repo/production-records');
  const A = 'tcp:127.0.0.1:5830';
  const B = 'tcp:127.0.0.1:5840';
  let modelId = '';

  const bay = (id: string) => states.find((s) => s.id === id)!;
  const until = async (pred: () => boolean, ms: number) => {
    const end = Date.now() + ms;
    while (Date.now() < end && !pred()) await sleep(100);
    return pred();
  };

  beforeAll(async () => {
    for (const instance of [7, 8]) {
      const dir = mkdtempSync(join(tmpdir(), `bay-mgr-sitl${instance}-`));
      copyFileSync(join(dirname(SITL_BIN!), 'defaults.parm'), join(dir, 'defaults.parm'));
      const out = process.env.BAY_DEBUG ? require('fs').openSync(join(dir, 'sitl.log'), 'w') : 'ignore';
      if (process.env.BAY_DEBUG) console.log('SITL', instance, dir);
      const proc = spawn(SITL_BIN!, ['--model', 'quad', `-I${instance}`, '--home', '52.0,5.0,10,0', '--defaults', 'defaults.parm', '--speedup', '1'], { cwd: dir, stdio: ['ignore', out, out], detached: true });
      proc.on('exit', (code, sig) => { if (process.env.BAY_DEBUG) console.log('SITL', instance, 'exited', code, sig); });
      procs.push(proc);
    }
    await sleep(2500);
    records = await import('../fleet-repo/production-records');
    const { BayManager } = await import('./bay-manager');
    manager = new BayManager({
      emit: (s) => {
        if (process.env.BAY_DEBUG) for (const b of s) {
          const prev = states.find((x) => x.id === b.id);
          if (prev?.phase !== b.phase) console.log(new Date().toISOString().slice(11, 23), b.id, b.phase, b.error ?? '');
        }
        states = s;
      },
      portsInUse: () => [],
      log: (level, msg) => { if (process.env.BAY_DEBUG) console.log(new Date().toISOString().slice(11, 23), level, msg); },
      onVaultChanged: () => undefined,
    });
    await manager.addTcp('127.0.0.1:5830');
    await manager.addTcp('127.0.0.1:5840');
    expect(await until(() => states.length === 2 && states.every((s) => s.phase === 'ready'), 60_000)).toBe(true);
  }, 90_000);

  afterAll(async () => {
    await manager?.stop();
    for (const p of procs) if (p.pid) try { process.kill(-p.pid, 'SIGKILL'); } catch { /* already gone */ }
  });

  it('captures a golden that needs a reboot cascade to apply', async () => {
    const internal = (manager as unknown as { sessions: Map<string, import('./bay-session').BaySession> }).sessions;
    const a = internal.get(A)!;
    await a.writeParams([{ id: 'BATT_MONITOR', value: 4 }, { id: 'WPNAV_SPEED', value: 820 }]);
    expect(await manager.reboot(A)).toBe(true);
    const w = await a.writeParams([{ id: 'BATT_CAPACITY', value: 5200 }]);
    expect(w.written).toBe(1);
    const model = await manager.captureGolden(A, 'Test Quad');
    modelId = model.id;
    await records.updateModelRules(modelId, { ...model.rules, requiredCalibrations: ['accel-quick', 'accel-level'] });
    const golden = await records.readModel(modelId);
    expect(golden?.golden.find((p) => p.id === 'BATT_CAPACITY')?.value).toBe(5200);
  }, 90_000);

  it('prepares both bays in parallel to the golden, through the reboot cascade', async () => {
    manager.setModelForAll(modelId);
    const [ra, rb] = await Promise.all([manager.prepare(A, modelId, true), manager.prepare(B, modelId, true)]);
    expect(rb.reset).toBe(true);
    expect(rb.ok, JSON.stringify(rb)).toBe(true);
    expect(ra.ok, JSON.stringify(ra)).toBe(true);
    const preview = await manager.previewGolden(B, modelId);
    expect(preview.deltas).toEqual([]);
  }, 240_000);

  it('blocks QA until calibrated and persisted, then certifies', async () => {
    let qa = await manager.runQa(B, modelId, 'TQ-0001');
    expect(qa.passed).toBe(false);
    expect(qa.checks.find((c) => c.id === 'cal:accel-quick')?.code).toBe('calMissing');

    for (const type of ['accel-quick', 'accel-level'] as const) {
      expect((await manager.startCalibration(B, type)).success).toBe(true);
      expect(await until(() => bay(B).phase === 'ready' && bay(B).lastCalResult?.type === type, 30_000)).toBe(true);
      expect(bay(B).lastCalResult?.success, JSON.stringify(bay(B).lastCalResult)).toBe(true);
    }
    qa = await manager.runQa(B, modelId, 'TQ-0001');
    expect(qa.checks.find((c) => c.id === 'cal:accel-quick')?.code).toBe('calNeedsReboot');

    expect(await manager.reboot(B)).toBe(true);
    expect(await until(() => bay(B).sensors !== null, 5000)).toBe(true);
    qa = await manager.runQa(B, modelId, 'TQ-0001');
    expect(qa.passed, JSON.stringify(qa.checks.filter((c) => c.status === 'fail'))).toBe(true);

    const { run } = await manager.submit(B, modelId, 'TQ-0001', 'Line operator', undefined, 'station-1');
    expect(run.passed).toBe(true);
    const uid = bay(B).boardUid!;
    const cert = await records.readCertificate(uid);
    expect(cert?.serial).toBe('TQ-0001');
    expect(cert?.qa.passed).toBe(true);
    expect(cert?.calibrations.map((c) => c.type).sort()).toEqual(['accel-level', 'accel-quick']);
    const repo = join(HOME, '.ardudeck', 'fleet-repo');
    expect(readFileSync(join(repo, 'units', uid, 'params.param'), 'utf-8')).toContain('BATT_CAPACITY');
  }, 180_000);

  it('refuses a serial that already shipped on another board', async () => {
    const qa = await manager.runQa(A, modelId, 'TQ-0001');
    expect(qa.checks.find((c) => c.id === 'serial')?.code).toBe('serialTaken');
    const { run } = await manager.submit(A, modelId, 'TQ-0001', 'Line operator', undefined, 'station-1');
    expect(run.passed).toBe(false);
    const runs = await records.listRuns();
    expect(runs.map((r) => r.passed)).toEqual([false, true]);
  }, 60_000);
});
