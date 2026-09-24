import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { MapFeature, MapLayerRegistration } from '@ardudeck/module-sdk';
import {
  registerModuleMapLayer,
  unregisterModuleMapLayer,
  unregisterModuleMapLayersFor,
  getModuleMapLayers,
  subscribeModuleMapLayers,
  featuresOf,
  isLayerVisible,
  setLayerVisible,
} from '../module-map-registry';

const SLUG = 'com.example.test';
const OTHER = 'com.example.other';

const poly: MapFeature = {
  kind: 'polygon',
  points: [
    { lat: 52.5, lng: 13.4 },
    { lat: 52.5, lng: 13.41 },
    { lat: 52.51, lng: 13.41 },
  ],
  stroke: '#22C55E',
};

function layer(id: string, extra: Partial<MapLayerRegistration> = {}): MapLayerRegistration {
  return { id, name: id, features: () => [poly], ...extra };
}

beforeEach(() => {
  unregisterModuleMapLayersFor(SLUG);
  unregisterModuleMapLayersFor(OTHER);
});

describe('module map registry', () => {
  it('keeps two modules that chose the same layer id apart', () => {
    registerModuleMapLayer(SLUG, layer('volumes'));
    registerModuleMapLayer(OTHER, layer('volumes'));
    expect(getModuleMapLayers()).toHaveLength(2);

    unregisterModuleMapLayer(SLUG, 'volumes');
    const left = getModuleMapLayers();
    expect(left).toHaveLength(1);
    expect(left[0].slug).toBe(OTHER);
  });

  it('refuses to remove another module’s layer', () => {
    registerModuleMapLayer(OTHER, layer('volumes'));
    unregisterModuleMapLayer(SLUG, 'volumes');
    expect(getModuleMapLayers()).toHaveLength(1);
  });

  it('draws low order first', () => {
    registerModuleMapLayer(SLUG, layer('b', { order: 5 }));
    registerModuleMapLayer(SLUG, layer('a', { order: 1 }));
    expect(getModuleMapLayers().map((l) => l.reg.id)).toEqual(['a', 'b']);
  });

  it('replaces a re-registered id and stops the old watcher', () => {
    const stop = vi.fn();
    registerModuleMapLayer(SLUG, layer('volumes', { subscribe: () => stop }));
    registerModuleMapLayer(SLUG, layer('volumes'));

    expect(stop).toHaveBeenCalledTimes(1);
    expect(getModuleMapLayers()).toHaveLength(1);
  });

  it('redraws when a live layer says it changed', () => {
    const seen = vi.fn();
    let fire = () => {};
    registerModuleMapLayer(
      SLUG,
      layer('volumes', {
        subscribe: (cb) => {
          fire = cb;
          return () => {};
        },
      }),
    );
    const off = subscribeModuleMapLayers(seen);
    fire();
    expect(seen).toHaveBeenCalled();
    off();
  });

  it('survives a module whose features() throws', () => {
    registerModuleMapLayer(
      SLUG,
      layer('bad', {
        features: () => {
          throw new Error('module bug');
        },
      }),
    );
    expect(featuresOf(getModuleMapLayers()[0])).toEqual([]);
  });

  it('survives a module whose subscribe() throws, keeping its static drawing', () => {
    registerModuleMapLayer(
      SLUG,
      layer('half-broken', {
        subscribe: () => {
          throw new Error('module bug');
        },
      }),
    );
    expect(getModuleMapLayers()).toHaveLength(1);
    expect(featuresOf(getModuleMapLayers()[0])).toHaveLength(1);
  });

  it('honours defaultVisible false, and the pilot’s choice afterwards', () => {
    registerModuleMapLayer(SLUG, layer('quiet', { defaultVisible: false }));
    const key = getModuleMapLayers()[0].key;
    expect(isLayerVisible(key)).toBe(false);

    setLayerVisible(key, true);
    expect(isLayerVisible(key)).toBe(true);
  });

  it('forgets visibility when the layer goes, so a reinstall starts clean', () => {
    registerModuleMapLayer(SLUG, layer('volumes'));
    const key = getModuleMapLayers()[0].key;
    setLayerVisible(key, false);
    unregisterModuleMapLayer(SLUG, 'volumes');

    registerModuleMapLayer(SLUG, layer('volumes'));
    expect(isLayerVisible(getModuleMapLayers()[0].key)).toBe(true);
  });

  it('sweeps everything a module registered on unload', () => {
    const stop = vi.fn();
    registerModuleMapLayer(SLUG, layer('a', { subscribe: () => stop }));
    registerModuleMapLayer(SLUG, layer('b'));
    registerModuleMapLayer(OTHER, layer('c'));

    unregisterModuleMapLayersFor(SLUG);

    expect(stop).toHaveBeenCalledTimes(1);
    expect(getModuleMapLayers().map((l) => l.slug)).toEqual([OTHER]);
  });

  it('rejects a layer with no id or no features', () => {
    expect(() => registerModuleMapLayer(SLUG, { name: 'x' } as MapLayerRegistration)).toThrow();
    expect(() =>
      registerModuleMapLayer(SLUG, { id: 'x', name: 'x' } as MapLayerRegistration),
    ).toThrow();
  });
});
