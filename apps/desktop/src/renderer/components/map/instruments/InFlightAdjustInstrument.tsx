import { useTranslation } from 'react-i18next';
import { DraftNumberInput } from '../../../hooks/useNumericDraft';
import { useConnectionStore } from '../../../stores/connection-store';
import { useVehicleClass } from '../../../hooks/useVehicleClass';
import { useInFlightAdjust, type InFlightAdjustRow } from '../../panels/InFlightAdjust';
import { GAUGE_COLORS } from './RoundGauge';
import { gaugeTint } from './ReadoutPrimitives';
import { useInDock } from './dock-context';
import { useLinkUp } from './useLinkUp';
import { STRIP_HEIGHT } from './stripMetrics';

/** Same layouts as the flight-control instrument: full card, compact rows, one-line bar. */
export type InFlightAdjustVariant = 'full' | 'compact' | 'bar';

const TAG_KEY: Record<InFlightAdjustRow['key'], string> = {
  speed: 'map:instrument.spd',
  alt: 'map:instrument.alt',
  radius: 'map:inFlightAdjustInstrument.tagRadius',
};

const mono = 'font-mono tabular-nums leading-none whitespace-nowrap';

function nudge(r: InFlightAdjustRow, dir: 1 | -1): void {
  r.onValue(Math.max(r.min, Number((r.value + dir * r.step).toFixed(2))));
}

/** The selected value in a bezel window: amber while it differs from what was sent. */
function Window({ r, width, big }: { r: InFlightAdjustRow; width: number; big: boolean }): JSX.Element {
  return (
    <div
      className="flex items-baseline rounded px-1.5 py-[3px]"
      style={{ width, background: GAUGE_COLORS.bezel, border: `1px solid ${r.dirty ? gaugeTint(GAUGE_COLORS.amber, 60) : GAUGE_COLORS.bezelEdge}` }}
    >
      <DraftNumberInput
        value={r.value}
        min={r.min}
        step={r.step}
        onCommit={r.onValue}
        aria-label={r.tip}
        className={`${mono} w-full min-w-0 bg-transparent border-0 p-0 text-right font-bold focus:outline-none ${big ? 'text-[15px]' : 'text-[13px]'}`}
        style={{ color: r.dirty ? GAUGE_COLORS.amber : GAUGE_COLORS.text }}
      />
      <span className={`${mono} ml-1 text-[9px]`} style={{ color: GAUGE_COLORS.textDim }}>{r.unit}</span>
    </div>
  );
}

function Steppers({ r }: { r: InFlightAdjustRow }): JSX.Element {
  const btn = 'flex-1 flex items-center justify-center w-4 rounded-sm hover:brightness-150';
  return (
    <div className="flex flex-col self-stretch gap-px">
      {([1, -1] as const).map((dir) => (
        <button key={dir} type="button" onClick={() => nudge(r, dir)} className={btn} style={{ background: GAUGE_COLORS.bezel, color: GAUGE_COLORS.textDim }}>
          <svg className="w-2 h-2" viewBox="0 0 10 6" fill="currentColor" aria-hidden="true">
            <path d={dir === 1 ? 'M5 0L10 6H0z' : 'M0 0h10L5 6z'} />
          </svg>
        </button>
      ))}
    </div>
  );
}

function RevertButton({ r }: { r: InFlightAdjustRow }): JSX.Element {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={r.onRevert}
      disabled={!r.dirty}
      data-tip={t('map:inFlightAdjustInstrument.revert')}
      aria-label={t('map:inFlightAdjustInstrument.revert')}
      className={`flex items-center justify-center w-5 self-stretch rounded hover:brightness-150 ${r.dirty ? '' : 'invisible'}`}
      style={{ color: GAUGE_COLORS.textDim, border: `1px solid ${GAUGE_COLORS.bezelEdge}` }}
    >
      <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" aria-hidden="true">
        <path d="M2 2l6 6M8 2l-6 6" />
      </svg>
    </button>
  );
}

