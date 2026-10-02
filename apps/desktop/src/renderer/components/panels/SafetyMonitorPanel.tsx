/**
 * Takeoff / Attitude Safety Monitor panel.
 *
 * Shows a graded banner (NOMINAL / CAUTION / DANGER) with an action line, a
 * row per monitored signal with a colour-coded deviation bar, integrator
 * gauges as a percent of IMAX, and a manual DANGER-latch clear. Auto-compacts
 * when docked small so it can sit alongside the HUD during takeoff.
 */

import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ShieldCheck, ShieldAlert, Volume2, VolumeX, RotateCcw, Zap, FileUp, Square } from 'lucide-react';
import { useSafetyMonitorStore } from '../../stores/safety-monitor-store';
import {
  startSafetyMonitor,
  refreshContext,
  enablePidStreaming,
  clearLatch,
} from '../../safety-monitor/source';
import { parseTlog, runReplay, type ReplayHandle } from '../../safety-monitor/tlog-replay';
import type { Severity, SignalResult } from '../../../shared/safety-monitor/types';

interface Tone {
  text: string;
  fill: string;
  border: string;
  bg: string;
}

const TONES: Record<Severity, Tone> = {
  nominal: { text: 'text-emerald-400', fill: 'rgb(16 185 129)', border: 'rgb(16 185 129 / 0.4)', bg: 'rgb(16 185 129 / 0.10)' },
  caution: { text: 'text-amber-400', fill: 'rgb(245 158 11)', border: 'rgb(245 158 11 / 0.45)', bg: 'rgb(245 158 11 / 0.12)' },
  danger: { text: 'text-red-400', fill: 'rgb(239 68 68)', border: 'rgb(239 68 68 / 0.5)', bg: 'rgb(239 68 68 / 0.16)' },
};

const SEVERITY_TITLE_KEY: Record<Severity, string> = {
  nominal: 'panels:safetyMonitorPanel.nominal',
  caution: 'panels:safetyMonitorPanel.caution',
  danger: 'panels:safetyMonitorPanel.danger',
};

function useCompact<T extends HTMLElement>(): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setCompact(r.width < 360 || r.height < 260);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, compact];
}

function DeviationBar({ signal }: { signal: SignalResult }) {
  const tone = TONES[signal.severity];
  // Scale the bar to the danger edge; values past it pin at full + red.
  const max = signal.cautionMax || 1;
  const frac = signal.value === null ? 0 : Math.max(0, Math.min(1, signal.value / max));
  const nominalPct = Math.max(0, Math.min(100, (signal.nominalMax / max) * 100));
  return (
    <div className="relative h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-inset)' }}>
      <div
        className="h-full rounded-full transition-all duration-200"
        style={{ width: `${frac * 100}%`, background: tone.fill, boxShadow: `0 0 6px ${tone.border}` }}
      />
      {/* nominal-band edge marker */}
      <div className="absolute top-0 bottom-0 w-px" style={{ left: `${nominalPct}%`, backgroundColor: 'var(--text-tertiary)' }} />
    </div>
  );
}

