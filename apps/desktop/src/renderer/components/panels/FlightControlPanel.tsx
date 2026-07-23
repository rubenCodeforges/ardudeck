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
import { useSettingsStore } from '../../stores/settings-store';
import { useActiveVehicleStore } from '../../stores/active-vehicle-store';
import { useFleetVehicles } from '../../hooks/useFleet';
import { useOrchestrationStore } from '../../stores/orchestration-store';
import { isPreArmMessage, extractPreArmReason, matchPreArmError, PREARM_STALE_MS } from '../../../shared/prearm-checks';
import { PreArmParamFix } from '../prearm/PreArmParamFix';
import { PanelContainer, SectionTitle } from './panel-utils';
import { getVehicleClass, VEHICLE_CAPABILITIES, type ArduPilotVehicleClass } from '../../../shared/telemetry-types';
import { useModeRequest } from '../../hooks/useModeRequest';
import { ModeAnnunciator } from './flight-modes/ModeAnnunciator';
import { ModePicker } from './flight-modes/ModePicker';
import { modeMetaFor, modeSubline, isPilotThrottleMode } from '../../../shared/flight-mode-meta';
import { executeTakeoff, presentTakeoff } from './takeoff-strategies';
import {
  altitudeValueFromMeters,
  formatAltitudeFromMeters,
  toMetersFromAltitudeUnit,
  UNIT_LABELS,
} from '../../../shared/user-units.js';

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

