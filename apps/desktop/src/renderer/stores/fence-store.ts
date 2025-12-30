import { create } from 'zustand';
import {
  type FenceItem,
  type PolygonFence,
  type CircleFence,
  type FenceReturnPoint,
  type FenceStatus,
  parseFenceItems,
  buildFenceItems,
} from '../../shared/fence-types';

// Progress tracking for download/upload
interface FenceProgress {
  total: number;
  transferred: number;
  operation: 'download' | 'upload';
}

// Drawing modes for map interaction
export type FenceDrawMode =
  | 'none'
  | 'polygon-inclusion'
  | 'polygon-exclusion'
  | 'circle-inclusion'
  | 'circle-exclusion'
  | 'return-point';

interface FenceStore {
  // State
  fenceItems: FenceItem[]; // Raw items from FC
  polygons: PolygonFence[];
  circles: CircleFence[];
  returnPoint: FenceReturnPoint | null;
  fenceStatus: FenceStatus | null; // Live breach status
  isLoading: boolean;
  progress: FenceProgress | null;
  error: string | null;
  isDirty: boolean;
  selectedFenceId: string | null; // Selected polygon or circle ID
  lastSuccessMessage: string | null;

  // Drawing state
  drawMode: FenceDrawMode;
  drawingVertices: Array<{ lat: number; lon: number }>; // Temp vertices while drawing
  inclusionMode: boolean; // true = inclusion (green), false = exclusion (red)

  // Computed
  getFenceCount: () => number;

  // Actions - FC communication
  fetchFence: () => Promise<void>;
  uploadFence: () => Promise<boolean>;
  clearFenceFromFC: () => Promise<boolean>;

  // Local editing - Polygons
  addPolygon: (type: 'inclusion' | 'exclusion', vertices: Array<{ lat: number; lon: number }>) => void;
  updatePolygonVertex: (polygonId: string, vertexIndex: number, lat: number, lon: number) => void;
  addVertexToPolygon: (polygonId: string, afterIndex: number, lat: number, lon: number) => void;
  removeVertexFromPolygon: (polygonId: string, vertexIndex: number) => void;
  removePolygon: (polygonId: string) => void;

  // Local editing - Circles
  addCircle: (type: 'inclusion' | 'exclusion', center: { lat: number; lon: number }, radius: number) => void;
  updateCircle: (circleId: string, center?: { lat: number; lon: number }, radius?: number) => void;
  removeCircle: (circleId: string) => void;

  // Local editing - Return point
  setReturnPoint: (lat: number, lon: number, altitude?: number) => void;
  clearReturnPoint: () => void;

  // Drawing mode
  setDrawMode: (mode: FenceDrawMode) => void;
  setInclusionMode: (inclusion: boolean) => void;
  addDrawingVertex: (lat: number, lon: number) => void;
  completeDrawing: () => void;
  cancelDrawing: () => void;

  // UI state
  setSelectedFenceId: (id: string | null) => void;

  // IPC event handlers
  setFenceItems: (items: FenceItem[]) => void;
  setFenceItemsFromFile: (items: FenceItem[]) => void;
  updateProgress: (progress: FenceProgress) => void;
  setFenceStatus: (status: FenceStatus) => void;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
  setUploadComplete: (itemCount: number) => void;
  setClearComplete: () => void;
  clearLastSuccessMessage: () => void;
  clearFence: () => void;
  reset: () => void;
}

let nextPolygonId = 1;
let nextCircleId = 1;

