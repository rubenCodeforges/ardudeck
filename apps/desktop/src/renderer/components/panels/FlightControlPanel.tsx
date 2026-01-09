/**
 * Flight Control Panel
 *
 * GCS control panel for arm/disarm and flight mode switching.
 * Works by simulating RC input via MSP_SET_RAW_RC.
 */

import { useEffect, useState } from 'react';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { useFlightControlStore, INAV_MODE_NAMES } from '../../stores/flight-control-store';
import { useConnectionStore } from '../../stores/connection-store';
import { PanelContainer } from './panel-utils';

/**
 * Auto-configure SITL for testing.
 * Sets up receiver, failsafe, and basic flight modes.
 */
async function configureSitlForTesting(): Promise<boolean> {
  try {
    // Enter CLI mode first
    await window.electronAPI.cliEnterMode();

    // Wait for CLI to be ready
    await new Promise((r) => setTimeout(r, 500));

    // Configure receiver to accept MSP RC input
    await window.electronAPI.cliSendCommand('set receiver_type = MSP');
    await new Promise((r) => setTimeout(r, 100));

    // Configure failsafe for SITL (lenient settings)
    await window.electronAPI.cliSendCommand('set failsafe_procedure = DROP');
    await new Promise((r) => setTimeout(r, 100));
    await window.electronAPI.cliSendCommand('set failsafe_delay = 5');
    await new Promise((r) => setTimeout(r, 100));
    await window.electronAPI.cliSendCommand('set failsafe_off_delay = 0');
    await new Promise((r) => setTimeout(r, 100));
    await window.electronAPI.cliSendCommand('set failsafe_throttle = 1000');
    await new Promise((r) => setTimeout(r, 100));

    // Configure ARM on AUX1 (1700-2100)
    // aux <index> <box_id> <aux_channel> <range_start> <range_end> <logic>
    await window.electronAPI.cliSendCommand('aux 0 0 0 1700 2100 0');
    await new Promise((r) => setTimeout(r, 100));

    // Configure ANGLE mode on AUX2 (1300-1700)
    await window.electronAPI.cliSendCommand('aux 1 1 1 1300 1700 0');
    await new Promise((r) => setTimeout(r, 100));

    // Configure NAV WP on AUX2 (1700-2100) - same channel, higher range
    await window.electronAPI.cliSendCommand('aux 2 23 1 1700 2100 0');
    await new Promise((r) => setTimeout(r, 100));

    // Configure NAV RTH on AUX3 (1700-2100)
    await window.electronAPI.cliSendCommand('aux 3 10 2 1700 2100 0');
    await new Promise((r) => setTimeout(r, 100));

    // Configure NAV POSHOLD on AUX4 (1700-2100)
    await window.electronAPI.cliSendCommand('aux 4 11 3 1700 2100 0');
    await new Promise((r) => setTimeout(r, 100));

    // Save settings
    await window.electronAPI.cliSendCommand('save');

    // Note: 'save' causes a reboot, connection will drop
    return true;
  } catch (error) {
    console.error('[FlightControl] Failed to configure SITL:', error);
    return false;
  }
}

// Common flight modes to display as buttons
const COMMON_MODES = [
  { boxId: 1, name: 'ANGLE' },
  { boxId: 2, name: 'HORIZON' },
  { boxId: 11, name: 'POS HOLD' },
  { boxId: 23, name: 'NAV WP' },
  { boxId: 10, name: 'RTH' },
  { boxId: 40, name: 'CRUISE' },
];

