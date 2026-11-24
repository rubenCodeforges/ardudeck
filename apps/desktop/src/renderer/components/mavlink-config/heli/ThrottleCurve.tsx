import React, { useRef, useState } from 'react';

const W = 320;
const H = 180;
const L = 36;
const R = 12;
const T = 12;
const B = 28;
const COLOR = 'rgb(251, 146, 60)';

/** Throttle against collective; each point drags vertically and commits on release. */
export function ThrottleCurve({ values, onCommit, xLabel, yLabel }: {
  values: number[];
  onCommit: (index: number, value: number) => void;
  xLabel: string;
  yLabel: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ i: number; v: number } | null>(null);
  const x = (i: number) => L + (i / (values.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - Math.max(0, Math.min(100, v)) / 100) * (H - T - B);
  const valueAt = (clientY: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    const py = ((clientY - r.top) / r.height) * H;
    return Math.round(Math.max(0, Math.min(100, (1 - (py - T) / (H - T - B)) * 100)));
  };
  const shown = values.map((v, i) => (drag?.i === i ? drag.v : v));
  const path = shown.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(v)}`).join(' ');

  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full touch-none select-none">
      {[0, 25, 50, 75, 100].map((g) => (
        <g key={g}>
          <line x1={L} x2={W - R} y1={y(g)} y2={y(g)} stroke="var(--border-default)" strokeWidth={1} strokeDasharray={g % 50 ? '2 4' : undefined} />
          <text x={L - 6} y={y(g) + 3} textAnchor="end" fontSize={9} fontFamily="monospace" fill="var(--text-tertiary)">{g}</text>
        </g>
      ))}
      {values.map((_, i) => (
        <text key={i} x={x(i)} y={H - B + 14} textAnchor="middle" fontSize={9} fontFamily="monospace" fill="var(--text-tertiary)">{i * 25}</text>
      ))}
      <text x={(L + W - R) / 2} y={H - 3} textAnchor="middle" fontSize={10} fill="var(--text-secondary)">{xLabel}</text>
      <text x={10} y={(T + H - B) / 2} textAnchor="middle" fontSize={10} fill="var(--text-secondary)" transform={`rotate(-90 10 ${(T + H - B) / 2})`}>{yLabel}</text>
      <path d={`${path} L ${x(values.length - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`} fill={COLOR} fillOpacity={0.12} />
      <path d={path} fill="none" stroke={COLOR} strokeWidth={2.5} strokeLinejoin="round" />
      {shown.map((v, i) => (
        <g
          key={i}
          className="cursor-ns-resize"
          onPointerDown={(e) => {
            (e.target as Element).setPointerCapture(e.pointerId);
            setDrag({ i, v: valueAt(e.clientY) });
          }}
          onPointerMove={(e) => drag?.i === i && setDrag({ i, v: valueAt(e.clientY) })}
          onPointerUp={() => {
            if (drag?.i === i && drag.v !== values[i]) onCommit(i, drag.v);
            setDrag(null);
          }}
        >
          <circle cx={x(i)} cy={y(v)} r={12} fill="transparent" />
          <circle cx={x(i)} cy={y(v)} r={6} fill="var(--bg-base)" stroke={COLOR} strokeWidth={2.5} />
          <text x={x(i)} y={y(v) - 11} textAnchor="middle" fontSize={10} fontWeight="bold" fontFamily="monospace" fill={COLOR}>{v}%</text>
        </g>
      ))}
    </svg>
  );
}
