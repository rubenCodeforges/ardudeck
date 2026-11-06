import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

const loads: string[] = [];
const disposed: string[] = [];

vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    setDRACOLoader() { return this; }
    setKTX2Loader() { return this; }
    setMeshoptDecoder() { return this; }
    load(url: string, onLoad: (g: { scene: THREE.Group }) => void) {
      loads.push(url);
      const group = new THREE.Group();
      const geometry = new THREE.BufferGeometry();
      geometry.dispose = () => { disposed.push(`geo:${url}`); };
      const material = new THREE.MeshBasicMaterial();
      material.dispose = () => { disposed.push(`mat:${url}`); };
      group.add(new THREE.Mesh(geometry, material));
      onLoad({ scene: group });
    }
  },
}));

vi.mock('three/examples/jsm/loaders/ColladaLoader.js', () => ({
  ColladaLoader: class {
    loadAsync(url: string) {
      loads.push(url);
      const scene = new THREE.Group();
      scene.rotation.set(-Math.PI / 2, 0, 0);
      scene.scale.setScalar(0.0254);
      return Promise.resolve({ scene });
    }
  },
}));

import { loadGltfScene, releaseGltf } from './gltf-cache';

describe('gltf-cache', () => {
  it('loads once per url and version, and frees GPU resources only when the last user releases', async () => {
    const url = 'ardudeck-asset://mesh/a/model.glb';
    await loadGltfScene(url, 1);
    await loadGltfScene(url, 1);
    expect(loads).toEqual([url]);
    await loadGltfScene(url, 2);
    expect(loads).toHaveLength(2);

    await releaseGltf(url, 1);
    expect(disposed).toEqual([]);
    await releaseGltf(url, 1);
    expect(disposed).toEqual([`geo:${url}`, `mat:${url}`]);

    await loadGltfScene(url, 1);
    expect(loads).toHaveLength(3);
  });

  it('wraps each clone so the source root keeps its own transform', async () => {
    const g = await loadGltfScene('ardudeck-asset://mesh/b/model.dae', 0);
    expect(g.rotation.x).toBe(0);
    expect(g.children[0]!.rotation.x).toBeCloseTo(-Math.PI / 2, 9);
    expect(g.children[0]!.scale.x).toBeCloseTo(0.0254, 9);
  });
});
