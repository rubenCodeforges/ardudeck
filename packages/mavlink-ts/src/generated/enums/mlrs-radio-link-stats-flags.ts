/**
 * RADIO_LINK_STATS flags (bitmask).
 *         The RX_RECEIVE and TX_RECEIVE flags indicate from which antenna the received data are taken for processing.
 *         If a flag is set then the data received on antenna2 is processed, else the data received on antenna1 is used.
 *         The RX_TRANSMIT and TX_TRANSMIT flags specify which antenna are transmitting data.
 *         Both antenna 1 and antenna 2 transmit flags can be set simultaneously, e.g., in case of dual-band or dual-frequency systems.
 *         If neither flag is set then antenna 1 should be assumed.
 * @bitmask
 */
export enum MlrsRadioLinkStatsFlags {
  /** Rssi values are in negative dBm. Values 1..254 corresponds to -1..-254 dBm. 0: no reception, UINT8_MAX: unknown. */
  MLRS_RADIO_LINK_STATS_FLAGS_RSSI_DBM = 0,
  /** Rx receive antenna. When set the data received on antenna 2 are taken, else the data stems from antenna 1. */
  MLRS_RADIO_LINK_STATS_FLAGS_RX_RECEIVE_ANTENNA2 = 0,
  /** Rx transmit antenna. Data are transmitted on antenna 1. */
  MLRS_RADIO_LINK_STATS_FLAGS_RX_TRANSMIT_ANTENNA1 = 0,
  /** Rx transmit antenna. Data are transmitted on antenna 2. */
  MLRS_RADIO_LINK_STATS_FLAGS_RX_TRANSMIT_ANTENNA2 = 0,
  /** Tx receive antenna. When set the data received on antenna 2 are taken, else the data stems from antenna 1. */
  MLRS_RADIO_LINK_STATS_FLAGS_TX_RECEIVE_ANTENNA2 = 0,
  /** Tx transmit antenna. Data are transmitted on antenna 1. */
  MLRS_RADIO_LINK_STATS_FLAGS_TX_TRANSMIT_ANTENNA1 = 0,
  /** Tx transmit antenna. Data are transmitted on antenna 2. */
  MLRS_RADIO_LINK_STATS_FLAGS_TX_TRANSMIT_ANTENNA2 = 0,
}

/** @deprecated Use MlrsRadioLinkStatsFlags instead */
export const MLRS_RADIO_LINK_STATS_FLAGS = MlrsRadioLinkStatsFlags;