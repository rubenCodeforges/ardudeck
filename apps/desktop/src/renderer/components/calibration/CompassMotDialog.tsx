/**
 * CompassMotDialog
 *
 * Compass/motor interference calibration (compassmot) for ArduPilot Copter.
 * Measures how much the motors disturb the compass under load and writes the
 * COMPASS_MOT_X/Y/Z compensation vector (COMPASS_MOTCT selects throttle- vs
 * current-based compensation, chosen by the FC).
 *
 * Protocol (matches Mission Planner's ConfigCompassMot):
 *   start  -> MAV_CMD_PREFLIGHT_CALIBRATION with param6=1
 *   during -> FC streams COMPASSMOT_STATUS (msgid 177), decoded here from the
 *             raw packet stream (the registry maps 177 to a colliding
 *             MatrixPilot message, so we decode the payload by hand)
 *   finish -> COMMAND_ACK for PREFLIGHT_CALIBRATION; FC writes COMPASS_MOT_*
 *
 * This spins the motors, so the flow is gated behind an explicit safety
 * checklist and the FC is always told to finish when the dialog closes.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Zap, Play, Square } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';

interface CompassMotDialogProps {
  onClose: () => void;
}

const COMPASSMOT_STATUS_MSGID = 177;

interface CompassMotSample {
  throttle: number; // percent
  current: number; // amps
  interference: number; // percent
  compX: number;
  compY: number;
  compZ: number;
}

type RunState =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'running' }
  | { kind: 'done' }
  | { kind: 'error'; message: string };

/** Interference quality bands from the ArduPilot compassmot guidance. */
export function interferenceQuality(pct: number): { labelKey: string; tone: 'good' | 'marginal' | 'bad' } {
  if (pct < 30) return { labelKey: 'calibration:compassMotDialog.qualityGood', tone: 'good' };
  if (pct < 60) return { labelKey: 'calibration:compassMotDialog.qualityMarginal', tone: 'marginal' };
  return { labelKey: 'common:high', tone: 'bad' };
}

const TONE_TEXT: Record<'good' | 'marginal' | 'bad', string> = {
  good: 'text-emerald-400',
  marginal: 'text-amber-400',
  bad: 'text-red-400',
};

/** Decode a COMPASSMOT_STATUS payload (little-endian, wire order). */
export function decodeCompassMot(payload: number[] | Uint8Array): CompassMotSample | null {
  const bytes = new Uint8Array(20);
  bytes.set(payload.slice(0, 20));
  const view = new DataView(bytes.buffer);
  const current = view.getFloat32(0, true);
  const compX = view.getFloat32(4, true);
  const compY = view.getFloat32(8, true);
  const compZ = view.getFloat32(12, true);
  const throttle = view.getUint16(16, true) / 10; // FC reports deci-percent
  const interference = view.getUint16(18, true);
  if (!Number.isFinite(current) || !Number.isFinite(interference)) return null;
  return { throttle, current, interference, compX, compY, compZ };
}

