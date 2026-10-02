/** Link strip instrument with a RADIO_STATUS detail popover (RSSI, noise, loss). */
import { useTranslation } from 'react-i18next';
import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { RadioStatusData } from '../../../../shared/telemetry-types';
import { useTelemetryStore } from '../../../stores/telemetry-store';
import { GAUGE_COLORS } from './RoundGauge';
import { InstrumentStrip } from './InstrumentStrip';
import { useLinkUp, useHeartbeatAgeMs, HEARTBEAT_STALE_MS, HEARTBEAT_LOST_MS } from './useLinkUp';
import { rssiState, rssiHint } from '../../../utils/rssi-state';
import {
  RADIO_UNKNOWN,
  formatDbm,
  fadeMarginDb,
  classifyMargin,
  counterRates,
  type MarginClass,
  type RadioRates,
} from './link-radio';

const POPOVER_WIDTH = 232;

const MARGIN_COLOR: Record<MarginClass, string> = {
  good: GAUGE_COLORS.green,
  marginal: GAUGE_COLORS.amber,
  critical: GAUGE_COLORS.red,
};

function Row({ label, value, tip }: { label: string; value: string; tip?: string }): JSX.Element {
  return (
    <div className="flex justify-between gap-2 text-[11px]" data-tip={tip}>
      <span className="text-content-tertiary">{label}</span>
      <span className="text-content-secondary font-mono text-right truncate">{value}</span>
    </div>
  );
}

function DirectionBlock({ title, tip, rssi, noise }: { title: string; tip: string; rssi: number; noise: number }): JSX.Element {
  const { t } = useTranslation();
  const margin = fadeMarginDb(rssi, noise);
  const cls = margin === null ? null : classifyMargin(margin);
  return (
    <div className="rounded bg-surface-input px-2 py-1.5 space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wide text-content-tertiary" data-tip={tip}>{title}</span>
        <span
          className="text-[13px] font-semibold font-mono leading-none"
          style={{ color: cls ? MARGIN_COLOR[cls] : GAUGE_COLORS.textDim }}
          data-tip={t('map:linkInstrument.fadeMarginTip')}
        >
          {margin === null ? '--' : `${margin.toFixed(0)} dB`}
        </span>
      </div>
      <Row label="RSSI" value={`${rssi === RADIO_UNKNOWN ? '--' : rssi} · ${formatDbm(rssi)}`} tip={t('map:linkInstrument.rssiTip')} />
      <Row label={t('map:linkInstrument.noise')} value={`${noise === RADIO_UNKNOWN ? '--' : noise} · ${formatDbm(noise)}`} tip={t('map:linkInstrument.noiseTip')} />
    </div>
  );
}

