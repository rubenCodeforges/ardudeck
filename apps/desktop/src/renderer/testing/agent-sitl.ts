import { useArduPilotSitlStore, ARDUPILOT_MODELS } from '../stores/ardupilot-sitl-store';
import { useConnectionStore } from '../stores/connection-store';
import type { ArduPilotVehicleType } from '../../shared/ipc-channels';

const VEHICLES: ArduPilotVehicleType[] = ['copter', 'plane', 'rover', 'sub'];

function status() {
  const s = useArduPilotSitlStore.getState();
  const c = useConnectionStore.getState().connectionState;
  return {
    running: s.isRunning,
    starting: s.isStarting,
    vehicleType: s.vehicleType,
    model: s.model,
    connected: c.isConnected,
    models: ARDUPILOT_MODELS,
    lastOutput: s.output.slice(-15),
  };
}

export async function agentSitlStatus() {
  return status();
}

/** Starts ArduPilot SITL the same way the SITL tab does, then connects over TCP 5760 like the connection panel. */
export async function agentSitlStart(params: { vehicleType?: string; model?: string; wipe?: boolean; speedup?: number; connect?: boolean }) {
  const store = useArduPilotSitlStore.getState();
  if (store.isRunning || store.isStarting) throw new Error('SITL is already running; stop it first');
  if (useConnectionStore.getState().connectionState.isConnected) throw new Error('A vehicle is connected; disconnect it first');

  if (params.vehicleType) {
    if (!VEHICLES.includes(params.vehicleType as ArduPilotVehicleType)) throw new Error(`vehicleType must be one of ${VEHICLES.join(', ')}`);
    store.setVehicleType(params.vehicleType as ArduPilotVehicleType);
  }
  if (params.model) {
    const vt = useArduPilotSitlStore.getState().vehicleType;
    if (!ARDUPILOT_MODELS[vt].some((m) => m.value === params.model)) {
      throw new Error(`Unknown model "${params.model}" for ${vt}: ${ARDUPILOT_MODELS[vt].map((m) => m.value).join(', ')}`);
    }
    store.setModel(params.model);
  }
  if (params.wipe !== undefined) store.setWipeOnStart(params.wipe);
  if (params.speedup !== undefined) store.setSpeedup(params.speedup);

  await useArduPilotSitlStore.getState().checkBinary();
  if (!useArduPilotSitlStore.getState().binaryInfo?.exists && !(await useArduPilotSitlStore.getState().download())) {
    return { started: false, ...status() };
  }
  const ok = await useArduPilotSitlStore.getState().start();
  if (!ok) return { started: false, ...status() };
  if (params.connect === false) return { started: true, ...status() };

  for (let attempt = 0; attempt < 15; attempt++) {
    await new Promise((r) => setTimeout(r, 1500));
    if (!useArduPilotSitlStore.getState().isRunning) return { started: false, ...status() };
    if (useConnectionStore.getState().connectionState.isConnected) break;
    if (await useConnectionStore.getState().connect({ type: 'tcp', host: '127.0.0.1', tcpPort: 5760, protocol: 'mavlink' })) break;
  }
  return { started: true, ...status() };
}

export async function agentSitlStop() {
  if (useConnectionStore.getState().connectionState.isConnected) await useConnectionStore.getState().disconnect();
  const ok = await useArduPilotSitlStore.getState().stop();
  return { stopped: ok, ...status() };
}
