export enum GoproHeartbeatStatus {
  /** No GoPro connected. */
  GOPRO_HEARTBEAT_STATUS_DISCONNECTED = 0,
  /** The detected GoPro is not HeroBus compatible. */
  GOPRO_HEARTBEAT_STATUS_INCOMPATIBLE = 1,
  /** A HeroBus compatible GoPro is connected. */
  GOPRO_HEARTBEAT_STATUS_CONNECTED = 2,
  /** An unrecoverable error was encountered with the connected GoPro, it may require a power cycle. */
  GOPRO_HEARTBEAT_STATUS_ERROR = 3,
}

/** @deprecated Use GoproHeartbeatStatus instead */
export const GOPRO_HEARTBEAT_STATUS = GoproHeartbeatStatus;