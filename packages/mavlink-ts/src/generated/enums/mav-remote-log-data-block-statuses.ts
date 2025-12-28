/**
 * Possible remote log data block statuses.
 */
export enum MavRemoteLogDataBlockStatuses {
  /** This block has NOT been received. */
  MAV_REMOTE_LOG_DATA_BLOCK_NACK = 0,
  /** This block has been received. */
  MAV_REMOTE_LOG_DATA_BLOCK_ACK = 1,
}

/** @deprecated Use MavRemoteLogDataBlockStatuses instead */
export const MAV_REMOTE_LOG_DATA_BLOCK_STATUSES = MavRemoteLogDataBlockStatuses;