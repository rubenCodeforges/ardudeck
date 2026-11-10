// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

const KEY = 'map-instrument-layouts';
// Every test re-imports the store and the instrument registry from cold; under the full parallel run that can pass 5 s.
const COLD_IMPORT_TIMEOUT_MS = 20_000;

async function loadStoredLayouts(raw: unknown) {
  localStorage.setItem(KEY, JSON.stringify(raw));
  vi.resetModules();
  const mod = await import('./map-instruments-store');
  return mod.useMapInstrumentsStore.getState().savedLayouts;
}

describe('saved layout display modes', { timeout: COLD_IMPORT_TIMEOUT_MS }, () => {
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

  // Proximity was a rangefinder display variant; such a layout now means the proximity gauge.
  it('migrates a rangefinder shown in proximity mode to the proximity instrument', async () => {
    const layouts = await loadStoredLayouts({
      Old: {
        visible: { rangefinder: true },
        scale: { rangefinder: 1.2 },
        opacity: 1,
        displayMode: { rangefinder: 'proximity', gps: 'strip' },
        groups: { g1: { members: ['rangefinder', 'gps'], orientation: 'row' } },
        positions: { 'instrument:rangefinder': { v: 4 } },
      },
    });
    const old = layouts.Old!;
    expect(old.visible).toEqual({ rangefinder: false, proximity: true });
    expect(old.scale).toEqual({ proximity: 1.2 });
    expect(old.displayMode).toEqual({ gps: 'strip' });
    expect(old.groups?.g1?.members).toEqual(['proximity', 'gps']);
    expect(old.positions).toEqual({ 'instrument:proximity': { v: 4 } });
  });

  it('leaves a rangefinder in its own analog mode alone', async () => {
    const layouts = await loadStoredLayouts({
      Rf: { visible: { rangefinder: true }, scale: {}, opacity: 1, displayMode: {}, positions: {} },
    });
    expect(layouts.Rf?.visible).toEqual({ rangefinder: true });
  });
});

describe('main store proximity migration', { timeout: COLD_IMPORT_TIMEOUT_MS }, () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('moves the visible flag and drag position to the proximity id', async () => {
    localStorage.setItem('map-instruments-visible', JSON.stringify({
      visible: { rangefinder: true }, scale: {}, opacity: 1, instrumentOpacity: {}, displayMode: { rangefinder: 'proximity' }, groups: {},
    }));
    localStorage.setItem('map-overlay-pos:instrument:rangefinder', JSON.stringify({ v: 4, ax: 0, ay: 0, dx: 10, dy: 20 }));
    vi.resetModules();
    const mod = await import('./map-instruments-store');
    const s = mod.useMapInstrumentsStore.getState();
    expect(mod.resolveInstrumentVisible(s.visible, 'proximity')).toBe(true);
    expect(mod.resolveInstrumentVisible(s.visible, 'rangefinder')).toBe(false);
    expect(s.displayMode).toEqual({});
    expect(localStorage.getItem('map-overlay-pos:instrument:proximity')).not.toBeNull();
    expect(JSON.parse(localStorage.getItem('map-instruments-visible')!).displayMode).toEqual({});
  });
});
