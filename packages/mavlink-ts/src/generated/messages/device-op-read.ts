/**
 * Read registers for a device.
 * Message ID: 11000
 * CRC Extra: 187
 */
export interface DeviceOpRead {
  /** System ID. */
  targetSystem: number;
  /** Component ID. */
  targetComponent: number;
  /** Request ID - copied to reply. */
  requestId: number;
  /** The bus type. */
  bustype: number;
  /** Bus number. */
  bus: number;
  /** Bus address. */
  address: number;
  /** Name of device on bus (for SPI). */
  busname: string;
  /** First register to read. */
  regstart: number;
  /** Count of registers to read. */
  count: number;
  /** Bank number. */
  bank: number;
}

export const DEVICE_OP_READ_ID = 11000;
export const DEVICE_OP_READ_CRC_EXTRA = 187;
export const DEVICE_OP_READ_MIN_LENGTH = 52;
export const DEVICE_OP_READ_MAX_LENGTH = 52;

export function serializeDeviceOpRead(msg: DeviceOpRead): Uint8Array {
  const buffer = new Uint8Array(52);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.requestId, true);
  buffer[4] = msg.targetSystem & 0xff;
  buffer[5] = msg.targetComponent & 0xff;
  buffer[6] = msg.bustype & 0xff;
  buffer[7] = msg.bus & 0xff;
  buffer[8] = msg.address & 0xff;
  // String: busname
  const busnameBytes = new TextEncoder().encode(msg.busname || '');
  buffer.set(busnameBytes.slice(0, 40), 9);
  buffer[49] = msg.regstart & 0xff;
  buffer[50] = msg.count & 0xff;
  buffer[51] = msg.bank & 0xff;

  return buffer;
}

export function deserializeDeviceOpRead(payload: Uint8Array): DeviceOpRead {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    requestId: view.getUint32(0, true),
    targetSystem: payload[4],
    targetComponent: payload[5],
    bustype: payload[6],
    bus: payload[7],
    address: payload[8],
    busname: new TextDecoder().decode(payload.slice(9, 49)).replace(/\0.*$/, ''),
    regstart: payload[49],
    count: payload[50],
    bank: payload[51],
  };
}