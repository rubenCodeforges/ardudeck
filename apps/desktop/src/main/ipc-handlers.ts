/**
 * IPC Handlers for main process
 * Handles communication between renderer and main process
 */

import { ipcMain, BrowserWindow, dialog, app, shell } from 'electron';
import { join } from 'path';
import { existsSync } from 'fs';
import Store from 'electron-store';
import {
  listSerialPorts,
  scanPorts,
  SerialTransport,
  TcpTransport,
  UdpTransport,
  type Transport,
  type SerialPortInfo,
  type ScanResult,
} from '@ardudeck/comms';
import {
  MAVLinkParser,
  type MAVLinkPacket,
  serializeV1,
  serializeV2,
  deserializeParamValue,
  serializeParamRequestList,
  serializeParamSet,
  serializeCommandLong,
  serializeMissionRequestList,
  serializeMissionRequest,
  serializeMissionRequestInt,
  serializeMissionCount,
  serializeMissionItem,
  serializeMissionItemInt,
  serializeMissionClearAll,
  serializeMissionAck,
  serializeMissionSetCurrent,
  deserializeMissionItemInt,
  deserializeMissionItem,
  PARAM_REQUEST_LIST_ID,
  PARAM_REQUEST_LIST_CRC_EXTRA,
  PARAM_SET_ID,
  PARAM_SET_CRC_EXTRA,
  COMMAND_LONG_ID,
  COMMAND_LONG_CRC_EXTRA,
  MISSION_REQUEST_LIST_ID,
  MISSION_REQUEST_LIST_CRC_EXTRA,
  MISSION_REQUEST_ID,
  MISSION_REQUEST_CRC_EXTRA,
  MISSION_REQUEST_INT_ID,
  MISSION_REQUEST_INT_CRC_EXTRA,
  MISSION_COUNT_ID,
  MISSION_COUNT_CRC_EXTRA,
  MISSION_ITEM_ID,
  MISSION_ITEM_CRC_EXTRA,
  MISSION_ITEM_INT_ID,
  MISSION_ITEM_INT_CRC_EXTRA,
  MISSION_ACK_ID,
  MISSION_ACK_CRC_EXTRA,
  MISSION_CLEAR_ALL_ID,
  MISSION_CLEAR_ALL_CRC_EXTRA,
  MISSION_SET_CURRENT_ID,
  MISSION_SET_CURRENT_CRC_EXTRA,
  type ParamValue,
} from '@ardudeck/mavlink-ts';
import { IPC_CHANNELS, type ConnectOptions, type ConnectionState, type ConsoleLogEntry, type SavedLayout, type LayoutStoreSchema, type SettingsStoreSchema } from '../shared/ipc-channels.js';
import type { ParamValuePayload, ParameterProgress } from '../shared/parameter-types.js';
import { PARAMETER_METADATA_URLS, mavTypeToVehicleType, type VehicleType, type ParameterMetadata, type ParameterMetadataStore } from '../shared/parameter-metadata.js';
import type { AttitudeData, PositionData, GpsData, BatteryData, VfrHudData, FlightState } from '../shared/telemetry-types.js';
import { COPTER_MODES, PLANE_MODES } from '../shared/telemetry-types.js';
import type { MissionItem, MissionProgress } from '../shared/mission-types.js';
import { MAV_MISSION_RESULT, MAV_MISSION_TYPE } from '../shared/mission-types.js';
import type { FenceItem, FenceStatus } from '../shared/fence-types.js';
import type { RallyItem } from '../shared/rally-types.js';
import type { DetectedBoard, FirmwareSource, FirmwareVehicleType, FirmwareManifest, FirmwareVersion, FlashResult, FlashOptions } from '../shared/firmware-types.js';
import { detectBoards, fetchFirmwareVersions, downloadFirmware, copyCustomFirmware, flashWithDfu, flashWithAvrdude, flashWithSerialBootloader, getArduPilotBoards, getArduPilotVersions, getBetaflightBoards, getInavBoards, type BoardInfo, type VersionGroup } from './firmware/index.js';
import { registerMspHandlers, tryMspDetection, startMspTelemetry, stopMspTelemetry, cleanupMspConnection } from './msp/index.js';

// =============================================================================
// Legacy Board Detection
// =============================================================================

/**
 * Detect if an MSP board is a legacy board that only supports CLI config.
 * Legacy boards don't support modern MSP write commands for PID/Rates/Servo.
 *
 * Legacy criteria:
 * - iNav < 2.1.0 (F3 boards like SPRacing F3)
 * - Betaflight < 4.0 (F3 boards)
 *
 * @param fcVariant - "INAV", "BTFL", "CLFL"
 * @param fcVersion - "2.0.0", "4.5.1", etc.
 * @returns true if the board is legacy and should use CLI-only config
 */
function isLegacyMspBoard(fcVariant: string, fcVersion: string): boolean {
  if (!fcVariant || !fcVersion) return false;

  const parts = fcVersion.split('.').map(Number);
  if (parts.length < 2) return false;
  const [major, minor] = parts;

  // iNav < 2.1.0 → Legacy (F3 boards)
  if (fcVariant === 'INAV') {
    return major < 2 || (major === 2 && minor! < 1);
  }

  // Betaflight < 4.0 → Legacy (F3 boards)
  if (fcVariant === 'BTFL') {
    return major < 4;
  }

  // Cleanflight is generally legacy
  if (fcVariant === 'CLFL') {
    return true;
  }

  return false;
}

// Layout storage
const layoutStore = new Store<LayoutStoreSchema>({
  name: 'layouts',
  defaults: {
    activeLayout: 'default',
    layouts: {},
  },
});

// Settings/vehicle profile storage
const settingsStore = new Store<SettingsStoreSchema>({
  name: 'settings',
  defaults: {
    missionDefaults: {
      safeAltitudeBuffer: 30,
      defaultWaypointAltitude: 100,
      defaultTakeoffAltitude: 50,
    },
    vehicles: [{
      id: 'default',
      name: 'My Vehicle',
      type: 'copter',
      frameSize: 5,
      weight: 600,
      batteryCells: 4,
      batteryCapacity: 1500,
    }],
    activeVehicleId: 'default',
    flightStats: {
      totalFlightTimeSeconds: 0,
      totalDistanceMeters: 0,
      totalMissions: 0,
      lastFlightDate: null,
      lastConnectionDate: null,
    },
  },
});

let currentTransport: Transport | null = null;
let currentVehicleType = 0; // 1=plane, 2=copter, etc.
let mavlinkParser: MAVLinkParser | null = null;
let heartbeatTimeout: NodeJS.Timeout | null = null;

// BSOD FIX: Store handler references for proper cleanup on disconnect
// Without this, handlers accumulate on reconnect cycles causing driver stress
let mavlinkDataHandler: ((data: Uint8Array) => Promise<void>) | null = null;
let transportErrorHandler: ((err: Error) => void) | null = null;
let transportCloseHandler: (() => void) | null = null;

// BSOD FIX: MAVLink processing state to prevent overlapping packet processing
let processingMavlink = false;
const pendingMavlinkData: Uint8Array[] = [];

/**
 * BSOD FIX: Clean up all transport event listeners
 * Must be called BEFORE closing transport to prevent orphaned handlers
 */
function cleanupTransportListeners(): void {
  if (currentTransport) {
    if (mavlinkDataHandler) {
      currentTransport.removeListener('data', mavlinkDataHandler);
    }
    if (transportErrorHandler) {
      currentTransport.removeListener('error', transportErrorHandler);
    }
    if (transportCloseHandler) {
      currentTransport.removeListener('close', transportCloseHandler);
    }
  }
  mavlinkDataHandler = null;
  transportErrorHandler = null;
  transportCloseHandler = null;
  processingMavlink = false;
  pendingMavlinkData.length = 0;
}
let logId = 0;
let connectionState: ConnectionState = {
  isConnected: false,
  packetsReceived: 0,
  packetsSent: 0,
};

// Detected MAVLink version from flight controller (1 or 2)
let detectedMavlinkVersion: 1 | 2 = 1; // Default to v1 for compatibility

// Parameter download state
let expectedParamCount = 0;
let receivedParams = new Map<string, ParamValue>();
let paramDownloadTimeout: NodeJS.Timeout | null = null;

// Parameter metadata cache (keyed by vehicle type)
const metadataCache = new Map<VehicleType, ParameterMetadataStore>();

// Mission download state
let missionDownloadState: {
  expected: number;
  received: Map<number, MissionItem>;
  timeout: NodeJS.Timeout | null;
} | null = null;

// Mission upload state
let missionUploadState: {
  items: MissionItem[];
  currentSeq: number;
  timeout: NodeJS.Timeout | null;
} | null = null;

// Track pending clear operation
let missionClearPending = false;

// Fence download state
let fenceDownloadState: {
  expected: number;
  received: Map<number, FenceItem>;
  timeout: NodeJS.Timeout | null;
} | null = null;

// Fence upload state
let fenceUploadState: {
  items: FenceItem[];
  currentSeq: number;
  timeout: NodeJS.Timeout | null;
} | null = null;

let fenceClearPending = false;

// Rally download state
let rallyDownloadState: {
  expected: number;
  received: Map<number, RallyItem>;
  timeout: NodeJS.Timeout | null;
} | null = null;

// Rally upload state
let rallyUploadState: {
  items: RallyItem[];
  currentSeq: number;
  timeout: NodeJS.Timeout | null;
} | null = null;

let rallyClearPending = false;

// Firmware flash state
let firmwareAbortController: AbortController | null = null;

// Autopilot type names (from MAV_AUTOPILOT enum)
const AUTOPILOT_NAMES: Record<number, string> = {
  0: 'Generic',
  3: 'ArduPilot',
  4: 'OpenPilot',
  8: 'Invalid',
  12: 'PX4',
};

// Vehicle type names (from MAV_TYPE enum)
const VEHICLE_NAMES: Record<number, string> = {
  0: 'Generic',
  1: 'Fixed Wing',
  2: 'Quadrotor',
  3: 'Coaxial',
  4: 'Helicopter',
  5: 'Antenna Tracker',
  6: 'GCS',
  7: 'Airship',
  8: 'Free Balloon',
  9: 'Rocket',
  10: 'Ground Rover',
  11: 'Surface Boat',
  12: 'Submarine',
  13: 'Hexarotor',
  14: 'Octorotor',
  15: 'Tricopter',
  16: 'Flapping Wing',
  17: 'Kite',
  18: 'Onboard Companion',
  19: 'VTOL Tailsitter Duo',
  20: 'VTOL Tailsitter Quad',
  21: 'VTOL Tiltrotor',
  22: 'VTOL Fixed-rotor',
  23: 'VTOL Tailsitter',
  24: 'VTOL Tiltwing',
  25: 'VTOL Reserved5',
  26: 'Gimbal',
  27: 'ADSB',
  28: 'Parafoil',
  29: 'Dodecarotor',
  30: 'Camera',
  31: 'Charging Station',
  32: 'FLARM',
  33: 'Servo',
  34: 'ODID',
  35: 'Decarotor',
  36: 'Battery',
  37: 'Parachute',
  38: 'Log',
  39: 'OSD',
  40: 'IMU',
  41: 'GPS',
  42: 'Winch',
};

// Safely send IPC message to window (checks if window is still valid)
function safeSend(mainWindow: BrowserWindow, channel: string, ...args: unknown[]): void {
  try {
    if (!mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send(channel, ...args);
    }
  } catch {
    // Window was destroyed, ignore
  }
}

function sendLog(mainWindow: BrowserWindow, level: ConsoleLogEntry['level'], message: string, details?: string): void {
  const entry: ConsoleLogEntry = {
    id: ++logId,
    timestamp: Date.now(),
    level,
    message,
    details,
  };
  safeSend(mainWindow, IPC_CHANNELS.CONSOLE_LOG, entry);
}

// Helper functions to read values from MAVLink payload (little-endian)
function readInt16(payload: Uint8Array, offset: number): number {
  const val = payload[offset] | (payload[offset + 1] << 8);
  return val > 0x7FFF ? val - 0x10000 : val;
}

function readUint16(payload: Uint8Array, offset: number): number {
  return payload[offset] | (payload[offset + 1] << 8);
}

function readInt32(payload: Uint8Array, offset: number): number {
  const val = payload[offset] | (payload[offset + 1] << 8) | (payload[offset + 2] << 16) | (payload[offset + 3] << 24);
  return val;
}

function readUint32(payload: Uint8Array, offset: number): number {
  return (payload[offset] | (payload[offset + 1] << 8) | (payload[offset + 2] << 16) | (payload[offset + 3] << 24)) >>> 0;
}

function readFloat(payload: Uint8Array, offset: number): number {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setUint8(0, payload[offset]);
  view.setUint8(1, payload[offset + 1]);
  view.setUint8(2, payload[offset + 2]);
  view.setUint8(3, payload[offset + 3]);
  return view.getFloat32(0, true); // little-endian
}

// MAVLink message IDs
const MSG_HEARTBEAT = 0;
const MSG_SYS_STATUS = 1;
const MSG_PARAM_VALUE = 22;
const MSG_GPS_RAW_INT = 24;
const MSG_ATTITUDE = 30;
const MSG_GLOBAL_POSITION_INT = 33;
const MSG_VFR_HUD = 74;

// Mission message IDs
const MSG_MISSION_ITEM = 39;
const MSG_MISSION_REQUEST = 40;
const MSG_MISSION_SET_CURRENT = 41;
const MSG_MISSION_CURRENT = 42;
const MSG_MISSION_REQUEST_LIST = 43;
const MSG_MISSION_COUNT = 44;
const MSG_MISSION_CLEAR_ALL = 45;
const MSG_MISSION_ITEM_REACHED = 46;
const MSG_MISSION_ACK = 47;
const MSG_MISSION_REQUEST_INT = 51;
const MSG_MISSION_ITEM_INT = 73;

// Fence message ID
const MSG_FENCE_STATUS = 162;

// MAVLink v1 CRC_EXTRA values (without mission_type extension field)
// These differ from v2 because v2 includes the mission_type field in CRC calculation
const MISSION_REQUEST_LIST_CRC_EXTRA_V1 = 132;  // v2 = 148
const MISSION_COUNT_CRC_EXTRA_V1 = 221;         // v2 = 52
const MISSION_REQUEST_CRC_EXTRA_V1 = 230;       // v2 = 177
const MISSION_ITEM_CRC_EXTRA_V1 = 254;          // v2 = 95
const MISSION_CLEAR_ALL_CRC_EXTRA_V1 = 232;     // v2 = 25
const MISSION_ACK_CRC_EXTRA_V1 = 153;           // v2 = 146

