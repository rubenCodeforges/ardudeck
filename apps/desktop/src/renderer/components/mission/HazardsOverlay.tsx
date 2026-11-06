import { Fragment, useMemo } from 'react';
import { Circle, Marker, Polygon, Polyline } from 'react-leaflet';
import * as L from 'leaflet';
import { useHazardsStore } from '../../stores/hazards-store';
import { useMissionStore } from '../../stores/mission-store';
import { hazardCrossings } from '../../../shared/mission-validation';
import type { Hazard } from '../../../shared/hazard-types';

const RED = '#ef4444';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function labelPosition(h: Hazard): [number, number] {
  const s = h.shape;
  if (s.kind === 'circle') return [s.center.lat, s.center.lon];
  return [s.points.reduce((a, p) => a + p.lat, 0) / s.points.length, s.points.reduce((a, p) => a + p.lon, 0) / s.points.length];
}

/** Hazards on the planning map, read-only, with the legs that cross them in red. */
export function HazardsOverlay(): JSX.Element | null {
  const hazards = useHazardsStore((s) => s.hazards);
  const items = useMissionStore((s) => s.missionItems);
  const home = useMissionStore((s) => s.homePosition);

  const crossingLegs = useMemo(() => {
    const at = (seq: number | null): [number, number] | null => {
      if (seq === null) return home ? [home.lat, home.lon] : null;
      const it = items.find((i) => i.seq === seq);
      return it ? [it.latitude, it.longitude] : null;
    };
    return hazardCrossings(items, hazards, home)
      .map((c) => [at(c.fromSeq), at(c.toSeq)] as const)
      .filter((leg): leg is readonly [[number, number], [number, number]] => !!leg[0] && !!leg[1]);
  }, [items, hazards, home]);

  if (hazards.length === 0) return null;
  return (
    <>
      {hazards.map((h) => {
        const color = RED;
        const s = h.shape;
        const label = h.name;
        const icon = L.divIcon({
          className: '',
          iconSize: [0, 0],
          html: `<div style="transform:translate(-50%,-50%);display:inline-flex;align-items:center;gap:5px;white-space:nowrap;padding:3px 8px;border-radius:6px;background:rgba(59,20,20,0.92);border:1px solid ${color};color:#fecaca;font:600 12px/16px Inter,system-ui,sans-serif;pointer-events:none">`
            + `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fecaca" stroke-width="2.5" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`
            + `${escapeHtml(label)}</div>`,
        });
        return (
          <Fragment key={h.id}>
            {s.kind === 'circle' ? (
              <>
                <Circle center={[s.center.lat, s.center.lon]} radius={s.radiusM} pathOptions={{ color, weight: 2, fillColor: color, fillOpacity: 0.18 }} interactive={false} />
                <Circle center={[s.center.lat, s.center.lon]} radius={s.radiusM + h.bufferM} pathOptions={{ color, weight: 1, dashArray: '4 6', fill: false }} interactive={false} />
              </>
            ) : (
              <Polygon positions={s.points.map((p) => [p.lat, p.lon] as [number, number])} pathOptions={{ color, weight: 2, fillColor: color, fillOpacity: 0.18 }} interactive={false} />
            )}
            <Marker position={labelPosition(h)} icon={icon} interactive={false} keyboard={false} />
          </Fragment>
        );
      })}
      {crossingLegs.map(([a, b], i) => (
        <Polyline key={i} positions={[a, b]} pathOptions={{ color: RED, weight: 6, opacity: 0.9 }} interactive={false} />
      ))}
    </>
  );
}
