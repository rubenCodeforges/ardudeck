import { describe, it, expect, beforeEach } from 'vitest';
import { useFenceStore } from './fence-store';

describe('fence-store vertex removal', () => {
  beforeEach(() => {
    // Reset fence store and add a test polygon
    useFenceStore.setState({
      polygons: [],
      circles: [],
      returnPoint: null,
      isDirty: false,
      selectedFenceId: null,
    });
  });

  function addTestPolygon(vertexCount: number) {
    const vertices = Array.from({ length: vertexCount }, (_, i) => ({
      seq: i,
      lat: -35.36 + i * 0.001,
      lon: 149.16 + i * 0.001,
    }));
    useFenceStore.setState({
      polygons: [{ id: 'test-polygon', type: 'inclusion', vertices }],
    });
  }

  it('removes a vertex from polygon with more than 3 vertices', () => {
    addTestPolygon(5);
    useFenceStore.getState().removeVertexFromPolygon('test-polygon', 2);

    const polygon = useFenceStore.getState().polygons[0];
    expect(polygon!.vertices).toHaveLength(4);
  });

  it('does not remove vertex when polygon has exactly 3 vertices', () => {
    addTestPolygon(3);
    useFenceStore.getState().removeVertexFromPolygon('test-polygon', 0);

    const polygon = useFenceStore.getState().polygons[0];
    expect(polygon!.vertices).toHaveLength(3);
  });

  it('renumbers seq values after removal', () => {
    addTestPolygon(5);
    useFenceStore.getState().removeVertexFromPolygon('test-polygon', 1);

    const polygon = useFenceStore.getState().polygons[0];
    polygon!.vertices.forEach((v, i) => {
      expect(v.seq).toBe(i);
    });
  });

  it('marks store as dirty after removal', () => {
    addTestPolygon(5);
    useFenceStore.setState({ isDirty: false });
    useFenceStore.getState().removeVertexFromPolygon('test-polygon', 0);

    expect(useFenceStore.getState().isDirty).toBe(true);
  });

  it('does not affect other polygons', () => {
    useFenceStore.setState({
      polygons: [
        {
          id: 'polygon-a',
          type: 'inclusion',
          vertices: [
            { seq: 0, lat: -35.36, lon: 149.16 },
            { seq: 1, lat: -35.37, lon: 149.16 },
            { seq: 2, lat: -35.37, lon: 149.17 },
            { seq: 3, lat: -35.36, lon: 149.17 },
          ],
        },
        {
          id: 'polygon-b',
          type: 'exclusion',
          vertices: [
            { seq: 0, lat: -35.38, lon: 149.18 },
            { seq: 1, lat: -35.39, lon: 149.18 },
            { seq: 2, lat: -35.39, lon: 149.19 },
          ],
        },
      ],
    });

    useFenceStore.getState().removeVertexFromPolygon('polygon-a', 2);

    const polygons = useFenceStore.getState().polygons;
    expect(polygons[0]!.vertices).toHaveLength(3);
    expect(polygons[1]!.vertices).toHaveLength(3); // Unchanged
  });

  it('removes the correct vertex by index', () => {
    addTestPolygon(4);
    const originalVertex2 = useFenceStore.getState().polygons[0]!.vertices[2]!;
    const originalLat = originalVertex2.lat;

    useFenceStore.getState().removeVertexFromPolygon('test-polygon', 2);

    const polygon = useFenceStore.getState().polygons[0]!;
    // No remaining vertex should have the removed vertex's original lat
    const hasRemovedLat = polygon.vertices.some((v) => v.lat === originalLat);
    expect(hasRemovedLat).toBe(false);
  });
});
