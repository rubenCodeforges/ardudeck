/**
 * OSD Mode Switch Panel
 *
 * Shows flight mode toggle buttons derived from FC configuration.
 * Each button activates/deactivates a mode by setting the corresponding
 * AUX channel to the midpoint of its configured range.
 */

import { useEffect, useCallback, useState } from 'react';
import {
  useFlightControlStore,
  type ModeMapping,
  INAV_MODE_NAMES,
} from '../../stores/flight-control-store';
import { useConnectionStore } from '../../stores/connection-store';

export function OsdModeSwitchPanel() {
  const connectionState = useConnectionStore((s) => s.connectionState);
  const modeMappings = useFlightControlStore((s) => s.modeMappings);
  const modeMappingsLoaded = useFlightControlStore((s) => s.modeMappingsLoaded);
  const channels = useFlightControlStore((s) => s.channels);
  const loadModeRanges = useFlightControlStore((s) => s.loadModeRanges);
  const activateMode = useFlightControlStore((s) => s.activateMode);
  const deactivateMode = useFlightControlStore((s) => s.deactivateMode);
  const arm = useFlightControlStore((s) => s.arm);
  const disarm = useFlightControlStore((s) => s.disarm);

  // Load mode ranges on mount if connected
  useEffect(() => {
    if (connectionState.isConnected && !modeMappingsLoaded) {
      loadModeRanges();
    }
  }, [connectionState.isConnected, modeMappingsLoaded, loadModeRanges]);

  if (!connectionState.isConnected) {
    return (
      <div className="p-3">
        <p className="text-xs text-gray-500">Connect to FC to see mode switches.</p>
      </div>
    );
  }

  if (!modeMappingsLoaded || modeMappings.length === 0) {
    return (
      <div className="p-3 space-y-2">
        <p className="text-xs text-gray-500">No mode ranges loaded.</p>
        <button
          onClick={() => loadModeRanges()}
          className="text-xs text-blue-400 hover:text-blue-300"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <h4 className="text-[10px] font-medium text-gray-500 uppercase tracking-wider px-3 py-1">
        Mode Switches
      </h4>
      {modeMappings.map((mapping) => (
        <ModeButton
          key={`${mapping.boxId}-${mapping.auxChannel}`}
          mapping={mapping}
          channels={channels}
          onActivate={mapping.boxId === 0 ? arm : () => activateMode(mapping.boxId)}
          onDeactivate={mapping.boxId === 0 ? disarm : () => deactivateMode(mapping.boxId)}
        />
      ))}
    </div>
  );
}

function ModeButton({
  mapping,
  channels,
  onActivate,
  onDeactivate,
}: {
  mapping: ModeMapping;
  channels: number[];
  onActivate: () => Promise<boolean>;
  onDeactivate: () => Promise<boolean>;
}) {
  const [loading, setLoading] = useState(false);

  // Determine if mode is currently active based on channel value
  const isActive =
    mapping.auxChannel !== null &&
    channels[mapping.auxChannel + 4] >= mapping.rangeStart &&
    channels[mapping.auxChannel + 4] <= mapping.rangeEnd;

  const isArm = mapping.boxId === 0;

  const handleClick = useCallback(async () => {
    setLoading(true);
    try {
      if (isActive) {
        await onDeactivate();
      } else {
        await onActivate();
      }
    } catch {
      // Error logged internally
    }
    setLoading(false);
  }, [isActive, onActivate, onDeactivate]);

  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      <button
        onClick={handleClick}
        disabled={loading}
        className={`
          flex-1 text-left px-2.5 py-1.5 rounded text-xs font-medium transition-colors
          ${isActive
            ? isArm
              ? 'bg-red-500/20 text-red-400 border border-red-500/40'
              : 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
            : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700 hover:text-gray-300'
          }
          ${loading ? 'opacity-50' : ''}
        `}
      >
        <div className="flex items-center justify-between">
          <span>{mapping.name}</span>
          <span className={`text-[10px] ${isActive ? 'text-green-400' : 'text-gray-600'}`}>
            {isActive ? 'ON' : 'OFF'}
          </span>
        </div>
      </button>

      {/* Channel info */}
      <span className="text-[9px] text-gray-600 font-mono w-20 text-right shrink-0">
        AUX{mapping.auxChannel !== null ? mapping.auxChannel + 1 : '?'}
        {' '}
        {mapping.rangeStart}-{mapping.rangeEnd}
      </span>
    </div>
  );
}