export function CompassMotDialog({ onClose }: CompassMotDialogProps) {
  const { t } = useTranslation();
  const [run, setRun] = useState<RunState>({ kind: 'idle' });
  const [acknowledged, setAcknowledged] = useState(false);
  const [samples, setSamples] = useState<CompassMotSample[]>([]);
  const [latest, setLatest] = useState<CompassMotSample | null>(null);
  const runKindRef = useRef<RunState['kind']>('idle');
  runKindRef.current = run.kind;

  // Subscribe to the raw packet stream and decode COMPASSMOT_STATUS while running.
  useEffect(() => {
    const unsub = window.electronAPI?.onPacket?.((p) => {
      if (p.msgid !== COMPASSMOT_STATUS_MSGID || p.compid !== 1) return;
      if (runKindRef.current !== 'running' && runKindRef.current !== 'starting') return;
      const sample = decodeCompassMot(p.payload);
      if (!sample) return;
      // First status frame confirms the FC accepted the start command.
      if (runKindRef.current === 'starting') setRun({ kind: 'running' });
      setLatest(sample);
      setSamples((prev) => [...prev, sample]);
    });
    return () => {
      unsub?.();
    };
  }, []);

  const start = useCallback(async () => {
    if (!acknowledged) return;
    setSamples([]);
    setLatest(null);
    setRun({ kind: 'starting' });
    try {
      const result = await window.electronAPI?.calibrationCompassMotStart?.();
      if (!result?.success) {
        setRun({ kind: 'error', message: result?.error || t('calibration:compassMotDialog.failedToStart') });
      }
      // Stay in 'starting' on success until the first COMPASSMOT_STATUS arrives.
    } catch (err) {
      setRun({ kind: 'error', message: err instanceof Error ? err.message : t('common:unknownError') });
    }
  }, [acknowledged, t]);

  const finish = useCallback(async () => {
    try {
      await window.electronAPI?.calibrationCompassMotStop?.();
    } catch {
      // Best-effort; the FC also exits compassmot on disarm.
    }
    setRun({ kind: 'done' });
  }, []);

  // If the dialog is dismissed mid-run, always tell the FC to finish so it does
  // not stay in the calibration loop with motors live.
  const handleClose = useCallback(() => {
    if (runKindRef.current === 'running' || runKindRef.current === 'starting') {
      window.electronAPI?.calibrationCompassMotStop?.().catch(() => undefined);
    }
    onClose();
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleClose]);

  const peakInterference = samples.reduce((m, s) => Math.max(m, s.interference), 0);
  const isBusy = run.kind === 'starting' || run.kind === 'running';

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]"
      onClick={handleClose}
    >
      <div
        className="bg-surface-solid rounded-xl border border-subtle w-full max-w-lg mx-4 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 px-5 pt-5 pb-3">
          <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5 text-orange-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-content">{t('calibration:compassMotDialog.title')}</h3>
            <p className="text-xs text-content-secondary mt-1 leading-relaxed">
              {t('calibration:compassMotDialog.description')}
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 pb-4 space-y-3">
          {/* Safety checklist (before running) */}
          {(run.kind === 'idle' || run.kind === 'error') && (
            <>
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div className="text-xs text-red-200 space-y-1.5">
                  <p className="font-medium">{t('calibration:compassMotDialog.motorsWillSpin')}</p>
                  <ul className="list-disc list-inside space-y-1 text-red-200/80">
                    <li>{t('calibration:compassMotDialog.tieDown')}</li>
                    <li>{t('calibration:compassMotDialog.propsOn')}</li>
                    <li>{t('calibration:compassMotDialog.batteryPowered')}</li>
                    <li>{t('calibration:compassMotDialog.raiseThrottle')}</li>
                  </ul>
                </div>
              </div>

              <ol className="text-xs text-content-secondary space-y-1 list-decimal list-inside leading-relaxed">
                <li>{t('calibration:compassMotDialog.stepStart')}</li>
                <li>{t('calibration:compassMotDialog.stepHold')}</li>
                <li>{t('calibration:compassMotDialog.stepFinish')}</li>
              </ol>

              <label className="flex items-center gap-2 text-xs text-content cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  className="w-4 h-4 rounded border-subtle bg-surface accent-orange-500"
                />
                {t('calibration:compassMotDialog.acknowledge')}
              </label>

              {run.kind === 'error' && (
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-red-200">{run.message}</div>
                </div>
              )}
            </>
          )}

          {/* Live readouts + plot (while running) */}
          {isBusy && (
            <>
              {run.kind === 'starting' && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/30">
                  <Loader2 className="w-4 h-4 text-blue-400 animate-spin shrink-0" />
                  <div className="text-xs text-blue-200">
                    {t('calibration:compassMotDialog.waitingSampling')}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                <Stat label={t('common:throttle')} value={`${(latest?.throttle ?? 0).toFixed(0)}%`} />
                <Stat label={t('common:current')} value={`${(latest?.current ?? 0).toFixed(1)} A`} />
                <Stat
                  label={t('calibration:compassMotDialog.interference')}
                  value={`${(latest?.interference ?? 0).toFixed(0)}%`}
                  tone={interferenceQuality(latest?.interference ?? 0).tone}
                />
              </div>

              <InterferencePlot samples={samples} />

              <p className="text-[11px] text-content-tertiary leading-relaxed">
                {t('calibration:compassMotDialog.raiseNow', { peak: peakInterference.toFixed(0) })}
              </p>
            </>
          )}

          {/* Result summary (after finishing) */}
          {run.kind === 'done' && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-xs text-emerald-200">
                  <Trans
                    i18nKey="calibration:compassMotDialog.saved"
                    components={{ b: <span className="font-medium" /> }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 rounded-lg bg-surface border border-subtle">
                  <div className="text-[11px] text-content-tertiary uppercase tracking-wide">
                    {t('calibration:compassMotDialog.peakInterference')}
                  </div>
                  <div className={`text-lg font-semibold ${TONE_TEXT[interferenceQuality(peakInterference).tone]}`}>
                    {peakInterference.toFixed(0)}%
                    <span className="text-xs font-normal text-content-secondary ml-2">
                      {t(interferenceQuality(peakInterference).labelKey)}
                    </span>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-surface border border-subtle">
                  <div className="text-[11px] text-content-tertiary uppercase tracking-wide">
                    {t('calibration:compassMotDialog.compensation')}
                  </div>
                  <div className="text-sm font-medium text-content tabular-nums mt-0.5">
                    {latest
                      ? `${latest.compX.toFixed(2)}, ${latest.compY.toFixed(2)}, ${latest.compZ.toFixed(2)}`
                      : '-'}
                  </div>
                </div>
              </div>

              {peakInterference >= 60 && (
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-200">
                    {t('calibration:compassMotDialog.highWarning')}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-subtle">
          <button
            onClick={handleClose}
            className="px-3 py-1.5 rounded-lg text-xs text-content-secondary hover:text-content hover:bg-surface transition-colors"
          >
            {run.kind === 'done' ? t('common:close') : t('common:cancel')}
          </button>
          {(run.kind === 'idle' || run.kind === 'error') && (
            <button
              onClick={start}
              disabled={!acknowledged}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-orange-600 hover:bg-orange-500 disabled:bg-orange-600/40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5" />
              {t('common:start')}
            </button>
          )}
          {isBusy && (
            <button
              onClick={finish}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 transition-colors flex items-center gap-1.5"
            >
              <Square className="w-3.5 h-3.5" />
              {t('calibration:compassMotDialog.finishSave')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'marginal' | 'bad' }) {
  return (
    <div className="p-2.5 rounded-lg bg-surface border border-subtle text-center">
      <div className="text-[11px] text-content-tertiary uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${tone ? TONE_TEXT[tone] : 'text-content'}`}>
        {value}
      </div>
    </div>
  );
}

/**
 * Interference-vs-throttle plot. Pure inline SVG so it inherits the theme:
 * axes use the muted content colour via currentColor, the trace uses a fixed
 * accent that reads on both light and dark.
 */
function InterferencePlot({ samples }: { samples: CompassMotSample[] }) {
  const { t } = useTranslation();
  const W = 460;
  const H = 150;
  const PAD_L = 30;
  const PAD_B = 20;
  const PAD_T = 8;
  const PAD_R = 8;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const x = (throttle: number) => PAD_L + (Math.max(0, Math.min(100, throttle)) / 100) * plotW;
  const y = (interference: number) => PAD_T + (1 - Math.max(0, Math.min(100, interference)) / 100) * plotH;

  // Order by throttle so the trace reads left-to-right as load increases.
  const ordered = [...samples].sort((a, b) => a.throttle - b.throttle);
  const points = ordered.map((s) => `${x(s.throttle).toFixed(1)},${y(s.interference).toFixed(1)}`).join(' ');

  const gridY = [0, 25, 50, 75, 100];
  const gridX = [0, 25, 50, 75, 100];

  return (
    <div className="rounded-lg border border-subtle bg-surface p-2 overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full text-content-tertiary" style={{ minWidth: 320 }}>
        {/* Grid + axis labels */}
        {gridY.map((g) => (
          <g key={`y${g}`}>
            <line
              x1={PAD_L}
              y1={y(g)}
              x2={W - PAD_R}
              y2={y(g)}
              stroke="currentColor"
              strokeOpacity={0.15}
              strokeWidth={1}
            />
            <text x={PAD_L - 4} y={y(g) + 3} textAnchor="end" fontSize={9} fill="currentColor">
              {g}
            </text>
          </g>
        ))}
        {gridX.map((g) => (
          <text key={`x${g}`} x={x(g)} y={H - 6} textAnchor="middle" fontSize={9} fill="currentColor">
            {g}
          </text>
        ))}
        <text
          x={10}
          y={PAD_T + plotH / 2}
          textAnchor="middle"
          fontSize={9}
          fill="currentColor"
          transform={`rotate(-90 10 ${PAD_T + plotH / 2})`}
        >
          {t('calibration:compassMotDialog.axisInterference')}
        </text>
        <text x={PAD_L + plotW / 2} y={H} textAnchor="middle" fontSize={9} fill="currentColor">
          {t('calibration:compassMotDialog.axisThrottle')}
        </text>

        {/* Interference trace */}
        {ordered.length > 1 && (
          <polyline points={points} fill="none" stroke="#f87171" strokeWidth={2} strokeLinejoin="round" />
        )}
        {ordered.map((s, i) => (
          <circle key={i} cx={x(s.throttle)} cy={y(s.interference)} r={1.8} fill="#f87171" />
        ))}
      </svg>
    </div>
  );
}

export default CompassMotDialog;
