import type maplibregl from 'maplibre-gl';
import { create } from 'zustand';
import { useHazardsStore } from '../stores/hazards-store';
import type { Hazard } from '../../shared/hazard-types';

const SOURCE_ID = 'hazards';
const FILL_ID = 'hazards-fill';
const LINE_ID = 'hazards-line';

/** The hazard the pilot clicked in the Area Editor, shown in the side panel. */
export const useSelectedHazard = create<{ id: string | null; select: (id: string | null) => void }>((set) => ({
  id: null,
  select: (id) => set({ id }),
}));

function ring(h: Hazard): number[][] {
  const s = h.shape;
  if (s.kind === 'polygon') {
    const pts = s.points.map((p) => [p.lon, p.lat]);
    return [...pts, pts[0]!];
  }
  const k = Math.cos((s.center.lat * Math.PI) / 180);
  const pts = Array.from({ length: 48 }, (_, i) => {
    const a = (i / 48) * 2 * Math.PI;
    return [s.center.lon + (Math.cos(a) * s.radiusM) / (111_320 * k), s.center.lat + (Math.sin(a) * s.radiusM) / 111_320];
  });
  return [...pts, pts[0]!];
}

function toCollection(hazards: Hazard[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: hazards.map((h) => ({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [ring(h)] },
      properties: { id: h.id },
    })),
  };
}

/** Hazards under the editable objects: red, clickable for their details. */
export function attachHazardsLayer(map: maplibregl.Map): () => void {
  const before = map.getLayer('objects-fill') ? 'objects-fill' : undefined;
  if (!map.getSource(SOURCE_ID)) map.addSource(SOURCE_ID, { type: 'geojson', data: toCollection(useHazardsStore.getState().hazards) });
  if (!map.getLayer(FILL_ID)) {
    map.addLayer({ id: FILL_ID, type: 'fill', source: SOURCE_ID, paint: { 'fill-color': '#ef4444', 'fill-opacity': 0.18 } }, before);
  }
  if (!map.getLayer(LINE_ID)) {
    map.addLayer({ id: LINE_ID, type: 'line', source: SOURCE_ID, paint: { 'line-color': '#ef4444', 'line-width': 2 } }, before);
  }

  const unsubscribe = useHazardsStore.subscribe((s) => {
    const src = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    src?.setData(toCollection(s.hazards));
  });
  const onClick = (e: maplibregl.MapLayerMouseEvent) => {
    const id = e.features?.[0]?.properties?.id;
    if (typeof id === 'string') useSelectedHazard.getState().select(id);
  };
  map.on('click', FILL_ID, onClick);
  return () => {
    unsubscribe();
    map.off('click', FILL_ID, onClick);
  };
}
