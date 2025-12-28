/**
 * SERIAL_CONTROL flags (bitmask)
 * @bitmask
 */
export enum SerialControlFlag {
  /** Set if this is a reply */
  SERIAL_CONTROL_FLAG_REPLY = 1,
  /** Set if the sender wants the receiver to send a response as another SERIAL_CONTROL message */
  SERIAL_CONTROL_FLAG_RESPOND = 2,
  /** Set if access to the serial port should be removed from whatever driver is currently using it, giving exclusive access to the SERIAL_CONTROL protocol. The port can be handed back by sending a request without this flag set */
  SERIAL_CONTROL_FLAG_EXCLUSIVE = 4,
  /** Block on writes to the serial port */
  SERIAL_CONTROL_FLAG_BLOCKING = 8,
  /** Send multiple replies until port is drained */
  SERIAL_CONTROL_FLAG_MULTI = 16,
}

/** @deprecated Use SerialControlFlag instead */
export const SERIAL_CONTROL_FLAG = SerialControlFlag;