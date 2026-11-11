import { describe, it, expect } from 'vitest';
import { tileToQuadkey, resolveTileUrl, resolveLayerTileUrl, getMapLibreTileUrl, MAP_LAYERS } from '../map-layers';

describe('Bing quadkey tiles', () => {
  it('computes quadkeys per the Bing tile system reference', () => {
    // Worked example from Microsoft's Bing Tile System docs
    expect(tileToQuadkey(3, 3, 5)).toBe('213');
    expect(tileToQuadkey(1, 0, 0)).toBe('0');
    expect(tileToQuadkey(1, 1, 1)).toBe('3');
    expect(tileToQuadkey(2, 3, 0)).toBe('11');
  });

  it('resolves bingSat URLs with quadkey and rotated subdomain', () => {
    const url = resolveTileUrl('bingSat', 3, 3, 5);
    expect(url).toBe('https://ecn.t0.tiles.virtualearth.net/tiles/a213.jpeg?g=14364&n=z');
  });

  it('leaves z/x/y layers untouched by the quadkey path', () => {
    expect(resolveTileUrl('googleSat', 3, 3, 5)).toBe('https://mt0.google.com/vt/lyrs=s&x=3&y=5&z=3');
  });

  it('emits the MapLibre-native {quadkey} token for MapLibre consumers', () => {
    expect(getMapLibreTileUrl('bingSat')).toBe('https://ecn.t0.tiles.virtualearth.net/tiles/a{quadkey}.jpeg?g=14364&n=z');
  });
});

describe('Tianditu WMTS tiles', () => {
  it('fills the {key} token and the WMTS tile indices from z/x/y', () => {
    // x + y = 3 -> subdomain t3; the key is url-encoded so odd characters survive.
    const url = resolveLayerTileUrl(MAP_LAYERS.tiandituImg, 3, 2, 1, 'a b/c');
    expect(url).toMatch(/^https:\/\/t3\.tianditu\.gov\.cn\/img_w\/wmts\?/);
    expect(url).toContain('TILEMATRIX=3');
    expect(url).toContain('TILEROW=1');
    expect(url).toContain('TILECOL=2');
    expect(url).toContain('tk=a%20b%2Fc');
  });

  it('leaves the {key} token in place when no key is stored, so the tile-cache serves blanks', () => {
    expect(resolveLayerTileUrl(MAP_LAYERS.tiandituImg, 3, 2, 1)).toContain('tk={key}');
  });

  it('sends a browser User-Agent, which browser-side keys require (301012 otherwise)', () => {
    for (const key of ['tiandituVec', 'tiandituImg', 'tiandituHybrid'] as const) {
      expect(MAP_LAYERS[key].headers['User-Agent'], key).toContain('Mozilla/5.0');
    }
  });
});
