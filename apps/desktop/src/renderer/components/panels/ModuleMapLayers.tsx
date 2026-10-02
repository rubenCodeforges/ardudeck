/** Module map layers (host.map), drawn under the host's own map drawing. */

import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { Polyline, Polygon, Marker, useMapEvents } from 'react-leaflet';
import { useMapPicking } from '../../hooks/useMapPicking';
import L from 'leaflet';
import type { MapFeature, MapPoint } from '@ardudeck/module-sdk';
import {
  featuresOf,
  getModuleMapLayers,
  addPickPoint,
  cancelPick,
  finishPick,
  getPolygonPick,
  isLayerVisible,
  setLayerVisible,
  undoPickPoint,
  subscribeModuleMapLayers,
  type ModuleMapLayer,
} from '../../modules/module-map-registry';

const GLYPH: Record<string, string> = {
  dot: '●',
  takeoff: '▲',
  land: '▼',
  home: '⌂',
  warning: '⚠',
  flag: '⚑',
};

function latlngs(points: MapPoint[]): [number, number][] {
  return points.map((p) => [p.lat, p.lng]);
}

function markerIcon(icon: string, color: string, label?: string): L.DivIcon {
  const glyph = GLYPH[icon] ?? GLYPH.dot;
  const text = label
    ? `<div style="font:600 9px/1.2 system-ui;color:${color};text-align:center;
         max-width:74px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${label}</div>`
    : '';
  return L.divIcon({
    className: '',
    html: `<div style="display:flex;flex-direction:column;align-items:center">
        <div style="width:18px;height:18px;border-radius:50%;background:${color};
          border:1.5px solid #fff;color:#fff;font:11px/18px system-ui;text-align:center">${glyph}</div>
        ${text}
      </div>`,
    iconSize: [74, 32],
    iconAnchor: [37, 9],
  });
}

function Feature({ f, k }: { f: MapFeature; k: string }): JSX.Element | null {
  if (f.kind === 'polygon') {
    return (
      <Polygon
        key={k}
        positions={
          f.holes?.length
            ? [latlngs(f.points), ...f.holes.map(latlngs)]
            : latlngs(f.points)
        }
        pathOptions={{
          color: f.stroke,
          weight: f.strokeWidth ?? 2,
          dashArray: f.dash?.join(' '),
          fill: f.fill != null,
          fillColor: f.fill,
          fillOpacity: f.fillOpacity ?? 0.1,
        }}
      />
    );
  }
  if (f.kind === 'polyline') {
    return (
      <Polyline
        key={k}
        positions={latlngs(f.points)}
        pathOptions={{
          color: f.stroke,
          weight: f.strokeWidth ?? 2,
          dashArray: f.dash?.join(' '),
        }}
      />
    );
  }
  if (f.kind === 'marker') {
    return (
      <Marker
        key={k}
        position={[f.at.lat, f.at.lng]}
        icon={markerIcon(f.icon, f.color, f.label)}
        interactive={false}
      />
    );
  }
  return null;
}

export function ModuleMapLayers(): JSX.Element | null {
  const [layers, setLayers] = useState<ModuleMapLayer[]>(() => getModuleMapLayers());
  // The registry bumps this; the features live inside the module, where React
  // cannot see them change.
  const [, setTick] = useState(0);

  useEffect(
    () =>
      subscribeModuleMapLayers(() => {
        setLayers(getModuleMapLayers());
        setTick((n) => n + 1);
      }),
    [],
  );

  if (layers.length === 0) return null;

  return (
    <>
      {layers
        .filter((l) => isLayerVisible(l.key))
        .map((l) =>
          featuresOf(l).map((f, i) => <Feature key={`${l.key}:${i}`} k={`${l.key}:${i}`} f={f} />),
        )}
    </>
  );
}

/** Layer names and visibility, for the map's own layer control. */
export function useModuleMapLayerToggles(): {
  layers: ModuleMapLayer[];
  isVisible: (key: string) => boolean;
  toggle: (key: string) => void;
} {
  const [layers, setLayers] = useState<ModuleMapLayer[]>(() => getModuleMapLayers());
  const [, setTick] = useState(0);
  useEffect(
    () =>
      subscribeModuleMapLayers(() => {
        setLayers(getModuleMapLayers());
        setTick((n) => n + 1);
      }),
    [],
  );
  return {
    layers,
    isVisible: isLayerVisible,
    toggle: (key) => setLayerVisible(key, !isLayerVisible(key)),
  };
}


/**
 * The pilot drawing an area a module asked for. Clicks place corners, a
 * double click closes the ring, Escape cancels, and backspace takes one back.
 */
