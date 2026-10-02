/**
 * RoundGauge: shared circular-instrument face for the floating map gauges.
 *
 * Theme-aware via the --gauge-* CSS vars in globals.css: dark faces with
 * white markings in dark theme, white faces with near-black markings in
 * light (max contrast per theme; mid-grey markings are banned in both).
 * All instrument colors (including strips and center text) must come from
 * GAUGE_COLORS / the --gauge-* vars, never fixed hex or text-white.
 */
import type { ReactNode } from 'react';

export const GAUGE_DIAMETER = 104;
const C = GAUGE_DIAMETER / 2;
const FACE_R = 44;

export const GAUGE_COLORS = {
  bezel: 'var(--gauge-bezel)',
  bezelEdge: 'var(--gauge-bezel-edge)',
  face: 'var(--gauge-face)',
  tickMajor: 'var(--gauge-tick-major)',
  tickMinor: 'var(--gauge-tick-minor)',
  text: 'var(--gauge-text)', // i18n-exempt: css var
  textDim: 'var(--gauge-text-dim)',
  needle: 'var(--gauge-needle)',
  north: '#ef4444',
  lubber: 'var(--gauge-amber)',
  green: 'var(--gauge-green)',
  amber: 'var(--gauge-amber)',
  red: 'var(--gauge-red)',
} as const;

/** Point on the gauge at radius r, angle in degrees (0 = up, clockwise). */
export function gaugePoint(r: number, angleDeg: number): [number, number] {
  const rad = (angleDeg * Math.PI) / 180;
  return [C + r * Math.sin(rad), C - r * Math.cos(rad)];
}

