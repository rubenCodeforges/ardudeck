/**
 * Radio link information. Tx: ground-side device, Rx: vehicle-side device.
        The values of the fields in this message do normally not or only slowly change with time, and for most times the message can be send at a low rate, like 0.2 Hz.
        If values change then the message should temporarily be send more often to inform the system about the changes.
        The target_system field should normally be set to the system id of the system the link is connected to, typically the flight controller.
        The target_component field can normally be set to 0, so that all components of the system can receive the message.
 * Message ID: 60046
 * CRC Extra: 171
 */
export interface MlrsRadioLinkInformation {
  /** System ID (ID of target system, normally flight controller). */
  targetSystem: number;
  /** Component ID (normally 0 for broadcast). */
  targetComponent: number;
  /** Radio link type. 0: unknown/generic type. */
  type: number;
  /** Operation mode. Radio link dependent. UINT8_MAX: ignore/unknown. */
  mode: number;
  /** Tx transmit power in dBm. INT8_MAX: unknown. (dBm) */
  txPower: number;
  /** Rx transmit power in dBm. INT8_MAX: unknown. (dBm) */
  rxPower: number;
  /** Frame rate in Hz (frames per second) for Tx to Rx transmission. 0: unknown. (Hz) */
  txFrameRate: number;
  /** Frame rate in Hz (frames per second) for Rx to Tx transmission. Normally equal to tx_packet_rate. 0: unknown. (Hz) */
  rxFrameRate: number;
  /** Operation mode as human readable string. Radio link dependent. Terminated by NULL if the string length is less than 6 chars and WITHOUT NULL termination if the length is exactly 6 chars - applications have to provide 6+1 bytes storage if the mode is stored as string. Use a zero-length string if not known. */
  modeStr: string;
  /** Frequency band as human readable string. Radio link dependent. Terminated by NULL if the string length is less than 6 chars and WITHOUT NULL termination if the length is exactly 6 chars - applications have to provide 6+1 bytes storage if the mode is stored as string. Use a zero-length string if not known. */
  bandStr: string;
  /** Maximum data rate of serial stream in bytes/s for Tx to Rx transmission. 0: unknown. UINT16_MAX: data rate is 64 KBytes/s or larger. */
  txSerDataRate: number;
  /** Maximum data rate of serial stream in bytes/s for Rx to Tx transmission. 0: unknown. UINT16_MAX: data rate is 64 KBytes/s or larger. */
  rxSerDataRate: number;
  /** Receive sensitivity of Tx in inverted dBm. 1..255 represents -1..-255 dBm, 0: unknown. */
  txReceiveSensitivity: number;
  /** Receive sensitivity of Rx in inverted dBm. 1..255 represents -1..-255 dBm, 0: unknown. */
  rxReceiveSensitivity: number;
}

export const MLRS_RADIO_LINK_INFORMATION_ID = 60046;
export const MLRS_RADIO_LINK_INFORMATION_CRC_EXTRA = 171;
export const MLRS_RADIO_LINK_INFORMATION_MIN_LENGTH = 28;
export const MLRS_RADIO_LINK_INFORMATION_MAX_LENGTH = 28;

export function serializeMlrsRadioLinkInformation(msg: MlrsRadioLinkInformation): Uint8Array {
  const buffer = new Uint8Array(28);
  const view = new DataView(buffer.buffer);

  view.setUint16(0, msg.txFrameRate, true);
  view.setUint16(2, msg.rxFrameRate, true);
  view.setUint16(4, msg.txSerDataRate, true);
  view.setUint16(6, msg.rxSerDataRate, true);
  buffer[8] = msg.targetSystem & 0xff;
  buffer[9] = msg.targetComponent & 0xff;
  buffer[10] = msg.type & 0xff;
  buffer[11] = msg.mode & 0xff;
  view.setInt8(12, msg.txPower);
  view.setInt8(13, msg.rxPower);
  // String: mode_str
  const modeStrBytes = new TextEncoder().encode(msg.modeStr || '');
  buffer.set(modeStrBytes.slice(0, 6), 14);
  // String: band_str
  const bandStrBytes = new TextEncoder().encode(msg.bandStr || '');
  buffer.set(bandStrBytes.slice(0, 6), 20);
  buffer[26] = msg.txReceiveSensitivity & 0xff;
  buffer[27] = msg.rxReceiveSensitivity & 0xff;

  return buffer;
}

export function deserializeMlrsRadioLinkInformation(payload: Uint8Array): MlrsRadioLinkInformation {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    txFrameRate: view.getUint16(0, true),
    rxFrameRate: view.getUint16(2, true),
    txSerDataRate: view.getUint16(4, true),
    rxSerDataRate: view.getUint16(6, true),
    targetSystem: payload[8],
    targetComponent: payload[9],
    type: payload[10],
    mode: payload[11],
    txPower: view.getInt8(12),
    rxPower: view.getInt8(13),
    modeStr: new TextDecoder().decode(payload.slice(14, 20)).replace(/\0.*$/, ''),
    bandStr: new TextDecoder().decode(payload.slice(20, 26)).replace(/\0.*$/, ''),
    txReceiveSensitivity: payload[26],
    rxReceiveSensitivity: payload[27],
  };
}