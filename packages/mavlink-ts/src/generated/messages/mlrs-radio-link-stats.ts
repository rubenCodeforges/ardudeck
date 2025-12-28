/**
 * Radio link statistics for a MAVLink RC receiver or transmitter and other links. Tx: ground-side device, Rx: vehicle-side device.
        The message is normally emitted in regular time intervals upon each actual or expected reception of an over-the-air data packet on the link.
        A MAVLink RC receiver should emit it shortly after it emits a RADIO_RC_CHANNELS message (if it is emitting that message).
        Per default, rssi values are in MAVLink units: 0 represents weakest signal, 254 represents maximum signal, UINT8_MAX represents unknown.
        The RADIO_LINK_STATS_FLAGS_RSSI_DBM flag is set if the rssi units are negative dBm: 1..254 correspond to -1..-254 dBm, 0 represents no reception, UINT8_MAX represents unknown.
        The target_system field should normally be set to the system id of the system the link is connected to, typically the flight controller.
        The target_component field can normally be set to 0, so that all components of the system can receive the message.
        Note: The frequency fields are extensions to ensure that they are located at the end of the serialized payload and subject to MAVLink's trailing-zero trimming.
 * Message ID: 60045
 * CRC Extra: 186
 */
export interface MlrsRadioLinkStats {
  /** System ID (ID of target system, normally flight controller). */
  targetSystem: number;
  /** Component ID (normally 0 for broadcast). */
  targetComponent: number;
  /** Radio link statistics flags. */
  flags: number;
  /** Link quality of RC data stream from Tx to Rx. Values: 1..100, 0: no link connection, UINT8_MAX: unknown. (c%) */
  rxLqRc: number;
  /** Link quality of serial MAVLink data stream from Tx to Rx. Values: 1..100, 0: no link connection, UINT8_MAX: unknown. (c%) */
  rxLqSer: number;
  /** Rssi of antenna 1. 0: no reception, UINT8_MAX: unknown. */
  rxRssi1: number;
  /** Noise on antenna 1. Radio link dependent. INT8_MAX: unknown. */
  rxSnr1: number;
  /** Link quality of serial MAVLink data stream from Rx to Tx. Values: 1..100, 0: no link connection, UINT8_MAX: unknown. (c%) */
  txLqSer: number;
  /** Rssi of antenna 1. 0: no reception. UINT8_MAX: unknown. */
  txRssi1: number;
  /** Noise on antenna 1. Radio link dependent. INT8_MAX: unknown. */
  txSnr1: number;
  /** Rssi of antenna 2. 0: no reception, UINT8_MAX: use rx_rssi1 if it is known else unknown. */
  rxRssi2: number;
  /** Noise on antenna 2. Radio link dependent. INT8_MAX: use rx_snr1 if it is known else unknown. */
  rxSnr2: number;
  /** Rssi of antenna 2. 0: no reception. UINT8_MAX: use tx_rssi1 if it is known else unknown. */
  txRssi2: number;
  /** Noise on antenna 2. Radio link dependent. INT8_MAX: use tx_snr1 if it is known else unknown. */
  txSnr2: number;
  /** Frequency on antenna1 in Hz. 0: unknown. (Hz) */
  frequency1: number;
  /** Frequency on antenna2 in Hz. 0: unknown. (Hz) */
  frequency2: number;
}

export const MLRS_RADIO_LINK_STATS_ID = 60045;
export const MLRS_RADIO_LINK_STATS_CRC_EXTRA = 186;
export const MLRS_RADIO_LINK_STATS_MIN_LENGTH = 23;
export const MLRS_RADIO_LINK_STATS_MAX_LENGTH = 23;

export function serializeMlrsRadioLinkStats(msg: MlrsRadioLinkStats): Uint8Array {
  const buffer = new Uint8Array(23);
  const view = new DataView(buffer.buffer);

  view.setFloat32(0, msg.frequency1, true);
  view.setFloat32(4, msg.frequency2, true);
  view.setUint16(8, msg.flags, true);
  buffer[10] = msg.targetSystem & 0xff;
  buffer[11] = msg.targetComponent & 0xff;
  buffer[12] = msg.rxLqRc & 0xff;
  buffer[13] = msg.rxLqSer & 0xff;
  buffer[14] = msg.rxRssi1 & 0xff;
  view.setInt8(15, msg.rxSnr1);
  buffer[16] = msg.txLqSer & 0xff;
  buffer[17] = msg.txRssi1 & 0xff;
  view.setInt8(18, msg.txSnr1);
  buffer[19] = msg.rxRssi2 & 0xff;
  view.setInt8(20, msg.rxSnr2);
  buffer[21] = msg.txRssi2 & 0xff;
  view.setInt8(22, msg.txSnr2);

  return buffer;
}

export function deserializeMlrsRadioLinkStats(payload: Uint8Array): MlrsRadioLinkStats {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    frequency1: view.getFloat32(0, true),
    frequency2: view.getFloat32(4, true),
    flags: view.getUint16(8, true),
    targetSystem: payload[10],
    targetComponent: payload[11],
    rxLqRc: payload[12],
    rxLqSer: payload[13],
    rxRssi1: payload[14],
    rxSnr1: view.getInt8(15),
    txLqSer: payload[16],
    txRssi1: payload[17],
    txSnr1: view.getInt8(18),
    rxRssi2: payload[19],
    rxSnr2: view.getInt8(20),
    txRssi2: payload[21],
    txSnr2: view.getInt8(22),
  };
}