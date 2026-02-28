/**
 * Parameter Version Control / History Types
 *
 * Used for automatic parameter checkpointing when writing to flash.
 * Board-specific history keyed by hardware UID.
 */

export interface ParamChange {
  paramId: string;
  oldValue: number;
  newValue: number;
}

export interface ParamCheckpoint {
  id: string;
  timestamp: number;
  changes: ParamChange[];
  label?: string;
  vehicleType?: string; // e.g. "ArduCopter", "ArduPlane", "INAV", "BTFL"
}

export interface BoardParamHistory {
  boardUid: string;
  boardName: string;
  checkpoints: ParamCheckpoint[];
}
