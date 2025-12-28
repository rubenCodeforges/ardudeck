/**
 * Generalized UAVCAN node health
 */
export enum UavcanNodeHealth {
  /** The node is functioning properly. */
  UAVCAN_NODE_HEALTH_OK = 0,
  /** A critical parameter went out of range or the node has encountered a minor failure. */
  UAVCAN_NODE_HEALTH_WARNING = 1,
  /** The node has encountered a major failure. */
  UAVCAN_NODE_HEALTH_ERROR = 2,
  /** The node has suffered a fatal malfunction. */
  UAVCAN_NODE_HEALTH_CRITICAL = 3,
}

/** @deprecated Use UavcanNodeHealth instead */
export const UAVCAN_NODE_HEALTH = UavcanNodeHealth;