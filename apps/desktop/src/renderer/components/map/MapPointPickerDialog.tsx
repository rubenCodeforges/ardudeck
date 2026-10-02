/**
 * Generic map-first point picker modal: click to drop a point, drag the pin to
 * refine, search a place, or type exact coordinates. Same interaction shape as
 * the weather briefing picker (which is coupled to weather-store); this one is
 * store-free - callers pass the initial point and receive the confirmed one.
 * Used by the SITL launcher to place the spawn location without typing coords.
 */
import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Search, Loader2, MapPin, X, Check, ChevronDown } from 'lucide-react';
import { useEditModeStore } from '../../stores/edit-mode-store';
import { MAP_LAYERS, type LayerKey, type MapLayer } from '../../../shared/map-layers';
import { SmoothWheelZoom } from './SmoothWheelZoom';
import { searchLocations, type GeocodeResult } from '../../utils/weather-api';

const FALLBACK_CENTER: [number, number] = [51.505, -0.09];
const FALLBACK_ZOOM = 4;
const PICK_ZOOM = 15;

const PICK_ICON = L.divIcon({
  className: 'point-pick-marker',
  html: `
    <div style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">
      <svg width="30" height="40" viewBox="0 0 30 40" fill="none">
        <path d="M15 39C15 39 28 24.5 28 14C28 6.8 22.2 1 15 1C7.8 1 2 6.8 2 14C2 24.5 15 39 15 39Z"
          fill="#10b981" stroke="#ffffff" stroke-width="2.5" stroke-linejoin="round"/>
        <circle cx="15" cy="14" r="5" fill="#ffffff"/>
      </svg>
    </div>
  `,
  iconSize: [30, 40],
  iconAnchor: [15, 38],
});

interface FlyTarget { lat: number; lng: number; token: number }

function PickController({
  onPick,
  flyTo,
}: {
  onPick: (lat: number, lng: number) => void;
  flyTo: FlyTarget | null;
}) {
  const map = useMap();
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  // A map born inside a fresh modal renders grey until invalidateSize runs
  // once it is visible - nudge on mount and track with a ResizeObserver.
  useEffect(() => {
    const nudge = () => { try { map.invalidateSize(); } catch { /* torn down */ } };
    const t1 = setTimeout(nudge, 60);
    const t2 = setTimeout(nudge, 260);
    const ro = new ResizeObserver(nudge);
    ro.observe(map.getContainer());
    return () => { clearTimeout(t1); clearTimeout(t2); ro.disconnect(); };
  }, [map]);
  useEffect(() => {
    if (!flyTo) return;
    map.setView([flyTo.lat, flyTo.lng], Math.max(map.getZoom(), PICK_ZOOM), { animate: true });
  }, [flyTo, map]);
  return null;
}