// Parse telemetry from MAVLink packet
// NOTE: MAVLink v2 orders payload fields by size (largest first for alignment)
function parseTelemetry(mainWindow: BrowserWindow, packet: MAVLinkPacket): void {
  const { msgid, payload } = packet;

  // Log mission-related messages for debugging
  const missionMsgIds = [39, 40, 41, 42, 43, 44, 45, 46, 47, 51, 73];
  if (missionMsgIds.includes(msgid)) {
    const hexPayload = Array.from(payload).map(b => b.toString(16).padStart(2, '0')).join(' ');
    sendLog(mainWindow, 'debug', `Received MSG #${msgid} (len=${payload.length}): ${hexPayload}`);
  }

  switch (msgid) {
    case MSG_HEARTBEAT: {
      // MAVLink wire order: custom_mode(4), type(1), autopilot(1), base_mode(1), system_status(1), mavlink_version(1)
      const customMode = readUint32(payload, 0);
      const vehicleType = payload[4];
      const autopilotType = payload[5];
      const baseMode = payload[6];

      currentVehicleType = vehicleType;
      const armed = (baseMode & 0x80) !== 0; // MAV_MODE_FLAG_SAFETY_ARMED

      // Get mode name based on vehicle type
      let modeName = `Mode ${customMode}`;
      // Fixed wing and VTOL types use plane modes
      if (vehicleType === 1 || (vehicleType >= 19 && vehicleType <= 25)) {
        modeName = PLANE_MODES[customMode] || modeName;
      } else if (vehicleType === 2 || (vehicleType >= 13 && vehicleType <= 15) || vehicleType === 29 || vehicleType === 35) {
        // Rotorcraft types: quad, hex, octo, tri, dodeca, deca
        modeName = COPTER_MODES[customMode] || modeName;
      }

      const flight: FlightState = {
        mode: modeName,
        modeNum: customMode,
        armed,
        isFlying: armed && (baseMode & 0x04) !== 0, // MAV_MODE_FLAG_CUSTOM_MODE_ENABLED as proxy
      };
      safeSend(mainWindow, IPC_CHANNELS.TELEMETRY_UPDATE, { type: 'flight', data: flight });
      break;
    }

    case MSG_SYS_STATUS: {
      // Payload offset for battery: voltage_battery at offset 14 (uint16 mV), current_battery at 16 (int16 cA), battery_remaining at 30 (int8 %)
      const voltage = readUint16(payload, 14) / 1000; // mV to V
      const current = readInt16(payload, 16) / 100;   // cA to A
      const remaining = payload[30] === 255 ? -1 : payload[30]; // -1 if unknown

      const battery: BatteryData = { voltage, current, remaining };
      safeSend(mainWindow, IPC_CHANNELS.TELEMETRY_UPDATE, { type: 'battery', data: battery });
      break;
    }

    case MSG_GPS_RAW_INT: {
      // MAVLink wire order: time_usec(8), lat(4), lon(4), alt(4), eph(2), epv(2), vel(2), cog(2), fix_type(1), satellites_visible(1)
      const lat = readInt32(payload, 8) / 1e7;
      const lon = readInt32(payload, 12) / 1e7;
      const alt = readInt32(payload, 16) / 1000; // mm to m
      const hdop = readUint16(payload, 20) / 100; // eph = hdop * 100
      const fixType = payload[28];
      const satellites = payload[29];

      const gps: GpsData = { fixType, satellites, hdop, lat, lon, alt };
      safeSend(mainWindow, IPC_CHANNELS.TELEMETRY_UPDATE, { type: 'gps', data: gps });
      break;
    }

    case MSG_ATTITUDE: {
      // Payload: time_boot_ms(4), roll(4), pitch(4), yaw(4), rollspeed(4), pitchspeed(4), yawspeed(4)
      const roll = readFloat(payload, 4) * (180 / Math.PI);     // rad to deg
      const pitch = readFloat(payload, 8) * (180 / Math.PI);
      const yaw = readFloat(payload, 12) * (180 / Math.PI);
      const rollSpeed = readFloat(payload, 16) * (180 / Math.PI);
      const pitchSpeed = readFloat(payload, 20) * (180 / Math.PI);
      const yawSpeed = readFloat(payload, 24) * (180 / Math.PI);

      const attitude: AttitudeData = { roll, pitch, yaw, rollSpeed, pitchSpeed, yawSpeed };
      safeSend(mainWindow, IPC_CHANNELS.TELEMETRY_UPDATE, { type: 'attitude', data: attitude });
      break;
    }

    case MSG_GLOBAL_POSITION_INT: {
      // Payload: time_boot_ms(4), lat(4), lon(4), alt(4), relative_alt(4), vx(2), vy(2), vz(2), hdg(2)
      const lat = readInt32(payload, 4) / 1e7;
      const lon = readInt32(payload, 8) / 1e7;
      const alt = readInt32(payload, 12) / 1000;        // mm to m
      const relativeAlt = readInt32(payload, 16) / 1000;
      const vx = readInt16(payload, 20) / 100;          // cm/s to m/s
      const vy = readInt16(payload, 22) / 100;
      const vz = readInt16(payload, 24) / 100;

      const position: PositionData = { lat, lon, alt, relativeAlt, vx, vy, vz };
      safeSend(mainWindow, IPC_CHANNELS.TELEMETRY_UPDATE, { type: 'position', data: position });
      break;
    }

    case MSG_VFR_HUD: {
      // MAVLink wire order: airspeed(4), groundspeed(4), alt(4), climb(4), heading(2), throttle(2)
      const airspeed = readFloat(payload, 0);
      const groundspeed = readFloat(payload, 4);
      const alt = readFloat(payload, 8);
      const climb = readFloat(payload, 12);
      const heading = readInt16(payload, 16);
      const throttle = readUint16(payload, 18);

      const vfrHud: VfrHudData = { airspeed, groundspeed, heading, throttle, alt, climb };
      safeSend(mainWindow, IPC_CHANNELS.TELEMETRY_UPDATE, { type: 'vfrHud', data: vfrHud });
      break;
    }

    case MSG_PARAM_VALUE: {
      // Deserialize parameter value
      const param = deserializeParamValue(payload);

      // Track received parameters
      receivedParams.set(param.paramId, param);
      expectedParamCount = param.paramCount;

      // Reset timeout on each received param
      if (paramDownloadTimeout) {
        clearTimeout(paramDownloadTimeout);
        paramDownloadTimeout = setTimeout(() => {
          if (receivedParams.size < expectedParamCount) {
            safeSend(mainWindow, IPC_CHANNELS.PARAM_ERROR,
              `Timeout: received ${receivedParams.size}/${expectedParamCount} parameters`);
          }
        }, 10000); // 10 second timeout after last param
      }

      // Send parameter to renderer
      const paramPayload: ParamValuePayload = {
        paramId: param.paramId,
        paramValue: param.paramValue,
        paramType: param.paramType,
        paramCount: param.paramCount,
        paramIndex: param.paramIndex,
      };
      safeSend(mainWindow, IPC_CHANNELS.PARAM_VALUE, paramPayload);

      // Send progress update
      const progress: ParameterProgress = {
        total: param.paramCount,
        received: receivedParams.size,
        percentage: Math.round((receivedParams.size / param.paramCount) * 100),
      };
      safeSend(mainWindow, IPC_CHANNELS.PARAM_PROGRESS, progress);

      // Check if complete
      if (receivedParams.size >= param.paramCount) {
        if (paramDownloadTimeout) {
          clearTimeout(paramDownloadTimeout);
          paramDownloadTimeout = null;
        }
        safeSend(mainWindow, IPC_CHANNELS.PARAM_COMPLETE);
        sendLog(mainWindow, 'info', `Downloaded ${receivedParams.size} parameters`);
      }
      break;
    }

    // Mission messages - wrap in try-catch for payload size variations
    case MSG_MISSION_COUNT: {
      // FC responded with mission count during download
      if (!missionDownloadState) {
        sendLog(mainWindow, 'debug', `Received MISSION_COUNT but no download in progress`);
        break;
      }

      try {
        // MISSION_COUNT payload byte order:
        // Some FCs use v2 byte order (size-sorted) even in v1 packets!
        // v1 order: target_system(1), target_component(1), count(2) - count at offset 2
        // v2 order: count(2), target_system(1), target_component(1), [mission_type(1)] - count at offset 0
        //
        // Detection: If bytes 2-3 are our GCS IDs (255, 190) or count at offset 2 is unreasonable,
        // assume v2 byte order (count at offset 0)
        let count: number;
        const countAtOffset0 = payload[0] | (payload[1] << 8);
        const countAtOffset2 = payload[2] | (payload[3] << 8);

        // Check if bytes 2-3 look like GCS IDs (255, 190) - indicates v2 order
        const looksLikeV2Order = (payload[2] === 0xFF && payload[3] === 0xBE) ||
                                 (payload[2] === 0xFF && payload[3] === 0x01) ||  // compid 1
                                 countAtOffset2 > 1000;  // Unreasonable count

        if (payload.length >= 5 || looksLikeV2Order) {
          // v2 byte order: count is at offset 0
          count = countAtOffset0;
          sendLog(mainWindow, 'debug', `MISSION_COUNT using v2 byte order: count=${count}`);
        } else {
          // v1 byte order: count is at offset 2
          count = countAtOffset2;
          sendLog(mainWindow, 'debug', `MISSION_COUNT using v1 byte order: count=${count}`);
        }
        missionDownloadState.expected = count;

        sendLog(mainWindow, 'debug', `Mission has ${count} items (payload len: ${payload.length})`);

        if (count === 0) {
          // Empty mission
          safeSend(mainWindow, IPC_CHANNELS.MISSION_COMPLETE, []);
          missionDownloadState = null;
        } else {
          // Request first item
          requestMissionItem(mainWindow, 0);
        }
      } catch (err) {
        sendLog(mainWindow, 'error', 'Failed to parse MISSION_COUNT', String(err));
      }
      break;
    }

    case MSG_MISSION_ITEM:
    case MSG_MISSION_ITEM_INT: {
      // FC sent mission item during download (MISSION_ITEM for v1, MISSION_ITEM_INT for v2)
      if (!missionDownloadState) break;

      try {
        let item: MissionItem;

        if (msgid === MSG_MISSION_ITEM_INT) {
          // MAVLink v2 format with int32 lat/lon
          const msg = deserializeMissionItemInt(payload);
          item = {
            seq: msg.seq,
            frame: msg.frame,
            command: msg.command,
            current: msg.current === 1,
            autocontinue: msg.autocontinue === 1,
            param1: msg.param1,
            param2: msg.param2,
            param3: msg.param3,
            param4: msg.param4,
            latitude: msg.x / 1e7,   // INT format uses lat*1e7
            longitude: msg.y / 1e7,
            altitude: msg.z,
          };
        } else {
          // MAVLink v1 format with float lat/lon
          const msg = deserializeMissionItem(payload);
          item = {
            seq: msg.seq,
            frame: msg.frame,
            command: msg.command,
            current: msg.current === 1,
            autocontinue: msg.autocontinue === 1,
            param1: msg.param1,
            param2: msg.param2,
            param3: msg.param3,
            param4: msg.param4,
            latitude: msg.x,   // Float format
            longitude: msg.y,
            altitude: msg.z,
          };
        }

        missionDownloadState.received.set(item.seq, item);

        // Send item to renderer
        safeSend(mainWindow, IPC_CHANNELS.MISSION_ITEM, item);

        // Send progress
        const progress: MissionProgress = {
          total: missionDownloadState.expected,
          transferred: missionDownloadState.received.size,
          operation: 'download',
        };
        safeSend(mainWindow, IPC_CHANNELS.MISSION_PROGRESS, progress);

        // Reset timeout
        if (missionDownloadState.timeout) {
          clearTimeout(missionDownloadState.timeout);
        }
        missionDownloadState.timeout = setTimeout(() => {
          if (missionDownloadState && missionDownloadState.received.size < missionDownloadState.expected) {
            safeSend(mainWindow, IPC_CHANNELS.MISSION_ERROR,
              `Timeout: received ${missionDownloadState.received.size}/${missionDownloadState.expected} mission items`);
            missionDownloadState = null;
          }
        }, 5000);

        // Check if complete
        if (missionDownloadState.received.size >= missionDownloadState.expected) {
          // All items received, send ACK and complete
          sendMissionAck(mainWindow, MAV_MISSION_RESULT.ACCEPTED);

          // Convert map to sorted array
          const items = Array.from(missionDownloadState.received.values())
            .sort((a, b) => a.seq - b.seq);

          safeSend(mainWindow, IPC_CHANNELS.MISSION_COMPLETE, items);
          sendLog(mainWindow, 'info', `Downloaded ${items.length} mission items`);

          if (missionDownloadState.timeout) {
            clearTimeout(missionDownloadState.timeout);
          }
          missionDownloadState = null;
        } else {
          // Request next item
          requestMissionItem(mainWindow, item.seq + 1);
        }
      } catch (err) {
        sendLog(mainWindow, 'error', 'Failed to parse mission item', String(err));
      }
      break;
    }

    case MSG_MISSION_REQUEST:
    case MSG_MISSION_REQUEST_INT: {
      // FC requesting mission item during upload
      if (!missionUploadState) {
        sendLog(mainWindow, 'debug', `Received MISSION_REQUEST but no upload in progress`);
        break;
      }

      try {
        // MISSION_REQUEST payload byte order:
        // Some FCs use v2 byte order (size-sorted) even in v1 packets!
        // v1 order: target_system(1), target_component(1), seq(2) - seq at offset 2
        // v2 order: seq(2), target_system(1), target_component(1), [mission_type(1)] - seq at offset 0
        let seq: number;
        const seqAtOffset0 = payload[0] | (payload[1] << 8);
        const seqAtOffset2 = payload[2] | (payload[3] << 8);

        // Check if bytes 2-3 look like GCS IDs (255, 190) - indicates v2 order
        const looksLikeV2Order = (payload[2] === 0xFF && payload[3] === 0xBE) ||
                                 (payload[2] === 0xFF && payload[3] === 0x01) ||
                                 seqAtOffset2 > 1000;  // Unreasonable seq

        if (msgid === MSG_MISSION_REQUEST_INT || looksLikeV2Order) {
          // v2 byte order: seq is at offset 0
          seq = seqAtOffset0;
        } else {
          // v1 byte order: seq is at offset 2
          seq = seqAtOffset2;
        }

        sendLog(mainWindow, 'debug', `FC requesting mission item ${seq} (msg ${msgid}, raw: ${Array.from(payload.slice(0, 4)).map(b => b.toString(16).padStart(2, '0')).join(' ')})`);

        if (seq < missionUploadState.items.length) {
          sendMissionItem(mainWindow, missionUploadState.items[seq]);
          missionUploadState.currentSeq = seq;

          // Send progress
          const progress: MissionProgress = {
            total: missionUploadState.items.length,
            transferred: seq + 1,
            operation: 'upload',
          };
          safeSend(mainWindow, IPC_CHANNELS.MISSION_PROGRESS, progress);

          // Reset timeout
          if (missionUploadState.timeout) {
            clearTimeout(missionUploadState.timeout);
          }
          missionUploadState.timeout = setTimeout(() => {
            safeSend(mainWindow, IPC_CHANNELS.MISSION_ERROR, 'Upload timeout: FC stopped requesting items');
            missionUploadState = null;
          }, 5000);
        }
      } catch (err) {
        sendLog(mainWindow, 'error', 'Failed to parse MISSION_REQUEST', String(err));
      }
      break;
    }

    case MSG_MISSION_ACK: {
      // FC acknowledged operation
      try {
        // MAVLink v1: 3 bytes (target_system, target_component, type)
        // MAVLink v2: 4 bytes (adds mission_type)
        // type is at byte offset 2
        const ackType = payload.length >= 3 ? payload[2] : 0;

        if (ackType === MAV_MISSION_RESULT.ACCEPTED) {
          if (missionUploadState) {
            const itemCount = missionUploadState.items.length;
            sendLog(mainWindow, 'info', `Mission upload complete: ${itemCount} items`);
            if (missionUploadState.timeout) {
              clearTimeout(missionUploadState.timeout);
            }
            missionUploadState = null;
            // Send upload completion event to renderer
            safeSend(mainWindow, IPC_CHANNELS.MISSION_UPLOAD_COMPLETE, itemCount);
          }
          if (missionClearPending) {
            sendLog(mainWindow, 'info', 'Mission cleared from flight controller');
            missionClearPending = false;
            // Send clear completion event to renderer
            safeSend(mainWindow, IPC_CHANNELS.MISSION_CLEAR_COMPLETE);
          }
        } else {
          // Error
          const errorMsg = getMissionResultName(ackType);
          safeSend(mainWindow, IPC_CHANNELS.MISSION_ERROR, `Mission error: ${errorMsg}`);
          sendLog(mainWindow, 'error', `Mission ACK error: ${errorMsg}`);

          if (missionUploadState) {
            if (missionUploadState.timeout) {
              clearTimeout(missionUploadState.timeout);
            }
            missionUploadState = null;
          }
          if (missionDownloadState) {
            if (missionDownloadState.timeout) {
              clearTimeout(missionDownloadState.timeout);
            }
            missionDownloadState = null;
          }
          missionClearPending = false;
        }
      } catch (err) {
        sendLog(mainWindow, 'error', 'Failed to parse MISSION_ACK', String(err));
      }
      break;
    }

    case MSG_MISSION_CURRENT: {
      // FC reports current waypoint
      // Handle both MAVLink v1 (2 bytes) and v2 (6 bytes) formats
      let seq: number;
      if (payload.length >= 2) {
        seq = payload[0] | (payload[1] << 8); // Little-endian uint16
        safeSend(mainWindow, IPC_CHANNELS.MISSION_CURRENT, seq);
      }
      break;
    }

    case MSG_MISSION_ITEM_REACHED: {
      // FC reached a waypoint
      try {
        if (payload.length >= 2) {
          const seq = payload[0] | (payload[1] << 8);
          safeSend(mainWindow, IPC_CHANNELS.MISSION_REACHED, seq);
          sendLog(mainWindow, 'info', `Reached waypoint ${seq}`);
        }
      } catch (err) {
        sendLog(mainWindow, 'error', 'Failed to parse MISSION_ITEM_REACHED', String(err));
      }
      break;
    }

    case MSG_FENCE_STATUS: {
      // FENCE_STATUS (162) - breach_status(1), breach_count(2), breach_type(1), breach_time(4)
      // Wire order (MAVLink v2 size-sorted): breach_time(4), breach_count(2), breach_status(1), breach_type(1)
      try {
        if (payload.length >= 8) {
          const status: FenceStatus = {
            breachTime: readUint32(payload, 0),
            breachCount: readUint16(payload, 4),
            breachStatus: payload[6],
            breachType: payload[7],
          };
          safeSend(mainWindow, IPC_CHANNELS.FENCE_STATUS, status);
        }
      } catch (err) {
        sendLog(mainWindow, 'error', 'Failed to parse FENCE_STATUS', String(err));
      }
      break;
    }
  }
}

