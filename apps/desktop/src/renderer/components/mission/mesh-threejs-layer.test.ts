import { describe, expect, it } from 'vitest';
import maplibregl from 'maplibre-gl';
import * as THREE from 'three';
import { meshLocalOffset, splitLayerCamera } from './mesh-threejs-layer';

describe('meshLocalOffset', () => {
  it('places each model by its own Mercator position and metre scale', () => {
    const ref = maplibregl.MercatorCoordinate.fromLngLat([8.47, 53.27], 0);
    const s = ref.meterInMercatorCoordinateUnits();
    const near = meshLocalOffset({ lat: 53.2691, lng: 8.4715 }, { x: ref.x, y: ref.y, s });
    expect(near.x).toBeGreaterThan(90);
    expect(near.x).toBeLessThan(110);
    expect(near.z).toBeGreaterThan(90);
    expect(near.z).toBeLessThan(110);
    expect(near.f).toBeCloseTo(1, 4);
    // 1 degree further north a metre is a larger Mercator step than at the reference
    const far = meshLocalOffset({ lat: 54.27, lng: 8.47 }, { x: ref.x, y: ref.y, s });
    expect(far.f).toBeGreaterThan(1.02);
  });
});

describe('splitLayerCamera', () => {
  it('rebuilds the same clip positions from a rigid view and a metric projection', () => {
    const projection = new THREE.Matrix4().makePerspective(-0.5, 0.5, 0.4, -0.4, 1, 5000);
    const view = new THREE.Matrix4().compose(new THREE.Vector3(3, -40, -200), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.6, 0.2, 0)), new THREE.Vector3(1, 1, 1));
    const k = 37.5;
    const full = projection.clone().multiply(new THREE.Matrix4().makeScale(k, k, k)).multiply(view);
    const split = splitLayerCamera(full, projection)!;
    const det = split.view.determinant();
    expect(Math.abs(det)).toBeCloseTo(1, 9);
    for (const p of [new THREE.Vector3(0, 0, 0), new THREE.Vector3(12, 5, -30)]) {
      const a = new THREE.Vector4(p.x, p.y, p.z, 1).applyMatrix4(full);
      const b = new THREE.Vector4(p.x, p.y, p.z, 1).applyMatrix4(split.view).applyMatrix4(split.projection);
      expect(b.x / b.w).toBeCloseTo(a.x / a.w, 9);
      expect(b.y / b.w).toBeCloseTo(a.y / a.w, 9);
      expect(b.z / b.w).toBeCloseTo(a.z / a.w, 9);
    }
  });
});
