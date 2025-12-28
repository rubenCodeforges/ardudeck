/**
 * Configure WiFi AP SSID, password, and mode. This message is re-emitted as an acknowledgement by the AP. The message may also be explicitly requested using MAV_CMD_REQUEST_MESSAGE
 * Message ID: 299
 * CRC Extra: 19
 */
export interface WifiConfigAp {
  /** Name of Wi-Fi network (SSID). Blank to leave it unchanged when setting. Current SSID when sent back as a response. */
  ssid: string;
  /** Password. Blank for an open AP. MD5 hash when message is sent back as a response. */
  password: string;
}

export const WIFI_CONFIG_AP_ID = 299;
export const WIFI_CONFIG_AP_CRC_EXTRA = 19;
export const WIFI_CONFIG_AP_MIN_LENGTH = 96;
export const WIFI_CONFIG_AP_MAX_LENGTH = 96;

export function serializeWifiConfigAp(msg: WifiConfigAp): Uint8Array {
  const buffer = new Uint8Array(96);
  const view = new DataView(buffer.buffer);

  // String: ssid
  const ssidBytes = new TextEncoder().encode(msg.ssid || '');
  buffer.set(ssidBytes.slice(0, 32), 0);
  // String: password
  const passwordBytes = new TextEncoder().encode(msg.password || '');
  buffer.set(passwordBytes.slice(0, 64), 32);

  return buffer;
}

export function deserializeWifiConfigAp(payload: Uint8Array): WifiConfigAp {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    ssid: new TextDecoder().decode(payload.slice(0, 32)).replace(/\0.*$/, ''),
    password: new TextDecoder().decode(payload.slice(32, 96)).replace(/\0.*$/, ''),
  };
}