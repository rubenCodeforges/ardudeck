/**
 * Winch actions.
 */
export enum WinchActions {
  /** Allow motor to freewheel. */
  WINCH_RELAXED = 0,
  /** Wind or unwind specified length of line, optionally using specified rate. */
  WINCH_RELATIVE_LENGTH_CONTROL = 1,
  /** Wind or unwind line at specified rate. */
  WINCH_RATE_CONTROL = 2,
  /** Perform the locking sequence to relieve motor while in the fully retracted position. Only action and instance command parameters are used, others are ignored. */
  WINCH_LOCK = 3,
  /** Sequence of drop, slow down, touch down, reel up, lock. Only action and instance command parameters are used, others are ignored. */
  WINCH_DELIVER = 4,
  /** Engage motor and hold current position. Only action and instance command parameters are used, others are ignored. */
  WINCH_HOLD = 5,
  /** Return the reel to the fully retracted position. Only action and instance command parameters are used, others are ignored. */
  WINCH_RETRACT = 6,
  /** Load the reel with line. The winch will calculate the total loaded length and stop when the tension exceeds a threshold. Only action and instance command parameters are used, others are ignored. */
  WINCH_LOAD_LINE = 7,
  /** Spool out the entire length of the line. Only action and instance command parameters are used, others are ignored. */
  WINCH_ABANDON_LINE = 8,
}

/** @deprecated Use WinchActions instead */
export const WINCH_ACTIONS = WinchActions;