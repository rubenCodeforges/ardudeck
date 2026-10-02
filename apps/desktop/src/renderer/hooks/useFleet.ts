/**
 * Fleet view-model: combines the registry's known vehicles (identity) with the
 * per-vehicle telemetry accumulator (live state) into a single list the fleet
 * strip and the multi-marker map render from.
 */

import { useActiveVehicleStore } from '../stores/active-vehicle-store';
import { t } from '../../shared/i18n/index.js';
import { useFleetTelemetryStore } from '../stores/fleet-telemetry-store';
import { useTelemetryStore } from '../stores/telemetry-store';
import { useConnectionStore } from '../stores/connection-store';
import { mavTypeToTacticalClass, type TacticalVehicleClass, type VehicleState } from '../components/map/tactical-icon-pool';

/**
 * Fleet-aware connection identity for status chrome. "Connected" is true whenever
 * the primary link is up OR a fleet exists, and the displayed identity follows the
 * ACTIVE/selected vehicle (not the idle primary) in multi-vehicle mode. Use this
 * anywhere a header/badge previously keyed off `connectionState.isConnected` /
 * `systemId`, so the UI stops reading "disconnected" with a live fleet.
 */
export function useActiveVehicleIdentity(): {
  connected: boolean;
  sysid: number | null;
  label: string | null;
  fleetCount: number;
} {
  const primaryConnected = useConnectionStore((s) => s.connectionState.isConnected);
  const primarySysid = useConnectionStore((s) => s.connectionState.systemId);
  const activeVehicleKey = useActiveVehicleStore((s) => s.activeVehicleKey);
  const knownVehicles = useActiveVehicleStore((s) => s.knownVehicles);
  const fleetCount = Object.keys(knownVehicles).length;
  const active = activeVehicleKey ? knownVehicles[activeVehicleKey] : undefined;

  if (active) return { connected: true, sysid: active.sysid, label: `SYS ${active.sysid}`, fleetCount };
  if (primaryConnected) {
    return { connected: true, sysid: primarySysid ?? null, label: primarySysid ? `SYS ${primarySysid}` : null, fleetCount };
  }
  if (fleetCount > 0) return { connected: true, sysid: null, label: t('hooks:useFleet.fleetCount', { count: fleetCount }), fleetCount };
  return { connected: false, sysid: null, label: null, fleetCount };
}

export interface FleetVehicle {
  key: string;
  transportId: string;
  sysid: number;
  compid: number;
  mavType: number;
  vehicleClass: TacticalVehicleClass;
  /** Short display label, e.g. "SYS 1". */
  label: string;
  mode: string;
  armed: boolean;
  /** Battery remaining percent (0-100), or null if unknown. */
  batteryPct: number | null;
  groundspeed: number;
  heading: number;
  altitudeAgl: number;
  /** Altitude above mean sea level (m), as the vehicle reports it. */
  altitudeMsl: number;
  /** [lat, lon] when a valid GPS fix exists, else null. */
  position: [number, number] | null;
  state: VehicleState;
  /** Wall-clock ms of the last telemetry/heartbeat applied, or null if none yet. */
  lastUpdate: number | null;
  isActive: boolean;
  isSelected: boolean;
}

/** Derive the tactical state (disarmed/armed/critical) from live telemetry. */
function deriveState(armed: boolean, batteryPct: number | null, gpsFix: number | undefined): VehicleState {
  if (armed && batteryPct !== null && batteryPct > 0 && batteryPct < 20) return 'critical';
  if (armed && (gpsFix ?? 0) < 2) return 'critical';
  if (armed) return 'armed';
  return 'disarmed';
}

