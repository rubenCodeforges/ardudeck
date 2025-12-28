/**
 * Generalized UAVCAN node mode
 */
export enum UavcanNodeMode {
  /** The node is performing its primary functions. */
  UAVCAN_NODE_MODE_OPERATIONAL = 0,
  /** The node is initializing; this mode is entered immediately after startup. */
  UAVCAN_NODE_MODE_INITIALIZATION = 1,
  /** The node is under maintenance. */
  UAVCAN_NODE_MODE_MAINTENANCE = 2,
  /** The node is in the process of updating its software. */
  UAVCAN_NODE_MODE_SOFTWARE_UPDATE = 3,
  /** The node is no longer available online. */
  UAVCAN_NODE_MODE_OFFLINE = 7,
}

/** @deprecated Use UavcanNodeMode instead */
export const UAVCAN_NODE_MODE = UavcanNodeMode;