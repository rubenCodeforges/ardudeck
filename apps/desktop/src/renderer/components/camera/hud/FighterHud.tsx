/**
 * Green fighter-style HUD — a ground-rendered graphical overlay (the kind
 * RubyFPV draws, NOT a font/DisplayPort OSD). Thin vector symbology: fixed
 * boresight, conformal climb-dive pitch ladder + horizon, the Flight Path
 * Marker (velocity vector), airspeed / altitude / heading tapes, and movable
 * corner readouts. Pure SVG in a 1600x900 viewBox, telemetry-driven.
 *
 * Driven by a HudConfig: which widgets show, colour / line weight / glow,
 * units, overall scale, and the positions of the movable widgets. In the OSD
 * Designer the movable widgets can be dragged (editable); over the live video
 * they're static.
 */

import { memo, useRef } from 'react';
import { headingTicks, verticalTapeTicks, pitchLadderRungs, wrap180 } from './hud-geometry';
import {
  type HudConfig,
  HUD_COLORS,
  unitProfile,
  DEFAULT_POSITIONS,
} from './hud-config';
import { HUD_READOUTS, formatReadout } from './hud-readouts';
import { ModuleHudInstruments } from './ModuleHudInstruments';
import {
  HUD_VIEWBOX_W,
  HUD_VIEWBOX_H,
  HUD_CENTER_X,
  HUD_CENTER_Y,
  HUD_PX_PER_DEG,
} from './hud-projection';

export interface FighterHudValues {
  roll: number;
  pitch: number;
  heading: number;
  airspeed: number;
  groundspeed: number;
  altitude: number;
  vario: number;
  throttle: number;
  vx?: number;
  vy?: number;
  vz?: number;
  batteryVoltage: number;
  batteryPercent: number;
  current?: number;
  mode: string;
  armed: boolean;
  distance: number;
  homeDirection: number;
  gForce?: number;
  gpsSats?: number;
  hdop?: number;
  lat?: number;
  lon?: number;
  windSpeed?: number;
  linkHistory?: number[];
  linkLabel?: string;
  /** Ground-vehicle values: steering output -100..100, autopilot nav solution. */
  steer?: number;
  wpDistance?: number;
  xtrackError?: number;
}

const VB_W = HUD_VIEWBOX_W;
const VB_H = HUD_VIEWBOX_H;
const CX = HUD_CENTER_X;
const CY = HUD_CENTER_Y;
const WARN = '#ff5a5a';

const PITCH_HALF_SPAN = 18;
const PITCH_BAND = 250;
const PX_PER_DEG = HUD_PX_PER_DEG;
const HDG_HALF = 45;
const HDG_BAND = 360;
const TAPE_BAND = 200;
const DEG = Math.PI / 180;

interface HudProps {
  v: FighterHudValues;
  config: HudConfig;
  /** Instrument arrangement: 'ground' uses config.widgetsGround. Default air. */
  profile?: 'air' | 'ground';
  editable?: boolean;
  onMovePosition?: (id: string, x: number, y: number) => void;
}

