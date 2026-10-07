import type { CalibrationRecordIpc } from './calibration-quality';
import type { ProductionCalibrationType, QaReport } from './production-types';

export type BayPhase =
  | 'connecting'
  | 'identifying'
  | 'loading-params'
  | 'ready'
  | 'writing'
  | 'calibrating'
  | 'rebooting'
  | 'resetting'
  | 'flashing'
  | 'lost'
  | 'error';

export interface BayCalibrationState {
  type: ProductionCalibrationType;
  progress: number;
  statusText: string;
  /** 6-point: the pose the autopilot is waiting for (0 level .. 5 inverted). */
  currentPosition?: number;
  positionStatus?: boolean[];
  compassProgress?: number[];
  awaitingPosition: boolean;
}

export interface BayState {
  id: string;
  /** Serial port path, or tcp:host:port for a simulator bench. */
  port: string;
  phase: BayPhase;
  phaseDetail?: string;
  /** 0-100 while loading, writing or flashing. */
  progress?: number;
  /** Hardware identity; null when the board reports none (cannot be certified). */
  boardUid: string | null;
  sitl: boolean;
  boardId?: string;
  boardVersion?: number;
  firmware?: 'ardupilot' | 'px4';
  firmwareVersion?: string;
  vehicleType?: string;
  paramCount: number;
  paramTotal: number;
  sensors: { present: number; enabled: number; health: number } | null;
  calibration: BayCalibrationState | null;
  lastCalResult?: { type: ProductionCalibrationType; success: boolean; error?: string; rebootRequired?: boolean };
  records: CalibrationRecordIpc[];
  /** Last QA verdict the host computed for this bay. */
  qa?: QaReport;
  /** Model the operator assigned to this bay. */
  modelId?: string;
  lastStatusText?: string;
  error?: string;
  updatedAt: number;
}
