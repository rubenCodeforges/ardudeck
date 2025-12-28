/**
 * Special ACK block numbers control activation of dataflash log streaming.
 */
export enum MavRemoteLogDataBlockCommands {
  /** UAV to stop sending DataFlash blocks. */
  MAV_REMOTE_LOG_DATA_BLOCK_STOP = 2147483645,
  /** UAV to start sending DataFlash blocks. */
  MAV_REMOTE_LOG_DATA_BLOCK_START = 2147483646,
}

/** @deprecated Use MavRemoteLogDataBlockCommands instead */
export const MAV_REMOTE_LOG_DATA_BLOCK_COMMANDS = MavRemoteLogDataBlockCommands;