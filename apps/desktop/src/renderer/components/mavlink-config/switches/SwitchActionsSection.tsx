// Staged edits only: a half-finished switch assignment must never be live on
// the vehicle, so nothing is written until Apply (same rule as mobile).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Radio, Zap } from 'lucide-react';
import { useParameterStore } from '../../../stores/parameter-store';
import { useTelemetryStore } from '../../../stores/telemetry-store';
import { useEffectiveRc } from '../../../stores/pseudo-tx-store';
import { SwitchDetector, switchPosition, rcinPassthroughFunction } from './switch-detect';

const PWM_MIN = 900;
const PWM_MAX = 2100;
const DETECT_WINDOW_MS = 10000;
const FIRST_AUX_CH = 5;
const LAST_CH = 16;

export const SwitchActionsSection: React.FC = () => {
  const { t } = useTranslation();
  const parameters = useParameterStore((s) => s.parameters);
  const paramsLoaded = useParameterStore((s) => s.downloadState === 'complete');
  const metadata = useParameterStore((s) => s.metadata);
  const setParameter = useParameterStore((s) => s.setParameter);
  const fcRc = useTelemetryStore((s) => s.rcChannels);
  const rc = useEffectiveRc(fcRc);

  const [pending, setPending] = useState<Map<string, number>>(new Map());
  const [applying, setApplying] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [foundChannel, setFoundChannel] = useState<number | null>(null);
  const detector = useRef(new SwitchDetector());
  const detectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const optionChoices = useMemo(() => {
    const meta = metadata?.['RC5_OPTION'] ?? metadata?.['RC7_OPTION'];
    if (!meta?.values) return null;
    return Object.entries(meta.values)
      .map(([val, label]) => ({ value: Number(val), label: String(label) }))
      .sort((a, b) => (a.value === 0 ? -1 : b.value === 0 ? 1 : a.label.localeCompare(b.label)));
  }, [metadata]);

  const servoFnLabels = useMemo(() => {
    const meta = metadata?.['SERVO1_FUNCTION'];
    const map = new Map<number, string>();
    if (meta?.values) for (const [val, label] of Object.entries(meta.values)) map.set(Number(val), String(label));
    return map;
  }, [metadata]);

  const modeChannel = useMemo(() => {
    const v = parameters.get('FLTMODE_CH')?.value ?? parameters.get('MODE_CH')?.value;
    return v && v > 0 ? v : 5;
  }, [parameters]);

  useEffect(() => {
    if (!detecting) return;
    detector.current.add(rc.channels);
    const found = detector.current.identified();
    if (found !== null) {
      setFoundChannel(found);
      setDetecting(false);
    }
  }, [detecting, rc.channels]);

  const startDetect = () => {
    detector.current.reset();
    setFoundChannel(null);
    setDetecting(true);
    if (detectTimer.current) clearTimeout(detectTimer.current);
    detectTimer.current = setTimeout(() => setDetecting(false), DETECT_WINDOW_MS);
  };
  useEffect(() => () => { if (detectTimer.current) clearTimeout(detectTimer.current); }, []);

  const stage = (paramId: string, value: number, currentValue: number | undefined) => {
    setPending((prev) => {
      const next = new Map(prev);
      if (currentValue !== undefined && value === currentValue) next.delete(paramId);
      else next.set(paramId, value);
      return next;
    });
  };

  const apply = async () => {
    setApplying(true);
    try {
      for (const [paramId, value] of pending) await setParameter(paramId, value);
      setPending(new Map());
    } finally {
      setApplying(false);
    }
  };

  const channelCount = Math.min(LAST_CH, Math.max(rc.chancount || 0, rc.channels.length, 8));
  const hasParams = paramsLoaded && parameters.size > 0;
  if (!hasParams || !optionChoices) return null;

  return (
    <div className="bg-surface rounded-xl border border-subtle p-5">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
          <Radio className="w-5 h-5 text-cyan-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-content">{t('mavlink-config:switchActionsSection.title')}</h3>
          <p className="text-sm text-content-secondary">
            {t('mavlink-config:switchActionsSection.subtitle')}
          </p>
        </div>
        <button
          onClick={startDetect}
          disabled={detecting}
          className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            detecting
              ? 'bg-cyan-500/20 text-cyan-400 animate-pulse cursor-wait'
              : 'bg-cyan-600 hover:bg-cyan-500 text-white'
          }`}
          data-tip={t('mavlink-config:switchActionsSection.detectTip')}
        >
          {detecting ? t('mavlink-config:switchActionsSection.detecting') : t('mavlink-config:switchActionsSection.findSwitch')}
        </button>
      </div>
      {foundChannel !== null && (
        <p className="text-sm text-cyan-400 mb-2">
          {t('mavlink-config:switchActionsSection.foundChannel', { ch: foundChannel, modeNote: foundChannel === modeChannel ? t('mavlink-config:switchActionsSection.modeNote') : '' })}
        </p>
      )}

      <div className="rounded-lg border border-subtle overflow-hidden mt-3">
        <div className="grid grid-cols-[52px_1fr_56px_minmax(200px,1fr)_minmax(180px,240px)] gap-2 px-3 py-2 text-[11px] uppercase tracking-wide text-content-tertiary bg-surface-raised/40 border-b border-subtle">
          <div>{t('mavlink-config:switchActionsSection.colCh')}</div>
          <div>{t('common:live')}</div>
          <div className="text-center">{t('mavlink-config:switchActionsSection.colPos')}</div>
          <div>{t('mavlink-config:switchActionsSection.colAux')}</div>
          <div>{t('mavlink-config:switchActionsSection.colDrives')}</div>
        </div>
        <div className="divide-y divide-subtle/60">
          {Array.from({ length: Math.max(0, channelCount - FIRST_AUX_CH + 1) }, (_, i) => FIRST_AUX_CH + i).map((ch) => {
            const pwm = rc.channels[ch - 1] ?? 0;
            const live = pwm > 0 && pwm < 65535;
            const pct = live ? Math.min(100, Math.max(0, ((pwm - PWM_MIN) / (PWM_MAX - PWM_MIN)) * 100)) : 0;
            const optionParam = `RC${ch}_OPTION`;
            const currentOption = parameters.get(optionParam)?.value;
            const stagedOption = pending.get(optionParam);
            const isModeCh = ch === modeChannel;
            const found = ch === foundChannel;

            // The output currently following this channel via RCIN passthrough.
            const followFn = rcinPassthroughFunction(ch);
            let followingServo = 0;
            for (let s = 1; s <= 16; s++) {
              const fn = pending.get(`SERVO${s}_FUNCTION`) ?? parameters.get(`SERVO${s}_FUNCTION`)?.value;
              if (fn === followFn) { followingServo = s; break; }
            }

            return (
              <div
                key={ch}
                className={`grid grid-cols-[52px_1fr_56px_minmax(200px,1fr)_minmax(180px,240px)] gap-2 px-3 py-2 items-center transition-colors ${
                  found ? 'bg-cyan-500/15 ring-1 ring-inset ring-cyan-500/50' : ''
                }`}
              >
                <div className="text-sm font-mono text-content">
                  {ch}
                  {isModeCh && (
                    <span className="ml-1 text-[9px] uppercase text-green-400" data-tip={t('mavlink-config:switchActionsSection.modeTip')}>
                      {t('mavlink-config:switchActionsSection.modeBadge')}
                    </span>
                  )}
                </div>
                <div className="h-2.5 rounded-full bg-surface-inset overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${found ? 'bg-cyan-400' : 'bg-cyan-600/70'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="text-center text-[10px] font-mono text-content-secondary">
                  {live ? switchPosition(pwm).toUpperCase() : '--'}
                </div>
                <div>
                  {isModeCh ? (
                    <span className="text-sm text-content-tertiary">{t('mavlink-config:switchActionsSection.flightModesAbove')}</span>
                  ) : (
                    <select
                      value={stagedOption ?? currentOption ?? 0}
                      onChange={(e) => stage(optionParam, Number(e.target.value), currentOption)}
                      className={`w-full px-2 py-1.5 text-sm rounded-md bg-surface-input border text-content focus:outline-none focus:ring-1 focus:ring-cyan-500 ${
                        stagedOption !== undefined ? 'border-amber-500/60' : 'border-subtle'
                      }`}
                    >
                      {optionChoices.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <select
                    value={followingServo}
                    onChange={(e) => {
                      const servo = Number(e.target.value);
                      if (followingServo > 0 && servo !== followingServo) {
                        // Stop driving the old output; a stale passthrough keeps twitching hardware.
                        stage(`SERVO${followingServo}_FUNCTION`, 0, parameters.get(`SERVO${followingServo}_FUNCTION`)?.value);
                      }
                      if (servo > 0) {
                        stage(`SERVO${servo}_FUNCTION`, followFn, parameters.get(`SERVO${servo}_FUNCTION`)?.value);
                      }
                    }}
                    className={`w-full px-2 py-1.5 text-sm rounded-md bg-surface-input border text-content focus:outline-none focus:ring-1 focus:ring-cyan-500 ${
                      [...pending.keys()].some((k) => /^SERVO\d+_FUNCTION$/.test(k) && (pending.get(k) === followFn || (followingServo > 0 && k === `SERVO${followingServo}_FUNCTION`)))
                        ? 'border-amber-500/60'
                        : 'border-subtle'
                    }`}
                    data-tip={t('mavlink-config:switchActionsSection.drivesTip')}
                  >
                    <option value={0}>{t('mavlink-config:switchActionsSection.nothing')}</option>
                    {Array.from({ length: 16 }, (_, s) => s + 1).map((s) => {
                      const fn = pending.get(`SERVO${s}_FUNCTION`) ?? parameters.get(`SERVO${s}_FUNCTION`)?.value;
                      const label = fn === undefined || fn === 0
                        ? t('mavlink-config:switchActionsSection.free')
                        : fn === followFn ? t('mavlink-config:switchActionsSection.thisSwitch') : servoFnLabels.get(fn) ?? t('mavlink-config:switchActionsSection.fn', { fn });
                      return (
                        <option key={s} value={s}>
                          SERVO{s} ({label})
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {pending.size > 0 && (
        <div className="mt-3 flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
          <Zap className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="flex-1 text-sm text-amber-300">
            {t('mavlink-config:switchActionsSection.staged', { count: pending.size })}
          </span>
          <button
            onClick={() => setPending(new Map())}
            disabled={applying}
            className="px-2.5 py-1.5 rounded-md text-xs text-content-secondary hover:text-content hover:bg-surface-raised transition-colors"
          >
            {t('mavlink-config:switchActionsSection.discard')}
          </button>
          <button
            onClick={() => { void apply(); }}
            disabled={applying}
            className="px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-60 transition-colors"
          >
            {applying ? t('mavlink-config:switchActionsSection.applying') : t('common:apply')}
          </button>
        </div>
      )}
    </div>
  );
};