export const useFenceStore = create<FenceStore>((set, get) => ({
  // Initial state
  fenceItems: [],
  polygons: [],
  circles: [],
  returnPoint: null,
  fenceStatus: null,
  isLoading: false,
  progress: null,
  error: null,
  isDirty: false,
  selectedFenceId: null,
  lastSuccessMessage: null,
  drawMode: 'none',
  drawingVertices: [],
  inclusionMode: true, // Default to inclusion zones

  // Computed
  getFenceCount: () => {
    const { polygons, circles, returnPoint } = get();
    return polygons.length + circles.length + (returnPoint ? 1 : 0);
  },

  // Actions - FC communication
  fetchFence: async () => {
    set({ isLoading: true, error: null, progress: { total: 0, transferred: 0, operation: 'download' } });
    try {
      const result = await window.electronAPI?.downloadFence();
      if (!result?.success) {
        set({ error: result?.error || 'Failed to download fence', isLoading: false, progress: null });
      }
      // Items will be set via IPC events (onFenceComplete)
    } catch (err) {
      set({ error: String(err), isLoading: false, progress: null });
    }
  },

  uploadFence: async () => {
    const { polygons, circles, returnPoint } = get();
    const items = buildFenceItems(polygons, circles, returnPoint);

    if (items.length === 0) {
      set({ error: 'No fence items to upload' });
      return false;
    }

    set({ isLoading: true, error: null, progress: { total: items.length, transferred: 0, operation: 'upload' } });
    try {
      const result = await window.electronAPI?.uploadFence(items);
      if (result?.success) {
        return true;
      } else {
        set({ error: result?.error || 'Failed to upload fence', isLoading: false, progress: null });
        return false;
      }
    } catch (err) {
      set({ error: String(err), isLoading: false, progress: null });
      return false;
    }
  },

  clearFenceFromFC: async () => {
    set({ isLoading: true, error: null });
    try {
      const result = await window.electronAPI?.clearFence();
      if (result?.success) {
        return true;
      } else {
        set({ error: result?.error || 'Failed to clear fence', isLoading: false });
        return false;
      }
    } catch (err) {
      set({ error: String(err), isLoading: false });
      return false;
    }
  },

  // Local editing - Polygons
  addPolygon: (type, vertices) => {
    if (vertices.length < 3) return;

    const polygon: PolygonFence = {
      id: `polygon-${nextPolygonId++}`,
      type,
      vertices: vertices.map((v, i) => ({ seq: i, lat: v.lat, lon: v.lon })),
    };

    set(state => ({
      polygons: [...state.polygons, polygon],
      isDirty: true,
      selectedFenceId: polygon.id,
    }));
  },

  updatePolygonVertex: (polygonId, vertexIndex, lat, lon) => {
    set(state => ({
      polygons: state.polygons.map(p =>
        p.id === polygonId
          ? {
              ...p,
              vertices: p.vertices.map((v, i) =>
                i === vertexIndex ? { ...v, lat, lon } : v
              ),
            }
          : p
      ),
      isDirty: true,
    }));
  },

  addVertexToPolygon: (polygonId, afterIndex, lat, lon) => {
    set(state => ({
      polygons: state.polygons.map(p => {
        if (p.id !== polygonId) return p;
        const newVertices = [...p.vertices];
        newVertices.splice(afterIndex + 1, 0, { seq: afterIndex + 1, lat, lon });
        // Renumber seqs
        return {
          ...p,
          vertices: newVertices.map((v, i) => ({ ...v, seq: i })),
        };
      }),
      isDirty: true,
    }));
  },

  removeVertexFromPolygon: (polygonId, vertexIndex) => {
    set(state => ({
      polygons: state.polygons.map(p => {
        if (p.id !== polygonId) return p;
        if (p.vertices.length <= 3) return p; // Minimum 3 vertices
        const newVertices = p.vertices.filter((_, i) => i !== vertexIndex);
        return {
          ...p,
          vertices: newVertices.map((v, i) => ({ ...v, seq: i })),
        };
      }),
      isDirty: true,
    }));
  },

  removePolygon: (polygonId) => {
    set(state => ({
      polygons: state.polygons.filter(p => p.id !== polygonId),
      isDirty: true,
      selectedFenceId: state.selectedFenceId === polygonId ? null : state.selectedFenceId,
    }));
  },

  // Local editing - Circles
  addCircle: (type, center, radius) => {
    const circle: CircleFence = {
      id: `circle-${nextCircleId++}`,
      type,
      center,
      radius,
      seq: 0,
    };

    set(state => ({
      circles: [...state.circles, circle],
      isDirty: true,
      selectedFenceId: circle.id,
    }));
  },

  updateCircle: (circleId, center, radius) => {
    set(state => ({
      circles: state.circles.map(c =>
        c.id === circleId
          ? {
              ...c,
              ...(center && { center }),
              ...(radius !== undefined && { radius }),
            }
          : c
      ),
      isDirty: true,
    }));
  },

  removeCircle: (circleId) => {
    set(state => ({
      circles: state.circles.filter(c => c.id !== circleId),
      isDirty: true,
      selectedFenceId: state.selectedFenceId === circleId ? null : state.selectedFenceId,
    }));
  },

  // Local editing - Return point
  setReturnPoint: (lat, lon, altitude = 0) => {
    set({
      returnPoint: { lat, lon, altitude, seq: 0 },
      isDirty: true,
    });
  },

  clearReturnPoint: () => {
    set({ returnPoint: null, isDirty: true });
  },

  // Drawing mode
  setDrawMode: (mode) => {
    set({ drawMode: mode, drawingVertices: [] });
  },

  setInclusionMode: (inclusion) => {
    set({ inclusionMode: inclusion });
  },

  addDrawingVertex: (lat, lon) => {
    set(state => ({
      drawingVertices: [...state.drawingVertices, { lat, lon }],
    }));
  },

  completeDrawing: () => {
    const { drawMode, drawingVertices, addPolygon, addCircle, setReturnPoint } = get();

    if (drawMode === 'polygon-inclusion' || drawMode === 'polygon-exclusion') {
      if (drawingVertices.length >= 3) {
        const type = drawMode === 'polygon-inclusion' ? 'inclusion' : 'exclusion';
        addPolygon(type, drawingVertices);
      }
    } else if (drawMode === 'circle-inclusion' || drawMode === 'circle-exclusion') {
      if (drawingVertices.length >= 2) {
        const type = drawMode === 'circle-inclusion' ? 'inclusion' : 'exclusion';
        const center = drawingVertices[0];
        const edge = drawingVertices[1];
        // Calculate radius from center to edge point
        const radius = calculateDistance(center.lat, center.lon, edge.lat, edge.lon);
        addCircle(type, center, radius);
      }
    } else if (drawMode === 'return-point') {
      if (drawingVertices.length >= 1) {
        const point = drawingVertices[0];
        setReturnPoint(point.lat, point.lon, 100); // Default 100m altitude
      }
    }

    set({ drawMode: 'none', drawingVertices: [] });
  },

  cancelDrawing: () => {
    set({ drawMode: 'none', drawingVertices: [] });
  },

  // UI state
  setSelectedFenceId: (id) => {
    set({ selectedFenceId: id });
  },

  // IPC event handlers
  setFenceItems: (items) => {
    const { polygons, circles, returnPoint } = parseFenceItems(items);

    // Update next IDs to avoid conflicts
    nextPolygonId = Math.max(nextPolygonId, ...polygons.map(p => parseInt(p.id.split('-')[1]) + 1 || 1));
    nextCircleId = Math.max(nextCircleId, ...circles.map(c => parseInt(c.id.split('-')[1]) + 1 || 1));

    set({
      fenceItems: items,
      polygons,
      circles,
      returnPoint,
      isLoading: false,
      progress: null,
      isDirty: false,
      error: null,
      lastSuccessMessage: `Downloaded ${items.length} fence items from flight controller`,
    });
  },

  setFenceItemsFromFile: (items) => {
    const { polygons, circles, returnPoint } = parseFenceItems(items);

    nextPolygonId = Math.max(nextPolygonId, ...polygons.map(p => parseInt(p.id.split('-')[1]) + 1 || 1));
    nextCircleId = Math.max(nextCircleId, ...circles.map(c => parseInt(c.id.split('-')[1]) + 1 || 1));

    set({
      fenceItems: items,
      polygons,
      circles,
      returnPoint,
      isLoading: false,
      progress: null,
      isDirty: false,
      error: null,
    });
  },

  updateProgress: (progress) => {
    set({ progress });
  },

  setFenceStatus: (status) => {
    set({ fenceStatus: status });
  },

  setError: (error) => {
    set({ error, isLoading: false, progress: null });
  },

  setLoading: (loading) => {
    set({ isLoading: loading });
  },

  setUploadComplete: (itemCount) => {
    set({
      isLoading: false,
      isDirty: false,
      progress: null,
      error: null,
      lastSuccessMessage: `Uploaded ${itemCount} fence items to flight controller`,
    });
  },

  setClearComplete: () => {
    set({
      isLoading: false,
      progress: null,
      error: null,
      lastSuccessMessage: 'Fence cleared from flight controller',
    });
  },

  clearLastSuccessMessage: () => {
    set({ lastSuccessMessage: null });
  },

  clearFence: () => {
    set({
      fenceItems: [],
      polygons: [],
      circles: [],
      returnPoint: null,
      isDirty: false,
      selectedFenceId: null,
    });
  },

  reset: () => {
    set({
      fenceItems: [],
      polygons: [],
      circles: [],
      returnPoint: null,
      fenceStatus: null,
      isLoading: false,
      progress: null,
      error: null,
      isDirty: false,
      selectedFenceId: null,
      lastSuccessMessage: null,
      drawMode: 'none',
      drawingVertices: [],
      inclusionMode: true,
    });
  },
}));

// Helper: Calculate distance between two points in meters (Haversine)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}
