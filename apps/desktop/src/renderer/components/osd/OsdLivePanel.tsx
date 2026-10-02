/**
 * OSD Live Panel
 *
 * Right-panel content for live mode.
 * Shows connection status, mode switches, live RC input, and a collapsible RC
 * override sender.
 *
 * Two DISTINCT things, kept separate so they aren't confused:
 *  - Live RC input   -> telemetry-store.rcChannels (the real sticks from the FC,
 *                       read-only). This is what moves when you touch the TX.
 *  - RC override out -> flight-control-store.channels (values ArduDeck SENDS to
 *                       the FC when "Send override" is enabled).
 */

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useConnectionStore } from '../../stores/connection-store';
import { firmwareLabel } from '../../../shared/firmware-types';
import { useFlightControlStore } from '../../stores/flight-control-store';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { useEffectiveRc } from '../../stores/pseudo-tx-store';
import { OsdModeSwitchPanel } from './OsdModeSwitchPanel';
import { buildLiveRcRows, rssiPercent } from '../../utils/osd/osd-live-rc';

export function OsdLivePanel() {
  const { t } = useTranslation();
  const connectionState = useConnectionStore((s) => s.connectionState);
  const fcRc = useTelemetryStore((s) => s.rcChannels);
  // Falls back to a USB handset when no FC is streaming, so the panel is usable on the bench.
  const rcChannels = useEffectiveRc(fcRc);
  const channels = useFlightControlStore((s) => s.channels);
  const setChannel = useFlightControlStore((s) => s.setChannel);
  const isOverrideActive = useFlightControlStore((s) => s.isOverrideActive);
  const startOverride = useFlightControlStore((s) => s.startOverride);
  const stopOverride = useFlightControlStore((s) => s.stopOverride);

  const [rcExpanded, setRcExpanded] = useState(false);

  const liveRows = buildLiveRcRows(rcChannels);
  const rssi = rssiPercent(rcChannels.rssi);

  const handleRcToggle = useCallback((enabled: boolean) => {
    if (enabled) {
      startOverride();
    } else {
      stopOverride();
    }
  }, [startOverride, stopOverride]);

  const handleReset = useCallback(() => {
    setChannel(0, 1500); // Roll
    setChannel(1, 1500); // Pitch
    setChannel(2, 1000); // Throttle
    setChannel(3, 1500); // Yaw
    setChannel(4, 1000); // AUX1
    setChannel(5, 1000); // AUX2
  }, [setChannel]);

  return (
    <div className="flex flex-col h-full">
      {/* Connection status */}
      <div className="px-3 py-2 border-b border-subtle">
        <h3 className="text-xs font-medium text-content mb-1">{t('osd:osdLivePanel.liveTelemetry')}</h3>
        {connectionState.isConnected ? (
          <p className="text-[10px] text-green-400">
            {t('osd:osdLivePanel.connectedTo', { fc: connectionState.fcVariant || (connectionState.firmware || connectionState.autopilot ? firmwareLabel(connectionState) : 'FC') })}
            {connectionState.fcVersion && ` ${connectionState.fcVersion}`}
          </p>
        ) : (
          <p className="text-[10px] text-content-secondary">
            {t('osd:osdLivePanel.connectForLive')}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Mode switches */}
        {connectionState.isConnected && (
          <div className="border-b border-subtle py-2">
            <OsdModeSwitchPanel />
          </div>
        )}

        {/* Live RC input — read-only, straight from the FC (the real sticks). */}
        {connectionState.isConnected && (
          <div className="border-b border-subtle px-3 py-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-medium text-content-secondary uppercase tracking-wider">
                {t('osd:osdLivePanel.liveRcInput')}
              </span>
              <span className="text-[9px] font-mono text-content-secondary">
                RSSI {rssi === null ? '--' : `${rssi}%`}
              </span>
            </div>
            {liveRows.length === 0 ? (
              <p className="text-[10px] text-content-tertiary">
                {t('osd:osdLivePanel.waitingRc')}
              </p>
            ) : (
              <div className="space-y-1.5">
                {liveRows.map((row, i) => (
                  <RcBar key={i} label={row.label} value={row.value} isThrottle={row.isThrottle} readOnly />
                ))}
              </div>
            )}
          </div>
        )}

        {/* RC override sender (collapsed by default) — values ArduDeck sends TO the FC. */}
        {connectionState.isConnected && (
          <div className="border-b border-subtle">
            <button
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface text-left"
              onClick={() => setRcExpanded(!rcExpanded)}
            >
              <svg
                className={`w-3 h-3 text-content-secondary shrink-0 transition-transform ${rcExpanded ? 'rotate-90' : ''}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
              <span className="text-[10px] font-medium text-content-secondary uppercase tracking-wider">
                {t('osd:osdLivePanel.sendRcOverride')}
              </span>
              {isOverrideActive && <span className="ml-auto text-[9px] text-amber-400">{t('osd:osdLivePanel.sending')}</span>}
            </button>

            {rcExpanded && (
              <div className="px-3 pb-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="flex items-center gap-2 text-[10px] text-content-secondary">
                    <input
                      type="checkbox"
                      checked={isOverrideActive}
                      onChange={(e) => handleRcToggle(e.target.checked)}
                      className="rounded-sm bg-surface-raised border w-3 h-3"
                    />
                    {t('osd:osdLivePanel.sendOverride')}
                  </label>
                  <button
                    onClick={handleReset}
                    className="text-[10px] text-blue-400 hover:text-blue-300"
                  >
                    {t('common:reset')}
                  </button>
                </div>

                <div className="space-y-2">
                  <RcBar label={t('common:roll')} value={channels[0] ?? 1500} onChange={(v) => setChannel(0, v)} />
                  <RcBar label={t('common:pitch')} value={channels[1] ?? 1500} onChange={(v) => setChannel(1, v)} />
                  <RcBar label={t('osd:osdLivePanel.thr')} value={channels[2] ?? 1000} onChange={(v) => setChannel(2, v)} isThrottle />
                  <RcBar label={t('common:yaw')} value={channels[3] ?? 1500} onChange={(v) => setChannel(3, v)} />
                  <div className="border-t border-subtle pt-1.5 mt-1.5">
                    <RcBar label="AUX1" value={channels[4] ?? 1000} onChange={(v) => setChannel(4, v)} />
                    <RcBar label="AUX2" value={channels[5] ?? 1000} onChange={(v) => setChannel(5, v)} />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function RcBar({
  label,
  value,
  onChange,
  isThrottle = false,
  readOnly = false,
}: {
  label: string;
  value: number;
  onChange?: (v: number) => void;
  isThrottle?: boolean;
  readOnly?: boolean;
}) {
  const percentage = Math.max(0, Math.min(100, ((value - 1000) / 1000) * 100));
  const barColor = isThrottle
    ? `rgba(34, 197, 94, ${0.3 + (percentage / 100) * 0.7})`
    : value > 1500
      ? 'rgba(59, 130, 246, 0.6)'
      : value < 1500
        ? 'rgba(249, 115, 22, 0.6)'
        : 'rgba(107, 114, 128, 0.4)';

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-content-secondary w-8 shrink-0">{label}</span>
      <div className="flex-1 relative h-3.5 bg-surface-raised rounded overflow-hidden">
        {!isThrottle && (
          <div className="absolute top-0 bottom-0 w-px bg-gray-600" style={{ left: '50%' }} />
        )}
        <div
          className="absolute top-0 bottom-0"
          style={{
            left: isThrottle ? 0 : '50%',
            width: isThrottle ? `${percentage}%` : `${Math.abs(percentage - 50)}%`,
            transform: !isThrottle && value < 1500 ? 'translateX(-100%)' : undefined,
            backgroundColor: barColor,
          }}
        />
        {!readOnly && (
          <input
            type="range"
            min={1000}
            max={2000}
            value={value}
            onChange={(e) => onChange?.(parseInt(e.target.value))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        )}
      </div>
      <span className="text-[9px] text-content-secondary w-8 text-right font-mono">{value}</span>
    </div>
  );
}
