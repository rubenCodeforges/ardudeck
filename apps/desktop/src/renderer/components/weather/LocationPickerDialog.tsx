/**
 * Map-first briefing location picker. Pilots plan ahead and want to drop the
 * briefing point ON A MAP, not type coordinates, so the map is the primary
 * control: click anywhere to set the point, drag the pin to refine, or search a
 * place to fly there. Manual lat/lon still works but is demoted to a collapsible
 * "Enter coordinates" row.
 *
 * Reuses the app's own Leaflet stack: the shared offline-capable tile-cache://
 * source keyed by the basemap the operator already picked (edit-mode-store), the
 * cursor-anchored SmoothWheelZoom, and the same portal + backdrop modal shape as
 * the rest of the app. Confirming writes an override into weather-store, which
 * drives both the forecast fetch and the WMM computation. Point only: a single
 * forecast site, so there is no area selection here.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Search, Loader2, MapPin, X, RotateCcw, Check, ChevronDown } from 'lucide-react';
import { useWeatherStore } from '../../stores/weather-store';
import { useEditModeStore } from '../../stores/edit-mode-store';
import { MAP_LAYERS, type LayerKey, type MapLayer } from '../../../shared/map-layers';
import { SmoothWheelZoom } from '../map/SmoothWheelZoom';
import { searchLocations, type GeocodeResult } from '../../utils/weather-api';
import { useTranslation } from 'react-i18next';

// Fallback view when there is no resolved position yet (matches the app's own
// no-GPS fallback). London, wide zoom, so the operator can still pan and pick.
const FALLBACK_CENTER: [number, number] = [51.505, -0.09];
const FALLBACK_ZOOM = 4;
const PICK_ZOOM = 13;

// Teardrop pin with a heavy white halo so it stays legible over street,
// satellite, and dark basemaps alike.
const PICK_ICON = L.divIcon({
  className: 'wx-pick-marker',
  html: `
    <div style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">
      <svg width="30" height="40" viewBox="0 0 30 40" fill="none">
        <path d="M15 39C15 39 28 24.5 28 14C28 6.8 22.2 1 15 1C7.8 1 2 6.8 2 14C2 24.5 15 39 15 39Z"
          fill="#0ea5e9" stroke="#ffffff" stroke-width="2.5" stroke-linejoin="round"/>
        <circle cx="15" cy="14" r="5" fill="#ffffff"/>
      </svg>
    </div>
  `,
  iconSize: [30, 40],
  iconAnchor: [15, 38],
});

function resultLabel(r: GeocodeResult): string {
  return [r.admin1, r.country].filter(Boolean).join(', ');
}

interface FlyTarget {
  lat: number;
  lon: number;
  token: number;
}

// Runs inside the MapContainer: wires click-to-pick, fixes the grey-tile issue a
// map born in a freshly opened modal always has, and flies to search / manual
// picks. A Leaflet map sized after creation renders grey until invalidateSize
// runs once it is visible, so we nudge it on mount and track it with a
// ResizeObserver, the same pattern MapPanel uses.
function PickController({
  onPick,
  flyTo,
}: {
  onPick: (lat: number, lon: number) => void;
  flyTo: FlyTarget | null;
}) {
  const map = useMap();

  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });

  useEffect(() => {
    const nudge = () => { try { map.invalidateSize(); } catch { /* map torn down */ } };
    const t1 = setTimeout(nudge, 60);
    const t2 = setTimeout(nudge, 260);
    const ro = new ResizeObserver(nudge);
    ro.observe(map.getContainer());
    return () => { clearTimeout(t1); clearTimeout(t2); ro.disconnect(); };
  }, [map]);

  useEffect(() => {
    if (!flyTo) return;
    map.setView([flyTo.lat, flyTo.lon], Math.max(map.getZoom(), PICK_ZOOM), { animate: true });
  }, [flyTo, map]);

  return null;
}

interface Selected {
  lat: number;
  lon: number;
  /** Place name when picked via search; null once dropped/dragged on the map. */
  name: string | null;
}

