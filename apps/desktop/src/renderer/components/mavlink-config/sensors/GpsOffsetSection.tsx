// Staged edits only: a half-dragged antenna marker must never reach the EKF, so nothing is written until Apply.
import React, { useMemo, useRef, useState } from 'react';
import { Crosshair, Zap } from 'lucide-react';
import { DraftNumberInput } from '../../../hooks/useNumericDraft';
import { useParameterStore } from '../../../stores/parameter-store';
import { useConnectionStore } from '../../../stores/connection-store';
import {
  type Offsets,
  OFFSET_LIMIT_M,
  resolveOffsetScheme,
  clampOffset,
  offsetsEqual,
  offsetDistance,
  niceHalfRange,
  topViewToOffsets,
  offsetsToTopView,
  sideViewToOffsets,
  offsetsToSideView,
  offsetParamIds,
  dirtyParams,
  formatMeters,
} from './gps-offset';

const AXIS = {
  x: { label: 'X forward', chip: 'bg-sky-500/15 text-sky-400', dot: 'bg-sky-400', line: 'stroke-sky-400', focus: 'focus:ring-sky-500/70' },
  y: { label: 'Y right', chip: 'bg-emerald-500/15 text-emerald-400', dot: 'bg-emerald-400', line: 'stroke-emerald-400', focus: 'focus:ring-emerald-500/70' },
  z: { label: 'Z down', chip: 'bg-violet-500/15 text-violet-400', dot: 'bg-violet-400', line: 'stroke-violet-400', focus: 'focus:ring-violet-500/70' },
} as const;

const VIEW = 240;
const TOP = { c: 120, radius: 100 };
const SIDE = { cx: 120, cy: 170, ground: 212, dyMin: -134, dyMax: 32 };

function svgPoint(e: React.PointerEvent, el: SVGSVGElement) {
  const r = el.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) / r.width) * VIEW,
    y: ((e.clientY - r.top) / r.height) * VIEW,
  };
}

function AxisChip({ axis, text }: { axis: keyof typeof AXIS; text: string }) {
  return (
    <span className={`px-1.5 py-px rounded text-[9px] font-semibold uppercase tracking-wide ${AXIS[axis].chip}`}>
      {text}
    </span>
  );
}

function FcChip({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect x={-7} y={-7} width={14} height={14} rx={3} className="fill-surface-raised stroke-current text-content" strokeOpacity={0.55} />
      <text textAnchor="middle" dominantBaseline="central" fontSize={6.5} fontWeight={700} className="fill-current text-content">
        FC
      </text>
    </g>
  );
}

function LeaderChip({ mx, my, meters }: { mx: number; my: number; meters: number }) {
  return (
    <g transform={`translate(${mx}, ${my})`} pointerEvents="none">
      <rect x={-19} y={-8} width={38} height={16} rx={8} className="fill-surface stroke-teal-500/40" strokeWidth={1} />
      <text textAnchor="middle" dominantBaseline="central" fontSize={8} className="fill-current text-teal-400 font-mono">
        {formatMeters(meters)}m
      </text>
    </g>
  );
}

function AntennaPuck({ dragging, unset }: { dragging: boolean; unset: boolean }) {
  return (
    <>
      {unset && <circle r={15} className="fill-teal-400/20 animate-ping" />}
      <circle r={dragging ? 15 : 11} className="fill-teal-400/25 transition-all duration-150" />
      <circle r={8} className="fill-surface stroke-teal-400" strokeWidth={2} />
      <line x1={-4.5} y1={0} x2={4.5} y2={0} className="stroke-teal-400" strokeWidth={1.5} />
      <line x1={0} y1={-4.5} x2={0} y2={4.5} className="stroke-teal-400" strokeWidth={1.5} />
      <circle r={1.8} className="fill-teal-400" />
    </>
  );
}

