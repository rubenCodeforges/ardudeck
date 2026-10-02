/**
 * ObjectEditorMap — MapLibre surface for the object-based Area Editor.
 *
 * Base imagery + Aviation/Zones overlays mirror the main app (tile-cache://
 * pulled over IPC, see the addProtocol handler). On top of the base it adds the
 * editor's own sources/layers: object fills/outlines, the selected object's
 * vertex + transform handles, the draft rubber-band, and the measure overlay.
 * The geometry for those sources is produced by objects-geo.ts and attached by
 * attachObjectInteractions.ts; this component only creates the layers.
 */

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MAP_LAYERS, type LayerKey } from '../../shared/map-layers';
import { useAreaEditorLayersStore, type AreaEditorOverlayId } from './area-editor-layers-store';

// Resolve the worker relative to the current document, not the server root.
// In dev the window loads from http://localhost (so '/maplibre-worker.js' works),
// but in packaged builds it loads via file://, where a leading-slash path resolves
// to the filesystem root and 404s - killing the MapLibre worker. Raster tiles still
// render (decoded on the main thread), but GeoJSON sources (draw objects, overlays)
// silently fail, which looks like "only the satellite shows, can't draw or toggle layers".
maplibregl.setWorkerUrl(new URL('maplibre-worker.js', document.baseURI).href);

// Detached windows can't fetch the privileged tile-cache:// scheme directly;
// pull tile bytes from the main process over IPC instead (runs on the renderer
// main thread, where window.electronAPI exists).
maplibregl.addProtocol('tile-cache', async (params) => {
  const data = await window.electronAPI.tileCacheGetTile(params.url);
  // i18n-exempt
  if (!data) throw new Error(`tile-cache: no data for ${params.url}`);
  return { data };
});

function cachedTileUrl(layerKey: string): string {
  return `tile-cache://${layerKey}/{z}/{x}/{y}.png`;
}

const BASE_SOURCE_ID = 'base-raster';
const BASE_LAYER_ID = 'base-layer';
const FIRST_EDITOR_LAYER = 'objects-fill';

function baseSourceSpec(layerKey: LayerKey): maplibregl.RasterSourceSpecification {
  const layer = MAP_LAYERS[layerKey];
  return {
    type: 'raster',
    tiles: [cachedTileUrl(layerKey)],
    tileSize: 256,
    maxzoom: ('maxNativeZoom' in layer ? layer.maxNativeZoom : undefined) ?? layer.maxZoom,
  };
}

function buildBaseStyle(layerKey: LayerKey): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: { [BASE_SOURCE_ID]: baseSourceSpec(layerKey) },
    layers: [{ id: BASE_LAYER_ID, type: 'raster', source: BASE_SOURCE_ID }],
  };
}

const DIPUL_LAYERS = [
  'kontrollzonen', 'flugbeschraenkungsgebiete', 'flughaefen', 'flugplaetze',
  'modellflugplaetze', 'naturschutzgebiete', 'nationalparks', 'krankenhaeuser',
  'polizei', 'justizvollzugsanstalten', 'militaerische_anlagen', 'bundesautobahnen',
  'bundesstrassen', 'industrieanlagen', 'kraftwerke', 'umspannwerke',
].join(',');
const DIPUL_WMS_URL =
  'https://uas-betrieb.de/geoservices/dipul/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap' +
  `&FORMAT=image/png&TRANSPARENT=true&LAYERS=${DIPUL_LAYERS}&CRS=EPSG:3857` +
  '&STYLES=&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}';

interface OverlaySpec {
  sourceId: string; layerId: string; source: maplibregl.RasterSourceSpecification; opacity: number;
}
const OVERLAY_SPECS: Partial<Record<AreaEditorOverlayId, OverlaySpec>> = {
  aviation: {
    sourceId: 'overlay-aviation-src', layerId: 'overlay-aviation',
    source: { type: 'raster', tiles: [cachedTileUrl('openaip')], tileSize: 256, maxzoom: MAP_LAYERS.openaip.maxNativeZoom ?? MAP_LAYERS.openaip.maxZoom },
    opacity: 0.85,
  },
  zones: {
    sourceId: 'overlay-zones-src', layerId: 'overlay-zones',
    source: { type: 'raster', tiles: [DIPUL_WMS_URL], tileSize: 256 },
    opacity: 0.7,
  },
};