export function ModulePolygonPick(): JSX.Element | null {
  const [pick, setPick] = useState(getPolygonPick);
  useEffect(() => subscribeModuleMapLayers(() => setPick(getPolygonPick())), []);
  useMapPicking(pick !== null);

  useEffect(() => {
    if (!pick) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') cancelPick();
      else if (e.key === 'Enter') finishPick();
      else if (e.key === 'Backspace') undoPickPoint();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pick]);

  // Same gestures as the survey draw tool, because a pilot should not have to
  // learn a second way to draw a polygon: click adds, double click closes,
  // right click cancels, Escape cancels, Enter closes.
  useMapEvents({
    click: (e) => {
      if (getPolygonPick()) addPickPoint({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
    dblclick: (e) => {
      const p = getPolygonPick();
      if (!p) return;
      e.originalEvent.preventDefault();
      e.originalEvent.stopPropagation();
      // The double click's own two clicks already added their corners.
      if (p.points.length >= 3) finishPick();
    },
    contextmenu: (e) => {
      if (!getPolygonPick()) return;
      e.originalEvent.preventDefault();
      cancelPick();
    },
  });

  if (!pick) return null;
  const pts = pick.points;
  const ring: [number, number][] = pts.map((p) => [p.lat, p.lng]);

  return (
    <>
      {/* Closed once it is an area, so the shape being made is the shape. */}
      {pts.length >= 3 && (
        <Polygon
          positions={ring}
          pathOptions={{
            color: '#22c55e',
            weight: 2,
            dashArray: '6 4',
            fill: true,
            fillColor: '#22c55e',
            fillOpacity: 0.1,
          }}
        />
      )}
      {pts.length === 2 && (
        <Polyline positions={ring} pathOptions={{ color: '#22c55e', weight: 2, dashArray: '6 4' }} />
      )}
      {pts.map((p, i) => (
        <Marker
          key={`pick-${i}`}
          position={[p.lat, p.lng]}
          interactive={false}
          icon={L.divIcon({
            className: '',
            html:
              `<div style="width:11px;height:11px;border-radius:50%;background:${
                i === 0 ? '#fff' : '#22c55e'
              };border:2px solid ${i === 0 ? '#22c55e' : '#fff'};box-sizing:border-box"></div>`,
            iconSize: [11, 11],
            iconAnchor: [5.5, 5.5],
          })}
        />
      ))}
    </>
  );
}

/** The instruction bar, outside the map so it is not clipped by it. */
export function ModulePolygonPickBar(): JSX.Element | null {
  const { t } = useTranslation();
  const [pick, setPick] = useState(getPolygonPick);
  useEffect(() => subscribeModuleMapLayers(() => setPick(getPolygonPick())), []);

  // Clicking corners on a map drags a text selection across everything behind
  // it, so selection is off for as long as the pilot is drawing.
  useEffect(() => {
    if (!pick) return;
    const prev = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    return () => {
      document.body.style.userSelect = prev;
    };
  }, [pick]);

  if (!pick) return null;
  const n = pick.points.length;
  const ready = n >= 3;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-[1200] flex justify-center select-none">
      <div className="pointer-events-auto flex items-center gap-3 rounded-lg border border-subtle bg-surface-solid px-3 py-2 shadow-xl">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 20l6-16 4 9 3-4 3 11z" />
            </svg>
          </span>
          <div className="leading-tight">
            <div className="text-xs font-medium text-content">{pick.prompt}</div>
            <div className="text-[11px] text-content-tertiary tabular-nums">
              {ready
                ? t('panels:modulePolygonPick.cornersPlaced', { n })
                : t('panels:modulePolygonPick.cornersProgress', { n })}
            </div>
          </div>
        </div>

        <div className="h-7 w-px bg-subtle" />

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="rounded px-2 py-1 text-xs text-content-secondary hover:bg-surface-hover hover:text-content disabled:opacity-40"
            disabled={n === 0}
            onClick={undoPickPoint}
            data-tip={t('panels:modulePolygonPick.undoTip')}
          >
            {t('common:undo')}
          </button>
          <button
            type="button"
            className="rounded px-2 py-1 text-xs text-content-secondary hover:bg-surface-hover hover:text-content"
            onClick={cancelPick}
            data-tip={t('panels:modulePolygonPick.cancelTip')}
          >
            {t('common:cancel')}
          </button>
          <button
            type="button"
            className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!ready}
            onClick={finishPick}
            data-tip={t('panels:modulePolygonPick.doneTip')}
          >
            {t('common:done')}
          </button>
        </div>
      </div>
    </div>
  );
}
