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
 * Toggle Switch Component
 * A visual toggle switch that can be clicked to change state
 */
function ToggleSwitch({
  checked,
  onChange,
  disabled,
  activeColor = 'bg-green-500',
  inactiveColor = 'bg-zinc-600',
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  activeColor?: string;
  inactiveColor?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-zinc-800 ${
        checked ? activeColor : inactiveColor
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span
        className={`pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          checked ? 'translate-x-6' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

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
    // iNav permanent box ID for NAV WP is 28 (not 23!)
    await window.electronAPI.cliSendCommand('aux 2 28 1 1700 2100 0');
    await new Promise((r) => setTimeout(r, 100));

    // Configure NAV RTH on AUX3 (1700-2100)
    await window.electronAPI.cliSendCommand('aux 3 10 2 1700 2100 0');
    await new Promise((r) => setTimeout(r, 100));

    // Configure NAV POSHOLD on AUX4 (1700-2100)
    await window.electronAPI.cliSendCommand('aux 4 11 3 1700 2100 0');
    await new Promise((r) => setTimeout(r, 100));

    // Disable "first WP too far" check for SITL testing
    // In iNav, HOME is set by FC when armed with GPS lock - not by Mission Planner
    // This setting controls max distance (cm) from HOME to first waypoint
    // Setting to 0 disables the check entirely
    await window.electronAPI.cliSendCommand('set nav_wp_max_safe_distance = 0');
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

// Common flight modes to display as buttons (iNav permanent box IDs)
const COMMON_MODES = [
  { boxId: 1, name: 'ANGLE' },
  { boxId: 2, name: 'HORIZON' },
  { boxId: 11, name: 'POS HOLD' },
  { boxId: 28, name: 'NAV WP' },   // iNav box ID 28
  { boxId: 10, name: 'RTH' },
  { boxId: 45, name: 'CRUISE' },   // iNav box ID 45
];

export function FlightControlPanel() {
  const { flight } = useTelemetryStore();
  const connectionState = useConnectionStore((state) => state.connectionState);
  const isConnected = connectionState?.isConnected ?? false;
  const protocol = connectionState?.protocol;
  const {
    channels,
    modeMappings,
    modeMappingsLoaded,
    canArm,
    isOverrideActive,
    arm,
    disarm,
    activateMode,
    deactivateMode,
    loadModeRanges,
    stopOverride,
    setChannel,
    startOverride,
  } = useFlightControlStore();

  const [isConfiguring, setIsConfiguring] = useState(false);
  const [configMessage, setConfigMessage] = useState<string | null>(null);

  // Local state for ARM switch position - independent of telemetry
  const [armSwitchOn, setArmSwitchOn] = useState(false);

  // Local state for mode toggles - tracks which modes are switched ON
  // Key is boxId, value is whether the switch is ON
  const [modeToggles, setModeToggles] = useState<Record<number, boolean>>({});

  // Load mode ranges when connected to MSP
  useEffect(() => {
    if (isConnected && protocol === 'msp' && !modeMappingsLoaded) {
      loadModeRanges();
    }
  }, [isConnected, protocol, modeMappingsLoaded, loadModeRanges]);

  // Auto-start RC override when MSP is FULLY connected (fcVariant populated)
  // This establishes RC link with FC BEFORE user tries to arm
  // Sends default values (all centered, throttle low, switches off)
  // We wait for fcVariant to ensure MSP handshake is complete and transport is ready
  const fcVariant = connectionState?.fcVariant;
  useEffect(() => {
    if (isConnected && protocol === 'msp' && fcVariant && !isOverrideActive) {
      console.log(`[FlightControl UI] MSP ready (${fcVariant}), auto-starting RC override`);
      startOverride();
    }
  }, [isConnected, protocol, fcVariant, isOverrideActive, startOverride]);

  // Stop override and reset all switches when disconnecting
  useEffect(() => {
    if (!isConnected) {
      if (isOverrideActive) {
        stopOverride();
      }
      setArmSwitchOn(false);
      setModeToggles({});
    }
  }, [isConnected, isOverrideActive, stopOverride]);

  // Sync ARM switch with telemetry on initial connect (optional: comment out if you want full manual control)
  useEffect(() => {
    if (isConnected && flight.armed && !armSwitchOn) {
      // If FC reports armed but our switch is off, sync it
      setArmSwitchOn(true);
    }
  }, [isConnected, flight.armed]);

  // Handle arm switch toggle
  const handleArmSwitchToggle = async (newState: boolean) => {
    console.log('[FlightControl UI] ARM toggle clicked, newState:', newState);
    setArmSwitchOn(newState);
    if (newState) {
      console.log('[FlightControl UI] Calling arm()...');
      await arm();
      console.log('[FlightControl UI] arm() returned');
    } else {
      console.log('[FlightControl UI] Calling disarm()...');
      await disarm();
      console.log('[FlightControl UI] disarm() returned');
    }
  };

  // Handle mode toggle - modes work like switches, not momentary buttons
  // Uses optimistic update for responsive UI (same pattern as ARM toggle)
  const handleModeToggle = async (boxId: number) => {
    const isCurrentlyOn = modeToggles[boxId] ?? false;
    const newState = !isCurrentlyOn;

    console.log(`[FlightControl UI] Mode toggle ${boxId}: ${isCurrentlyOn} -> ${newState}`);

    // OPTIMISTIC UPDATE: Update UI immediately for responsiveness
    setModeToggles((prev) => ({ ...prev, [boxId]: newState }));

    // Send to FC
    let success = false;
    if (newState) {
      success = await activateMode(boxId);
    } else {
      success = await deactivateMode(boxId);
    }

    if (!success) {
      console.error(`[FlightControl UI] Failed to ${newState ? 'activate' : 'deactivate'} mode ${boxId}, reverting toggle`);
      // Revert on failure
      setModeToggles((prev) => ({ ...prev, [boxId]: isCurrentlyOn }));
    }
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

  // Check if a mode is active based on our channel state
  // We check if the AUX channel value is within the mode's activation range
  const isModeActiveByChannel = (boxId: number) => {
    const mapping = modeMappings.find((m) => m.boxId === boxId);
    if (!mapping || mapping.auxChannel === null) return false;
    const channelIndex = mapping.auxChannel + 4;
    const channelValue = channels[channelIndex] || 1000;
    return channelValue >= mapping.rangeStart && channelValue <= mapping.rangeEnd;
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
        {/* ARM Switch - Toggle Style */}
        <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-white font-bold text-sm">ARM Switch</div>
              <div className="text-xs text-gray-400">
                {armSwitchOn ? 'Switch ON' : 'Switch OFF'}
              </div>
            </div>
            <ToggleSwitch
              checked={armSwitchOn}
              onChange={handleArmSwitchToggle}
              disabled={!canArm}
              activeColor="bg-red-500"
              inactiveColor="bg-zinc-600"
            />
          </div>

          {/* Status indicator showing actual armed state from telemetry */}
          <div className="mt-2 flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${flight.armed ? 'bg-red-500 animate-pulse' : 'bg-gray-500'}`} />
            <span className={`text-xs font-medium ${flight.armed ? 'text-red-400' : 'text-gray-400'}`}>
              {flight.armed ? 'ARMED' : 'DISARMED'}
            </span>
            {armSwitchOn && !flight.armed && (
              <span className="text-xs text-amber-400">(Arming blocked)</span>
            )}
          </div>

          {!canArm && modeMappingsLoaded && (
            <div className="mt-3 space-y-2 border-t border-zinc-700 pt-3">
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

        {/* Throttle Control - channel index 2 */}
        <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white text-sm font-medium">Throttle</span>
            <span className="text-zinc-400 text-sm font-mono">{channels[2]}us</span>
          </div>
          <input
            type="range"
            min={1000}
            max={2000}
            value={channels[2]}
            onChange={(e) => {
              const value = parseInt(e.target.value);
              setChannel(2, value);
              // Start override if not active
              if (!isOverrideActive) {
                startOverride();
              }
            }}
            className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
          />
          <div className="flex justify-between text-xs text-zinc-500 mt-1">
            <span>1000 (idle)</span>
            <span>2000 (full)</span>
          </div>
          {flight.armed && channels[2] > 1100 && (
            <div className="mt-2 text-xs text-amber-400 text-center">
              Throttle active while armed!
            </div>
          )}
        </div>

        {/* Roll/Pitch/Yaw Sticks (simplified) */}
        <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
          <div className="text-white text-sm font-medium mb-2">Stick Inputs</div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <div className="text-zinc-500 mb-1">Roll</div>
              <input
                type="range"
                min={1000}
                max={2000}
                value={channels[0]}
                onChange={(e) => {
                  setChannel(0, parseInt(e.target.value));
                  if (!isOverrideActive) startOverride();
                }}
                className="w-full h-1.5 bg-zinc-700 rounded appearance-none cursor-pointer accent-blue-500"
              />
              <div className="text-zinc-400 text-center font-mono">{channels[0]}</div>
            </div>
            <div>
              <div className="text-zinc-500 mb-1">Pitch</div>
              <input
                type="range"
                min={1000}
                max={2000}
                value={channels[1]}
                onChange={(e) => {
                  setChannel(1, parseInt(e.target.value));
                  if (!isOverrideActive) startOverride();
                }}
                className="w-full h-1.5 bg-zinc-700 rounded appearance-none cursor-pointer accent-blue-500"
              />
              <div className="text-zinc-400 text-center font-mono">{channels[1]}</div>
            </div>
            <div>
              <div className="text-zinc-500 mb-1">Yaw</div>
              <input
                type="range"
                min={1000}
                max={2000}
                value={channels[3]}
                onChange={(e) => {
                  setChannel(3, parseInt(e.target.value));
                  if (!isOverrideActive) startOverride();
                }}
                className="w-full h-1.5 bg-zinc-700 rounded appearance-none cursor-pointer accent-blue-500"
              />
              <div className="text-zinc-400 text-center font-mono">{channels[3]}</div>
            </div>
          </div>
          <button
            onClick={() => {
              setChannel(0, 1500); // Roll
              setChannel(1, 1500); // Pitch
              setChannel(3, 1500); // Yaw
            }}
            className="mt-2 w-full py-1 text-xs text-zinc-400 hover:text-white bg-zinc-700 hover:bg-zinc-600 rounded transition-colors"
          >
            Center Sticks
          </button>
        </div>

        {/* Flight Mode Display */}
        <div className="text-center">
          <span className="text-gray-500 text-xs">Current Mode</span>
          <div className="text-white font-bold text-lg">{flight.mode || 'Unknown'}</div>
        </div>

        {/* Mode Toggles - Common modes as toggle switches */}
        <div>
          <div className="text-gray-500 text-xs mb-2">Flight Mode Switches</div>
          <div className="space-y-2">
            {COMMON_MODES.map((mode) => {
              const mapping = modeMappings.find((m) => m.boxId === mode.boxId);
              const isConfigured = mapping && mapping.auxChannel !== null;
              const isSwitchOn = modeToggles[mode.boxId] ?? false;
              const isActiveByChannel = isModeActiveByChannel(mode.boxId);

              return (
                <div
                  key={mode.boxId}
                  className={`flex items-center justify-between p-2 rounded ${
                    isConfigured ? 'bg-zinc-800/50' : 'bg-zinc-900/30 opacity-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        isActiveByChannel ? 'bg-green-500' : 'bg-gray-500'
                      }`}
                    />
                    <span className={`text-sm ${isConfigured ? 'text-white' : 'text-gray-500'}`}>
                      {mode.name}
                    </span>
                  </div>
                  <ToggleSwitch
                    checked={isSwitchOn}
                    onChange={() => handleModeToggle(mode.boxId)}
                    disabled={!isConfigured}
                    activeColor="bg-blue-500"
                    inactiveColor="bg-zinc-600"
                  />
                </div>
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
            <div className="space-y-1">
              {additionalModes.map((mode) => {
                  const isSwitchOn = modeToggles[mode.boxId] ?? false;
                  const isActiveByChannel = isModeActiveByChannel(mode.boxId);
                  return (
                    <div
                      key={mode.boxId}
                      className="flex items-center justify-between p-1.5 rounded bg-zinc-800/30"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-1.5 h-1.5 rounded-full ${
                            isActiveByChannel ? 'bg-green-500' : 'bg-gray-500'
                          }`}
                        />
                        <span className="text-xs text-zinc-300">{mode.name}</span>
                      </div>
                      <ToggleSwitch
                        checked={isSwitchOn}
                        onChange={() => handleModeToggle(mode.boxId)}
                        activeColor="bg-blue-500"
                        inactiveColor="bg-zinc-600"
                      />
                    </div>
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