function SetButton({ r, busy, compact }: { r: InFlightAdjustRow; busy: boolean; compact?: boolean }): JSX.Element {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={r.onGo}
      disabled={busy || !r.dirty}
      data-tip={r.label}
      className={`${mono} rounded text-[10px] font-semibold ${compact ? 'px-1.5 py-1' : 'px-2 py-1.5'} transition-colors disabled:cursor-default`}
      style={r.dirty
        ? { color: GAUGE_COLORS.amber, background: gaugeTint(GAUGE_COLORS.amber, 14), border: `1px solid ${gaugeTint(GAUGE_COLORS.amber, 55)}` }
        : { color: GAUGE_COLORS.tickMinor, border: `1px solid ${GAUGE_COLORS.bezelEdge}` }}
    >
      {busy ? '...' : t('map:inFlightAdjustInstrument.set')}
    </button>
  );
}

export function InFlightAdjustInstrument({ variant = 'full' }: { variant?: InFlightAdjustVariant } = {}): JSX.Element {
  const { t } = useTranslation();
  const inDock = useInDock();
  const linkUp = useLinkUp();
  const isPx4 = useConnectionStore((s) => s.connectionState.firmware === 'px4');
  const vehicleClass = useVehicleClass();
  const { rows, busy, status } = useInFlightAdjust();
  const usable = linkUp && (vehicleClass === 'plane' || vehicleClass === 'vtol') && !isPx4;
  const note = !linkUp ? t('map:flightControlInstrument.noLink') : usable ? null : t('map:inFlightAdjustInstrument.fixedWingOnly');
  const chrome = inDock ? {} : { background: GAUGE_COLORS.face, border: `1.5px solid ${GAUGE_COLORS.bezelEdge}` };
  const tag = (r: InFlightAdjustRow) => (
    <span className={`${mono} text-[8px] font-semibold`} style={{ color: GAUGE_COLORS.tickMinor }}>{t(TAG_KEY[r.key])}</span>
  );
  const body = usable ? '' : 'opacity-40 pointer-events-none';

  if (variant === 'bar') {
    return (
      <div className={`select-none flex items-center gap-2 px-2 ${inDock ? '' : 'rounded-[9px] shadow-xl'}`} style={{ ...chrome, height: STRIP_HEIGHT + 4 }}>
        {note ? (
          <span className={`${mono} text-[9px] font-semibold tracking-wider`} style={{ color: GAUGE_COLORS.textDim }}>{note}</span>
        ) : rows.map((r, i) => (
          <div key={r.key} className={`flex items-center gap-1 ${body}`}>
            {i > 0 && <span className="w-px self-stretch mr-1" style={{ background: GAUGE_COLORS.bezelEdge }} />}
            {tag(r)}
            <Window r={r} width={62} big={false} />
            {r.dirty && <RevertButton r={r} />}
            {r.dirty && <SetButton r={r} busy={busy === r.key} compact />}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={`select-none px-3 pt-2 pb-2.5 ${inDock ? '' : 'rounded-lg shadow-xl'}`} style={{ ...chrome, color: GAUGE_COLORS.text, width: variant === 'full' ? 232 : 200 }}>
      {variant === 'full' && (
        <div className="flex items-center mb-2">
          <span className="text-[9px] font-semibold tracking-widest uppercase leading-none" style={{ color: GAUGE_COLORS.textDim }}>{t('map:inFlightAdjustInstrument.title')}</span>
          {note && (
            <span className="ml-auto text-[8px] font-semibold tracking-wider px-1.5 py-[3px] rounded-full leading-none" style={{ color: GAUGE_COLORS.textDim, border: `1px solid ${GAUGE_COLORS.bezelEdge}` }}>{note}</span>
          )}
        </div>
      )}
      <div className={`space-y-1.5 ${body}`}>
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-1.5" data-tip={r.tip}>
            <span className="w-6 shrink-0">{tag(r)}</span>
            <Window r={r} width={variant === 'full' ? 78 : 72} big={variant === 'full'} />
            {variant === 'full' && <Steppers r={r} />}
            <span className="ml-auto flex items-stretch gap-1"><RevertButton r={r} /><SetButton r={r} busy={busy === r.key} /></span>
          </div>
        ))}
      </div>
      {status && (
        <div className={`${mono} mt-1.5 text-[10px]`} style={{ color: status.ok ? GAUGE_COLORS.green : GAUGE_COLORS.red }}>{status.text}</div>
      )}
      {variant === 'compact' && note && (
        <div className={`${mono} mt-1.5 text-[9px] font-semibold tracking-wider`} style={{ color: GAUGE_COLORS.textDim }}>{note}</div>
      )}
    </div>
  );
}
