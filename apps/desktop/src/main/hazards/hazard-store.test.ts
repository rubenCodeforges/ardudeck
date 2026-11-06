import { mkdtemp, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import { HazardStore } from './hazard-store';
import type { Hazard } from '../../shared/hazard-types';

const tower: Hazard = {
  id: 'h1', name: 'Mast', shape: { kind: 'circle', center: { lat: 44, lon: 18 }, radiusM: 40 }, bufferM: 15, uploadAsFence: true, createdAt: 1,
};

let dir: string;
let clock: number;
const fresh = () => new HazardStore(dir, () => clock);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'hazards-'));
  clock = 1_000_000;
});

describe('HazardStore', () => {
  it('refuses to add a hazard before a PIN exists', async () => {
    expect(await fresh().add(tower)).toEqual({ success: false, error: 'no-pin' });
  });

  it('rejects a short PIN and accepts a long one, which unlocks editing', async () => {
    const s = fresh();
    expect(await s.setPin('12')).toEqual({ success: false, error: 'weak-pin' });
    expect(await s.setPin('482913')).toEqual({ success: true });
    expect(await s.add(tower)).toEqual({ success: true });
    expect(await s.list()).toHaveLength(1);
  });

  it('keeps hazards across a restart but starts locked', async () => {
    const a = fresh();
    await a.setPin('482913');
    await a.add(tower);
    const b = fresh();
    expect(await b.list()).toHaveLength(1);
    expect(await b.status()).toEqual({ hasPin: true, unlocked: false });
    expect(await b.remove('h1')).toEqual({ success: false, error: 'locked' });
    expect(await b.unlock('482913')).toEqual({ success: true });
    expect(await b.remove('h1')).toEqual({ success: true });
  });

  it('does not store the PIN in the file', async () => {
    const s = fresh();
    await s.setPin('482913');
    expect(await readFile(join(dir, 'hazards.json'), 'utf-8')).not.toContain('482913');
  });

  it('slows down after repeated wrong PINs', async () => {
    const s = fresh();
    await s.setPin('482913');
    s.relock();
    for (let i = 0; i < 4; i++) await s.unlock('000000');
    expect(await s.unlock('482913')).toEqual({ success: false, error: 'throttled' });
    clock += 60_000;
    expect(await s.unlock('482913')).toEqual({ success: true });
  });

  it('exports and imports; importing onto a PIN computer needs its PIN', async () => {
    const admin = fresh();
    await admin.setPin('482913');
    await admin.add(tower);
    const out = join(dir, 'out.ardudeck-hazards');
    await admin.exportTo(out);

    const otherDir = await mkdtemp(join(tmpdir(), 'hazards-'));
    const pilot = new HazardStore(otherDir, () => clock);
    expect(await pilot.importFrom(out)).toEqual({ success: true });
    expect(await pilot.list()).toHaveLength(1);
    expect(await pilot.add({ ...tower, id: 'h2' })).toEqual({ success: false, error: 'locked' });
    expect(await pilot.importFrom(out)).toEqual({ success: false, error: 'locked' });
    expect(await pilot.unlock('482913')).toEqual({ success: true });
    expect(await pilot.importFrom(out)).toEqual({ success: true });
  });

  it('rejects a file that is not a hazards file', async () => {
    const bad = join(dir, 'bad.json');
    await writeFile(bad, '{"x":1}');
    expect(await fresh().importFrom(bad)).toEqual({ success: false, error: 'invalid' });
  });

  it('logs an override only while unlocked', async () => {
    const s = fresh();
    await s.setPin('482913');
    expect(await s.logOverride({ hazardIds: ['h1'], mission: 'm' })).toEqual({ success: true });
    s.relock();
    expect(await s.logOverride({ hazardIds: ['h1'], mission: 'm' })).toEqual({ success: false, error: 'locked' });
    expect((await readFile(join(dir, 'hazard-overrides.jsonl'), 'utf-8')).trim().split('\n')).toHaveLength(1);
  });
});
