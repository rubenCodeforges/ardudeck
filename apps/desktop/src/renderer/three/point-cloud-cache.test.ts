import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

const loads: string[] = [];
const disposed: string[] = [];

vi.mock('three/examples/jsm/loaders/PLYLoader.js', () => ({
  PLYLoader: class {
    loadAsync(url: string) {
      loads.push(url);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 2, 4, -6], 3));
      if (url.includes('rgb')) g.setAttribute('color', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0], 3));
      g.dispose = () => { disposed.push(url); };
      return Promise.resolve(g);
    }
  },
}));

import { createPointCloudObject, DEFAULT_POINT_SIZE_PX, loadPointCloudGeometry, releasePointCloud } from './point-cloud-cache';

describe('point-cloud-cache', () => {
  it('loads once per url and version and frees the geometry when the last user releases', async () => {
    const a = await loadPointCloudGeometry('u://rgb.ply', 1);
    const b = await loadPointCloudGeometry('u://rgb.ply', 1);
    expect(a).toBe(b);
    expect(a.boundingBox?.max.toArray()).toEqual([2, 4, 0]);
    await loadPointCloudGeometry('u://rgb.ply', 2);
    expect(loads).toEqual(['u://rgb.ply', 'u://rgb.ply']);
    await releasePointCloud('u://rgb.ply', 1);
    expect(disposed).toEqual([]);
    await releasePointCloud('u://rgb.ply', 1);
    expect(disposed).toEqual(['u://rgb.ply']);
    await releasePointCloud('u://rgb.ply', 1);
    expect(disposed).toHaveLength(1);
  });

  it('draws fixed-size points, coloured per vertex when the file has colours', async () => {
    const rgb = createPointCloudObject(await loadPointCloudGeometry('u://rgb.ply', 3), 4);
    const mat = rgb.material as THREE.PointsMaterial;
    expect(mat.vertexColors).toBe(true);
    expect(mat.sizeAttenuation).toBe(false);
    expect(rgb.userData.pointSizePx).toBe(4);
    const plain = createPointCloudObject(await loadPointCloudGeometry('u://plain.ply', 1));
    expect((plain.material as THREE.PointsMaterial).vertexColors).toBe(false);
    expect(plain.userData.pointSizePx).toBe(DEFAULT_POINT_SIZE_PX);
    const renderer = {
      domElement: { clientWidth: 800 },
      getPixelRatio: () => 1,
      getContext: () => ({ drawingBufferWidth: 1600 }),
    } as unknown as THREE.WebGLRenderer;
    plain.onBeforeRender(renderer, new THREE.Scene(), new THREE.Camera(), plain.geometry, plain.material as THREE.Material, null as never);
    expect((plain.material as THREE.PointsMaterial).size).toBe(4);
  });
});
