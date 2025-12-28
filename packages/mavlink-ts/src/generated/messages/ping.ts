/**
 * A ping message either requesting or responding to a ping. This allows to measure the system latencies, including serial port, radio modem and UDP connections. The ping microservice is documented at https://mavlink.io/en/services/ping.html
 * Message ID: 4
 * CRC Extra: 237
 */
export interface Ping {
  /** Timestamp (UNIX Epoch time or time since system boot). The receiving end can infer timestamp format (since 1.1.1970 or since system boot) by checking for the magnitude of the number. (us) */
  timeUsec: bigint;
  /** PING sequence */
  seq: number;
  /** 0: request ping from all receiving systems. If greater than 0: message is a ping response and number is the system id of the requesting system */
  targetSystem: number;
  /** 0: request ping from all receiving components. If greater than 0: message is a ping response and number is the component id of the requesting component. */
  targetComponent: number;
}

export const PING_ID = 4;
export const PING_CRC_EXTRA = 237;
export const PING_MIN_LENGTH = 14;
export const PING_MAX_LENGTH = 14;

export function serializePing(msg: Ping): Uint8Array {
  const buffer = new Uint8Array(14);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timeUsec), true);
  view.setUint32(8, msg.seq, true);
  buffer[12] = msg.targetSystem & 0xff;
  buffer[13] = msg.targetComponent & 0xff;

  return buffer;
}

export function deserializePing(payload: Uint8Array): Ping {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUsec: view.getBigUint64(0, true),
    seq: view.getUint32(8, true),
    targetSystem: payload[12],
    targetComponent: payload[13],
  };
}