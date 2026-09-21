// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

const KEY = 'map-instrument-layouts';

async function loadStoredLayouts(raw: unknown) {
  localStorage.setItem(KEY, JSON.stringify(raw));
  vi.resetModules();
  const mod = await import('./map-instruments-store');
  return mod.useMapInstrumentsStore.getState().savedLayouts;
}

describe('saved layout display modes', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // A variant id the registry owns ('used' = the battery + consumption gauge)
  // used to be dropped here, so the choice reverted to analog on next launch.
  it('keeps a registry variant id across a reload', async () => {
    const layouts = await loadStoredLayouts({
      Pilot: { visible: { battery: true }, scale: {}, opacity: 1, displayMode: { battery: 'used' }, positions: {} },
    });
    expect(layouts.Pilot?.displayMode?.battery).toBe('used');
  });

  it('still keeps the built-in modes', async () => {
    const layouts = await loadStoredLayouts({
      Strips: { visible: {}, scale: {}, opacity: 1, displayMode: { gps: 'strip', speed: 'numeric' }, positions: {} },
    });
    expect(layouts.Strips?.displayMode).toEqual({ gps: 'strip', speed: 'numeric' });
  });

  it('drops a mode no instrument registers', async () => {
    const layouts = await loadStoredLayouts({
      Bad: { visible: {}, scale: {}, opacity: 1, displayMode: { battery: 'hologram' }, positions: {} },
    });
    expect(layouts.Bad?.displayMode).toEqual({});
  });
});
