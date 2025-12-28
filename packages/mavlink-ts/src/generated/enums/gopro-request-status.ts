export enum GoproRequestStatus {
  /** The write message with ID indicated succeeded. */
  GOPRO_REQUEST_SUCCESS = 0,
  /** The write message with ID indicated failed. */
  GOPRO_REQUEST_FAILED = 1,
}

/** @deprecated Use GoproRequestStatus instead */
export const GOPRO_REQUEST_STATUS = GoproRequestStatus;