import { describe, it, expect, beforeEach } from 'vitest';
import {
  basemapTileRequest,
  listBasemaps,
  registerBasemap,
  subscribeBasemaps,
  unregisterBasemap,
  unregisterBasemapsFor,
} from './basemap-registry';
import { compactBasemaps } from '../../renderer/stores/basemap-store';

const TDT = {
  id: 'img',
  name: 'Tianditu imagery',
  attribution: '© Tianditu',
  base: { url: 'https://t{s}.tianditu.gov.cn/img_w/wmts?TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=SECRET', subdomains: ['0', '1'] },
  labels: { url: 'https://t{s}.tianditu.gov.cn/cia_w/wmts?TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=SECRET', subdomains: ['0', '1'] },
  maxNativeZoom: 18,
  primary: true,
};

describe('basemap registry', () => {
  beforeEach(() => {
    for (const b of listBasemaps()) unregisterBasemapsFor(b.slug);
  });

  it('never exposes the provider url or key to the renderer', () => {
    const info = registerBasemap('com.x.tdt', TDT);
    expect(JSON.stringify(listBasemaps())).not.toContain('SECRET');
    expect(info.key).toMatch(/^mb-[0-9a-f]{16}$/);
    expect(info.labelsKey).toMatch(/^mbl-[0-9a-f]{16}$/);
    expect(info.maxZoom).toBe(22);
  });

  it('keeps the same layer name across registrations, so the cache and the saved choice survive restarts', () => {
    const a = registerBasemap('com.x.tdt', TDT).key;
    unregisterBasemap('com.x.tdt', 'img');
    expect(registerBasemap('com.x.tdt', TDT).key).toBe(a);
  });

  it('builds the tile request with subdomain rotation for base and labels', () => {
    const info = registerBasemap('com.x.tdt', TDT);
    expect(basemapTileRequest(info.key, 5, 3, 4)?.url).toBe('https://t1.tianditu.gov.cn/img_w/wmts?TILEMATRIX=5&TILEROW=4&TILECOL=3&tk=SECRET');
    expect(basemapTileRequest(info.labelsKey!, 5, 2, 4)?.url).toContain('https://t0.tianditu.gov.cn/cia_w/');
    expect(basemapTileRequest('mb-unknown', 1, 1, 1)).toBeNull();
  });

  it('resolves Bing-style quadkeys', () => {
    const info = registerBasemap('com.x.q', { id: 'q', name: 'Q', base: { url: 'https://example.com/t/{q}.jpeg' } });
    expect(basemapTileRequest(info.key, 3, 3, 5)?.url).toBe('https://example.com/t/213.jpeg');
  });

  it('rejects unusable registrations', () => {
    expect(() => registerBasemap('s', { id: 'a', name: 'A', base: { url: 'file:///etc/{z}/{x}/{y}' } })).toThrow(/http/);
    expect(() => registerBasemap('s', { id: 'a', name: 'A', base: { url: 'https://x/{z}/{x}' } })).toThrow(/\{z\}/);
    expect(() => registerBasemap('s', { id: 'a', name: 'A', base: { url: 'https://{s}.x/{z}/{x}/{y}' } })).toThrow(/subdomains/);
    expect(() => registerBasemap('s', { id: 'a', name: '', base: { url: 'https://x/{z}/{x}/{y}' } })).toThrow(/name/);
  });

  it('drops every layer of a cargo on unload and tells subscribers', () => {
    let calls = 0;
    const off = subscribeBasemaps(() => calls++);
    const info = registerBasemap('com.x.tdt', TDT);
    registerBasemap('com.x.tdt', { ...TDT, id: 'vec', primary: false });
    unregisterBasemapsFor('com.x.tdt');
    off();
    expect(listBasemaps()).toEqual([]);
    expect(basemapTileRequest(info.key, 1, 0, 0)).toBeNull();
    expect(calls).toBe(3);
  });

  it('gives compact pickers one row per cargo, the primary one', () => {
    registerBasemap('com.x.tdt', { ...TDT, id: 'vec', name: 'Vector', primary: false });
    registerBasemap('com.x.tdt', TDT);
    registerBasemap('com.y.other', { id: 'o', name: 'Other', base: { url: 'https://x/{z}/{x}/{y}' } });
    expect(compactBasemaps(listBasemaps()).map((b) => b.name)).toEqual(['Tianditu imagery', 'Other']);
  });
});