function MavlinkFlightControl({ mavTypeOverride }: { mavTypeOverride?: number }) {
  const flight = useTelemetryStore((s) => s.flight);
  const gps = useTelemetryStore((s) => s.gps);
  const messages = useMessagesStore((s) => s.messages);
  const connectionState = useConnectionStore((s) => s.connectionState);
  // Multi-signal VTOL detection: MAV_TYPE alone is unreliable on first
  // connect (FCU reports FIXED_WING until reboot picks up Q_ENABLE). Pulling
  // the live Q_ENABLE param + the running SITL frame closes both gaps.
  const qEnableParam = useParameterStore((s) => s.parameters.get('Q_ENABLE')?.value);
  const sitlIsRunning = useArduPilotSitlStore((s) => s.isRunning);
  const sitlFrame = useArduPilotSitlStore((s) => s.model);
  // Detached windows (e.g. the 3D Sim World, Vision pop-outs) don't bulk-hydrate
  // the parameter store, so Q_ENABLE - the decisive VTOL signal - is absent there
  // and a quadplane misdetects as `plane` (giving fixed-wing modes). Fall back to
  // a targeted one-shot read of just Q_ENABLE so class detection matches the main
  // window regardless of which window hosts this panel. No-op in the main window
  // (Q_ENABLE is already present) and self-heals across connect/disconnect.
  const [qEnableFallback, setQEnableFallback] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (typeof qEnableParam === 'number') return; // store already has it
    if (!connectionState.isConnected) { setQEnableFallback(undefined); return; }
    let cancelled = false;
    void window.electronAPI?.readParameterBatch?.(['Q_ENABLE'])
      .then((res) => {
        if (cancelled) return;
        const v = res?.values?.['Q_ENABLE'];
        setQEnableFallback(typeof v === 'number' ? v : undefined);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [qEnableParam, connectionState.isConnected]);
  const qEnable = qEnableParam ?? qEnableFallback;
  // In fleet mode the active vehicle's MAV_TYPE drives the class (the legacy
  // connectionState.mavType belongs to the idle primary connection).
  const vehicleClass = getVehicleClass(mavTypeOverride ?? connectionState.mavType, {
    qEnable: typeof qEnable === 'number' ? qEnable : undefined,
    sitlFrame: sitlIsRunning ? sitlFrame : undefined,
  });
  const capabilities = VEHICLE_CAPABILITIES[vehicleClass];
  // Squad command: when a formation is active and the LEADER is selected, arm/disarm/mode
  // fan out to the whole formation (the leader leads the squad). Otherwise commands act on
  // just the active vehicle. Movement already propagates via the follow.leader loop.
  const formationLeaderKey = useActiveVehicleStore((s) => s.formationLeaderKey);
  const activeVehicleKey = useActiveVehicleStore((s) => s.activeVehicleKey);
  const fleetVehicles = useFleetVehicles();
  const squadKeys = formationLeaderKey && activeVehicleKey === formationLeaderKey
    ? fleetVehicles.map((v) => v.key)
    : null;
  // Fleet takeoff routing: when the active vehicle belongs to an orchestrator fleet, take off
  // via the engine's synchronized takeoff (squad if leading a formation, else just this one).
  const orchServers = useOrchestrationStore((s) => s.servers);
  const orchServer = Object.values(orchServers).find((s) => s.capabilities.includes('takeoff.synchronized'));
  const activeFleetVehicle = fleetVehicles.find((v) => v.key === activeVehicleKey);
  const fleetTakeoffSysids = orchServer && activeFleetVehicle
    ? (squadKeys ? fleetVehicles.map((v) => v.sysid) : [activeFleetVehicle.sysid])
    : null;
  const missionItems = useMissionStore((s) => s.missionItems);
  const currentSeq = useMissionStore((s) => s.currentSeq);
  const fetchMission = useMissionStore((s) => s.fetchMission);
  const altitudeUnit = useSettingsStore((s) => s.unitPreferences.altitude);
  const missionLoaded = missionItems.length > 0;
  const missionModes = MISSION_MODES[vehicleClass];
  const isInAuto = flight.modeNum === missionModes.auto;
  const isInPause = flight.modeNum === missionModes.pause;

  const [isLoading, setIsLoading] = useState(false);
  const [forceArm, setForceArm] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'info' | 'error' | 'success' } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHorizontal, setIsHorizontal] = useState(false);
  // Command-bar control height, scaled to the dock height so the controls fill
  // the bar instead of floating at a fixed size (clamped to a sensible range).
  const [barHeight, setBarHeight] = useState(0);
  const controlH = Math.round(Math.max(38, Math.min(56, barHeight - 22)));
  const [expandedPreArm, setExpandedPreArm] = useState<Set<string>>(new Set());
  // Pre-arm reasons are derived from the (append-only) message log, so a failure
  // the FC reported once lingers even after it's fixed. Clearing stamps "now";
  // only messages newer than this show, so a still-failing check reappears when
  // the FC re-reports it (which bumps its timestamp) while fixed ones stay gone.
  const [preArmDismissedAt, setPreArmDismissedAt] = useState(0);
  const clearPreArm = useCallback(() => {
    setPreArmDismissedAt(Date.now());
    setExpandedPreArm(new Set());
  }, []);
  // The FC re-broadcasts failing checks every ~30s (bumping the message
  // timestamp), so a fixed reason ages out after PREARM_STALE_MS while a
  // still-failing one stays fresh. Tick so freshness re-evaluates even when no
  // new message arrives. Same approach as PreflightCheckCard.
  const [preArmNow, setPreArmNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setPreArmNow(Date.now()), 5_000);
    return () => clearInterval(id);
  }, []);
  const prevArmedRef = useRef(flight.armed);
  const [pickerOpen, setPickerOpen] = useState(false);
  const modeAnchorRef = useRef<HTMLDivElement>(null);
  const [showTakeoffDialog, setShowTakeoffDialog] = useState(false);
  const [takeoffAlt, setTakeoffAlt] = useState(10);
  const takeoffAltitudePrecision = altitudeUnit === 'km' ? 3 : altitudeUnit === 'm' ? 0 : 1;
  const takeoffAltitudeDisplay = Number(altitudeValueFromMeters(takeoffAlt, altitudeUnit).toFixed(takeoffAltitudePrecision));
  const takeoffAltitudeMin = altitudeValueFromMeters(1, altitudeUnit);
  const takeoffAltitudeMax = altitudeValueFromMeters(100, altitudeUnit);
  const takeoffAltitudeStep = altitudeUnit === 'km' ? 0.001 : 1;
  const altitudeLabel = UNIT_LABELS.altitude[altitudeUnit];

  const setTakeoffAltitudeFromDisplay = useCallback((displayValue: number) => {
    if (!Number.isFinite(displayValue)) return;
    const meters = toMetersFromAltitudeUnit(displayValue, altitudeUnit);
    setTakeoffAlt(Math.max(1, Math.min(100, meters)));
  }, [altitudeUnit]);

  // Detect panel orientation for responsive layout
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setIsHorizontal(entry.contentRect.width > entry.contentRect.height * 1.5);
        setBarHeight(entry.contentRect.height);
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
    const freshAfter = Math.max(preArmDismissedAt, preArmNow - PREARM_STALE_MS);
    return messages
      .filter((m) => isPreArmMessage(m.text))
      .filter((m) => m.timestamp >= freshAfter)
      .map((m) => {
        const match = matchPreArmError(m.text);
        return match ? { reason: match.reason, fix: match.pattern.fix } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .filter((x, i, arr) => arr.findIndex((a) => a.reason === x.reason) === i)
      .slice(0, 10);
  }, [messages, flight.armed, preArmDismissedAt, preArmNow]);

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
      let ok: boolean;
      if (squadKeys) {
        const results = await Promise.all(squadKeys.map((k) =>
          window.electronAPI.vehicleCommand(k, { kind: wantArm ? 'arm' : 'disarm', force: forceArm }),
        ));
        ok = results.some(Boolean);
      } else {
        ok = await window.electronAPI.mavlinkArmDisarm(wantArm, forceArm);
      }
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

  // SITL hover-hold: flying a pilot-throttle mode (AltHold/AUTOTUNE/...) with no
  // transmitter hands throttle to an idle RC stick, so the mode drops the copter
  // or refuses to init. We stream a centered RC override (throttle mid) to hold
  // the hover, and release it when we leave a pilot mode or disarm. Aux/mode
  // channels stay at 65535 so this never hijacks the flight mode.
  const rcHoldRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRcHold = useCallback(() => {
    const send = () => { void window.electronAPI?.rcOverrideSet?.(1500, 1500, 1500, 1500); };
    send();
    if (rcHoldRef.current) clearInterval(rcHoldRef.current);
    rcHoldRef.current = setInterval(send, 250);
  }, []);
  const stopRcHold = useCallback(() => {
    if (!rcHoldRef.current) return;
    clearInterval(rcHoldRef.current);
    rcHoldRef.current = null;
    void window.electronAPI?.rcOverrideRelease?.();
  }, []);
  // Release the hold on disarm and on unmount.
  useEffect(() => { if (!flight.armed) stopRcHold(); }, [flight.armed, stopRcHold]);
  useEffect(() => () => stopRcHold(), [stopRcHold]);
  // CRITICAL: release the hold the moment the vehicle is actually in a mode that
  // doesn't take pilot throttle (e.g. a map "Move" switches to GUIDED, or any
  // FC-initiated change). A leaked RC override in GUIDED/AUTO makes ArduCopter
  // treat the pilot as in control and ignore reposition/mission targets - i.e.
  // "Move / right-click commands stop working". Track the LIVE heartbeat mode,
  // not just the modes we command ourselves.
  useEffect(() => {
    if (flight.modeNum != null && !isPilotThrottleMode(vehicleClass, flight.modeNum)) {
      stopRcHold();
    }
  }, [flight.modeNum, vehicleClass, stopRcHold]);

  // Mode switching: the annunciator state machine sends the mode and only shows
  // it engaged once the vehicle's heartbeat confirms it (see useModeRequest).
  const sendMode = useCallback(async (modeNum: number): Promise<boolean> => {
    setStatusMsg(null);
    try {
      // In SITL, hold a hover before handing throttle to a pilot-throttle mode
      // (else AUTOTUNE etc. see idle throttle and bail). Only when armed and
      // actually airborne, so we never spin up on the ground.
      const isSitl = connectionState.isSitl ?? sitlIsRunning;
      const relAlt = useTelemetryStore.getState().position?.relativeAlt ?? 0;
      const pilotMode = isPilotThrottleMode(vehicleClass, modeNum);
      const wantHold = !squadKeys && isSitl && flight.armed && relAlt > 2 && pilotMode;
      // TEMP diagnostic (remove with perf-probe): why did / didn't the SITL hover-hold fire.
      console.log(`[AUTOTUNE DIAG] setmode=${modeNum} vClass=${vehicleClass} isSitl=${isSitl} armed=${flight.armed} relAlt=${relAlt.toFixed(1)} pilotThrottle=${pilotMode} squad=${!!squadKeys} -> ${wantHold ? 'HOLD HOVER' : 'no hold'}`);
      if (!squadKeys && isSitl && flight.armed) {
        if (wantHold) {
          const r = await window.electronAPI?.rcOverrideSet?.(1500, 1500, 1500, 1500);
          console.log('[AUTOTUNE DIAG] rcOverrideSet ->', JSON.stringify(r));
          startRcHold();
          setStatusMsg({ text: 'Holding hover (virtual RC)', type: 'info' });
          setTimeout(() => setStatusMsg(null), 3000);
          await new Promise((res) => setTimeout(res, 200)); // let the throttle override register before the mode inits
        } else {
          stopRcHold();
        }
      }
      if (squadKeys) {
        const results = await Promise.all(
          squadKeys.map((k) => window.electronAPI.vehicleCommand(k, { kind: 'setmode', customMode: modeNum })),
        );
        return results.some(Boolean);
      }
      return await window.electronAPI.mavlinkSetMode(modeNum);
    } catch {
      return false;
    }
  }, [squadKeys, connectionState.isSitl, sitlIsRunning, flight.armed, vehicleClass, startRcHold, stopRcHold]);

  const mode = useModeRequest(vehicleClass, flight.modeNum, sendMode);
  const { requestMode, confirmCommit, cancelCommit } = mode;
  // Memoised so the portaled picker (React.memo) doesn't reconcile on every
  // telemetry frame - that per-frame churn is what made it flicker over the
  // live sim canvas.
  const gpsOk = (gps?.fixType ?? 0) >= 3;
  const modeCtx = useMemo(() => ({ gpsOk, armed: flight.armed }), [gpsOk, flight.armed]);
  const requestedModeName = mode.requestedMode != null ? modeMetaFor(vehicleClass, mode.requestedMode)?.name : undefined;
  const currentSubline = modeSubline(modeMetaFor(vehicleClass, flight.modeNum)) || 'MAVLink';

  const togglePicker = useCallback(() => setPickerOpen((o) => !o), []);
  const closePicker = useCallback(() => setPickerOpen(false), []);
  const handlePickMode = useCallback((n: number) => {
    const meta = modeMetaFor(vehicleClass, n);
    requestMode(n);
    if (!meta?.commit) setPickerOpen(false);
  }, [vehicleClass, requestMode]);
  const handleConfirmCommit = useCallback(() => { confirmCommit(); setPickerOpen(false); }, [confirmCommit]);

  // Shared annunciator + picker block. `compact` = single-line pill for the
  // horizontal command bar (matches the other controls' height); the tall dock
  // uses the full two-line readout.
  const renderModeControl = (compact: boolean) => (
    <div className={`relative ${compact ? 'h-full' : ''}`} ref={modeAnchorRef}>
      <ModeAnnunciator
        compact={compact}
        phase={mode.phase}
        currentName={flight.mode || 'Unknown'}
        currentSubline={currentSubline}
        requestedName={requestedModeName}
        rejectLabel={mode.rejectLabel}
        justConfirmed={mode.justConfirmed}
        open={pickerOpen}
        onToggle={togglePicker}
      />
      {pickerOpen && (
        <ModePicker
          anchorRef={modeAnchorRef}
          vehicleClass={vehicleClass}
          currentModeNum={flight.modeNum}
          requestedModeNum={mode.requestedMode}
          pendingCommit={mode.pendingCommit}
          ctx={modeCtx}
          recents={mode.recents}
          onPick={handlePickMode}
          onConfirmCommit={handleConfirmCommit}
          onCancelCommit={cancelCommit}
          onClose={closePicker}
        />
      )}
    </div>
  );

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

    // Fleet vehicle: route through the orchestrator's synchronized takeoff, which runs the
    // full GUIDED -> ARM -> NAV_TAKEOFF sequence per vehicle (with the right per-class mode)
    // and is verified to climb. The client-side executeTakeoff below is for the primary
    // single connection only. A formation leader takes off the whole squad.
    if (orchServer && fleetTakeoffSysids) {
      void window.electronAPI?.submitIntent?.(orchServer.transportId, {
        kind: 'takeoff.synchronized',
        vehicleSysids: fleetTakeoffSysids,
        payload: { altitude: takeoffAlt },
      });
      setStatusMsg({ text: `Taking off to ${takeoffAlt}m...`, type: 'success' });
      setTimeout(() => setStatusMsg(null), 3000);
      return;
    }

    const store = useTelemetryStore.getState;
    const result = await executeTakeoff({
      altitudeM:    takeoffAlt,
      formatAltitude: (meters) => formatAltitudeFromMeters(meters, altitudeUnit),
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
      setStatusMsg({ text: `Taking off to ${formatAltitudeFromMeters(takeoffAlt, altitudeUnit)}...`, type: 'success' });
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
          /* Horizontal layout — a command bar that spreads every control
             across the available width instead of hiding them. A short, wide
             dock should expose the same actions as the tall dock (modes,
             takeoff, mission, force), just laid out left-to-right. */
          /* Command bar: flight-critical group pinned LEFT (arm + mode),
             mission ops pinned RIGHT (takeoff + mission), transient status /
             pre-arm floats in the CENTER. justify-between fills the full width
             instead of clustering everything on one side. */
          <div className="relative h-full flex items-center gap-3 px-4">
            {/* LEFT — flight-critical: armed chip, ARM, Force */}
            <div className="flex items-center gap-3 shrink-0" style={{ height: controlH }}>
              <div className="flex flex-col justify-center gap-0.5 pr-0.5">
                <div className="flex items-center gap-1.5 text-xs">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${flight.armed ? 'bg-red-400 animate-pulse' : 'bg-content-tertiary'}`} />
                  <span className={`font-semibold ${flight.armed ? 'text-red-400' : 'text-content-secondary'}`}>
                    {flight.armed ? 'ARMED' : 'DISARMED'}
                  </span>
                </div>
                <span className="text-[10px] text-content-tertiary pl-3.5">MAVLink</span>
              </div>

              <button
                onClick={() => handleArmDisarm()}
                disabled={isLoading}
                className={`h-full flex items-center justify-center gap-2.5 min-w-[140px] px-6 rounded-lg
                  font-bold text-sm uppercase tracking-wider transition-all duration-200 select-none border
                  ${isLoading ? 'cursor-wait' : 'cursor-pointer'}
                  ${flight.armed
                    ? 'bg-[var(--status-danger-bg)] border-[color:var(--status-danger)] text-[color:var(--status-danger-fg)] hover:brightness-110'
                    : forceArm
                      ? 'bg-[var(--status-warn-bg)] border-[color:var(--status-warn)] text-[color:var(--status-warn-fg)] hover:brightness-110'
                      : 'bg-surface border-subtle text-content hover:bg-surface-raised hover:text-content hover:border-default'
                  }`}
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
                    <div className={`w-2.5 h-2.5 rounded-full ${flight.armed ? 'bg-red-400 animate-pulse' : forceArm ? 'bg-amber-400' : 'bg-content-tertiary'}`} />
                    <span>{flight.armed ? 'Disarm' : forceArm ? 'Force Arm' : 'Arm'}</span>
                  </>
                )}
              </button>

              <button
                onClick={() => setForceArm(!forceArm)}
                className={`h-full shrink-0 flex flex-col items-center justify-center gap-1 px-2.5 rounded-lg transition-all
                  ${forceArm ? 'bg-[var(--status-warn-bg)] border border-subtle' : 'bg-surface border border-subtle hover:border-default'}`}
                title="Force ARM bypasses pre-arm safety checks"
              >
                <span className={`text-[10px] font-medium ${forceArm ? 'text-[color:var(--status-warn-fg)]' : 'text-content-secondary'}`}>Force</span>
                <div className={`w-7 h-3.5 rounded-full transition-colors relative ${forceArm ? 'bg-[var(--status-warn)]' : 'bg-surface-raised'}`}>
                  <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-transform ${forceArm ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                </div>
              </button>

            </div>

            <div className="w-px self-stretch bg-subtle/60 shrink-0 my-2" />

            {/* MODE — the hero readout; grows to fill the free space */}
            <div className="flex-1 min-w-[200px] max-w-[480px]" style={{ height: controlH }}>{renderModeControl(true)}</div>

            {/* transient status + pre-arm (only when present) */}
            {(statusMsg || (!flight.armed && preArmReasons.length > 0)) && (
              <div className="shrink-0 max-w-[280px] flex flex-col items-center justify-center gap-1">
                {statusMsg && <div className={`text-xs font-medium text-center ${statusColor}`}>{statusMsg.text}</div>}
                {!flight.armed && preArmReasons.length > 0 && (
                  <div className="flex items-center justify-center gap-1 flex-wrap max-w-full">
                    {preArmReasons.slice(0, 3).map(({ reason, fix }, i) => (
                      <span
                        key={i}
                        {...(fix.hint ? { 'data-tip': fix.hint } : {})}
                        className="px-2 py-0.5 bg-[var(--status-danger-bg)] border border-subtle rounded text-[color:var(--status-danger-fg)] text-[11px] truncate max-w-[200px]"
                      >
                        {reason}
                      </span>
                    ))}
                    <button
                      onClick={clearPreArm}
                      title="Dismiss these. A check that's still failing reappears when the flight controller re-reports it."
                      className="px-2 py-0.5 bg-surface border border-subtle rounded text-content-secondary hover:text-content text-[11px]"
                    >Clear</button>
                  </div>
                )}
              </div>
            )}

            {/* RIGHT — mission ops: takeoff + a single-row mission strip */}
            <div className="flex items-center gap-2 shrink-0" style={{ height: controlH }}>
              {showTakeoffDialog ? (
                <div className="h-full flex items-center gap-1.5 px-2.5 rounded-lg bg-surface border border-default">
                  <span className="text-[11px] text-content-secondary shrink-0">{takeoffPresentation.dialogPrompt}</span>
                  <input
                    type="number"
                    min={takeoffAltitudeMin}
                    max={takeoffAltitudeMax}
                    step={takeoffAltitudeStep}
                    value={takeoffAltitudeDisplay}
                    onChange={(e) => { if (e.target.value.trim() !== '') setTakeoffAltitudeFromDisplay(Number(e.target.value)); }}
                    className="w-14 px-1.5 py-1 text-sm font-mono bg-surface-input border border-subtle rounded text-content"
                  />
                  <span className="text-[11px] text-content-secondary shrink-0">{altitudeLabel}</span>
                  <button onClick={handleTakeoff} className="px-2.5 py-1 text-[11px] font-medium bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors">Go</button>
                  <button onClick={() => setShowTakeoffDialog(false)} className="px-1 text-content-secondary hover:text-content text-sm leading-none" title="Cancel" aria-label="Cancel takeoff">✕</button>
                </div>
              ) : capabilities.takeoff.supported && (
                <button
                  onClick={() => setShowTakeoffDialog(true)}
                  disabled={flight.armed}
                  className="h-full px-4 text-xs font-medium rounded-lg bg-surface border border-subtle hover:bg-surface-raised hover:border-default disabled:opacity-40 disabled:cursor-not-allowed text-content transition-all"
                  title={flight.armed ? 'Already armed — click disarm first' : takeoffPresentation.buttonHint}
                >
                  {takeoffPresentation.buttonLabel}
                </button>
              )}

              <div className="w-px self-stretch bg-subtle/60 shrink-0 my-0.5" />

              {/* Mission — one row: status, reload, Start/Pause/Resume */}
              <div className="h-full flex items-center gap-2 px-2.5 rounded-lg bg-surface border border-subtle">
                <span className="text-[11px] text-content whitespace-nowrap">
                  {missionLoaded
                    ? <>{missionItems.length} wp
                        <span className="text-content-tertiary"> · </span>
                        <span className="font-mono text-content-secondary">
                          {currentSeq != null ? `→ ${currentSeq + 1}/${missionItems.length}` : (isInAuto ? 'starting…' : 'idle')}
                        </span>
                      </>
                    : <span className="text-content-secondary">No mission</span>}
                </span>
                <button onClick={() => { void fetchMission(); }} className="text-content-tertiary hover:text-content shrink-0" title="Reload mission from FC">⟳</button>
                {missionLoaded && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => mode.requestMode(missionModes.auto, { skipConfirm: true })}
                      disabled={!flight.armed || isInAuto}
                      className="px-2.5 py-1 text-[11px] font-medium rounded bg-[var(--status-success-bg)] border border-subtle hover:border-[color:var(--status-success)] disabled:opacity-40 disabled:cursor-not-allowed text-[color:var(--status-success-fg)] transition-all"
                      title={!flight.armed ? 'Arm first' : 'Switch to AUTO'}
                    >{isInAuto ? 'Running' : 'Start'}</button>
                    {isInAuto ? (
                      <button
                        onClick={() => mode.requestMode(missionModes.pause, { skipConfirm: true })}
                        disabled={!flight.armed}
                        className="px-2.5 py-1 text-[11px] font-medium rounded bg-[var(--status-warn-bg)] border border-subtle hover:border-[color:var(--status-warn)] disabled:opacity-40 disabled:cursor-not-allowed text-[color:var(--status-warn-fg)] transition-all"
                      >Pause</button>
                    ) : (
                      <button
                        onClick={() => mode.requestMode(missionModes.auto, { skipConfirm: true })}
                        disabled={!flight.armed || !isInPause}
                        className="px-2.5 py-1 text-[11px] font-medium rounded bg-[var(--status-info-bg)] border border-subtle hover:border-[color:var(--status-info)] disabled:opacity-40 disabled:cursor-not-allowed text-[color:var(--status-info-fg)] transition-all"
                        title={isInPause ? `Resume from ${missionModes.pauseLabel}` : `Pause first`}
                      >Resume</button>
                    )}
                  </div>
                )}
              </div>
            </div>
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
                  ? 'bg-[var(--status-danger-bg)] border-[color:var(--status-danger)] text-[color:var(--status-danger-fg)] hover:brightness-110'
                  : forceArm
                    ? 'bg-[var(--status-warn-bg)] border-[color:var(--status-warn)] text-[color:var(--status-warn-fg)] hover:brightness-110'
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

            {/* Flight mode — annunciator (honest engaged/requested/rejected
                state) that opens the grouped, searchable picker. Replaces the
                old fixed grid so every mode is reachable without the clutter. */}
            <div className="mb-2">
              {renderModeControl(false)}
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
                    onClick={() => mode.requestMode(missionModes.auto, { skipConfirm: true })}
                    disabled={!flight.armed || isInAuto}
                    className="flex-1 px-2 py-1 text-[11px] font-medium rounded bg-[var(--status-success-bg)] border border-subtle hover:border-[color:var(--status-success)] disabled:opacity-40 disabled:cursor-not-allowed text-[color:var(--status-success-fg)] transition-all"
                    title={!flight.armed ? 'Arm first' : 'Switch to AUTO'}
                  >
                    {isInAuto ? 'Running' : 'Start'}
                  </button>
                  {isInAuto ? (
                    <button
                      onClick={() => mode.requestMode(missionModes.pause, { skipConfirm: true })}
                      disabled={!flight.armed}
                      className="flex-1 px-2 py-1 text-[11px] font-medium rounded bg-[var(--status-warn-bg)] border border-subtle hover:border-[color:var(--status-warn)] disabled:opacity-40 disabled:cursor-not-allowed text-[color:var(--status-warn-fg)] transition-all"
                    >Pause</button>
                  ) : (
                    <button
                      onClick={() => mode.requestMode(missionModes.auto, { skipConfirm: true })}
                      disabled={!flight.armed || !isInPause}
                      className="flex-1 px-2 py-1 text-[11px] font-medium rounded bg-[var(--status-info-bg)] border border-subtle hover:border-[color:var(--status-info)] disabled:opacity-40 disabled:cursor-not-allowed text-[color:var(--status-info-fg)] transition-all"
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
                    min={takeoffAltitudeMin}
                    max={takeoffAltitudeMax}
                    step={takeoffAltitudeStep}
                    value={takeoffAltitudeDisplay}
                    onChange={(e) => {
                      if (e.target.value.trim() === '') return;
                      setTakeoffAltitudeFromDisplay(Number(e.target.value));
                    }}
                    className="w-14 px-1.5 py-1 text-sm font-mono bg-surface-input border border-subtle rounded text-content"
                  />
                  <span className="text-[11px] text-content-secondary shrink-0">{altitudeLabel}</span>
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
              <div className="mb-4 bg-[var(--status-danger-bg)] border border-subtle rounded-lg">
                <div className="flex items-center justify-between px-2.5 pt-2.5 pb-1.5">
                  <span className="text-red-400 text-[10px] font-medium uppercase tracking-wider">Pre-arm Checks Failed</span>
                  <button
                    onClick={clearPreArm}
                    title="Dismiss these. A check that's still failing reappears when the flight controller re-reports it."
                    className="text-[10px] text-content-secondary hover:text-content px-1.5 py-0.5 -my-0.5 rounded hover:bg-red-500/10 transition-colors"
                  >
                    Clear
                  </button>
                </div>
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
                          <span className="flex-1 text-[color:var(--status-danger-fg)] text-[11px] leading-tight">{reason}</span>
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
                  ? 'bg-[var(--status-warn-bg)] border border-subtle'
                  : 'bg-surface border border-subtle hover:border-default'}`}
            >
              <div className="flex items-center gap-2">
                <svg className={`w-3.5 h-3.5 ${forceArm ? 'text-amber-400' : 'text-content-secondary'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className={`text-[11px] font-medium ${forceArm ? 'text-[color:var(--status-warn-fg)]' : 'text-content'}`}>Force ARM</span>
              </div>
              <div className={`w-7 h-3.5 rounded-full transition-colors relative ${forceArm ? 'bg-[var(--status-warn)]' : 'bg-surface-raised'}`}>
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
  const activeVehicleKey = useActiveVehicleStore((s) => s.activeVehicleKey);
  const activeMavType = useActiveVehicleStore((s) => (s.activeVehicleKey ? s.knownVehicles[s.activeVehicleKey]?.mavType : undefined));
  const primaryConnected = connectionState?.isConnected ?? false;
  // In multi-vehicle mode the primary single connection is idle; the selected fleet
  // vehicle is the live target. Treat that as connected + MAVLink so the controls
  // render and act on the active vehicle (the main process routes commands to it).
  const fleetActive = !primaryConnected && activeVehicleKey != null;
  const isConnected = primaryConnected || fleetActive;
  const protocol = fleetActive ? 'mavlink' : connectionState?.protocol;
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
    return <MavlinkFlightControl mavTypeOverride={fleetActive ? activeMavType : undefined} />;
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
          <div className="mb-4 p-2 bg-[var(--status-danger-bg)] border border-subtle rounded-lg">
            <div className="text-red-400 text-[10px] font-medium uppercase tracking-wider mb-1">Arming Blocked</div>
            <div className="flex flex-wrap gap-1">
              {flight.armingDisabledReasons.map((reason, i) => (
                <span key={i} className="px-1.5 py-0.5 bg-[var(--status-danger-bg)] rounded text-[color:var(--status-danger-fg)] text-[10px]">
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
