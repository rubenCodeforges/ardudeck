/**
 * Action required when performing CMD_PREFLIGHT_STORAGE
 */
export enum MavPreflightStorageAction {
  /** Read all parameters from storage */
  MAV_PFS_CMD_READ_ALL = 0,
  /** Write all parameters to storage */
  MAV_PFS_CMD_WRITE_ALL = 1,
  /** Clear all  parameters in storage */
  MAV_PFS_CMD_CLEAR_ALL = 2,
  /** Read specific parameters from storage */
  MAV_PFS_CMD_READ_SPECIFIC = 3,
  /** Write specific parameters to storage */
  MAV_PFS_CMD_WRITE_SPECIFIC = 4,
  /** Clear specific parameters in storage */
  MAV_PFS_CMD_CLEAR_SPECIFIC = 5,
  /** do nothing */
  MAV_PFS_CMD_DO_NOTHING = 6,
}

/** @deprecated Use MavPreflightStorageAction instead */
export const MAV_PREFLIGHT_STORAGE_ACTION = MavPreflightStorageAction;