export const FighterHud = memo(function FighterHud({ v, config, profile = 'air', editable, onMovePosition }: HudProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const C = HUD_COLORS[config.color];
  const lw = config.lineWeight;
  const u = unitProfile(config.units);
  const w = profile === 'ground' ? config.widgetsGround : config.widgets;
  const pos = (id: string) => config.positions[id] ?? DEFAULT_POSITIONS[id] ?? { x: 0, y: 0 };

  const ladder = pitchLadderRungs(v.pitch, PITCH_HALF_SPAN, 5);
  const hdg = headingTicks(v.heading, HDG_HALF, 5, 15);
  const spdDisp = u.speed(v.airspeed > 0.2 ? v.airspeed : v.groundspeed);
  const altDisp = u.dist(v.altitude);
  const spd = verticalTapeTicks(spdDisp, u.spdHalf, u.spdStepMinor, u.spdStepMajor);
  const alt = verticalTapeTicks(altDisp, u.altHalf, u.altStepMinor, u.altStepMajor);

  // Flight Path Marker geometry.
  let course = v.heading;
  let fpa: number;
  if (v.vx != null && v.vy != null) {
    const gsH = Math.hypot(v.vx, v.vy);
    if (gsH > 0.5) course = (Math.atan2(v.vy, v.vx) / DEG + 360) % 360;
    fpa = Math.atan2(-(v.vz ?? 0), Math.max(gsH, 0.1)) / DEG;
  } else {
    fpa = Math.atan2(v.vario, Math.max(v.groundspeed, 0.1)) / DEG;
  }
  const fpmDX = Math.max(-26, Math.min(26, wrap180(course - v.heading))) * PX_PER_DEG;
  const fpmDY = Math.max(-16, Math.min(16, v.pitch - fpa)) * PX_PER_DEG;

  // Drag handling for movable widgets (designer only).
  const toViewBox = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const p = svg.createSVGPoint();
    p.x = clientX;
    p.y = clientY;
    const r = p.matrixTransform(ctm.inverse());
    return { x: r.x, y: r.y };
  };

  const startDrag = (id: string) => (e: React.PointerEvent) => {
    if (!editable || !onMovePosition) return;
    e.stopPropagation();
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const start = toViewBox(e.clientX, e.clientY);
    const base = pos(id);
    if (!start) return;
    const offX = base.x - start.x;
    const offY = base.y - start.y;
    const move = (ev: PointerEvent) => {
      const cur = toViewBox(ev.clientX, ev.clientY);
      if (!cur) return;
      const nx = Math.max(20, Math.min(VB_W - 20, cur.x + offX));
      const ny = Math.max(20, Math.min(VB_H - 20, cur.y + offY));
      onMovePosition(id, nx, ny);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const Movable = ({ id, width, height, anchorRight, children }: { id: string; width: number; height: number; anchorRight?: boolean; children: React.ReactNode }) => {
    const p = pos(id);
    return (
      <g transform={`translate(${p.x} ${p.y})`} style={{ pointerEvents: editable ? 'auto' : 'none', cursor: editable ? 'move' : 'default' }} onPointerDown={startDrag(id)}>
        {editable && (
          <rect x={anchorRight ? -width : 0} y={-height + 18} width={width} height={height} rx={6} fill="rgba(255,255,255,0.04)" stroke={C} strokeOpacity={0.4} strokeDasharray="5 4" strokeWidth={1.5} />
        )}
        {children}
      </g>
    );
  };

  const glow = config.glow
    ? `drop-shadow(0 0 3px ${C}) drop-shadow(0 1px 2px rgba(0,0,0,0.85))`
    : 'drop-shadow(0 1px 2px rgba(0,0,0,0.9))';

  return (
    <svg
      ref={svgRef}
      className="absolute inset-0 h-full w-full"
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ filter: glow, pointerEvents: 'none', fontFamily: 'ui-monospace, monospace' }}
    >
      <g stroke={C} fill={C} strokeWidth={2 * lw}>
        {/* fixed instrument cluster (scaled around centre) */}
        <g transform={`translate(${CX} ${CY}) scale(${config.scale}) translate(${-CX} ${-CY})`}>
          {/* pitch ladder + horizon (conformal) */}
          {(w.pitchLadder || w.horizon) && (
            <g transform={`rotate(${-v.roll} ${CX} ${CY})`}>
              {ladder.map((r) => {
                const y = CY + r.norm * PITCH_BAND;
                if (r.deg === 0) {
                  if (!w.horizon) return null;
                  return (
                    <g key="h" strokeWidth={2.5 * lw}>
                      <line x1={CX - 560} y1={y} x2={CX - 120} y2={y} />
                      <line x1={CX + 120} y1={y} x2={CX + 560} y2={y} />
                    </g>
                  );
                }
                if (!w.pitchLadder) return null;
                const up = r.deg > 0;
                const half = 150;
                const tick = up ? 16 : -16;
                return (
                  <g key={r.deg} strokeDasharray={up ? undefined : '12 9'}>
                    <line x1={CX - half} y1={y} x2={CX - 64} y2={y} />
                    <line x1={CX - half} y1={y} x2={CX - half} y2={y + tick} />
                    <line x1={CX + 64} y1={y} x2={CX + half} y2={y} />
                    <line x1={CX + half} y1={y} x2={CX + half} y2={y + tick} />
                    <text x={CX - half - 12} y={y + 7} fontSize={22} textAnchor="end" stroke="none">{r.deg}</text>
                    <text x={CX + half + 12} y={y + 7} fontSize={22} stroke="none">{r.deg}</text>
                  </g>
                );
              })}
            </g>
          )}

          {w.boresight && (
            <g strokeWidth={3 * lw} fill="none">
              <line x1={CX - 95} y1={CY} x2={CX - 32} y2={CY} />
              <line x1={CX - 32} y1={CY} x2={CX - 16} y2={CY + 17} />
              <line x1={CX + 32} y1={CY} x2={CX + 95} y2={CY} />
              <line x1={CX + 32} y1={CY} x2={CX + 16} y2={CY + 17} />
            </g>
          )}

          {w.fpm && (
            <g transform={`translate(${CX + fpmDX} ${CY + fpmDY})`} strokeWidth={3 * lw} fill="none">
              <circle cx={0} cy={0} r={17} />
              <line x1={17} y1={0} x2={45} y2={0} />
              <line x1={-17} y1={0} x2={-45} y2={0} />
              <line x1={0} y1={-17} x2={0} y2={-34} />
            </g>
          )}

          {w.bankArc && <BankArc roll={v.roll} c={C} lw={lw} />}
          {w.headingTape && <HeadingTape ticks={hdg} heading={v.heading} homeRel={v.homeDirection} c={C} lw={lw} />}
          {w.airspeedTape && <VTape x={300} ticks={spd} value={spdDisp} label={`AS ${u.speedUnit}`} side="left" c={C} lw={lw} />}
          {w.altitudeTape && <VTape x={VB_W - 300} ticks={alt} value={altDisp} label={`ALT ${u.distUnit}`} side="right" c={C} lw={lw} />}
          {w.vsi && <VertSpeed climb={v.vario} c={C} lw={lw} />}

          {/* Big ground-speed box (the rover's primary instrument): km/h in
              metric because nobody drives in m/s; imperial already reads mph. */}
          {w.groundSpeed && (() => {
            const spdVal = config.units === 'imperial' ? u.speed(v.groundspeed) : v.groundspeed * 3.6;
            const spdUnit = config.units === 'imperial' ? 'mph' : 'km/h';
            return (
              <g transform={`translate(${VB_W - 300} ${CY})`}>
                <rect x={-130} y={-52} width={210} height={104} fill="rgba(0,0,0,0.35)" strokeWidth={2.5 * lw} />
                <g stroke="none" fill={C}>
                  <text x={30} y={18} fontSize={64} fontWeight="bold" textAnchor="end">{Math.round(spdVal)}</text>
                  <text x={42} y={16} fontSize={22} opacity={0.75}>{spdUnit}</text>
                </g>
              </g>
            );
          })()}
        </g>

        {/* movable corner widgets */}
        {w.status && (
          <Movable id="status" width={300} height={150}>
            <g stroke="none" fill={C}>
              <text x={0} y={0} fontSize={32} fontWeight="bold">{(v.mode || 'UNKNOWN').toUpperCase()}</text>
              <text x={0} y={34} fontSize={26} fill={v.armed ? WARN : C}>{v.armed ? 'ARMED' : 'DISARMED'}</text>
              {v.gpsSats != null && <text x={0} y={64} fontSize={22}>SAT {v.gpsSats}</text>}
              <text x={0} y={94} fontSize={22}>THR {v.throttle.toFixed(0)}%{v.gForce ? ` · ${v.gForce.toFixed(1)}G` : ''}</text>
            </g>
          </Movable>
        )}

        {w.battery && (
          <Movable id="battery" width={260} height={80} anchorRight>
            <g stroke="none" fill={v.batteryPercent < 20 ? WARN : C} textAnchor="end">
              <text x={0} y={0} fontSize={32} fontWeight="bold">{v.batteryVoltage.toFixed(1)}V</text>
              <text x={0} y={32} fontSize={24}>{v.batteryPercent.toFixed(0)}%</text>
            </g>
          </Movable>
        )}

        {w.home && (
          <Movable id="home" width={200} height={80}>
            <g stroke="none">
              <g transform={`rotate(${v.homeDirection})`}>
                <polygon points="0,-24 10,9 0,1 -10,9" fill={C} />
              </g>
              <text x={0} y={44} textAnchor="middle" fontSize={22} fill={C}>
                HOME {v.distance >= 1000 ? `${(v.distance / 1000).toFixed(2)}km` : `${v.distance.toFixed(0)}m`}
              </text>
            </g>
          </Movable>
        )}

        {w.linkGraph && v.linkHistory && v.linkHistory.length > 1 && (
          <Movable id="linkGraph" width={320} height={110}>
            <LinkSparkline history={v.linkHistory} label={v.linkLabel} c={C} />
          </Movable>
        )}

        {/* Composable telemetry readouts - any value, placed anywhere. */}
        {HUD_READOUTS.map((r) => {
          if (!w[r.id]) return null;
          const out = formatReadout(r.id, v, u);
          return (
            <Movable key={r.id} id={r.id} width={190} height={48}>
              <g stroke="none" fill={C}>
                <text x={0} y={0} fontSize={18} opacity={0.6}>{out.label}</text>
                <text x={0} y={28} fontSize={30} fontWeight="bold">{out.value}</text>
              </g>
            </Movable>
          );
        })}
      </g>

      {/* Module-contributed instruments (e.g. a cargo's CCRP/CCIP reticle),
          drawn in the same viewBox so they line up with the built-ins. */}
      <ModuleHudInstruments v={v} config={config} />
    </svg>
  );
});


