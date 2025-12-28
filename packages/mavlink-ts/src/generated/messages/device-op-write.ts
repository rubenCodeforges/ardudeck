/**
 * Write registers for a device.
 * Message ID: 11002
 * CRC Extra: 71
 */
export interface DeviceOpWrite {
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
  /** First register to write. */
  regstart: number;
  /** Count of registers to write. */
  count: number;
  /** Write data. */
  data: number[];
  /** Bank number. */
  bank: number;
}

export const DEVICE_OP_WRITE_ID = 11002;
export const DEVICE_OP_WRITE_CRC_EXTRA = 71;
export const DEVICE_OP_WRITE_MIN_LENGTH = 180;
export const DEVICE_OP_WRITE_MAX_LENGTH = 180;

export function serializeDeviceOpWrite(msg: DeviceOpWrite): Uint8Array {
  const buffer = new Uint8Array(180);
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
  // Array: data
  for (let i = 0; i < 128; i++) {
    buffer[51 + i * 1] = msg.data[i] ?? 0 & 0xff;
  }
  buffer[179] = msg.bank & 0xff;

  return buffer;
}

export function deserializeDeviceOpWrite(payload: Uint8Array): DeviceOpWrite {
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
    data: Array.from({ length: 128 }, (_, i) => payload[51 + i * 1]),
    bank: payload[179],
  };
}