export function MapPointPickerDialog({
  title,
  subtitle,
  initial,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  subtitle?: string;
  /** Seed point; the map opens here. Null opens at a wide fallback view. */
  initial: { lat: number; lng: number } | null;
  confirmLabel?: string;
  onConfirm: (lat: number, lng: number) => void;
  onClose: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const mapLayerKey = useEditModeStore((s) => s.mapLayer);
  const layerKey: LayerKey = (mapLayerKey in MAP_LAYERS ? mapLayerKey : 'googleSat') as LayerKey;
  const layer = MAP_LAYERS[layerKey];

  const [selected, setSelected] = useState<{ lat: number; lng: number } | null>(initial);
  const initialView = useMemo<{ center: [number, number]; zoom: number }>(
    () => initial
      ? { center: [initial.lat, initial.lng], zoom: PICK_ZOOM }
      : { center: FALLBACK_CENTER, zoom: FALLBACK_ZOOM },
    // Init-only: MapContainer ignores later center/zoom changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [flyTo, setFlyTo] = useState<FlyTarget | null>(null);
  const flyToken = useRef(0);

  const [showManual, setShowManual] = useState(false);
  const [manualLat, setManualLat] = useState(initial ? initial.lat.toFixed(5) : '');
  const [manualLng, setManualLng] = useState(initial ? initial.lng.toFixed(5) : '');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

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

  const pickOnMap = (lat: number, lng: number) => {
    setSelected({ lat, lng });
    setManualLat(lat.toFixed(5));
    setManualLng(lng.toFixed(5));
  };

  const pickResult = (r: GeocodeResult) => {
    pickOnMap(r.lat, r.lon);
    setFlyTo({ lat: r.lat, lng: r.lon, token: ++flyToken.current });
    setQuery('');
    setResults([]);
  };

  const applyManual = () => {
    const lat = Number(manualLat);
    const lng = Number(manualLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
    setSelected({ lat, lng });
    setFlyTo({ lat, lng, token: ++flyToken.current });
  };

  const confirm = () => {
    if (!selected) return;
    onConfirm(selected.lat, selected.lng);
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[2000] bg-black/60 flex items-center justify-center p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-[min(92vw,880px)] max-h-[90vh] flex flex-col rounded-2xl border border-default bg-surface-solid shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-subtle">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
            <MapPin className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-content">{title}</h3>
            <p className="text-[11px] text-content-tertiary">
              {subtitle ?? t('map:mapPointPicker.subtitle')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md flex items-center justify-center text-content-tertiary hover:text-content hover:bg-surface-raised transition-colors"
            data-tip={t('common:close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

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
              placeholder={t('map:mapPointPicker.searchPlaceholder')}
              autoFocus
              className="w-full pl-9 pr-9 py-2 bg-surface-input border border-border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500"
            />
            {/* Leaflet panes reach z-index ~700 in the same stacking context,
                so the dropdown must clear them or it paints under the map. */}
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
                      {[r.admin1, r.country].filter(Boolean).join(', ')}
                      {[r.admin1, r.country].filter(Boolean).length > 0 && ' · '}
                      {r.lat.toFixed(3)}, {r.lon.toFixed(3)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

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
                  position={[selected.lat, selected.lng]}
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
                {t('map:mapPointPicker.clickHint')}
              </div>
            )}
          </div>
        </div>

        <div className="px-4 pt-3">
          <div className="flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-content-secondary min-w-0">
              <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              {selected ? (
                <span className="tabular-nums truncate">{selected.lat.toFixed(5)}, {selected.lng.toFixed(5)}</span>
              ) : (
                <span className="text-content-tertiary">{t('map:mapPointPicker.noPoint')}</span>
              )}
            </div>
            <button
              onClick={() => setShowManual((v) => !v)}
              className="flex items-center gap-1 text-[11px] text-content-tertiary hover:text-content-secondary transition-colors shrink-0"
              data-tip={t('map:mapPointPicker.enterCoordsTip')}
            >
              {t('map:mapPointPicker.enterCoords')}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showManual ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {showManual && (
            <div className="mt-2 flex items-center gap-1.5">
              <input
                type="number"
                value={manualLat}
                onChange={(e) => setManualLat(e.target.value)}
                placeholder={t('map:mapPointPicker.lat')}
                className="w-0 flex-1 min-w-0 px-2 py-1.5 bg-surface-input border border-border rounded-md text-xs text-content tabular-nums focus:outline-none focus:border-blue-500"
              />
              <input
                type="number"
                value={manualLng}
                onChange={(e) => setManualLng(e.target.value)}
                placeholder={t('map:mapPointPicker.lng')}
                className="w-0 flex-1 min-w-0 px-2 py-1.5 bg-surface-input border border-border rounded-md text-xs text-content tabular-nums focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={applyManual}
                className="px-2.5 py-1.5 rounded-md text-xs bg-surface-raised text-content hover:brightness-125 transition-colors shrink-0"
              >
                {t('common:go')}
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs text-content-secondary hover:text-content hover:bg-surface-raised transition-colors"
          >
            {t('common:cancel')}
          </button>
          <button
            onClick={confirm}
            disabled={!selected}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" />
            {confirmLabel ?? t('map:mapPointPicker.useThisPoint')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
