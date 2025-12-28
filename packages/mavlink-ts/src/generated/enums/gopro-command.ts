export enum GoproCommand {
  /** (Get/Set). */
  GOPRO_COMMAND_POWER = 0,
  /** (Get/Set). */
  GOPRO_COMMAND_CAPTURE_MODE = 1,
  /** (___/Set). */
  GOPRO_COMMAND_SHUTTER = 2,
  /** (Get/___). */
  GOPRO_COMMAND_BATTERY = 3,
  /** (Get/___). */
  GOPRO_COMMAND_MODEL = 4,
  /** (Get/Set). */
  GOPRO_COMMAND_VIDEO_SETTINGS = 5,
  /** (Get/Set). */
  GOPRO_COMMAND_LOW_LIGHT = 6,
  /** (Get/Set). */
  GOPRO_COMMAND_PHOTO_RESOLUTION = 7,
  /** (Get/Set). */
  GOPRO_COMMAND_PHOTO_BURST_RATE = 8,
  /** (Get/Set). */
  GOPRO_COMMAND_PROTUNE = 9,
  /** (Get/Set) Hero 3+ Only. */
  GOPRO_COMMAND_PROTUNE_WHITE_BALANCE = 10,
  /** (Get/Set) Hero 3+ Only. */
  GOPRO_COMMAND_PROTUNE_COLOUR = 11,
  /** (Get/Set) Hero 3+ Only. */
  GOPRO_COMMAND_PROTUNE_GAIN = 12,
  /** (Get/Set) Hero 3+ Only. */
  GOPRO_COMMAND_PROTUNE_SHARPNESS = 13,
  /** (Get/Set) Hero 3+ Only. */
  GOPRO_COMMAND_PROTUNE_EXPOSURE = 14,
  /** (Get/Set). */
  GOPRO_COMMAND_TIME = 15,
  /** (Get/Set). */
  GOPRO_COMMAND_CHARGING = 16,
}

/** @deprecated Use GoproCommand instead */
export const GOPRO_COMMAND = GoproCommand;