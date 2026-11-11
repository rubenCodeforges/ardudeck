import { describe, expect, it } from 'vitest';
import { CARTO_ATTRIBUTION, layerAttribution, MAP_LAYERS } from './map-layers';

describe('map credits', () => {
  it('credits CARTO only while a Carto key serves the dark style', () => {
    expect(layerAttribution('dark', true)).toBe(CARTO_ATTRIBUTION);
    expect(layerAttribution('dark', false)).toContain('Esri');
    expect(layerAttribution('osm', true)).toBe('© OpenStreetMap contributors');
  });
  it('gives every base layer a credit', () => {
    for (const key of ['osm', 'satellite', 'googleSat', 'googleHybrid', 'bingSat', 'bingHybrid', 'terrain', 'dark', 'tiandituVec', 'tiandituImg', 'tiandituHybrid'] as const) {
      expect(MAP_LAYERS[key].attribution, key).toBeTruthy();
    }
  });
});
