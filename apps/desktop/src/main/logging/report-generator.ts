/**
 * Report Generator
 *
 * Collects data for bug reports:
 * - App logs (from JSONL files)
 * - Board dump (CLI for MSP, MAVLink messages for ArduPilot)
 * - System info (OS, versions, architecture)
 * - Applies privacy filter to strip sensitive data
 */

import { app } from 'electron';
import { readFileSync, existsSync } from 'fs';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { join, basename } from 'path';
import os from 'os';
import { getLogFiles, getSessionId, type FileLogEntry } from './unified-logger.js';

// Types for report data
export interface BoardDumpMsp {
  type: 'msp';
  status: string;
  dump_all: string;
  diff_all: string;
  fc_variant: string;
  fc_version: string;
  board_identifier: string;
}

export interface BoardDumpMavlink {
  type: 'mavlink';
  parameters: Record<string, number>;
  sys_status: {
    sensors_present: number;
    sensors_enabled: number;
    sensors_health: number;
    load: number;
    voltage_battery: number;
    current_battery: number;
    errors_count1: number;
  };
  heartbeat: {
    autopilot: number;
    type: number;
    base_mode: number;
    custom_mode: number;
  };
  autopilot_version?: {
    flight_sw_version: number;
    board_version: number;
    capabilities: number;
  };
  fc_variant: string;
  fc_version: string;
}

export type BoardDump = BoardDumpMsp | BoardDumpMavlink;

export interface SystemInfo {
  os: string;
  os_version: string;
  arch: string;
  node_version: string;
  electron_version: string;
  chrome_version: string;
  app_version: string;
  app_name: string;
  session_id: string | null;
  timestamp: number;
}

export interface ReportPayload {
  app_logs: FileLogEntry[];
  board_dump: BoardDump | null;
  system_info: SystemInfo;
  user_description: string;
  fingerprint: {
    app_version: string;
    build_time?: string;
    commit_hash?: string;
  };
}

// Privacy filter patterns
const PRIVACY_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // Home directory paths
  { pattern: /\/Users\/[^\/\s]+/g, replacement: '~' },
  { pattern: /\/home\/[^\/\s]+/g, replacement: '~' },
  { pattern: /C:\\Users\\[^\\]+/gi, replacement: '~' },
  // GPS coordinates (lat/lon patterns)
  { pattern: /-?\d{1,3}\.\d{5,}/g, replacement: '[COORD_REDACTED]' },
  // IP addresses (except localhost)
  { pattern: /(?<!127\.0\.0\.)\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g, replacement: '[IP_REDACTED]' },
  // Email addresses
  { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '[EMAIL_REDACTED]' },
  // WiFi passwords (common patterns)
  { pattern: /(?:password|passwd|pwd|psk|wpa)[:\s=]+["']?[^\s"']+["']?/gi, replacement: '[PASSWORD_REDACTED]' },
  // Serial numbers (alphanumeric 10+ chars)
  { pattern: /serial[:\s=]+["']?[A-Z0-9]{10,}["']?/gi, replacement: 'serial=[SERIAL_REDACTED]' },
];

/**
 * Apply privacy filter to a string
 */
export function applyPrivacyFilter(text: string): string {
  let result = text;
  for (const { pattern, replacement } of PRIVACY_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Collect logs from JSONL files
 * @param hours - Number of hours of logs to collect (default: 24)
 * @param maxEntries - Maximum number of entries (default: 5000)
 */
export async function collectLogs(hours = 24, maxEntries = 5000): Promise<FileLogEntry[]> {
  const logFiles = getLogFiles();
  if (logFiles.length === 0) return [];

  const cutoffTime = Date.now() - hours * 60 * 60 * 1000;
  const entries: FileLogEntry[] = [];

  for (const filePath of logFiles) {
    if (entries.length >= maxEntries) break;

    try {
      const rl = createInterface({
        input: createReadStream(filePath),
        crlfDelay: Infinity,
      });

      for await (const line of rl) {
        if (entries.length >= maxEntries) break;
        if (!line.trim()) continue;

        try {
          const entry: FileLogEntry = JSON.parse(line);
          if (entry.ts >= cutoffTime) {
            // Apply privacy filter to message and details
            entry.msg = applyPrivacyFilter(entry.msg);
            if (entry.details) {
              entry.details = applyPrivacyFilter(entry.details);
            }
            if (entry.stack) {
              entry.stack = applyPrivacyFilter(entry.stack);
            }
            entries.push(entry);
          }
        } catch {
          // Skip malformed lines
        }
      }
    } catch (err) {
      console.error(`[ReportGenerator] Error reading log file ${filePath}:`, err);
    }
  }

  // Sort by timestamp ascending
  entries.sort((a, b) => a.ts - b.ts);

  return entries;
}

/**
 * Collect system information
 */
export function collectSystemInfo(): SystemInfo {
  // Read package.json for app version
  let appVersion = 'unknown';
  let appName = 'ardudeck';
  try {
    const packagePath = join(app.getAppPath(), 'package.json');
    if (existsSync(packagePath)) {
      const pkg = JSON.parse(readFileSync(packagePath, 'utf-8'));
      appVersion = pkg.version || 'unknown';
      appName = pkg.name || 'ardudeck';
    }
  } catch {
    // Ignore errors
  }

  return {
    os: os.platform(),
    os_version: os.release(),
    arch: os.arch(),
    node_version: process.versions.node,
    electron_version: process.versions.electron,
    chrome_version: process.versions.chrome,
    app_version: appVersion,
    app_name: appName,
    session_id: getSessionId(),
    timestamp: Date.now(),
  };
}

/**
 * Create the report payload (without board dump - that's collected separately)
 */
export async function createReportPayload(
  userDescription: string,
  boardDump: BoardDump | null = null,
  logHours = 24
): Promise<ReportPayload> {
  const systemInfo = collectSystemInfo();
  const logs = await collectLogs(logHours);

  return {
    app_logs: logs,
    board_dump: boardDump,
    system_info: systemInfo,
    user_description: applyPrivacyFilter(userDescription),
    fingerprint: {
      app_version: systemInfo.app_version,
      // build_time and commit_hash can be added during CI/CD build process
    },
  };
}

/**
 * Create MSP board dump from CLI output
 * This is called after CLI commands have been executed
 */
export function createMspBoardDump(
  status: string,
  dumpAll: string,
  diffAll: string,
  fcVariant: string,
  fcVersion: string,
  boardId: string
): BoardDumpMsp {
  return {
    type: 'msp',
    status: applyPrivacyFilter(status),
    dump_all: applyPrivacyFilter(dumpAll),
    diff_all: applyPrivacyFilter(diffAll),
    fc_variant: fcVariant,
    fc_version: fcVersion,
    board_identifier: boardId,
  };
}

/**
 * Create MAVLink board dump from cached data
 */
export function createMavlinkBoardDump(
  parameters: Record<string, number>,
  sysStatus: BoardDumpMavlink['sys_status'],
  heartbeat: BoardDumpMavlink['heartbeat'],
  autopilotVersion: BoardDumpMavlink['autopilot_version'] | undefined,
  fcVariant: string,
  fcVersion: string
): BoardDumpMavlink {
  return {
    type: 'mavlink',
    parameters,
    sys_status: sysStatus,
    heartbeat,
    autopilot_version: autopilotVersion,
    fc_variant: fcVariant,
    fc_version: fcVersion,
  };
}

/**
 * Estimate the size of the report payload
 */
export function estimatePayloadSize(payload: ReportPayload): number {
  return JSON.stringify(payload).length;
}
