/**
 * Flight Control Panel
 *
 * GCS control panel for arm/disarm and flight mode switching.
 * Works by simulating RC input via MSP_SET_RAW_RC.
 *
 * Design follows the visual language of other telemetry panels (BatteryPanel, AttitudePanel).
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { useFlightControlStore } from '../../stores/flight-control-store';
import { useConnectionStore } from '../../stores/connection-store';
import { PanelContainer, SectionTitle } from './panel-utils';

// =============================================================================
// Visual Components
// =============================================================================

/**
 * Throttle Gauge - Vertical bar gauge similar to battery indicator
 */
function ThrottleGauge({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const percentage = ((value - 1000) / 1000) * 100;
  const gaugeRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Color based on throttle level
  const fillColor = percentage < 10 ? '#10b981' : percentage < 50 ? '#f59e0b' : '#ef4444';
  const textColor = percentage < 10 ? 'text-emerald-400' : percentage < 50 ? 'text-amber-400' : 'text-red-400';

  const handleInteraction = useCallback((clientY: number) => {
    if (!gaugeRef.current) return;
    const rect = gaugeRef.current.getBoundingClientRect();
    const relativeY = clientY - rect.top;
    const newPercentage = Math.max(0, Math.min(100, 100 - (relativeY / rect.height) * 100));
    const newValue = Math.round(1000 + (newPercentage / 100) * 1000);
    onChange(newValue);
  }, [onChange]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    handleInteraction(e.clientY);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      handleInteraction(e.clientY);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleInteraction]);

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Gauge SVG */}
      <div
        ref={gaugeRef}
        className="relative cursor-pointer select-none"
        onMouseDown={handleMouseDown}
      >
        <svg width="50" height="120" viewBox="0 0 50 120">
          <defs>
            <linearGradient id="throttleGradient" x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="50%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>
            <filter id="throttleGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>

          {/* Background track */}
          <rect x="10" y="5" width="30" height="110" rx="4" fill="#1f2937" stroke="#374151" strokeWidth="1"/>

          {/* Fill level */}
          <rect
            x="14"
            y={9 + (102 * (1 - percentage / 100))}
            width="22"
            height={102 * (percentage / 100)}
            rx="2"
            fill={fillColor}
            filter="url(#throttleGlow)"
            style={{ transition: isDragging ? 'none' : 'all 0.1s ease-out' }}
          />

          {/* Tick marks */}
          {[0, 25, 50, 75, 100].map((tick) => (
            <g key={tick}>
              <line
                x1="6"
                y1={111 - (tick / 100) * 102}
                x2="10"
                y2={111 - (tick / 100) * 102}
                stroke="#6b7280"
                strokeWidth="1"
              />
              <line
                x1="40"
                y1={111 - (tick / 100) * 102}
                x2="44"
                y2={111 - (tick / 100) * 102}
                stroke="#6b7280"
                strokeWidth="1"
              />
            </g>
          ))}
        </svg>
      </div>

      {/* Value display */}
      <div className="text-center">
        <span className={`text-xl font-bold font-mono ${textColor}`}>
          {Math.round(percentage)}%
        </span>
        <div className="text-gray-500 text-[10px]">{value}us</div>
      </div>
    </div>
  );
}

/**
 * Joystick Control - 2D stick input visualization
 */