export function LinkInstrument(): JSX.Element {
  const { t } = useTranslation();
  const connected = useLinkUp();
  const rssi = useTelemetryStore((s) => s.rcChannels.rssi);
  const chancount = useTelemetryStore((s) => s.rcChannels.chancount);
  const radioStatus = useTelemetryStore((s) => s.radioStatus);
  const age = useHeartbeatAgeMs();

  const dotColor =
    !connected || age >= HEARTBEAT_LOST_MS
      ? GAUGE_COLORS.red
      : age >= HEARTBEAT_STALE_MS
        ? GAUGE_COLORS.amber
        : GAUGE_COLORS.green;
  const state = rssiState({
    connected,
    rcRssi: rssi,
    chancount,
    modemRssi: radioStatus?.rssi ?? null,
  });
  const rssiKnown = state.kind === 'value';
  const rssiPct = state.pct;
  const rssiNote = rssiHint(state);

  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; maxHeight: number } | null>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);

  // Loss/repair rates: delta the cumulative counters between store updates.
  const prevSample = useRef<{ counters: { rxErrors: number; fixed: number }; atMs: number; forStatus: RadioStatusData } | null>(null);
  const rates = useRef<RadioRates | null>(null);
  if (radioStatus && prevSample.current?.forStatus !== radioStatus) {
    const now = Date.now();
    const prev = prevSample.current;
    const next = { rxErrors: radioStatus.rxErrors, fixed: radioStatus.fixed };
    rates.current = counterRates(prev ? prev.counters : null, prev ? prev.atMs : 0, next, now);
    prevSample.current = { counters: next, atMs: now, forStatus: radioStatus };
  }
  if (!radioStatus && prevSample.current) {
    prevSample.current = null;
    rates.current = null;
  }

  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const r = anchorRef.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - POPOVER_WIDTH - 8));
    const spaceBelow = window.innerHeight - r.bottom - 16;
    const spaceAbove = r.top - 16;
    // Open toward the roomier side; the instrument usually sits near an edge.
    if (spaceBelow >= 220 || spaceBelow >= spaceAbove) {
      setPos({ top: r.bottom + 6, left, maxHeight: Math.max(160, spaceBelow) });
    } else {
      // Bottom-anchored when opening up, or a short popup strands at screen top.
      setPos({ bottom: window.innerHeight - r.top + 6, left, maxHeight: Math.max(160, spaceAbove) });
    }
  }, [open]);

  const r = rates.current;

  return (
    <InstrumentStrip label={t('map:linkInstrument.title')}>
      {/* A button so the drag hook's interactive-child guard leaves the click alone. */}
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-tip={t('map:linkInstrument.detailsTip')}
        className="flex items-center gap-2 w-full text-left cursor-pointer"
      >
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor }} />
        <span className="text-[15px] font-semibold leading-none text-[var(--gauge-text)]">
          {rssiKnown ? rssiPct : '--'}
          <span className="text-[8px] font-normal text-[var(--gauge-text-dim)] ml-0.5">%</span>
        </span>
        <span className="ml-auto text-[8px] leading-none text-[var(--gauge-text-dim)]">
          {state.kind === 'unconfigured' ? t('map:linkInstrument.notSetUp') : state.fromModem ? 'TLM RSSI' : 'RSSI'}
        </span>
        <svg className="w-2.5 h-2.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} style={{ color: GAUGE_COLORS.textDim }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {rssiNote && state.kind !== 'no-link' && (
        <div className="mt-1 text-[8px] leading-tight text-[var(--gauge-text-dim)]">{rssiNote}</div>
      )}

      {open && pos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
            <div
              className="fixed z-[9999] rounded-lg bg-surface-solid border border-subtle shadow-xl overflow-y-auto p-2.5 space-y-2"
              style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width: POPOVER_WIDTH, maxHeight: pos.maxHeight }}
            >
              {radioStatus ? (
                <>
                  <DirectionBlock
                    title={t('map:linkInstrument.groundReceive')}
                    tip={t('map:linkInstrument.groundReceiveTip')}
                    rssi={radioStatus.rssi}
                    noise={radioStatus.noise}
                  />
                  <DirectionBlock
                    title={t('map:linkInstrument.vehicleReceive')}
                    tip={t('map:linkInstrument.vehicleReceiveTip')}
                    rssi={radioStatus.remRssi}
                    noise={radioStatus.remNoise}
                  />
                  <div className="space-y-1">
                    <Row
                      label={t('map:linkInstrument.rxErrors')}
                      value={r ? `${radioStatus.rxErrors} (${r.errorsPerSec.toFixed(1)}/s)` : `${radioStatus.rxErrors}`}
                      tip={t('map:linkInstrument.rxErrorsTip')}
                    />
                    <Row
                      label={t('map:linkInstrument.fecCorrected')}
                      value={r ? `${radioStatus.fixed} (${r.fixedPerSec.toFixed(1)}/s)` : `${radioStatus.fixed}`}
                      tip={t('map:linkInstrument.fecTip')}
                    />
                  </div>
                  <div data-tip={t('map:linkInstrument.txBufferTip')}>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-content-tertiary">{t('map:linkInstrument.txBuffer')}</span>
                      <span className="text-content-secondary font-mono">{radioStatus.txbuf}%</span>
                    </div>
                    <div className="h-1 mt-1 rounded bg-surface-input overflow-hidden">
                      <div
                        className="h-full rounded"
                        style={{
                          width: `${Math.min(100, Math.max(0, radioStatus.txbuf))}%`,
                          background: radioStatus.txbuf < 20 ? GAUGE_COLORS.red : radioStatus.txbuf < 50 ? GAUGE_COLORS.amber : GAUGE_COLORS.green,
                        }}
                      />
                    </div>
                  </div>
                  {chancount > 0 && rssi !== 255 && (
                    <Row
                      label={t('map:linkInstrument.rcRssi')}
                      value={rssi > 0 ? `${Math.round((Math.min(rssi, 254) / 254) * 100)}%` : t('map:linkInstrument.notSetUpLower')}
                      tip={t('map:linkInstrument.rcRssiTip')}
                    />
                  )}
                </>
              ) : (
                <div className="text-[11px] text-content-secondary leading-relaxed">
                  {t('map:linkInstrument.noModem')}
                </div>
              )}
            </div>
          </>,
          document.body,
        )}
    </InstrumentStrip>
  );
}
