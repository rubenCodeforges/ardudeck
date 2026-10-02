/**
 * MapSearchControl - the Area Editor's Go-To-Location search, ported to the
 * Leaflet mission map. Accepts "lat, lon" (resolved locally, offline) or a
 * place/address (geocoded in main via Nominatim), and flies the map there.
 */
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';
import type { GeocodeResult } from '../../../shared/overlay-types';

/** Parse "lat, lon" (or "lat lon") in decimal degrees. */
function parseLatLng(q: string): { lat: number; lng: number } | null {
  const m = q.trim().match(/^(-?\d{1,3}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = parseFloat(m[1]!);
  const lng = parseFloat(m[2]!);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export function MapSearchControl() {
  const { t } = useTranslation();
  const map = useMap();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<GeocodeResult[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  // Set when we programmatically change the query (after picking a result) so
  // the live-search effect doesn't immediately re-query for the chosen label.
  const skipSearchRef = useRef(false);

  const flyTo = useCallback(
    (lat: number, lng: number) => {
      map.flyTo([lat, lng], Math.max(map.getZoom(), 15), { duration: 0.8 });
    },
    [map],
  );

  const closeResults = () => {
    setResults(null);
    setMsg(null);
  };

  const pick = useCallback(
    (r: GeocodeResult) => {
      flyTo(r.lat, r.lon);
      skipSearchRef.current = true;
      setQ(r.label.split(',')[0] ?? '');
      setResults(null);
      setMsg(null);
    },
    [flyTo],
  );

  // Live, debounced geocoding as the user types. Coordinates resolve locally
  // (no network); short or empty queries just clear the dropdown.
  useEffect(() => {
    if (skipSearchRef.current) {
      skipSearchRef.current = false;
      return;
    }
    const query = q.trim();
    setMsg(null);
    if (!query || parseLatLng(query) || query.length < 3) {
      setResults(null);
      setBusy(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setBusy(true);
      window.electronAPI
        .geocodeSearch(query)
        .then((hits) => {
          if (cancelled) return;
          setResults(hits);
          setMsg(hits.length === 0 ? t('map:mapSearch.noMatch') : null);
        })
        .catch(() => {
          if (!cancelled) setMsg(t('map:mapSearch.failed'));
        })
        .finally(() => {
          if (!cancelled) setBusy(false);
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, t]);

  const submit = useCallback(async () => {
    const query = q.trim();
    if (!query) return;
    const coord = parseLatLng(query);
    if (coord) {
      flyTo(coord.lat, coord.lng);
      closeResults();
      return;
    }
    if (results && results.length > 0) {
      pick(results[0]!);
      return;
    }
    setBusy(true);
    try {
      const hits = await window.electronAPI.geocodeSearch(query);
      if (hits.length === 0) {
        setMsg(t('map:mapSearch.noMatch'));
        return;
      }
      pick(hits[0]!);
    } catch {
      setMsg(t('map:mapSearch.failed'));
    } finally {
      setBusy(false);
    }
  }, [q, results, flyTo, pick, t]);

  // Top-center: clear of the zoom control (top-left) and Layers (top-right).
  // Stop event propagation so typing/clicking never pans the map or drops WPs.
  return (
    <div
      className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] w-72 max-w-[50%] select-none"
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1.5 h-8 px-2 rounded-md bg-surface-solid border border-subtle shadow-lg">
        <svg className="w-4 h-4 text-content-tertiary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit();
            else if (e.key === 'Escape') closeResults();
          }}
          placeholder={t('map:mapSearch.placeholder')}
          aria-label={t('map:mapSearch.aria')}
          className="flex-1 min-w-0 bg-transparent text-xs text-content placeholder:text-content-tertiary focus:outline-none"
        />
        {busy && (
          <svg className="w-3.5 h-3.5 text-content-tertiary animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
      </div>

      {results && (
        <div className="mt-1 rounded-md bg-surface-solid border border-subtle shadow-xl overflow-hidden">
          {results.map((r, i) => (
            <button
              key={`${r.lat},${r.lon},${i}`}
              type="button"
              onClick={() => pick(r)}
              data-tip={r.label}
              className="w-full text-left px-2.5 py-1.5 text-[11px] text-content-secondary hover:bg-surface-raised hover:text-content transition-colors truncate"
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
      {msg && (
        <div className="mt-1 px-2 py-1 rounded bg-surface-solid border border-subtle text-[11px] text-amber-400 shadow-lg">
          {msg}
        </div>
      )}
    </div>
  );
}
