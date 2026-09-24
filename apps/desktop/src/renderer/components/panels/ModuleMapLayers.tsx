/** Module map layers (host.map), drawn under the host's own map drawing. */

import { useEffect, useState } from 'react';
import { Polyline, Polygon, Marker } from 'react-leaflet';
import L from 'leaflet';
import type { MapFeature, MapPoint } from '@ardudeck/module-sdk';
import {
  featuresOf,
  getModuleMapLayers,
  isLayerVisible,
  setLayerVisible,
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
