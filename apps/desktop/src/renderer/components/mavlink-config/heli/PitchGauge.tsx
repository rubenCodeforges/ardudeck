import React, { useRef, useState } from 'react';

export interface GaugeMarker {
  id: string;
  label: string;
  value: number;
  color: string;
  min: number;
  max: number;
  step: number;
  onCommit: (v: number) => void;
}

const W = 360;
const H = 260;
const TOP = 18;
const BOTTOM = H - 18;
const AXIS_X = 56;

/** A vertical scale with one draggable marker per setting, e.g. blade pitch min, zero thrust and max. */
export function PitchGauge({ markers, unit, lo, hi }: { markers: GaugeMarker[]; unit: string; lo: number; hi: number }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ id: string; value: number } | null>(null);
  const yOf = (v: number) => BOTTOM - ((v - lo) / (hi - lo)) * (BOTTOM - TOP);
  const valueAt = (clientY: number, m: GaugeMarker) => {
    const r = svgRef.current!.getBoundingClientRect();
    const y = ((clientY - r.top) / r.height) * H;
    const raw = lo + ((BOTTOM - y) / (BOTTOM - TOP)) * (hi - lo);
    const snapped = Math.round(raw / m.step) * m.step;
    return Math.max(m.min, Math.min(m.max, Number(snapped.toFixed(4))));
  };

  const span = hi - lo;
  const tickStep = span > 400 ? 100 : span > 40 ? 10 : span > 20 ? 5 : 2;
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / tickStep) * tickStep; v <= hi; v += tickStep) ticks.push(v);
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

  // labels keep 24 px apart; the dot stays on the true value and a leader line joins them
  const labelY = new Map<string, number>();
  const placed = markers
    .map((m) => ({ id: m.id, y: yOf(Math.max(lo, Math.min(hi, drag?.id === m.id ? drag.value : m.value))) }))
    .sort((a, b) => a.y - b.y);
  let prev = -Infinity;
  for (const p of placed) {
    const y = Math.max(p.y, prev + 24, TOP + 11);
    labelY.set(p.id, y);
    prev = y;
  }
  const overflow = prev - (BOTTOM - 11);
  if (overflow > 0) for (const [id, y] of labelY) labelY.set(id, y - overflow);

  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="mx-auto block h-auto w-full max-w-[440px] touch-none select-none">
      <rect x={AXIS_X - 4} y={TOP} width={8} height={BOTTOM - TOP} rx={4} fill="var(--border-default)" />
      {lo < 0 && hi > 0 && unit === '°' && <line x1={AXIS_X - 14} x2={AXIS_X + 14} y1={yOf(0)} y2={yOf(0)} stroke="var(--text-tertiary)" strokeWidth={1} />}
      {ticks.map((v) => (
        <g key={v}>
          <line x1={AXIS_X - 10} x2={AXIS_X - 5} y1={yOf(v)} y2={yOf(v)} stroke="var(--text-tertiary)" strokeWidth={1} />
          <text x={AXIS_X - 14} y={yOf(v) + 3} textAnchor="end" fontSize={10} fontFamily="monospace" fill="var(--text-tertiary)">{fmt(v)}{unit}</text>
        </g>
      ))}
      {markers.map((m) => {
        const v = drag?.id === m.id ? drag.value : m.value;
        const y = yOf(Math.max(lo, Math.min(hi, v)));
        const ly = labelY.get(m.id) ?? y;
        return (
          <g
            key={m.id}
            className="cursor-ns-resize"
            onPointerDown={(e) => {
              (e.target as Element).setPointerCapture(e.pointerId);
              setDrag({ id: m.id, value: valueAt(e.clientY, m) });
            }}
            onPointerMove={(e) => drag?.id === m.id && setDrag({ id: m.id, value: valueAt(e.clientY, m) })}
            onPointerUp={() => {
              if (drag?.id === m.id && drag.value !== m.value) m.onCommit(drag.value);
              setDrag(null);
            }}
          >
            <path d={`M ${AXIS_X} ${y} L ${AXIS_X + 14} ${y} L ${AXIS_X + 26} ${ly} L ${AXIS_X + 30} ${ly}`} fill="none" stroke={m.color} strokeWidth={2} />
            <circle cx={AXIS_X} cy={y} r={7} fill="var(--bg-base)" stroke={m.color} strokeWidth={3} />
            <rect x={AXIS_X + 30} y={ly - 11} width={W - AXIS_X - 34} height={22} rx={6} fill="var(--bg-surface-raised)" stroke={m.color} strokeOpacity={0.5} />
            <text x={AXIS_X + 40} y={ly + 4} fontSize={11} fill="var(--text-primary)">{m.label}</text>
            <text x={W - 12} y={ly + 4} textAnchor="end" fontSize={11} fontWeight="bold" fontFamily="monospace" fill={m.color}>{fmt(v)}{unit}</text>
          </g>
        );
      })}
    </svg>
  );
}
