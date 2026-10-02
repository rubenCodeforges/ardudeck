/**
 * Ported verbatim from the Trainer's launcher, which is where it was designed.
 *
 * A rendering component, so a second copy carries no correctness risk: the worst a drift can do
 * is make the two previews look slightly different. Its one shared import was `weatherOption`,
 * used solely to look up a cover fraction the catalogue already carries, so cover is a prop
 * here and there is nothing left to import.
 */

import { useTranslation } from 'react-i18next';

/**
 * What the sky will look like, drawn from the same numbers the game is given.
 *
 * Not a photograph and not pretending to be: a horizon, a sun at the right height, and cloud in
 * the right quantity, moving at the speed the wind is set to. The job is to make "golden hour,
 * overcast, 8 m/s from the west" land as a picture before anyone spends ten minutes flying it.
 *
 * The same component draws the big header and the little tiles you choose from, so a tile is
 * never a stylised guess at what the header will show. It IS what the header will show.
 */

const HORIZON_RATIO = 0.72;

/** Sky colours at midnight, dawn, midday, dusk. Interpolated across the day. */
const SKY_KEYS: { at: number; top: string; bottom: string }[] = [
  { at: 0.0, top: '#05070f', bottom: '#0b1020' },
  { at: 0.22, top: '#1b2b52', bottom: '#7a4a6b' },
  { at: 0.28, top: '#2c4a7d', bottom: '#e08a4e' },
  { at: 0.5, top: '#2f6fb5', bottom: '#a8cce9' },
  { at: 0.72, top: '#2f4a86', bottom: '#e8934a' },
  { at: 0.8, top: '#1d2547', bottom: '#5d3a5e' },
  { at: 1.0, top: '#05070f', bottom: '#0b1020' },
];

