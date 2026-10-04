import type { CSSProperties } from 'react';

const CSS = `
.ad-led-lens{position:relative;flex-shrink:0;border-radius:9999px;background:radial-gradient(circle at 50% 35%,var(--gauge-face),var(--gauge-bezel) 70%);border:1px solid var(--gauge-bezel-edge);box-shadow:inset 0 2px 8px var(--shadow-color),0 1px 3px var(--shadow-color)}
.ad-led-core{position:absolute;inset:24%;border-radius:9999px;background:var(--led);opacity:var(--glow);box-shadow:0 0 10px 2px color-mix(in srgb,var(--led) 70%,transparent),0 0 26px 8px color-mix(in srgb,var(--led) 35%,transparent);transition:background .3s,box-shadow .3s,opacity .3s}
.ad-led-core.ad-led-off{background:var(--gauge-bezel-2);box-shadow:inset 0 1px 3px var(--shadow-color)}
.ad-led-core.ad-led-blink{animation:ad-led-blink var(--period) steps(1,end) infinite}
@keyframes ad-led-blink{50%{background:var(--gauge-bezel-2);box-shadow:inset 0 1px 3px var(--shadow-color)}}
@media (prefers-reduced-motion: reduce){.ad-led-core.ad-led-blink{animation:none}}
`;

interface Props {
  /** CSS colour, or null for an unlit LED. */
  colour: string | null;
  /** Blink frequency in Hz; 0 is steady. */
  blinkHz?: number;
  /** 0..1 glow intensity. */
  brightness?: number;
  size?: number;
}

/** A round indicator lens drawn with the instrument bezel colours, so it matches the gauges in both themes. */
export function LedLens({ colour, blinkHz = 0, brightness = 1, size = 96 }: Props) {
  const lit = colour !== null && brightness > 0;
  const style = {
    '--led': colour ?? 'transparent',
    '--glow': String(Math.max(0.35, brightness)),
    '--period': blinkHz > 0 ? `${1 / blinkHz}s` : '0s',
  } as CSSProperties;
  return (
    <span className="ad-led-lens" style={{ width: size, height: size }}>
      <style>{CSS}</style>
      <span className={`ad-led-core ${lit ? (blinkHz > 0 ? 'ad-led-blink' : '') : 'ad-led-off'}`} style={style} />
    </span>
  );
}
