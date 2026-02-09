/**
 * OSD Live Panel
 *
 * Right-panel content for live mode.
 * Shows connection status, mode switches, and collapsible RC controls.
 *
 * RC state is unified through flight-control-store so mode switch buttons
 * and RC sliders share the same channels[] and override interval.
 */

import { useState, useCallback } from 'react';
import { useConnectionStore } from '../../stores/connection-store';
import { useFlightControlStore } from '../../stores/flight-control-store';
import { OsdModeSwitchPanel } from './OsdModeSwitchPanel';

export function OsdLivePanel() {
  const connectionState = useConnectionStore((s) => s.connectionState);
  const channels = useFlightControlStore((s) => s.channels);
  const setChannel = useFlightControlStore((s) => s.setChannel);
  const isOverrideActive = useFlightControlStore((s) => s.isOverrideActive);
  const startOverride = useFlightControlStore((s) => s.startOverride);
  const stopOverride = useFlightControlStore((s) => s.stopOverride);

  const [rcExpanded, setRcExpanded] = useState(false);

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
      <div className="px-3 py-2 border-b border-gray-700">
        <h3 className="text-xs font-medium text-gray-300 mb-1">Live Telemetry</h3>
        {connectionState.isConnected ? (
          <p className="text-[10px] text-green-400">
            Connected to {connectionState.fcVariant || connectionState.autopilot || 'FC'}
            {connectionState.fcVersion && ` ${connectionState.fcVersion}`}
          </p>
        ) : (
          <p className="text-[10px] text-gray-500">
            Connect to FC for live OSD data
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Mode switches */}
        {connectionState.isConnected && (
          <div className="border-b border-gray-700 py-2">
            <OsdModeSwitchPanel />
          </div>
        )}

        {/* Raw RC controls (collapsed by default) */}
        {connectionState.isConnected && (
          <div className="border-b border-gray-700">
            <button
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-800/50 text-left"
              onClick={() => setRcExpanded(!rcExpanded)}
            >
              <svg
                className={`w-3 h-3 text-gray-500 shrink-0 transition-transform ${rcExpanded ? 'rotate-90' : ''}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
              <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
                Raw RC Channels
              </span>
            </button>

            {rcExpanded && (
              <div className="px-3 pb-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="flex items-center gap-2 text-[10px] text-gray-400">
                    <input
                      type="checkbox"
                      checked={isOverrideActive}
                      onChange={(e) => handleRcToggle(e.target.checked)}
                      className="rounded-sm bg-gray-700 border-gray-600 w-3 h-3"
                    />
                    Send RC
                  </label>
                  <button
                    onClick={handleReset}
                    className="text-[10px] text-blue-400 hover:text-blue-300"
                  >
                    Reset
                  </button>
                </div>

                <div className="space-y-2">
                  <RcBar label="Roll" value={channels[0]} onChange={(v) => setChannel(0, v)} />
                  <RcBar label="Pitch" value={channels[1]} onChange={(v) => setChannel(1, v)} />
                  <RcBar label="Thr" value={channels[2]} onChange={(v) => setChannel(2, v)} isThrottle />
                  <RcBar label="Yaw" value={channels[3]} onChange={(v) => setChannel(3, v)} />
                  <div className="border-t border-gray-800 pt-1.5 mt-1.5">
                    <RcBar label="AUX1" value={channels[4]} onChange={(v) => setChannel(4, v)} />
                    <RcBar label="AUX2" value={channels[5]} onChange={(v) => setChannel(5, v)} />
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
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  isThrottle?: boolean;
}) {
  const percentage = ((value - 1000) / 1000) * 100;
  const barColor = isThrottle
    ? `rgba(34, 197, 94, ${0.3 + (percentage / 100) * 0.7})`
    : value > 1500
      ? 'rgba(59, 130, 246, 0.6)'
      : value < 1500
        ? 'rgba(249, 115, 22, 0.6)'
        : 'rgba(107, 114, 128, 0.4)';

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-gray-500 w-8 shrink-0">{label}</span>
      <div className="flex-1 relative h-3.5 bg-gray-800 rounded overflow-hidden">
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
        <input
          type="range"
          min={1000}
          max={2000}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
      </div>
      <span className="text-[9px] text-gray-500 w-8 text-right font-mono">{value}</span>
    </div>
  );
}
