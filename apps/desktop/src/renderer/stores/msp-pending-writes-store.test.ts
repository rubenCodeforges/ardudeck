import { describe, it, expect, beforeEach, vi } from 'vitest';
import { usePendingWritesStore, pendingDraft, writeAllPending } from './msp-pending-writes-store';

const store = () => usePendingWritesStore.getState();

describe('pending config writes', () => {
  beforeEach(() => store().clearAll());

  it('keeps a tab draft after the tab is gone, for the global save and a remount', () => {
    store().put('navigation', { label: 'Navigation', draft: { rthAltitude: 5000 }, write: async () => true });
    expect(pendingDraft<{ rthAltitude: number }>('navigation')?.rthAltitude).toBe(5000);
  });

  it('writes every pending tab with its draft and drops the ones that succeeded', async () => {
    const nav = vi.fn(async () => true);
    const vtx = vi.fn(async () => true);
    store().put('navigation', { label: 'Navigation', draft: { a: 1 }, write: nav });
    store().put('vtx', { label: 'VTX', draft: { b: 2 }, write: vtx });

    const r = await writeAllPending();

    expect(nav).toHaveBeenCalledWith({ a: 1 });
    expect(vtx).toHaveBeenCalledWith({ b: 2 });
    expect(r).toEqual({ failed: [], reasons: {}, wrote: 2, needsReboot: false });
    expect(store().pending).toEqual({});
  });

  it('reports a rejected write by name and keeps it for a retry', async () => {
    store().put('servo-mixer', { label: 'Servo Mixer', draft: {}, write: async () => false });
    store().put('safety', { label: 'Safety', draft: {}, write: async () => { throw new Error('timeout'); } });
    store().put('vtx', { label: 'VTX', draft: {}, write: async () => true });

    const r = await writeAllPending();

    expect(r.failed).toEqual(['Servo Mixer', 'Safety']);
    expect(r.wrote).toBe(1);
    expect(Object.keys(store().pending).sort()).toEqual(['safety', 'servo-mixer']);
  });

  it('attaches the reason a write was refused, asked right after that write', async () => {
    store().put('navigation', { label: 'Navigation', draft: {}, write: async () => false });
    store().put('vtx', { label: 'VTX', draft: {}, write: async () => true });
    const explain = vi.fn(async () => 'nav_land_maxalt_vspd = 50 is outside the allowed range 100 to 2000');
    const r = await writeAllPending(explain);
    expect(explain).toHaveBeenCalledTimes(1);
    expect(r.reasons).toEqual({ Navigation: 'nav_land_maxalt_vspd = 50 is outside the allowed range 100 to 2000' });
  });

  it('asks for a reboot only when a write that needs one went through', async () => {
    store().put('motor-mixer', { label: 'Motor Mixer', draft: [], write: async () => true, needsReboot: true });
    expect((await writeAllPending()).needsReboot).toBe(true);

    store().put('motor-mixer', { label: 'Motor Mixer', draft: [], write: async () => false, needsReboot: true });
    expect((await writeAllPending()).needsReboot).toBe(false);
  });
});