function JoystickControl({
  x,
  y,
  onChangeX,
  onChangeY,
  label,
  xLabel = 'X',
  yLabel = 'Y',
}: {
  x: number;
  y: number;
  onChangeX: (v: number) => void;
  onChangeY: (v: number) => void;
  label: string;
  xLabel?: string;
  yLabel?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Convert PWM (1000-2000) to normalized (-1 to 1)
  const normalizedX = (x - 1500) / 500;
  const normalizedY = (y - 1500) / 500;

  // Convert to pixel position (0-80 range for 80px container)
  const size = 80;
  const dotSize = 16;
  const posX = ((normalizedX + 1) / 2) * (size - dotSize);
  const posY = ((1 - normalizedY) / 2) * (size - dotSize); // Invert Y

  const handleInteraction = useCallback((clientX: number, clientY: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const relX = (clientX - rect.left) / rect.width;
    const relY = (clientY - rect.top) / rect.height;
    const newX = Math.round(1000 + Math.max(0, Math.min(1, relX)) * 1000);
    const newY = Math.round(2000 - Math.max(0, Math.min(1, relY)) * 1000); // Invert Y
    onChangeX(newX);
    onChangeY(newY);
  }, [onChangeX, onChangeY]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    handleInteraction(e.clientX, e.clientY);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      handleInteraction(e.clientX, e.clientY);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleInteraction]);

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="text-gray-500 text-[10px] uppercase tracking-wider">{label}</div>

      {/* Joystick area */}
      <div
        ref={containerRef}
        className="relative bg-gray-900 rounded-lg border border-gray-700 cursor-crosshair select-none"
        style={{ width: size, height: size }}
        onMouseDown={handleMouseDown}
      >
        {/* Cross-hair guides */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="absolute w-full h-px bg-gray-700" />
          <div className="absolute h-full w-px bg-gray-700" />
        </div>

        {/* Dot indicator */}
        <div
          className="absolute rounded-full bg-blue-500 shadow-lg shadow-blue-500/30 border-2 border-blue-400"
          style={{
            width: dotSize,
            height: dotSize,
            left: posX,
            top: posY,
            transition: isDragging ? 'none' : 'all 0.05s ease-out',
          }}
        />
      </div>

      {/* Values */}
      <div className="flex gap-3 text-[10px]">
        <div>
          <span className="text-gray-500">{xLabel}:</span>
          <span className="text-gray-300 font-mono ml-1">{x}</span>
        </div>
        <div>
          <span className="text-gray-500">{yLabel}:</span>
          <span className="text-gray-300 font-mono ml-1">{y}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * ARM Button - Large, prominent arm/disarm control
 */
function ArmButton({
  isArmed,
  canArm,
  armSwitchOn,
  onToggle,
}: {
  isArmed: boolean;
  canArm: boolean;
  armSwitchOn: boolean;
  onToggle: (state: boolean) => void;
}) {
  return (
    <div className="flex flex-col items-center">
      {/* Main ARM button */}
      <button
        onClick={() => onToggle(!armSwitchOn)}
        disabled={!canArm}
        className={`
          relative w-24 h-24 rounded-full border-4
          transition-all duration-300 ease-out
          focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900
          ${canArm ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}
          ${isArmed
            ? 'bg-red-500/20 border-red-500 shadow-lg shadow-red-500/30 focus:ring-red-500'
            : armSwitchOn
              ? 'bg-amber-500/20 border-amber-500 focus:ring-amber-500'
              : 'bg-gray-800 border-gray-600 hover:border-gray-500 focus:ring-gray-500'
          }
        `}
      >
        {/* Inner circle */}
        <div
          className={`
            absolute inset-2 rounded-full flex items-center justify-center
            transition-colors duration-300
            ${isArmed ? 'bg-red-500' : armSwitchOn ? 'bg-amber-500' : 'bg-gray-700'}
          `}
        >
          <svg
            className={`w-10 h-10 ${isArmed || armSwitchOn ? 'text-white' : 'text-gray-400'}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            {isArmed ? (
              // Armed icon - filled shield
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            ) : (
              // Disarmed icon - power symbol
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5.636 5.636a9 9 0 1012.728 0M12 3v9"
              />
            )}
          </svg>
        </div>
      </button>

      {/* Status text */}
      <div className="mt-3 text-center">
        <div className={`text-lg font-bold ${isArmed ? 'text-red-400' : 'text-gray-400'}`}>
          {isArmed ? 'ARMED' : 'DISARMED'}
        </div>
        {armSwitchOn && !isArmed && (
          <div className="text-amber-400 text-xs">Arming...</div>
        )}
        {!canArm && (
          <div className="text-gray-500 text-xs">Not configured</div>
        )}
      </div>
    </div>
  );
}

/**
 * Mode Chip - Compact mode toggle button
 */
function ModeChip({
  name,
  isActive,
  isConfigured,
  onClick,
}: {
  name: string;
  isActive: boolean;
  isConfigured: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!isConfigured}
      className={`
        px-3 py-1.5 rounded-full text-xs font-medium
        transition-all duration-200 ease-out
        ${isConfigured ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'}
        ${isActive
          ? 'bg-blue-500 text-white shadow-md shadow-blue-500/30'
          : isConfigured
            ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            : 'bg-gray-800 text-gray-500'
        }
      `}
    >
      {name}
    </button>
  );
}

/**
 * RC Status Indicator
 */
function RcStatusIndicator({ isActive }: { isActive: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs ${
      isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-700 text-gray-500'
    }`}>
      <div className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-400' : 'bg-gray-500'}`} />
      <span>RC {isActive ? 'Active' : 'Idle'}</span>
    </div>
  );
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Auto-configure SITL for testing.
 */
async function configureSitlForTesting(): Promise<boolean> {
  try {
    await window.electronAPI.cliEnterMode();
    await new Promise((r) => setTimeout(r, 500));

    const commands = [
      'set receiver_type = MSP',
      'set failsafe_procedure = DROP',
      'set failsafe_delay = 5',
      'set failsafe_off_delay = 0',
      'set failsafe_throttle = 1000',
      'aux 0 0 0 1700 2100 0',  // ARM on AUX1
      'aux 1 1 1 1300 1700 0',  // ANGLE on AUX2
      'aux 2 28 1 1700 2100 0', // NAV WP on AUX2
      'aux 3 10 2 1700 2100 0', // NAV RTH on AUX3
      'aux 4 11 3 1700 2100 0', // NAV POSHOLD on AUX4
      'set nav_wp_max_safe_distance = 0',
    ];

    for (const cmd of commands) {
      await window.electronAPI.cliSendCommand(cmd);
      await new Promise((r) => setTimeout(r, 100));
    }

    await window.electronAPI.cliSendCommand('save');
    return true;
  } catch (error) {
    console.error('[FlightControl] Failed to configure SITL:', error);
    return false;
  }
}

// Common flight modes (iNav permanent box IDs)
const COMMON_MODES = [
  { boxId: 1, name: 'ANGLE' },
  { boxId: 2, name: 'HORIZON' },
  { boxId: 11, name: 'POS HOLD' },
  { boxId: 28, name: 'NAV WP' },
  { boxId: 10, name: 'RTH' },
  { boxId: 45, name: 'CRUISE' },
];

// =============================================================================
// Main Component
// =============================================================================

export function FlightControlPanel() {
  const flight = useTelemetryStore((s) => s.flight);
  const connectionState = useConnectionStore((state) => state.connectionState);
  const isConnected = connectionState?.isConnected ?? false;
  const protocol = connectionState?.protocol;
  const fcVariant = connectionState?.fcVariant;

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

  const [armSwitchOn, setArmSwitchOn] = useState(false);
  const [modeToggles, setModeToggles] = useState<Record<number, boolean>>({});
  const [showSetup, setShowSetup] = useState(false);
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [configMessage, setConfigMessage] = useState<string | null>(null);

  // Load mode ranges when connected to MSP
  useEffect(() => {
    if (isConnected && protocol === 'msp' && !modeMappingsLoaded) {
      loadModeRanges();
    }
  }, [isConnected, protocol, modeMappingsLoaded, loadModeRanges]);

  // Auto-start RC override when MSP is fully connected
  useEffect(() => {
    if (isConnected && protocol === 'msp' && fcVariant && !isOverrideActive) {
      startOverride();
    }
  }, [isConnected, protocol, fcVariant, isOverrideActive, startOverride]);

  // Stop override and reset switches when disconnecting
  useEffect(() => {
    if (!isConnected) {
      if (isOverrideActive) stopOverride();
      setArmSwitchOn(false);
      setModeToggles({});
    }
  }, [isConnected, isOverrideActive, stopOverride]);

  // Sync ARM switch with telemetry
  useEffect(() => {
    if (isConnected && flight.armed && !armSwitchOn) {
      setArmSwitchOn(true);
    }
  }, [isConnected, flight.armed, armSwitchOn]);

  // Handle arm switch toggle
  const handleArmToggle = async (newState: boolean) => {
    setArmSwitchOn(newState);
    if (newState) {
      await arm();
    } else {
      await disarm();
    }
  };

  // Handle mode toggle
  const handleModeToggle = async (boxId: number) => {
    const isCurrentlyOn = modeToggles[boxId] ?? false;
    const newState = !isCurrentlyOn;

    setModeToggles((prev) => ({ ...prev, [boxId]: newState }));

    const success = newState
      ? await activateMode(boxId)
      : await deactivateMode(boxId);

    if (!success) {
      setModeToggles((prev) => ({ ...prev, [boxId]: isCurrentlyOn }));
    }
  };

  // Handle SITL configuration
  const handleConfigureSitl = async () => {
    setIsConfiguring(true);
    setConfigMessage('Configuring...');
    const success = await configureSitlForTesting();
    setConfigMessage(success ? 'Saved! Reconnect after reboot.' : 'Failed. Check console.');
    setIsConfiguring(false);
  };

  // Check if mode is active by channel value
  const isModeActiveByChannel = (boxId: number) => {
    const mapping = modeMappings.find((m) => m.boxId === boxId);
    if (!mapping || mapping.auxChannel === null) return false;
    const channelValue = channels[mapping.auxChannel + 4] || 1000;
    return channelValue >= mapping.rangeStart && channelValue <= mapping.rangeEnd;
  };

  // Center stick controls
  const centerSticks = () => {
    setChannel(0, 1500);
    setChannel(1, 1500);
    setChannel(3, 1500);
  };

  // Not connected state
  if (!isConnected || protocol !== 'msp') {
    return (
      <PanelContainer className="flex flex-col items-center justify-center">
        <svg className="w-12 h-12 text-gray-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
        </svg>
        <div className="text-gray-500 text-sm">Connect to MSP device</div>
      </PanelContainer>
    );
  }

  return (
    <PanelContainer>
      <div className="flex flex-col h-full">
        {/* Header with status */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="text-white font-medium">{flight.mode || 'Unknown'}</div>
          </div>
          <RcStatusIndicator isActive={isOverrideActive} />
        </div>

        {/* ARM Control - Centered and prominent */}
        <div className="flex justify-center mb-4">
          <ArmButton
            isArmed={flight.armed}
            canArm={canArm}
            armSwitchOn={armSwitchOn}
            onToggle={handleArmToggle}
          />
        </div>

        {/* Arming Blocked Reasons */}
        {!flight.armed && flight.armingDisabledReasons && flight.armingDisabledReasons.length > 0 && (
          <div className="mb-4 p-2 bg-red-500/10 border border-red-500/30 rounded-lg">
            <div className="text-red-400 text-[10px] font-medium uppercase tracking-wider mb-1">Arming Blocked</div>
            <div className="flex flex-wrap gap-1">
              {flight.armingDisabledReasons.map((reason, i) => (
                <span key={i} className="px-1.5 py-0.5 bg-red-500/20 rounded text-red-300 text-[10px]">
                  {reason}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Flight Modes - Chip style */}
        <div className="mb-4">
          <SectionTitle>Flight Modes</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {COMMON_MODES.map((mode) => {
              const mapping = modeMappings.find((m) => m.boxId === mode.boxId);
              const isConfigured = mapping && mapping.auxChannel !== null;
              const isActive = modeToggles[mode.boxId] || isModeActiveByChannel(mode.boxId);

              return (
                <ModeChip
                  key={mode.boxId}
                  name={mode.name}
                  isActive={isActive}
                  isConfigured={!!isConfigured}
                  onClick={() => handleModeToggle(mode.boxId)}
                />
              );
            })}
          </div>
        </div>

        {/* Controls Grid */}
        <div className="flex-1 flex items-center justify-center gap-6">
          {/* Left stick (Throttle/Yaw) */}
          <div className="flex gap-4">
            <ThrottleGauge
              value={channels[2]!}
              onChange={(v) => {
                setChannel(2, v);
                if (!isOverrideActive) startOverride();
              }}
            />
          </div>

          {/* Right stick (Roll/Pitch) */}
          <JoystickControl
            x={channels[0]!}
            y={channels[1]!}
            onChangeX={(v) => {
              setChannel(0, v);
              if (!isOverrideActive) startOverride();
            }}
            onChangeY={(v) => {
              setChannel(1, v);
              if (!isOverrideActive) startOverride();
            }}
            label="Roll / Pitch"
            xLabel="R"
            yLabel="P"
          />
        </div>

        {/* Center button */}
        <button
          onClick={centerSticks}
          className="mt-3 py-1.5 px-3 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 rounded transition-colors self-center"
        >
          Center Sticks
        </button>

        {/* Setup section (collapsed by default) */}
        {!canArm && modeMappingsLoaded && (
          <div className="mt-4 pt-3 border-t border-gray-700">
            <button
              onClick={() => setShowSetup(!showSetup)}
              className="flex items-center gap-2 text-gray-500 hover:text-gray-400 text-xs transition-colors"
            >
              <svg className={`w-3 h-3 transition-transform ${showSetup ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              Setup Required
            </button>

            {showSetup && (
              <div className="mt-2 p-2 bg-gray-800/50 rounded-lg">
                <p className="text-gray-400 text-xs mb-2">
                  ARM mode not configured. Click below to auto-configure for SITL testing.
                </p>
                <button
                  onClick={handleConfigureSitl}
                  disabled={isConfiguring}
                  className="w-full py-2 px-3 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isConfiguring ? 'Configuring...' : 'Setup for SITL'}
                </button>
                {configMessage && (
                  <p className="text-xs text-center text-blue-400 mt-2">{configMessage}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Loading state */}
        {!modeMappingsLoaded && (
          <div className="text-center text-gray-500 text-xs py-4">
            Loading configuration...
          </div>
        )}
      </div>
    </PanelContainer>
  );
}
