/**
 * area-editor-layers-store — base map layer + data overlay state for the Area
 * Editor's MapLibre surface. Kept separate from the geometry store so the
 * heavily-tested polygon model stays focused; this is purely view state.
 *
 * Mirrors the main app's map layer system (see shared/map-layers.ts and the
 * overlay set in components/map/overlays): the same base layers, plus the
 * raster/WMS overlays a pilot expects (Aviation = OpenAIP, Zones = DIPUL).
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { LayerKey } from '../../shared/map-layers';

/** Base layers offered in the editor — the planning-relevant subset of MAP_LAYERS. */
export const AREA_EDITOR_BASE_LAYERS: { key: LayerKey; labelKey: string }[] = [
  { key: 'googleSat', labelKey: 'area-editor:layers.base.satellite' },
  { key: 'googleHybrid', labelKey: 'area-editor:layers.base.hybrid' },
  { key: 'bingSat', labelKey: 'area-editor:layers.base.bingSat' },
  { key: 'bingHybrid', labelKey: 'area-editor:layers.base.bingHybrid' },
  { key: 'osm', labelKey: 'area-editor:layers.base.street' },
  { key: 'terrain', labelKey: 'area-editor:layers.base.terrain' },
  { key: 'dark', labelKey: 'area-editor:layers.base.dark' },
];

export type AreaEditorOverlayId = 'aviation' | 'zones' | 'wind' | 'traffic' | 'gliders';

export const AREA_EDITOR_OVERLAYS: { id: AreaEditorOverlayId; labelKey: string; hintKey: string }[] = [
  { id: 'aviation', labelKey: 'area-editor:layers.overlay.aviation', hintKey: 'area-editor:layers.overlay.aviationHint' },
  { id: 'zones', labelKey: 'area-editor:layers.overlay.zones', hintKey: 'area-editor:layers.overlay.zonesHint' },
  { id: 'wind', labelKey: 'area-editor:layers.overlay.wind', hintKey: 'area-editor:layers.overlay.windHint' },
  { id: 'traffic', labelKey: 'area-editor:layers.overlay.traffic', hintKey: 'area-editor:layers.overlay.trafficHint' },
  { id: 'gliders', labelKey: 'area-editor:layers.overlay.gliders', hintKey: 'area-editor:layers.overlay.glidersHint' },
];

interface LayersState {
  baseLayer: LayerKey;
  overlays: Record<AreaEditorOverlayId, boolean>;
  setBaseLayer: (key: LayerKey) => void;
  toggleOverlay: (id: AreaEditorOverlayId) => void;
}

export const useAreaEditorLayersStore = create<LayersState>()(
  subscribeWithSelector((set) => ({
    baseLayer: 'googleSat',
    overlays: { aviation: false, zones: false, wind: false, traffic: false, gliders: false },
    setBaseLayer: (key) => set({ baseLayer: key }),
    toggleOverlay: (id) =>
      set((s) => ({ overlays: { ...s.overlays, [id]: !s.overlays[id] } })),
  })),
);