/** SVG arc path at radius r from one angle to another, clockwise. */
export function gaugeArcPath(r: number, fromDeg: number, toDeg: number): string {
  const [x1, y1] = gaugePoint(r, fromDeg);
  const [x2, y2] = gaugePoint(r, toDeg);
  const large = toDeg - fromDeg > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

export interface GaugeZone {
  from: number;
  to: number;
  color: string;
}

export interface GaugeScale {
  min: number;
  max: number;
  /** Degrees, 0 = up, clockwise; endAngle > startAngle. */
  startAngle: number;
  endAngle: number;
  zones?: GaugeZone[];
  majorTicks?: number[];
  minorTicks?: number[];
}

export function valueToAngle(value: number, scale: GaugeScale): number {
  const clamped = Math.max(scale.min, Math.min(scale.max, value));
  const t = (clamped - scale.min) / (scale.max - scale.min || 1);
  return scale.startAngle + t * (scale.endAngle - scale.startAngle);
}

interface RoundGaugeProps {
  label: string;
  scale?: GaugeScale;
  /** Needle value; null parks the needle at scale min (no-data). Omit for no needle. */
  needleValue?: number | null;
  /** 'fill' paints an arc from scale start to the value instead of a needle. */
  mode?: 'needle' | 'fill';
  fillColor?: string;
  /** Extra SVG (segment rings, rose, VSI) layered above the face, below the needle. */
  svgContent?: ReactNode;
  /** HTML center slot: big mono value plus small secondary lines. */
  children?: ReactNode;
}

export function RoundGauge({ label, scale, needleValue, mode = 'needle', fillColor, svgContent, children }: RoundGaugeProps): JSX.Element {
  const angle = scale && needleValue !== undefined
    ? valueToAngle(needleValue ?? scale.min, scale)
    : null;

  return (
    <div
      className="relative rounded-full shadow-xl select-none font-mono"
      style={{ width: GAUGE_DIAMETER, height: GAUGE_DIAMETER }}
    >
      <svg width={GAUGE_DIAMETER} height={GAUGE_DIAMETER} viewBox={`0 0 ${GAUGE_DIAMETER} ${GAUGE_DIAMETER}`}>
        <defs>
          {/* Shared ids across gauge instances resolve to identical content,
              so the document-global id lookup is harmless. */}
          <linearGradient id="adgi-bezel" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--gauge-bezel)' }} />
            <stop offset="1" style={{ stopColor: 'var(--gauge-bezel-2)' }} />
          </linearGradient>
          <radialGradient id="adgi-sheen" cx="0.5" cy="0.32" r="0.7">
            <stop offset="0" stopColor="rgba(255,255,255,0.09)" />
            <stop offset="1" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
        </defs>
        {/* Bezel: gradient metal ring, grounded by a dark outer edge, with a
            recessed rim shadow where the face sits. Flat single-color rings
            read as stickers over bright map imagery. */}
        <circle cx={C} cy={C} r={C - 0.75} fill="url(#adgi-bezel)" stroke="rgba(0,0,0,0.4)" strokeWidth="1" />
        <circle cx={C} cy={C} r={FACE_R + 1.5} fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth="2.5" />
        <circle cx={C} cy={C} r={FACE_R} fill={GAUGE_COLORS.face} />

        {scale?.zones?.map((z) => (
          <path
            key={`${z.from}-${z.to}`}
            d={gaugeArcPath(41, valueToAngle(z.from, scale), valueToAngle(z.to, scale))}
            fill="none"
            stroke={z.color}
            strokeWidth="3.5"
          />
        ))}

        {scale?.minorTicks?.map((v) => {
          const a = valueToAngle(v, scale);
          const [x1, y1] = gaugePoint(43, a);
          const [x2, y2] = gaugePoint(39.5, a);
          return <line key={`m${v}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={GAUGE_COLORS.tickMinor} strokeWidth="1" />;
        })}
        {scale?.majorTicks?.map((v) => {
          const a = valueToAngle(v, scale);
          const [x1, y1] = gaugePoint(43, a);
          const [x2, y2] = gaugePoint(37, a);
          return <line key={`M${v}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={GAUGE_COLORS.tickMajor} strokeWidth="1.5" />;
        })}

      </svg>

      {children && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {children}
        </div>
      )}
      {/* Face-colored pill behind the label so it stays legible over the
          static scale markings (worst on the HDG gauge, and at small
          scales). Needles and rotating content still sweep OVER it below. */}
      <div className="absolute inset-x-0 bottom-[12px] flex justify-center pointer-events-none">
        <span
          className="text-[9px] font-semibold tracking-widest uppercase leading-none px-1 py-[1px] rounded"
          style={{ color: GAUGE_COLORS.textDim, background: GAUGE_COLORS.face }}
        >
          {label}
        </span>
      </div>

      {/* Moving layer ABOVE the printed text, like a real instrument: the
          needle, rotating content and sheen sweep over face text, never
          underneath it. Ids (sheen gradient) resolve document-globally from
          the base svg's defs. */}
      <svg
        width={GAUGE_DIAMETER}
        height={GAUGE_DIAMETER}
        viewBox={`0 0 ${GAUGE_DIAMETER} ${GAUGE_DIAMETER}`}
        className="absolute inset-0 pointer-events-none"
      >
        {svgContent}

        {scale && angle !== null && mode === 'fill' && angle > scale.startAngle && (
          <path
            d={gaugeArcPath(41, scale.startAngle, angle)}
            fill="none"
            stroke={fillColor ?? GAUGE_COLORS.green}
            strokeWidth="3.5"
          />
        )}
        {scale && angle !== null && mode === 'needle' && (
          <g transform={`rotate(${angle} ${C} ${C})`}>
            {/* Rim pointer, not a hub needle: keeps the center clear for the value */}
            <polygon
              points={`${C},${C - 40} ${C - 2},${C - 22} ${C + 2},${C - 22}`}
              fill={GAUGE_COLORS.needle}
              stroke="rgba(0,0,0,0.5)"
              strokeWidth="0.5"
            />
          </g>
        )}
        <circle cx={C} cy={C} r={FACE_R} fill="url(#adgi-sheen)" />
      </svg>
    </div>
  );
}
