/**
 * IPC subscription setup for detached (pop-out) windows.
 *
 * Each detached BrowserWindow runs its own React + Zustand context, so it
 * needs to populate its stores from the same IPC broadcasts the main window
 * uses. The set of subscriptions here is the minimum required by every
 * detachable component (telemetry, status, connection). Anything more
 * specialized (params, mission, fence, …) is the component's responsibility
 * if it ever becomes pop-out-relevant.
 */

import { useEffect } from 'react';
import { useConnectionStore } from '../stores/connection-store';
import { useTelemetryStore } from '../stores/telemetry-store';
import { useMessagesStore } from '../stores/messages-store';
import { useMissionStore } from '../stores/mission-store';
import { useFenceStore } from '../stores/fence-store';
import { useActiveVehicleStore } from '../stores/active-vehicle-store';
import { useFleetTelemetryStore } from '../stores/fleet-telemetry-store';
import { useOrchestrationStore } from '../stores/orchestration-store';
import { applyActiveSelectionFromBroadcast } from '../hooks/useFleet';
import { startInspector } from '../stores/inspector-store';

export function useDetachedSubscriptions(): void {
  const setConnectionState = useConnectionStore((s) => s.setConnectionState);
  const updateAttitude = useTelemetryStore((s) => s.updateAttitude);
  const updatePosition = useTelemetryStore((s) => s.updatePosition);
  const updateGps = useTelemetryStore((s) => s.updateGps);
  const updateBattery = useTelemetryStore((s) => s.updateBattery);
  const updateVfrHud = useTelemetryStore((s) => s.updateVfrHud);
  const updateFlight = useTelemetryStore((s) => s.updateFlight);
  const updateBatch = useTelemetryStore((s) => s.updateBatch);
  const addStatusMessage = useMessagesStore((s) => s.addMessage);
  const applyMissionMirror = useMissionStore((s) => s.applyMissionMirror);
  const setCurrentSeq = useMissionStore((s) => s.setCurrentSeq);
  const setFenceItems = useFenceStore((s) => s.setFenceItems);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    // Start the inspector pipeline (idempotent — safe to call from every window).
    startInspector();

    // Hydrate one-shot state this window may have missed by opening after connect.
    // (CONNECTION_STATE is event-driven; a late window never sees the initial one.)
    void api.getConnectionState?.().then((state) => { if (state) setConnectionState(state); }).catch(() => {});

    // Hydrate the fleet roster so pop-outs know every vehicle, and adopt the
    // active selection the roster reports — the change broadcast only covers
    // future changes, so a window opening after a selection (e.g. a popped-out
    // Vision panel) would otherwise never learn the current active vehicle.
    void api.listVehicles?.().then((v) => useActiveVehicleStore.getState().hydrate(v)).catch(() => {});

    const cleanups: Array<() => void> = [];

    cleanups.push(
      api.onVehicleDiscovered?.((vehicle) => {
        useActiveVehicleStore.getState().recordDiscovered(vehicle);
      }) ?? (() => {}),
    );
    cleanups.push(
      api.onVehicleLost?.((vehicleKey) => {
        useActiveVehicleStore.getState().recordLost(vehicleKey);
        useFleetTelemetryStore.getState().removeVehicle(vehicleKey);
      }) ?? (() => {}),
    );
    cleanups.push(
      api.onActiveVehicleChanged?.((payload) => {
        applyActiveSelectionFromBroadcast(payload.transportId, payload.vehicleKey ?? null);
      }) ?? (() => {}),
    );
    // Orchestration status (engine welcome / capabilities / roster) so the 3D
    // world's fleet ops - synchronized takeoff + formations - work in the pop-out.
    cleanups.push(
      api.onOrchestrationStatus?.((status) => {
        useOrchestrationStore.getState().applyStatus(status);
      }) ?? (() => {}),
    );

    cleanups.push(
      api.onConnectionState((state) => {
        setConnectionState(state);
      }),
    );
    cleanups.push(
      api.onTelemetryBatch((batch) => {
        // Accumulate per-vehicle telemetry so multi-vehicle pop-outs render the
        // whole fleet; mirror only the active vehicle into the flat store the
        // single-vehicle views read (matches App.tsx routing).
        const vehicleKey = batch.__vehicleKey ?? '__primary__';
        useFleetTelemetryStore.getState().applyBatch(vehicleKey, batch);
        const activeKey = useActiveVehicleStore.getState().activeVehicleKey;
        if (vehicleKey === '__primary__' || activeKey === null || vehicleKey === activeKey) {
          updateBatch(batch);
        }
      }),
    );
    cleanups.push(
      api.onTelemetryUpdate((update) => {
        switch (update.type) {
          case 'attitude': updateAttitude(update.data); break;
          case 'position': updatePosition(update.data); break;
          case 'gps': updateGps(update.data); break;
          case 'battery': updateBattery(update.data); break;
          case 'vfrHud': updateVfrHud(update.data); break;
          case 'flight': updateFlight(update.data); break;
        }
      }),
    );
    cleanups.push(
      api.onStatusText((msg) => {
        addStatusMessage(msg.severity, msg.severityLabel as never, msg.text);
      }),
    );
    // Mission mirror: the primary window is the source of truth for the AUTHORED
    // mission (survey / file / hand-placed / FC download alike). Pull the cached
    // snapshot on mount (this window may have opened long after the mission was
    // built) and apply every live push. This is what lets a popped-out Map / 3D
    // world show the mission instead of an empty store.
    void api.requestMissionMirror?.().then((snap) => { if (snap) applyMissionMirror(snap); }).catch(() => {});
    cleanups.push(api.onMissionMirror?.((snap) => applyMissionMirror(snap)) ?? (() => {}));
    // Live active-waypoint index still streams directly to every window.
    cleanups.push(api.onMissionCurrent((seq) => setCurrentSeq(seq)));
    cleanups.push(api.onFenceComplete((items) => setFenceItems(items)));

    return () => {
      for (const fn of cleanups) fn();
    };
  }, [
    setConnectionState,
    updateAttitude,
    updatePosition,
    updateGps,
    updateBattery,
    updateVfrHud,
    updateFlight,
    updateBatch,
    addStatusMessage,
    applyMissionMirror,
    setCurrentSeq,
    setFenceItems,
  ]);
}
