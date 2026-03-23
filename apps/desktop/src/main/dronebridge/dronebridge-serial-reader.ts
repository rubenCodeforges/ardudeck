/**
 * Reads DroneBridge ESP32 boot log over USB serial to extract device info.
 *
 * After flashing (or any reboot), DroneBridge dumps all its config parameters
 * to the serial console at 115200 baud as ESP-IDF log messages. This module
 * opens the serial port, collects the output, and parses it into structured data.
 *
 * No commands are sent — the serial output is passive/read-only.
 */

import { SerialPort } from 'serialport';
import type { DroneBridgeInfo, DroneBridgeSettings } from '../../shared/dronebridge-types.js';

const CONSOLE_BAUD = 115200;

export interface DroneBridgeSerialInfo {
  /** Parsed settings from the boot log (SSID, password, AP IP, mode, etc.) */
  settings: Partial<DroneBridgeSettings> | null;
  /** AP IP address (shortcut from settings) */
  apIp: string | null;
  /** SSID (shortcut from settings) */
  ssid: string | null;
  /** Raw boot log text */
  rawLog: string;
}

/**
 * Open the serial port and read DroneBridge boot output for `durationMs`.
 * The ESP32 auto-reboots after flashing so the boot log should appear shortly.
 */
export async function readDroneBridgeBootLog(
  portPath: string,
  durationMs = 8000,
): Promise<DroneBridgeSerialInfo> {
  return readSerial(portPath, durationMs, false);
}

/**
 * Reset the ESP32 via DTR toggle and read the boot log.
 * Use this when the device is already connected via USB (not right after flash).
 */
export async function readDroneBridgeWithReset(
  portPath: string,
  durationMs = 10000,
): Promise<DroneBridgeSerialInfo> {
  return readSerial(portPath, durationMs, true);
}

function readSerial(
  portPath: string,
  durationMs: number,
  resetFirst: boolean,
): Promise<DroneBridgeSerialInfo> {
  let collected = '';
  let finished = false;

  return new Promise((resolve) => {
    const port = new SerialPort({
      path: portPath,
      baudRate: CONSOLE_BAUD,
      autoOpen: false,
    });

    const finish = () => {
      if (finished) return;
      finished = true;
      try { port.close(); } catch { /* already closed */ }
      const parsed = parseBootLog(collected);
      resolve(parsed);
    };

    const timeout = setTimeout(finish, durationMs);

    // If we detect the "app_main finished" marker, we can stop early
    const checkDone = () => {
      if (collected.includes('app_main finished') || collected.includes('Rest Server started')) {
        clearTimeout(timeout);
        // Give a tiny bit more time for any trailing output
        setTimeout(finish, 500);
      }
    };

    port.on('data', (data: Buffer) => {
      collected += data.toString('utf8');
      checkDone();
    });

    port.on('error', () => {
      clearTimeout(timeout);
      finish();
    });

    port.open((err) => {
      if (err) {
        clearTimeout(timeout);
        resolve({ settings: null, apIp: null, ssid: null, rawLog: '' });
        return;
      }

      if (resetFirst) {
        // Toggle DTR+RTS to reset the ESP32 (same as pressing the EN/RST button)
        port.set({ dtr: false, rts: true }, () => {
          setTimeout(() => {
            port.set({ dtr: false, rts: false }, () => {
              // ESP32 now reboots and prints boot log
            });
          }, 100);
        });
      }
    });
  });
}

/**
 * Parse the ESP-IDF boot log to extract DroneBridge parameters.
 *
 * The log format from db_param_print_values_to_buffer() looks like:
 *   I (1234) DB_ESP32:
 *   	ssid: DroneBridge for ESP32
 *   	wifi_pass: dronebridge
 *   	ap_ip: 192.168.2.1
 *   	esp32_mode: 1
 *   ...
 *
 * We also look for:
 *   WIFI_EVENT_AP_START (SSID: DroneBridge for ESP32 PASS: dronebridge)
 */
function parseBootLog(log: string): DroneBridgeSerialInfo {
  const settings: Partial<DroneBridgeSettings> = {};
  let apIp: string | null = null;
  let ssid: string | null = null;

  // Parse key-value pairs from the parameter dump
  // Match lines like "	ssid: DroneBridge for ESP32" or "ssid: DroneBridge for ESP32"
  const kvPattern = /^\s*(ssid|wifi_pass|ap_ip|ip_sta|ip_sta_gw|ip_sta_netmsk|udp_client_ip|wifi_hostname|esp32_mode|wifi_chan|wifi_en_gn|ant_use_ext|baud|gpio_tx|gpio_rx|gpio_rts|gpio_cts|rts_thresh|proto|trans_pack_size|serial_timeout|ltm_per_packet|radio_dis_onarm|udp_client_port|rep_rssi_dbm):\s*(.+)/gm;

  const numericFields = new Set([
    'esp32_mode', 'wifi_chan', 'wifi_en_gn', 'ant_use_ext', 'baud',
    'gpio_tx', 'gpio_rx', 'gpio_rts', 'gpio_cts', 'rts_thresh',
    'proto', 'trans_pack_size', 'serial_timeout', 'ltm_per_packet',
    'radio_dis_onarm', 'udp_client_port', 'rep_rssi_dbm',
  ]);

  let match: RegExpExecArray | null;
  while ((match = kvPattern.exec(log)) !== null) {
    const key = match[1] as keyof DroneBridgeSettings;
    const rawValue = match[2]!.trim();

    if (numericFields.has(key)) {
      const num = parseInt(rawValue, 10);
      if (!isNaN(num)) {
        (settings as Record<string, unknown>)[key] = num;
      }
    } else {
      (settings as Record<string, unknown>)[key] = rawValue;
    }
  }

  // Extract from WIFI_EVENT_AP_START line as fallback
  const apStartMatch = log.match(/WIFI_EVENT_AP_START\s*\(SSID:\s*(.+?)\s+PASS:\s*(.+?)\)/);
  if (apStartMatch) {
    if (!settings.ssid) settings.ssid = apStartMatch[1]!;
    if (!settings.wifi_pass) settings.wifi_pass = apStartMatch[2]!;
  }

  // Set shortcuts
  apIp = settings.ap_ip ?? null;
  ssid = settings.ssid ?? null;

  const hasData = Object.keys(settings).length > 0;

  return {
    settings: hasData ? settings : null,
    apIp,
    ssid,
    rawLog: log,
  };
}
