/**
 * Control a serial port. This can be used for raw access to an onboard serial peripheral such as a GPS or telemetry radio. It is designed to make it possible to update the devices firmware via MAVLink messages or change the devices settings. A message with zero bytes can be used to change just the baudrate.
 * Message ID: 126
 * CRC Extra: 220
 */
export interface SerialControl {
  /** Serial control device type. */
  device: number;
  /** Bitmap of serial control flags. */
  flags: number;
  /** Timeout for reply data (ms) */
  timeout: number;
  /** Baudrate of transfer. Zero means no change. (bits/s) */
  baudrate: number;
  /** how many bytes in this transfer (bytes) */
  count: number;
  /** serial data */
  data: number[];
}

export const SERIAL_CONTROL_ID = 126;
export const SERIAL_CONTROL_CRC_EXTRA = 220;
export const SERIAL_CONTROL_MIN_LENGTH = 79;
export const SERIAL_CONTROL_MAX_LENGTH = 79;

export function serializeSerialControl(msg: SerialControl): Uint8Array {
  const buffer = new Uint8Array(79);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.baudrate, true);
  view.setUint16(4, msg.timeout, true);
  buffer[6] = msg.device & 0xff;
  buffer[7] = msg.flags & 0xff;
  buffer[8] = msg.count & 0xff;
  // Array: data
  for (let i = 0; i < 70; i++) {
    buffer[9 + i * 1] = msg.data[i] ?? 0 & 0xff;
  }

  return buffer;
}

export function deserializeSerialControl(payload: Uint8Array): SerialControl {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    baudrate: view.getUint32(0, true),
    timeout: view.getUint16(4, true),
    device: payload[6],
    flags: payload[7],
    count: payload[8],
    data: Array.from({ length: 70 }, (_, i) => payload[9 + i * 1]),
  };
}