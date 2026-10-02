/**
 * WindRoseCard — on-map wind rose at a clicked point (NOT a dialog).
 *
 * A faint ring centred on the click location with colored petals radiating in
 * each compass direction: petal length = how often the wind blows FROM that
 * sector across the forecast, petal colour = mean speed there. A white needle
 * shows the currently-scrubbed hour's direction, and a small readout pill gives
 * its speed/bearing. Rendered inside the Leaflet MapContainer (needs useMap),
 * portalled into the map container, centred on the projected point, following
 * pan/zoom. pointer-events are off so the map stays interactive underneath.
 */

import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useReducer } from 'react';
import { useMap } from 'react-leaflet';
import { createPortal } from 'react-dom';
import * as L from 'leaflet';
import { useWindStore } from '../../../stores/wind-store';
import { sampleWind, windVectorFromUV, compassPoint, computeWindRose, windColor, formatWindSpeed } from '../wind/wind-field';

const R = 90; // ring radius (px)
const M = 28; // margin for labels
const SIZE = 2 * (R + M);
const CC = R + M; // svg centre

function at(r: number, deg: number): { x: number; y: number } {
  const a = (deg * Math.PI) / 180;
  return { x: CC + r * Math.sin(a), y: CC - r * Math.cos(a) };
}

function wedge(dirDeg: number, span: number, r: number): string {
  if (r <= 0.5) return '';
  const p0 = at(r, dirDeg - span / 2);
  const p1 = at(r, dirDeg + span / 2);
  return `M ${CC} ${CC} L ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${r} ${r} 0 0 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} Z`;
}

export function WindRoseCard(): JSX.Element | null {
  const { t } = useTranslation();
  const map = useMap();
  const field = useWindStore((s) => s.field);
  const probe = useWindStore((s) => s.probe);
  const frameIndex = useWindStore((s) => s.frameIndex);
  const units = useWindStore((s) => s.units);
  const setProbe = useWindStore((s) => s.setProbe);
  const [, bump] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    map.on('move', bump);
    map.on('zoom', bump);
    return () => {
      map.off('move', bump);
      map.off('zoom', bump);
    };
  }, [map]);

  const closeRef = useCallback((el: HTMLButtonElement | null) => {
    if (el) L.DomEvent.disableClickPropagation(el);
  }, []);

  if (!field || !probe) return null;
  // Window the rose to the next 24 h from the scrubbed hour, so dragging the
  // timeline visibly shifts the petals (not a static all-forecast aggregate).
  const WINDOW = 24;
  const rose = computeWindRose(field, probe.lat, probe.lng, 16, frameIndex, frameIndex + WINDOW);
  if (!rose) return null;

  const frame = field.frames[frameIndex];
  const uv = frame ? sampleWind(field, frame, probe.lat, probe.lng) : null;
  const cur = uv ? windVectorFromUV(uv.u, uv.v) : null;
  const span = 360 / rose.bins.length - 4;

  const cp = map.latLngToContainerPoint([probe.lat, probe.lng]);
  const readout = cur ? `${compassPoint(cur.dirFromDeg)} · ${formatWindSpeed(cur.speed, units)}` : '-';

  return createPortal(
    <div style={{ position: 'absolute', left: cp.x, top: cp.y, width: SIZE, height: SIZE, transform: 'translate(-50%, -50%)', zIndex: 1000, pointerEvents: 'none' }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ overflow: 'visible' }}>
        <defs>
          <radialGradient id="windRoseHalo">
            <stop offset="0%" stopColor="#0b1220" stopOpacity="0.45" />
            <stop offset="72%" stopColor="#0b1220" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#0b1220" stopOpacity="0" />
          </radialGradient>
          {/* Per-petal speed gradient: calm-blue at the centre -> the sector's
              mean-speed colour at the tip (like Windy's gradient stripes). */}
          {rose.bins.map((b, i) => (
            <radialGradient key={i} id={`windPetal-${i}`} gradientUnits="userSpaceOnUse" cx={CC} cy={CC} r={Math.max(1, R * (b.freq / rose.maxFreq))}>
              <stop offset="0%" stopColor={windColor(0)} stopOpacity={0.55} />
              <stop offset="100%" stopColor={windColor(b.meanSpeed)} stopOpacity={0.95} />
            </radialGradient>
          ))}
        </defs>
        {/* soft dark halo so the rose reads on bright imagery, without a hard box */}
        <circle cx={CC} cy={CC} r={R + M} fill="url(#windRoseHalo)" />
        {[0.5, 1].map((f) => (
          <g key={f}>
            <circle cx={CC} cy={CC} r={R * f} fill="none" stroke="#0b1220" strokeOpacity={0.5} strokeWidth={2.5} />
            <circle cx={CC} cy={CC} r={R * f} fill="none" stroke="#ffffff" strokeOpacity={0.65} strokeWidth={1} />
          </g>
        ))}

        {/* colored petals (the "stripes"): length = frequency, colour = mean speed */}
        {rose.bins.map((b, i) => {
          const r = R * (b.freq / rose.maxFreq);
          const d = wedge(b.dirDeg, span, r);
          return d ? <path key={b.dirDeg} d={d} fill={`url(#windPetal-${i})`} stroke="#0b1220" strokeOpacity={0.35} strokeWidth={0.75} /> : null;
        })}

        {/* cardinal labels */}
        {([['N', 0], ['E', 90], ['S', 180], ['W', 270]] as Array<[string, number]>).map(([label, deg]) => {
          const p = at(R + 12, deg);
          return (
            <text key={label} x={p.x} y={p.y} fontSize={10} fill="#ffffff" stroke="#0b1220" strokeWidth={2.5}
              paintOrder="stroke" textAnchor="middle" dominantBaseline="central">{label}</text>
          );
        })}

        {/* current-hour direction needle (points the way the wind blows TO) */}
        {cur && cur.speed > 0.1 && (() => {
          const tip = at(R * 0.95, (cur.dirFromDeg + 180) % 360);
          return (
            <>
              <line x1={CC} y1={CC} x2={tip.x} y2={tip.y} stroke="#0b1220" strokeOpacity={0.55} strokeWidth={5} strokeLinecap="round" />
              <line x1={CC} y1={CC} x2={tip.x} y2={tip.y} stroke="#f8fafc" strokeWidth={2.5} strokeLinecap="round" />
            </>
          );
        })()}
        <circle cx={CC} cy={CC} r={5.5} fill="#0b1220" fillOpacity={0.6} />
        <circle cx={CC} cy={CC} r={3.5} fill="#ffffff" />

        {/* current reading pill at the bottom */}
        <g transform={`translate(${CC}, ${CC + R + 14})`}>
          <rect x={-46} y={-10} width={92} height={20} rx={10} fill="#0b1220" fillOpacity={0.8} />
          <text x={0} y={0} fontSize={11} fontWeight={600} fill="#ffffff" textAnchor="middle" dominantBaseline="central">{readout}</text>
        </g>
      </svg>

      <button
        ref={closeRef}
        type="button"
        onClick={() => setProbe(null)}
        data-tip={t('common:close')}
        style={{ position: 'absolute', left: '50%', top: -4, transform: 'translateX(-50%)', pointerEvents: 'auto' }}
        className="w-5 h-5 flex items-center justify-center rounded-full bg-surface-solid border border-subtle text-content-tertiary hover:text-content shadow"
      >
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>,
    map.getContainer(),
  );
}