function setOverlay(map: maplibregl.Map, id: AreaEditorOverlayId, on: boolean): void {
  const spec = OVERLAY_SPECS[id];
  if (!spec) return; // e.g. 'wind' is drawn by the wind canvas layer, not a raster source
  const present = map.getLayer(spec.layerId) !== undefined;
  if (on && !present) {
    if (!map.getSource(spec.sourceId)) map.addSource(spec.sourceId, spec.source);
    const beforeId = map.getLayer(FIRST_EDITOR_LAYER) ? FIRST_EDITOR_LAYER : undefined;
    map.addLayer({ id: spec.layerId, type: 'raster', source: spec.sourceId, paint: { 'raster-opacity': spec.opacity } }, beforeId);
  } else if (!on && present) {
    map.removeLayer(spec.layerId);
    if (map.getSource(spec.sourceId)) map.removeSource(spec.sourceId);
  }
}

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/** Initial map view: the main window's viewport (passed as ?lat&lng&zoom when the
 * editor opens) so it lands where the user was looking, else a sane default. */
function initialView(): { center: [number, number]; zoom: number } {
  const p = new URLSearchParams(window.location.search);
  const lat = Number(p.get('lat'));
  const lng = Number(p.get('lng'));
  const zoom = Number(p.get('zoom'));
  if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) {
    return { center: [lng, lat], zoom: Number.isFinite(zoom) && zoom > 0 ? zoom : 14 };
  }
  return { center: [19.3, 42.7], zoom: 9 };
}

export interface ObjectEditorMapProps {
  onMapReady?: (map: maplibregl.Map) => void;
}