function BankArc({ roll, c, lw }: { roll: number; c: string; lw: number }) {
  const R = 300;
  const marks = [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60];
  return (
    <g fill="none" strokeWidth={2 * lw}>
      {marks.map((m) => {
        const a = (-90 + m) * DEG;
        const r2 = m % 30 === 0 ? R - 20 : R - 11;
        return <line key={m} x1={CX + R * Math.cos(a)} y1={CY + R * Math.sin(a)} x2={CX + r2 * Math.cos(a)} y2={CY + r2 * Math.sin(a)} />;
      })}
      <g transform={`rotate(${roll} ${CX} ${CY})`}>
        <polygon points={`${CX},${CY - R + 4} ${CX - 12},${CY - R + 26} ${CX + 12},${CY - R + 26}`} fill={c} stroke="none" />
      </g>
    </g>
  );
}

function HeadingTape({ ticks, heading, homeRel, c, lw }: { ticks: ReturnType<typeof headingTicks>; heading: number; homeRel: number; c: string; lw: number }) {
  const y = 70;
  const homeX = CX + (Math.max(-HDG_HALF, Math.min(HDG_HALF, homeRel)) / HDG_HALF) * HDG_BAND;
  return (
    <g>
      <line x1={CX - HDG_BAND} y1={y + 28} x2={CX + HDG_BAND} y2={y + 28} strokeWidth={1.5 * lw} opacity={0.55} />
      {ticks.map((t) => {
        const x = CX + t.norm * HDG_BAND;
        return (
          <g key={t.deg}>
            <line x1={x} y1={y + 28} x2={x} y2={t.major ? y + 12 : y + 20} strokeWidth={2 * lw} />
            {t.major && <text x={x} y={y + 6} textAnchor="middle" fontSize={t.cardinal ? 24 : 18} stroke="none" fill={c}>{t.cardinal ?? t.deg}</text>}
          </g>
        );
      })}
      {Math.abs(homeRel) <= HDG_HALF && <polygon points={`${homeX},${y + 30} ${homeX - 9},${y + 44} ${homeX + 9},${y + 44}`} fill="#ffd23f" stroke="none" />}
      <rect x={CX - 46} y={y - 26} width={92} height={30} fill="rgba(0,0,0,0.45)" stroke={c} strokeWidth={1.5 * lw} />
      <text x={CX} y={y - 4} textAnchor="middle" fontSize={24} stroke="none" fill={c}>{Math.round(heading) % 360}</text>
      <polygon points={`${CX},${y + 30} ${CX - 8},${y + 42} ${CX + 8},${y + 42}`} fill={c} stroke="none" />
    </g>
  );
}

