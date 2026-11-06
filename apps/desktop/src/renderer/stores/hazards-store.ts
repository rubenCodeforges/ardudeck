import { create } from 'zustand';
import type { Hazard, HazardsStatus } from '../../shared/hazard-types';
import type { CircleFence, PolygonFence } from '../../shared/fence-types';

interface HazardsState {
  hazards: Hazard[];
  status: HazardsStatus;
  refresh: () => Promise<void>;
}

export const useHazardsStore = create<HazardsState>((set) => ({
  hazards: [],
  status: { hasPin: false, unlocked: false },
  refresh: async () => {
    const [hazards, status] = await Promise.all([
      window.electronAPI?.hazardsList?.() ?? Promise.resolve([]),
      window.electronAPI?.hazardsStatus?.() ?? Promise.resolve({ hasPin: false, unlocked: false }),
    ]);
    set({ hazards, status });
  },
}));

let started = false;

/** Loads the hazards once per window and follows every change (edit, unlock, import). */
export function initHazards(): void {
  if (started) return;
  started = true;
  void useHazardsStore.getState().refresh();
  window.electronAPI?.onHazardsChanged?.(() => void useHazardsStore.getState().refresh());
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-7;

/** Hazards marked "also upload as a vehicle fence", minus any the fence already holds (e.g. after a download). */
export function hazardFences(
  existing: { polygons: PolygonFence[]; circles: CircleFence[] },
  near25km?: { lat: number; lon: number } | null,
): { polygons: PolygonFence[]; circles: CircleFence[] } {
  const polygons: PolygonFence[] = [];
  const circles: CircleFence[] = [];
  for (const hazard of useHazardsStore.getState().hazards) {
    if (!hazard.uploadAsFence) continue;
    const s = hazard.shape;
    const ref = s.kind === 'polygon' ? s.points[0]! : s.center;
    if (near25km && Math.hypot((ref.lat - near25km.lat) * 111_320, (ref.lon - near25km.lon) * 111_320 * Math.cos((ref.lat * Math.PI) / 180)) > 25_000) continue;
    if (s.kind === 'polygon') {
      const dup = existing.polygons.some((p) => p.type === 'exclusion' && p.vertices.length === s.points.length
        && p.vertices.every((v, i) => near(v.lat, s.points[i]!.lat) && near(v.lon, s.points[i]!.lon)));
      if (!dup) polygons.push({ id: `hazard-${hazard.id}`, type: 'exclusion', vertices: s.points.map((p, i) => ({ seq: i, lat: p.lat, lon: p.lon })) });
    } else {
      const dup = existing.circles.some((c) => c.type === 'exclusion' && near(c.center.lat, s.center.lat) && near(c.center.lon, s.center.lon) && Math.abs(c.radius - s.radiusM) < 0.5);
      if (!dup) circles.push({ id: `hazard-${hazard.id}`, type: 'exclusion', center: { lat: s.center.lat, lon: s.center.lon }, radius: s.radiusM, seq: 0 });
    }
  }
  return { polygons, circles };
}
