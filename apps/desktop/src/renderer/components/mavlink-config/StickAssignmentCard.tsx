/**
 * Which stick flies (or drives) what.
 *
 * One press per job: a preset for the common setups, or Assign followed by
 * moving the stick you want. Everything is written as RCMAP_* on the vehicle,
 * so no transmitter mixing is involved and switching back is one more press.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Gamepad2, Check, RotateCcw } from 'lucide-react';
import { useParameterStore } from '../../stores/parameter-store';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { useConnectionStore } from '../../stores/connection-store';
import { useEffectiveRc } from '../../stores/pseudo-tx-store';
import { getVehicleClass } from '../../../shared/telemetry-types';
import {
  assignChannel,
  movedChannel,
  rcmapChanges,
  stickLabel,
  DEFAULT_RCMAP,
  STICK_FUNCTIONS,
  type Rcmap,
  type StickFunction,
} from '../../utils/stick-assign';

/** How long the pilot has to move a stick before Assign gives up. */
const LEARN_TIMEOUT_MS = 8000;

export function StickAssignmentCard(): JSX.Element {
  const { t } = useTranslation();
  const { parameters, setParameterImmediate } = useParameterStore();
  const fcRc = useTelemetryStore((s) => s.rcChannels);
  const rcChannels = useEffectiveRc(fcRc);
  const armed = useTelemetryStore((s) => s.flight.armed);
  const mavType = useConnectionStore((s) => s.connectionState.mavType);
  const isGround = getVehicleClass(mavType) === 'rover';

  const rcmap: Rcmap = useMemo(() => ({
    roll: (parameters.get('RCMAP_ROLL')?.value as number) ?? 1,
    pitch: (parameters.get('RCMAP_PITCH')?.value as number) ?? 2,
    throttle: (parameters.get('RCMAP_THROTTLE')?.value as number) ?? 3,
    yaw: (parameters.get('RCMAP_YAW')?.value as number) ?? 4,
  }), [parameters]);

  const [learning, setLearning] = useState<StickFunction | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [needsReboot, setNeedsReboot] = useState(false);
  const [busy, setBusy] = useState(false);
  const baselineRef = useRef<number[]>([]);
  const learnStartedRef = useRef(0);

  const write = async (next: Rcmap, description: string) => {
    const changes = rcmapChanges(rcmap, next);
    if (changes.length === 0) {
      setStatus(t('mavlink-config:stickAssignmentCard.alreadySet'));
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      for (const change of changes) {
        const ok = await setParameterImmediate(change.param, change.value);
        if (!ok) {
          setStatus(t('mavlink-config:stickAssignmentCard.writeFailed', { param: change.param }));
          return;
        }
      }
      setStatus(description);
      setNeedsReboot(true);
    } finally {
      setBusy(false);
    }
  };

  // Learning: whichever channel travels furthest from where it sat when the
  // button was pressed gets the job, and whatever was on that channel takes
  // the one this function is leaving.
  useEffect(() => {
    if (!learning) return;
    if (baselineRef.current.length === 0) {
      baselineRef.current = [...rcChannels.channels];
      learnStartedRef.current = Date.now();
      return;
    }
    const channel = movedChannel(baselineRef.current, rcChannels.channels);
    if (channel !== null) {
      const fn = learning;
      setLearning(null);
      baselineRef.current = [];
      void write(
        assignChannel(rcmap, fn, channel),
        t('mavlink-config:stickAssignmentCard.nowOnChannel', { stick: stickLabel(fn, isGround), channel }),
      );
      return;
    }
    if (Date.now() - learnStartedRef.current > LEARN_TIMEOUT_MS) {
      setLearning(null);
      baselineRef.current = [];
      setStatus(t('mavlink-config:stickAssignmentCard.noMovement'));
    }
  }, [learning, rcChannels.channels]); // eslint-disable-line react-hooks/exhaustive-deps

  const startLearn = (fn: StickFunction) => {
    setStatus(null);
    baselineRef.current = [];
    setLearning(fn);
  };

  const reboot = async () => {
    setBusy(true);
    try {
      const ok = await window.electronAPI?.mavlinkReboot();
      setStatus(ok
        ? t('mavlink-config:stickAssignmentCard.rebooting')
        : t('mavlink-config:stickAssignmentCard.rebootRejected'));
      if (ok) setNeedsReboot(false);
    } finally {
      setBusy(false);
    }
  };

  const disabled = armed || busy;
  const presetButton = 'px-3 py-2 rounded-lg text-xs font-medium bg-surface-raised text-content-secondary hover:text-content hover:bg-surface-overlay disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-left';

  return (
    <div className="bg-surface rounded-xl border border-subtle p-5">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center">
          <Gamepad2 className="w-5 h-5 text-violet-400" />
        </div>
        <div className="flex-1">
          <h3 className="font-medium text-content">{t('mavlink-config:stickAssignmentCard.title')}</h3>
          <p className="text-xs text-content-secondary">
            {t('mavlink-config:stickAssignmentCard.subtitle')}
          </p>
        </div>
      </div>

      {armed && (
        <div className="mb-4 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
          {t('mavlink-config:stickAssignmentCard.disarmFirst')}
        </div>
      )}

      <div className="grid gap-2 mb-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
        <button
          // Derived from the current map, not a fixed table: a vehicle already
          // on a custom assignment keeps it, throttle and pitch just trade.
          onClick={() => write(
            assignChannel(rcmap, 'throttle', rcmap.pitch),
            t('mavlink-config:stickAssignmentCard.throttleMoved'),
          )}
          disabled={disabled}
          data-tip={t('mavlink-config:stickAssignmentCard.elevatorTip')}
          className={presetButton}
        >
          <div className="text-content">{t('mavlink-config:stickAssignmentCard.elevatorTitle')}</div>
          <div className="mt-0.5 text-[11px] text-content-tertiary">
            {t('mavlink-config:stickAssignmentCard.elevatorDesc')}
          </div>
        </button>
        <button
          onClick={() => write(DEFAULT_RCMAP, t('mavlink-config:stickAssignmentCard.backToStandard'))}
          disabled={disabled}
          data-tip={t('mavlink-config:stickAssignmentCard.standardTip')}
          className={presetButton}
        >
          <div className="flex items-center gap-1.5 text-content">
            <RotateCcw className="w-3 h-3" /> {t('mavlink-config:stickAssignmentCard.standardTitle')}
          </div>
          <div className="mt-0.5 text-[11px] text-content-tertiary">
            {t('mavlink-config:stickAssignmentCard.standardDesc')}
          </div>
        </button>
      </div>

      <div className="space-y-1.5">
        {STICK_FUNCTIONS.map((fn) => {
          const channel = rcmap[fn];
          const pwm = rcChannels.channels[channel - 1];
          const teaching = learning === fn;
          return (
            <div key={fn} className="flex items-center gap-3 rounded-lg bg-surface-raised px-3 py-2">
              <span className="w-28 shrink-0 text-xs text-content">{stickLabel(fn, isGround)}</span>
              <span className="w-16 shrink-0 text-xs text-content-secondary tabular-nums">{t('mavlink-config:stickAssignmentCard.ch', { channel })}</span>
              <span className="w-14 shrink-0 text-[11px] text-content-tertiary tabular-nums">
                {pwm ? `${pwm}` : '--'}
              </span>
              <div className="relative h-1.5 flex-1 rounded-full bg-surface-overlay">
                {pwm ? (
                  <div
                    className="absolute inset-y-0 rounded-full bg-violet-500/70"
                    style={{ left: '0%', width: `${Math.max(0, Math.min(100, ((pwm - 1000) / 1000) * 100))}%` }}
                  />
                ) : null}
              </div>
              <button
                onClick={() => (teaching ? setLearning(null) : startLearn(fn))}
                disabled={disabled && !teaching}
                className={`w-32 shrink-0 rounded-md px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  teaching
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'bg-violet-600/80 text-white hover:bg-violet-500'
                }`}
              >
                {teaching ? t('mavlink-config:stickAssignmentCard.moveStick') : t('mavlink-config:stickAssignmentCard.assign')}
              </button>
            </div>
          );
        })}
      </div>

      {status && (
        <div className="mt-3 flex items-center gap-2 text-xs text-content-secondary">
          <Check className="w-3.5 h-3.5 text-emerald-400" />
          {status}
        </div>
      )}

      {needsReboot && (
        <div className="mt-3 flex items-center gap-3 rounded-lg bg-blue-500/10 px-3 py-2">
          <span className="flex-1 text-xs text-blue-300">
            {t('mavlink-config:stickAssignmentCard.rebootNeeded')}
          </span>
          <button
            onClick={reboot}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 transition-colors"
          >
            {t('common:rebootFlightController')}
          </button>
        </div>
      )}
    </div>
  );
}