export function ObjectEditorMap({ onMapReady }: ObjectEditorMapProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const onReadyRef = useRef(onMapReady);
  onReadyRef.current = onMapReady;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const initialBase = useAreaEditorLayersStore.getState().baseLayer;
    const map = new maplibregl.Map({
      container, style: buildBaseStyle(initialBase), ...initialView(),
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-left');

    map.on('load', () => {
      // ---- object fills/outlines ----
      map.addSource('objects', { type: 'geojson', data: EMPTY_FC });
      map.addLayer({
        id: 'objects-fill', type: 'fill', source: 'objects',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': ['case',
            ['==', ['get', 'workspace'], true], 0.05,
            ['==', ['get', 'selected'], true], 0.35,
            0.18],
        },
      });
      map.addLayer({
        id: 'objects-outline', type: 'line', source: 'objects',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['case', ['==', ['get', 'selected'], true], 3, 1.75],
          // Workspace areas get the dashed allowed-flight-area outline (matches
          // the committed-workspace styling on the mission map).
          'line-dasharray': ['case',
            ['==', ['get', 'workspace'], true], ['literal', [3, 2]],
            ['literal', [1, 0]]],
        },
      });

      // ---- draft rubber-band ----
      map.addSource('draft', { type: 'geojson', data: EMPTY_FC });
      // Live fill for drag-to-create shapes (rectangle/circle preview).
      map.addLayer({
        id: 'draft-fill', type: 'fill', source: 'draft',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': '#38bdf8', 'fill-opacity': 0.18 },
      });
      map.addLayer({
        id: 'draft-line', type: 'line', source: 'draft',
        filter: ['!=', ['geometry-type'], 'Point'],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#38bdf8', 'line-width': 2, 'line-dasharray': [2, 1.5] },
      });
      map.addLayer({
        id: 'draft-points', type: 'circle', source: 'draft',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: { 'circle-radius': 4, 'circle-color': '#38bdf8', 'circle-stroke-color': '#0f172a', 'circle-stroke-width': 1.5 },
      });

      // ---- transform handles (bbox + scale + rotate) ----
      map.addSource('handles', { type: 'geojson', data: EMPTY_FC });
      map.addLayer({
        id: 'handles-line', type: 'line', source: 'handles',
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: { 'line-color': '#ffffff', 'line-width': 1.25, 'line-opacity': 0.9 },
      });
      map.addLayer({
        id: 'handles-rotate', type: 'circle', source: 'handles',
        filter: ['==', ['get', 'role'], 'rotate'],
        paint: { 'circle-radius': 7, 'circle-color': '#34d399', 'circle-stroke-color': '#0f172a', 'circle-stroke-width': 2 },
      });
      map.addLayer({
        id: 'handles-scale', type: 'circle', source: 'handles',
        filter: ['==', ['get', 'role'], 'scale'],
        paint: { 'circle-radius': 6, 'circle-color': '#ffffff', 'circle-stroke-color': '#0f172a', 'circle-stroke-width': 2 },
      });

      // ---- vertex handles (edit tool) ----
      map.addSource('vertices', { type: 'geojson', data: EMPTY_FC });
      map.addLayer({
        id: 'vertices-circle', type: 'circle', source: 'vertices',
        paint: {
          'circle-radius': ['case', ['==', ['get', 'selected'], true], 8, 6],
          'circle-color': ['case', ['==', ['get', 'selected'], true], '#f59e0b', '#22d3ee'],
          'circle-stroke-color': '#0f172a', 'circle-stroke-width': 2,
        },
      });

      // ---- measure overlay ----
      map.addSource('measure', { type: 'geojson', data: EMPTY_FC });
      map.addLayer({
        id: 'measure-line', type: 'line', source: 'measure',
        filter: ['==', ['geometry-type'], 'LineString'],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#f59e0b',
          'line-width': ['case', ['==', ['get', 'selected'], true], 4, 2],
          'line-dasharray': [2, 1.5],
        },
      });
      map.addLayer({
        id: 'measure-points', type: 'circle', source: 'measure',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': ['case', ['==', ['get', 'selected'], true], 6, 4],
          'circle-color': '#f59e0b',
          'circle-stroke-color': ['case', ['==', ['get', 'selected'], true], '#ffffff', '#0f172a'],
          'circle-stroke-width': ['case', ['==', ['get', 'selected'], true], 2.5, 1.5],
        },
      });

      const { overlays } = useAreaEditorLayersStore.getState();
      (Object.keys(overlays) as AreaEditorOverlayId[]).forEach((id) => setOverlay(map, id, overlays[id]));

      onReadyRef.current?.(map);
    });

    map.on('error', (e) => console.error('[ObjectEditorMap] map error:', e.error?.message ?? e));
    mapRef.current = map;

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(container);
    return () => { ro.disconnect(); map.remove(); mapRef.current = null; };
  }, []);

  // Base-layer + overlay reactions.
  useEffect(() => {
    const applyBase = (key: LayerKey): void => {
      const map = mapRef.current;
      if (!map || !map.isStyleLoaded()) return;
      if (map.getLayer(BASE_LAYER_ID)) map.removeLayer(BASE_LAYER_ID);
      if (map.getSource(BASE_SOURCE_ID)) map.removeSource(BASE_SOURCE_ID);
      map.addSource(BASE_SOURCE_ID, baseSourceSpec(key));
      const beforeId =
        (['zones', 'aviation'] as AreaEditorOverlayId[])
          .map((id) => OVERLAY_SPECS[id]?.layerId)
          .find((lid): lid is string => !!lid && map.getLayer(lid) !== undefined) ??
        (map.getLayer(FIRST_EDITOR_LAYER) ? FIRST_EDITOR_LAYER : undefined);
      map.addLayer({ id: BASE_LAYER_ID, type: 'raster', source: BASE_SOURCE_ID }, beforeId);
    };
    const unsubBase = useAreaEditorLayersStore.subscribe((s) => s.baseLayer, (key) => applyBase(key));
    const unsubOverlays = useAreaEditorLayersStore.subscribe((s) => s.overlays, (overlays) => {
      const map = mapRef.current;
      if (!map || !map.isStyleLoaded()) return;
      (Object.keys(overlays) as AreaEditorOverlayId[]).forEach((id) => setOverlay(map, id, overlays[id]));
    });
    return () => { unsubBase(); unsubOverlays(); };
  }, []);

  return <div ref={containerRef} className="h-full w-full" />;
}