export function LocationPickerDialog({ onClose }: { onClose: () => void }): JSX.Element {
  const { t } = useTranslation();
  const location = useWeatherStore((s) => s.location);
  const override = useWeatherStore((s) => s.override);
  const setOverride = useWeatherStore((s) => s.setLocationOverride);
  const clearOverride = useWeatherStore((s) => s.clearLocationOverride);

  // Reuse the basemap the operator already chose on the mission map, so the
  // picker matches the app (and its offline tile cache) instead of a stray OSM.
  const mapLayerKey = useEditModeStore((s) => s.mapLayer);
  const layerKey: LayerKey = (mapLayerKey in MAP_LAYERS ? mapLayerKey : 'googleSat') as LayerKey;
  const layer = MAP_LAYERS[layerKey];

  // Seed from the resolved location so the map opens where the briefing is.
  const [selected, setSelected] = useState<Selected | null>(
    location ? { lat: location.lat, lon: location.lon, name: location.name ?? null } : null,
  );
  const initialView = useMemo<{ center: [number, number]; zoom: number }>(
    () => selected
      ? { center: [selected.lat, selected.lon], zoom: PICK_ZOOM }
      : { center: FALLBACK_CENTER, zoom: FALLBACK_ZOOM },
    // Only the first value matters: MapContainer center/zoom are init-only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [flyTo, setFlyTo] = useState<FlyTarget | null>(null);
  const flyToken = useRef(0);

  const [showManual, setShowManual] = useState(false);
  const [manualLat, setManualLat] = useState(selected ? selected.lat.toFixed(5) : '');
  const [manualLon, setManualLon] = useState(selected ? selected.lon.toFixed(5) : '');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Debounced geocoding, same cadence and guard as the original picker.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      const found = await searchLocations(q);
      if (!cancelled) {
        setResults(found);
        setSearching(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);

  // Dropping or dragging on the map yields a coordinate point (no place name).
  const pickOnMap = (lat: number, lon: number) => {
    setSelected({ lat, lon, name: null });
    setManualLat(lat.toFixed(5));
    setManualLon(lon.toFixed(5));
  };

  const pickResult = (r: GeocodeResult) => {
    setSelected({ lat: r.lat, lon: r.lon, name: r.name });
    setManualLat(r.lat.toFixed(5));
    setManualLon(r.lon.toFixed(5));
    setFlyTo({ lat: r.lat, lon: r.lon, token: ++flyToken.current });
    setQuery('');
    setResults([]);
  };

  const applyManual = () => {
    const lat = Number(manualLat);
    const lon = Number(manualLon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
    setSelected({ lat, lon, name: null });
    setFlyTo({ lat, lon, token: ++flyToken.current });
  };

  const confirm = () => {
    if (!selected) return;
    const name = selected.name ?? `${selected.lat.toFixed(4)}, ${selected.lon.toFixed(4)}`;
    setOverride({ lat: selected.lat, lon: selected.lon, name });
    onClose();
  };

  const resetAuto = () => {
    clearOverride();
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[2000] bg-black/60 flex items-center justify-center p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-[min(92vw,880px)] max-h-[90vh] flex flex-col rounded-2xl border border-default bg-surface-solid shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-subtle">
          <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center shrink-0">
            <MapPin className="w-4 h-4 text-sky-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-content">{t('weather:locationDialog.title')}</h3>
            <p className="text-[11px] text-content-tertiary">{t('weather:locationDialog.subtitle')}</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md flex items-center justify-center text-content-tertiary hover:text-content hover:bg-surface-raised transition-colors"
            data-tip={t('common:close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pt-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-content-tertiary" />
            {searching && (
              <Loader2 className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-content-tertiary animate-spin" />
            )}
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('weather:locationDialog.searchPlaceholder')}
              autoFocus
              className="w-full pl-9 pr-9 py-2 bg-surface-input border border-border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500"
            />
            {results.length > 0 && (
              <div className="absolute z-[1200] left-0 right-0 mt-1.5 max-h-60 overflow-y-auto rounded-lg border border-default bg-surface-solid shadow-xl divide-y divide-subtle">
                {results.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => pickResult(r)}
                    className="w-full text-left px-3 py-2 hover:bg-surface-raised transition-colors"
                  >
                    <div className="text-xs text-content truncate">{r.name}</div>
                    <div className="text-[10px] text-content-tertiary truncate tabular-nums">
                      {resultLabel(r)}
                      {resultLabel(r) && ' · '}
                      {r.lat.toFixed(3)}, {r.lon.toFixed(3)}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {query.trim().length >= 2 && !searching && results.length === 0 && (
              <div className="absolute z-[1200] left-0 right-0 mt-1.5 rounded-lg border border-default bg-surface-solid shadow-xl px-3 py-2 text-[11px] text-content-tertiary">
                {t('weather:locationDialog.noMatches')}
              </div>
            )}
          </div>
        </div>

        {/* Map */}
        <div className="px-4 pt-3">
          <div className="relative h-[46vh] min-h-[320px] rounded-lg overflow-hidden border border-default">
            <MapContainer
              center={initialView.center}
              zoom={initialView.zoom}
              zoomSnap={0}
              className="h-full w-full"
              zoomControl
              attributionControl={false}
            >
              <SmoothWheelZoom />
              <TileLayer
                key={layerKey}
                url={`tile-cache://${layerKey}/{z}/{x}/{y}.png`}
                maxZoom={layer.maxZoom}
                maxNativeZoom={(layer as MapLayer).maxNativeZoom ?? layer.maxZoom}
              />
              <PickController onPick={pickOnMap} flyTo={flyTo} />
              {selected && (
                <Marker
                  position={[selected.lat, selected.lon]}
                  icon={PICK_ICON}
                  draggable
                  eventHandlers={{
                    dragend: (e) => {
                      const ll = (e.target as L.Marker).getLatLng();
                      pickOnMap(ll.lat, ll.lng);
                    },
                  }}
                />
              )}
            </MapContainer>
            {!selected && (
              <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 z-[500] px-2.5 py-1 rounded-md bg-surface-solid border border-subtle text-[11px] text-content-secondary shadow">
                {t('weather:locationDialog.clickToSet')}
              </div>
            )}
          </div>
        </div>

        {/* Readout + advanced coords */}
        <div className="px-4 pt-3">
          <div className="flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-content-secondary min-w-0">
              <MapPin className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              {selected ? (
                <span className="truncate">
                  {selected.name && <span className="text-content font-medium">{selected.name} · </span>}
                  <span className="tabular-nums text-content-secondary">{selected.lat.toFixed(5)}, {selected.lon.toFixed(5)}</span>
                </span>
              ) : (
                <span className="text-content-tertiary">{t('weather:locationDialog.noPoint')}</span>
              )}
            </div>
            <button
              onClick={() => setShowManual((v) => !v)}
              className="flex items-center gap-1 text-[11px] text-content-tertiary hover:text-content-secondary transition-colors shrink-0"
              data-tip={t('weather:locationDialog.typeCoordsTip')}
            >
              {t('weather:locationDialog.enterCoords')}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showManual ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {showManual && (
            <div className="mt-2 flex items-center gap-1.5">
              <input
                type="number"
                value={manualLat}
                onChange={(e) => setManualLat(e.target.value)}
                placeholder={t('common:lat')}
                className="w-0 flex-1 min-w-0 px-2 py-1.5 bg-surface-input border border-border rounded-md text-xs text-content tabular-nums focus:outline-none focus:border-blue-500"
              />
              <input
                type="number"
                value={manualLon}
                onChange={(e) => setManualLon(e.target.value)}
                placeholder={t('common:lon')}
                className="w-0 flex-1 min-w-0 px-2 py-1.5 bg-surface-input border border-border rounded-md text-xs text-content tabular-nums focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={applyManual}
                className="px-2.5 py-1.5 text-xs rounded-md bg-surface border border-subtle text-content-secondary hover:bg-surface-raised hover:text-content transition-colors shrink-0"
              >
                {t('common:go')}
              </button>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 mt-3 border-t border-subtle">
          <button
            onClick={resetAuto}
            disabled={!override}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg text-content-secondary hover:text-content hover:bg-surface-raised transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
            data-tip={t('weather:locationDialog.resetTip')}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {t('weather:locationDialog.resetAuto')}
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs rounded-lg text-content-secondary hover:text-content hover:bg-surface-raised transition-colors"
            >
              {t('common:cancel')}
            </button>
            <button
              onClick={confirm}
              disabled={!selected}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:hover:bg-blue-600"
            >
              <Check className="w-3.5 h-3.5" />
              {t('weather:locationDialog.useLocation')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
