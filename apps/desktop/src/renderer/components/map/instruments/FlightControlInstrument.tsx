/**
 * Flight Control as a map instrument: the panel's core actions (arm/disarm,
 * flight mode, mission start/pause, abort) in a compact on-map card so the
 * pilot can command without leaving the map.
 *
 * Safety parity with FlightControlPanel:
 * - Arm/disarm is a two-step confirm (first press arms the button, second
 *   press within 3s sends). No Force path here; Force lives in the panel.
 * - Mode changes ride the same useModeRequest FMA state machine: committing
 *   modes ask for an inline Engage confirm, engagement only shows once the
 *   vehicle's heartbeat reports the mode, rejections linger in red.
 * - Mission Start gates on mission-store isDirty exactly like the panel's
 *   Upload & Start dialog (never silently fly a plan the FC doesn't hold).
 *
 * Takeoff reuses the panel's per-vehicle procedures (takeoff-strategies.ts)
 * verbatim, with an inline altitude row instead of the dialog. Deliberately
 * panel-only: force arm, squad/formation fan-out, fleet synchronized
 * takeoff (orchestrator path), jump-to-waypoint.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTelemetryStore } from '../../../stores/telemetry-store';
import { useConnectionStore } from '../../../stores/connection-store';
import { useActiveVehicleStore } from '../../../stores/active-vehicle-store';
import { useMissionStore } from '../../../stores/mission-store';
import { useParameterStore } from '../../../stores/parameter-store';
import { useArduPilotSitlStore } from '../../../stores/ardupilot-sitl-store';
import { useSettingsStore } from '../../../stores/settings-store';
import { getVehicleClass, VEHICLE_CAPABILITIES, encodePx4CustomMode } from '../../../../shared/telemetry-types';
import { executeTakeoff, presentTakeoff } from '../../panels/takeoff-strategies';
import { DraftNumberInput } from '../../../hooks/useNumericDraft';
import {
  altitudeValueFromMeters,
  toMetersFromAltitudeUnit,
  formatAltitudeFromMeters,
  UNIT_LABELS,
} from '../../../../shared/user-units.js';
import {
  FLIGHT_MODES,
  PX4_FLIGHT_MODES,
  GROUP_LABEL,
  GROUP_ORDER,
  MISSION_MODES,
  modeMetaFor,
} from '../../../../shared/flight-mode-meta';
import { useModeRequest } from '../../../hooks/useModeRequest';
import { getModeCategory } from '../tactical-icon-pool';
import { GAUGE_COLORS } from './RoundGauge';
import { useInDock } from './dock-context';
import { useVehicleClass } from '../../../hooks/useVehicleClass';

const PICKER_WIDTH = 188;

// Same rule as the other instruments (see registry useLinkUp): fleet/swarm
// links never set connectionState.isConnected.
function useInstrumentLinkUp(): boolean {
  const isConnected = useConnectionStore((s) => s.connectionState.isConnected);
  const fleetVehicleCount = useActiveVehicleStore((s) => Object.keys(s.knownVehicles).length);
  return isConnected || fleetVehicleCount > 0;
}

function categoryColor(modeName: string): string {
  const category = getModeCategory(modeName);
  return category === 'emergency' ? GAUGE_COLORS.red
    : category === 'auto' ? GAUGE_COLORS.green
    : category === 'assisted' ? GAUGE_COLORS.amber
    : GAUGE_COLORS.text;
}

/** Mobile-parity layouts, not sizes: compact keeps the flight-critical trio
 * (arm/mode/abort) in one row, bar just arm and mode. */
export type FlightControlVariant = 'full' | 'compact' | 'bar';

