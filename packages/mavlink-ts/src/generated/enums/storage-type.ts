/**
 * Flags to indicate the type of storage.
 */
export enum StorageType {
  /** Storage type is not known. */
  STORAGE_TYPE_UNKNOWN = 0,
  /** Storage type is USB device. */
  STORAGE_TYPE_USB_STICK = 1,
  /** Storage type is SD card. */
  STORAGE_TYPE_SD = 2,
  /** Storage type is microSD card. */
  STORAGE_TYPE_MICROSD = 3,
  /** Storage type is CFast. */
  STORAGE_TYPE_CF = 4,
  /** Storage type is CFexpress. */
  STORAGE_TYPE_CFE = 5,
  /** Storage type is XQD. */
  STORAGE_TYPE_XQD = 6,
  /** Storage type is HD mass storage type. */
  STORAGE_TYPE_HD = 7,
  /** Storage type is other, not listed type. */
  STORAGE_TYPE_OTHER = 254,
}

/** @deprecated Use StorageType instead */
export const STORAGE_TYPE = StorageType;