function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const c = pa.map((v, i) => Math.round(v + (pb[i]! - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function skyColours(dayFraction: number): { top: string; bottom: string } {
  const f = ((dayFraction % 1) + 1) % 1;
  for (let i = 0; i < SKY_KEYS.length - 1; i++) {
    const a = SKY_KEYS[i]!;
    const b = SKY_KEYS[i + 1]!;
    if (f >= a.at && f <= b.at) {
      const t = (f - a.at) / (b.at - a.at);
      return { top: mix(a.top, b.top, t), bottom: mix(a.bottom, b.bottom, t) };
    }
  }
  return { top: SKY_KEYS[0]!.top, bottom: SKY_KEYS[0]!.bottom };
}

/** Sun height above the horizon: up at 0.25, highest at 0.5, down at 0.75, below it at night. */
function sunElevation(dayFraction: number): number {
  return Math.sin((dayFraction - 0.25) * 2 * Math.PI);
}

/** Seconds for the cloud band to travel its own width. Still air still drifts, slowly. */
function driftSeconds(windMs: number): number {
  return Math.max(14, 150 / Math.max(0.6, windMs));
}

interface Props {
  dayFraction: number;
  /** Weather id, used for the storm case and to key the gradient ids. */
  preset: string;
  /** Cloud fraction 0..1, from the catalogue. */
  cover: number;
  windMs: number;
  /** Degrees the wind comes FROM. */
  windFromDeg: number;
  /** Panel height in px. The whole scene scales off it. */
  height?: number;
  /** Tiles drop the sun glow, the stars and the wind streaks, which do not read at that size. */
  compact?: boolean;
}

export function SkyPreview({
  dayFraction,
  preset,
  cover,
  windMs,
  windFromDeg,
  height = 190,
  compact = false,
}: Props) {
  const { t } = useTranslation();
  const W = 640;
  const H = compact ? 120 : 200;
  const horizon = H * HORIZON_RATIO;
  const { top, bottom } = skyColours(dayFraction);
  const elev = sunElevation(dayFraction);
  const sunY = horizon - elev * (horizon - 16);
  const sunX = W * (0.16 + 0.68 * Math.min(1, Math.max(0, (dayFraction - 0.22) / 0.56)));
  const daylight = Math.max(0, Math.min(1, elev * 2 + 0.35));
  const night = elev < -0.08;
  const stormy = preset === 'storm';

  // A wind FROM the west travels east, so the clouds move right. The band scrolls left by
  // default, so the whole group is mirrored for the other direction.
  const east = -Math.sin((windFromDeg * Math.PI) / 180);
  const flip = east >= 0;
  const drift = `${driftSeconds(windMs)}s`;
  const uid = `${preset}-${compact ? 's' : 'l'}`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block w-full"
      style={{ height }}
      preserveAspectRatio="none"
      role="img"
      aria-label={t('trainer:skyPreview.ariaLabel', { preset, speed: windMs.toFixed(0) })}
    >
      <defs>
        <linearGradient id={`sky-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={top} />
          <stop offset="100%" stopColor={bottom} />
        </linearGradient>
        <radialGradient id={`glow-${uid}`}>
          <stop offset="0%" stopColor="#fff6d8" stopOpacity={0.9 * daylight} />
          <stop offset="100%" stopColor="#fff6d8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`ground-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={mix('#3c4622', '#12160c', 1 - daylight)} />
          <stop offset="100%" stopColor={mix('#1d2412', '#070905', 1 - daylight)} />
        </linearGradient>
        <clipPath id={`clip-${uid}`}>
          <rect x="0" y="0" width={W} height={horizon} />
        </clipPath>
      </defs>

      <rect x="0" y="0" width={W} height={horizon} fill={`url(#sky-${uid})`} />

      <g clipPath={`url(#clip-${uid})`}>
        {night && !compact && <Stars horizon={horizon} width={W} cover={cover} />}
        {elev > -0.16 && (
          <>
            {!compact && <circle cx={sunX} cy={sunY} r="70" fill={`url(#glow-${uid})`} />}
            <circle cx={sunX} cy={sunY} r={compact ? 8 : 12} fill="#fff3cf" opacity={0.4 + 0.6 * daylight} />
          </>
        )}

        {/* The mirror lives on an OUTER group and the animation on an inner one. A CSS transform
            animation replaces the element's own `transform` attribute outright, so the two on one
            element meant the flip silently vanished the moment the clouds started moving. Two
            copies side by side, scrolled by exactly one copy width, so the loop has no seam. */}
        <g transform={flip ? `translate(${W} 0) scale(-1 1)` : undefined}>
          <g
            className="wx-drift"
            style={{ animationDuration: drift, ['--drift-x' as string]: `${-W}px` }}
          >
            <CloudBand cover={cover} stormy={stormy} daylight={daylight} width={W} height={horizon} />
            <g transform={`translate(${W} 0)`}>
              <CloudBand cover={cover} stormy={stormy} daylight={daylight} width={W} height={horizon} />
            </g>
          </g>
        </g>

        {cover > 0.8 && (
          <rect
            x="0"
            y="0"
            width={W}
            height={horizon}
            fill={stormy ? '#22262e' : mix('#ffffff', '#6c7481', 1 - daylight)}
            opacity={stormy ? 0.5 : 0.32}
          />
        )}
        {stormy && <Rain width={W} height={horizon} />}
      </g>

      <rect x="0" y={horizon} width={W} height={H - horizon} fill={`url(#ground-${uid})`} />
      {!compact && <WindStreaks windMs={windMs} flip={flip} width={W} height={H} horizon={horizon} />}
    </svg>
  );
}

/** Fixed positions, so the panel does not reshuffle itself on every keystroke. */
const BANK = [
  { x: 0.13, y: 0.3, s: 1.0 },
  { x: 0.36, y: 0.18, s: 0.72 },
  { x: 0.58, y: 0.36, s: 1.15 },
  { x: 0.79, y: 0.2, s: 0.85 },
  { x: 0.93, y: 0.42, s: 0.95 },
  { x: 0.24, y: 0.52, s: 0.6 },
  { x: 0.68, y: 0.58, s: 0.7 },
];

function CloudBand({
  cover,
  stormy,
  daylight,
  width,
  height,
}: {
  cover: number;
  stormy: boolean;
  daylight: number;
  width: number;
  height: number;
}) {
  const shown = Math.round(cover * BANK.length);
  const tone = stormy ? '#2b3038' : mix('#ffffff', '#7f8794', 1 - daylight);
  const opacity = stormy ? 0.95 : 0.3 + cover * 0.55;
  return (
    <g opacity={opacity}>
      {BANK.slice(0, shown).map((c, i) => (
        <g key={i} transform={`translate(${c.x * width} ${c.y * height}) scale(${c.s})`}>
          <ellipse cx="0" cy="0" rx="54" ry="15" fill={tone} />
          <ellipse cx="-24" cy="-8" rx="27" ry="13" fill={tone} />
          <ellipse cx="19" cy="-10" rx="31" ry="16" fill={tone} />
        </g>
      ))}
    </g>
  );
}

function Stars({ horizon, width, cover }: { horizon: number; width: number; cover: number }) {
  // Fewer stars through cloud, none at all under a lid.
  const count = Math.round(46 * (1 - cover));
  return (
    <g fill="#ffffff">
      {Array.from({ length: count }, (_, i) => {
        // Deterministic scatter: a hash rather than Math.random, so they hold still between
        // renders instead of jumping every time the wind slider moves.
        const h = Math.sin(i * 127.1) * 43758.5453;
        const g = Math.sin(i * 311.7) * 24634.6345;
        const x = (h - Math.floor(h)) * width;
        const y = (g - Math.floor(g)) * horizon * 0.85;
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={i % 7 === 0 ? 1.4 : 0.9}
            className="wx-star"
            style={{ animationDelay: `${(i % 9) * 0.4}s` }}
          />
        );
      })}
    </g>
  );
}

function Rain({ width, height }: { width: number; height: number }) {
  return (
    <g className="wx-rain" stroke="rgba(190,210,235,0.42)" strokeWidth="1.1" strokeLinecap="round">
      {Array.from({ length: 70 }, (_, i) => {
        const h = Math.sin(i * 91.3) * 12983.7;
        const g = Math.sin(i * 47.9) * 7541.3;
        const x = (h - Math.floor(h)) * width;
        const y = (g - Math.floor(g)) * height * 1.3 - height * 0.15;
        return <line key={i} x1={x} y1={y} x2={x - 3} y2={y + 13} />;
      })}
    </g>
  );
}

/** Ground-level streaks, travelling the way the air travels, at the speed it travels. */
function WindStreaks({
  windMs,
  flip,
  width,
  height,
  horizon,
}: {
  windMs: number;
  flip: boolean;
  width: number;
  height: number;
  horizon: number;
}) {
  const { t } = useTranslation();
  if (windMs < 0.4) {
    return (
      <text
        x={width / 2}
        y={(horizon + height) / 2 + 4}
        textAnchor="middle"
        fontSize="11"
        fill="rgba(255,255,255,0.45)"
      >
        {t('trainer:skyPreview.stillAir')}
      </text>
    );
  }
  const count = 2 + Math.round(Math.min(1, windMs / 15) * 3);
  const seconds = Math.max(0.9, 9 / Math.max(1, windMs));
  const band = height - horizon;
  return (
    <g transform={flip ? undefined : `translate(${width} 0) scale(-1 1)`}>
      {Array.from({ length: count }, (_, i) => {
        const y = horizon + band * (0.25 + (i / count) * 0.55);
        const len = 40 + (i % 3) * 26;
        return (
          <rect
            key={i}
            x={-len}
            y={y}
            width={len}
            height="1.6"
            rx="0.8"
            fill="rgba(255,255,255,0.55)"
            className="wx-streak"
            style={{
              animationDuration: `${seconds}s`,
              animationDelay: `${(i * seconds) / count}s`,
              ['--travel' as string]: `${width + len}px`,
            }}
          />
        );
      })}
    </g>
  );
}