export function FlightControlPanel() {
  const { flight } = useTelemetryStore();
  const connectionState = useConnectionStore((state) => state.connectionState);
  const isConnected = connectionState?.isConnected ?? false;
  const protocol = connectionState?.protocol;
  const {
    modeMappings,
    modeMappingsLoaded,
    canArm,
    isOverrideActive,
    arm,
    disarm,
    activateMode,
    loadModeRanges,
    stopOverride,
  } = useFlightControlStore();

  const [isConfiguring, setIsConfiguring] = useState(false);
  const [configMessage, setConfigMessage] = useState<string | null>(null);

  // Load mode ranges when connected to MSP
  useEffect(() => {
    if (isConnected && protocol === 'msp' && !modeMappingsLoaded) {
      loadModeRanges();
    }
  }, [isConnected, protocol, modeMappingsLoaded, loadModeRanges]);

  // Stop override when disconnecting
  useEffect(() => {
    if (!isConnected && isOverrideActive) {
      stopOverride();
    }
  }, [isConnected, isOverrideActive, stopOverride]);

  // Handle arm/disarm toggle
  const handleArmToggle = async () => {
    if (flight.armed) {
      await disarm();
    } else {
      await arm();
    }
  };

  // Handle mode activation
  const handleModeClick = async (boxId: number) => {
    await activateMode(boxId);
  };

  // Handle SITL auto-configuration
  const handleConfigureSitl = async () => {
    setIsConfiguring(true);
    setConfigMessage('Configuring SITL...');

    const success = await configureSitlForTesting();

    if (success) {
      setConfigMessage('Configuration saved! Rebooting... Reconnect in a few seconds.');
      // The FC will reboot after save, user needs to reconnect
    } else {
      setConfigMessage('Configuration failed. Check console for errors.');
    }

    setIsConfiguring(false);
  };

  // Get configured modes (modes that have AUX channel assigned)
  // Deduplicate by boxId since a mode can have multiple ranges
  const configuredModes = modeMappings
    .filter((m) => m.auxChannel !== null)
    .filter((m, i, arr) => arr.findIndex((x) => x.boxId === m.boxId) === i);

  // Check if a mode is currently active
  const isModeActive = (modeName: string) => {
    return flight.mode.toUpperCase().includes(modeName.toUpperCase());
  };

  // Not connected or not MSP
  if (!isConnected || protocol !== 'msp') {
    return (
      <PanelContainer>
        <div className="text-center text-gray-500 text-sm py-4">
          Connect to MSP device
        </div>
      </PanelContainer>
    );
  }

  return (
    <PanelContainer>
      <div className="space-y-4">
        {/* Arm/Disarm Button */}
        <div>
          <button
            onClick={handleArmToggle}
            disabled={!canArm}
            className={`w-full py-3 rounded-lg font-bold text-lg transition-all ${
              flight.armed
                ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/30'
                : 'bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-600/30'
            } ${!canArm ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {flight.armed ? 'DISARM' : 'ARM'}
          </button>
          {!canArm && modeMappingsLoaded && (
            <div className="mt-2 space-y-2">
              <p className="text-amber-400 text-xs text-center">
                ARM mode not configured
              </p>
              <button
                onClick={handleConfigureSitl}
                disabled={isConfiguring}
                className="w-full py-2 px-3 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isConfiguring ? (
                  <>
                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Configuring...
                  </>
                ) : (
                  <>
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Setup for SITL Testing
                  </>
                )}
              </button>
              {configMessage && (
                <p className="text-xs text-center text-blue-400">{configMessage}</p>
              )}
            </div>
          )}
        </div>

        {/* Arming Blocked Reasons */}
        {!flight.armed && flight.armingDisabledReasons && flight.armingDisabledReasons.length > 0 && (
          <div className="p-2 bg-red-500/10 border border-red-500/30 rounded-lg">
            <div className="text-red-400 text-xs font-medium mb-1">Arming Blocked:</div>
            <div className="flex flex-wrap gap-1">
              {flight.armingDisabledReasons.map((reason, i) => (
                <span key={i} className="px-1.5 py-0.5 bg-red-500/20 rounded text-red-300 text-xs">
                  {reason}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Override Status */}
        {isOverrideActive && (
          <div className="flex items-center justify-center gap-2 text-amber-400 text-xs">
            <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
            RC Override Active
          </div>
        )}

        {/* Flight Mode Display */}
        <div className="text-center">
          <span className="text-gray-500 text-xs">Current Mode</span>
          <div className="text-white font-bold text-lg">{flight.mode || 'Unknown'}</div>
        </div>

        {/* Mode Buttons - Common modes first */}
        <div>
          <div className="text-gray-500 text-xs mb-2">Flight Modes</div>
          <div className="grid grid-cols-2 gap-2">
            {COMMON_MODES.map((mode) => {
              const mapping = modeMappings.find((m) => m.boxId === mode.boxId);
              const isConfigured = mapping && mapping.auxChannel !== null;
              const isActive = isModeActive(mode.name);

              return (
                <button
                  key={mode.boxId}
                  onClick={() => handleModeClick(mode.boxId)}
                  disabled={!isConfigured}
                  className={`px-3 py-2 rounded text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                      : isConfigured
                      ? 'bg-zinc-700 hover:bg-zinc-600 text-zinc-200'
                      : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                  }`}
                  title={isConfigured ? `Activate ${mode.name}` : `${mode.name} not configured`}
                >
                  {mode.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Additional Configured Modes (excluding ones already in COMMON_MODES) */}
        {(() => {
          const additionalModes = configuredModes.filter(
            (m) => !COMMON_MODES.find((cm) => cm.boxId === m.boxId)
          );
          return additionalModes.length > 0 ? (
          <div>
            <div className="text-gray-500 text-xs mb-2">
              Other Configured Modes ({additionalModes.length})
            </div>
            <div className="flex flex-wrap gap-1">
              {additionalModes.map((mode) => {
                  const isActive = isModeActive(mode.name);
                  return (
                    <button
                      key={mode.boxId}
                      onClick={() => handleModeClick(mode.boxId)}
                      className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                        isActive
                          ? 'bg-blue-600 text-white'
                          : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300'
                      }`}
                    >
                      {mode.name}
                    </button>
                  );
                })}
            </div>
          </div>
          ) : null;
        })()}

        {/* Mode Ranges Not Loaded */}
        {!modeMappingsLoaded && (
          <div className="text-center text-gray-500 text-xs">
            Loading mode configuration...
          </div>
        )}

        {/* Help Text */}
        <div className="text-gray-600 text-xs border-t border-zinc-700 pt-2">
          <p>Controls work by simulating RC input.</p>
          <p>Modes must be configured on AUX channels.</p>
        </div>
      </div>
    </PanelContainer>
  );
}
