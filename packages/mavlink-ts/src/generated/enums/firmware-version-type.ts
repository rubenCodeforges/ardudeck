/**
 * These values define the type of firmware release.  These values indicate the first version or release of this type.  For example the first alpha release would be 64, the second would be 65.
 */
export enum FirmwareVersionType {
  /** development release */
  FIRMWARE_VERSION_TYPE_DEV = 0,
  /** alpha release */
  FIRMWARE_VERSION_TYPE_ALPHA = 64,
  /** beta release */
  FIRMWARE_VERSION_TYPE_BETA = 128,
  /** release candidate */
  FIRMWARE_VERSION_TYPE_RC = 192,
  /** official stable release */
  FIRMWARE_VERSION_TYPE_OFFICIAL = 255,
}

/** @deprecated Use FirmwareVersionType instead */
export const FIRMWARE_VERSION_TYPE = FirmwareVersionType;