// Helper: Request a mission item from FC
function requestMissionItem(mainWindow: BrowserWindow, seq: number): void {
  if (!currentTransport?.isOpen || !connectionState.isConnected) return;

  let packet: Uint8Array;
  const targetSystem = connectionState.systemId ?? 1;

  if (detectedMavlinkVersion === 2) {
    // MAVLink v2: Use MISSION_REQUEST_INT (preferred, higher precision)
    const payload = serializeMissionRequestInt({
      targetSystem,
      targetComponent: 1,
      seq,
      missionType: MAV_MISSION_TYPE.MISSION,
    });
    packet = serializeV2(MISSION_REQUEST_INT_ID, payload, MISSION_REQUEST_INT_CRC_EXTRA, { sysid: 255, compid: 190 });
  } else {
    // MAVLink v1 packet but use v2 byte order (size-sorted) for payload!
    // ArduPilot uses v2 byte order internally regardless of packet format.
    // v2 order: seq(2), target_system(1), target_component(1) - no mission_type for v1
    // Use v1 CRC_EXTRA (230) instead of v2 (177)
    const payload = new Uint8Array(4);
    payload[0] = seq & 0xff;              // seq low byte
    payload[1] = (seq >> 8) & 0xff;       // seq high byte
    payload[2] = targetSystem & 0xff;     // target_system
    payload[3] = 1;                       // target_component
    packet = serializeV1(MISSION_REQUEST_ID, payload, MISSION_REQUEST_CRC_EXTRA_V1, { sysid: 255, compid: 190 });
  }

  sendLog(mainWindow, 'debug', `Requesting mission item ${seq} (MAVLink v${detectedMavlinkVersion})`);

  currentTransport.write(packet).catch(err => {
    sendLog(mainWindow, 'error', `Failed to request mission item ${seq}`, String(err));
  });
}

// Helper: Send a mission item to FC
function sendMissionItem(mainWindow: BrowserWindow, item: MissionItem): void {
  if (!currentTransport?.isOpen || !connectionState.isConnected) return;

  let packet: Uint8Array;
  const targetSystem = connectionState.systemId ?? 1;

  if (detectedMavlinkVersion === 2) {
    // MAVLink v2: Use MISSION_ITEM_INT (preferred, higher precision)
    const payload = serializeMissionItemInt({
      targetSystem,
      targetComponent: 1,
      seq: item.seq,
      frame: item.frame,
      command: item.command,
      current: item.current ? 1 : 0,
      autocontinue: item.autocontinue ? 1 : 0,
      param1: item.param1,
      param2: item.param2,
      param3: item.param3,
      param4: item.param4,
      x: Math.round(item.latitude * 1e7),
      y: Math.round(item.longitude * 1e7),
      z: item.altitude,
      missionType: MAV_MISSION_TYPE.MISSION,
    });
    packet = serializeV2(MISSION_ITEM_INT_ID, payload, MISSION_ITEM_INT_CRC_EXTRA, { sysid: 255, compid: 190 });
  } else {
    // MAVLink v1: Use MISSION_ITEM (legacy format with float lat/lon)
    // v1 payload is 37 bytes (no mission_type), v2 is 38 bytes
    const fullPayload = serializeMissionItem({
      targetSystem,
      targetComponent: 1,
      seq: item.seq,
      frame: item.frame,
      command: item.command,
      current: item.current ? 1 : 0,
      autocontinue: item.autocontinue ? 1 : 0,
      param1: item.param1,
      param2: item.param2,
      param3: item.param3,
      param4: item.param4,
      x: item.latitude,  // Float format for v1
      y: item.longitude,
      z: item.altitude,
      missionType: 0, // Ignored for v1
    });
    // Slice off the last byte (mission_type) for v1
    // Use v1 CRC_EXTRA (254) instead of v2 (95)
    const payload = fullPayload.slice(0, 37);
    packet = serializeV1(MISSION_ITEM_ID, payload, MISSION_ITEM_CRC_EXTRA_V1, { sysid: 255, compid: 190 });
  }

  sendLog(mainWindow, 'debug', `Sending mission item ${item.seq} (MAVLink v${detectedMavlinkVersion})`);

  currentTransport.write(packet).catch(err => {
    sendLog(mainWindow, 'error', `Failed to send mission item ${item.seq}`, String(err));
  });
}

// Helper: Send mission ACK
function sendMissionAck(mainWindow: BrowserWindow, result: number): void {
  if (!currentTransport?.isOpen || !connectionState.isConnected) return;

  let packet: Uint8Array;
  const targetSystem = connectionState.systemId ?? 1;

  if (detectedMavlinkVersion === 2) {
    const payload = serializeMissionAck({
      targetSystem,
      targetComponent: 1,
      type: result,
      missionType: MAV_MISSION_TYPE.MISSION,
    });
    packet = serializeV2(MISSION_ACK_ID, payload, MISSION_ACK_CRC_EXTRA, { sysid: 255, compid: 190 });
  } else {
    // MAVLink v1: 3 bytes (no mission_type)
    // Use v1 CRC_EXTRA (153) instead of v2 (146)
    const payload = new Uint8Array(3);
    payload[0] = targetSystem & 0xff;
    payload[1] = 1; // target_component
    payload[2] = result & 0xff;
    packet = serializeV1(MISSION_ACK_ID, payload, MISSION_ACK_CRC_EXTRA_V1, { sysid: 255, compid: 190 });
  }

  currentTransport.write(packet).catch(err => {
    sendLog(mainWindow, 'error', 'Failed to send mission ACK', String(err));
  });
}

// Helper: Get human-readable mission result name
function getMissionResultName(result: number): string {
  const names: Record<number, string> = {
    [MAV_MISSION_RESULT.ACCEPTED]: 'Accepted',
    [MAV_MISSION_RESULT.ERROR]: 'General error',
    [MAV_MISSION_RESULT.UNSUPPORTED_FRAME]: 'Unsupported frame',
    [MAV_MISSION_RESULT.UNSUPPORTED]: 'Unsupported command',
    [MAV_MISSION_RESULT.NO_SPACE]: 'No space on vehicle',
    [MAV_MISSION_RESULT.INVALID]: 'Invalid mission item',
    [MAV_MISSION_RESULT.INVALID_PARAM1]: 'Invalid param1',
    [MAV_MISSION_RESULT.INVALID_PARAM2]: 'Invalid param2',
    [MAV_MISSION_RESULT.INVALID_PARAM3]: 'Invalid param3',
    [MAV_MISSION_RESULT.INVALID_PARAM4]: 'Invalid param4',
    [MAV_MISSION_RESULT.INVALID_PARAM5_X]: 'Invalid x/latitude',
    [MAV_MISSION_RESULT.INVALID_PARAM6_Y]: 'Invalid y/longitude',
    [MAV_MISSION_RESULT.INVALID_PARAM7]: 'Invalid z/altitude',
    [MAV_MISSION_RESULT.INVALID_SEQUENCE]: 'Invalid sequence',
    [MAV_MISSION_RESULT.DENIED]: 'Denied',
    [MAV_MISSION_RESULT.OPERATION_CANCELLED]: 'Operation cancelled',
  };
  return names[result] || `Unknown error (${result})`;
}