export function FlightControlInstrument({ variant = 'full' }: { variant?: FlightControlVariant } = {}): JSX.Element {
  const inDock = useInDock();
  const connected = useInstrumentLinkUp();
  const flight = useTelemetryStore((s) => s.flight);
  const connectionState = useConnectionStore((s) => s.connectionState);
  const missionDirty = useMissionStore((s) => s.isDirty);
  const missionCount = useMissionStore((s) => s.missionItems.length);
  const uploadMission = useMissionStore((s) => s.uploadMission);

  const vehicleClass = useVehicleClass();
  const sitlIsRunning = useArduPilotSitlStore((s) => s.isRunning);
  // PX4 speaks its own mode vocabulary (encoded custom_mode values); every
  // mode list/lookup below must use it or the instrument commands ArduPilot
  // mode numbers at a PX4 and gets refused.
  const isPx4 = connectionState.firmware === 'px4';
  const activeModes = isPx4 ? PX4_FLIGHT_MODES : FLIGHT_MODES[vehicleClass];
  const missionModes = isPx4
    ? { auto: encodePx4CustomMode(4, 4), pause: encodePx4CustomMode(4, 3), pauseLabel: 'Hold', abort: encodePx4CustomMode(4, 5), abortLabel: 'Return' }
    : MISSION_MODES[vehicleClass];
  const capabilities = VEHICLE_CAPABILITIES[vehicleClass];
  const isInAuto = flight.modeNum === missionModes.auto;
  // Paused = sitting in the mission's pause mode (Brake/Loiter/Hold) with a
  // mission loaded. RESUME (back to AUTO) continues from the current WP.
  const isPaused = flight.modeNum === missionModes.pause && missionCount > 0;
  const altitudeUnit = useSettingsStore((s) => s.unitPreferences.altitude);

  const sendMode = useCallback(async (modeNum: number): Promise<boolean> => {
    try {
      return await window.electronAPI.mavlinkSetMode(modeNum);
    } catch {
      return false;
    }
  }, []);
  const mode = useModeRequest(vehicleClass, flight.modeNum, sendMode, connectionState.firmware);

  // Two-step arm/disarm: first press arms the button for 3s, second sends.
  const [armPending, setArmPending] = useState(false);
  const [armBusy, setArmBusy] = useState(false);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (armTimer.current) clearTimeout(armTimer.current); }, []);
  // The armed heartbeat state changing is the completion signal.
  useEffect(() => { setArmBusy(false); setArmPending(false); }, [flight.armed]);
  useEffect(() => {
    if (!armBusy) return;
    const t = setTimeout(() => setArmBusy(false), 5000);
    return () => clearTimeout(t);
  }, [armBusy]);

  const onArmClick = async () => {
    if (armBusy || !connected) return;
    if (!armPending) {
      setArmPending(true);
      if (armTimer.current) clearTimeout(armTimer.current);
      armTimer.current = setTimeout(() => setArmPending(false), 3000);
      return;
    }
    if (armTimer.current) clearTimeout(armTimer.current);
    setArmPending(false);
    setArmBusy(true);
    try {
      const ok = await window.electronAPI.mavlinkArmDisarm(!flight.armed, false);
      if (!ok) setArmBusy(false);
    } catch {
      setArmBusy(false);
    }
  };

  // Takeoff: same per-vehicle strategies as the panel, inline altitude row.
  const [takeoffOpen, setTakeoffOpen] = useState(false);
  const [takeoffAltM, setTakeoffAltM] = useState(10);
  const [takeoffBusy, setTakeoffBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'info' | 'success' | 'error' } | null>(null);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (statusTimer.current) clearTimeout(statusTimer.current); }, []);
  const flashStatus = useCallback((s: { text: string; type: 'info' | 'success' | 'error' }) => {
    setStatusMsg(s);
    if (statusTimer.current) clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatusMsg(null), 4000);
  }, []);

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
    return check();
  }, []);

  const takeoffPresentation = presentTakeoff(vehicleClass, connectionState.firmware);
  const takeoffPrecision = altitudeUnit === 'km' ? 3 : altitudeUnit === 'm' ? 0 : 1;
  const takeoffAltDisplay = Number(altitudeValueFromMeters(takeoffAltM, altitudeUnit).toFixed(takeoffPrecision));

  const runTakeoff = async () => {
    setTakeoffOpen(false);
    setTakeoffBusy(true);
    const store = useTelemetryStore.getState;
    const result = await executeTakeoff({
      altitudeM: takeoffAltM,
      formatAltitude: (m) => formatAltitudeFromMeters(m, altitudeUnit),
      forceArm: false,
      vehicleClass,
      firmware: connectionState.firmware,
      capabilities,
      isSitl: connectionState.isSitl ?? sitlIsRunning,
      getFlight: () => store().flight,
      getGps: () => store().gps,
      getPosition: () => store().position,
      getParam: (id) => {
        const p = useParameterStore.getState().parameters.get(id);
        return p ? { value: p.value, type: p.type } : undefined;
      },
      api: {
        mavlinkSetMode: window.electronAPI.mavlinkSetMode,
        mavlinkArmDisarm: window.electronAPI.mavlinkArmDisarm,
        mavlinkTakeoff: window.electronAPI.mavlinkTakeoff,
        mavlinkVtolTakeoff: window.electronAPI.mavlinkVtolTakeoff,
        setParameter: window.electronAPI.setParameter,
        sitlRcStart: window.electronAPI.ardupilotSitlRcStart,
        sitlRcSend: window.electronAPI.ardupilotSitlRcSend,
      },
      setStatus: (s) => setStatusMsg(s),
      waitForState,
    });
    setTakeoffBusy(false);
    if (result.ok) {
      flashStatus({ text: `Taking off to ${formatAltitudeFromMeters(takeoffAltM, altitudeUnit)}...`, type: 'success' });
    } else {
      flashStatus({ text: result.reason, type: 'error' });
    }
  };

  // Mission start gate (same rule as the panel's Upload & Start dialog).
  const [startGate, setStartGate] = useState(false);
  const [uploading, setUploading] = useState(false);
  const startMission = useCallback(() => {
    mode.requestMode(missionModes.auto, { skipConfirm: true });
  }, [mode, missionModes.auto]);
  const onStart = () => {
    if (missionDirty) setStartGate(true);
    else startMission();
  };
  const onUploadAndStart = async () => {
    setUploading(true);
    const ok = await uploadMission();
    setUploading(false);
    if (ok) {
      setStartGate(false);
      startMission();
    }
  };

  // Mode picker popover.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerPos, setPickerPos] = useState<
    { top?: number; bottom?: number; left: number; maxHeight: number } | null
  >(null);
  const pillRef = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (!pickerOpen) { setPickerPos(null); return; }
    const r = pillRef.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - PICKER_WIDTH - 8));
    const spaceBelow = window.innerHeight - r.bottom - 16;
    const spaceAbove = r.top - 16;
    // Open toward the roomier side; the instrument usually sits near an edge.
    if (spaceBelow >= 220 || spaceBelow >= spaceAbove) {
      setPickerPos({ top: r.bottom + 6, left, maxHeight: Math.max(160, spaceBelow) });
    } else {
      // Bottom-anchored when opening up, or a short popup strands at screen top.
      setPickerPos({
        bottom: window.innerHeight - r.top + 6,
        left,
        maxHeight: Math.max(160, spaceAbove),
      });
    }
  }, [pickerOpen]);

  const pendingMeta = mode.pendingCommit != null ? modeMetaFor(vehicleClass, mode.pendingCommit, connectionState.firmware) : undefined;
  const requestedMeta = mode.requestedMode != null ? modeMetaFor(vehicleClass, mode.requestedMode, connectionState.firmware) : undefined;

  const modeName = (flight.mode || 'Unknown').toUpperCase();
  const modeColor = categoryColor(flight.mode);

  const btnBase = 'rounded text-[11px] font-semibold leading-none px-2.5 py-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap';

  const armStyle = armPending
    ? { background: GAUGE_COLORS.red, color: '#fff', border: `1px solid ${GAUGE_COLORS.red}` }
    : flight.armed
      ? { color: GAUGE_COLORS.red, background: 'rgba(248,113,113,0.14)', border: '1px solid rgba(248,113,113,0.5)' }
      : { color: GAUGE_COLORS.green, background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.5)' };

  const inlineRow = (children: JSX.Element) => (
    <div
      className="mt-1.5 flex items-center gap-1.5 rounded px-2 py-1.5"
      style={{ border: `1px solid ${GAUGE_COLORS.bezelEdge}`, background: 'rgba(245,158,11,0.10)' }}
    >
      {children}
    </div>
  );

  return (
    <div
      className={`select-none ${variant === 'full' ? 'px-3 pt-1.5 pb-2 min-w-[248px]' : variant === 'compact' ? 'p-2 min-w-[218px]' : 'p-2 min-w-[176px]'} ${inDock ? '' : 'rounded-lg shadow-xl'}`}
      style={{
        ...(inDock ? {} : { background: GAUGE_COLORS.face, border: `1.5px solid ${GAUGE_COLORS.bezelEdge}` }),
        color: GAUGE_COLORS.text,
      }}
    >
      {variant === 'full' && <div className="flex items-center">
        <span className="text-[9px] font-semibold tracking-[0.14em] leading-none text-[var(--gauge-text-dim)]">FLIGHT CONTROL</span>
        <span
          className="ml-auto text-[8px] font-semibold tracking-wider px-1.5 py-[3px] rounded-full leading-none"
          style={
            connected && flight.armed
              ? { color: GAUGE_COLORS.red, background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.4)' }
              : { color: GAUGE_COLORS.textDim, border: `1px solid ${GAUGE_COLORS.bezelEdge}` }
          }
        >
          {!connected ? 'NO LINK' : flight.armed ? 'ARMED' : 'DISARMED'}
        </span>
      </div>}

      <div className={(variant === 'full' ? 'mt-1.5 ' : '') + 'flex items-stretch gap-1.5'}>
        <button
          type="button"
          onClick={onArmClick}
          disabled={!connected || armBusy}
          data-tip={armPending ? 'Press again to confirm' : flight.armed ? 'Disarm motors' : 'Arm motors'}
          className={btnBase}
          style={armStyle}
        >
          {armBusy ? '...' : armPending ? 'CONFIRM' : flight.armed ? 'DISARM' : 'ARM'}
        </button>
        <button
          ref={pillRef}
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          disabled={!connected}
          data-tip="Change flight mode"
          className={btnBase + ' flex-1 flex items-center gap-1.5 min-w-0'}
          style={{ border: `1px solid ${GAUGE_COLORS.bezelEdge}`, color: GAUGE_COLORS.text }}
        >
          <span className="w-1 self-stretch rounded-full shrink-0" style={{ background: connected ? modeColor : GAUGE_COLORS.tickMinor }} />
          {mode.phase === 'requesting' ? (
            <span className="truncate" style={{ color: GAUGE_COLORS.amber }}>
              {(requestedMeta?.name ?? '...').toUpperCase()}...
            </span>
          ) : mode.phase === 'rejected' ? (
            <span className="truncate" style={{ color: GAUGE_COLORS.red }}>{mode.rejectLabel.toUpperCase()}</span>
          ) : (
            <span className="truncate" style={{ color: connected ? modeColor : GAUGE_COLORS.text }}>
              {connected ? modeName : '--'}
            </span>
          )}
          <svg className="w-2.5 h-2.5 ml-auto shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {variant === 'compact' && (
          <button
            type="button"
            onClick={() => mode.requestMode(missionModes.abort)}
            disabled={!connected}
            data-tip={`Abort to ${missionModes.abortLabel}`}
            className={btnBase}
            style={{ color: GAUGE_COLORS.red, border: '1px solid rgba(248,113,113,0.5)' }}
          >
            {missionModes.abortLabel.toUpperCase()}
          </button>
        )}
      </div>

      {variant === 'full' && <div className="mt-1.5 flex items-stretch gap-1.5">
        {capabilities.takeoff.supported && (
          <button
            type="button"
            onClick={() => setTakeoffOpen((v) => !v)}
            disabled={!connected || takeoffBusy}
            data-tip={takeoffOpen ? 'Cancel takeoff' : takeoffPresentation.buttonHint}
            className={btnBase}
            style={{
              color: GAUGE_COLORS.green,
              border: '1px solid rgba(52,211,153,0.5)',
              background: takeoffOpen ? 'rgba(52,211,153,0.18)' : undefined,
            }}
          >
            {takeoffBusy ? '...' : 'TAKEOFF'}
          </button>
        )}
        {takeoffOpen ? (
          // Takeoff arming REPLACES Start/RTL in-place: the altitude + Go take
          // over the row so Start can't be misclicked while arming a takeoff.
          <>
            <DraftNumberInput
              value={takeoffAltDisplay}
              min={Number(altitudeValueFromMeters(1, altitudeUnit).toFixed(takeoffPrecision))}
              max={Number(altitudeValueFromMeters(100, altitudeUnit).toFixed(takeoffPrecision))}
              step={altitudeUnit === 'km' ? 0.001 : 1}
              onCommit={(v) => setTakeoffAltM(toMetersFromAltitudeUnit(v, altitudeUnit))}
              aria-label={takeoffPresentation.dialogPrompt}
              data-tip={takeoffPresentation.dialogPrompt}
              className="flex-1 min-w-0 w-14 px-1.5 text-[11px] rounded bg-surface-input border border-default text-content focus:outline-none focus:border-blue-500 tabular-nums"
            />
            <span className="self-center text-[10px] text-[var(--gauge-text-dim)]">{UNIT_LABELS.altitude[altitudeUnit]}</span>
            <button
              type="button"
              onClick={runTakeoff}
              disabled={takeoffBusy}
              data-tip={`${takeoffPresentation.dialogPrompt}: ${formatAltitudeFromMeters(takeoffAltM, altitudeUnit)}`}
              className={btnBase + ' flex-1 bg-blue-600 text-white hover:bg-blue-500'}
            >
              {takeoffBusy ? '...' : 'GO'}
            </button>
          </>
        ) : isInAuto ? (
          <>
            <button
              type="button"
              onClick={() => mode.requestMode(missionModes.pause, { skipConfirm: true })}
              disabled={!connected}
              data-tip={`Pause mission (${missionModes.pauseLabel})`}
              className={btnBase + ' flex-1'}
              style={{ color: GAUGE_COLORS.amber, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.5)' }}
            >
              PAUSE
            </button>
            <button
              type="button"
              onClick={() => mode.requestMode(missionModes.abort)}
              disabled={!connected}
              data-tip={`Abort to ${missionModes.abortLabel}`}
              className={btnBase}
              style={{ color: GAUGE_COLORS.red, border: '1px solid rgba(248,113,113,0.5)' }}
            >
              {missionModes.abortLabel.toUpperCase()}
            </button>
          </>
        ) : isPaused ? (
          <>
            <button
              type="button"
              onClick={startMission}
              disabled={!connected}
              data-tip="Resume mission (back to Auto)"
              className={btnBase + ' flex-1 bg-blue-600 text-white hover:bg-blue-500'}
            >
              RESUME
            </button>
            <button
              type="button"
              onClick={() => mode.requestMode(missionModes.abort)}
              disabled={!connected}
              data-tip={`Abort to ${missionModes.abortLabel}`}
              className={btnBase}
              style={{ color: GAUGE_COLORS.red, border: '1px solid rgba(248,113,113,0.5)' }}
            >
              {missionModes.abortLabel.toUpperCase()}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onStart}
              disabled={!connected || missionCount === 0}
              data-tip={
                missionCount === 0 ? 'No mission loaded'
                  : missionDirty ? 'Mission not uploaded to the vehicle yet'
                  : `Start mission (${missionCount} wp)`
              }
              className={btnBase + ' flex-1 bg-blue-600 text-white hover:bg-blue-500'}
            >
              START{missionDirty && missionCount > 0 ? ' !' : ''}
            </button>
            <button
              type="button"
              onClick={() => mode.requestMode(missionModes.abort)}
              disabled={!connected}
              data-tip={`Abort to ${missionModes.abortLabel}`}
              className={btnBase}
              style={{ color: GAUGE_COLORS.red, border: '1px solid rgba(248,113,113,0.5)' }}
            >
              {missionModes.abortLabel.toUpperCase()}
            </button>
          </>
        )}
      </div>}

      {statusMsg && (
        <div
          className="mt-1.5 text-[10px] leading-tight"
          style={{
            color: statusMsg.type === 'error' ? GAUGE_COLORS.red
              : statusMsg.type === 'success' ? GAUGE_COLORS.green
              : GAUGE_COLORS.textDim,
          }}
        >
          {statusMsg.text}
        </div>
      )}

      {mode.pendingCommit != null && inlineRow(
        <>
          <span className="text-[10px] leading-none flex-1 min-w-0 truncate">
            Engage {pendingMeta?.name ?? 'mode'}?
          </span>
          <button type="button" onClick={mode.confirmCommit} className="text-[10px] font-semibold px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-500">
            Engage
          </button>
          <button type="button" onClick={mode.cancelCommit} className="text-[10px] px-2 py-1 rounded text-[var(--gauge-text-dim)] hover:text-[var(--gauge-text)]">
            Cancel
          </button>
        </>,
      )}

      {startGate && inlineRow(
        <>
          <span className="text-[10px] leading-none flex-1 min-w-0" style={{ color: GAUGE_COLORS.amber }}>
            Mission not on vehicle
          </span>
          <button
            type="button"
            onClick={onUploadAndStart}
            disabled={uploading}
            className="text-[10px] font-semibold px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 whitespace-nowrap"
          >
            {uploading ? 'Uploading...' : 'Upload & Start'}
          </button>
          <button
            type="button"
            onClick={() => { setStartGate(false); startMission(); }}
            disabled={uploading}
            className="text-[10px] px-2 py-1 rounded whitespace-nowrap"
            style={{ color: GAUGE_COLORS.amber }}
          >
            Start anyway
          </button>
          <button type="button" onClick={() => setStartGate(false)} className="text-[10px] px-1.5 py-1 rounded text-[var(--gauge-text-dim)] hover:text-[var(--gauge-text)]">
            ✕
          </button>
        </>,
      )}

      {pickerOpen && pickerPos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[9998]" onClick={() => setPickerOpen(false)} />
            <div
              className="fixed z-[9999] rounded-lg bg-surface-solid border border-subtle shadow-xl overflow-y-auto"
              style={{
                top: pickerPos.top,
                bottom: pickerPos.bottom,
                left: pickerPos.left,
                width: PICKER_WIDTH,
                maxHeight: pickerPos.maxHeight,
              }}
            >
              {GROUP_ORDER.map((group) => {
                const modes = activeModes.filter((m) => m.group === group);
                if (modes.length === 0) return null;
                return (
                  <div key={group}>
                    <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-content-tertiary">{GROUP_LABEL[group]}</div>
                    <div className="px-1 pb-1 space-y-0.5">
                      {modes.map((m) => {
                        const active = flight.modeNum === m.modeNum;
                        return (
                          <button
                            key={m.modeNum}
                            type="button"
                            onClick={() => { setPickerOpen(false); mode.requestMode(m.modeNum); }}
                            className={
                              'w-full flex items-center gap-2 text-left px-2.5 py-1 rounded text-xs transition-colors ' +
                              (active ? 'bg-blue-600 text-white' : 'text-content-secondary hover:bg-surface-raised hover:text-content')
                            }
                          >
                            <span
                              className="w-1 h-3 rounded-full shrink-0"
                              style={{ background: active ? '#fff' : categoryColor(m.name) }}
                            />
                            <span className="truncate">{m.name}</span>
                            {m.commit && !active && <span className="ml-auto text-[9px] text-content-tertiary">confirm</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
