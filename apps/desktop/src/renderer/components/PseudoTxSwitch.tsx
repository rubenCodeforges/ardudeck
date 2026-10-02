/**
 * Pseudo Transmitter switch
 *
 * One toggle that lets a USB-connected handset (EdgeTX in "USB Joystick" mode) stand in for a
 * real RC link, so modes, quick setup, telemetry and the 3D view can be configured and tested
 * with no flight controller and no receiver attached.
 *
 * Deliberately manual. It never turns itself on: a stand-in that appears by itself is a stand-in
 * that will eventually be mistaken for a live aircraft, and the whole point of the switch is
 * that you always know which you are looking at. Real FC channels always take priority anyway
 * (see `preferredRcChannels`), so leaving it on with hardware attached is harmless.
 *
 * Styling follows the surrounding config cards: `bg-surface rounded-xl border border-subtle p-4`
 * with an emerald toggle, so it reads as part of the page rather than bolted on.
 */

import { useState, useSyncExternalStore } from 'react';
import { Usb, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { usePseudoTxStore } from '../stores/pseudo-tx-store';
import { useConnectionStore } from '../stores/connection-store';
import { isTrainerActive, onTrainerActive } from '../utils/rc-source-arbiter';
import type { ChannelSource } from '../utils/pseudo-tx';

function useTrainerActive(): boolean {
  return useSyncExternalStore((cb) => onTrainerActive(() => cb()), isTrainerActive);
}

/** Human-readable description of where a channel gets its value. */
function sourceLabel(src: ChannelSource, t: TFunction): string {
  switch (src.kind) {
    case 'none':
      return t('app:pseudoTx.source.unassigned');
    case 'axis':
      return t('app:pseudoTx.source.axis', { index: src.index });
    case 'button':
      return t('app:pseudoTx.source.button', { index: src.index });
    case 'button3':
      return t('app:pseudoTx.source.buttons', { low: src.low, high: src.high });
  }
}

/**
 * Channel mapping, taught by moving the control you want to bind.
 *
 * There is no preset to pick, because channel order (AETR, TAER, ...) is a per-model setting
 * on the transmitter and cannot be read back over USB. Asking the user to move the control is
 * the only way to know, and it takes a second per channel.
 */
function MappingPanel(): JSX.Element {
  const { t } = useTranslation();
  const mapping = usePseudoTxStore((s) => s.mapping);
  const channels = usePseudoTxStore((s) => s.channels);
  const learning = usePseudoTxStore((s) => s.learning);
  const startLearn = usePseudoTxStore((s) => s.startLearn);
  const cancelLearn = usePseudoTxStore((s) => s.cancelLearn);
  const setSource = usePseudoTxStore((s) => s.setSource);
  const updateMap = usePseudoTxStore((s) => s.updateMap);
  const resetMapping = usePseudoTxStore((s) => s.resetMapping);

  return (
    <div className="mt-3 pt-3 border-t border-subtle">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-content">{t('common:channelMapping')}</span>
        <button
          type="button"
          onClick={resetMapping}
          className="text-xs text-content-secondary hover:text-content transition-colors"
        >
          {t('common:reset')}
        </button>
      </div>

      <div className="space-y-1.5">
        {mapping.slice(0, 8).map((m, i) => {
          const pwm = channels[i] ?? 1500;
          const pct = Math.min(100, Math.max(0, ((pwm - 1000) / 1000) * 100));
          const isLearning = learning === i;
          return (
            <div key={i} className="flex items-center gap-2.5">
              <span className="w-9 shrink-0 text-xs text-content-secondary">CH{i + 1}</span>

              <div className="relative flex-1 h-5 rounded-lg bg-surface-raised overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-blue-500/40 transition-[width] duration-75"
                  style={{ width: `${pct}%` }}
                />
                <span className="absolute inset-0 flex items-center justify-center text-[10px] tabular-nums text-content">
                  {pwm}
                </span>
              </div>

              <span
                className="w-20 shrink-0 text-[10px] text-content-secondary truncate"
                title={sourceLabel(m.source, t)}
              >
                {sourceLabel(m.source, t)}
              </span>

              <button
                type="button"
                onClick={() => updateMap(i, { reverse: !m.reverse })}
                disabled={m.source.kind === 'none'}
                data-tip={m.reverse ? t('app:pseudoTx.reversedRestore') : t('common:reverseThisChannel')}
                className={`shrink-0 px-1.5 py-1 rounded-lg text-xs border transition-colors disabled:opacity-30 ${
                  m.reverse
                    ? 'bg-amber-500/15 text-amber-400 border-amber-500/40'
                    : 'bg-surface-raised text-content-secondary border-subtle hover:text-content'
                }`}
              >
                {t('common:rev')}
              </button>

              <button
                type="button"
                onClick={() => (isLearning ? cancelLearn() : startLearn(i))}
                className={`shrink-0 px-2 py-1 rounded-lg text-xs transition-colors ${
                  isLearning
                    ? 'bg-blue-500/15 text-blue-400 border border-blue-500/40 animate-pulse'
                    : 'bg-surface-raised text-content-secondary border border-subtle hover:text-content'
                }`}
              >
                {isLearning ? t('app:pseudoTx.moveIt') : t('common:assign')}
              </button>

              <button
                type="button"
                onClick={() => setSource(i, { kind: 'none' })}
                disabled={m.source.kind === 'none'}
                title={t('common:unassign')}
                className="shrink-0 w-5 text-xs text-content-secondary hover:text-content disabled:opacity-0 transition-colors"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-xs text-content-secondary">
        <Trans i18nKey="app:pseudoTx.assignHint" components={{ b: <span className="text-content" /> }} />
      </p>

      <DeviceMonitor />
    </div>
  );
}

/**
 * Everything the handset actually reports, live.
 *
 * This exists because a switch that "does not work" has three quite different causes and they
 * are indistinguishable from the channel bars alone: the switch may be on an axis nobody
 * mapped, it may arrive as a button, or Chromium may have forced the device into its
 * "standard" gamepad layout, which keeps four axes and DISCARDS the rest - taking every switch
 * with them. Watching the raw values while flicking a switch says which.
 */
function DeviceMonitor(): JSX.Element {
  const raw = usePseudoTxStore((s) => s.raw);
  const mappingMode = usePseudoTxStore((s) => s.mappingMode);
  const standard = mappingMode === 'standard';
  const { t } = useTranslation();

  return (
    <div className="mt-3 pt-3 border-t border-subtle">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-content">{t('common:deviceMonitor')}</span>
        <span className="text-[10px] text-content-secondary">
          {t('app:pseudoTx.monitorCounts', { axes: raw.axes.length, buttons: raw.buttons.length })}
          {mappingMode ? t('app:pseudoTx.monitorMapping', { mode: mappingMode }) : t('app:pseudoTx.monitorRawHid')}
        </span>
      </div>

      {standard && (
        <p className="mb-2 text-xs text-amber-400">
          {t('app:pseudoTx.standardLayoutWarning')}
        </p>
      )}

      <div className="grid grid-cols-5 gap-1">
        {raw.axes.map((v, i) => (
          <div key={`a${i}`} className="rounded bg-surface-raised px-1.5 py-1">
            <div className="text-[10px] text-content-secondary">a{i}</div>
            <div className="text-[10px] tabular-nums text-content">{v.toFixed(2)}</div>
          </div>
        ))}
      </div>

      {raw.buttons.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {raw.buttons.map((down, i) => (
            <span
              key={`b${i}`}
              className={`px-1.5 py-0.5 rounded text-[10px] tabular-nums ${
                down ? 'bg-emerald-500/20 text-emerald-400' : 'bg-surface-raised text-content-secondary'
              }`}
            >
              {i}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function PseudoTxSwitch(): JSX.Element {
  const { t } = useTranslation();
  const [showMap, setShowMap] = useState(false);
  const [vehicleRefusal, setVehicleRefusal] = useState<string | null>(null);
  const enabled = usePseudoTxStore((s) => s.enabled);
  const connected = usePseudoTxStore((s) => s.connected);
  const vehicleControl = usePseudoTxStore((s) => s.vehicleControl);
  const vehicleSendError = usePseudoTxStore((s) => s.vehicleSendError);
  const vehicleFps = usePseudoTxStore((s) => s.vehicleFps);
  const enableVehicleControl = usePseudoTxStore((s) => s.enableVehicleControl);
  const disableVehicleControl = usePseudoTxStore((s) => s.disableVehicleControl);
  const connState = useConnectionStore((s) => s.connectionState);
  const mavlinkConnected = connState.isConnected && connState.protocol === 'mavlink';
  const trainerActive = useTrainerActive();
  const deviceName = usePseudoTxStore((s) => s.deviceName);
  const isTransmitter = usePseudoTxStore((s) => s.isTransmitter);
  const enable = usePseudoTxStore((s) => s.enable);
  const disable = usePseudoTxStore((s) => s.disable);
  const sendError = usePseudoTxStore((s) => s.sendError);
  const sentFrames = usePseudoTxStore((s) => s.sentFrames);

  const detail = !enabled
    ? t('app:pseudoTx.detailOff')
    : connected
      ? t('app:pseudoTx.detailConnected', { device: deviceName, frames: sentFrames })
      : t('app:pseudoTx.detailWaiting');

  return (
    <div className="bg-surface rounded-xl border border-subtle p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <Usb
            className={`w-4 h-4 mt-0.5 shrink-0 ${
              enabled && connected ? 'text-emerald-400' : 'text-content-secondary'
            }`}
          />
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-content">{t('app:pseudoTx.title')}</h3>
            <p className="text-xs text-content-secondary mt-0.5 truncate" title={detail}>
              {sendError ? <span className="text-amber-400">{sendError}</span> : detail}
              {enabled && connected && !isTransmitter && (
                <span className="text-amber-400">{t('app:pseudoTx.gamepadWarning')}</span>
              )}
            </p>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={t('app:pseudoTx.title')}
          onClick={() => (enabled ? disable() : enable())}
          className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${
            enabled ? 'bg-emerald-500' : 'bg-surface-inset'
          }`}
        >
          <div
            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white border border-strong shadow-sm transition-transform ${
              enabled ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>

      {trainerActive && (
        <p className="mt-3 flex items-center gap-2 text-xs text-amber-400">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {t('app:pseudoTx.trainerActive')}
        </p>
      )}

      {enabled && mavlinkConnected && !trainerActive && (
        <div className="mt-3 pt-3 border-t border-subtle flex items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <AlertTriangle
              className={`w-4 h-4 mt-0.5 shrink-0 ${vehicleControl ? 'text-amber-400' : 'text-content-secondary'}`}
            />
            <div className="min-w-0">
              <h3
                className="text-sm font-medium text-content"
                data-tip={t('app:pseudoTx.overrideTip')}
              >
                {t('common:joystickControlsVehicle')}
              </h3>
              <p className="text-xs mt-0.5 truncate">
                {vehicleControl ? (
                  vehicleSendError ? (
                    <span className="text-red-400">{vehicleSendError}</span>
                  ) : (
                    <span className="text-amber-400">{t('app:pseudoTx.framesToVehicle', { fps: vehicleFps })}</span>
                  )
                ) : (
                  <span className="text-content-secondary">
                    {vehicleRefusal ?? t('app:pseudoTx.vehicleOff')}
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={vehicleControl}
            aria-label={t('common:joystickControlsVehicle')}
            onClick={() => {
              if (vehicleControl) {
                disableVehicleControl();
                setVehicleRefusal(null);
              } else {
                const r = enableVehicleControl();
                setVehicleRefusal(r.ok ? null : (r.reason ?? t('app:pseudoTx.unavailable')));
              }
            }}
            className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${
              vehicleControl ? 'bg-amber-500' : 'bg-surface-inset'
            }`}
          >
            <div
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white border border-strong shadow-sm transition-transform ${
                vehicleControl ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      )}

      {enabled && connected && (
        <>
          <button
            type="button"
            onClick={() => setShowMap((v) => !v)}
            className="mt-3 flex items-center gap-1 text-xs text-content-secondary hover:text-content transition-colors"
          >
            {showMap ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
            {t('common:channelMapping')}
          </button>
          {showMap && <MappingPanel />}
        </>
      )}
    </div>
  );
}
