import { t } from './i18n/index.js';

/**
 * DroneBridge ESP32 REST API types.
 * Based on DroneBridge for ESP32 v2.2 API.
 */

/** GET /api/system/info */
export interface DroneBridgeInfo {
  idf_version: string;
  db_build_version: number;
  major_version: number;
  minor_version: number;
  patch_version: number;
  maturity_version: string;
  esp_chip_model: number;
  has_rf_switch: number;
  esp_mac: string;
  serial_via_JTAG: number;
}

/** Connected station in AP mode */
export interface DroneBridgeStation {
  sta_mac: string;
  sta_rssi: number;
}

/** GET /api/system/stats */
export interface DroneBridgeStats {
  read_bytes: number;
  serial_dec_mav_msgs: number;
  tcp_connected: number;
  udp_connected: number;
  udp_clients: string[];
  current_client_ip: string;
  esp_rssi: number;
  connected_sta: DroneBridgeStation[];
}

/** GET /api/system/clients */
export interface DroneBridgeClients {
  udp_clients: string[];
}

/**
 * GET /api/settings — all configurable parameters.
 * POST /api/settings accepts Partial<DroneBridgeSettings>.
 */
export interface DroneBridgeSettings {
  ssid: string;
  wifi_pass: string;
  ap_ip: string;
  ip_sta: string;
  ip_sta_gw: string;
  ip_sta_netmsk: string;
  udp_client_ip: string;
  wifi_hostname: string;
  esp32_mode: number; // 1=AP, 2=STA, 3=LR, 4=ESP-NOW Air, 5=ESP-NOW GND
  wifi_chan: number;
  wifi_en_gn: number; // 0=b only, 1=g/n
  ant_use_ext: number; // 0=internal, 1=external antenna
  baud: number;
  gpio_tx: number;
  gpio_rx: number;
  gpio_rts: number;
  gpio_cts: number;
  rts_thresh: number;
  proto: number; // 0=MSP/LTM, 1=MAVLink, 2=transparent
  trans_pack_size: number;
  serial_timeout: number;
  ltm_per_packet: number;
  radio_dis_onarm: number; // 0=keep radio, 1=disable on arm
  udp_client_port: number;
  rep_rssi_dbm: number; // 0=percentage, 1=dBm
}

/** DroneBridge detection result */
export interface DroneBridgeDetected {
  ip: string;
  info: DroneBridgeInfo;
}

/** ESP32 mode labels */
export const ESP32_MODE_LABELS: Record<number, string> = {
  1: 'Access Point', // i18n-exempt
  2: 'Station (Client)', // i18n-exempt
  3: 'Long Range', // i18n-exempt
  4: 'ESP-NOW Air',
  5: 'ESP-NOW Ground',
};

/** Protocol labels */
export const PROTOCOL_LABELS: Record<number, string> = {
  0: 'MSP / LTM',
  1: 'MAVLink',
  2: 'Transparent',
};

const ESP32_MODE_KEYS: Record<number, string> = {
  1: 'accessPoint',
  2: 'station',
  3: 'longRange',
};

export function esp32ModeLabel(mode: number): string | undefined {
  const key = ESP32_MODE_KEYS[mode];
  return key ? t(`shared:dronebridgeTypes.esp32Mode.${key}`) : ESP32_MODE_LABELS[mode];
}

/** Format DroneBridge firmware version string */
export function formatDbVersion(info: DroneBridgeInfo): string {
  return `${info.major_version}.${info.minor_version}.${info.patch_version}`;
}