export const GpsOffsetSection: React.FC = () => {
  const parameters = useParameterStore((s) => s.parameters);
  const paramsLoaded = useParameterStore((s) => s.downloadState === 'complete');
  const setParameter = useParameterStore((s) => s.setParameter);
  const isConnected = useConnectionStore((s) => s.connectionState.isConnected);

  const [gps, setGps] = useState<1 | 2>(1);
  const [pending, setPending] = useState<Map<string, number>>(new Map());
  const [applying, setApplying] = useState(false);
  const [dragging, setDragging] = useState<'top' | 'side' | null>(null);
  const topRef = useRef<SVGSVGElement>(null);
  const sideRef = useRef<SVGSVGElement>(null);
  const frozenScale = useRef<number | null>(null);

  const scheme = useMemo(() => resolveOffsetScheme((id) => parameters.has(id)), [parameters]);
  const editable = isConnected && paramsLoaded && scheme !== null;
  // PX4 has a single estimator lever arm, so there is no second receiver to offer.
  const gps2Available = scheme !== null && scheme !== 'px4' && parameters.has(offsetParamIds(scheme, 2).x);
  const ids = offsetParamIds(scheme ?? 'modern', gps);

  const current: Offsets = useMemo(
    () => ({
      x: parameters.get(ids.x)?.value ?? 0,
      y: parameters.get(ids.y)?.value ?? 0,
      z: parameters.get(ids.z)?.value ?? 0,
    }),
    [parameters, ids.x, ids.y, ids.z],
  );

  const staged: Offsets = {
    x: pending.get(ids.x) ?? current.x,
    y: pending.get(ids.y) ?? current.y,
    z: pending.get(ids.z) ?? current.z,
  };

  const dirty = dirtyParams(ids, current, staged);
  const unset = offsetsEqual(staged.x, 0) && offsetsEqual(staged.y, 0) && offsetsEqual(staged.z, 0);

  const maxAbs = Math.max(Math.abs(staged.x), Math.abs(staged.y), Math.abs(staged.z));
  const liveHalfRange = niceHalfRange(maxAbs);
  const halfRange = dragging && frozenScale.current !== null ? frozenScale.current : liveHalfRange;
  const pxPerMeter = TOP.radius / halfRange;

  const stage = (axis: 'x' | 'y' | 'z', value: number) => {
    const id = ids[axis];
    const v = clampOffset(value);
    setPending((prev) => {
      const next = new Map(prev);
      if (offsetsEqual(v, current[axis])) next.delete(id);
      else next.set(id, v);
      return next;
    });
  };

  const apply = async () => {
    setApplying(true);
    try {
      for (const { id, value } of dirty) await setParameter(id, value);
      setPending(new Map());
    } finally {
      setApplying(false);
    }
  };

  const dragTop = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!topRef.current || !editable) return;
    const p = svgPoint(e, topRef.current);
    const { x, y } = topViewToOffsets(p.x - TOP.c, p.y - TOP.c, pxPerMeter);
    stage('x', x);
    stage('y', y);
  };

  const dragSide = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!sideRef.current || !editable) return;
    const p = svgPoint(e, sideRef.current);
    const { x, z } = sideViewToOffsets(p.x - SIDE.cx, p.y - SIDE.cy, pxPerMeter);
    stage('x', x);
    stage('z', z);
  };

  const startDrag = (view: 'top' | 'side', move: (e: React.PointerEvent<SVGSVGElement>) => void) =>
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!editable) return;
      frozenScale.current = liveHalfRange;
      setDragging(view);
      e.currentTarget.setPointerCapture(e.pointerId);
      move(e);
    };

  const endDrag = (e: React.PointerEvent<SVGSVGElement>) => {
    setDragging(null);
    frozenScale.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  if (isConnected && paramsLoaded && scheme === null) return null;

  const top = offsetsToTopView(staged.x, staged.y, pxPerMeter);
  const side = offsetsToSideView(staged.x, staged.z, pxPerMeter);
  const sideDx = Math.max(-104, Math.min(104, side.dx));
  const sideDy = Math.max(SIDE.dyMin, Math.min(SIDE.dyMax, side.dy));
  const topDist = Math.hypot(staged.x, staged.y);
  const sideDist = Math.hypot(staged.x, staged.z);
  const ringStep = halfRange / 2;
  const markerMotion = dragging ? '' : 'transition-transform duration-150 ease-out';
  const svgCursor = !editable ? 'opacity-55' : dragging ? 'cursor-grabbing' : 'cursor-grab';
  const diag = Math.SQRT1_2;

  const axisRow = (axis: 'x' | 'y' | 'z') => (
    <label key={axis} className="flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full shrink-0 ${AXIS[axis].dot}`} />
      <span className="w-16 shrink-0 text-xs font-medium text-content-secondary">{AXIS[axis].label}</span>
      <DraftNumberInput
        step={0.01}
        min={-OFFSET_LIMIT_M}
        max={OFFSET_LIMIT_M}
        value={staged[axis]}
        disabled={!editable}
        live
        onCommit={(v) => stage(axis, v)}
        data-tip={axis === 'z' ? 'Antenna above the flight controller = negative Z' : undefined}
        className={`w-24 px-2 py-1.5 text-sm font-mono rounded-md bg-surface-input border text-content focus:outline-none focus:ring-1 ${AXIS[axis].focus} disabled:opacity-50 ${
          pending.has(ids[axis]) ? 'border-amber-500/60' : 'border-subtle'
        }`}
      />
      <span className="text-xs text-content-tertiary">m</span>
    </label>
  );

  return (
    <div className="bg-surface rounded-xl border border-subtle p-4 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-teal-500/20 flex items-center justify-center">
          <Crosshair className="w-5 h-5 text-teal-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-medium text-content">GPS Antenna Position</h3>
          <p
            className="text-xs text-content-secondary"
            data-tip="With the lever arm set, the EKF reports the vehicle's body position instead of the antenna's - unset, RTK centimeters are wasted on airframes where the antenna sits away from the flight controller."
          >
            Drag the antenna to where it sits relative to the flight controller.
          </p>
        </div>
        {gps2Available && (
          <div className="flex rounded-lg border border-subtle overflow-hidden">
            {([1, 2] as const).map((n) => (
              <button
                key={n}
                onClick={() => { setGps(n); setPending(new Map()); }}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  gps === n ? 'bg-teal-500/20 text-teal-300' : 'text-content-secondary hover:text-content'
                }`}
              >
                GPS {n}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[minmax(220px,260px)_minmax(220px,260px)_minmax(220px,1fr)] gap-3 items-stretch">
        {/* Top view */}
        <div className="rounded-lg bg-surface-inset border border-subtle p-2.5 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-semibold uppercase tracking-widest text-content-tertiary">Top view</span>
            <div className="flex gap-1">
              <AxisChip axis="x" text="X fwd" />
              <AxisChip axis="y" text="Y right" />
            </div>
          </div>
          <svg
            ref={topRef}
            viewBox={`0 0 ${VIEW} ${VIEW}`}
            className={`w-full touch-none select-none ${svgCursor}`}
            onPointerDown={startDrag('top', dragTop)}
            onPointerMove={(e) => dragging === 'top' && dragTop(e)}
            onPointerUp={endDrag}
          >
            <line x1={TOP.c} y1={14} x2={TOP.c} y2={VIEW - 14} className={AXIS.x.line} strokeOpacity={dragging === 'top' ? 0.7 : 0.22} />
            <line x1={14} y1={TOP.c} x2={VIEW - 14} y2={TOP.c} className={AXIS.y.line} strokeOpacity={dragging === 'top' ? 0.7 : 0.22} />
            {[1, 2].map((i) => {
              const r = (TOP.radius / 2) * i;
              const lx = TOP.c - r * diag;
              const ly = TOP.c - r * diag;
              return (
                <g key={i}>
                  <circle cx={TOP.c} cy={TOP.c} r={r} fill="none" className="stroke-current text-content-tertiary" strokeOpacity={0.4} strokeDasharray="2 3" />
                  <g transform={`translate(${lx}, ${ly})`}>
                    <rect x={-17} y={-7} width={34} height={13} rx={6.5} className="fill-surface-raised stroke-current text-content-tertiary" strokeOpacity={0.3} strokeWidth={0.75} />
                    <text textAnchor="middle" dominantBaseline="central" fontSize={7.5} className="fill-current text-content-tertiary font-mono">
                      {formatMeters(ringStep * i)}m
                    </text>
                  </g>
                </g>
              );
            })}

            <g className="text-content-secondary">
              <path
                d={`M ${TOP.c - 58} ${TOP.c - 58} L ${TOP.c + 58} ${TOP.c + 58} M ${TOP.c + 58} ${TOP.c - 58} L ${TOP.c - 58} ${TOP.c + 58}`}
                className="stroke-current"
                strokeWidth={9}
                strokeLinecap="round"
                fill="none"
                opacity={0.9}
              />
              {([[-58, -58], [58, -58], [-58, 58], [58, 58]] as const).map(([dx, dy]) => (
                <g key={`${dx}${dy}`} transform={`translate(${TOP.c + dx}, ${TOP.c + dy})`}>
                  <circle r={15} className="fill-current" opacity={0.9} />
                  <circle r={15} fill="none" className="stroke-current text-content" strokeOpacity={0.35} />
                  <circle r={4.5} className="fill-surface-inset" />
                </g>
              ))}
              <circle cx={TOP.c} cy={TOP.c} r={18} className="fill-current" opacity={0.95} />
              <path d={`M ${TOP.c} ${TOP.c - 36} l 7 13 h -14 z`} className="fill-current text-content" opacity={0.85} />
            </g>
            <FcChip x={TOP.c} y={TOP.c} />

            {topDist > 0.02 && (
              <>
                <line x1={TOP.c} y1={TOP.c} x2={TOP.c + top.dx} y2={TOP.c + top.dy} className="stroke-teal-400" strokeWidth={2} strokeDasharray="5 3" />
                <LeaderChip
                  mx={Math.min(VIEW - 21, Math.max(21, TOP.c + top.dx))}
                  my={Math.min(VIEW - 10, Math.max(10, TOP.c + top.dy - 24))}
                  meters={topDist}
                />
              </>
            )}
            <g transform={`translate(${TOP.c + top.dx}, ${TOP.c + top.dy})`} className={markerMotion}>
              <AntennaPuck dragging={dragging === 'top'} unset={unset} />
            </g>
          </svg>
        </div>

        {/* Side view */}
        <div className="rounded-lg bg-surface-inset border border-subtle p-2.5 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-semibold uppercase tracking-widest text-content-tertiary">Side view</span>
            <div className="flex gap-1">
              <AxisChip axis="x" text="X fwd" />
              <AxisChip axis="z" text="Z down" />
            </div>
          </div>
          <svg
            ref={sideRef}
            viewBox={`0 0 ${VIEW} ${VIEW}`}
            className={`w-full touch-none select-none ${svgCursor}`}
            onPointerDown={startDrag('side', dragSide)}
            onPointerMove={(e) => dragging === 'side' && dragSide(e)}
            onPointerUp={endDrag}
          >
            <rect x={0} y={SIDE.ground} width={VIEW} height={VIEW - SIDE.ground} className="fill-current text-content-tertiary" opacity={0.12} />
            <line x1={0} y1={SIDE.ground} x2={VIEW} y2={SIDE.ground} className="stroke-current text-content-tertiary" strokeOpacity={0.5} />

            <line x1={SIDE.cx} y1={30} x2={SIDE.cx} y2={SIDE.ground - 4} className={AXIS.z.line} strokeOpacity={dragging === 'side' ? 0.7 : 0.22} />
            <line x1={14} y1={SIDE.cy} x2={VIEW - 14} y2={SIDE.cy} className={AXIS.x.line} strokeOpacity={dragging === 'side' ? 0.7 : 0.22} />

            <g transform={`translate(${SIDE.cx}, 16)`}>
              <rect x={-22} y={-8} width={44} height={15} rx={7.5} className="fill-violet-500/15" />
              <text textAnchor="middle" dominantBaseline="central" fontSize={7.5} fontWeight={700} className="fill-current text-violet-400">
                UP = -Z
              </text>
            </g>
            <g transform={`translate(${SIDE.cx}, ${VIEW - 12})`}>
              <rect x={-28} y={-8} width={56} height={15} rx={7.5} className="fill-violet-500/15" />
              <text textAnchor="middle" dominantBaseline="central" fontSize={7.5} fontWeight={700} className="fill-current text-violet-400">
                DOWN = +Z
              </text>
            </g>

            <g className="text-content-secondary">
              {/* landing gear */}
              <g className="stroke-current" strokeWidth={2.5} strokeLinecap="round" opacity={0.8}>
                {[-1, 1].map((s) => (
                  <line key={s} x1={SIDE.cx + s * 15} y1={SIDE.cy + 8} x2={SIDE.cx + s * 24} y2={SIDE.cy + 30} />
                ))}
                {[-1, 1].map((s) => (
                  <line key={`f${s}`} x1={SIDE.cx + s * 12} y1={SIDE.cy + 30} x2={SIDE.cx + s * 33} y2={SIDE.cy + 30} />
                ))}
              </g>

              {/* fuselage, nose forward (+X, to the right) */}
              <path
                d={`M ${SIDE.cx - 33} ${SIDE.cy - 10}
                    L ${SIDE.cx + 30} ${SIDE.cy - 9}
                    Q ${SIDE.cx + 51} ${SIDE.cy - 8} ${SIDE.cx + 51} ${SIDE.cy}
                    Q ${SIDE.cx + 51} ${SIDE.cy + 8} ${SIDE.cx + 30} ${SIDE.cy + 9}
                    L ${SIDE.cx - 33} ${SIDE.cy + 10}
                    Q ${SIDE.cx - 45} ${SIDE.cy + 10} ${SIDE.cx - 45} ${SIDE.cy}
                    Q ${SIDE.cx - 45} ${SIDE.cy - 10} ${SIDE.cx - 33} ${SIDE.cy - 10} Z`}
                className="fill-current"
                opacity={0.95}
              />

              {/* rotor booms */}
              <g className="stroke-current" strokeWidth={4} strokeLinecap="round" opacity={0.9}>
                {[-1, 1].map((s) => (
                  <line key={s} x1={SIDE.cx + s * 11} y1={SIDE.cy - 7} x2={SIDE.cx + s * 28} y2={SIDE.cy - 15} />
                ))}
              </g>

              {/* motor bells + edge-on prop discs */}
              {[-28, 28].map((dx) => (
                <g key={dx}>
                  <rect x={SIDE.cx + dx - 5} y={SIDE.cy - 21} width={10} height={9} rx={2.5} className="fill-current" opacity={0.95} />
                  <ellipse cx={SIDE.cx + dx} cy={SIDE.cy - 23} rx={22} ry={2.6} className="fill-current" opacity={0.45} />
                  <ellipse cx={SIDE.cx + dx} cy={SIDE.cy - 23} rx={22} ry={2.6} fill="none" className="stroke-current" strokeOpacity={0.3} strokeWidth={0.75} />
                </g>
              ))}
            </g>
            <FcChip x={SIDE.cx} y={SIDE.cy} />

            {sideDist > 0.02 && (
              <>
                <line x1={SIDE.cx} y1={SIDE.cy} x2={SIDE.cx + sideDx} y2={SIDE.cy + sideDy} className="stroke-teal-400" strokeWidth={2} strokeDasharray="5 3" />
                <LeaderChip
                  mx={Math.min(VIEW - 21, Math.max(21, SIDE.cx + sideDx))}
                  my={Math.min(VIEW - 10, Math.max(10, SIDE.cy + sideDy - 24))}
                  meters={sideDist}
                />
              </>
            )}
            <g transform={`translate(${SIDE.cx + sideDx}, ${SIDE.cy + sideDy})`} className={markerMotion}>
              <AntennaPuck dragging={dragging === 'side'} unset={unset} />
            </g>
          </svg>
        </div>

        {/* Controls */}
        <div className="rounded-lg bg-surface-inset border border-subtle p-3 flex flex-col gap-2.5">
          <span className="text-[9px] font-semibold uppercase tracking-widest text-content-tertiary">Offsets</span>
          {axisRow('x')}
          {axisRow('y')}
          {axisRow('z')}
          <div className="mt-auto space-y-2">
            {!editable && (
              <p className="text-xs text-amber-400">
                {!isConnected ? 'Connect a vehicle to edit.' : 'Waiting for parameters...'}
              </p>
            )}
            <div className="flex items-center justify-between rounded-lg bg-teal-500/10 border border-teal-500/25 px-2.5 py-2">
              <span className="text-xs text-content-secondary">Lever arm</span>
              <span className="text-sm font-mono text-teal-400">{formatMeters(offsetDistance(staged))} m</span>
            </div>
          </div>
        </div>
      </div>

      {dirty.length > 0 && (
        <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
          <Zap className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="flex-1 text-sm text-amber-300">
            {dirty.length} change{dirty.length === 1 ? '' : 's'} staged. Nothing is written to the vehicle until Apply.
          </span>
          <button
            onClick={() => setPending(new Map())}
            disabled={applying}
            className="px-2.5 py-1.5 rounded-md text-xs text-content-secondary hover:text-content hover:bg-surface-raised transition-colors"
          >
            Discard
          </button>
          <button
            onClick={() => { void apply(); }}
            disabled={applying || !editable}
            className="px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-60 transition-colors"
          >
            {applying ? 'Applying...' : 'Apply'}
          </button>
        </div>
      )}
    </div>
  );
};