function VTape({ x, ticks, value, label, side, c, lw }: { x: number; ticks: ReturnType<typeof verticalTapeTicks>; value: number; label: string; side: 'left' | 'right'; c: string; lw: number }) {
  const dir = side === 'left' ? -1 : 1;
  return (
    <g>
      <line x1={x} y1={CY - TAPE_BAND} x2={x} y2={CY + TAPE_BAND} strokeWidth={1.5 * lw} opacity={0.55} />
      {ticks.map((t) => {
        const yy = CY + t.norm * TAPE_BAND;
        const len = t.major ? 22 : 12;
        return (
          <g key={t.value}>
            <line x1={x} y1={yy} x2={x + dir * len} y2={yy} strokeWidth={2 * lw} />
            {t.major && <text x={x + dir * (len + 8)} y={yy + 6} textAnchor={side === 'left' ? 'end' : 'start'} fontSize={20} stroke="none" fill={c}>{t.value}</text>}
          </g>
        );
      })}
      <rect x={side === 'left' ? x - 102 : x + 8} y={CY - 19} width={94} height={38} fill="rgba(0,0,0,0.5)" stroke={c} strokeWidth={2 * lw} />
      <text x={side === 'left' ? x - 55 : x + 55} y={CY + 8} textAnchor="middle" fontSize={26} stroke="none" fill={c}>{value.toFixed(0)}</text>
      <text x={x} y={CY - TAPE_BAND - 14} textAnchor="middle" fontSize={18} stroke="none" fill={c} opacity={0.8}>{label}</text>
    </g>
  );
}

