/**
 * Flight Control Panel
 *
 * GCS control panel for arm/disarm and flight mode switching.
 * Works by simulating RC input via MSP_SET_RAW_RC.
 *
 * Design follows the visual language of other telemetry panels (BatteryPanel, AttitudePanel).
 */

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { useFlightControlStore } from '../../stores/flight-control-store';
import { useConnectionStore } from '../../stores/connection-store';
import { useMessagesStore } from '../../stores/messages-store';
import { useMissionStore } from '../../stores/mission-store';
import { useParameterStore } from '../../stores/parameter-store';
import { useArduPilotSitlStore } from '../../stores/ardupilot-sitl-store';
import { isPreArmMessage, extractPreArmReason, matchPreArmError } from '../../../shared/prearm-checks';
import { PreArmParamFix } from '../prearm/PreArmParamFix';
import { PanelContainer, SectionTitle } from './panel-utils';
import { getVehicleClass, ARDUPILOT_COMMON_MODES, VEHICLE_CAPABILITIES, type ArduPilotVehicleClass } from '../../../shared/telemetry-types';
import { executeTakeoff, presentTakeoff } from './takeoff-strategies';

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
          <rect x="10" y="5" width="30" height="110" rx="4" fill="var(--bg-base)" stroke="var(--border-default)" strokeWidth="1"/>

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
        <div className="text-content-secondary text-[10px]">{value}us</div>
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
      <div className="text-content-secondary text-[10px] uppercase tracking-wider">{label}</div>

      {/* Joystick area */}
      <div
        ref={containerRef}
        className="relative bg-surface-base rounded-lg border border-default cursor-crosshair select-none"
        style={{ width: size, height: size }}
        onMouseDown={handleMouseDown}
      >
        {/* Cross-hair guides */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="absolute w-full h-px bg-border" />
          <div className="absolute h-full w-px bg-border" />
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
          <span className="text-content-secondary">{xLabel}:</span>
          <span className="text-content font-mono ml-1">{x}</span>
        </div>
        <div>
          <span className="text-content-secondary">{yLabel}:</span>
          <span className="text-content font-mono ml-1">{y}</span>
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
  compact = false,
}: {
  isArmed: boolean;
  canArm: boolean;
  armSwitchOn: boolean;
  onToggle: (state: boolean) => void;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-col items-center">
      {/* Main ARM button */}
      <button
        onClick={() => onToggle(!armSwitchOn)}
        disabled={!canArm}
        className={`
          relative ${compact ? 'w-14 h-14 border-[3px]' : 'w-24 h-24 border-4'} rounded-full
          transition-all duration-300 ease-out
          focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-surface-base
          ${canArm ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}
          ${isArmed
            ? 'bg-red-500/20 border-red-500 shadow-lg shadow-red-500/30 focus:ring-red-500'
            : armSwitchOn
              ? 'bg-amber-500/20 border-amber-500 focus:ring-amber-500'
              : 'bg-surface border-default hover:border-default focus:ring-gray-500'
          }
        `}
      >
        {/* Inner circle */}
        <div
          className={`
            absolute ${compact ? 'inset-1' : 'inset-2'} rounded-full flex items-center justify-center
            transition-colors duration-300
            ${isArmed ? 'bg-red-500' : armSwitchOn ? 'bg-amber-500' : 'bg-surface-raised'}
          `}
        >
          <svg
            className={`${compact ? 'w-6 h-6' : 'w-10 h-10'} ${isArmed || armSwitchOn ? 'text-white' : 'text-content-secondary'}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            {isArmed ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
              />
            ) : (
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
      <div className={`${compact ? 'mt-1.5' : 'mt-3'} text-center`}>
        <div className={`${compact ? 'text-xs' : 'text-lg'} font-bold ${isArmed ? 'text-red-400' : 'text-content-secondary'}`}>
          {isArmed ? 'ARMED' : 'DISARMED'}
        </div>
        {armSwitchOn && !isArmed && (
          <div className="text-amber-400 text-xs">Arming...</div>
        )}
        {!canArm && !compact && (
          <div className="text-content-secondary text-xs">Not configured</div>
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
      title={name}
      className={`
        px-3 py-1.5 rounded-full text-xs font-medium truncate
        transition-all duration-200 ease-out
        ${isConfigured ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'}
        ${isActive
          ? 'bg-blue-500 text-white shadow-md shadow-blue-500/30'
          : isConfigured
            ? 'bg-surface-raised text-content hover:bg-surface-raised'
            : 'bg-surface text-content-secondary'
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
      isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-surface-raised text-content-secondary'
    }`}>
      <div className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-400' : 'bg-content-tertiary'}`} />
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
// MAVLink Flight Control (ArduPilot)
// =============================================================================

// AUTO + pause mode numbers per vehicle class. Pause mode is whichever holds
// position cleanly without giving up the mission (BRAKE on copter, LOITER on
// plane, HOLD on rover, POSHOLD on sub) — switching back to AUTO resumes.
const MISSION_MODES: Record<ArduPilotVehicleClass, { auto: number; pause: number; pauseLabel: string }> = {
  copter: { auto: 3,  pause: 17, pauseLabel: 'Brake'   },
  plane:  { auto: 10, pause: 12, pauseLabel: 'Loiter'  },
  // VTOL pause = QLOITER (19): vertical position hold without giving up the
  // mission. Q-modes auto-disarm-tolerant in a way fixed-wing LOITER isn't
  // for tailsitters.
  vtol:   { auto: 10, pause: 19, pauseLabel: 'QLoiter' },
  rover:  { auto: 10, pause: 4,  pauseLabel: 'Hold'    },
  sub:    { auto: 3,  pause: 16, pauseLabel: 'PosHold' },
};

function MavlinkFlightControl() {
  const flight = useTelemetryStore((s) => s.flight);
  const messages = useMessagesStore((s) => s.messages);
  const connectionState = useConnectionStore((s) => s.connectionState);
  // Multi-signal VTOL detection: MAV_TYPE alone is unreliable on first
  // connect (FCU reports FIXED_WING until reboot picks up Q_ENABLE). Pulling
  // the live Q_ENABLE param + the running SITL frame closes both gaps.
  const qEnable = useParameterStore((s) => s.parameters.get('Q_ENABLE')?.value);
  const sitlIsRunning = useArduPilotSitlStore((s) => s.isRunning);
  const sitlFrame = useArduPilotSitlStore((s) => s.model);
  const vehicleClass = getVehicleClass(connectionState.mavType, {
    qEnable: typeof qEnable === 'number' ? qEnable : undefined,
    sitlFrame: sitlIsRunning ? sitlFrame : undefined,
  });
  const availableModes = ARDUPILOT_COMMON_MODES[vehicleClass];
  const capabilities = VEHICLE_CAPABILITIES[vehicleClass];
  const missionItems = useMissionStore((s) => s.missionItems);
  const currentSeq = useMissionStore((s) => s.currentSeq);
  const fetchMission = useMissionStore((s) => s.fetchMission);
  const missionLoaded = missionItems.length > 0;
  const missionModes = MISSION_MODES[vehicleClass];
  const isInAuto = flight.modeNum === missionModes.auto;
  const isInPause = flight.modeNum === missionModes.pause;

  const [isLoading, setIsLoading] = useState(false);
  const [forceArm, setForceArm] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'info' | 'error' | 'success' } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHorizontal, setIsHorizontal] = useState(false);
  const [expandedPreArm, setExpandedPreArm] = useState<Set<string>>(new Set());
  const prevArmedRef = useRef(flight.armed);
  const [modeLoading, setModeLoading] = useState<number | null>(null);
  const [showTakeoffDialog, setShowTakeoffDialog] = useState(false);
  const [takeoffAlt, setTakeoffAlt] = useState(10);

  // Detect panel orientation for responsive layout
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setIsHorizontal(entry.contentRect.width > entry.contentRect.height * 1.5);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Watch for armed state changes to provide feedback
  useEffect(() => {
    if (flight.armed !== prevArmedRef.current) {
      prevArmedRef.current = flight.armed;
      if (isLoading) {
        setIsLoading(false);
        setStatusMsg({
          text: flight.armed ? 'Armed successfully' : 'Disarmed',
          type: 'success',
        });
        setTimeout(() => setStatusMsg(null), 3000);
      }
    }
  }, [flight.armed, isLoading]);

  // Extract PreArm failure reasons from STATUSTEXT messages
  const preArmReasons = useMemo(() => {
    if (flight.armed) return [];
    return messages
      .filter((m) => isPreArmMessage(m.text, connectionState.firmware))
      .map((m) => {
        const match = matchPreArmError(m.text, connectionState.firmware);
        return match ? { reason: match.reason, fix: match.pattern.fix } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .filter((x, i, arr) => arr.findIndex((a) => a.reason === x.reason) === i)
      .slice(0, 10);
  }, [messages, flight.armed, connectionState.firmware]);

  // Watch for ARM/DISARM command result in messages
  const lastArmResult = useMemo(() => {
    const result = messages.find((m) => m.text.startsWith('ARM/DISARM'));
    if (!result) return null;
    const isAccepted = result.text.includes('accepted');
    return { accepted: isAccepted, text: result.text, timestamp: result.timestamp };
  }, [messages]);

  // Show command result feedback
  useEffect(() => {
    if (lastArmResult && isLoading) {
      if (!lastArmResult.accepted) {
        setIsLoading(false);
        setStatusMsg({ text: lastArmResult.text, type: 'error' });
        setTimeout(() => setStatusMsg(null), 5000);
      }
    }
  }, [lastArmResult, isLoading]);

  const handleArmDisarm = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setStatusMsg(null);
    try {
      const wantArm = !flight.armed;
      // Force flag applies to BOTH arm and disarm. ArduPilot rejects normal
      // DISARM while the FCU thinks the vehicle is airborne — even if a
      // VTOL takeoff aborted with motors back at 0% the FCU stays in the
      // takeoff state for a short window. Forwarding the user's Force
      // toggle to the disarm path is the unstick.
      const ok = await window.electronAPI.mavlinkArmDisarm(wantArm, forceArm);
      if (!ok) {
        setIsLoading(false);
        setStatusMsg({ text: 'Not connected', type: 'error' });
        setTimeout(() => setStatusMsg(null), 3000);
      }
      // If ok, wait for armed state change or COMMAND_ACK result (handled by effects above)
      // Timeout fallback: stop loading after 5s if no state change
      setTimeout(() => {
        setIsLoading((prev) => {
          if (prev) {
            setStatusMsg({ text: 'No response from vehicle', type: 'error' });
            setTimeout(() => setStatusMsg(null), 5000);
          }
          return false;
        });
      }, 5000);
    } catch (err) {
      console.error('[FlightControl] MAVLink arm/disarm failed:', err);
      setIsLoading(false);
      setStatusMsg({ text: 'Command error', type: 'error' });
      setTimeout(() => setStatusMsg(null), 3000);
    }
  };

  // Mode switching
  const handleSetMode = async (modeNum: number) => {
    if (modeLoading !== null) return;
    setModeLoading(modeNum);
    setStatusMsg(null);
    try {
      const ok = await window.electronAPI.mavlinkSetMode(modeNum);
      if (!ok) {
        setStatusMsg({ text: 'Not connected', type: 'error' });
        setModeLoading(null);
        setTimeout(() => setStatusMsg(null), 3000);
      }
      // Mode confirmation comes via heartbeat - timeout clears loading
      setTimeout(() => setModeLoading(null), 3000);
    } catch {
      setStatusMsg({ text: 'Mode change failed', type: 'error' });
      setModeLoading(null);
      setTimeout(() => setStatusMsg(null), 3000);
    }
  };

  // Clear mode loading when heartbeat confirms the switch
  useEffect(() => {
    if (modeLoading !== null && flight.modeNum === modeLoading) {
      setModeLoading(null);
      setStatusMsg({ text: `Mode: ${flight.mode}`, type: 'success' });
      setTimeout(() => setStatusMsg(null), 2000);
    }
  }, [flight.modeNum, modeLoading, flight.mode]);

  // Poll telemetry state until a condition is met, or timeout.
  // Reads directly from Zustand store (no re-renders).
  const waitForState = useCallback(async (
    check: () => boolean,
    timeoutMs: number,
    intervalMs = 200,
  ): Promise<boolean> => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (check()) return true;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return check(); // one last check
  }, []);

  // Takeoff dispatch: each vehicle class has its own self-contained procedure
  // in ./takeoff-strategies.ts (copter NAV_TAKEOFF, plane TAKEOFF mode, VTOL
  // NAV_VTOL_TAKEOFF + Q_GUIDED_MODE on real hw, QHover+RC ramp on SITL).
  // Keep this function thin — it only wires up state + IPC + UI feedback
  // for the chosen strategy.
  const handleTakeoff = async () => {
    setShowTakeoffDialog(false);
    const store = useTelemetryStore.getState;
    const result = await executeTakeoff({
      altitudeM:    takeoffAlt,
      forceArm,
      vehicleClass,
      capabilities,
      isSitl: connectionState.isSitl ?? sitlIsRunning,
      getFlight:   () => store().flight,
      getGps:      () => store().gps,
      getPosition: () => store().position,
      getParam: (id) => {
        const p = useParameterStore.getState().parameters.get(id);
        return p ? { value: p.value, type: p.type } : undefined;
      },
      api: {
        mavlinkSetMode:     window.electronAPI.mavlinkSetMode,
        mavlinkArmDisarm:   window.electronAPI.mavlinkArmDisarm,
        mavlinkTakeoff:     window.electronAPI.mavlinkTakeoff,
        mavlinkVtolTakeoff: window.electronAPI.mavlinkVtolTakeoff,
        setParameter:       window.electronAPI.setParameter,
        sitlRcStart:        window.electronAPI.ardupilotSitlRcStart,
        sitlRcSend:         window.electronAPI.ardupilotSitlRcSend,
      },
      setStatus: setStatusMsg,
      waitForState,
    });
    if (result.ok) {
      setStatusMsg({ text: `Taking off to ${takeoffAlt}m...`, type: 'success' });
    } else {
      setStatusMsg({ text: result.reason, type: 'error' });
    }
    setTimeout(() => setStatusMsg(null), 3000);
  };

  // Per-vehicle button + dialog copy comes from the strategy module.
  const takeoffPresentation = useMemo(() => presentTakeoff(vehicleClass), [vehicleClass]);

  // RTL/Land sourced from the per-vehicle capability matrix.
  const rtlModeNum = capabilities.rtlModeNum;
  const landModeNum = capabilities.land.modeNum;
  const landSupported = capabilities.land.supported;
  const landLabel = capabilities.land.label;
  const landDisabledReason = capabilities.land.disabledReason;

  // Status message color
  const statusColor = statusMsg?.type === 'success' ? 'text-emerald-400' : statusMsg?.type === 'error' ? 'text-red-400' : 'text-content-secondary';

  return (
    <PanelContainer>
      <div ref={containerRef} data-tour="telemetry-flight-control" className="h-full min-h-0">
        {isHorizontal ? (
          /* Horizontal layout — ARM button is THE hero control */
          <div className="h-full flex flex-col justify-center gap-3">
            <div className="flex items-center gap-4">
              {/* Left: Mode + protocol */}
              <div className="shrink-0 w-20">
                <div className="text-content font-medium leading-tight">{flight.mode || 'Unknown'}</div>
                <div className="text-[10px] text-content-secondary">MAVLink</div>
              </div>

              {/* CENTER: The ARM button — primary control */}
              <div className="flex-1 flex justify-center">
                <button
                  onClick={() => handleArmDisarm()}
                  disabled={isLoading}
                  className={`
                    flex items-center justify-center gap-3 min-w-[200px] px-8 py-3.5 rounded-xl
                    font-bold text-base uppercase tracking-wider
                    transition-all duration-200 select-none border-2
                    ${isLoading ? 'cursor-wait' : 'cursor-pointer'}
                    ${flight.armed
                      ? 'bg-red-500/15 border-red-500/50 text-red-400 hover:bg-red-500/25 shadow-lg shadow-red-500/10'
                      : forceArm
                        ? 'bg-amber-500/15 border-amber-500/50 text-amber-400 hover:bg-amber-500/25 shadow-lg shadow-amber-500/10'
                        : 'bg-surface border-subtle text-content hover:bg-surface-raised hover:text-content hover:border-default'
                    }
                  `}
                >
                  {isLoading ? (
                    <>
                      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <span>{flight.armed ? 'Disarming...' : 'Arming...'}</span>
                    </>
                  ) : (
                    <>
                      <div className={`w-2.5 h-2.5 rounded-full ${
                        flight.armed ? 'bg-red-400 animate-pulse' : forceArm ? 'bg-amber-400' : 'bg-content-tertiary'
                      }`} />
                      <span>{flight.armed ? 'Disarm' : forceArm ? 'Force Arm' : 'Arm'}</span>
                    </>
                  )}
                </button>
              </div>

              {/* Right: Force toggle */}
              <div className="shrink-0 w-20 flex justify-end">
                <button
                  onClick={() => setForceArm(!forceArm)}
                  className={`
                    flex items-center gap-2 px-3 py-2 rounded-lg transition-all
                    ${forceArm
                      ? 'bg-amber-500/10 border border-amber-500/30'
                      : 'bg-surface border border-subtle hover:border-default'
                    }
                  `}
                  title="Force ARM bypasses pre-arm safety checks"
                >
                  <svg className={`w-3.5 h-3.5 ${forceArm ? 'text-amber-400' : 'text-content-secondary'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span className={`text-xs font-medium ${forceArm ? 'text-amber-300' : 'text-content'}`}>Force</span>
                  <div className={`w-7 h-3.5 rounded-full transition-colors relative ${forceArm ? 'bg-amber-500' : 'bg-surface-raised'}`}>
                    <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-transform ${forceArm ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                  </div>
                </button>
              </div>
            </div>

            {/* Status feedback — right below the ARM button */}
            {statusMsg && (
              <div className={`text-center text-xs font-medium ${statusColor}`}>{statusMsg.text}</div>
            )}

            {/* Pre-arm reasons as compact chips */}
            {!flight.armed && preArmReasons.length > 0 && (
              <div className="space-y-1">
                <div className="flex flex-wrap items-center justify-center gap-1.5">
                  {preArmReasons.map(({ reason, fix }, i) => {
                    const hasFixContent = fix.params.length > 0 || fix.action || fix.navigateTo;
                    return (
                      <span
                        key={i}
                        className={`px-2 py-0.5 bg-red-500/10 border border-red-500/20 rounded text-red-300 text-[11px] ${hasFixContent ? 'cursor-pointer hover:bg-red-500/15' : ''}`}
                        onClick={hasFixContent ? () => setExpandedPreArm((prev) => {
                          const next = new Set(prev);
                          if (next.has(reason)) next.delete(reason);
                          else next.add(reason);
                          return next;
                        }) : undefined}
                      >
                        {reason} {hasFixContent && (expandedPreArm.has(reason) ? '▾' : '›')}
                      </span>
                    );
                  })}
                </div>
                {preArmReasons.filter(({ reason }) => expandedPreArm.has(reason)).map(({ reason, fix }) => (
                  <PreArmParamFix
                    key={reason}
                    paramIds={fix.params}
                    hint={fix.hint}
                    action={fix.action}
                    navigateTo={fix.navigateTo}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Vertical layout for side panels — compact to reclaim vertical
             space for other panels. Principles:
               - No giant hero arm circle; a wide short button is enough.
               - Status dot + state + mode + protocol live on a single line
                 (no separate Land / MAVLink header duplicating the mode pill).
               - Mode pills in a 4-column grid (2 rows), not free-flowing.
               - Drop duplicate RTL / Land from Quick Actions — they're already
                 in Flight Mode. Keep Takeoff because it has an altitude param.
               - Mission collapses to one compact card with status + Start/Pause
                 side-by-side, no section header.  */
          <div className="flex flex-col h-full overflow-auto">
            {/* Top status strip */}
            <div className="flex items-center gap-2 mb-2 text-xs">
              <div className={`w-2 h-2 rounded-full shrink-0 ${
                flight.armed ? 'bg-red-400 animate-pulse' : 'bg-content-tertiary'
              }`} />
              <span className={`font-medium ${flight.armed ? 'text-red-400' : 'text-content-secondary'}`}>
                {flight.armed ? 'ARMED' : 'DISARMED'}
              </span>
              <span className="text-content-tertiary">·</span>
              <span className="text-content truncate">{flight.mode || 'Unknown'}</span>
              <span className="ml-auto text-[10px] text-content-tertiary shrink-0">MAVLink</span>
            </div>

            {/* Compact ARM row */}
            <button
              onClick={() => handleArmDisarm()}
              disabled={isLoading}
              className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 mb-2 rounded-lg
                font-bold text-sm uppercase tracking-wider transition-all border-2
                ${isLoading ? 'cursor-wait opacity-70' : 'cursor-pointer'}
                ${flight.armed
                  ? 'bg-red-500/15 border-red-500/50 text-red-400 hover:bg-red-500/25'
                  : forceArm
                    ? 'bg-amber-500/15 border-amber-500/50 text-amber-400 hover:bg-amber-500/25'
                    : 'bg-surface border-subtle text-content hover:bg-surface-raised hover:border-default'
                }`}
            >
              {isLoading
                ? (flight.armed ? 'Disarming…' : 'Arming…')
                : flight.armed ? 'Disarm' : forceArm ? 'Force Arm' : 'Arm'}
            </button>

            {statusMsg && (
              <div className={`text-center text-[11px] font-medium mb-2 ${statusColor}`}>{statusMsg.text}</div>
            )}

            {/* Flight Modes — rounded-rectangle grid. Pills (rounded-full)
                don't tile cleanly in a grid and need extra horizontal padding
                that clipped longer names. Rectangles fill their cell so text
                fits at any column count, and they match the visual language
                of every other control on this panel. */}
            <div className="grid grid-cols-3 gap-1 mb-2">
              {availableModes.map((mode) => {
                const isActive = flight.modeNum === mode.modeNum;
                return (
                  <button
                    key={mode.modeNum}
                    onClick={() => handleSetMode(mode.modeNum)}
                    title={mode.name}
                    className={`px-1 py-1.5 rounded-md text-[11px] font-medium truncate
                      transition-colors duration-150
                      ${isActive
                        ? 'bg-blue-500 text-white shadow-sm shadow-blue-500/30'
                        : 'bg-surface-raised text-content hover:bg-surface-raised hover:text-white border border-transparent hover:border-default'}
                    `}
                  >
                    {mode.name}
                  </button>
                );
              })}
            </div>

            {/* Takeoff. Label, hint and dialog copy come from the per-vehicle
                strategy in ./takeoff-strategies.ts so the UI never describes
                a procedure that doesn't match the dispatch path below it. */}
            {capabilities.takeoff.supported && (
              <button
                onClick={() => setShowTakeoffDialog(true)}
                disabled={flight.armed}
                className="w-full px-2 py-1.5 mb-2 text-xs font-medium rounded-lg bg-surface border border-subtle hover:bg-surface-raised hover:border-default disabled:opacity-40 disabled:cursor-not-allowed text-content transition-all"
                title={flight.armed ? 'Already armed — click disarm first' : takeoffPresentation.buttonHint}
              >
                {takeoffPresentation.buttonLabel}
              </button>
            )}

            {/* Mission — compact 2-line card. Cramming status + buttons on a
                single line overflowed at typical side-panel widths and made
                button title-tooltips clip into the canvas. */}
            <div className="mb-2 rounded-lg bg-surface border border-subtle p-1.5">
              <div className="flex items-center justify-between mb-1 px-1">
                <span className="text-[11px] text-content truncate">
                  {missionLoaded
                    ? <>
                        {missionItems.length} wp
                        <span className="text-content-tertiary"> · </span>
                        {/* Arrow makes the semantics unambiguous: this is the
                            NEXT/active waypoint, not "X complete of Y". */}
                        <span className="font-mono text-content-secondary">
                          {currentSeq != null
                            ? `→ ${currentSeq + 1}/${missionItems.length}`
                            : (isInAuto ? 'starting…' : 'idle')}
                        </span>
                      </>
                    : <span className="text-content-secondary">No mission</span>}
                </span>
                <button
                  onClick={() => { void fetchMission(); }}
                  className="text-[11px] text-content-tertiary hover:text-content shrink-0"
                  title="Reload mission from FC"
                >⟳</button>
              </div>
              {missionLoaded && (
                <div className="flex gap-1">
                  <button
                    onClick={() => handleSetMode(missionModes.auto)}
                    disabled={!flight.armed || isInAuto}
                    className="flex-1 px-2 py-1 text-[11px] font-medium rounded bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed text-emerald-300 transition-all"
                    title={!flight.armed ? 'Arm first' : 'Switch to AUTO'}
                  >
                    {isInAuto ? 'Running' : 'Start'}
                  </button>
                  {isInAuto ? (
                    <button
                      onClick={() => handleSetMode(missionModes.pause)}
                      disabled={!flight.armed}
                      className="flex-1 px-2 py-1 text-[11px] font-medium rounded bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed text-amber-300 transition-all"
                    >Pause</button>
                  ) : (
                    <button
                      onClick={() => handleSetMode(missionModes.auto)}
                      disabled={!flight.armed || !isInPause}
                      className="flex-1 px-2 py-1 text-[11px] font-medium rounded bg-blue-500/10 border border-blue-500/30 hover:bg-blue-500/20 disabled:opacity-40 disabled:cursor-not-allowed text-blue-300 transition-all"
                      title={isInPause ? `Resume from ${missionModes.pauseLabel}` : `Pause first`}
                    >Resume</button>
                  )}
                </div>
              )}
            </div>

            {/* Takeoff altitude dialog — compact single-row: label, small
                fixed-width number input, Go, and an ✕ for cancel. The
                previous `flex-1` input hogged the row and pushed Cancel off
                the panel. */}
            {showTakeoffDialog && (
              <div className="mb-2 p-1.5 bg-surface-raised rounded-lg border border-default">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-content-secondary shrink-0">
                    {takeoffPresentation.dialogPrompt}
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={takeoffAlt}
                    onChange={(e) => setTakeoffAlt(Math.max(1, Math.min(100, Number(e.target.value))))}
                    className="w-14 px-1.5 py-1 text-sm font-mono bg-surface-input border border-subtle rounded text-content"
                  />
                  <span className="text-[11px] text-content-secondary shrink-0">m</span>
                  <button
                    onClick={handleTakeoff}
                    className="ml-auto px-2.5 py-1 text-[11px] font-medium bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
                  >
                    Go
                  </button>
                  <button
                    onClick={() => setShowTakeoffDialog(false)}
                    className="px-1.5 py-1 text-content-secondary hover:text-content transition-colors text-sm leading-none"
                    title="Cancel"
                    aria-label="Cancel takeoff"
                  >✕</button>
                </div>
                {takeoffPresentation.dialogNote && (
                  <p className="mt-1 text-[10px] text-content-tertiary leading-tight">
                    {takeoffPresentation.dialogNote}
                  </p>
                )}
              </div>
            )}

            {!flight.armed && preArmReasons.length > 0 && (
              <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                <div className="text-red-400 text-[10px] font-medium uppercase tracking-wider px-2.5 pt-2.5 pb-1.5">Pre-arm Checks Failed</div>
                <div className="flex flex-col">
                  {preArmReasons.map(({ reason, fix }, i) => {
                    const isExpanded = expandedPreArm.has(reason);
                    const hasFixContent = fix.params.length > 0 || fix.action || fix.navigateTo;
                    return (
                      <div key={i}>
                        <div
                          className={`flex items-start gap-1.5 px-2.5 py-1 ${hasFixContent ? 'cursor-pointer hover:bg-red-500/5' : ''} transition-colors`}
                          onClick={hasFixContent ? () => setExpandedPreArm((prev) => {
                            const next = new Set(prev);
                            if (next.has(reason)) next.delete(reason);
                            else next.add(reason);
                            return next;
                          }) : undefined}
                        >
                          <svg className="w-3 h-3 text-red-400 mt-px shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          <span className="flex-1 text-red-300 text-[11px] leading-tight">{reason}</span>
                          {hasFixContent && (
                            <span className="text-[10px] text-blue-400 shrink-0">{isExpanded ? '▾' : 'Fix ›'}</span>
                          )}
                        </div>
                        {isExpanded && (
                          <PreArmParamFix
                            paramIds={fix.params}
                            hint={fix.hint}
                            action={fix.action}
                            navigateTo={fix.navigateTo}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <button
              onClick={() => setForceArm(!forceArm)}
              title="Bypass pre-arm checks — use only when the failing check is known-safe."
              className={`flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg transition-all
                ${forceArm
                  ? 'bg-amber-500/10 border border-amber-500/30'
                  : 'bg-surface border border-subtle hover:border-default'}`}
            >
              <div className="flex items-center gap-2">
                <svg className={`w-3.5 h-3.5 ${forceArm ? 'text-amber-400' : 'text-content-secondary'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className={`text-[11px] font-medium ${forceArm ? 'text-amber-300' : 'text-content'}`}>Force ARM</span>
              </div>
              <div className={`w-7 h-3.5 rounded-full transition-colors relative ${forceArm ? 'bg-amber-500' : 'bg-surface-raised'}`}>
                <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-transform ${forceArm ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
              </div>
            </button>

            <div className="flex-1" />
          </div>
        )}
      </div>
    </PanelContainer>
  );
}

// =============================================================================
// Main Component (MSP)
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
  if (!isConnected) {
    return (
      <PanelContainer className="flex flex-col items-center justify-center">
        <svg className="w-12 h-12 text-content-tertiary mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
        </svg>
        <div className="text-content-secondary text-sm">Connect to a device</div>
      </PanelContainer>
    );
  }

  // MAVLink mode: show arm/disarm with force-arm option
  if (protocol === 'mavlink') {
    return <MavlinkFlightControl />;
  }

  return (
    <div data-tour="telemetry-flight-control" className="h-full w-full">
      <PanelContainer>
        <div className="flex flex-col h-full">
          {/* Header with status */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="text-content font-medium">{flight.mode || 'Unknown'}</div>
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
          className="mt-3 py-1.5 px-3 text-xs text-content-secondary hover:text-content bg-surface hover:bg-surface-raised rounded transition-colors self-center"
        >
          Center Sticks
        </button>

        {/* Setup section (collapsed by default) */}
        {!canArm && modeMappingsLoaded && (
          <div className="mt-4 pt-3 border-t border-default">
            <button
              onClick={() => setShowSetup(!showSetup)}
              className="flex items-center gap-2 text-content-secondary hover:text-content-secondary text-xs transition-colors"
            >
              <svg className={`w-3 h-3 transition-transform ${showSetup ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              Setup Required
            </button>

            {showSetup && (
              <div className="mt-2 p-2 bg-surface-raised rounded-lg">
                <p className="text-content-secondary text-xs mb-2">
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
          <div className="text-center text-content-secondary text-xs py-4">
            Loading configuration...
          </div>
        )}
      </div>
    </PanelContainer>
    </div>
  );
}
