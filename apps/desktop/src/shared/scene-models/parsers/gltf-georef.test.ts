import { describe, expect, it } from 'vitest';
import { geodeticToEcef } from '../geodesy';
import { readGltfGeoreference } from './gltf-georef';

function glb(json: object): Uint8Array {
  const raw = new TextEncoder().encode(JSON.stringify(json));
  const len = Math.ceil(raw.length / 4) * 4;
  const out = new Uint8Array(20 + len).fill(0x20);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, out.length, true);
  dv.setUint32(12, len, true);
  dv.setUint32(16, 0x4e4f534a, true);
  out.set(raw, 20);
  return out;
}

describe('readGltfGeoreference', () => {
  const center = geodeticToEcef(52.01, 4.36, 45);
  const gltf = { asset: { version: '2.0' }, extensionsUsed: ['CESIUM_RTC'], extensions: { CESIUM_RTC: { center } } };

  it('reads CESIUM_RTC from a glb', () => {
    const g = readGltfGeoreference(glb(gltf))!;
    expect(g.lat).toBeCloseTo(52.01, 7);
    expect(g.lng).toBeCloseTo(4.36, 7);
    expect(g.hEll).toBeCloseTo(45, 3);
  });

  it('reads CESIUM_RTC from a gltf', () => {
    const g = readGltfGeoreference(new TextEncoder().encode(JSON.stringify(gltf)))!;
    expect(g.lat).toBeCloseTo(52.01, 7);
  });

  it('returns null without a georeference or for garbage', () => {
    expect(readGltfGeoreference(glb({ asset: { version: '2.0' } }))).toBeNull();
    expect(readGltfGeoreference(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});