function VertSpeed({ climb, c, lw }: { climb: number; c: string; lw: number }) {
  const x = VB_W - 180;
  const max = 10;
  const y = CY - (Math.max(-max, Math.min(max, climb)) / max) * TAPE_BAND;
  return (
    <g>
      <line x1={x} y1={CY - TAPE_BAND} x2={x} y2={CY + TAPE_BAND} strokeWidth={1.5 * lw} opacity={0.45} />
      <line x1={x - 8} y1={CY} x2={x + 8} y2={CY} strokeWidth={1.5 * lw} opacity={0.45} />
      <line x1={x} y1={CY} x2={x} y2={y} strokeWidth={4 * lw} />
      <circle cx={x} cy={y} r={5} fill={c} stroke="none" />
      <text x={x} y={CY + TAPE_BAND + 22} textAnchor="middle" fontSize={18} stroke="none" fill={c} opacity={0.8}>VS {climb >= 0 ? '+' : ''}{climb.toFixed(1)}</text>
    </g>
  );
}

/** Link/throughput history graph drawn relative to the widget origin (top-left). */
function LinkSparkline({ history, label, c }: { history: number[]; label?: string; c: string }) {
  const w = 300;
  const h = 70;
  const n = history.length;
  const pts = history.map((val, i) => `${(i / (n - 1)) * w},${h - Math.max(0, Math.min(1, val)) * h}`).join(' ');
  return (
    <g>
      <rect x={-10} y={-20} width={w + 20} height={h + 38} rx={8} fill="rgba(0,0,0,0.4)" stroke={c} strokeOpacity={0.5} strokeWidth={1.5} />
      <text x={0} y={-2} fontSize={18} stroke="none" fill={c}>{label ?? 'LINK'}</text>
      <line x1={0} y1={h} x2={w} y2={h} strokeWidth={1} opacity={0.4} />
      <polyline points={pts} fill="none" stroke={c} strokeWidth={2} />
    </g>
  );
}