function SignalRow({ signal, compact }: { signal: SignalResult; compact: boolean }) {
  const { t } = useTranslation();
  const tone = TONES[signal.severity];
  const isPidSignal = signal.id === 'integratorLoad' || signal.id === 'controllerFighting';

  if (!signal.available) {
    return (
      <div className="py-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-content-secondary text-xs truncate">{signal.label}</span>
          <span className="text-content-tertiary text-[10px]">{t('panels:safetyMonitorPanel.unavailable')}</span>
        </div>
        {isPidSignal && (
          <button
            onClick={() => void enablePidStreaming()}
            className="mt-1 text-[11px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20 transition-colors"
            data-tip={t('panels:safetyMonitorPanel.enablePidTip')}
          >
            <Zap className="w-3 h-3" /> {t('panels:safetyMonitorPanel.enablePid')}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="py-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-content-secondary text-xs truncate">{signal.label}</span>
        <span className={`font-mono text-xs ${tone.text}`}>
          {signal.value === null ? ' - ' : signal.value.toFixed(signal.unit === 'rad/s' ? 2 : 0)}
          <span className="text-content-tertiary text-[10px] ml-0.5">{signal.unit}</span>
        </span>
      </div>
      <div className="mt-1">
        <DeviationBar signal={signal} />
      </div>
      {!compact && signal.detail && (
        <div className={`mt-1 text-[10px] leading-snug ${signal.severity === 'nominal' ? 'text-content-tertiary' : tone.text}`}>
          {signal.detail}
        </div>
      )}
    </div>
  );
}

function IntegratorGauge({ label, pct }: { label: string; pct: number | null }) {
  const sev: Severity = pct === null ? 'nominal' : pct >= 80 ? 'danger' : pct >= 60 ? 'caution' : 'nominal';
  const tone = TONES[sev];
  const frac = pct === null ? 0 : Math.max(0, Math.min(1, pct / 100));
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-content-tertiary w-3">{label}</span>
      <div className="relative flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-inset)' }}>
        <div className="h-full rounded-full" style={{ width: `${frac * 100}%`, background: tone.fill }} />
        {/* danger threshold marker at 80% */}
        <div className="absolute top-0 bottom-0 w-px bg-red-400/60" style={{ left: '80%' }} />
      </div>
      <span className={`font-mono text-[10px] w-9 text-right ${tone.text}`}>
        {pct === null ? ' - ' : `${pct.toFixed(0)}%`}
      </span>
    </div>
  );
}

export function SafetyMonitorPanel() {
  const { t } = useTranslation();
  const monitor = useSafetyMonitorStore((s) => s.monitor);
  const audioEnabled = useSafetyMonitorStore((s) => s.audioEnabled);
  const setAudioEnabled = useSafetyMonitorStore((s) => s.setAudioEnabled);
  const landedSource = useSafetyMonitorStore((s) => s.landedSource);
  const flashTick = useSafetyMonitorStore((s) => s.flashTick);
  const [ref, compact] = useCompact<HTMLDivElement>();
  const [flashing, setFlashing] = useState(false);
  const [replayProgress, setReplayProgress] = useState<number | null>(null);
  const replayRef = useRef<ReplayHandle | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleReplayFile = async (file: File) => {
    replayRef.current?.stop();
    const buf = await file.arrayBuffer();
    const packets = parseTlog(buf);
    if (packets.length === 0) {
      setReplayProgress(null);
      return;
    }
    setReplayProgress(0);
    replayRef.current = runReplay(packets, {
      onProgress: (f) => setReplayProgress(f),
      onDone: () => setReplayProgress(null),
    });
  };

  const stopReplay = () => {
    replayRef.current?.stop();
    replayRef.current = null;
    setReplayProgress(null);
  };

  useEffect(() => () => replayRef.current?.stop(), []);

  useEffect(() => {
    startSafetyMonitor();
    void refreshContext();
  }, []);

  useEffect(() => {
    if (flashTick === 0) return;
    setFlashing(true);
    const id = setTimeout(() => setFlashing(false), 1600);
    return () => clearTimeout(id);
  }, [flashTick]);

  const tone = TONES[monitor.overall];
  const Icon = monitor.overall === 'danger' ? ShieldAlert : monitor.overall === 'caution' ? AlertTriangle : ShieldCheck;
  const latched = monitor.dangerLatchedAt !== null;

  const recentEvents = useMemo(() => monitor.events.slice(-4).reverse(), [monitor.events]);

  return (
    <div ref={ref} className="h-full bg-surface overflow-auto relative">
      {/* DANGER flash overlay */}
      {flashing && (
        <div className="pointer-events-none absolute inset-0 z-10 animate-pulse" style={{ background: 'rgb(239 68 68 / 0.25)' }} />
      )}

      <div className="p-3 flex flex-col gap-3">
        {/* Banner */}
        <div
          className={`rounded-xl border p-3 ${monitor.overall === 'danger' ? 'animate-pulse' : ''}`}
          style={{ background: tone.bg, borderColor: tone.border }}
        >
          <div className="flex items-center gap-3">
            <Icon className={`${compact ? 'w-6 h-6' : 'w-8 h-8'} ${tone.text} shrink-0`} />
            <div className="min-w-0 flex-1">
              <div className={`font-bold tracking-wide ${compact ? 'text-lg' : 'text-2xl'} ${tone.text} leading-none`}>
                {t(SEVERITY_TITLE_KEY[monitor.overall])}
              </div>
              {monitor.action && (
                <div className={`mt-1 font-semibold ${compact ? 'text-xs' : 'text-sm'} ${tone.text}`}>
                  {monitor.action}
                </div>
              )}
              {!monitor.action && !compact && (
                <div className="mt-1 text-xs text-content-tertiary">
                  {monitor.tipoverArmed ? t('panels:safetyMonitorPanel.tipoverActive') : t('panels:safetyMonitorPanel.tipoverIdle')}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setAudioEnabled(!audioEnabled)}
                className="p-1.5 rounded-md text-content-secondary hover:text-content hover:bg-surface-raised transition-colors"
                data-tip={audioEnabled ? t('panels:safetyMonitorPanel.muteTip') : t('panels:safetyMonitorPanel.unmuteTip')}
              >
                {audioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
              {latched && (
                <button
                  onClick={() => clearLatch()}
                  className="p-1.5 rounded-md text-red-400 hover:bg-red-500/15 transition-colors"
                  data-tip={t('panels:safetyMonitorPanel.clearLatchTip')}
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Integrator gauges */}
        <div className="rounded-lg border border-subtle p-2.5 flex flex-col gap-2">
          <div className="text-[10px] font-medium text-content-secondary uppercase tracking-wider">
            {t('panels:safetyMonitorPanel.integratorLoad')}
          </div>
          <IntegratorGauge label={t('panels:safetyMonitorPanel.rollShort')} pct={monitor.integrator.roll} />
          <IntegratorGauge label={t('panels:safetyMonitorPanel.pitchShort')} pct={monitor.integrator.pitch} />
        </div>

        {/* Signal rows */}
        <div className="rounded-lg border border-subtle px-2.5 py-1 divide-y divide-subtle/60">
          {monitor.signals.map((s) => (
            <SignalRow key={s.id} signal={s} compact={compact} />
          ))}
        </div>

        {/* Log replay (.tlog) - runs recorded MAVLink through the same engine */}
        {!compact && (
          <div className="rounded-lg border border-subtle p-2.5 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium text-content-secondary uppercase tracking-wider">
                {t('panels:safetyMonitorPanel.replayLog')}
              </span>
              {replayProgress === null ? (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="text-[11px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-raised border border-subtle text-content-secondary hover:text-content transition-colors"
                  data-tip={t('panels:safetyMonitorPanel.replayTip')}
                >
                  <FileUp className="w-3 h-3" /> {t('common:load')}
                </button>
              ) : (
                <button
                  onClick={stopReplay}
                  className="text-[11px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors"
                >
                  <Square className="w-3 h-3" /> {t('common:stop')}
                </button>
              )}
            </div>
            {replayProgress !== null && (
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-inset)' }}>
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-100"
                  style={{ width: `${Math.round(replayProgress * 100)}%` }}
                />
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".tlog,application/octet-stream"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleReplayFile(f);
                e.target.value = '';
              }}
            />
          </div>
        )}

        {/* Footnotes / events */}
        {!compact && (
          <div className="flex flex-col gap-1">
            {landedSource === 'inferred' && (
              <div className="text-[10px] text-content-tertiary">
                {t('panels:safetyMonitorPanel.groundInferred')}
              </div>
            )}
            {recentEvents.length > 0 && (
              <div className="rounded-lg border border-subtle p-2 flex flex-col gap-0.5">
                <div className="text-[10px] font-medium text-content-secondary uppercase tracking-wider mb-0.5">
                  {t('panels:safetyMonitorPanel.events')}
                </div>
                {recentEvents.map((e, i) => (
                  <div key={i} className="flex items-baseline justify-between gap-2 text-[11px]">
                    <span
                      className={`font-mono uppercase text-[9px] ${
                        e.kind === 'danger' || e.kind === 'crash' ? 'text-red-400' : e.kind === 'cleared' ? 'text-emerald-400' : 'text-amber-400'
                      }`}
                    >
                      {e.kind}
                    </span>
                    <span className="text-content-secondary truncate flex-1 text-right">{e.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
