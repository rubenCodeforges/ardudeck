import type { ParameterWithMeta } from '../../shared/parameter-types';

export interface DroneCanPort {
  /** 1-based CAN port, as in CAN_Px_* and MAV_CMD_CAN_FORWARD. */
  port: number;
  driver: number;
  /** The flight controller's own DroneCAN node id on this port's driver. */
  fcNodeId: number | undefined;
}

export function droneCanPorts(parameters: Map<string, Pick<ParameterWithMeta, 'value'>>): DroneCanPort[] {
  const out: DroneCanPort[] = [];
  for (let port = 1; port <= 3; port++) {
    const driver = parameters.get(`CAN_P${port}_DRIVER`)?.value;
    if (!driver) continue;
    if (parameters.get(`CAN_D${driver}_PROTOCOL`)?.value !== 1) continue;
    out.push({ port, driver, fcNodeId: parameters.get(`CAN_D${driver}_UC_NODE`)?.value });
  }
  return out;
}
