import { describe, expect, it } from 'vitest';
import { meshesFor, useSceneMeshStore } from './scene-mesh-store';

describe('scene-mesh-store', () => {
  it('filters by scene with both as the default', () => {
    useSceneMeshStore.setState({
      entries: [
        { slug: 'a', key: 'a::both', id: 'both', name: 'b', glb: '/b', url: 'u', origin: { lat: 0, lng: 0, altMsl: 0 } },
        { slug: 'a', key: 'a::svt', id: 'svt', name: 's', glb: '/s', url: 'u', origin: { lat: 0, lng: 0, altMsl: 0 }, scenes: ['svt'] },
      ],
      version: 1,
    });
    expect(meshesFor('svt').map((m) => m.id)).toEqual(['both', 'svt']);
    expect(meshesFor('mission3d').map((m) => m.id)).toEqual(['both']);
    expect(meshesFor('sim').map((m) => m.id)).toEqual(['both']);
    expect(meshesFor('logs').map((m) => m.id)).toEqual(['both']);
  });
});
