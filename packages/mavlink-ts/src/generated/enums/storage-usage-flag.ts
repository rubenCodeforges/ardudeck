/**
 * Flags to indicate usage for a particular storage (see STORAGE_INFORMATION.storage_usage and MAV_CMD_SET_STORAGE_USAGE).
 */
export enum StorageUsageFlag {
  /** Always set to 1 (indicates STORAGE_INFORMATION.storage_usage is supported). */
  STORAGE_USAGE_FLAG_SET = 1,
  /** Storage for saving photos. */
  STORAGE_USAGE_FLAG_PHOTO = 2,
  /** Storage for saving videos. */
  STORAGE_USAGE_FLAG_VIDEO = 4,
  /** Storage for saving logs. */
  STORAGE_USAGE_FLAG_LOGS = 8,
}

/** @deprecated Use StorageUsageFlag instead */
export const STORAGE_USAGE_FLAG = StorageUsageFlag;