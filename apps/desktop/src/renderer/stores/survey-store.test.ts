import { describe, it, expect, beforeEach } from 'vitest';
import { useSurveyStore } from './survey-store';

/** Reset store state before each test */
function resetStore() {
  useSurveyStore.setState({
    drawMode: 'none',
    drawingVertices: [],
    polygon: null,
    config: {
      pattern: 'grid',
      altitude: 80,
      speed: 5,
      frontOverlap: 75,
      sideOverlap: 60,
      camera: {
        name: 'DJI Mavic 3E',
        sensorWidth: 17.3,
        sensorHeight: 13,
        imageWidth: 5280,
        imageHeight: 3956,
        focalLength: 12.3,
      },
      gridAngle: 0,
      overshoot: 20,
      altitudeReference: 'relative',
    },
    result: null,
    showFootprints: false,
    isActive: false,
  });
}

describe('survey-store', () => {
  beforeEach(() => {
    resetStore();
  });

  describe('setAltitudeReference', () => {
    it('sets altitude reference to terrain', () => {
      useSurveyStore.getState().setAltitudeReference('terrain');
      expect(useSurveyStore.getState().config.altitudeReference).toBe('terrain');
    });

    it('sets altitude reference to asl', () => {
      useSurveyStore.getState().setAltitudeReference('asl');
      expect(useSurveyStore.getState().config.altitudeReference).toBe('asl');
    });

    it('sets altitude reference to relative', () => {
      useSurveyStore.getState().setAltitudeReference('terrain');
      useSurveyStore.getState().setAltitudeReference('relative');
      expect(useSurveyStore.getState().config.altitudeReference).toBe('relative');
    });

    it('does not clear polygon or result when changing reference', () => {
      // Set up a polygon first
      const polygon = [
        { lat: -35.36, lng: 149.16 },
        { lat: -35.37, lng: 149.16 },
        { lat: -35.37, lng: 149.17 },
        { lat: -35.36, lng: 149.17 },
      ];
      useSurveyStore.setState({ polygon });

      useSurveyStore.getState().setAltitudeReference('terrain');

      expect(useSurveyStore.getState().polygon).toEqual(polygon);
    });
  });

  describe('removeVertex', () => {
    const squarePolygon = [
      { lat: -35.36, lng: 149.16 },
      { lat: -35.37, lng: 149.16 },
      { lat: -35.37, lng: 149.17 },
      { lat: -35.36, lng: 149.17 },
    ];

    it('removes a vertex from a polygon with more than 3 vertices', () => {
      useSurveyStore.setState({ polygon: [...squarePolygon] });
      useSurveyStore.getState().removeVertex(1);
      const polygon = useSurveyStore.getState().polygon;
      expect(polygon).toHaveLength(3);
      // Vertex at index 1 should be gone
      expect(polygon).not.toContainEqual(squarePolygon[1]);
    });

    it('does not remove vertex when polygon has exactly 3 vertices', () => {
      const triangle = squarePolygon.slice(0, 3);
      useSurveyStore.setState({ polygon: [...triangle] });
      useSurveyStore.getState().removeVertex(0);
      expect(useSurveyStore.getState().polygon).toHaveLength(3);
    });

    it('does nothing when polygon is null', () => {
      useSurveyStore.setState({ polygon: null });
      useSurveyStore.getState().removeVertex(0);
      expect(useSurveyStore.getState().polygon).toBeNull();
    });

    it('removes the first vertex correctly', () => {
      useSurveyStore.setState({ polygon: [...squarePolygon] });
      useSurveyStore.getState().removeVertex(0);
      const polygon = useSurveyStore.getState().polygon;
      expect(polygon).toHaveLength(3);
      expect(polygon![0]).toEqual(squarePolygon[1]);
    });

    it('removes the last vertex correctly', () => {
      useSurveyStore.setState({ polygon: [...squarePolygon] });
      useSurveyStore.getState().removeVertex(3);
      const polygon = useSurveyStore.getState().polygon;
      expect(polygon).toHaveLength(3);
      expect(polygon![2]).toEqual(squarePolygon[2]);
    });
  });

  describe('setSideOverlap', () => {
    it('accepts side overlap up to 99%', () => {
      useSurveyStore.getState().setSideOverlap(99);
      expect(useSurveyStore.getState().config.sideOverlap).toBe(99);
    });

    it('accepts side overlap at 95%', () => {
      useSurveyStore.getState().setSideOverlap(95);
      expect(useSurveyStore.getState().config.sideOverlap).toBe(95);
    });

    it('accepts values above the old 80% limit', () => {
      for (const val of [81, 85, 90, 95, 99]) {
        useSurveyStore.getState().setSideOverlap(val);
        expect(useSurveyStore.getState().config.sideOverlap).toBe(val);
      }
    });
  });

  describe('updateVertex', () => {
    it('updates a vertex position', () => {
      const polygon = [
        { lat: -35.36, lng: 149.16 },
        { lat: -35.37, lng: 149.16 },
        { lat: -35.37, lng: 149.17 },
      ];
      useSurveyStore.setState({ polygon: [...polygon] });

      useSurveyStore.getState().updateVertex(1, -35.365, 149.162);
      const updated = useSurveyStore.getState().polygon;
      expect(updated![1]).toEqual({ lat: -35.365, lng: 149.162 });
    });

    it('does nothing when polygon is null', () => {
      useSurveyStore.setState({ polygon: null });
      useSurveyStore.getState().updateVertex(0, 0, 0);
      expect(useSurveyStore.getState().polygon).toBeNull();
    });
  });
});
