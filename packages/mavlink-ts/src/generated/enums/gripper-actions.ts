/**
 * Gripper actions.
 */
export enum GripperActions {
  /** Gripper release cargo. */
  GRIPPER_ACTION_RELEASE = 0,
  /** Gripper grab onto cargo. */
  GRIPPER_ACTION_GRAB = 1,
}

/** @deprecated Use GripperActions instead */
export const GRIPPER_ACTIONS = GripperActions;