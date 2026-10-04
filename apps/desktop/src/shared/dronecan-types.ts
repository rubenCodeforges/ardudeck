export type DroneCanForwardStatus = 'idle' | 'starting' | 'active' | 'unsupported' | 'failed' | 'noResponse';

export interface DroneCanNode {
  nodeId: number;
  health: number;
  mode: number;
  subMode: number;
  vendorStatus: number;
  uptimeSec: number;
  lastSeenMs: number;
  online: boolean;
  name?: string;
  softwareVersion?: string;
  hardwareVersion?: string;
  uniqueId?: string;
}

export type DroneCanParamValue =
  | { type: 'empty' }
  | { type: 'integer'; value: number }
  | { type: 'real'; value: number }
  | { type: 'boolean'; value: boolean }
  | { type: 'string'; value: string };

export interface DroneCanParam {
  index: number;
  name: string;
  value: DroneCanParamValue;
  defaultValue: DroneCanParamValue;
  min?: number;
  max?: number;
}

export interface DroneCanState {
  status: DroneCanForwardStatus;
  /** 1-based CAN port, as in CAN_Px_* parameters. */
  bus: number | null;
  framesReceived: number;
  nodes: DroneCanNode[];
}

export const DRONECAN_HEALTH = ['ok', 'warning', 'error', 'critical'] as const;
export const DRONECAN_MODE: Record<number, string> = {
  0: 'operational', 1: 'initialization', 2: 'maintenance', 3: 'softwareUpdate', 7: 'offline',
};

export type DroneCanResult<T> = { success: true; data: T } | { success: false; error: string };
