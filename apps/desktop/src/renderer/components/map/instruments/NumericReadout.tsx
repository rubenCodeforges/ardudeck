import type { ReactNode } from 'react';
import { GAUGE_COLORS } from './RoundGauge';
import { useInDock } from './dock-context';

/**
 * Shared card for the numeric display mode of the round gauges. Same
 * gauge-face palette as the analog instruments (white face + near-black
 * digits in light, dark face + white digits in dark), big tabular digits so
 * it stays readable at a glance in the field.
 */
export function NumericReadout({
  label,
  value,
  unit,
  sub,
  valueClassName,
  footer,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  valueClassName?: string;
  footer?: ReactNode;
}): JSX.Element {
  const inDock = useInDock();
  return (
    <div
      className={`px-3 pt-1.5 pb-2 min-w-[100px] select-none ${inDock ? '' : 'rounded-lg shadow-xl'}`}
      style={{
        ...(inDock ? {} : { background: GAUGE_COLORS.face, border: `1.5px solid ${GAUGE_COLORS.bezelEdge}` }),
        color: GAUGE_COLORS.text,
      }}
    >
      <div className="text-[9px] font-semibold tracking-[0.14em] leading-none text-[var(--gauge-text-dim)]">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-1 whitespace-nowrap">
        <span className={`text-[22px] font-bold leading-none tabular-nums ${valueClassName ?? 'text-[var(--gauge-text)]'}`}>
          {value}
        </span>
        {unit && <span className="text-[10px] font-medium text-[var(--gauge-text-dim)]">{unit}</span>}
      </div>
      <div className="mt-1 text-[9px] leading-none text-[var(--gauge-text-dim)] whitespace-nowrap min-h-[9px]">{sub ?? ''}</div>
      {footer}
    </div>
  );
}