export function useFleetVehicles(): FleetVehicle[] {
  const knownVehicles = useActiveVehicleStore((s) => s.knownVehicles);
  const activeVehicleKey = useActiveVehicleStore((s) => s.activeVehicleKey);
  const selectedVehicleKeys = useActiveVehicleStore((s) => s.selectedVehicleKeys);
  const byVehicle = useFleetTelemetryStore((s) => s.byVehicle);

  return Object.values(knownVehicles).map((v) => {
    const tel = byVehicle[v.key];
    const armed = tel?.flight?.armed ?? false;
    const batteryPct = tel?.battery ? tel.battery.remaining : null;
    const gpsFix = tel?.gps?.fixType;
    const hasFix = (gpsFix ?? 0) >= 2 && !!tel?.gps && tel.gps.lat !== 0 && tel.gps.lon !== 0;
    return {
      key: v.key,
      transportId: v.transportId,
      sysid: v.sysid,
      compid: v.compid,
      mavType: v.mavType,
      vehicleClass: mavTypeToTacticalClass(v.mavType),
      label: `SYS ${v.sysid}`,
      mode: tel?.flight?.mode ?? 'Unknown',
      armed,
      batteryPct,
      groundspeed: tel?.vfrHud?.groundspeed ?? 0,
      heading: tel?.vfrHud?.heading ?? 0,
      altitudeAgl: tel?.position?.relativeAlt ?? 0,
      altitudeMsl: tel?.position?.alt ?? 0,
      position: hasFix && tel?.gps ? [tel.gps.lat, tel.gps.lon] : null,
      state: deriveState(armed, batteryPct, gpsFix),
      lastUpdate: tel?.lastUpdate ?? null,
      isActive: v.key === activeVehicleKey,
      isSelected: selectedVehicleKeys.includes(v.key),
    } satisfies FleetVehicle;
  });
}

/**
 * Make a vehicle the active selection. Updates the renderer pointer (which gates
 * the flat telemetry store the dashboard reads), tells the main process so flight
 * commands retarget to it, and immediately re-seeds the flat store from the
 * vehicle's last-known telemetry so the panels switch instantly instead of showing
 * the previous vehicle's stale values until the next batch arrives.
 */
export function selectActiveVehicle(vehicleKey: string, transportId: string): void {
  const { activeVehicleKey, setActive } = useActiveVehicleStore.getState();
  if (activeVehicleKey === vehicleKey) return;

  setActive(transportId, vehicleKey);
  window.electronAPI?.setActiveVehicle?.({ transportId, vehicleKey });

  const snapshot = useFleetTelemetryStore.getState().byVehicle[vehicleKey];
  const telemetry = useTelemetryStore.getState();
  telemetry.reset();
  if (snapshot) telemetry.updateBatch(snapshot);
}

/**
 * Apply an active-vehicle selection that originated in ANOTHER window (the main
 * process broadcasts COMMS_ACTIVE_CHANGED on every change). Updates this window's
 * local pointer and reseeds the flat telemetry store, but does NOT echo the
 * selection back over IPC - the main process already has it, and re-sending would
 * loop. Idempotent: the window that initiated the change no-ops here.
 */
export function applyActiveSelectionFromBroadcast(transportId: string | null, vehicleKey: string | null): void {
  const { activeVehicleKey, setActive } = useActiveVehicleStore.getState();
  if (activeVehicleKey === vehicleKey) return;
  setActive(transportId, vehicleKey);
  const telemetry = useTelemetryStore.getState();
  telemetry.reset();
  if (vehicleKey) {
    const snapshot = useFleetTelemetryStore.getState().byVehicle[vehicleKey];
    if (snapshot) telemetry.updateBatch(snapshot);
  }
}

/**
 * Clear the active selection - the "nothing selected" state. The main-process command
 * target is cleared too (so a stray command has nowhere to go), the flat telemetry store is
 * reset, and the previously-active vehicle reverts to an ordinary fleet marker on the map.
 */
export function deselectActiveVehicle(): void {
  const { activeVehicleKey, setActive } = useActiveVehicleStore.getState();
  if (activeVehicleKey === null) return;
  setActive(null, null);
  window.electronAPI?.setActiveVehicle?.({ transportId: null, vehicleKey: null });
  useTelemetryStore.getState().reset();
}
