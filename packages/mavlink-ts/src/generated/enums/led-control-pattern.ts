export enum LedControlPattern {
  /** LED patterns off (return control to regular vehicle control). */
  LED_CONTROL_PATTERN_OFF = 0,
  /** LEDs show pattern during firmware update. */
  LED_CONTROL_PATTERN_FIRMWAREUPDATE = 1,
  /** Custom Pattern using custom bytes fields. */
  LED_CONTROL_PATTERN_CUSTOM = 255,
}

/** @deprecated Use LedControlPattern instead */
export const LED_CONTROL_PATTERN = LedControlPattern;