export function setupIpcHandlers(mainWindow: BrowserWindow): void {
  // List available serial ports
  ipcMain.handle(IPC_CHANNELS.COMMS_LIST_PORTS, async (): Promise<SerialPortInfo[]> => {
    return listSerialPorts();
  });

  // Scan ports for MAVLink devices
  ipcMain.handle(IPC_CHANNELS.COMMS_SCAN_PORTS, async (): Promise<ScanResult[]> => {
    return scanPorts({
      onProgress: (port, baudRate, status) => {
        safeSend(mainWindow, 'scan:progress', { port, baudRate, status });
      },
    });
  });

  // Port watcher for detecting new devices (with safety measures)
  let portWatchInterval: ReturnType<typeof setInterval> | null = null;
  let lastKnownPorts: string[] = [];
  let portWatchErrorCount = 0;
  const PORT_WATCH_INTERVAL = 5000; // 5 seconds - safer for USB drivers
  const PORT_WATCH_MAX_ERRORS = 3; // Stop watching after 3 consecutive errors

  const stopPortWatcher = () => {
    if (portWatchInterval) {
      clearInterval(portWatchInterval);
      portWatchInterval = null;
      portWatchErrorCount = 0;
      console.log('[PortWatcher] Stopped');
    }
  };

  ipcMain.handle(IPC_CHANNELS.COMMS_START_PORT_WATCH, async (): Promise<void> => {
    // Don't start if already connected - no need to watch for new ports
    if (currentTransport) {
      console.log('[PortWatcher] Skipping - already connected');
      return;
    }

    // Stop any existing watcher
    stopPortWatcher();

    // Initialize with current ports (with error handling)
    try {
      const ports = await listSerialPorts();
      lastKnownPorts = ports.map(p => p.path);
    } catch (error) {
      console.error('[PortWatcher] Failed to get initial port list:', error);
      lastKnownPorts = [];
    }

    // Poll for new ports every 5 seconds (safer interval)
    portWatchInterval = setInterval(async () => {
      // Safety: Don't poll if we're now connected
      if (currentTransport) {
        console.log('[PortWatcher] Auto-stopping - connection established');
        stopPortWatcher();
        return;
      }

      try {
        const currentPorts = await listSerialPorts();
        const currentPaths = currentPorts.map(p => p.path);

        // Find new ports
        const newPorts = currentPorts.filter(p => !lastKnownPorts.includes(p.path));

        // Find removed ports
        const removedPorts = lastKnownPorts.filter(p => !currentPaths.includes(p));

        if (newPorts.length > 0) {
          console.log('[PortWatcher] New ports detected:', newPorts.map(p => p.path));
          safeSend(mainWindow, IPC_CHANNELS.COMMS_NEW_PORT, { newPorts, removedPorts: [] });
        }

        if (removedPorts.length > 0) {
          console.log('[PortWatcher] Ports removed:', removedPorts);
          safeSend(mainWindow, IPC_CHANNELS.COMMS_NEW_PORT, { newPorts: [], removedPorts });
        }

        lastKnownPorts = currentPaths;
        portWatchErrorCount = 0; // Reset error count on success
      } catch (error) {
        portWatchErrorCount++;
        console.error(`[PortWatcher] Error polling ports (${portWatchErrorCount}/${PORT_WATCH_MAX_ERRORS}):`, error);

        // Stop watching if too many consecutive errors (driver might be unstable)
        if (portWatchErrorCount >= PORT_WATCH_MAX_ERRORS) {
          console.error('[PortWatcher] Too many errors, stopping to prevent system instability');
          stopPortWatcher();
        }
      }
    }, PORT_WATCH_INTERVAL);

    console.log('[PortWatcher] Started (interval: 5s, auto-stops when connected)');
  });

  ipcMain.handle(IPC_CHANNELS.COMMS_STOP_PORT_WATCH, async (): Promise<void> => {
    stopPortWatcher();
  });

  // Connect to a device
  ipcMain.handle(IPC_CHANNELS.COMMS_CONNECT, async (_, options: ConnectOptions): Promise<boolean> => {
    // Clear any existing heartbeat timeout
    if (heartbeatTimeout) {
      clearTimeout(heartbeatTimeout);
      heartbeatTimeout = null;
    }

    // BSOD FIX: Clean up existing listeners before closing
    cleanupTransportListeners();

    // Disconnect existing connection
    if (currentTransport?.isOpen) {
      await currentTransport.close();
    }
    currentTransport = null;

    // BSOD FIX: Wait for driver to fully release port resources
    // Windows USB-serial drivers (CH340, CP210x, FTDI) need time to cleanup
    await new Promise(r => setTimeout(r, 500));

    try {
      // Create appropriate transport
      let transportName = '';
      switch (options.type) {
        case 'serial':
          if (!options.port) throw new Error('Port required for serial connection');
          currentTransport = new SerialTransport(options.port, {
            baudRate: options.baudRate ?? 115200,
          });
          transportName = `${options.port} @ ${options.baudRate ?? 115200}`;
          break;
        case 'tcp':
          if (!options.host || !options.tcpPort) throw new Error('Host and port required for TCP');
          currentTransport = new TcpTransport({
            host: options.host,
            port: options.tcpPort,
          });
          transportName = `TCP ${options.host}:${options.tcpPort}`;
          break;
        case 'udp':
          currentTransport = new UdpTransport({
            localPort: options.udpPort ?? 14550,
          });
          transportName = `UDP :${options.udpPort ?? 14550}`;
          break;
      }

      sendLog(mainWindow, 'info', `Opening ${transportName}...`);

      // Create parser
      mavlinkParser = new MAVLinkParser();

      // BSOD FIX: MAVLink data handler with backpressure to prevent event loop starvation
      // Stored at module level so we can properly remove it on disconnect
      mavlinkDataHandler = async (data: Uint8Array) => {
        if (!mavlinkParser) return;

        // BSOD FIX: Queue data and process with backpressure
        pendingMavlinkData.push(data);

        // Skip if already processing - prevents overlapping async loops
        if (processingMavlink) return;
        processingMavlink = true;

        try {
          while (pendingMavlinkData.length > 0) {
            const chunk = pendingMavlinkData.shift()!;

            for await (const packet of mavlinkParser.parse(chunk)) {
              connectionState.packetsReceived++;

              // Handle heartbeat (msgid 0)
              if (packet.msgid === 0) {
                // Detect MAVLink version from packet format
                detectedMavlinkVersion = packet.isMavlink2 ? 2 : 1;

                // Parse heartbeat payload: type(1), autopilot(1), base_mode(1), custom_mode(4), system_status(1), mavlink_version(1)
                const vehicleType = packet.payload[0];
                const autopilotType = packet.payload[1];

                // First heartbeat - connection confirmed!
                if (connectionState.isWaitingForHeartbeat) {
                  if (heartbeatTimeout) {
                    clearTimeout(heartbeatTimeout);
                    heartbeatTimeout = null;
                  }

                  connectionState.isWaitingForHeartbeat = false;
                  connectionState.isConnected = true;
                  connectionState.protocol = 'mavlink';
                  connectionState.systemId = packet.sysid;
                  connectionState.componentId = packet.compid;
                  connectionState.autopilot = AUTOPILOT_NAMES[autopilotType] || `Unknown (${autopilotType})`;
                  connectionState.vehicleType = VEHICLE_NAMES[vehicleType] || `Unknown (${vehicleType})`;
                  connectionState.mavType = vehicleType;

                  sendLog(mainWindow, 'info', `Connected to ${connectionState.autopilot} ${connectionState.vehicleType}`, `System ID: ${packet.sysid}, Component ID: ${packet.compid}, MAVLink v${detectedMavlinkVersion}`);
                  sendConnectionState(mainWindow);
                }
              }

              // Parse telemetry data from known message types
              parseTelemetry(mainWindow, packet);

              // Log packets (limit to not spam)
              if (connectionState.packetsReceived <= 10 || connectionState.packetsReceived % 100 === 0) {
                sendLog(mainWindow, 'packet', `MSG #${packet.msgid}`, `sysid=${packet.sysid} compid=${packet.compid} seq=${packet.seq} len=${packet.payload.length}`);
              }

              // Send packet to renderer
              safeSend(mainWindow, IPC_CHANNELS.MAVLINK_PACKET, {
                msgid: packet.msgid,
                sysid: packet.sysid,
                compid: packet.compid,
                seq: packet.seq,
                payload: Array.from(packet.payload),
              });

              // Update packet count periodically
              if (connectionState.packetsReceived % 50 === 0) {
                sendConnectionState(mainWindow);
              }
            }

            // BSOD FIX: Yield to event loop between chunks to prevent starvation
            if (pendingMavlinkData.length > 0) {
              await new Promise(r => setImmediate(r));
            }
          }
        } finally {
          processingMavlink = false;
        }
      };

      // Setup data handler
      currentTransport.on('data', mavlinkDataHandler);

      // BSOD FIX: Store handler references for proper cleanup
      transportErrorHandler = (error: Error) => {
        console.error('Transport error:', error);
        sendLog(mainWindow, 'error', 'Transport error', error.message);
        safeSend(mainWindow, 'connection:error', error.message);
      };
      currentTransport.on('error', transportErrorHandler);

      // BSOD FIX: Store handler references for proper cleanup
      transportCloseHandler = () => {
        if (heartbeatTimeout) {
          clearTimeout(heartbeatTimeout);
          heartbeatTimeout = null;
        }
        connectionState.isConnected = false;
        connectionState.isWaitingForHeartbeat = false;
        sendLog(mainWindow, 'info', 'Connection closed');
        sendConnectionState(mainWindow);
      };
      currentTransport.on('close', transportCloseHandler);

      // Open connection
      await currentTransport.open();

      // If protocol is forced to MSP, skip MAVLink detection entirely
      if (options.protocol === 'msp') {
        sendLog(mainWindow, 'info', `Port opened, using MSP protocol (forced)...`);

        // Don't set up MAVLink handler at all
        mavlinkParser = null;
        mavlinkDataHandler = null;

        // Set state to connecting (NOT waiting for heartbeat)
        connectionState = {
          isConnected: false,
          isWaitingForHeartbeat: false,
          transport: transportName,
          packetsReceived: 0,
          packetsSent: 0,
        };
        sendConnectionState(mainWindow);

        // Go directly to MSP detection
        const mspInfo = await tryMspDetection(currentTransport, mainWindow);

        if (mspInfo) {
          const isLegacy = isLegacyMspBoard(mspInfo.fcVariant, mspInfo.fcVersion);
          sendLog(mainWindow, 'info', `Connected to ${mspInfo.fcVariant} ${mspInfo.fcVersion}${isLegacy ? ' (Legacy - CLI only)' : ''}`, `Board: ${mspInfo.boardId}`);

          connectionState = {
            isConnected: true,
            isWaitingForHeartbeat: false,
            protocol: 'msp',
            transport: transportName,
            fcVariant: mspInfo.fcVariant,
            fcVersion: mspInfo.fcVersion,
            boardId: mspInfo.boardId,
            apiVersion: mspInfo.apiVersion,
            autopilot: mspInfo.fcVariant,
            vehicleType: 'Multirotor',
            isLegacyBoard: isLegacy,
            packetsReceived: connectionState.packetsReceived,
            packetsSent: connectionState.packetsSent,
          };
          sendConnectionState(mainWindow);
          return true;
        } else {
          const errorMsg = 'Device did not respond to MSP protocol.';
          sendLog(mainWindow, 'error', 'MSP detection failed', errorMsg);
          safeSend(mainWindow, 'connection:error', errorMsg);
          currentTransport?.close();
          return false;
        }
      }

      sendLog(mainWindow, 'info', `Port opened, waiting for MAVLink heartbeat...`);

      // Set state to waiting for heartbeat (NOT connected yet)
      connectionState = {
        isConnected: false,
        isWaitingForHeartbeat: true,
        transport: transportName,
        packetsReceived: 0,
        packetsSent: 0,
      };
      sendConnectionState(mainWindow);

      // Set heartbeat timeout - try MSP if no MAVLink heartbeat
      heartbeatTimeout = setTimeout(async () => {
        if (connectionState.isWaitingForHeartbeat && currentTransport?.isOpen) {
          sendLog(mainWindow, 'info', 'No MAVLink heartbeat, trying MSP protocol...');

          // IMPORTANT: Remove MAVLink handler before trying MSP
          // BSOD FIX: Use stored handler reference and clear it
          if (mavlinkDataHandler) {
            currentTransport.removeListener('data', mavlinkDataHandler);
            mavlinkDataHandler = null;
          }
          mavlinkParser = null;
          processingMavlink = false;
          pendingMavlinkData.length = 0;

          // Try MSP detection
          const mspInfo = await tryMspDetection(currentTransport, mainWindow);

          if (mspInfo) {
            // MSP detected! Update connection state
            const isLegacy = isLegacyMspBoard(mspInfo.fcVariant, mspInfo.fcVersion);
            sendLog(mainWindow, 'info', `Connected to ${mspInfo.fcVariant} ${mspInfo.fcVersion}${isLegacy ? ' (Legacy - CLI only)' : ''}`, `Board: ${mspInfo.boardId}`);

            connectionState = {
              isConnected: true,
              isWaitingForHeartbeat: false,
              protocol: 'msp',
              transport: transportName,
              fcVariant: mspInfo.fcVariant,
              fcVersion: mspInfo.fcVersion,
              boardId: mspInfo.boardId,
              apiVersion: mspInfo.apiVersion,
              autopilot: mspInfo.fcVariant, // Show variant as autopilot
              vehicleType: 'Multirotor', // MSP boards are typically multirotors
              isLegacyBoard: isLegacy,
              packetsReceived: connectionState.packetsReceived,
              packetsSent: connectionState.packetsSent,
            };
            sendConnectionState(mainWindow);

            // NOTE: MSP telemetry is NOT auto-started here.
            // The renderer will start/stop telemetry based on which view is active.
            // This prevents wasted polling when user is on config screens.
          } else {
            // Neither MAVLink nor MSP
            const errorMsg = 'Device did not respond to MAVLink or MSP. Check connection.';
            sendLog(mainWindow, 'error', 'No protocol detected', errorMsg);
            safeSend(mainWindow, 'connection:error', errorMsg);
            connectionState.isWaitingForHeartbeat = false;
            sendConnectionState(mainWindow);
            currentTransport?.close();
          }
        }
      }, 2500); // Shorter timeout, then try MSP

      return true;
    } catch (error) {
      console.error('Connection failed:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Connection failed', message);
      currentTransport = null;
      mavlinkParser = null;
      return false;
    }
  });

  // Disconnect
  ipcMain.handle(IPC_CHANNELS.COMMS_DISCONNECT, async (): Promise<void> => {
    try {
      // Full cleanup of MSP connection (stops telemetry AND clears transport)
      cleanupMspConnection();

      // BSOD FIX: Clean up all event listeners BEFORE closing transport
      // This prevents orphaned handlers that accumulate on reconnect cycles
      cleanupTransportListeners();

      // Clear heartbeat timeout to prevent reconnection attempts
      if (heartbeatTimeout) {
        clearTimeout(heartbeatTimeout);
        heartbeatTimeout = null;
      }

      if (currentTransport?.isOpen) {
        try {
          await currentTransport.close();
        } catch (closeErr) {
          // Transport may already be closed or in bad state - ignore
          console.warn('[Disconnect] Transport close error (ignoring):', closeErr);
        }
      }
    } catch (error) {
      // Log but don't crash on disconnect errors
      console.error('[Disconnect] Error during disconnect:', error);
    } finally {
      // Always reset state, even if errors occurred
      currentTransport = null;
      mavlinkParser = null;
      connectionState = {
        isConnected: false,
        packetsReceived: 0,
        packetsSent: 0,
      };
      sendConnectionState(mainWindow);
    }
  });

  // Send MAVLink message
  ipcMain.handle(IPC_CHANNELS.MAVLINK_SEND, async (_, payload: number[]): Promise<boolean> => {
    if (!currentTransport?.isOpen) {
      return false;
    }

    try {
      await currentTransport.write(new Uint8Array(payload));
      connectionState.packetsSent++;
      return true;
    } catch (error) {
      console.error('Send failed:', error);
      return false;
    }
  });

  // Layout management handlers
  ipcMain.handle(IPC_CHANNELS.LAYOUT_GET_ALL, async (): Promise<Record<string, SavedLayout>> => {
    return layoutStore.get('layouts', {});
  });

  ipcMain.handle(IPC_CHANNELS.LAYOUT_GET, async (_, name: string): Promise<SavedLayout | null> => {
    const layouts = layoutStore.get('layouts', {});
    return layouts[name] || null;
  });

  ipcMain.handle(IPC_CHANNELS.LAYOUT_SAVE, async (_, name: string, data: unknown): Promise<void> => {
    const layouts = layoutStore.get('layouts', {});
    const now = Date.now();
    const existing = layouts[name];

    layouts[name] = {
      name,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      data,
    };

    layoutStore.set('layouts', layouts);
  });

  ipcMain.handle(IPC_CHANNELS.LAYOUT_DELETE, async (_, name: string): Promise<void> => {
    const layouts = layoutStore.get('layouts', {});
    delete layouts[name];
    layoutStore.set('layouts', layouts);

    // If deleted layout was active, reset to default
    if (layoutStore.get('activeLayout') === name) {
      layoutStore.set('activeLayout', 'default');
    }
  });

  ipcMain.handle(IPC_CHANNELS.LAYOUT_SET_ACTIVE, async (_, name: string): Promise<void> => {
    layoutStore.set('activeLayout', name);
  });

  ipcMain.handle(IPC_CHANNELS.LAYOUT_GET_ACTIVE, async (): Promise<string> => {
    return layoutStore.get('activeLayout', 'default');
  });

  // Settings/Vehicle profile handlers
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, async (): Promise<SettingsStoreSchema> => {
    return settingsStore.store;
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SAVE, async (_, settings: SettingsStoreSchema): Promise<void> => {
    settingsStore.set(settings);
  });

  // Parameter management handlers

  // Request all parameters from flight controller
  ipcMain.handle(IPC_CHANNELS.PARAM_REQUEST_ALL, async (): Promise<{ success: boolean; error?: string }> => {
    if (!currentTransport?.isOpen || !connectionState.isConnected) {
      return { success: false, error: 'Not connected' };
    }

    // Reset parameter tracking state
    receivedParams.clear();
    expectedParamCount = 0;

    // Clear any existing timeout
    if (paramDownloadTimeout) {
      clearTimeout(paramDownloadTimeout);
    }

    try {
      // Build PARAM_REQUEST_LIST message
      // Use target component 1 (MAV_COMP_ID_AUTOPILOT1) for the main autopilot
      // Note: Can't use 0 because MAVLink v2 trims trailing zeros from payload
      const targetSys = connectionState.systemId ?? 1;
      const targetComp = 1; // MAV_COMP_ID_AUTOPILOT1

      const payload = serializeParamRequestList({
        targetSystem: targetSys,
        targetComponent: targetComp,
      });

      // Use detected MAVLink version for compatibility
      const packet = detectedMavlinkVersion === 2
        ? serializeV2(PARAM_REQUEST_LIST_ID, payload, PARAM_REQUEST_LIST_CRC_EXTRA, { sysid: 255, compid: 190 })
        : serializeV1(PARAM_REQUEST_LIST_ID, payload, PARAM_REQUEST_LIST_CRC_EXTRA, { sysid: 255, compid: 190 });
      await currentTransport.write(packet);
      connectionState.packetsSent++;

      sendLog(mainWindow, 'info', 'Requesting parameters from flight controller...');

      // Set initial timeout (30 seconds for first response)
      paramDownloadTimeout = setTimeout(() => {
        if (receivedParams.size === 0) {
          safeSend(mainWindow, IPC_CHANNELS.PARAM_ERROR,
            'Timeout: no parameters received after 30 seconds');
        }
      }, 30000);

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Failed to request parameters', message);
      return { success: false, error: message };
    }
  });

  // Set a single parameter
  ipcMain.handle(IPC_CHANNELS.PARAM_SET, async (_, paramId: string, value: number, type: number): Promise<{ success: boolean; error?: string }> => {
    if (!currentTransport?.isOpen || !connectionState.isConnected) {
      return { success: false, error: 'Not connected' };
    }

    try {
      // Build PARAM_SET message
      const payload = serializeParamSet({
        targetSystem: connectionState.systemId ?? 1,
        targetComponent: 1, // MAV_COMP_ID_AUTOPILOT1
        paramId,
        paramValue: value,
        paramType: type,
      });

      // Use detected MAVLink version for compatibility
      const packet = detectedMavlinkVersion === 2
        ? serializeV2(PARAM_SET_ID, payload, PARAM_SET_CRC_EXTRA, { sysid: 255, compid: 190 })
        : serializeV1(PARAM_SET_ID, payload, PARAM_SET_CRC_EXTRA, { sysid: 255, compid: 190 });

      await currentTransport.write(packet);
      connectionState.packetsSent++;

      sendLog(mainWindow, 'info', `Setting parameter ${paramId} = ${value}`);

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', `Failed to set parameter ${paramId}`, message);
      return { success: false, error: message };
    }
  });

  // Fetch parameter metadata from ArduPilot
  ipcMain.handle(IPC_CHANNELS.PARAM_METADATA_FETCH, async (_, mavType: number): Promise<{ success: boolean; metadata?: ParameterMetadataStore; error?: string }> => {
    const vehicleType = mavTypeToVehicleType(mavType);
    if (!vehicleType) {
      return { success: false, error: `Unknown vehicle type: ${mavType}` };
    }

    // Check cache first
    const cached = metadataCache.get(vehicleType);
    if (cached) {
      sendLog(mainWindow, 'info', `Using cached parameter metadata for ${vehicleType}`);
      return { success: true, metadata: cached };
    }

    const url = PARAMETER_METADATA_URLS[vehicleType];
    sendLog(mainWindow, 'info', `Fetching parameter metadata from ${url}...`);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const xml = await response.text();
      const metadata = parseParameterXml(xml);

      // Cache it
      metadataCache.set(vehicleType, metadata);

      sendLog(mainWindow, 'info', `Loaded ${Object.keys(metadata).length} parameter definitions for ${vehicleType}`);
      return { success: true, metadata };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', `Failed to fetch parameter metadata`, message);
      return { success: false, error: message };
    }
  });

  // Write parameters to flash (persistent storage)
  // Sends MAV_CMD_PREFLIGHT_STORAGE (245) with param1=1 (write all)
  ipcMain.handle(IPC_CHANNELS.PARAM_WRITE_FLASH, async (): Promise<{ success: boolean; error?: string }> => {
    if (!currentTransport?.isOpen || !connectionState.isConnected) {
      return { success: false, error: 'Not connected' };
    }

    try {
      // MAV_CMD_PREFLIGHT_STORAGE = 245
      // param1 = 1 (MAV_PFS_CMD_WRITE_ALL - write all params to storage)
      const payload = serializeCommandLong({
        targetSystem: connectionState.systemId ?? 1,
        targetComponent: 1, // MAV_COMP_ID_AUTOPILOT1
        command: 245, // MAV_CMD_PREFLIGHT_STORAGE
        confirmation: 0,
        param1: 1, // MAV_PFS_CMD_WRITE_ALL
        param2: 0,
        param3: 0,
        param4: 0,
        param5: 0,
        param6: 0,
        param7: 0,
      });

      const packet = detectedMavlinkVersion === 2
        ? serializeV2(COMMAND_LONG_ID, payload, COMMAND_LONG_CRC_EXTRA, { sysid: 255, compid: 190 })
        : serializeV1(COMMAND_LONG_ID, payload, COMMAND_LONG_CRC_EXTRA, { sysid: 255, compid: 190 });

      await currentTransport.write(packet);
      connectionState.packetsSent++;

      sendLog(mainWindow, 'info', 'Writing parameters to flash...');
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Failed to write parameters to flash', message);
      return { success: false, error: message };
    }
  });

  // Save parameters to file
  ipcMain.handle(IPC_CHANNELS.PARAM_SAVE_FILE, async (_, params: Array<{ id: string; value: number }>): Promise<{ success: boolean; error?: string; filePath?: string }> => {
    try {
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Parameters',
        defaultPath: 'parameters.param',
        filters: [
          { name: 'Parameter Files', extensions: ['param'] },
          { name: 'Text Files', extensions: ['txt'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (result.canceled || !result.filePath) {
        return { success: false, error: 'Cancelled' };
      }

      // Format: PARAM_NAME,VALUE (one per line)
      const content = params.map(p => `${p.id},${p.value}`).join('\n');

      const fs = await import('fs/promises');
      await fs.writeFile(result.filePath, content, 'utf-8');

      sendLog(mainWindow, 'info', `Saved ${params.length} parameters to ${result.filePath}`);
      return { success: true, filePath: result.filePath };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Failed to save parameters', message);
      return { success: false, error: message };
    }
  });

  // Load parameters from file
  ipcMain.handle(IPC_CHANNELS.PARAM_LOAD_FILE, async (): Promise<{ success: boolean; error?: string; params?: Array<{ id: string; value: number }> }> => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Load Parameters',
        filters: [
          { name: 'Parameter Files', extensions: ['param'] },
          { name: 'Text Files', extensions: ['txt'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile'],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: 'Cancelled' };
      }

      const filePath = result.filePaths[0];
      const fs = await import('fs/promises');
      const content = await fs.readFile(filePath, 'utf-8');

      // Parse: PARAM_NAME,VALUE (one per line)
      // Also supports PARAM_NAME VALUE (space-separated, like Mission Planner)
      const params: Array<{ id: string; value: number }> = [];
      const lines = content.split(/\r?\n/);

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue; // Skip empty lines and comments

        // Try comma-separated first, then space/tab
        let parts = trimmed.split(',');
        if (parts.length < 2) {
          parts = trimmed.split(/\s+/);
        }

        if (parts.length >= 2) {
          const id = parts[0].trim();
          const value = parseFloat(parts[1].trim());

          if (id && !isNaN(value)) {
            params.push({ id, value });
          }
        }
      }

      sendLog(mainWindow, 'info', `Loaded ${params.length} parameters from ${filePath}`);
      return { success: true, params };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Failed to load parameters', message);
      return { success: false, error: message };
    }
  });

  // ============================================================================
  // Mission Planning handlers
  // ============================================================================

  // Download mission from flight controller
  ipcMain.handle(IPC_CHANNELS.MISSION_DOWNLOAD, async (): Promise<{ success: boolean; error?: string }> => {
    if (!currentTransport?.isOpen || !connectionState.isConnected) {
      return { success: false, error: 'Not connected' };
    }

    // Initialize download state
    missionDownloadState = {
      expected: 0,
      received: new Map(),
      timeout: null,
    };

    try {
      // Send MISSION_REQUEST_LIST to start download
      // v1: target_system(1), target_component(1) = 2 bytes
      // v2: target_system(1), target_component(1), mission_type(1) = 3 bytes
      let packet: Uint8Array;
      const targetSystem = connectionState.systemId ?? 1;

      if (detectedMavlinkVersion === 2) {
        const payload = serializeMissionRequestList({
          targetSystem,
          targetComponent: 1,
          missionType: MAV_MISSION_TYPE.MISSION,
        });
        packet = serializeV2(MISSION_REQUEST_LIST_ID, payload, MISSION_REQUEST_LIST_CRC_EXTRA, { sysid: 255, compid: 190 });
      } else {
        // MAVLink v1: manual payload (no mission_type)
        // Use v1 CRC_EXTRA (132) instead of v2 (148)
        const payload = new Uint8Array(2);
        payload[0] = targetSystem & 0xff;
        payload[1] = 1; // target_component
        packet = serializeV1(MISSION_REQUEST_LIST_ID, payload, MISSION_REQUEST_LIST_CRC_EXTRA_V1, { sysid: 255, compid: 190 });
      }

      await currentTransport.write(packet);
      connectionState.packetsSent++;

      sendLog(mainWindow, 'info', `Requesting mission from flight controller (MAVLink v${detectedMavlinkVersion})...`);

      // Set initial timeout
      missionDownloadState.timeout = setTimeout(() => {
        if (missionDownloadState && missionDownloadState.received.size === 0) {
          safeSend(mainWindow, IPC_CHANNELS.MISSION_ERROR, 'Timeout: no response from flight controller');
          missionDownloadState = null;
        }
      }, 10000);

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Failed to request mission', message);
      missionDownloadState = null;
      return { success: false, error: message };
    }
  });

  // Upload mission to flight controller
  ipcMain.handle(IPC_CHANNELS.MISSION_UPLOAD, async (_, items: MissionItem[]): Promise<{ success: boolean; error?: string }> => {
    if (!currentTransport?.isOpen || !connectionState.isConnected) {
      return { success: false, error: 'Not connected' };
    }

    if (items.length === 0) {
      return { success: false, error: 'No mission items to upload' };
    }

    // Initialize upload state
    missionUploadState = {
      items,
      currentSeq: 0,
      timeout: null,
    };

    try {
      // Send MISSION_COUNT to start upload
      // MAVLink v1 and v2 have different payload formats:
      // v1: target_system(1), target_component(1), count(2) = 4 bytes (declaration order)
      // v2: count(2), target_system(1), target_component(1), mission_type(1) = 5 bytes (size order)
      let packet: Uint8Array;
      const targetSystem = connectionState.systemId ?? 1;

      if (detectedMavlinkVersion === 2) {
        const payload = serializeMissionCount({
          targetSystem,
          targetComponent: 1,
          count: items.length,
          missionType: MAV_MISSION_TYPE.MISSION,
        });
        packet = serializeV2(MISSION_COUNT_ID, payload, MISSION_COUNT_CRC_EXTRA, { sysid: 255, compid: 190 });
      } else {
        // MAVLink v1 packet but use v2 byte order (size-sorted) for payload!
        // ArduPilot uses v2 byte order internally regardless of packet format.
        // v2 order: count(2), target_system(1), target_component(1) - no mission_type for v1
        const payload = new Uint8Array(4);
        payload[0] = items.length & 0xff;         // count low byte
        payload[1] = (items.length >> 8) & 0xff;  // count high byte
        payload[2] = targetSystem & 0xff;         // target_system
        payload[3] = 1;                           // target_component
        packet = serializeV1(MISSION_COUNT_ID, payload, MISSION_COUNT_CRC_EXTRA_V1, { sysid: 255, compid: 190 });
      }

      await currentTransport.write(packet);
      connectionState.packetsSent++;

      // Log raw bytes for debugging
      const hexBytes = Array.from(packet).map(b => b.toString(16).padStart(2, '0')).join(' ');
      sendLog(mainWindow, 'debug', `Sent MISSION_COUNT: ${hexBytes}`);
      sendLog(mainWindow, 'info', `Uploading ${items.length} mission items (MAVLink v${detectedMavlinkVersion})...`);

      // Set timeout waiting for FC to request first item
      missionUploadState.timeout = setTimeout(() => {
        if (missionUploadState && missionUploadState.currentSeq === 0) {
          safeSend(mainWindow, IPC_CHANNELS.MISSION_ERROR, 'Timeout: FC did not request mission items');
          missionUploadState = null;
        }
      }, 10000);

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Failed to upload mission', message);
      missionUploadState = null;
      return { success: false, error: message };
    }
  });

  // Clear mission from flight controller
  ipcMain.handle(IPC_CHANNELS.MISSION_CLEAR, async (): Promise<{ success: boolean; error?: string }> => {
    if (!currentTransport?.isOpen || !connectionState.isConnected) {
      return { success: false, error: 'Not connected' };
    }

    try {
      // v1: target_system(1), target_component(1) = 2 bytes
      // v2: target_system(1), target_component(1), mission_type(1) = 3 bytes
      let packet: Uint8Array;
      const targetSystem = connectionState.systemId ?? 1;

      if (detectedMavlinkVersion === 2) {
        const payload = serializeMissionClearAll({
          targetSystem,
          targetComponent: 1,
          missionType: MAV_MISSION_TYPE.MISSION,
        });
        packet = serializeV2(MISSION_CLEAR_ALL_ID, payload, MISSION_CLEAR_ALL_CRC_EXTRA, { sysid: 255, compid: 190 });
      } else {
        // MAVLink v1: manual payload (no mission_type)
        // Use v1 CRC_EXTRA (232) instead of v2 (25)
        const payload = new Uint8Array(2);
        payload[0] = targetSystem & 0xff;
        payload[1] = 1; // target_component
        packet = serializeV1(MISSION_CLEAR_ALL_ID, payload, MISSION_CLEAR_ALL_CRC_EXTRA_V1, { sysid: 255, compid: 190 });
      }

      // Set pending flag before sending
      missionClearPending = true;

      await currentTransport.write(packet);
      connectionState.packetsSent++;

      sendLog(mainWindow, 'info', `Clearing mission from flight controller (MAVLink v${detectedMavlinkVersion})...`);
      return { success: true };
    } catch (error) {
      missionClearPending = false;
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Failed to clear mission', message);
      return { success: false, error: message };
    }
  });

  // Set current waypoint
  ipcMain.handle(IPC_CHANNELS.MISSION_SET_CURRENT, async (_, seq: number): Promise<{ success: boolean; error?: string }> => {
    if (!currentTransport?.isOpen || !connectionState.isConnected) {
      return { success: false, error: 'Not connected' };
    }

    try {
      // v1 wire order: target_system(1), target_component(1), seq(2)
      // v2 wire order: seq(2), target_system(1), target_component(1)
      let packet: Uint8Array;
      const targetSystem = connectionState.systemId ?? 1;

      if (detectedMavlinkVersion === 2) {
        const payload = serializeMissionSetCurrent({
          targetSystem,
          targetComponent: 1,
          seq,
        });
        packet = serializeV2(MISSION_SET_CURRENT_ID, payload, MISSION_SET_CURRENT_CRC_EXTRA, { sysid: 255, compid: 190 });
      } else {
        // MAVLink v1 packet but use v2 byte order (size-sorted) for payload!
        // ArduPilot uses v2 byte order internally regardless of packet format.
        // v2 order: seq(2), target_system(1), target_component(1)
        const payload = new Uint8Array(4);
        payload[0] = seq & 0xff;              // seq low byte
        payload[1] = (seq >> 8) & 0xff;       // seq high byte
        payload[2] = targetSystem & 0xff;     // target_system
        payload[3] = 1;                       // target_component
        packet = serializeV1(MISSION_SET_CURRENT_ID, payload, MISSION_SET_CURRENT_CRC_EXTRA, { sysid: 255, compid: 190 });
      }

      await currentTransport.write(packet);
      connectionState.packetsSent++;

      sendLog(mainWindow, 'info', `Setting current waypoint to ${seq} (MAVLink v${detectedMavlinkVersion})`);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Failed to set current waypoint', message);
      return { success: false, error: message };
    }
  });

  // Save mission to file
  ipcMain.handle(IPC_CHANNELS.MISSION_SAVE_FILE, async (_, items: MissionItem[]): Promise<{ success: boolean; filePath?: string; error?: string }> => {
    try {
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Mission',
        defaultPath: 'mission.waypoints',
        filters: [
          { name: 'Waypoints', extensions: ['waypoints', 'txt'] },
          { name: 'QGC Plan', extensions: ['plan'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (result.canceled || !result.filePath) {
        return { success: false, error: 'Cancelled' };
      }

      const fs = await import('fs/promises');
      const path = await import('path');
      const ext = path.extname(result.filePath).toLowerCase();

      let content: string;
      if (ext === '.plan') {
        // QGC Plan format (JSON)
        content = formatQgcPlan(items);
      } else {
        // QGC WPL format (default)
        content = formatWaypointsFile(items);
      }

      await fs.writeFile(result.filePath, content, 'utf-8');

      sendLog(mainWindow, 'info', `Saved mission (${items.length} items) to ${result.filePath}`);
      return { success: true, filePath: result.filePath };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Failed to save mission', message);
      return { success: false, error: message };
    }
  });

  // Load mission from file
  ipcMain.handle(IPC_CHANNELS.MISSION_LOAD_FILE, async (): Promise<{ success: boolean; items?: MissionItem[]; error?: string }> => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Load Mission',
        filters: [
          { name: 'Mission Files', extensions: ['waypoints', 'txt', 'plan'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile'],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: 'Cancelled' };
      }

      const filePath = result.filePaths[0];
      const fs = await import('fs/promises');
      const path = await import('path');
      const content = await fs.readFile(filePath, 'utf-8');
      const ext = path.extname(filePath).toLowerCase();

      let items: MissionItem[];
      if (ext === '.plan') {
        items = parseQgcPlan(content);
      } else {
        items = parseWaypointsFile(content);
      }

      sendLog(mainWindow, 'info', `Loaded mission (${items.length} items) from ${filePath}`);
      return { success: true, items };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Failed to load mission', message);
      return { success: false, error: message };
    }
  });

  // ============================================================================
  // Geofencing handlers (mission_type = FENCE)
  // ============================================================================

  // Download fence from flight controller
  ipcMain.handle(IPC_CHANNELS.FENCE_DOWNLOAD, async (): Promise<{ success: boolean; error?: string }> => {
    if (!currentTransport?.isOpen || !connectionState.isConnected) {
      return { success: false, error: 'Not connected' };
    }

    fenceDownloadState = {
      expected: 0,
      received: new Map(),
      timeout: null,
    };

    try {
      let packet: Uint8Array;
      const targetSystem = connectionState.systemId ?? 1;

      if (detectedMavlinkVersion === 2) {
        const payload = serializeMissionRequestList({
          targetSystem,
          targetComponent: 1,
          missionType: MAV_MISSION_TYPE.FENCE,
        });
        packet = serializeV2(MISSION_REQUEST_LIST_ID, payload, MISSION_REQUEST_LIST_CRC_EXTRA, { sysid: 255, compid: 190 });
      } else {
        // MAVLink v1 doesn't support fence mission type in the standard way
        // Most FCs require v2 for fence operations
        const payload = new Uint8Array(3);
        payload[0] = targetSystem & 0xff;
        payload[1] = 1;
        payload[2] = MAV_MISSION_TYPE.FENCE;
        packet = serializeV1(MISSION_REQUEST_LIST_ID, payload, MISSION_REQUEST_LIST_CRC_EXTRA_V1, { sysid: 255, compid: 190 });
      }

      await currentTransport.write(packet);
      connectionState.packetsSent++;

      sendLog(mainWindow, 'info', `Requesting fence from flight controller (MAVLink v${detectedMavlinkVersion})...`);

      fenceDownloadState.timeout = setTimeout(() => {
        if (fenceDownloadState && fenceDownloadState.received.size === 0) {
          safeSend(mainWindow, IPC_CHANNELS.FENCE_ERROR, 'Timeout: no response from flight controller');
          fenceDownloadState = null;
        }
      }, 10000);

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Failed to request fence', message);
      fenceDownloadState = null;
      return { success: false, error: message };
    }
  });

  // Upload fence to flight controller
  ipcMain.handle(IPC_CHANNELS.FENCE_UPLOAD, async (_, items: FenceItem[]): Promise<{ success: boolean; error?: string }> => {
    if (!currentTransport?.isOpen || !connectionState.isConnected) {
      return { success: false, error: 'Not connected' };
    }

    if (items.length === 0) {
      return { success: false, error: 'No fence items to upload' };
    }

    fenceUploadState = {
      items,
      currentSeq: 0,
      timeout: null,
    };

    try {
      let packet: Uint8Array;
      const targetSystem = connectionState.systemId ?? 1;

      if (detectedMavlinkVersion === 2) {
        const payload = serializeMissionCount({
          targetSystem,
          targetComponent: 1,
          count: items.length,
          missionType: MAV_MISSION_TYPE.FENCE,
        });
        packet = serializeV2(MISSION_COUNT_ID, payload, MISSION_COUNT_CRC_EXTRA, { sysid: 255, compid: 190 });
      } else {
        const payload = new Uint8Array(5);
        payload[0] = items.length & 0xff;
        payload[1] = (items.length >> 8) & 0xff;
        payload[2] = targetSystem & 0xff;
        payload[3] = 1;
        payload[4] = MAV_MISSION_TYPE.FENCE;
        packet = serializeV1(MISSION_COUNT_ID, payload, MISSION_COUNT_CRC_EXTRA_V1, { sysid: 255, compid: 190 });
      }

      await currentTransport.write(packet);
      connectionState.packetsSent++;

      sendLog(mainWindow, 'info', `Uploading ${items.length} fence items (MAVLink v${detectedMavlinkVersion})...`);

      fenceUploadState.timeout = setTimeout(() => {
        if (fenceUploadState && fenceUploadState.currentSeq === 0) {
          safeSend(mainWindow, IPC_CHANNELS.FENCE_ERROR, 'Timeout: FC did not request fence items');
          fenceUploadState = null;
        }
      }, 10000);

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Failed to upload fence', message);
      fenceUploadState = null;
      return { success: false, error: message };
    }
  });

  // Clear fence from flight controller
  ipcMain.handle(IPC_CHANNELS.FENCE_CLEAR, async (): Promise<{ success: boolean; error?: string }> => {
    if (!currentTransport?.isOpen || !connectionState.isConnected) {
      return { success: false, error: 'Not connected' };
    }

    try {
      let packet: Uint8Array;
      const targetSystem = connectionState.systemId ?? 1;

      if (detectedMavlinkVersion === 2) {
        const payload = serializeMissionClearAll({
          targetSystem,
          targetComponent: 1,
          missionType: MAV_MISSION_TYPE.FENCE,
        });
        packet = serializeV2(MISSION_CLEAR_ALL_ID, payload, MISSION_CLEAR_ALL_CRC_EXTRA, { sysid: 255, compid: 190 });
      } else {
        const payload = new Uint8Array(3);
        payload[0] = targetSystem & 0xff;
        payload[1] = 1;
        payload[2] = MAV_MISSION_TYPE.FENCE;
        packet = serializeV1(MISSION_CLEAR_ALL_ID, payload, MISSION_CLEAR_ALL_CRC_EXTRA_V1, { sysid: 255, compid: 190 });
      }

      fenceClearPending = true;

      await currentTransport.write(packet);
      connectionState.packetsSent++;

      sendLog(mainWindow, 'info', `Clearing fence from flight controller (MAVLink v${detectedMavlinkVersion})...`);
      return { success: true };
    } catch (error) {
      fenceClearPending = false;
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Failed to clear fence', message);
      return { success: false, error: message };
    }
  });

  // Save fence to file
  ipcMain.handle(IPC_CHANNELS.FENCE_SAVE_FILE, async (_, items: FenceItem[]): Promise<{ success: boolean; filePath?: string; error?: string }> => {
    try {
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Fence',
        defaultPath: 'fence.txt',
        filters: [
          { name: 'Fence Files', extensions: ['txt', 'fence'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (result.canceled || !result.filePath) {
        return { success: false, error: 'Cancelled' };
      }

      const fs = await import('fs/promises');
      const content = formatFenceFile(items);
      await fs.writeFile(result.filePath, content, 'utf-8');

      sendLog(mainWindow, 'info', `Saved fence (${items.length} items) to ${result.filePath}`);
      return { success: true, filePath: result.filePath };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Failed to save fence', message);
      return { success: false, error: message };
    }
  });

  // Load fence from file
  ipcMain.handle(IPC_CHANNELS.FENCE_LOAD_FILE, async (): Promise<{ success: boolean; items?: FenceItem[]; error?: string }> => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Load Fence',
        filters: [
          { name: 'Fence Files', extensions: ['txt', 'fence'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile'],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: 'Cancelled' };
      }

      const filePath = result.filePaths[0];
      const fs = await import('fs/promises');
      const content = await fs.readFile(filePath, 'utf-8');
      const items = parseFenceFile(content);

      sendLog(mainWindow, 'info', `Loaded fence (${items.length} items) from ${filePath}`);
      return { success: true, items };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Failed to load fence', message);
      return { success: false, error: message };
    }
  });

  // ============================================================================
  // Rally Points handlers (mission_type = RALLY)
  // ============================================================================

  // Download rally points from flight controller
  ipcMain.handle(IPC_CHANNELS.RALLY_DOWNLOAD, async (): Promise<{ success: boolean; error?: string }> => {
    if (!currentTransport?.isOpen || !connectionState.isConnected) {
      return { success: false, error: 'Not connected' };
    }

    rallyDownloadState = {
      expected: 0,
      received: new Map(),
      timeout: null,
    };

    try {
      let packet: Uint8Array;
      const targetSystem = connectionState.systemId ?? 1;

      if (detectedMavlinkVersion === 2) {
        const payload = serializeMissionRequestList({
          targetSystem,
          targetComponent: 1,
          missionType: MAV_MISSION_TYPE.RALLY,
        });
        packet = serializeV2(MISSION_REQUEST_LIST_ID, payload, MISSION_REQUEST_LIST_CRC_EXTRA, { sysid: 255, compid: 190 });
      } else {
        const payload = new Uint8Array(3);
        payload[0] = targetSystem & 0xff;
        payload[1] = 1;
        payload[2] = MAV_MISSION_TYPE.RALLY;
        packet = serializeV1(MISSION_REQUEST_LIST_ID, payload, MISSION_REQUEST_LIST_CRC_EXTRA_V1, { sysid: 255, compid: 190 });
      }

      await currentTransport.write(packet);
      connectionState.packetsSent++;

      sendLog(mainWindow, 'info', `Requesting rally points from flight controller (MAVLink v${detectedMavlinkVersion})...`);

      rallyDownloadState.timeout = setTimeout(() => {
        if (rallyDownloadState && rallyDownloadState.received.size === 0) {
          safeSend(mainWindow, IPC_CHANNELS.RALLY_ERROR, 'Timeout: no response from flight controller');
          rallyDownloadState = null;
        }
      }, 10000);

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Failed to request rally points', message);
      rallyDownloadState = null;
      return { success: false, error: message };
    }
  });

  // Upload rally points to flight controller
  ipcMain.handle(IPC_CHANNELS.RALLY_UPLOAD, async (_, items: RallyItem[]): Promise<{ success: boolean; error?: string }> => {
    if (!currentTransport?.isOpen || !connectionState.isConnected) {
      return { success: false, error: 'Not connected' };
    }

    if (items.length === 0) {
      return { success: false, error: 'No rally points to upload' };
    }

    rallyUploadState = {
      items,
      currentSeq: 0,
      timeout: null,
    };

    try {
      let packet: Uint8Array;
      const targetSystem = connectionState.systemId ?? 1;

      if (detectedMavlinkVersion === 2) {
        const payload = serializeMissionCount({
          targetSystem,
          targetComponent: 1,
          count: items.length,
          missionType: MAV_MISSION_TYPE.RALLY,
        });
        packet = serializeV2(MISSION_COUNT_ID, payload, MISSION_COUNT_CRC_EXTRA, { sysid: 255, compid: 190 });
      } else {
        const payload = new Uint8Array(5);
        payload[0] = items.length & 0xff;
        payload[1] = (items.length >> 8) & 0xff;
        payload[2] = targetSystem & 0xff;
        payload[3] = 1;
        payload[4] = MAV_MISSION_TYPE.RALLY;
        packet = serializeV1(MISSION_COUNT_ID, payload, MISSION_COUNT_CRC_EXTRA_V1, { sysid: 255, compid: 190 });
      }

      await currentTransport.write(packet);
      connectionState.packetsSent++;

      sendLog(mainWindow, 'info', `Uploading ${items.length} rally points (MAVLink v${detectedMavlinkVersion})...`);

      rallyUploadState.timeout = setTimeout(() => {
        if (rallyUploadState && rallyUploadState.currentSeq === 0) {
          safeSend(mainWindow, IPC_CHANNELS.RALLY_ERROR, 'Timeout: FC did not request rally points');
          rallyUploadState = null;
        }
      }, 10000);

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Failed to upload rally points', message);
      rallyUploadState = null;
      return { success: false, error: message };
    }
  });

  // Clear rally points from flight controller
  ipcMain.handle(IPC_CHANNELS.RALLY_CLEAR, async (): Promise<{ success: boolean; error?: string }> => {
    if (!currentTransport?.isOpen || !connectionState.isConnected) {
      return { success: false, error: 'Not connected' };
    }

    try {
      let packet: Uint8Array;
      const targetSystem = connectionState.systemId ?? 1;

      if (detectedMavlinkVersion === 2) {
        const payload = serializeMissionClearAll({
          targetSystem,
          targetComponent: 1,
          missionType: MAV_MISSION_TYPE.RALLY,
        });
        packet = serializeV2(MISSION_CLEAR_ALL_ID, payload, MISSION_CLEAR_ALL_CRC_EXTRA, { sysid: 255, compid: 190 });
      } else {
        const payload = new Uint8Array(3);
        payload[0] = targetSystem & 0xff;
        payload[1] = 1;
        payload[2] = MAV_MISSION_TYPE.RALLY;
        packet = serializeV1(MISSION_CLEAR_ALL_ID, payload, MISSION_CLEAR_ALL_CRC_EXTRA_V1, { sysid: 255, compid: 190 });
      }

      rallyClearPending = true;

      await currentTransport.write(packet);
      connectionState.packetsSent++;

      sendLog(mainWindow, 'info', `Clearing rally points from flight controller (MAVLink v${detectedMavlinkVersion})...`);
      return { success: true };
    } catch (error) {
      rallyClearPending = false;
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Failed to clear rally points', message);
      return { success: false, error: message };
    }
  });

  // Save rally points to file
  ipcMain.handle(IPC_CHANNELS.RALLY_SAVE_FILE, async (_, items: RallyItem[]): Promise<{ success: boolean; filePath?: string; error?: string }> => {
    try {
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Rally Points',
        defaultPath: 'rally.txt',
        filters: [
          { name: 'Rally Files', extensions: ['txt', 'rally'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (result.canceled || !result.filePath) {
        return { success: false, error: 'Cancelled' };
      }

      const fs = await import('fs/promises');
      const content = formatRallyFile(items);
      await fs.writeFile(result.filePath, content, 'utf-8');

      sendLog(mainWindow, 'info', `Saved rally points (${items.length} items) to ${result.filePath}`);
      return { success: true, filePath: result.filePath };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Failed to save rally points', message);
      return { success: false, error: message };
    }
  });

  // Load rally points from file
  ipcMain.handle(IPC_CHANNELS.RALLY_LOAD_FILE, async (): Promise<{ success: boolean; items?: RallyItem[]; error?: string }> => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Load Rally Points',
        filters: [
          { name: 'Rally Files', extensions: ['txt', 'rally'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile'],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: 'Cancelled' };
      }

      const filePath = result.filePaths[0];
      const fs = await import('fs/promises');
      const content = await fs.readFile(filePath, 'utf-8');
      const items = parseRallyFile(content);

      sendLog(mainWindow, 'info', `Loaded rally points (${items.length} items) from ${filePath}`);
      return { success: true, items };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Failed to load rally points', message);
      return { success: false, error: message };
    }
  });

  // ============================================================================
  // Firmware Flash Handlers
  // ============================================================================

  // Detect connected boards
  ipcMain.handle(IPC_CHANNELS.FIRMWARE_DETECT_BOARD, async (): Promise<{ success: boolean; boards?: DetectedBoard[]; error?: string }> => {
    try {
      const boards = await detectBoards();
      sendLog(mainWindow, 'info', `Detected ${boards.length} board(s)`);
      return { success: true, boards };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Board detection failed', message);
      return { success: false, error: message };
    }
  });

  // Fetch firmware manifest
  ipcMain.handle(IPC_CHANNELS.FIRMWARE_FETCH_MANIFEST, async (
    _,
    source: FirmwareSource,
    vehicleType: FirmwareVehicleType,
    boardId: string
  ): Promise<{ success: boolean; manifest?: FirmwareManifest; error?: string }> => {
    try {
      sendLog(mainWindow, 'info', `Fetching ${source} firmware manifest for ${vehicleType}/${boardId}...`);
      const manifest = await fetchFirmwareVersions(source, vehicleType, boardId);
      sendLog(mainWindow, 'info', `Found ${manifest.versions.length} firmware versions`);
      return { success: true, manifest };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Failed to fetch firmware manifest', message);
      return { success: false, error: message };
    }
  });

  // Fetch available boards for a firmware source/vehicle type
  ipcMain.handle(IPC_CHANNELS.FIRMWARE_FETCH_BOARDS, async (
    _,
    source: FirmwareSource,
    vehicleType: FirmwareVehicleType
  ): Promise<{ success: boolean; boards?: BoardInfo[]; error?: string }> => {
    try {
      sendLog(mainWindow, 'info', `Fetching ${source} boards for ${vehicleType}...`);

      if (source === 'ardupilot') {
        const boards = await getArduPilotBoards(vehicleType);
        sendLog(mainWindow, 'info', `Found ${boards.length} ${vehicleType} boards`);
        return { success: true, boards };
      }

      if (source === 'betaflight') {
        const boards = getBetaflightBoards();
        sendLog(mainWindow, 'info', `Found ${boards.length} Betaflight boards`);
        return { success: true, boards };
      }

      if (source === 'inav') {
        const boards = getInavBoards();
        sendLog(mainWindow, 'info', `Found ${boards.length} iNav boards`);
        return { success: true, boards };
      }

      // For other sources (px4, custom), return empty (they use detected board only)
      return { success: true, boards: [] };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Failed to fetch boards', message);
      return { success: false, error: message };
    }
  });

  // Fetch version groups for a board
  ipcMain.handle(IPC_CHANNELS.FIRMWARE_FETCH_VERSIONS, async (
    _,
    source: FirmwareSource,
    vehicleType: FirmwareVehicleType,
    boardId: string
  ): Promise<{ success: boolean; groups?: VersionGroup[]; error?: string }> => {
    try {
      sendLog(mainWindow, 'info', `Fetching ${source} versions for ${vehicleType}/${boardId}...`);

      if (source === 'ardupilot') {
        const groups = await getArduPilotVersions(vehicleType, boardId);
        const totalVersions = groups.reduce((sum, g) => sum + g.versions.length, 0);
        sendLog(mainWindow, 'info', `Found ${groups.length} version groups (${totalVersions} total versions)`);
        return { success: true, groups };
      }

      // For other sources, get flat list and group
      const manifest = await fetchFirmwareVersions(source, vehicleType, boardId);
      const groups: VersionGroup[] = [{
        major: 'all',
        label: 'All Versions',
        versions: manifest.versions,
        isLatest: true,
      }];
      return { success: true, groups };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Failed to fetch versions', message);
      return { success: false, error: message };
    }
  });

  // Download firmware
  ipcMain.handle(IPC_CHANNELS.FIRMWARE_DOWNLOAD, async (
    _,
    version: FirmwareVersion
  ): Promise<{ success: boolean; filePath?: string; error?: string }> => {
    try {
      sendLog(mainWindow, 'info', `Downloading firmware ${version.version}...`);
      const filePath = await downloadFirmware(version, mainWindow);
      sendLog(mainWindow, 'info', `Firmware downloaded to ${filePath}`);
      return { success: true, filePath };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Firmware download failed', message);
      return { success: false, error: message };
    }
  });

  // Flash firmware
  ipcMain.handle(IPC_CHANNELS.FIRMWARE_FLASH, async (
    _,
    firmwarePath: string,
    board: DetectedBoard,
    options?: FlashOptions
  ): Promise<{ success: boolean; result?: FlashResult; error?: string }> => {
    try {
      sendLog(mainWindow, 'info', `Flashing firmware to ${board.name}...`);
      sendLog(mainWindow, 'info', `Flasher type: ${board.flasher}, path: ${firmwarePath}`);
      sendLog(mainWindow, 'info', `Board: ${JSON.stringify({ name: board.name, boardId: board.boardId, port: board.port, detectionMethod: board.detectionMethod })}`);
      if (options?.noRebootSequence) {
        sendLog(mainWindow, 'info', 'No reboot sequence - assuming board is already in bootloader mode');
      }

      // Create new abort controller for this flash operation
      firmwareAbortController = new AbortController();

      let result: FlashResult;

      // For boards with serial port, check USB VID to determine method
      // CP2102/FTDI (10c4, 0403, 1a86) = Serial bootloader, STM32 native (0483) = DFU
      const hasSerialPort = board.port && (board.detectionMethod === 'msp' || board.detectionMethod === 'bootloader');

      if (hasSerialPort) {
        const vid = board.usbVid;
        const isNativeUsb = vid === 0x0483; // STM32 native USB
        const isUsbSerial = vid === 0x10c4 || vid === 0x0403 || vid === 0x1a86; // CP2102, FTDI, CH340

        if (isNativeUsb) {
          sendLog(mainWindow, 'info', 'Board with native USB - using DFU...');
          result = await flashWithDfu(firmwarePath, board, mainWindow, firmwareAbortController);
        } else if (isUsbSerial || board.detectionMethod === 'bootloader') {
          // USB-serial adapters OR boards already in bootloader mode -> use serial bootloader
          sendLog(mainWindow, 'info', 'Board with USB-serial adapter - using serial bootloader...');
          // If already detected via bootloader, skip reboot sequence
          const flashOptions = board.detectionMethod === 'bootloader'
            ? { ...options, noRebootSequence: true }
            : options;
          if (!flashOptions?.noRebootSequence && board.detectionMethod === 'msp') {
            sendLog(mainWindow, 'info', 'Will send MSP reboot to bootloader first...');
          }
          result = await flashWithSerialBootloader(firmwarePath, board, mainWindow, firmwareAbortController, flashOptions);
        } else {
          // Unknown VID, try DFU first
          sendLog(mainWindow, 'info', `Board with unknown VID ${vid?.toString(16)} - trying DFU...`);
          result = await flashWithDfu(firmwarePath, board, mainWindow, firmwareAbortController);
        }
      } else if (board.flasher === 'dfu') {
        sendLog(mainWindow, 'info', 'Using DFU flasher...');
        result = await flashWithDfu(firmwarePath, board, mainWindow, firmwareAbortController);
      } else if (board.flasher === 'avrdude') {
        sendLog(mainWindow, 'info', 'Using AVRdude flasher...');
        result = await flashWithAvrdude(firmwarePath, board, mainWindow, firmwareAbortController);
      } else if (board.flasher === 'serial' && board.port) {
        // USB-serial boards (CP2102/FTDI) use STM32 UART bootloader
        // Note: This requires boot pads to be shorted for bootloader entry
        sendLog(mainWindow, 'info', 'Using STM32 serial bootloader...');
        if (!options?.noRebootSequence) {
          sendLog(mainWindow, 'warn', 'Serial bootloader may require BOOT pads to be shorted!');
        }
        try {
          result = await flashWithSerialBootloader(firmwarePath, board, mainWindow, firmwareAbortController, options);
        } catch (flashError) {
          const errMsg = flashError instanceof Error ? flashError.message : String(flashError);
          sendLog(mainWindow, 'error', `Serial flasher error: ${errMsg}`);
          return { success: false, error: `Serial flash failed: ${errMsg}` };
        }
      } else {
        return { success: false, error: `Unsupported flasher type: ${board.flasher}` };
      }

      // Clear abort controller
      firmwareAbortController = null;

      if (result.success) {
        sendLog(mainWindow, 'info', `Firmware flash complete in ${(result.duration || 0) / 1000}s`);
        safeSend(mainWindow, IPC_CHANNELS.FIRMWARE_COMPLETE, result);
      } else {
        sendLog(mainWindow, 'error', 'Firmware flash failed', result.error || 'Unknown error');
        safeSend(mainWindow, IPC_CHANNELS.FIRMWARE_ERROR, result.error || 'Unknown error');
      }

      return { success: result.success, result, error: result.error };
    } catch (error) {
      firmwareAbortController = null;
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Firmware flash failed', message);
      safeSend(mainWindow, IPC_CHANNELS.FIRMWARE_ERROR, message);
      return { success: false, error: message };
    }
  });

  // Abort flash operation
  ipcMain.handle(IPC_CHANNELS.FIRMWARE_ABORT, async (): Promise<{ success: boolean }> => {
    if (firmwareAbortController) {
      firmwareAbortController.abort();
      firmwareAbortController = null;
      sendLog(mainWindow, 'info', 'Firmware flash aborted');
    }
    return { success: true };
  });

  // Select custom firmware file
  ipcMain.handle(IPC_CHANNELS.FIRMWARE_SELECT_FILE, async (): Promise<{ success: boolean; filePath?: string; error?: string }> => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Select Firmware File',
        filters: [
          { name: 'Firmware Files', extensions: ['apj', 'bin', 'hex', 'px4'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile'],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: 'Cancelled' };
      }

      const filePath = result.filePaths[0];
      sendLog(mainWindow, 'info', `Selected firmware file: ${filePath}`);

      // Copy to cache directory
      const cachedPath = await copyCustomFirmware(filePath);
      return { success: true, filePath: cachedPath };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Failed to select firmware file', message);
      return { success: false, error: message };
    }
  });

  // Enter bootloader mode via MAVLink
  ipcMain.handle(IPC_CHANNELS.FIRMWARE_ENTER_BOOTLOADER, async (): Promise<{ success: boolean; error?: string }> => {
    if (!currentTransport?.isOpen || !connectionState.isConnected) {
      return { success: false, error: 'Not connected to flight controller' };
    }

    try {
      // Send MAV_CMD_PREFLIGHT_REBOOT_SHUTDOWN with param1=3 (bootloader mode)
      const payload = serializeCommandLong({
        targetSystem: connectionState.systemId ?? 1,
        targetComponent: 1,
        command: 246, // MAV_CMD_PREFLIGHT_REBOOT_SHUTDOWN
        confirmation: 0,
        param1: 3, // 3 = reboot into bootloader
        param2: 0,
        param3: 0,
        param4: 0,
        param5: 0,
        param6: 0,
        param7: 0,
      });

      const packet = detectedMavlinkVersion === 2
        ? serializeV2(COMMAND_LONG_ID, payload, COMMAND_LONG_CRC_EXTRA, { sysid: 255, compid: 190 })
        : serializeV1(COMMAND_LONG_ID, payload, COMMAND_LONG_CRC_EXTRA, { sysid: 255, compid: 190 });

      await currentTransport.write(packet);
      connectionState.packetsSent++;

      sendLog(mainWindow, 'info', 'Sent bootloader reboot command');

      // Disconnect since FC will reboot
      if (currentTransport?.isOpen) {
        await currentTransport.close();
      }
      currentTransport = null;
      mavlinkParser = null;
      connectionState = {
        isConnected: false,
        packetsReceived: 0,
        packetsSent: 0,
      };
      sendConnectionState(mainWindow);

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Failed to enter bootloader', message);
      return { success: false, error: message };
    }
  });

  // List available serial ports
  ipcMain.handle(IPC_CHANNELS.FIRMWARE_LIST_PORTS, async (): Promise<{
    success: boolean;
    ports?: Array<{ path: string; manufacturer?: string; vendorId?: string; productId?: string }>;
    error?: string;
  }> => {
    try {
      const { listSerialPorts } = await import('@ardudeck/comms');
      const ports = await listSerialPorts();
      return {
        success: true,
        ports: ports.map(p => ({
          path: p.path,
          manufacturer: p.manufacturer,
          vendorId: p.vendorId,
          productId: p.productId,
        })),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Failed to list serial ports', message);
      return { success: false, error: message };
    }
  });

  // Probe STM32 bootloader on a specific port
  ipcMain.handle(IPC_CHANNELS.FIRMWARE_PROBE_STM32, async (
    _event,
    port: string
  ): Promise<{
    success: boolean;
    chipId?: number;
    mcu?: string;
    family?: string;
    error?: string;
  }> => {
    try {
      const { detectSTM32Chip } = await import('./firmware/stm32-bootloader.js');
      const result = await detectSTM32Chip(port);

      if (result) {
        sendLog(mainWindow, 'info', `Detected STM32 chip on ${port}: ${result.chipInfo?.mcu || 'Unknown'}`);
        return {
          success: true,
          chipId: result.chipId,
          mcu: result.chipInfo?.mcu,
          family: result.chipInfo?.family,
        };
      }

      return { success: false, error: 'No STM32 bootloader detected' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'warn', `STM32 probe failed on ${port}`, message);
      return { success: false, error: message };
    }
  });

  // Query board info via MAVLink (when firmware is running)
  ipcMain.handle(IPC_CHANNELS.FIRMWARE_QUERY_MAVLINK, async (
    _event,
    port: string,
    baudRate: number = 115200
  ): Promise<{
    success: boolean;
    boardName?: string;
    boardId?: number;
    vehicleType?: string;
    firmwareVersion?: string;
    error?: string;
  }> => {
    const { SerialTransport } = await import('@ardudeck/comms');
    const {
      MAVLinkParser,
      serializeV1,
      serializeV2,
      AUTOPILOT_VERSION_ID,
      deserializeAutopilotVersion,
      COMMAND_LONG_ID,
      COMMAND_LONG_CRC_EXTRA,
      serializeCommandLong,
    } = await import('@ardudeck/mavlink-ts');
    const { getBoardInfoFromVersion } = await import('../shared/board-ids.js');

    const MAV_CMD_REQUEST_MESSAGE = 512;
    let transport: InstanceType<typeof SerialTransport> | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let dataHandler: ((data: Uint8Array) => void) | null = null;

    try {
      sendLog(mainWindow, 'info', `Querying MAVLink on ${port}...`);

      transport = new SerialTransport(port, { baudRate });
      await transport.open();

      const parser = new MAVLinkParser();
      let targetSystem = 1;
      let targetComponent = 1;
      let mavlinkVersion: 1 | 2 = 1;
      let vehicleTypeName = 'Unknown';

      // Wait for heartbeat first to get system/component IDs
      const heartbeatResult = await new Promise<{ targetSystem: number; targetComponent: number; mavlinkVersion: 1 | 2; vehicleTypeName: string }>((resolve, reject) => {
        timeoutId = setTimeout(() => {
          sendLog(mainWindow, 'warn', 'No heartbeat received (timeout 3s) - is firmware running?');
          reject(new Error('No heartbeat received (timeout 3s)'));
        }, 3000);

        dataHandler = (data: Uint8Array) => {
          parser.feed(data);
          let packet;
          while ((packet = parser.parseNext()) !== null) {
            if (packet.msgId === 0) { // HEARTBEAT
              const payload = packet.payload;
              const vehicleType = payload.length > 4 ? payload[4] : 0;
              const vTypeName = VEHICLE_NAMES[vehicleType] || `Type ${vehicleType}`;

              const autopilotType = payload.length > 5 ? payload[5] : 0;
              const autopilotName = AUTOPILOT_NAMES[autopilotType] || `Autopilot ${autopilotType}`;

              sendLog(mainWindow, 'info', `Heartbeat received: ${autopilotName}, ${vTypeName}`);
              sendLog(mainWindow, 'debug', `  system: ${packet.systemId}, component: ${packet.componentId}, MAVLink v${packet.magic === 0xFD ? 2 : 1}`);

              if (timeoutId) clearTimeout(timeoutId);
              resolve({
                targetSystem: packet.systemId,
                targetComponent: packet.componentId,
                mavlinkVersion: packet.magic === 0xFD ? 2 : 1,
                vehicleTypeName: vTypeName,
              });
            }
          }
        };

        transport!.on('data', dataHandler);
      });

      targetSystem = heartbeatResult.targetSystem;
      targetComponent = heartbeatResult.targetComponent;
      mavlinkVersion = heartbeatResult.mavlinkVersion;
      vehicleTypeName = heartbeatResult.vehicleTypeName;

      // Request AUTOPILOT_VERSION message
      const cmdPayload = serializeCommandLong({
        targetSystem,
        targetComponent,
        command: MAV_CMD_REQUEST_MESSAGE,
        confirmation: 0,
        param1: AUTOPILOT_VERSION_ID, // Message ID to request
        param2: 0,
        param3: 0,
        param4: 0,
        param5: 0,
        param6: 0,
        param7: 0,
      });

      const packet = mavlinkVersion === 2
        ? serializeV2(cmdPayload, COMMAND_LONG_ID, 255, 190, 0, COMMAND_LONG_CRC_EXTRA)
        : serializeV1(cmdPayload, COMMAND_LONG_ID, 255, 190, 0, COMMAND_LONG_CRC_EXTRA);

      await transport.write(packet);
      sendLog(mainWindow, 'debug', 'Sent MAV_CMD_REQUEST_MESSAGE for AUTOPILOT_VERSION');

      // Wait for AUTOPILOT_VERSION response
      const result = await new Promise<{ boardName?: string; boardId?: number; boardTypeId?: number; firmwareVersion?: string }>((resolve, reject) => {
        timeoutId = setTimeout(() => {
          sendLog(mainWindow, 'warn', 'AUTOPILOT_VERSION timeout (2s) - board may not support this message');
          reject(new Error('No AUTOPILOT_VERSION response (timeout 2s)'));
        }, 2000);

        // Remove old handler and add new one
        if (dataHandler) transport!.off('data', dataHandler);

        dataHandler = (data: Uint8Array) => {
          parser.feed(data);
          let pkt;
          while ((pkt = parser.parseNext()) !== null) {
            if (pkt.msgId === AUTOPILOT_VERSION_ID) {
              const version = deserializeAutopilotVersion(pkt.payload);

              // Extract board type ID (upper 16 bits of boardVersion)
              const boardTypeId = (version.boardVersion >> 16) & 0xFFFF;
              const boardInfo = getBoardInfoFromVersion(version.boardVersion);

              // Parse firmware version (4 bytes: major.minor.patch.type)
              const fwMajor = (version.flightSwVersion >> 24) & 0xFF;
              const fwMinor = (version.flightSwVersion >> 16) & 0xFF;
              const fwPatch = (version.flightSwVersion >> 8) & 0xFF;
              const firmwareVersion = `${fwMajor}.${fwMinor}.${fwPatch}`;

              // Log detailed info
              sendLog(mainWindow, 'info', `AUTOPILOT_VERSION received:`);
              sendLog(mainWindow, 'info', `  boardVersion: 0x${version.boardVersion.toString(16)} (raw: ${version.boardVersion})`);
              sendLog(mainWindow, 'info', `  boardTypeId: ${boardTypeId} (0x${boardTypeId.toString(16)})`);
              sendLog(mainWindow, 'info', `  firmware: v${firmwareVersion}`);
              sendLog(mainWindow, 'info', `  vendorId: 0x${version.vendorId.toString(16)}, productId: 0x${version.productId.toString(16)}`);

              if (boardInfo) {
                sendLog(mainWindow, 'info', `  Matched board: ${boardInfo.name} (${boardInfo.displayName})`);
              } else {
                sendLog(mainWindow, 'warn', `  Board ID ${boardTypeId} not in database - please report this!`);
              }

              if (timeoutId) clearTimeout(timeoutId);
              resolve({
                boardName: boardInfo?.name,
                boardId: version.boardVersion,
                boardTypeId,
                firmwareVersion,
              });
            }
          }
        };

        transport!.on('data', dataHandler);
      });

      sendLog(mainWindow, 'info', `Board detection complete: ${result.boardName || 'Unknown (ID: ' + result.boardTypeId + ')'}`);
      if (!result.boardName) {
        sendLog(mainWindow, 'warn', `Add board ID ${result.boardTypeId} to board-ids.ts to support this board`);
      }

      return {
        success: true,
        boardName: result.boardName,
        boardId: result.boardId,
        vehicleType: vehicleTypeName,
        firmwareVersion: result.firmwareVersion,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'warn', `MAVLink query failed on ${port}`, message);
      return { success: false, error: message };
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      if (dataHandler && transport) {
        transport.off('data', dataHandler);
      }
      if (transport) {
        try {
          await transport.close();
        } catch {
          // Ignore close errors
        }
      }
    }
  });

  // Query board info via MSP (Betaflight/iNav)
  ipcMain.handle(IPC_CHANNELS.FIRMWARE_QUERY_MSP, async (
    _event,
    port: string,
    baudRate: number = 115200
  ): Promise<{
    success: boolean;
    firmware?: string;
    firmwareVersion?: string;
    boardId?: string;
    boardName?: string;
    error?: string;
  }> => {
    try {
      sendLog(mainWindow, 'info', `Querying MSP on ${port}...`);
      const { queryMSPBoard, getFirmwareTypeName, mapMspBoardToArduPilot } = await import('./firmware/msp-detector.js');

      const result = await queryMSPBoard(port, baudRate);

      if (result && (result.fcVariant || result.boardId)) {
        const firmwareName = getFirmwareTypeName(result.fcVariant);
        const mappedBoard = mapMspBoardToArduPilot(result.boardId);

        sendLog(mainWindow, 'info', `MSP detected: ${firmwareName} v${result.fcVersion}`);
        sendLog(mainWindow, 'info', `  Board: ${result.boardId} (${result.boardName || 'unknown'})`);
        if (mappedBoard) {
          sendLog(mainWindow, 'info', `  Mapped to ArduPilot board: ${mappedBoard}`);
        }

        return {
          success: true,
          firmware: firmwareName,
          firmwareVersion: result.fcVersion,
          boardId: result.boardId,
          boardName: mappedBoard || result.boardId,
        };
      }

      sendLog(mainWindow, 'debug', 'No MSP response');
      return { success: false, error: 'No MSP response' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'warn', `MSP query failed on ${port}`, message);
      return { success: false, error: message };
    }
  });

  // Comprehensive auto-detect: tries all protocols
  ipcMain.handle(IPC_CHANNELS.FIRMWARE_AUTO_DETECT, async (
    _event,
    port: string
  ): Promise<{
    success: boolean;
    protocol?: 'mavlink' | 'msp' | 'dfu' | 'usb';
    boardName?: string;
    boardId?: string;
    firmware?: string;
    firmwareVersion?: string;
    mcuType?: string;
    error?: string;
  }> => {
    sendLog(mainWindow, 'info', `Auto-detecting board on ${port}...`);

    // Try MAVLink first (ArduPilot/PX4)
    try {
      sendLog(mainWindow, 'debug', 'Trying MAVLink...');
      const { SerialTransport } = await import('@ardudeck/comms');
      const {
        MAVLinkParser,
        serializeV1,
        serializeV2,
        AUTOPILOT_VERSION_ID,
        deserializeAutopilotVersion,
        COMMAND_LONG_ID,
        COMMAND_LONG_CRC_EXTRA,
        serializeCommandLong,
      } = await import('@ardudeck/mavlink-ts');
      const { getBoardInfoFromVersion } = await import('../shared/board-ids.js');

      const transport = new SerialTransport(port, { baudRate: 115200 });
      await transport.open();

      const parser = new MAVLinkParser();
      let gotHeartbeat = false;

      // Quick heartbeat check (1.5s timeout)
      const heartbeatResult = await Promise.race([
        new Promise<{ systemId: number; componentId: number; mavVersion: 1 | 2; vehicleType: number } | null>((resolve) => {
          const handler = (data: Uint8Array) => {
            parser.feed(data);
            let pkt;
            while ((pkt = parser.parseNext()) !== null) {
              if (pkt.msgId === 0) { // HEARTBEAT
                gotHeartbeat = true;
                transport.off('data', handler);
                resolve({
                  systemId: pkt.systemId,
                  componentId: pkt.componentId,
                  mavVersion: pkt.magic === 0xFD ? 2 : 1,
                  vehicleType: pkt.payload.length > 4 ? pkt.payload[4]! : 0,
                });
              }
            }
          };
          transport.on('data', handler);
        }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
      ]);

      if (heartbeatResult) {
        sendLog(mainWindow, 'info', `MAVLink heartbeat received (${VEHICLE_NAMES[heartbeatResult.vehicleType] || 'Unknown'})`);

        // Request AUTOPILOT_VERSION
        const cmdPayload = serializeCommandLong({
          targetSystem: heartbeatResult.systemId,
          targetComponent: heartbeatResult.componentId,
          command: 512, // MAV_CMD_REQUEST_MESSAGE
          confirmation: 0,
          param1: AUTOPILOT_VERSION_ID,
          param2: 0, param3: 0, param4: 0, param5: 0, param6: 0, param7: 0,
        });

        const packet = heartbeatResult.mavVersion === 2
          ? serializeV2(cmdPayload, COMMAND_LONG_ID, 255, 190, 0, COMMAND_LONG_CRC_EXTRA)
          : serializeV1(cmdPayload, COMMAND_LONG_ID, 255, 190, 0, COMMAND_LONG_CRC_EXTRA);

        await transport.write(packet);

        // Wait for AUTOPILOT_VERSION (1s timeout)
        const versionResult = await Promise.race([
          new Promise<{ boardName?: string; firmwareVersion?: string } | null>((resolve) => {
            const handler = (data: Uint8Array) => {
              parser.feed(data);
              let pkt;
              while ((pkt = parser.parseNext()) !== null) {
                if (pkt.msgId === AUTOPILOT_VERSION_ID) {
                  const version = deserializeAutopilotVersion(pkt.payload);
                  const boardInfo = getBoardInfoFromVersion(version.boardVersion);
                  const fwMajor = (version.flightSwVersion >> 24) & 0xFF;
                  const fwMinor = (version.flightSwVersion >> 16) & 0xFF;
                  const fwPatch = (version.flightSwVersion >> 8) & 0xFF;

                  transport.off('data', handler);
                  resolve({
                    boardName: boardInfo?.name,
                    firmwareVersion: `${fwMajor}.${fwMinor}.${fwPatch}`,
                  });
                }
              }
            };
            transport.on('data', handler);
          }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000)),
        ]);

        await transport.close();

        if (versionResult?.boardName) {
          sendLog(mainWindow, 'info', `Detected: ${versionResult.boardName} (ArduPilot v${versionResult.firmwareVersion})`);
          return {
            success: true,
            protocol: 'mavlink',
            boardName: versionResult.boardName,
            boardId: versionResult.boardName.toLowerCase(),
            firmware: 'ArduPilot',
            firmwareVersion: versionResult.firmwareVersion,
          };
        }

        // Got heartbeat but no board info - still ArduPilot
        return {
          success: true,
          protocol: 'mavlink',
          firmware: 'ArduPilot',
          boardName: VEHICLE_NAMES[heartbeatResult.vehicleType] || 'Unknown ArduPilot',
        };
      }

      await transport.close();
    } catch (e) {
      // MAVLink failed, continue to MSP
      sendLog(mainWindow, 'debug', 'MAVLink detection failed, trying MSP...');
    }

    // Try MSP (Betaflight/iNav)
    try {
      const { queryMSPBoard, getFirmwareTypeName, mapMspBoardToArduPilot } = await import('./firmware/msp-detector.js');
      const mspResult = await queryMSPBoard(port, 115200);

      if (mspResult && (mspResult.fcVariant || mspResult.boardId)) {
        const firmwareName = getFirmwareTypeName(mspResult.fcVariant);
        const mappedBoard = mapMspBoardToArduPilot(mspResult.boardId);

        sendLog(mainWindow, 'info', `Detected: ${firmwareName} v${mspResult.fcVersion} on ${mspResult.boardId}`);
        if (mappedBoard) {
          sendLog(mainWindow, 'info', `  Mapped to ArduPilot board: ${mappedBoard}`);
        }

        return {
          success: true,
          protocol: 'msp',
          boardName: mappedBoard || mspResult.boardId,
          boardId: mappedBoard || mspResult.boardId,  // Use mapped ID for ArduPilot board matching
          firmware: firmwareName,
          firmwareVersion: mspResult.fcVersion,
        };
      }
    } catch (e) {
      sendLog(mainWindow, 'debug', 'MSP detection failed, trying STM32 bootloader...');
    }

    // Try STM32 bootloader
    try {
      const { detectSTM32Chip } = await import('./firmware/stm32-bootloader.js');
      const stm32Result = await detectSTM32Chip(port);

      if (stm32Result) {
        const mcuType = stm32Result.chipInfo?.mcu || 'Unknown MCU';
        sendLog(mainWindow, 'info', `STM32 bootloader detected: ${mcuType}`);
        return {
          success: true,
          protocol: 'bootloader',  // Use 'bootloader' so UI shows suggested boards
          mcuType,
          boardName: `${mcuType} (in bootloader)`,
          inBootloader: true,
        };
      }
    } catch (e) {
      sendLog(mainWindow, 'debug', 'STM32 bootloader detection failed');
    }

    sendLog(mainWindow, 'warn', `Could not identify board on ${port}`);
    return { success: false, error: 'No compatible firmware detected' };
  });

  // Register MSP handlers for Betaflight/iNav/Cleanflight support
  registerMspHandlers(mainWindow);

  // ============================================================================
  // Driver utilities
  // ============================================================================

  ipcMain.handle(IPC_CHANNELS.DRIVER_OPEN_BUNDLED, async (_event, driverName: string): Promise<{ success: boolean; error?: string }> => {
    try {
      // Get the resources path (works in both dev and production)
      const resourcesPath = app.isPackaged
        ? join(process.resourcesPath, 'drivers')
        : join(app.getAppPath(), 'resources/drivers');

      const driverPath = join(resourcesPath, driverName);

      console.log('Opening bundled driver:', driverPath);

      // Check if file exists
      if (!existsSync(driverPath)) {
        console.error('Driver file not found:', driverPath);
        return { success: false, error: `Driver file not found: ${driverName}` };
      }

      // Open the file with default system application
      const result = await shell.openPath(driverPath);
      if (result) {
        // shell.openPath returns empty string on success, error message on failure
        return { success: false, error: result };
      }
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  });
}

/**
 * Parse ArduPilot apm.pdef.xml into metadata store
 */
function parseParameterXml(xml: string): ParameterMetadataStore {
  const metadata: ParameterMetadataStore = {};

  // apm.pdef.xml format:
  // <param humanName="..." name="ArduPlane:PARAM_NAME" documentation="...">
  //   <field name="Range">min max</field>
  //   <field name="Units">unit</field>
  //   <values><value code="0">Disabled</value><value code="1">Enabled</value></values>
  //   <bitmask><bit code="0">BitName</bit></bitmask>
  // </param>

  // Match param elements - attributes can be in any order
  const paramRegex = /<param\s+([^>]+)>([\s\S]*?)<\/param>/g;
  const attrRegex = /(\w+)="([^"]*)"/g;
  const fieldRegex = /<field\s+name="([^"]*)">([\s\S]*?)<\/field>/g;
  const valueRegex = /<value\s+code="(\d+)"[^>]*>([^<]*)<\/value>/g;
  const bitRegex = /<bit\s+code="(\d+)"[^>]*>([^<]*)<\/bit>/g;

  let match;
  while ((match = paramRegex.exec(xml)) !== null) {
    const [, attrString, content] = match;

    // Parse attributes
    const attrs: Record<string, string> = {};
    let attrMatch;
    while ((attrMatch = attrRegex.exec(attrString)) !== null) {
      attrs[attrMatch[1]] = attrMatch[2];
    }

    // Extract param name - strip vehicle prefix (e.g., "ArduPlane:PARAM" -> "PARAM")
    let paramName = attrs.name || '';
    const colonIndex = paramName.indexOf(':');
    if (colonIndex !== -1) {
      paramName = paramName.substring(colonIndex + 1);
    }

    if (!paramName) continue;

    const param: ParameterMetadata = {
      name: paramName,
      humanName: attrs.humanName || paramName,
      description: attrs.documentation || '',
    };

    // Parse field elements
    let fieldMatch;
    while ((fieldMatch = fieldRegex.exec(content)) !== null) {
      const [, fieldName, fieldValue] = fieldMatch;
      const value = fieldValue.trim();

      switch (fieldName) {
        case 'Range': {
          const parts = value.split(/\s+/);
          if (parts.length >= 2) {
            param.range = {
              min: parseFloat(parts[0]),
              max: parseFloat(parts[1]),
            };
          }
          break;
        }
        case 'Units':
          param.units = value;
          break;
        case 'Increment':
          param.increment = parseFloat(value);
          break;
        case 'RebootRequired':
          param.rebootRequired = value.toLowerCase() === 'true';
          break;
      }
    }

    // Parse <values> element
    let valueMatch;
    while ((valueMatch = valueRegex.exec(content)) !== null) {
      if (!param.values) param.values = {};
      param.values[parseInt(valueMatch[1], 10)] = valueMatch[2].trim();
    }

    // Parse <bitmask> element
    let bitMatch;
    while ((bitMatch = bitRegex.exec(content)) !== null) {
      if (!param.bitmask) param.bitmask = {};
      param.bitmask[parseInt(bitMatch[1], 10)] = bitMatch[2].trim();
    }

    metadata[paramName] = param;
  }

  return metadata;
}

function sendConnectionState(mainWindow: BrowserWindow): void {
  safeSend(mainWindow, IPC_CHANNELS.CONNECTION_STATE, connectionState);
}

// ============================================================================
// Mission File Format Helpers
// ============================================================================

/**
 * Format mission items to QGC WPL 110 format (.waypoints)
 * Format: seq current frame cmd p1 p2 p3 p4 lat lon alt autocontinue
 */
function formatWaypointsFile(items: MissionItem[]): string {
  const lines = ['QGC WPL 110'];

  for (const item of items) {
    const line = [
      item.seq,
      item.current ? 1 : 0,
      item.frame,
      item.command,
      item.param1,
      item.param2,
      item.param3,
      item.param4,
      item.latitude.toFixed(8),
      item.longitude.toFixed(8),
      item.altitude.toFixed(6),
      item.autocontinue ? 1 : 0,
    ].join('\t');
    lines.push(line);
  }

  return lines.join('\n');
}

/**
 * Parse QGC WPL 110 format (.waypoints) to mission items
 */
function parseWaypointsFile(content: string): MissionItem[] {
  const items: MissionItem[] = [];
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip header and empty lines
    if (!trimmed || trimmed.startsWith('QGC WPL')) continue;

    // Split by tabs or spaces
    const parts = trimmed.split(/\s+/);
    if (parts.length < 12) continue;

    const item: MissionItem = {
      seq: parseInt(parts[0], 10),
      current: parts[1] === '1',
      frame: parseInt(parts[2], 10),
      command: parseInt(parts[3], 10),
      param1: parseFloat(parts[4]),
      param2: parseFloat(parts[5]),
      param3: parseFloat(parts[6]),
      param4: parseFloat(parts[7]),
      latitude: parseFloat(parts[8]),
      longitude: parseFloat(parts[9]),
      altitude: parseFloat(parts[10]),
      autocontinue: parts[11] === '1',
    };

    items.push(item);
  }

  return items;
}

/**
 * Format mission items to QGC Plan format (JSON)
 */
function formatQgcPlan(items: MissionItem[]): string {
  const plan = {
    fileType: 'Plan',
    geoFence: { circles: [], polygons: [], version: 2 },
    groundStation: 'ArduDeck',
    mission: {
      cruiseSpeed: 15,
      firmwareType: 3, // ArduPilot
      globalPlanAltitudeMode: 1,
      hoverSpeed: 5,
      items: items.map(item => ({
        AMSLAltAboveTerrain: null,
        Altitude: item.altitude,
        AltitudeMode: 1, // Relative
        autoContinue: item.autocontinue,
        command: item.command,
        doJumpId: item.seq + 1,
        frame: item.frame,
        params: [item.param1, item.param2, item.param3, item.param4, item.latitude, item.longitude, item.altitude],
        type: 'SimpleItem',
      })),
      plannedHomePosition: items.length > 0 ? [items[0].latitude, items[0].longitude, items[0].altitude] : [0, 0, 0],
      vehicleType: 2,
      version: 2,
    },
    rallyPoints: { points: [], version: 2 },
    version: 1,
  };

  return JSON.stringify(plan, null, 2);
}

/**
 * Parse QGC Plan format (JSON) to mission items
 */
function parseQgcPlan(content: string): MissionItem[] {
  const items: MissionItem[] = [];

  try {
    const plan = JSON.parse(content);

    if (plan.mission?.items) {
      let seq = 0;
      for (const planItem of plan.mission.items) {
        if (planItem.type !== 'SimpleItem') continue;

        const params = planItem.params || [];
        const item: MissionItem = {
          seq: seq++,
          current: false,
          frame: planItem.frame ?? 3, // Default to GLOBAL_RELATIVE_ALT
          command: planItem.command ?? 16,
          param1: params[0] ?? 0,
          param2: params[1] ?? 0,
          param3: params[2] ?? 0,
          param4: params[3] ?? 0,
          latitude: params[4] ?? planItem.coordinate?.[0] ?? 0,
          longitude: params[5] ?? planItem.coordinate?.[1] ?? 0,
          altitude: params[6] ?? planItem.coordinate?.[2] ?? planItem.Altitude ?? 0,
          autocontinue: planItem.autoContinue ?? true,
        };

        items.push(item);
      }
    }
  } catch {
    // Invalid JSON
  }

  return items;
}

// ============================================================================
// Fence File Format Helpers
// ============================================================================

/**
 * Format fence items to simple text format
 * Format: seq cmd frame p1 p2 p3 p4 lat lon alt
 */
function formatFenceFile(items: FenceItem[]): string {
  const lines = ['# ArduDeck Fence File v1'];
  lines.push('# seq cmd frame p1 p2 p3 p4 lat lon alt');

  for (const item of items) {
    const line = [
      item.seq,
      item.command,
      item.frame,
      item.param1,
      item.param2,
      item.param3,
      item.param4,
      item.latitude.toFixed(8),
      item.longitude.toFixed(8),
      item.altitude.toFixed(6),
    ].join('\t');
    lines.push(line);
  }

  return lines.join('\n');
}

/**
 * Parse fence file format
 */
function parseFenceFile(content: string): FenceItem[] {
  const items: FenceItem[] = [];
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Split by tabs or spaces
    const parts = trimmed.split(/\s+/);
    if (parts.length < 10) continue;

    const item: FenceItem = {
      seq: parseInt(parts[0], 10),
      command: parseInt(parts[1], 10),
      frame: parseInt(parts[2], 10),
      param1: parseFloat(parts[3]),
      param2: parseFloat(parts[4]),
      param3: parseFloat(parts[5]),
      param4: parseFloat(parts[6]),
      latitude: parseFloat(parts[7]),
      longitude: parseFloat(parts[8]),
      altitude: parseFloat(parts[9]),
    };

    items.push(item);
  }

  return items;
}

// ============================================================================
// Rally File Format Helpers
// ============================================================================

/**
 * Format rally items to simple text format
 * Format: seq cmd frame p1 p2 p3 p4 lat lon alt
 */
function formatRallyFile(items: RallyItem[]): string {
  const lines = ['# ArduDeck Rally Points File v1'];
  lines.push('# seq cmd frame p1 p2 p3 p4 lat lon alt');

  for (const item of items) {
    const line = [
      item.seq,
      item.command,
      item.frame,
      item.param1,
      item.param2,
      item.param3,
      item.param4,
      item.latitude.toFixed(8),
      item.longitude.toFixed(8),
      item.altitude.toFixed(6),
    ].join('\t');
    lines.push(line);
  }

  return lines.join('\n');
}

/**
 * Parse rally file format
 */
function parseRallyFile(content: string): RallyItem[] {
  const items: RallyItem[] = [];
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Split by tabs or spaces
    const parts = trimmed.split(/\s+/);
    if (parts.length < 10) continue;

    const item: RallyItem = {
      seq: parseInt(parts[0], 10),
      command: parseInt(parts[1], 10),
      frame: parseInt(parts[2], 10),
      param1: parseFloat(parts[3]),
      param2: parseFloat(parts[4]),
      param3: parseFloat(parts[5]),
      param4: parseFloat(parts[6]),
      latitude: parseFloat(parts[7]),
      longitude: parseFloat(parts[8]),
      altitude: parseFloat(parts[9]),
    };

    items.push(item);
  }

  return items;
}

/**
 * Cleanup function for app shutdown
 * CRITICAL: Must be called on app quit to properly release USB/serial resources
 * Without this, Windows USB drivers (CH340, CP210x, FTDI) may not release properly,
 * causing issues on next connection or potential BSOD.
 */
export async function cleanupOnShutdown(): Promise<void> {
  console.log('[Shutdown] Starting cleanup...');

  try {
    // Full cleanup of MSP connection (stops telemetry AND clears transport)
    cleanupMspConnection();
    console.log('[Shutdown] MSP connection cleaned up');
  } catch (err) {
    console.warn('[Shutdown] Error cleaning up MSP:', err);
  }

  try {
    // Clean up transport listeners
    cleanupTransportListeners();
    console.log('[Shutdown] Transport listeners cleaned up');
  } catch (err) {
    console.warn('[Shutdown] Error cleaning transport listeners:', err);
  }

  try {
    // Close transport if open
    if (currentTransport?.isOpen) {
      await currentTransport.close();
      console.log('[Shutdown] Transport closed');
    }
  } catch (err) {
    console.warn('[Shutdown] Error closing transport:', err);
  }

  // Clear heartbeat timeout
  if (heartbeatTimeout) {
    clearTimeout(heartbeatTimeout);
    heartbeatTimeout = null;
  }

  // Reset state
  currentTransport = null;
  mavlinkParser = null;

  console.log('[Shutdown] Cleanup complete');
}
