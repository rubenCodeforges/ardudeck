export enum GsmModemType {
  /** not specified */
  GSM_MODEM_TYPE_UNKNOWN = 0,
  /** HUAWEI LTE USB Stick E3372 */
  GSM_MODEM_TYPE_HUAWEI_E3372 = 1,
}

/** @deprecated Use GsmModemType instead */
export const GSM_MODEM_TYPE = GsmModemType;