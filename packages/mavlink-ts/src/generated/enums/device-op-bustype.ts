/**
 * Bus types for device operations.
 */
export enum DeviceOpBustype {
  /** I2C Device operation. */
  DEVICE_OP_BUSTYPE_I2C = 0,
  /** SPI Device operation. */
  DEVICE_OP_BUSTYPE_SPI = 1,
}

/** @deprecated Use DeviceOpBustype instead */
export const DEVICE_OP_BUSTYPE = DeviceOpBustype;