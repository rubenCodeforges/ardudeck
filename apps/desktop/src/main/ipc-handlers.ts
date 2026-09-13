/**
 * IPC Handlers for main process
 * Handles communication between renderer and main process
 */

import { ipcMain, BrowserWindow, dialog, app, shell, safeStorage } from 'electron';
import { join, dirname, basename } from 'path';
import { existsSync, readFileSync } from 'fs';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import Store from 'electron-store';
import {
  recordSigningEvent,
  getAuditLog,
  verifyAuditChain,
  buildEvidencePack,
  renderPostureReport,
  type SecureLinkPosture,
} from './signing/signing-audit.js';
import { extractFlightSummary, type LogLike, type HealthLike } from './logs/fleet-log-summary.js';
import { recordFlight, getFleetHistory, clearFleetHistory } from './logs/fleet-log-history.js';
import type { AuthoredObstacle, SimObstacleStoreSchema } from '../shared/sim-obstacle-types.js';
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
import { registerCompanionIpcHandlers } from './companion/companion-ipc-handlers.js';
import { registerDroneBridgeIpcHandlers } from './dronebridge/dronebridge-ipc-handlers.js';
import { mavlinkTee } from './mavlink-tee.js';
import { setupOverlayHandlers, getApiKey } from './overlays/overlay-ipc-handlers.js';
import { setupTrafficHandlers } from './traffic/traffic-ipc-handlers.js';
import {
  setupNtripHandlers,
  cleanupNtrip,
  setNtripOrchestrator,
  pushOrchestratorNtripStatus,
} from './ntrip/ntrip-ipc-handlers.js';
import { getAllWindows, getMainWindow } from './window-manager.js';
import { connectionRegistry } from './connection/connection-registry.js';
import { OrchestrationServerLink } from './connection/orchestration-link.js';
import { makeVehicleKey } from './connection/types.js';
import type { TransportConfig, TransportEntry, TransportId, VehicleEntry } from './connection/types.js';
import {
  MAVLinkParser,
  type MAVLinkPacket,
  serializeV1,
  serializeV2,
  serializeV2Async,
  deserializeParamValue,
  serializeParamRequestList,
  serializeParamSet,
  serializeCommandLong,
  serializeCommandAck,
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
  serializeSetupSigning,
  getSigningTimestamp,
  generateSigningKey,
  verifySignature,
  MAVLINK_SIGNATURE_BLOCK_LEN,
  SETUP_SIGNING_ID,
  SETUP_SIGNING_CRC_EXTRA,
  PARAM_REQUEST_LIST_ID,
  PARAM_REQUEST_LIST_CRC_EXTRA,
  PARAM_REQUEST_READ_ID,
  PARAM_REQUEST_READ_CRC_EXTRA,
  serializeParamRequestRead,
  PARAM_SET_ID,
  PARAM_SET_CRC_EXTRA,
  COMMAND_LONG_ID,
  COMMAND_LONG_CRC_EXTRA,
  COMMAND_ACK_ID,
  COMMAND_ACK_CRC_EXTRA,
  serializeCommandInt,
  COMMAND_INT_ID,
  COMMAND_INT_CRC_EXTRA,
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
  serializeHeartbeat,
  HEARTBEAT_ID,
  HEARTBEAT_CRC_EXTRA,
  serializeRcChannelsOverride,
  RC_CHANNELS_OVERRIDE_ID,
  RC_CHANNELS_OVERRIDE_CRC_EXTRA,
  serializeSetMode,
  SET_MODE_ID,
  SET_MODE_CRC_EXTRA,
  serializeRequestDataStream,
  REQUEST_DATA_STREAM_ID,
  REQUEST_DATA_STREAM_CRC_EXTRA,
  serializeGpsRtcmData,
  GPS_RTCM_DATA_ID,
  GPS_RTCM_DATA_CRC_EXTRA,
  getAllMessageInfos,
  type ParamValue,
} from '@ardudeck/mavlink-ts';
import { IPC_CHANNELS, SEVERITY_LABELS, type ConnectOptions, type ConnectionState, type ConsoleLogEntry, type SavedLayout, type LayoutStoreSchema, type SettingsStoreSchema, type SigningStatus, type TelemetrySpeed, type LegacyStreamConsentRequest, type TransportInfoIpc, type VehicleInfoIpc, type SetActiveSelectionPayload, type VehicleCommand, type MissionVehicleProgress, type OrchestrationIntentIpc, type OrchestrationStatusIpc, type OrchestratorSource, type OrchestratorStatus, type CameraSourceConfig, type GimbalCommand, type CameraCommand, type FrameBlueprintResult, type FrameBlueprintRequest } from '../shared/ipc-channels.js';
import { DEFAULT_USER_UNIT_PREFERENCES } from '../shared/user-units.js';
import { initAutoUpdater, checkForUpdates, downloadUpdate, installUpdate } from './updater.js';
import type { ParamValuePayload, ParameterProgress } from '../shared/parameter-types.js';
import { PARAMETER_METADATA_URLS, mavTypeToVehicleType, type VehicleType, type ParameterMetadata, type ParameterMetadataStore } from '../shared/parameter-metadata.js';
import { persistsStreamRates, cappedLegacyRates } from '../shared/stream-rates.js';
import { getPx4ParameterMetadata } from './px4-parameter-metadata.js';
import { formatPx4Event, px4EventSeverity, setPx4EventMetadata } from './px4-events/index.js';
import { COMP_METADATA_TYPE, fetchPx4ComponentMetadata } from './px4-component-info/index.js';
import { px4CellVoltageAtThreshold } from '../shared/px4-battery.js';
import { verifyCalibrationPersisted } from '../shared/calibration-quality.js';
import type { AttitudeData, PositionData, GpsData, BatteryData, VfrHudData, FlightState, RcChannelsData, NavControllerData, GuidedTargetData } from '../shared/telemetry-types.js';
import { COPTER_MODES, PLANE_MODES, ROVER_MODES, SUB_MODES, getPx4ModeName } from '../shared/telemetry-types.js';
import type { MissionItem, MissionProgress, MavFrame } from '../shared/mission-types.js';
import { buildDjiWpml, parseDjiWpml } from '../shared/dji-wpml.js';
import { MAV_MISSION_RESULT, MAV_MISSION_TYPE } from '../shared/mission-types.js';
import type { FenceItem, FenceStatus } from '../shared/fence-types.js';
import type { RallyItem } from '../shared/rally-types.js';
import type { DetectedBoard, FirmwareSource, FirmwareVehicleType, FirmwareManifest, FirmwareVersion, FlashResult, FlashOptions } from '../shared/firmware-types.js';
import type { MotorTestStartRequest, MotorTestResponse, EscTelemetryData, EscMotorTelemetry } from '../shared/motor-test-types.js';
import { getBoardInfoFromVersion } from '../shared/board-ids.js';
import { detectBoards, fetchFirmwareVersions, downloadFirmware, copyCustomFirmware, flashWithDfu, flashWithAvrdude, flashWithSerialBootloader, flashWithArduPilotBootloader, getArduPilotBoards, getArduPilotVersions, getBetaflightBoards, getBetaflightVersions, resolveBetaflightDownloadUrl, getInavBoards, getInavVersions, type BoardInfo, type VersionGroup } from './firmware/index.js';
import { scanForEdgeTxCards, probeVolume as probeEdgeTxVolume } from './edgetx/sd-detector.js';
import { getPackage as getEdgeTxPackage, catalogInfo as edgeTxCatalogInfo } from './edgetx/package-registry.js';
import { installPackage as installEdgeTxPackage, removePackage as removeEdgeTxPackage, readManifest as readEdgeTxManifest } from './edgetx/package-installer.js';
import type { EdgeTxScanResult, InstalledPackageRecord } from '../shared/edgetx-types.js';
import { registerMspHandlers, tryMspDetection, startMspTelemetry, stopMspTelemetry, cleanupMspConnection, exitCliModeIfActive, autoConfigureSitlPlatform, getMspVehicleType, resetSitlAutoConfig } from './msp/index.js';
import { initCalibrationHandlers, cleanupCalibrationHandlers, handleCalibrationStatusText, handleCalibrationCommandAck, handleIncomingCommandLong, handleMagCalProgress, handleMagCalReport, isMavlinkCalibrationActive, cancelCalibration, type MavlinkCalibrationDeps } from './calibration/index.js';
import { initMissionLibraryHandlers, cleanupMissionLibraryHandlers } from './mission-library/index.js';
import { nextTxSeq } from './tx-sequence.js';
import { telemetryKeyFor } from './telemetry-routing.js';
import { MavlinkFtpClient, parseParamPack, PARAM_PCK_PATH, parseFtpPayload } from './mavlink-ftp/index.js';
import { ingestNamedValueFloat, getScriptHealth, resetHeartbeat, subscribeHealth } from './script-installer/heartbeat-tracker.js';
import * as scriptRegistry from './script-installer/registry-store.js';
import { getScriptBundle } from './script-installer/bundle.js';
import * as installerService from './script-installer/installer-service.js';
import type { FcAdapter } from './script-installer/installer-service.js';
import type { PreflightFix } from '../shared/script-installer-types.js';
import {
  serializeFileTransferProtocol,
  FILE_TRANSFER_PROTOCOL_ID,
  FILE_TRANSFER_PROTOCOL_CRC_EXTRA,
  VIDEO_STREAM_INFORMATION_ID,
  deserializeVideoStreamInformation,
  GIMBAL_DEVICE_ATTITUDE_STATUS_ID,
  deserializeGimbalDeviceAttitudeStatus,
  GIMBAL_MANAGER_INFORMATION_ID,
  deserializeGimbalManagerInformation,
} from '@ardudeck/mavlink-ts';
import { LogDownloadManager, type LogListEntry } from './mavlink-log/index.js';
import { classifyStream, classifyDatagrams } from './link-doctor/stream-classifier.js';
import { detectElrsModule, setElrsLinkMode, cancelElrsOperation } from './link-doctor/elrs-service.js';
import { wfbngReceiver } from './media/wfbng-receiver.js';
import { decodeServoOutputRaw } from './servo-output-decode.js';
import { decodePx4ParamValue, encodePx4ParamSetValue } from './px4-param-bytewise.js';
import { writeFile, readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { createDataFlashParser, runHealthChecks } from '@ardudeck/dataflash-parser';
import { createUlogParser, runPx4HealthChecks } from '@ardudeck/ulog-parser';
import { sitlProcess } from './sitl/sitl-process.js';
import { simEngineProcess } from './sim/sim-engine-process.js';
import { mediaEngine } from './media/media-engine.js';
import { ardupilotSitlProcess, swarmSitlProcess, ardupilotSitlDownloader, ardupilotRcSender } from './sitl/index.js';
import { px4SitlProcess, px4SitlDownloader } from './sitl/index.js';
import { startSimHandoverServer, stopSimHandoverServer } from './sim/sim-handover-server.js';
import { setupTrainerHandlers } from './trainer/trainer-ipc-handlers.js';
import { resolveReconnectTarget } from './connection/reconnect-target.js';
import { orchestratorProcess } from './orchestrator/orchestrator-process.js';
import {
  initUnifiedLogger,
  shutdownLogger,
  collectLogs,
  collectSystemInfo,
  createReportPayload,
  createMspBoardDump,
  createMavlinkBoardDump,
  applyPrivacyFilter,
  saveEncryptedReport,
  getEncryptionInfo,
  type FileLogEntry,
  type BoardDump,
  type BoardDumpMsp,
  type BoardDumpMavlink,
  type SystemInfo,
} from './logging/index.js';
import {
  detectSimulators,
  flightGearLauncher,
  xplaneLauncher,
  protocolBridge,
  setVirtualRC,
  getVirtualRC,
  resetVirtualRC,
  type SimulatorInfo,
  type FlightGearConfig,
  type XPlaneConfig,
  type BridgeConfig,
  type VirtualRCState,
} from './simulators/index.js';
import { ardupilotFlightGear } from './simulators/ardupilot-flightgear.js';
import { detectFlightGear } from './simulators/simulator-detector.js';
import type { SitlConfig, SitlStatus, ArduPilotSitlConfig, ArduPilotSitlStatus, ArduPilotVehicleType, ArduPilotReleaseTrack, ArduPilotSitlBinaryInfo, SwarmSitlConfig, SwarmSitlStatus, ArduPilotFlightGearConfig, Px4SitlConfig, Px4SitlStatus, Px4SitlBinaryInfo, Px4ReleaseTrack } from '../shared/ipc-channels.js';
import { openAreaEditorWindow, setMainMapViewport } from './area-editor-window.js';

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
  const major = parts[0]!;
  const minor = parts[1]!;

  // iNav < 2.1.0 → Legacy (F3 boards)
  if (fcVariant === 'INAV') {
    return major < 2 || (major === 2 && minor < 1);
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

// Simulator authored obstacles (persisted per test site)
const simObstaclesStore = new Store<SimObstacleStoreSchema>({
  name: 'sim-obstacles',
  defaults: { sites: {} },
});

/**
 * MAVLink system id this GCS transmits as. Cached (serialization is hot
 * path), refreshed on settings save. Clamped to 1-255: 0 is broadcast and
 * invalid as a source id. Distinct ids let multiple stations share one
 * vehicle without interleaving params/mission/FTP transfers.
 */
function clampGcsSysid(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v)
    ? Math.min(255, Math.max(1, Math.round(v)))
    : 255;
}

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
    unitPreferences: DEFAULT_USER_UNIT_PREFERENCES,
    flightStats: {
      totalFlightTimeSeconds: 0,
      totalDistanceMeters: 0,
      totalMissions: 0,
      lastFlightDate: null,
      lastConnectionDate: null,
    },
  },
});

let gcsSysid = clampGcsSysid(settingsStore.get('gcsSysid'));

let currentTransport: Transport | null = null;
let currentVehicleType = 0; // 1=plane, 2=copter, etc.
// Watchdog for arm/disarm: warns if the vehicle never ACKs a COMMAND 400, so a
// one-way link / wrong sysid / mode reject reads as a message instead of silence.
let armAckWatchdog: ReturnType<typeof setTimeout> | null = null;
// Multi-vehicle shadow: the registry id for the primary (legacy) transport.
// The ConnectionRegistry mirrors the active connection so vehicles are tracked
// by (transport, sysid, compid). Single-vehicle reads stay on the legacy globals.
let primaryTransportId: TransportId | null = null;
// Single-flight guard for COMMS_CONNECT. Each invocation bumps this and captures
// its own value; an older invocation still mid-connect (paused on the driver
// settle delay, or a socket that is still opening) bails the instant it sees a
// newer attempt. Without this, a connect retry storm during a slow SITL/engine
// startup (the wipe reboot briefly drops the port) can leave two live sockets
// on ArduPilot's single-client TCP serial port, one of which SITL never
// services - so parameters and telemetry silently stall.
let connectGeneration = 0;
// TEMP perf probe: raw MAVLink packet broadcast rate to the renderer(s). REMOVE after diagnosis.
let perfPktCount = 0;
const perfMsgHist = new Map<number, number>();
let perfLogTimer: ReturnType<typeof setInterval> | null = null;
// Raw-packet broadcast batching. One webContents.send per packet saturates
// both processes during log downloads (structured clone + IPC per 90-byte
// LOG_DATA chunk capped the whole transfer at ~110KB/s); batching to 50ms
// buckets keeps the inspector/safety-monitor feeds live at 1/25th the IPC
// cost. The preload unpacks the array so renderer subscribers still see
// single packets.
interface RawPacketIpc {
  msgid: number;
  sysid: number;
  compid: number;
  seq: number;
  payload: number[];
  rxtime: number;
  isMavlink2: boolean;
  isSigned: boolean;
}
const PACKET_BATCH_FLUSH_MS = 50;
const PACKET_BATCH_MAX = 2000;
let packetBatch: RawPacketIpc[] = [];
let packetBatchTimer: NodeJS.Timeout | null = null;
// Tracks last armed state reported to renderer so we only log on transitions
let lastReportedArmed: boolean | null = null;
let mavlinkParser: MAVLinkParser | null = null;
let heartbeatTimeout: NodeJS.Timeout | null = null;
let heartbeatWatchdog: NodeJS.Timeout | null = null;
let heartbeatGraceTimer: NodeJS.Timeout | null = null;

// Link Doctor: raw bytes captured while waiting for the first heartbeat,
// classified on timeout to explain WHAT the port was speaking (capped 4KB).
let linkDoctorSample: Uint8Array[] = [];
let linkDoctorSampleBytes = 0;

// Heartbeat watchdog: detect when vehicle stops sending heartbeats.
// Two-stage model (mimics Mission Planner behavior):
//   1. After HEARTBEAT_STALE_MS of silence, mark the link "stale" and show a
//      warning in the UI but keep the transport open. Many real-world drops
//      (radio link, WireGuard tunnel, mavp2p router hiccups) recover within
//      seconds; disconnecting aggressively boots the user back to the
//      connection screen and is disruptive.
//   2. After HEARTBEAT_GRACE_MS of continued silence, fully disconnect. The
//      transport is also closed immediately on any underlying socket close.
const HEARTBEAT_STALE_MS = 5000;
const HEARTBEAT_GRACE_MS = 60000;
// Legacy constant retained for logging messages referencing the old window.
const HEARTBEAT_WATCHDOG_MS = HEARTBEAT_STALE_MS;

// =============================================================================
// MAVLink Signing State
// =============================================================================

// Encrypted key storage (persisted across sessions)
const signingStore = new Store<{
  encryptedKey?: string;
  linkId?: number;
  sentToFc?: boolean;
  savedKeys?: Array<{ encryptedKey: string; fingerprint: string; label?: string; systemIds?: number[] }>;
}>({
  name: 'mavlink-signing',
  defaults: {},
});

// Parameter history storage (version control per board)
import type { ParamChange, ParamCheckpoint, BoardParamHistory } from '../shared/param-history-types.js';
import { areasToKml, type ExportArea } from '../shared/kml-export.js';
const paramHistoryStore = new Store<{ boards: Record<string, BoardParamHistory> }>({
  name: 'param-history',
  defaults: { boards: {} },
});

/**
 * Calibration record per board, so a calibration can be PROVEN after the
 * reboot rather than assumed.
 *
 * The dangerous moment is the reboot: the wizard reports success, the FC
 * restarts, and nothing checks that the new values actually came back. An
 * operator reasonably assumes a rebooted vehicle kept its calibration. This
 * survives both the reboot and an app restart, so the answer is still there
 * when the vehicle reconnects.
 */
interface CalibrationRecord {
  /** 'accel-6point' | 'compass' | ... */
  type: string;
  /** Values the calibration produced, to be compared after the reboot. */
  written: Record<string, number>;
  /** 'good' | 'marginal' | 'bad' | 'unknown' at the time it was written. */
  verdict: string;
  summary: string;
  completedAt: number;
  /** null until the vehicle has reconnected and been re-read. */
  persistence: null | { state: string; summary: string; mismatched: string[]; checkedAt: number };
}
const calibrationRecordStore = new Store<{ boards: Record<string, CalibrationRecord[]> }>({
  name: 'calibration-records',
  defaults: { boards: {} },
});

// AI chat conversation storage keyed by log file path
const chatStore = new Store<{ conversations: Record<string, { messages: { role: string; content: string }[]; insightCards: unknown[] }> }>({
  name: 'log-chats',
  defaults: { conversations: {} },
});

// Recent log files
interface RecentLogEntry {
  path: string;
  name: string;
  size: number;
  openedAt: number;
  /** FC identity recorded at download time so the "Downloaded" badge can
   * match reliably. FC log ids renumber as logs rotate, so id alone (or an
   * id parsed out of the filename) lights up the WRONG row after a flight. */
  fcLogId?: number;
  fcTimeUtc?: number;
  fcSizeBytes?: number;
}
const recentLogsStore = new Store<{ logs: RecentLogEntry[] }>({
  name: 'recent-logs',
  defaults: { logs: [] },
});

/**
 * Record a file in the recent-logs list, moving it to the top.
 *
 * CARRIES THE FC IDENTITY FORWARD. Only the download path knows which FC log a
 * file came from, and it stamps fcLogId/fcTimeUtc/fcSizeBytes at that moment.
 * Opening that same file afterwards used to re-insert a bare entry and drop the
 * stamp, so the "Downloaded" badge vanished from the row the moment you opened
 * the log you had just downloaded. It only appeared to work for files still
 * named log_<id>.bin, which fall back to matching on the filename.
 */
function rememberRecentLog(entry: RecentLogEntry): void {
  const logs = recentLogsStore.get('logs');
  const previous = logs.find((l) => l.path === entry.path);
  const merged: RecentLogEntry = {
    ...entry,
    fcLogId: entry.fcLogId ?? previous?.fcLogId,
    fcTimeUtc: entry.fcTimeUtc ?? previous?.fcTimeUtc,
    fcSizeBytes: entry.fcSizeBytes ?? previous?.fcSizeBytes,
  };
  recentLogsStore.set('logs', [merged, ...logs.filter((l) => l.path !== entry.path)].slice(0, 20));
}

let signingEnabled = false;
let signingKey: Uint8Array | null = null;
let signingLinkId = 0;
let signingSentToFc = signingStore.get('sentToFc') ?? false;
let signingKeyMismatch = false;

// Multi-key storage: all saved signing keys loaded into memory for auto-matching
// Parallel arrays: allSavedKeys[i] corresponds to allSavedFingerprints[i]
let allSavedKeys: Uint8Array[] = [];
let allSavedFingerprints: string[] = [];

/**
 * Load all saved signing keys from encrypted storage into memory.
 */
function loadAllSavedKeys(): void {
  const saved = signingStore.get('savedKeys') ?? [];
  allSavedKeys = [];
  allSavedFingerprints = [];
  for (const entry of saved) {
    try {
      if (!safeStorage.isEncryptionAvailable()) continue;
      const decrypted = safeStorage.decryptString(Buffer.from(entry.encryptedKey, 'base64'));
      const bytes = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        bytes[i] = parseInt(decrypted.substring(i * 2, i * 2 + 2), 16);
      }
      allSavedKeys.push(bytes);
      allSavedFingerprints.push(entry.fingerprint);
    } catch {
      // Skip corrupted entries
    }
  }
}

/**
 * Save a key to the saved keys list (deduplicates by fingerprint).
 */
function addToSavedKeys(key: Uint8Array): void {
  const fingerprint = Array.from(key.slice(0, 6)).map(b => b.toString(16).padStart(2, '0')).join('');
  const saved = signingStore.get('savedKeys') ?? [];

  // Check if already saved (by fingerprint)
  if (saved.some(k => k.fingerprint === fingerprint)) return;

  // Encrypt and save
  const hex = Array.from(key).map(b => b.toString(16).padStart(2, '0')).join('');
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(hex);
    saved.push({ encryptedKey: encrypted.toString('base64'), fingerprint, systemIds: [] });
  } else {
    saved.push({ encryptedKey: hex, fingerprint, systemIds: [] });
  }
  signingStore.set('savedKeys', saved);

  // Reload into memory
  loadAllSavedKeys();
}

/**
 * Associate a system ID with a saved key (after successful verification).
 * Next time we connect to this sysid, we try this key first.
 */
function associateKeyWithSystem(keyFingerprint: string, sysid: number): void {
  const saved = signingStore.get('savedKeys') ?? [];
  const entry = saved.find(k => k.fingerprint === keyFingerprint);
  if (!entry) return;

  const ids = entry.systemIds ?? [];
  if (!ids.includes(sysid)) {
    entry.systemIds = [...ids, sysid];
    signingStore.set('savedKeys', saved);
    console.log(`[MAVLink Signing] Associated key ${keyFingerprint} with sysid ${sysid}`);
  }
}

/**
 * Get saved key fingerprints for UI display.
 */
function getSavedKeyFingerprints(): Array<{ fingerprint: string; label?: string; systemIds: number[] }> {
  return (signingStore.get('savedKeys') ?? []).map(k => ({
    fingerprint: k.fingerprint,
    label: k.label,
    systemIds: k.systemIds ?? [],
  }));
}

/**
 * Auto-load signing key from encrypted storage.
 * Must be called after app.whenReady() since safeStorage requires it.
 */
function autoLoadSigningKey(): void {
  // Always load the full saved keys list for auto-matching on connect
  loadAllSavedKeys();
  if (allSavedKeys.length > 0) {
    console.log(`[MAVLink Signing] Loaded ${allSavedKeys.length} saved key(s) for auto-matching`);
  }

  if (signingKey) return; // Already loaded
  signingKey = loadSigningKey();
  if (signingKey) {
    // Migrate legacy single-key into the multi-key saved list
    addToSavedKeys(signingKey);

    signingLinkId = signingStore.get('linkId') ?? 0;
    // If key was previously sent to FC, enable signing immediately.
    // This ensures outgoing packets are signed from the first packet,
    // matching Mission Planner behavior and preventing mavproxy crashes
    // when it tries to re-sign unsigned packets for a signed FC link.
    if (signingSentToFc) {
      signingEnabled = true;
      console.log('[MAVLink Signing] Key loaded + signing enabled at startup (previously sent to FC)');
      recordSigningEvent({
        event: 'startup-auto-enable',
        actor: 'startup',
        fingerprint: signingFingerprint(signingKey),
        detail: 'Signing re-enabled at startup from a key previously delivered to the FC',
      });
    } else {
      console.log('[MAVLink Signing] Key loaded from storage at startup');
    }
  }
}

/**
 * Load signing key from encrypted storage.
 * Returns null if no key stored or decryption fails.
 */
function loadSigningKey(): Uint8Array | null {
  try {
    const encrypted = signingStore.get('encryptedKey');
    if (!encrypted) return null;
    if (!safeStorage.isEncryptionAvailable()) return null;
    const decrypted = safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
    // Key is stored as hex string
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      bytes[i] = parseInt(decrypted.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Save signing key to encrypted storage.
 */
function saveSigningKey(key: Uint8Array): void {
  if (!safeStorage.isEncryptionAvailable()) {
    // Fallback: store without encryption (platform doesn't support safeStorage)
    const hex = Array.from(key).map(b => b.toString(16).padStart(2, '0')).join('');
    signingStore.set('encryptedKey', hex);
    return;
  }
  const hex = Array.from(key).map(b => b.toString(16).padStart(2, '0')).join('');
  const encrypted = safeStorage.encryptString(hex);
  signingStore.set('encryptedKey', encrypted.toString('base64'));
}

/**
 * Convert a passphrase to a 32-byte signing key using SHA-256.
 * Also accepts raw keys as hex (64 chars) or base64 (44 chars) - used directly without hashing.
 * This matches Mission Planner which can accept both passphrases and raw keys.
 */
async function passphraseToKey(passphrase: string): Promise<Uint8Array> {
  // Detect raw hex key (64 hex chars = 32 bytes)
  if (/^[0-9a-fA-F]{64}$/.test(passphrase)) {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      bytes[i] = parseInt(passphrase.substring(i * 2, i * 2 + 2), 16);
    }
    console.log('[MAVLink Signing] Using raw hex key (64 chars)');
    return bytes;
  }

  // Detect raw base64 key (44 chars = 32 bytes in base64)
  if (/^[A-Za-z0-9+/]{42,44}={0,2}$/.test(passphrase) && passphrase.length >= 42 && passphrase.length <= 44) {
    try {
      const decoded = Buffer.from(passphrase, 'base64');
      if (decoded.length === 32) {
        console.log('[MAVLink Signing] Using raw base64 key (44 chars)');
        return new Uint8Array(decoded);
      }
    } catch {
      // Not valid base64 - fall through to passphrase hashing
    }
  }

  // Default: hash passphrase with SHA-256 (same as Mission Planner & UDPProxy)
  const { createHash } = await import('node:crypto');
  const hash = createHash('sha256').update(passphrase).digest();
  return new Uint8Array(hash);
}

/**
 * Get current signing status.
 */
/** 6-byte (12 hex char) fingerprint of a signing key, the format used everywhere. */
function signingFingerprint(key: Uint8Array): string {
  return Array.from(key.slice(0, 6)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function getSigningStatus(): SigningStatus {
  return {
    enabled: signingEnabled,
    hasKey: signingKey !== null,
    sentToFc: signingSentToFc,
    keyFingerprint: signingKey ? signingFingerprint(signingKey) : undefined,
    keyBase64: signingKey
      ? Buffer.from(signingKey).toString('base64')
      : undefined,
    keyMismatch: signingKeyMismatch,
    savedKeys: getSavedKeyFingerprints(),
  };
}

/** Snapshot the current secure-link posture for the compliance evidence pack. */
function getSecureLinkPosture(): SecureLinkPosture {
  return {
    signingEnabled,
    hasKey: signingKey !== null,
    sentToFc: signingSentToFc,
    fcSigning: connectionState.fcSigning ?? false,
    keyMismatch: signingKeyMismatch,
    activeFingerprint: signingKey ? signingFingerprint(signingKey) : undefined,
    savedKeys: getSavedKeyFingerprints(),
  };
}

/**
 * Centralized MAVLink packet send helper.
 * Applies signing when enabled, handles v1/v2 selection.
 */
let signingLoggedOnce = false;

async function sendMavlinkPacket(
  msgid: number,
  payload: Uint8Array,
  crcExtra: number,
  options: { sysid?: number; compid?: number; sequence?: number; link?: object | null } = {}
): Promise<Uint8Array> {
  const { link, ...rest } = options;
  const opts = { sysid: gcsSysid, compid: 190, sequence: nextTxSeq(link ?? currentTransport), ...rest };

  if (signingEnabled && signingKey && detectedMavlinkVersion === 2) {
    if (!signingLoggedOnce) {
      signingLoggedOnce = true;
      console.log(`[MAVLink Signing] Sending signed packet (msgid=${msgid}, len=${payload.length + 13}sig)`);
    }
    return serializeV2Async(msgid, payload, crcExtra, {
      ...opts,
      sign: true,
      signingKey,
      linkId: signingLinkId,
    });
  }

  if (detectedMavlinkVersion === 2) {
    return serializeV2(msgid, payload, crcExtra, opts);
  }

  return serializeV1(msgid, payload, crcExtra, opts);
}

// BSOD FIX: Store handler references for proper cleanup on disconnect
// Without this, handlers accumulate on reconnect cycles causing driver stress
let mavlinkDataHandler: ((data: Uint8Array) => Promise<void>) | null = null;
let transportErrorHandler: ((err: Error) => void) | null = null;
let transportCloseHandler: (() => void) | null = null;

// GCS heartbeat: ArduPilot requires GCS heartbeats to recognize us as a valid GCS
let gcsHeartbeatInterval: NodeJS.Timeout | null = null;

// Stream rate retry: ArduPilot may not accept stream requests until it recognizes us as a GCS
let streamRateRetryTimeout: NodeJS.Timeout | null = null;
// Deferred legacy REQUEST_DATA_STREAM fallback (see sendStreamRateRequests)
let legacyStreamFallbackTimeout: NodeJS.Timeout | null = null;
// True once we've sent SET_MESSAGE_INTERVAL overrides this session, so
// switching to 'fc' knows there is something to undo.
let sessionRatesRequested = false;
// Freshness marker for the primary link's ATTITUDE stream
let lastAttitudeAtMs = 0;

// Telemetry stream rate presets (Hz values per message category).
// 'fc' has no preset on purpose: it means "send no rate requests at all".
const STREAM_RATE_PRESETS: Record<Exclude<TelemetrySpeed, 'fc'>, { attitude: number; position: number; other: number }> = {
  eco:    { attitude: 10, position: 4,  other: 2 },
  normal: { attitude: 30, position: 10, other: 5 },
  max:    { attitude: 50, position: 15, other: 10 },
};

/**
 * Links waiting on the pilot's permission to send legacy stream requests.
 *
 * Reached only when the modern SET_MESSAGE_INTERVAL path produced nothing AND
 * the vehicle is one that SAVES legacy rates into its SR*_ parameters (see
 * shared/stream-rates.ts). Rather than silently rewriting the vehicle or
 * silently leaving the pilot with no telemetry, the decision is theirs.
 */
interface PendingLegacyStreamConsent {
  transport: Transport;
  sysid: number;
  compid: number;
  mavType: number | null;
  isFleetLink: boolean;
}
const pendingLegacyConsent = new Map<string, PendingLegacyStreamConsent>();

/** Vehicles the pilot has already answered for, so they are asked once. */
const legacyConsentAnswered = new Set<string>();

function legacyConsentKey(sysid: number, compid: number): string {
  return `${sysid}:${compid}`;
}

/**
 * Ask the renderer to put the question to the pilot. A no-op if they have
 * already answered for this vehicle this session.
 */
function askForLegacyStreamConsent(
  mainWindow: BrowserWindow,
  pending: PendingLegacyStreamConsent,
  label: string,
): void {
  const requestId = legacyConsentKey(pending.sysid, pending.compid);
  if (legacyConsentAnswered.has(requestId)) return;
  pendingLegacyConsent.set(requestId, pending);
  safeSend(mainWindow, IPC_CHANNELS.TELEMETRY_LEGACY_STREAM_CONSENT_REQUEST, {
    requestId,
    sysid: pending.sysid,
    compid: pending.compid,
    mavType: pending.mavType,
    label,
    isFleetLink: pending.isFleetLink,
  } satisfies LegacyStreamConsentRequest);
}

// Current telemetry speed (updated from settings on connect, from renderer on toggle)
let currentTelemetrySpeed: TelemetrySpeed = 'normal';

/**
 * Send REQUEST_DATA_STREAM (msg #66) for legacy stream groups.
 * This is the older, universally-supported method used by Mission Planner.
 * ArduPilot maps stream groups to individual messages internally.
 *
 * Stream groups:
 *   0=ALL, 1=RAW_SENSORS, 2=EXTENDED_STATUS, 3=RC_CHANNELS,
 *   4=RAW_CONTROLLER, 6=POSITION, 10=EXTRA1, 11=EXTRA2, 12=EXTRA3
 */
async function sendLegacyStreamRequests(mainWindow: BrowserWindow, speed: TelemetrySpeed): Promise<void> {
  if (speed === 'fc') return;
  if (!currentTransport?.isOpen || !connectionState.isConnected) return;

  const preset = STREAM_RATE_PRESETS[speed];
  if (!preset) return;

  // ArduPlane SAVES legacy-requested rates into SR*_ (see shared/stream-rates.ts).
  // A GCS must not rewrite a pilot's configuration, so this path is simply not
  // available on those vehicles; the modern per-message path already ran.
  if (persistsStreamRates(connectionState.mavType)) {
    // Not our call to make: these requests would be written into the pilot's
    // SR*_ parameters and outlive the session. Ask.
    sendLog(mainWindow, 'warn',
      'No telemetry, and this vehicle saves legacy stream rates to its SR*_ parameters',
      'Asking before changing the vehicle. See shared/stream-rates.ts.');
    askForLegacyStreamConsent(mainWindow, {
      transport: currentTransport,
      sysid: connectionState.systemId ?? 1,
      compid: connectionState.componentId ?? 1,
      mavType: connectionState.mavType ?? null,
      isFleetLink: false,
    }, connectionState.vehicleType ?? 'this vehicle');
    return;
  }

  // Capped, never the pilot's chosen preset: a fallback must not be able to
  // burn 50 Hz attitude into anything.
  const rates = cappedLegacyRates(preset);

  const targetSys = connectionState.systemId ?? 1;
  const targetComp = connectionState.componentId ?? 1;

  // Map stream groups to Hz rates (same groups Mission Planner requests)
  const streamRequests = [
    { streamId: 1,  hz: rates.other },     // RAW_SENSORS: RAW_IMU, SCALED_PRESSURE, GPS_RAW_INT
    { streamId: 2,  hz: rates.other },     // EXTENDED_STATUS: SYS_STATUS, GPS_RAW_INT, NAV_CONTROLLER
    { streamId: 3,  hz: rates.other },     // RC_CHANNELS: RC_CHANNELS, SERVO_OUTPUT_RAW
    { streamId: 6,  hz: rates.position },  // POSITION: GLOBAL_POSITION_INT, LOCAL_POSITION
    { streamId: 10, hz: rates.attitude },  // EXTRA1: ATTITUDE
    { streamId: 11, hz: rates.position },  // EXTRA2: VFR_HUD
    { streamId: 12, hz: rates.other },     // EXTRA3: BATTERY_STATUS, etc.
  ];

  for (const req of streamRequests) {
    if (!currentTransport?.isOpen) break;
    try {
      const payload = serializeRequestDataStream({
        targetSystem: targetSys,
        targetComponent: targetComp,
        reqStreamId: req.streamId,
        reqMessageRate: req.hz,
        startStop: 1, // 1 = start sending
      });
      const pkt = await sendMavlinkPacket(REQUEST_DATA_STREAM_ID, payload, REQUEST_DATA_STREAM_CRC_EXTRA);
      await currentTransport!.write(pkt);
      await new Promise(resolve => setTimeout(resolve, 20));
    } catch {
      // Non-critical, SET_MESSAGE_INTERVAL is the primary method
    }
  }
}

// Messages whose rates the speed presets manage, with their preset category.
// Shared by the request path and the 'fc' restore path so both cover the
// exact same set.
const TELEM_STREAM_MESSAGES: { msgId: number; cat: 'attitude' | 'position' | 'other'; hz?: number }[] = [
  { msgId: 30, cat: 'attitude' },        // ATTITUDE
  { msgId: 33, cat: 'position' },        // GLOBAL_POSITION_INT
  { msgId: 24, cat: 'other' },           // GPS_RAW_INT
  { msgId: 124, cat: 'other' },          // GPS2_RAW (FC only sends it when a 2nd GPS is present)
  { msgId: 1,  cat: 'other' },           // SYS_STATUS
  { msgId: 35, cat: 'other' },           // RC_CHANNELS_RAW (fallback for ELRS-over-MAVLink)
  { msgId: 65, cat: 'other' },           // RC_CHANNELS
  { msgId: 74, cat: 'other' },           // VFR_HUD
  { msgId: 42, cat: 'other', hz: 2 },    // MISSION_CURRENT (current WP; not honored via SRx on TCP, must request)
  { msgId: 62, cat: 'other', hz: 2 },    // NAV_CONTROLLER_OUTPUT (wp distance/bearing/xtrack)
  { msgId: 36, cat: 'other' },           // SERVO_OUTPUT_RAW
  { msgId: 27, cat: 'other' },           // RAW_IMU
  { msgId: 29, cat: 'other' },           // SCALED_PRESSURE
  { msgId: 168, cat: 'other', hz: 1 },   // WIND (ArduPilot wind estimation, 1Hz is plenty)
  { msgId: 231, cat: 'other', hz: 1 },   // WIND_COV (PX4's wind message; AP uses 168)
  { msgId: 241, cat: 'other' },          // VIBRATION (for motor test view)
  { msgId: 147, cat: 'other' },          // BATTERY_STATUS (per-monitor batteries, #126)
  { msgId: 87,  cat: 'other', hz: 2 },   // POSITION_TARGET_GLOBAL_INT (fly-here target/line; AP pushes it unrequested, PX4 only on request)
  { msgId: 11030, cat: 'other' },        // ESC_TELEMETRY_1_TO_4
  { msgId: 11031, cat: 'other' },        // ESC_TELEMETRY_5_TO_8
  { msgId: 11032, cat: 'other' },        // ESC_TELEMETRY_9_TO_12
];

/**
 * Send MAV_CMD_SET_MESSAGE_INTERVAL for all telemetry streams.
 *
 * SET_MESSAGE_INTERVAL is transient (RAM only). The legacy REQUEST_DATA_STREAM
 * is NOT: ArduPilot persists those rates into the user's SRx_* parameters
 * (persist_streamrates), permanently overwriting rates tuned for a
 * bandwidth-limited link. So legacy is a deferred last resort: it is only sent
 * if no ATTITUDE is flowing a few seconds after the interval commands (very
 * old firmware). If data flows - from our commands or the FC's own configured
 * rates - we never emit it.
 *
 * speed 'fc' sends no requests; if we already overrode rates this session it
 * hands them back to the FC via interval 0 ("restore default rate").
 */
async function sendStreamRateRequests(mainWindow: BrowserWindow, speed: TelemetrySpeed): Promise<void> {
  if (!currentTransport?.isOpen || !connectionState.isConnected) return;

  if (legacyStreamFallbackTimeout) {
    clearTimeout(legacyStreamFallbackTimeout);
    legacyStreamFallbackTimeout = null;
  }

  const targetSys = connectionState.systemId ?? 1;
  const targetComp = connectionState.componentId ?? 1;

  const sendInterval = async (msgId: number, intervalUs: number): Promise<boolean> => {
    if (!currentTransport?.isOpen) return false;
    try {
      const cmdPayload = serializeCommandLong({
        targetSystem: targetSys,
        targetComponent: targetComp,
        command: 511, // MAV_CMD_SET_MESSAGE_INTERVAL
        confirmation: 0,
        param1: msgId,
        param2: intervalUs,
        param3: 0, param4: 0, param5: 0, param6: 0, param7: 0,
      });
      const pkt = await sendMavlinkPacket(COMMAND_LONG_ID, cmdPayload, COMMAND_LONG_CRC_EXTRA);
      await currentTransport!.write(pkt);
      // Small delay between commands so FC can process each one
      await new Promise(resolve => setTimeout(resolve, 30));
      return true;
    } catch (err) {
      console.error(`[StreamRate] Failed to send interval for msg #${msgId}:`, err);
      return false;
    }
  };

  if (speed === 'fc') {
    currentTelemetrySpeed = 'fc';
    if (sessionRatesRequested) {
      // Undo our session overrides: interval 0 = "restore default rate", so
      // the FC falls back to its configured SRx_* rates immediately.
      sessionRatesRequested = false;
      let restored = 0;
      for (const m of TELEM_STREAM_MESSAGES) {
        if (await sendInterval(m.msgId, 0)) restored++;
      }
      sendLog(mainWindow, 'info', 'Telemetry rate: FC-controlled', `Handed rates back to the FC (${restored}/${TELEM_STREAM_MESSAGES.length} messages restored to FC defaults)`);
    } else {
      sendLog(mainWindow, 'info', 'Telemetry rate: FC-controlled', 'No rate requests sent; the FC streams at its configured SRx_* rates');
    }
    return;
  }

  const rates = STREAM_RATE_PRESETS[speed];
  if (!rates) return;

  let sent = 0;
  for (const m of TELEM_STREAM_MESSAGES) {
    const hz = m.hz ?? rates[m.cat];
    if (await sendInterval(m.msgId, Math.round(1_000_000 / hz))) sent++;
  }
  if (sent > 0) sessionRatesRequested = true;

  // Deferred legacy fallback (see doc comment above): only if nothing flows.
  legacyStreamFallbackTimeout = setTimeout(async () => {
    legacyStreamFallbackTimeout = null;
    if (!currentTransport?.isOpen || !connectionState.isConnected) return;
    if (currentTelemetrySpeed === 'fc') return;
    if (Date.now() - lastAttitudeAtMs < 3000) return; // Telemetry is flowing, don't touch SRx params
    sendLog(mainWindow, 'warn', 'No telemetry after SET_MESSAGE_INTERVAL, falling back to legacy stream requests', 'Note: ArduPilot saves legacy-requested rates into the SRx_* parameters');
    await sendLegacyStreamRequests(mainWindow, currentTelemetrySpeed);
  }, 4000);

  currentTelemetrySpeed = speed;
  sendLog(mainWindow, 'info', `Telemetry rate: ${speed}`, `${sent}/${TELEM_STREAM_MESSAGES.length} cmds sent - ATT ${rates.attitude}Hz, POS ${rates.position}Hz, OTHER ${rates.other}Hz`);
}

/**
 * Request telemetry streams on a SPECIFIC transport for a SPECIFIC vehicle.
 *
 * Unlike sendStreamRateRequests (which only targets the primary currentTransport),
 * this is transport-agnostic and used for background / fleet / swarm / orchestration
 * links. ArduPilot only streams telemetry to a GCS that explicitly requests it: a
 * passively-listening multi-vehicle transport gets HEARTBEAT-only (mode/armed/type
 * show, but GPS/battery/position/attitude stay at zero) until we ask. SITL's SRx_*
 * stream-rate params are NOT honored on a TCP link in current ArduPilot master, so
 * the request must come from us. A single REQUEST_DATA_STREAM is durable (the FC
 * keeps streaming without continuous GCS heartbeats), but real radio links drop
 * packets, so we send a few times.
 */
async function requestStreamsOnTransport(
  transport: Transport,
  sysid: number,
  compid: number,
  speed: TelemetrySpeed,
  /**
   * The vehicle's MAV_TYPE, when the caller knows it. Decides whether the
   * legacy REQUEST_DATA_STREAM half of this function may run at all: on a
   * plane those rates are written into SR*_ and outlive the session. Omitted
   * means unknown, which is treated as persisting.
   */
  mavType?: number,
): Promise<void> {
  if (speed === 'fc') return;
  const preset = STREAM_RATE_PRESETS[speed];
  if (!preset) return;
  const rates = preset;

  const messageIntervals = [
    { msgId: 30, hz: rates.attitude },  // ATTITUDE
    { msgId: 33, hz: rates.position },  // GLOBAL_POSITION_INT
    { msgId: 24, hz: rates.other },     // GPS_RAW_INT
    { msgId: 1,  hz: rates.other },     // SYS_STATUS (battery)
    { msgId: 65, hz: rates.other },     // RC_CHANNELS
    { msgId: 74, hz: rates.other },     // VFR_HUD
    { msgId: 42, hz: 2 },               // MISSION_CURRENT (current WP)
    { msgId: 62, hz: 2 },               // NAV_CONTROLLER_OUTPUT (wp distance/bearing)
    { msgId: 27, hz: rates.other },     // RAW_IMU
  ];

  // Capped, not the pilot's preset: see the guard below and
  // shared/stream-rates.ts. The per-message requests above are session-only
  // and use the full preset; only this legacy table is fenced.
  const legacyRates = cappedLegacyRates(rates);
  const legacyStreams = [
    { streamId: 2,  hz: legacyRates.other },     // EXTENDED_STATUS
    { streamId: 6,  hz: legacyRates.position },  // POSITION
    { streamId: 10, hz: legacyRates.attitude },  // EXTRA1 (ATTITUDE)
    { streamId: 11, hz: legacyRates.position },  // EXTRA2 (VFR_HUD)
    { streamId: 12, hz: legacyRates.other },     // EXTRA3 (battery, etc.)
    { streamId: 1,  hz: legacyRates.other },     // RAW_SENSORS (GPS_RAW_INT)
  ];

  for (const req of messageIntervals) {
    if (!transport.isOpen) return;
    try {
      const intervalUs = Math.round(1_000_000 / req.hz);
      const cmdPayload = serializeCommandLong({
        targetSystem: sysid,
        targetComponent: compid,
        command: 511, // MAV_CMD_SET_MESSAGE_INTERVAL
        confirmation: 0,
        param1: req.msgId,
        param2: intervalUs,
        param3: 0, param4: 0, param5: 0, param6: 0, param7: 0,
      });
      const pkt = await sendMavlinkPacket(COMMAND_LONG_ID, cmdPayload, COMMAND_LONG_CRC_EXTRA, { link: transport });
      await transport.write(pkt);
      await new Promise(resolve => setTimeout(resolve, 15));
    } catch {
      // Best-effort; the legacy REQUEST_DATA_STREAM below is the reliable fallback.
    }
  }

  // Legacy REQUEST_DATA_STREAM groups - universally supported and verified to
  // start full telemetry on ArduPilot master where SET_MESSAGE_INTERVAL/SRx params do not.
  //
  // This used to run unconditionally on every fleet link, at the pilot's
  // chosen preset. On a plane that meant rewriting its SR*_ parameters on
  // every connect, which is what a pilot reported. Now: never on a vehicle
  // that saves them, and capped when it does run.
  if (persistsStreamRates(mavType)) {
    // Same rule on a fleet link, and it matters more here: this path used to
    // fire on every connect, so a fleet plane had its parameters rewritten
    // every single time.
    const win = getMainWindow();
    if (win) {
      askForLegacyStreamConsent(win, {
        transport,
        sysid,
        compid,
        mavType: mavType ?? null,
        isFleetLink: true,
      }, `vehicle ${sysid}`);
    }
    return;
  }
  for (const req of legacyStreams) {
    if (!transport.isOpen) return;
    try {
      const payload = serializeRequestDataStream({
        targetSystem: sysid,
        targetComponent: compid,
        reqStreamId: req.streamId,
        reqMessageRate: req.hz,
        startStop: 1,
      });
      const pkt = await sendMavlinkPacket(REQUEST_DATA_STREAM_ID, payload, REQUEST_DATA_STREAM_CRC_EXTRA, { link: transport });
      await transport.write(pkt);
      await new Promise(resolve => setTimeout(resolve, 15));
    } catch {
      // Best-effort.
    }
  }
}

// BSOD FIX: MAVLink processing state to prevent overlapping packet processing
let processingMavlink = false;
const pendingMavlinkData: Uint8Array[] = [];

// Battery fix: Coalesce MAVLink telemetry into a single IPC batch at 10Hz max
// Telemetry batches keyed by source vehicleKey, so a second vehicle or an
// antenna tracker sharing the primary link accumulates into its own batch and
// never corrupts the primary vehicle's telemetry. `'__primary__'` is used
// before the primary transport is registered (early bytes during connect).
let mavlinkTelemetryBatches: Record<string, Record<string, unknown>> = {};
let mavlinkBatchTimer: NodeJS.Timeout | null = null;
// Source vehicleKey for the packet currently being parsed. Set at the top of
// parseTelemetry and read by queueMavlinkTelemetry; safe because parseTelemetry
// and every queue call it triggers run synchronously with no awaits between.
let parseVehicleKey = '__primary__';
const PRIMARY_BATCH_KEY = '__primary__';

// RC channel merge: msg 65 (RC_CHANNELS, 18ch) + msg 35 (RC_CHANNELS_RAW, 8ch) fallback.
// Some FCs (e.g. ELRS over MAVLink) may send stale stick data in msg 65 but fresh data in msg 35.
let rcMsg65: { channels: number[]; chancount: number; rssi: number } = { channels: [], chancount: 0, rssi: 0 };
let rcMsg35: { channels: number[]; rssi: number } = { channels: [], rssi: 0 };

function emitMergedRcChannels(mainWindow: BrowserWindow): void {
  const has65 = rcMsg65.chancount > 0;
  const has35 = rcMsg35.channels.length > 0;
  if (!has65 && !has35) return;

  // Base from msg 65 (up to 18 channels), fall back to msg 35 (8 channels)
  const channels = has65 ? [...rcMsg65.channels] : [...rcMsg35.channels];
  const chancount = has65 ? rcMsg65.chancount : rcMsg35.channels.length;
  const rssi = has65 ? rcMsg65.rssi : rcMsg35.rssi;

  // Overlay msg 35 channels 1-8 onto msg 65 when both exist.
  // In normal operation both sources match; when msg 65 has stale sticks, msg 35 fixes them.
  if (has65 && has35) {
    for (let i = 0; i < rcMsg35.channels.length && i < channels.length; i++) {
      channels[i] = rcMsg35.channels[i]!;
    }
  }

  queueMavlinkTelemetry(mainWindow, {
    rcChannels: { channels, chancount, rssi } as RcChannelsData,
  });
}

function resetRcChannelState(): void {
  rcMsg65 = { channels: [], chancount: 0, rssi: 0 };
  rcMsg35 = { channels: [], rssi: 0 };
}

function queueMavlinkTelemetry(mainWindow: BrowserWindow, fields: Record<string, unknown>, vehicleKey?: string) {
  const batch = (mavlinkTelemetryBatches[vehicleKey ?? parseVehicleKey] ??= {});
  Object.assign(batch, fields);
  if (!mavlinkBatchTimer) {
    mavlinkBatchTimer = setTimeout(() => {
      // One TELEMETRY_BATCH per vehicle, tagged so the renderer routes it to the
      // right per-vehicle slice. The active vehicle drives the legacy view.
      for (const [vehicleKey, b] of Object.entries(mavlinkTelemetryBatches)) {
        safeSend(mainWindow, IPC_CHANNELS.TELEMETRY_BATCH, { ...b, __vehicleKey: vehicleKey });
      }
      mavlinkTelemetryBatches = {};
      mavlinkBatchTimer = null;
    }, 100); // 10Hz max
  }
}

// =============================================================================
// PX4 virtual joystick — neutral MANUAL_CONTROL (69) stream
// =============================================================================
// PX4 gates arming and every stick-flown mode (POSCTL/ALTCTL/...) on having a
// manual control source; without one it spams "PreArm: No manual control
// input", auto-disarms after arming, and refuses mode switches. QGC solves
// this with a virtual joystick; we do the same for SITL: neutral sticks at
// 10Hz (z=0 is center-throttle in PX4's [-1000,1000] mapping = hold). Only on
// loopback links — a real vehicle keeps its real RC (COM_RC_IN_MODE default
// "keep first" would ignore us anyway, but don't even offer it).
const MANUAL_CONTROL_ID = 69;
const MANUAL_CONTROL_CRC_EXTRA = 243;
let px4ManualControlTimer: ReturnType<typeof setInterval> | null = null;

function px4LinkIsLoopback(): boolean {
  const o = lastConnectOptions;
  if (!o || o.type === 'serial') return false;
  const h = o.host ?? o.udpRemoteHost;
  return !h || h === '127.0.0.1' || h === 'localhost';
}

function startPx4ManualControlStream(): void {
  if (px4ManualControlTimer) return;
  if (connectionState.firmware !== 'px4' || !px4LinkIsLoopback()) return;
  const mw = getMainWindow();
  if (mw) sendLog(mw, 'info', 'PX4 SITL: streaming neutral virtual-joystick input (MANUAL_CONTROL)');
  px4ManualControlTimer = setInterval(() => {
    void (async () => {
      try {
        if (!currentTransport?.isOpen || connectionState.firmware !== 'px4') return;
        const payload = new Uint8Array(11);
        const dv = new DataView(payload.buffer);
        dv.setInt16(0, 0, true);  // x — pitch centered
        dv.setInt16(2, 0, true);  // y — roll centered
        dv.setInt16(4, 0, true);  // z — throttle centered (hold)
        dv.setInt16(6, 0, true);  // r — yaw centered
        dv.setUint16(8, 0, true); // buttons
        payload[10] = connectionState.systemId ?? 1;
        const pkt = await sendMavlinkPacket(MANUAL_CONTROL_ID, payload, MANUAL_CONTROL_CRC_EXTRA);
        await currentTransport.write(pkt);
      } catch { /* transport churn mid-send is fine */ }
    })();
  }, 100);
}

function stopPx4ManualControlStream(): void {
  if (px4ManualControlTimer) {
    clearInterval(px4ManualControlTimer);
    px4ManualControlTimer = null;
  }
}

// PX4 motor test (MAV_CMD_ACTUATOR_TEST) re-send timers. PX4 caps a single
// test command at 3 s (Commander::handleCommandActuatorTest clamps timeout_ms
// to 3000), so longer durations are covered by chained re-sends.
let px4MotorTestTimers: NodeJS.Timeout[] = [];

function clearPx4MotorTestTimers(): void {
  for (const t of px4MotorTestTimers) clearTimeout(t);
  px4MotorTestTimers = [];
}

/**
 * BSOD FIX: Clean up all transport event listeners
 * Must be called BEFORE closing transport to prevent orphaned handlers
 */
function cleanupTransportListeners(): void {
  if (currentTransport) {
    if (mavlinkDataHandler) {
      currentTransport.off('data', mavlinkDataHandler as (...args: unknown[]) => void);
    }
    if (transportErrorHandler) {
      currentTransport.off('error', transportErrorHandler as (...args: unknown[]) => void);
    }
    if (transportCloseHandler) {
      currentTransport.off('close', transportCloseHandler as (...args: unknown[]) => void);
    }
  }
  mavlinkDataHandler = null;
  transportErrorHandler = null;
  transportCloseHandler = null;
  processingMavlink = false;
  pendingMavlinkData.length = 0;
  // Multi-vehicle shadow: tear down the registry mirror alongside the legacy
  // listeners. Every teardown path funnels through here, so this is the single
  // place the primary session is unregistered.
  clearPrimarySession();
}

/** Config used for the most recent primary session, reused on auto-reconnect. */
let lastPrimaryConfig: TransportConfig | null = null;

/**
 * Multi-vehicle shadow: register the current legacy transport + parser into the
 * ConnectionRegistry as the primary session. Called once the connection is
 * confirmed to be MAVLink (past MSP detection). Re-registers cleanly if a stale
 * primary id is still around. Pass `config` on a fresh connect; omit it on
 * auto-reconnect to reuse the original connection's config.
 */
function registerPrimarySession(config?: TransportConfig): void {
  if (config) lastPrimaryConfig = config;
  const cfg = config ?? lastPrimaryConfig;
  if (!cfg) return;
  // Drop any stale primary session FIRST, notifying the renderer (VEHICLE_LOST)
  // so it reaps the old vehicle. A bare unregister() here would leave the
  // renderer's knownVehicles holding the previous transport-scoped key; the
  // reconnect then registers a fresh transport (new UUID -> new key) and the old
  // entry lingers as a dead "clone" - one per SITL stop/start cycle, presenting a
  // single SITL as a phantom swarm. clearPrimarySession() no-ops if none is set.
  clearPrimarySession();
  if (currentTransport && mavlinkParser) {
    primaryTransportId = connectionRegistry.register(currentTransport, mavlinkParser, cfg);
  }
}

/** Multi-vehicle shadow: drop the primary session from the registry, if any. */
function clearPrimarySession(): void {
  if (!primaryTransportId) return;
  // Notify the renderer of every vehicle going away before we drop the entry.
  const transport = connectionRegistry.getTransport(primaryTransportId);
  const win = getMainWindow();
  if (transport && win) {
    for (const vehicle of transport.vehicles.values()) {
      safeSend(win, IPC_CHANNELS.COMMS_VEHICLE_LOST, vehicle.key);
    }
  }
  connectionRegistry.unregister(primaryTransportId);
  primaryTransportId = null;
}

/** Human-readable label for a transport, for the fleet/connection UI. */
function transportLabel(config: TransportConfig): string {
  switch (config.type) {
    case 'serial':
      return config.port ? `${config.port} @ ${config.baudRate ?? 115200}` : 'Serial';
    case 'tcp':
      return `TCP ${config.host ?? ''}:${config.tcpPort ?? ''}`;
    case 'udp':
      return config.udpMode === 'client'
        ? `UDP client ${config.udpRemoteHost ?? ''}:${config.udpRemotePort ?? ''}`
        : `UDP :${config.udpPort ?? 14550}`;
    default:
      return 'Link';
  }
}

/** Project a registry transport entry to its serializable IPC shape. */
function toTransportInfoIpc(t: TransportEntry): TransportInfoIpc {
  return {
    id: t.id,
    kind: t.config.type,
    label: transportLabel(t.config),
    packetsRx: t.stats.packetsRx,
    packetsTx: t.stats.packetsTx,
    lastPacketAt: t.stats.lastPacketAt,
    lastError: t.stats.lastError,
    vehicleCount: t.vehicles.size,
    isPrimary: t.id === primaryTransportId,
  };
}

/** Project a registry vehicle entry to its serializable IPC shape. */
function toVehicleInfoIpc(v: VehicleEntry): VehicleInfoIpc {
  return {
    key: v.key,
    transportId: v.transportId,
    sysid: v.sysid,
    compid: v.compid,
    mavType: v.mavType,
    boardId: v.boardId,
    boardUid: v.boardUid,
    lastHeartbeatAt: v.lastHeartbeatAt,
    isActive: connectionRegistry.getActiveVehicleKey() === v.key,
  };
}

/**
 * Resolve a vehicleKey to the transport and MAVLink addressing needed to send
 * to it. Falls back to the active/primary connection when the key is null or
 * unknown, so legacy single-vehicle callers keep targeting the primary vehicle.
 */
function resolveVehicleTarget(
  vehicleKey: string | null,
): { transport: Transport; sysid: number; compid: number } | null {
  if (vehicleKey) {
    const vehicle = connectionRegistry.getVehicleByKey(vehicleKey);
    if (vehicle) {
      const entry = connectionRegistry.getTransport(vehicle.transportId);
      if (entry?.transport.isOpen) {
        return { transport: entry.transport, sysid: vehicle.sysid, compid: vehicle.compid };
      }
    }
  }
  if (currentTransport?.isOpen && connectionState.isConnected) {
    return { transport: currentTransport, sysid: connectionState.systemId ?? 1, compid: 1 };
  }
  // Fleet safety net: no active key pinned and no primary connection (pure fleet
  // mode). Fall back to the first registered vehicle on an open transport so map
  // commands still reach a real vehicle rather than silently no-op'ing.
  for (const v of connectionRegistry.listVehicles()) {
    const entry = connectionRegistry.getTransport(v.transportId);
    if (entry?.transport.isOpen) {
      return { transport: entry.transport, sysid: v.sysid, compid: v.compid };
    }
  }
  return null;
}

/**
 * Transport + sysid for the operator's currently-selected fleet vehicle, falling
 * back to the primary connection when nothing distinct is selected. Flight-control
 * commands (arm / mode / takeoff) target this so clicking a vehicle in the fleet
 * list switches control to it, not just the telemetry view. In the single-vehicle
 * case the active key is the primary vehicle, so behavior is unchanged.
 */
function activeFlightTarget(): { transport: Transport; sysid: number } | null {
  const resolved = resolveVehicleTarget(connectionRegistry.getActiveVehicleKey());
  return resolved ? { transport: resolved.transport, sysid: resolved.sysid } : null;
}

/** Send a COMMAND_LONG to a specific vehicle (or the active vehicle if null). */
async function sendCommandLongToVehicle(
  vehicleKey: string | null,
  command: number,
  params: Partial<Record<'param1' | 'param2' | 'param3' | 'param4' | 'param5' | 'param6' | 'param7', number>>,
): Promise<boolean> {
  const target = resolveVehicleTarget(vehicleKey);
  if (!target) {
    const mw = getMainWindow();
    if (mw) sendLog(mw, 'warn', `Vehicle command ${command}: no target vehicle`);
    return false;
  }
  const payload = serializeCommandLong({
    targetSystem: target.sysid,
    targetComponent: 1,
    command,
    confirmation: 0,
    param1: params.param1 ?? 0,
    param2: params.param2 ?? 0,
    param3: params.param3 ?? 0,
    param4: params.param4 ?? 0,
    param5: params.param5 ?? 0,
    param6: params.param6 ?? 0,
    param7: params.param7 ?? 0,
  });
  const packet = await sendMavlinkPacket(COMMAND_LONG_ID, payload, COMMAND_LONG_CRC_EXTRA, { link: target.transport });
  await target.transport.write(packet);
  connectionState.packetsSent++;
  return true;
}

/**
 * Ask the vehicle for its component metadata URI, then walk the component
 * information chain to pull its own parameter and event definitions.
 *
 * PX4 only, once per link, entirely best-effort: a vehicle that does not
 * implement the service simply times out and the bundled metadata stays in
 * place. Requests COMPONENT_METADATA (397) first and falls back to the
 * deprecated COMPONENT_INFORMATION (395) for older firmware.
 */
async function refreshPx4ComponentMetadata(mainWindow: BrowserWindow): Promise<void> {
  if (px4ComponentInfoStarted || connectionState.firmware !== 'px4') return;
  px4ComponentInfoStarted = true;

  const targetSys = connectionState.systemId ?? 1;
  const targetComp = 1;

  const requestUri = async (msgid: number): Promise<string | null> => {
    const uri = new Promise<string | null>((resolve) => {
      pendingComponentMetadata = resolve;
      setTimeout(() => {
        if (pendingComponentMetadata === resolve) {
          pendingComponentMetadata = null;
          resolve(null);
        }
      }, 5000);
    });
    await sendCommandLongToVehicle(null, 512 /* MAV_CMD_REQUEST_MESSAGE */, { param1: msgid });
    return uri;
  };

  try {
    const generalUri = (await requestUri(MSG_COMPONENT_METADATA))
      ?? (await requestUri(MSG_COMPONENT_INFORMATION));
    if (!generalUri) {
      sendLog(mainWindow, 'debug', 'PX4 component info: vehicle did not report a metadata URI');
      return;
    }

    // MAVLink FTP has one response route (the module-level ftpClient), so wait
    // for the parameter download to release it rather than corrupting both.
    for (let waited = 0; ftpClient && waited < 60_000; waited += 500) {
      await new Promise((r) => setTimeout(r, 500));
    }
    if (ftpClient) {
      sendLog(mainWindow, 'warn', 'PX4 component info: FTP still busy, skipping metadata fetch');
      return;
    }

    const client = new MavlinkFtpClient({
      sendPacket: async (ftpPayload: Uint8Array) => {
        const ftpMsg = serializeFileTransferProtocol({
          targetNetwork: 0,
          targetSystem: targetSys,
          targetComponent: targetComp,
          payload: Array.from(ftpPayload),
        });
        const packet = await sendMavlinkPacket(FILE_TRANSFER_PROTOCOL_ID, ftpMsg, FILE_TRANSFER_PROTOCOL_CRC_EXTRA);
        await currentTransport!.write(packet);
        connectionState.packetsSent++;
      },
      log: (level, message) => sendLog(mainWindow, level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'debug', message),
    });
    ftpClient = client;

    try {
      const result = await fetchPx4ComponentMetadata(
        { type: COMP_METADATA_TYPE.GENERAL, uri: generalUri },
        {
          downloadFile: (ftpPath) => client.downloadFile(ftpPath),
          log: (level, message) => sendLog(mainWindow, level === 'debug' ? 'debug' : level, message),
          cacheDir: join(app.getPath('userData'), 'px4-component-metadata-cache'),
        },
      );

      if (result.events) setPx4EventMetadata(result.events);
      if (result.parameters) {
        // Vehicle definitions win over the bundled file, but keep the bundled
        // entries for anything the vehicle did not describe.
        px4VehicleParamMetadata = { ...getPx4ParameterMetadata(), ...result.parameters };
        metadataCache.set('px4', px4VehicleParamMetadata);
        safeSend(mainWindow, IPC_CHANNELS.PARAM_METADATA_RESULT, { metadata: px4VehicleParamMetadata });
      }
    } finally {
      await client.cleanup().catch(() => {});
      if (ftpClient === client) ftpClient = null;
    }
  } catch (err) {
    sendLog(mainWindow, 'warn', `PX4 component info: ${(err as Error).message}`);
  }
}

/**
 * Build a Transport for a background (non-primary) connection. Pure factory:
 * does not open, attach listeners, or touch module state. Kept separate from
 * the primary COMMS_CONNECT switch so that path stays bit-for-bit unchanged.
 */
function buildBackgroundTransport(options: ConnectOptions): Transport {
  switch (options.type) {
    case 'serial':
      if (!options.port) throw new Error('Port required for serial connection');
      return new SerialTransport(options.port, { baudRate: options.baudRate ?? 115200 });
    case 'tcp':
      if (!options.host || !options.tcpPort) throw new Error('Host and port required for TCP');
      return new TcpTransport({ host: options.host, port: options.tcpPort });
    case 'udp':
      if (options.udpMode === 'client') {
        if (!options.udpRemoteHost || !options.udpRemotePort) {
          throw new Error('Remote host and port required for UDP client mode');
        }
        return new UdpTransport({
          localPort: options.udpClientLocalPort ?? 14550,
          remoteHost: options.udpRemoteHost,
          remotePort: options.udpRemotePort,
        });
      }
      return new UdpTransport({ localPort: options.udpPort ?? 14550 });
    default:
      throw new Error(`Invalid connection type: ${options.type ?? 'undefined'}. Must be 'serial', 'tcp', or 'udp'.`);
  }
}

/**
 * Pure, side-effect-free telemetry decode for NON-primary (background /
 * orchestration) links. Extracts only the fields the fleet view needs from the
 * common telemetry messages. Unlike parseTelemetry it does NOT drive the param /
 * mission / fence state machines or mutate connectionState - those stay bound to
 * the primary connection. Returns null for messages it doesn't decode.
 */
/**
 * MAVLink v2 truncates trailing zero bytes off every payload, so a hovering or
 * stationary vehicle sends e.g. GLOBAL_POSITION_INT as 27 bytes (hdg=0 dropped)
 * and VFR_HUD as 17 (throttle=0). Zero-padding back to the full wire length is
 * the spec-correct inverse. The fleet decode used hard `length < N` guards
 * instead, silently dropping position/VFR for every vehicle that wasn't moving
 * - fleet map/HUD telemetry froze until a command made the fields non-zero.
 */
function padTo(payload: Uint8Array, len: number): Uint8Array {
  if (payload.length >= len) return payload;
  const out = new Uint8Array(len);
  out.set(payload);
  return out;
}

function decodeFleetTelemetry(packet: MAVLinkPacket): Record<string, unknown> | null {
  const { msgid, payload: rawPayload } = packet;
  let payload = rawPayload;
  switch (msgid) {
    case MSG_HEARTBEAT: {
      payload = padTo(payload, 9);
      const customMode = readUint32(payload, 0);
      const vehicleType = payload[4]!;
      const baseMode = payload[6]!;
      const systemStatus = payload[7]!;
      if (!isVehicleHeartbeat(vehicleType, payload[5]!, packet.compid)) return null;
      const armed = (baseMode & 0x80) !== 0 && systemStatus >= 3;
      let modeName = `Mode ${customMode}`;
      // PX4 encodes the mode as a main/sub bitfield, keyed by autopilot type,
      // not vehicle type (same branch the active-vehicle decode takes).
      if (payload[5] === 12) modeName = getPx4ModeName(customMode);
      else if (vehicleType === 1 || (vehicleType >= 19 && vehicleType <= 25)) modeName = PLANE_MODES[customMode] || modeName;
      else if (vehicleType === 2 || (vehicleType >= 13 && vehicleType <= 15) || vehicleType === 29 || vehicleType === 35) modeName = COPTER_MODES[customMode] || modeName;
      else if (vehicleType === 10 || vehicleType === 11) modeName = ROVER_MODES[customMode] || modeName;
      else if (vehicleType === 12) modeName = SUB_MODES[customMode] || modeName;
      const flight: FlightState = { mode: modeName, modeNum: customMode, armed, isFlying: armed && (baseMode & 0x04) !== 0 };
      return { flight };
    }
    case MSG_GLOBAL_POSITION_INT: {
      payload = padTo(payload, 28);
      const position: PositionData = {
        lat: readInt32(payload, 4) / 1e7,
        lon: readInt32(payload, 8) / 1e7,
        alt: readInt32(payload, 12) / 1000,
        relativeAlt: readInt32(payload, 16) / 1000,
        vx: readInt16(payload, 20) / 100,
        vy: readInt16(payload, 22) / 100,
        vz: readInt16(payload, 24) / 100,
      };
      return { position };
    }
    case MSG_GPS_RAW_INT: {
      payload = padTo(payload, 30);
      const gps: GpsData = {
        fixType: payload[28]!,
        satellites: payload[29]!,
        hdop: readUint16(payload, 20) / 100,
        vdop: readUint16(payload, 22) / 100,
        lat: readInt32(payload, 8) / 1e7,
        lon: readInt32(payload, 12) / 1e7,
        alt: readInt32(payload, 16) / 1000,
      };
      return { gps };
    }
    case MSG_SYS_STATUS: {
      payload = padTo(payload, 31);
      const battery: BatteryData = {
        voltage: readUint16(payload, 14) / 1000,
        current: readInt16(payload, 16) / 100,
        remaining: payload[30] === 255 ? -1 : payload[30]!,
      };
      return { battery };
    }
    case MSG_VFR_HUD: {
      payload = padTo(payload, 20);
      const vfrHud: VfrHudData = {
        airspeed: readFloat(payload, 0),
        groundspeed: readFloat(payload, 4),
        heading: readInt16(payload, 16),
        throttle: readUint16(payload, 18),
        alt: readFloat(payload, 8),
        climb: readFloat(payload, 12),
      };
      return { vfrHud };
    }
    case MSG_ATTITUDE: {
      payload = padTo(payload, 28);
      const r2d = 180 / Math.PI;
      const attitude: AttitudeData = {
        roll: readFloat(payload, 4) * r2d,
        pitch: readFloat(payload, 8) * r2d,
        yaw: readFloat(payload, 12) * r2d,
        rollSpeed: readFloat(payload, 16) * r2d,
        pitchSpeed: readFloat(payload, 20) * r2d,
        yawSpeed: readFloat(payload, 24) * r2d,
      };
      return { attitude };
    }
    default:
      return null;
  }
}

/**
 * MAVLink data handler for a background transport (extra link or orchestration
 * server). Records heartbeats for vehicle discovery AND routes full per-vehicle
 * telemetry (position / attitude / battery / mode) so the fleet renders these
 * vehicles live, keyed by their own (transport, sysid, compid). It stays clear
 * of the primary's connectionState and param / mission state machines - those
 * remain bound to the primary link. Telemetry is batched at 10Hz per vehicle.
 */
function createBackgroundDiscoveryHandler(
  transportId: TransportId,
  mainWindow: BrowserWindow,
): (data: Uint8Array) => Promise<void> {
  const queue: Uint8Array[] = [];
  let processing = false;
  const telBatches = new Map<string, Record<string, unknown>>();
  let flushTimer: NodeJS.Timeout | null = null;

  const scheduleFlush = () => {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      for (const [vehicleKey, fields] of telBatches) {
        safeSend(mainWindow, IPC_CHANNELS.TELEMETRY_BATCH, { ...fields, __vehicleKey: vehicleKey });
      }
      telBatches.clear();
    }, 100);
  };

  return async (data: Uint8Array) => {
    queue.push(data);
    if (processing) return;
    processing = true;
    try {
      while (queue.length > 0) {
        const entry = connectionRegistry.getTransport(transportId);
        if (!entry) return;
        const chunk = queue.shift()!;
        for await (const packet of entry.parser.parse(chunk)) {
          connectionRegistry.recordPacketRx(transportId);
          // In pure fleet mode there is no primary connection to detect the wire
          // version from, so adopt it from the fleet link (the orchestrator emits
          // v2). Keeps mission/fence uploads to fleet vehicles on MISSION_ITEM_INT
          // (full 1e7 precision) rather than the low-precision v1 default. Never
          // clobber a live primary connection's own detection.
          if (!connectionState.isConnected) {
            detectedMavlinkVersion = packet.isMavlink2 ? 2 : 1;
          }
          if (packet.msgid === 0 && packet.payload.length >= 8) {
            const vehicleType = packet.payload[4]!;
            if (!isVehicleHeartbeat(vehicleType, packet.payload[5]!, packet.compid)) continue;
            const result = connectionRegistry.recordHeartbeat(
              transportId, packet.sysid, packet.compid, vehicleType,
            );
            if (result?.isNew) {
              // Auto-promote the first discovered fleet vehicle to active so the
              // command seam (activeFlightTarget) has a target in pure fleet mode
              // (no primary connection). Without this, map commands / arm / mode
              // silently no-op until the user happens to click a fleet card. The
              // renderer auto-promotes the same first-discovered vehicle, so the
              // two stay in agreement; an explicit click re-syncs both.
              if (connectionRegistry.getActiveVehicleKey() === null) {
                connectionRegistry.setActive(transportId, result.vehicle.key);
              }
              safeSend(mainWindow, IPC_CHANNELS.COMMS_VEHICLE_DISCOVERED, toVehicleInfoIpc(result.vehicle));
              // Background/fleet links are passive: ArduPilot only streams telemetry
              // to a GCS that requests it, so a freshly-discovered vehicle on this
              // transport emits HEARTBEAT-only until we ask. Request its streams now
              // (and once more shortly after, to survive packet loss on radio links).
              const reqStreams = () => {
                const live = connectionRegistry.getTransport(transportId);
                if (live?.transport?.isOpen) {
                  void requestStreamsOnTransport(
                    live.transport, packet.sysid, packet.compid, currentTelemetrySpeed,
                    vehicleType,
                  ).catch(() => {});
                }
              };
              reqStreams();
              setTimeout(reqStreams, 1500);
            }
          }
          const fields = decodeFleetTelemetry(packet);
          if (fields) {
            const vehicleKey = makeVehicleKey(transportId, packet.sysid, packet.compid);
            const batch = telBatches.get(vehicleKey) ?? {};
            Object.assign(batch, fields);
            telBatches.set(vehicleKey, batch);
            scheduleFlush();
          }

          // Operator feedback that previously existed only on the PRIMARY
          // connection path (handleMavlinkPacket): STATUSTEXT (arm-refusal
          // reasons, prearm failures) and COMMAND_ACK results. Fleet vehicles
          // live on background/orchestration transports, so in fleet mode a
          // refused arm or takeoff produced no reason and no response at all -
          // the Messages panel stayed silent. Tag with the source SYS id since
          // many vehicles share this panel.
          if (packet.msgid === MSG_STATUSTEXT && packet.payload.length >= 51) {
            const severity = packet.payload[0]!;
            const text = new TextDecoder().decode(packet.payload.slice(1, 51)).replace(/\0.*$/, '');
            if (text) {
              const severityLabel = SEVERITY_LABELS[severity] ?? 'INFO';
              safeSend(mainWindow, IPC_CHANNELS.MAVLINK_STATUSTEXT, {
                severity, severityLabel, text: `SYS ${packet.sysid}: ${text}`,
              });
            }
          } else if (packet.msgid === MSG_TERRAIN_REPORT) {
            // Same decode as the primary path: gates terrain-relative commands
            // per fleet vehicle. Zero-pad, never length-guard (v2 truncation).
            const p = padTo(packet.payload, 22);
            safeSend(mainWindow, IPC_CHANNELS.MAVLINK_TERRAIN_STATUS, {
              sysid: packet.sysid,
              spacing: readUint16(p, 16),
              pending: readUint16(p, 18),
              loaded: readUint16(p, 20),
            });
          } else if (packet.msgid === MSG_COMMAND_ACK && packet.payload.length >= 3) {
            const ackCommand = readUint16(packet.payload, 0);
            const ackResult = packet.payload[2] ?? 0;
            const FEEDBACK_CMDS: Record<number, string> = {
              400: 'ARM/DISARM', 22: 'Takeoff', 192: 'GO_TO', 176: 'Mode change', 34: 'ORBIT',
            };
            const label = FEEDBACK_CMDS[ackCommand];
            // Mode-change ACCEPTED is routine noise; every other tracked result
            // (accepts and refusals) is operator-relevant.
            if (label && !(ackCommand === 176 && ackResult === 0)) {
              const MAV_RESULT_NAMES = ['ACCEPTED', 'TEMPORARILY_REJECTED', 'DENIED', 'UNSUPPORTED', 'FAILED', 'IN_PROGRESS'];
              const severity = ackResult === 0 ? 6 : 4;
              // Terrain-frame goto refused: the generic FAILED gives the operator
              // nothing to act on, but this cause has a one-click remedy.
              const terrainHint = ackCommand === 192 && ackResult === 4
                && lastGotoFrameBySysid.get(packet.sysid) === 11
                ? ' (terrain-relative sent, vehicle has no terrain data. Switch "Above" to Home in the fly popup)'
                : '';
              safeSend(mainWindow, IPC_CHANNELS.MAVLINK_STATUSTEXT, {
                severity,
                severityLabel: SEVERITY_LABELS[severity] ?? 'INFO',
                text: `SYS ${packet.sysid}: ${label} ${MAV_RESULT_NAMES[ackResult] ?? `UNKNOWN(${ackResult})`}${terrainHint}`,
              });
            }
            if ((ackCommand === 192 || ackCommand === 34 || ackCommand === 21)
              && ackResult !== 0 && ackResult !== 5) {
              safeSend(mainWindow, IPC_CHANNELS.MAVLINK_COMMAND_REJECTED, {
                command: ackCommand, result: ackResult, sysid: packet.sysid,
                frame: ackCommand === 192 ? lastGotoFrameBySysid.get(packet.sysid) : undefined,
              });
            }
          }

          // Drive a per-vehicle mission upload whose target is on THIS link, so
          // MISSION_UPLOAD_TO_VEHICLE works for background / orchestration links.
          // Match the source sysid too: the orchestrator rewrites each vehicle's
          // north-bound source to its virtual sysid (== target.sysid), so a second
          // vehicle on the same link can't hijack this vehicle's upload handshake.
          if (
            missionUploadState?.target &&
            entry.transport === missionUploadState.target.transport &&
            packet.sysid === missionUploadState.target.sysid
          ) {
            if (packet.msgid === MSG_MISSION_REQUEST || packet.msgid === MSG_MISSION_REQUEST_INT) {
              handleMissionRequestForUpload(mainWindow, packet);
            } else if (packet.msgid === MSG_MISSION_ACK) {
              handleMissionAckForUpload(mainWindow, packet);
            }
          }

          // Drive a per-vehicle mission DOWNLOAD whose target is on THIS link
          // (same source-sysid match), so MISSION_DOWNLOAD reads back the selected
          // fleet vehicle's mission over a background / orchestration link.
          if (
            missionDownloadState?.target &&
            entry.transport === missionDownloadState.target.transport &&
            packet.sysid === missionDownloadState.target.sysid
          ) {
            if (packet.msgid === MSG_MISSION_COUNT) {
              handleMissionCountForDownload(mainWindow, packet.payload);
            } else if (packet.msgid === MSG_MISSION_ITEM || packet.msgid === MSG_MISSION_ITEM_INT) {
              handleMissionItemForDownload(mainWindow, packet.msgid, packet.payload);
            }
          }
        }
      }
    } finally {
      processing = false;
    }
  };
}

// Auto-reconnect state for expected reboots (EEPROM save, CLI save, etc.) and for
// unexpected drops (signal loss, power cycle, cable unplug) when `auto` is set.
let pendingReconnect: {
  reason: string;
  portPath?: string; // For serial
  host?: string; // For TCP
  tcpPort?: number;
  protocol: 'msp' | 'mavlink';
  baudRate?: number;
  startTime: number;
  attempt: number;
  maxAttempts: number;
  timeoutMs: number;
  /** Full original connect options - drives generic (serial/tcp/udp) auto-reconnect. */
  options?: ConnectOptions;
  /** True for unexpected-drop recovery: exponential backoff, effectively unbounded. */
  auto?: boolean;
} | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
/** The last options we successfully connected with, so an unexpected drop can re-dial the
 * exact same link without any user action. Cleared on a user-initiated disconnect. */
let lastConnectOptions: ConnectOptions | null = null;
/** USB identity of the connected serial port, so reconnect can find the device even if it
 * re-enumerates to a different path (e.g. /dev/ttyUSB0 -> ttyUSB1, COM4 -> COM5). */
let lastSerialUsbId: { vendorId?: string; productId?: string; serialNumber?: string } | null = null;
/** Set while a user-initiated disconnect is tearing down, so the transport `close` handler
 * doesn't mistake it for a drop and auto-reconnect. */
let suppressAutoReconnect = false;

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
let paramDownloadActive = false; // True only during bulk PARAM_REQUEST_LIST download
let paramDownloadStartTime = 0; // Timestamp for measuring download duration
// Indices seen during the bulk download, so a stalled stream can re-request
// exactly the params that were dropped (SiK links lose PARAM_VALUEs routinely).
let receivedParamIndices = new Set<number>();
let paramListRetries = 0; // Re-sends of PARAM_REQUEST_LIST when nothing arrived at all
let paramStalledRounds = 0; // Consecutive stall recoveries that yielded zero new params
let paramProgressAtLastStall = 0;
let paramInactivityMs = 10000; // Computed per-link at download start
// Gap-fill rounds are targeted reads, so they wait on a short round-trip budget
// rather than the long "is the FC still streaming?" inactivity window.
let paramGapFillMode = false;
let paramGapRoundMs = 3000;
let paramGapChunk = 30;
let paramGapCursor = 0; // Rotates so an index the FC never returns can't starve the rest
let paramGapSendGapMs = 0;
let paramRecoveryInFlight = false;
/** Indices requested in the current gap-fill round and still outstanding. */
const paramRoundPending = new Set<number>();
const PARAM_LIST_MAX_RETRIES = 3;
const PARAM_MAX_STALLED_ROUNDS = 10;

// Resolve the MAV_PARAM_TYPE to put on the wire for a PARAM_SET.
// ArduPilot stores all params as float32 over MAVLink and expects REAL32 (9)
// for every PARAM_SET regardless of the param's native type, so we always
// force REAL32 there. PX4 is strict: it rejects/misinterprets a PARAM_SET whose
// param_type does not match the param's real type, so for PX4 we send the
// actual per-param type (originating from the FC-reported PARAM_VALUE type).
function resolveParamSetType(requestedType: number): number {
  return connectionState.firmware === 'px4' ? requestedType : 9; // 9 = MAV_PARAM_TYPE_REAL32
}

/**
 * Parameters as main sees them. This is the authoritative copy: it is filled by
 * both the FTP bulk path and the streamed one, and it exists whatever the
 * renderer is showing. Anything that just wants to READ parameters should come
 * here rather than through a Zustand store that a view has to be mounted for.
 */
export function getVehicleParameters(): {
  complete: boolean;
  expected: number;
  params: Array<{ id: string; value: number; type: number; index: number }>;
} {
  return {
    complete: expectedParamCount > 0 && receivedParams.size >= expectedParamCount,
    expected: expectedParamCount,
    params: [...receivedParams.values()].map((p) => ({
      id: p.paramId,
      value: p.paramValue,
      type: p.paramType,
      index: p.paramIndex,
    })),
  };
}

/** Set once IPC handlers are registered; starts a download from main. */
let requestAllParametersFromMain:
  | (() => Promise<{ success: boolean; error?: string }>)
  | null = null;

export function requestVehicleParameters(): Promise<{ success: boolean; error?: string }> {
  if (!requestAllParametersFromMain) {
    return Promise.resolve({ success: false, error: 'IPC handlers not registered yet' });
  }
  return requestAllParametersFromMain();
}

/** True while a bulk download is running, so callers can wait rather than restart it. */
export function isParameterDownloadActive(): boolean {
  return paramDownloadActive || paramRequestInFlight;
}

// MAVLink FTP client for fast parameter download
let ftpClient: MavlinkFtpClient | null = null;
let paramRequestInFlight = false; // Guard against concurrent param download requests
let logDownloadManager: LogDownloadManager | null = null;

// In-flight one-shot PARAM_REQUEST_READ callbacks keyed by paramId. The
// MSG_PARAM_VALUE handler invokes the matching callback when the FC's
// response arrives, then deletes it. Used by PARAM_READ_BATCH for
// post-calibration verification reads where we need a fresh value (the
// receivedParams cache might still hold the pre-cal value).
const pendingParamReads = new Map<string, (value: number, type: number) => void>();

// STATUSTEXT chunk reassembly buffer (for multi-chunk messages >50 chars)
const statustextChunkBuffer = new Map<number, { severity: number; chunks: string[]; timer: NodeJS.Timeout | null }>();

// MAVLink diagnostic cache for bug reports
let cachedSysStatus: BoardDumpMavlink['sys_status'] | null = null;
let cachedHeartbeat: BoardDumpMavlink['heartbeat'] | null = null;
/** Last decoded flight-mode name from the primary heartbeat, for command logs. */
let lastFlightModeName = 'Unknown';
// Frame of the last DO_REPOSITION sent to each sysid: a bare FAILED ack can't
// say WHY, but if we sent terrain-frame to a vehicle without terrain data the
// cause is near-certain, so the refusal message can name it and the remedy.
const lastGotoFrameBySysid = new Map<number, number>();
// Last GPS_RAW_INT from the active vehicle, consumed by the NTRIP client's
// GGA position uploads (issue #60). Timestamped so a dead link goes stale.
let lastGpsRawForNtrip: { gps: GpsData; atMs: number } | null = null;
let cachedAutopilotVersion: BoardDumpMavlink['autopilot_version'] | null = null;
let statustextHistory: Array<{ ts: number; severity: number; severityLabel: string; text: string }> = [];
const MAX_STATUSTEXT_HISTORY = 150;

function resetMavlinkDiagCache(): void {
  cachedSysStatus = null;
  cachedHeartbeat = null;
  cachedAutopilotVersion = null;
  statustextHistory = [];
  lastReportedArmed = null;
  resetRcChannelState();
}

// Parameter metadata cache (keyed by vehicle type, or 'px4' for bundled PX4 metadata)
const metadataCache = new Map<VehicleType | 'px4', ParameterMetadataStore>();

// Mission download state
let missionDownloadState: {
  expected: number;
  received: Map<number, MissionItem>;
  timeout: NodeJS.Timeout | null;
  // Per-vehicle override (multi-vehicle / fleet): when set, the download targets
  // this transport+sysid instead of the legacy primary, and its MISSION_COUNT /
  // MISSION_ITEM responses are routed in from the background-link handler.
  target?: { transport: Transport; sysid: number };
} | null = null;

// Mission upload state
let missionUploadState: {
  items: MissionItem[];
  currentSeq: number;
  timeout: NodeJS.Timeout | null;
  // Per-vehicle override: when set, the upload targets this transport+sysid
  // instead of the legacy primary, and completion is reported via onComplete
  // instead of the legacy MISSION_UPLOAD_COMPLETE / MISSION_ERROR events.
  target?: { transport: Transport; sysid: number };
  onComplete?: (ok: boolean, error?: string) => void;
} | null = null;

/**
 * Terminal-state helper for an in-flight mission upload. Centralizes timer
 * cleanup and routes completion: a per-vehicle upload resolves its onComplete
 * callback; a legacy single-vehicle upload emits the original IPC events so the
 * existing mission view is unchanged.
 */
function settleMissionUpload(mainWindow: BrowserWindow, ok: boolean, error?: string): void {
  const state = missionUploadState;
  if (!state) return;
  if (state.timeout) clearTimeout(state.timeout);
  missionUploadState = null;
  if (state.onComplete) {
    state.onComplete(ok, error);
    return;
  }
  if (ok) {
    sendLog(mainWindow, 'info', `Mission upload complete: ${state.items.length} items`);
    safeSend(mainWindow, IPC_CHANNELS.MISSION_UPLOAD_COMPLETE, state.items.length);
  } else {
    safeSend(mainWindow, IPC_CHANNELS.MISSION_ERROR, error ?? 'Mission upload failed');
  }
}

/**
 * Handle an incoming MISSION_REQUEST / MISSION_REQUEST_INT against the active
 * upload (singleton missionUploadState). Sends the requested item to the upload
 * target. Shared by the primary data handler and the background-link handler so
 * a per-vehicle upload works regardless of which link the FC's request arrives
 * on. No-op when no upload is in progress.
 */
function handleMissionRequestForUpload(mainWindow: BrowserWindow, packet: MAVLinkPacket): void {
  const { msgid, payload } = packet;
  if (!missionUploadState) return;
  try {
    // Some FCs use v2 byte order (size-sorted) even in v1 packets.
    // v1: target_system(1), target_component(1), seq(2) - seq at offset 2.
    // v2: seq(2), target_system(1), target_component(1) - seq at offset 0.
    const seqAtOffset0 = payload[0]! | (payload[1]! << 8);
    const seqAtOffset2 = payload[2]! | (payload[3]! << 8);
    const looksLikeV2Order =
      (payload[2] === 0xff && payload[3] === 0xbe) ||
      (payload[2] === 0xff && payload[3] === 0x01) ||
      seqAtOffset2 > 1000;
    const seq = msgid === MSG_MISSION_REQUEST_INT || looksLikeV2Order ? seqAtOffset0 : seqAtOffset2;

    if (seq < missionUploadState.items.length) {
      sendMissionItem(mainWindow, missionUploadState.items[seq]!);
      missionUploadState.currentSeq = seq;
      const progress: MissionProgress = {
        total: missionUploadState.items.length,
        transferred: seq + 1,
        operation: 'upload',
      };
      safeSend(mainWindow, IPC_CHANNELS.MISSION_PROGRESS, progress);
      if (missionUploadState.timeout) clearTimeout(missionUploadState.timeout);
      missionUploadState.timeout = setTimeout(() => {
        settleMissionUpload(mainWindow, false, 'Upload timeout: FC stopped requesting items');
      }, 5000);
    }
  } catch (err) {
    sendLog(mainWindow, 'error', 'Failed to parse MISSION_REQUEST', String(err));
  }
}

/**
 * Handle an incoming MISSION_ACK for the active upload only (settle it). Used by
 * the background-link handler; the primary handler's MISSION_ACK case has its
 * own richer handling (clear/download). Returns true if it settled an upload.
 */
function handleMissionAckForUpload(mainWindow: BrowserWindow, packet: MAVLinkPacket): boolean {
  if (!missionUploadState) return false;
  const ackType = packet.payload.length >= 3 ? packet.payload[2]! : 0;
  if (ackType === MAV_MISSION_RESULT.ACCEPTED) {
    settleMissionUpload(mainWindow, true);
  } else {
    settleMissionUpload(mainWindow, false, `Mission error: ${getMissionResultName(ackType)}`);
  }
  return true;
}

/**
 * Parse a (non-fence) MISSION_COUNT against the active mission DOWNLOAD and kick
 * off item requests. Shared by the primary data handler and the background-link
 * handler so a per-vehicle download works whichever link the FC replies on. The
 * caller has already excluded the fence case. No-op when no download is active.
 */
function handleMissionCountForDownload(mainWindow: BrowserWindow, payload: Uint8Array): void {
  if (!missionDownloadState) {
    sendLog(mainWindow, 'debug', `Received MISSION_COUNT but no download in progress`);
    return;
  }
  try {
    // MISSION_COUNT byte order (some FCs use v2 size-sorted order even in v1):
    // v1: target_system(1), target_component(1), count(2) - count at offset 2
    // v2: count(2), target_system(1), target_component(1), [mission_type(1)] - count at offset 0
    const countAtOffset0 = payload[0]! | (payload[1]! << 8);
    const countAtOffset2 = payload[2]! | (payload[3]! << 8);
    const looksLikeV2Order = (payload[2] === 0xFF && payload[3] === 0xBE) ||
                             (payload[2] === 0xFF && payload[3] === 0x01) ||
                             countAtOffset2 > 1000;
    const count = (payload.length >= 5 || looksLikeV2Order) ? countAtOffset0 : countAtOffset2;
    missionDownloadState.expected = count;
    sendLog(mainWindow, 'debug', `Mission has ${count} items (payload len: ${payload.length})`);

    if (count === 0) {
      safeSend(mainWindow, IPC_CHANNELS.MISSION_COMPLETE, []);
      missionDownloadState = null;
    } else {
      requestMissionItem(mainWindow, 0);
    }
  } catch (err) {
    sendLog(mainWindow, 'error', 'Failed to parse MISSION_COUNT', String(err));
  }
}

/**
 * Parse a (non-fence) MISSION_ITEM / MISSION_ITEM_INT against the active mission
 * DOWNLOAD: store the item, report progress, request the next, and complete + ACK
 * when all are in. Shared by the primary and background-link handlers. The caller
 * has already excluded the fence case. No-op when no download is active.
 */
function handleMissionItemForDownload(mainWindow: BrowserWindow, msgid: number, payload: Uint8Array): void {
  if (!missionDownloadState) return;
  try {
    let item: MissionItem;
    if (msgid === MSG_MISSION_ITEM_INT) {
      const msg = deserializeMissionItemInt(payload);
      item = {
        seq: msg.seq, frame: msg.frame as MavFrame, command: msg.command,
        current: msg.current === 1, autocontinue: msg.autocontinue === 1,
        param1: msg.param1, param2: msg.param2, param3: msg.param3, param4: msg.param4,
        latitude: msg.x / 1e7, longitude: msg.y / 1e7, altitude: msg.z,
      };
    } else {
      const msg = deserializeMissionItem(payload);
      item = {
        seq: msg.seq, frame: msg.frame as MavFrame, command: msg.command,
        current: msg.current === 1, autocontinue: msg.autocontinue === 1,
        param1: msg.param1, param2: msg.param2, param3: msg.param3, param4: msg.param4,
        latitude: msg.x, longitude: msg.y, altitude: msg.z,
      };
    }

    missionDownloadState.received.set(item.seq, item);
    safeSend(mainWindow, IPC_CHANNELS.MISSION_ITEM, item);
    safeSend(mainWindow, IPC_CHANNELS.MISSION_PROGRESS, {
      total: missionDownloadState.expected,
      transferred: missionDownloadState.received.size,
      operation: 'download',
    } satisfies MissionProgress);

    if (missionDownloadState.timeout) clearTimeout(missionDownloadState.timeout);
    missionDownloadState.timeout = setTimeout(() => {
      if (missionDownloadState && missionDownloadState.received.size < missionDownloadState.expected) {
        safeSend(mainWindow, IPC_CHANNELS.MISSION_ERROR,
          `Timeout: received ${missionDownloadState.received.size}/${missionDownloadState.expected} mission items`);
        missionDownloadState = null;
      }
    }, 5000);

    if (missionDownloadState.received.size >= missionDownloadState.expected) {
      sendMissionAck(mainWindow, MAV_MISSION_RESULT.ACCEPTED);
      const items = Array.from(missionDownloadState.received.values()).sort((a, b) => a.seq - b.seq);
      safeSend(mainWindow, IPC_CHANNELS.MISSION_COMPLETE, items);
      sendLog(mainWindow, 'info', `Downloaded ${items.length} mission items`);
      if (missionDownloadState.timeout) clearTimeout(missionDownloadState.timeout);
      missionDownloadState = null;
    } else {
      requestMissionItem(mainWindow, item.seq + 1);
    }
  } catch (err) {
    sendLog(mainWindow, 'error', 'Failed to parse mission item', String(err));
  }
}

// Helper: Send a single fence item to the FC (MISSION_ITEM_INT, mission_type=FENCE).
async function sendFenceItem(mainWindow: BrowserWindow, item: FenceItem): Promise<void> {
  if (!currentTransport?.isOpen || !connectionState.isConnected) return;
  const targetSystem = connectionState.systemId ?? 1;
  let packet: Uint8Array;

  if (detectedMavlinkVersion === 2) {
    const payload = serializeMissionItemInt({
      targetSystem,
      targetComponent: 1,
      seq: item.seq,
      frame: item.frame,
      command: item.command,
      current: 0,
      autocontinue: 1,
      param1: item.param1,
      param2: item.param2,
      param3: item.param3,
      param4: item.param4,
      x: Math.round(item.latitude * 1e7),
      y: Math.round(item.longitude * 1e7),
      z: item.altitude,
      missionType: MAV_MISSION_TYPE.FENCE,
    });
    packet = await sendMavlinkPacket(MISSION_ITEM_INT_ID, payload, MISSION_ITEM_INT_CRC_EXTRA);
  } else {
    // Fence transfer effectively requires MAVLink v2; send v1 ITEM as a best effort.
    const fullPayload = serializeMissionItem({
      targetSystem, targetComponent: 1, seq: item.seq, frame: item.frame, command: item.command,
      current: 0, autocontinue: 1, param1: item.param1, param2: item.param2, param3: item.param3, param4: item.param4,
      x: item.latitude, y: item.longitude, z: item.altitude, missionType: 0,
    });
    packet = serializeV1(MISSION_ITEM_ID, fullPayload.slice(0, 37), MISSION_ITEM_CRC_EXTRA_V1, { sysid: gcsSysid, compid: 190 });
  }

  currentTransport.write(packet).catch((err) => {
    sendLog(mainWindow, 'error', `Failed to send fence item ${item.seq}`, String(err));
  });
}

// Handle a MISSION_REQUEST(_INT) the FC sends while pulling our fence upload.
function handleFenceRequestForUpload(mainWindow: BrowserWindow, packet: MAVLinkPacket): void {
  const { msgid, payload } = packet;
  if (!fenceUploadState) return;
  try {
    const seqAtOffset0 = payload[0]! | (payload[1]! << 8);
    const seqAtOffset2 = payload[2]! | (payload[3]! << 8);
    const looksLikeV2Order =
      (payload[2] === 0xff && payload[3] === 0xbe) ||
      (payload[2] === 0xff && payload[3] === 0x01) ||
      seqAtOffset2 > 1000;
    const seq = msgid === MSG_MISSION_REQUEST_INT || looksLikeV2Order ? seqAtOffset0 : seqAtOffset2;

    if (seq < fenceUploadState.items.length) {
      void sendFenceItem(mainWindow, fenceUploadState.items[seq]!);
      fenceUploadState.currentSeq = seq;
      safeSend(mainWindow, IPC_CHANNELS.FENCE_PROGRESS, {
        total: fenceUploadState.items.length,
        transferred: seq + 1,
        operation: 'upload',
      });
      if (fenceUploadState.timeout) clearTimeout(fenceUploadState.timeout);
      fenceUploadState.timeout = setTimeout(() => {
        safeSend(mainWindow, IPC_CHANNELS.FENCE_ERROR, 'Upload timeout: FC stopped requesting fence items');
        fenceUploadState = null;
      }, 5000);
    }
  } catch (err) {
    sendLog(mainWindow, 'error', 'Failed to parse fence MISSION_REQUEST', String(err));
  }
}

// Handle a fence MISSION_ITEM(_INT) arriving during a fence download.
function handleFenceItemReceived(mainWindow: BrowserWindow, msgid: number, payload: Uint8Array): void {
  if (!fenceDownloadState) return;
  try {
    let item: FenceItem;
    if (msgid === MSG_MISSION_ITEM_INT) {
      const msg = deserializeMissionItemInt(payload);
      item = { seq: msg.seq, command: msg.command, frame: msg.frame, param1: msg.param1, param2: msg.param2, param3: msg.param3, param4: msg.param4, latitude: msg.x / 1e7, longitude: msg.y / 1e7, altitude: msg.z };
    } else {
      const msg = deserializeMissionItem(payload);
      item = { seq: msg.seq, command: msg.command, frame: msg.frame, param1: msg.param1, param2: msg.param2, param3: msg.param3, param4: msg.param4, latitude: msg.x, longitude: msg.y, altitude: msg.z };
    }

    fenceDownloadState.received.set(item.seq, item);
    safeSend(mainWindow, IPC_CHANNELS.FENCE_ITEM, item);
    safeSend(mainWindow, IPC_CHANNELS.FENCE_PROGRESS, {
      total: fenceDownloadState.expected,
      transferred: fenceDownloadState.received.size,
      operation: 'download',
    });

    if (fenceDownloadState.timeout) clearTimeout(fenceDownloadState.timeout);
    fenceDownloadState.timeout = setTimeout(() => {
      if (fenceDownloadState && fenceDownloadState.received.size < fenceDownloadState.expected) {
        safeSend(mainWindow, IPC_CHANNELS.FENCE_ERROR, `Timeout: received ${fenceDownloadState.received.size}/${fenceDownloadState.expected} fence items`);
        fenceDownloadState = null;
      }
    }, 5000);

    if (fenceDownloadState.received.size >= fenceDownloadState.expected) {
      void sendMissionAck(mainWindow, MAV_MISSION_RESULT.ACCEPTED, MAV_MISSION_TYPE.FENCE);
      const items = Array.from(fenceDownloadState.received.values()).sort((a, b) => a.seq - b.seq);
      safeSend(mainWindow, IPC_CHANNELS.FENCE_COMPLETE, items);
      sendLog(mainWindow, 'info', `Downloaded ${items.length} fence items`);
      if (fenceDownloadState.timeout) clearTimeout(fenceDownloadState.timeout);
      fenceDownloadState = null;
    } else {
      void requestMissionItem(mainWindow, item.seq + 1, MAV_MISSION_TYPE.FENCE);
    }
  } catch (err) {
    sendLog(mainWindow, 'error', 'Failed to parse fence item', String(err));
  }
}

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

// Non-vehicle MAV_TYPE values that should be ignored for heartbeat/telemetry
// These are peripheral components (companion computers, cameras, gimbals, etc.)
// that send their own heartbeats but don't represent the actual vehicle
const NON_VEHICLE_TYPES = new Set([
  5,  // Antenna Tracker
  6,  // GCS
  18, // Onboard Companion
  26, // Gimbal
  27, // ADSB
  30, // Camera
  31, // Charging Station
  32, // FLARM
  33, // Servo
  34, // ODID
  36, // Battery
  37, // Parachute
  38, // Log
  39, // OSD
  40, // IMU
  41, // GPS
  42, // Winch
]);

// A heartbeat only identifies a controllable vehicle when its MAV_TYPE is one
// we know, its autopilot field is a real flight stack (radios, gimbals and GCS
// software mark themselves MAV_AUTOPILOT_INVALID), and it doesn't come from
// the telemetry-radio component id that SiK/mLRS/ELRS radios use. Unknown
// MAV_TYPEs are rejected because ghost heartbeats from stream misalignment
// carry arbitrary type bytes (seen live: a phantom "type 193" vehicle from an
// ELRS link that hijacked the primary connection and the fleet list).
const MAV_AUTOPILOT_INVALID = 8;
const MAV_COMP_ID_TELEMETRY_RADIO = 68;
function isVehicleHeartbeat(vehicleType: number, autopilot: number, compid: number): boolean {
  return (
    !NON_VEHICLE_TYPES.has(vehicleType) &&
    VEHICLE_NAMES[vehicleType] !== undefined &&
    autopilot !== MAV_AUTOPILOT_INVALID &&
    compid !== MAV_COMP_ID_TELEMETRY_RADIO
  );
}

// Safely send IPC message to all live windows (main + every detached pop-out).
// The `mainWindow` argument is kept for backwards compatibility with the
// 60+ existing call sites but is no longer the sole target — every detached
// window subscribed to the same channel receives the broadcast too. This is
// how telemetry / status / param events reach pop-out HUDs and graphs.
function flushPacketBatch(mainWindow: BrowserWindow): void {
  if (packetBatchTimer) {
    clearTimeout(packetBatchTimer);
    packetBatchTimer = null;
  }
  if (packetBatch.length === 0) return;
  const batch = packetBatch;
  packetBatch = [];
  safeSend(mainWindow, IPC_CHANNELS.MAVLINK_PACKET, batch);
}

function safeSend(mainWindow: BrowserWindow, channel: string, ...args: unknown[]): void {
  for (const win of getAllWindows()) {
    try {
      if (!win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
        win.webContents.send(channel, ...args);
      }
    } catch {
      // Window was destroyed between getAllWindows() and now; ignore.
    }
  }
  // Defensive: if the manager hasn't been initialized yet for some reason,
  // fall back to the direct mainWindow send so we don't drop events at boot.
  if (getAllWindows().length === 0) {
    try {
      if (!mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send(channel, ...args);
      }
    } catch {
      // ignore
    }
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

/**
 * Push a synthetic STATUSTEXT into the renderer's Messages panel, exactly as if
 * the vehicle had sent one. Used to surface GCS-side conditions (e.g. an arm
 * command that never gets an ACK) that would otherwise be invisible.
 */
function emitStatusText(mainWindow: BrowserWindow, severity: number, text: string): void {
  const severityLabel = SEVERITY_LABELS[severity] ?? 'INFO';
  safeSend(mainWindow, IPC_CHANNELS.MAVLINK_STATUSTEXT, { severity, severityLabel, text });
}

// Helper functions to read values from MAVLink payload (little-endian)
function readInt16(payload: Uint8Array, offset: number): number {
  const val = payload[offset]! | (payload[offset + 1]! << 8);
  return val > 0x7FFF ? val - 0x10000 : val;
}

function readUint16(payload: Uint8Array, offset: number): number {
  return payload[offset]! | (payload[offset + 1]! << 8);
}

function readInt32(payload: Uint8Array, offset: number): number {
  const val = payload[offset]! | (payload[offset + 1]! << 8) | (payload[offset + 2]! << 16) | (payload[offset + 3]! << 24);
  return val;
}

function readUint32(payload: Uint8Array, offset: number): number {
  return (payload[offset]! | (payload[offset + 1]! << 8) | (payload[offset + 2]! << 16) | (payload[offset + 3]! << 24)) >>> 0;
}

function readFloat(payload: Uint8Array, offset: number): number {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setUint8(0, payload[offset]!);
  view.setUint8(1, payload[offset + 1]!);
  view.setUint8(2, payload[offset + 2]!);
  view.setUint8(3, payload[offset + 3]!);
  return view.getFloat32(0, true); // little-endian
}

// MAVLink message IDs
const MSG_HEARTBEAT = 0;
const MSG_SYS_STATUS = 1;
const MSG_BATTERY_STATUS = 147;
const MSG_PARAM_VALUE = 22;
const MSG_GPS_RAW_INT = 24;
const MSG_GPS2_RAW = 124;
const MSG_ATTITUDE = 30;
const MSG_GLOBAL_POSITION_INT = 33;
const MSG_RC_CHANNELS_RAW = 35;
const MSG_RC_CHANNELS = 65;
const MSG_RADIO_STATUS = 109;
const MSG_NAV_CONTROLLER_OUTPUT = 62;
const MSG_VFR_HUD = 74;
const MSG_POSITION_TARGET_GLOBAL_INT = 87;
const MSG_COMMAND_ACK = 77;
const MSG_TERRAIN_REPORT = 136;
const MSG_WIND = 168;
const MSG_WIND_COV = 231;
const MSG_NAMED_VALUE_FLOAT = 251;
const MSG_STATUSTEXT = 253;
// PX4 events interface. Since v1.13 PX4 reports most user-facing warnings and
// errors here rather than as STATUSTEXT, so without this the Messages panel is
// blind to PX4 arming refusals and failsafe reasons.
const MSG_EVENT = 410;

/**
 * Last EVENT sequence rendered per `sysid:compid`. Events are broadcast and may
 * be re-sent when a GCS requests a gap, so the same sequence can arrive twice.
 */
const lastEventSequence = new Map<string, number>();

// Component information service: the vehicle's own parameter/event definitions.
const MSG_COMPONENT_INFORMATION = 395; // deprecated, kept as a fallback
const MSG_COMPONENT_METADATA = 397;

/** Resolver for an in-flight COMPONENT_METADATA/INFORMATION request. */
let pendingComponentMetadata: ((uri: string | null) => void) | null = null;
/** Parameter metadata downloaded from the vehicle, overriding the bundled set. */
let px4VehicleParamMetadata: ParameterMetadataStore | null = null;
/** Guards against running the component-info walk more than once per link. */
let px4ComponentInfoStarted = false;

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

// Autopilot version (for UID extraction)
const MSG_AUTOPILOT_VERSION = 148;

// Vibration and ESC telemetry (for motor test view)
const MSG_VIBRATION = 241;
const MSG_SERVO_OUTPUT_RAW = 36;
const MSG_ESC_TELEMETRY_1_TO_4 = 11030;
const MSG_ESC_TELEMETRY_5_TO_8 = 11031;
const MSG_ESC_TELEMETRY_9_TO_12 = 11032;

// FTP message ID
const MSG_FILE_TRANSFER_PROTOCOL = 110;

// Compass calibration feedback (DO_START_MAG_CAL)
const MSG_MAG_CAL_PROGRESS = 191;
const MSG_MAG_CAL_REPORT = 192;

// Fence message ID
const MSG_FENCE_STATUS = 162;
const MSG_LOG_ENTRY = 118;
const MSG_LOG_DATA = 120;
const MSG_STORAGE_INFORMATION = 261;

// MAVLink CRC_EXTRA values for v1 paths (manual payload construction without mission_type)
// Per MAVLink spec, CRC_EXTRA excludes extension fields, so these match the generated v2 values
const MISSION_REQUEST_LIST_CRC_EXTRA_V1 = 132;
const MISSION_COUNT_CRC_EXTRA_V1 = 221;
const MISSION_REQUEST_CRC_EXTRA_V1 = 230;
const MISSION_ITEM_CRC_EXTRA_V1 = 254;
const MISSION_CLEAR_ALL_CRC_EXTRA_V1 = 232;
const MISSION_ACK_CRC_EXTRA_V1 = 153;

// Parse telemetry from MAVLink packet
// NOTE: MAVLink v2 orders payload fields by size (largest first for alignment)
function parseTelemetry(mainWindow: BrowserWindow, packet: MAVLinkPacket): void {
  const { msgid, payload } = packet;

  // Scope all telemetry from this packet to its source vehicle. Every
  // queueMavlinkTelemetry call below runs synchronously within this function,
  // so this module var is a safe per-packet channel.
  parseVehicleKey = primaryTransportId
    ? makeVehicleKey(primaryTransportId, packet.sysid, packet.compid)
    : PRIMARY_BATCH_KEY;

  // Log mission-related messages for debugging
  const missionMsgIds = [39, 40, 41, 42, 43, 44, 45, 46, 47, 51, 73];
  if (missionMsgIds.includes(msgid)) {
    const hexPayload = Array.from(payload).map(b => b.toString(16).padStart(2, '0')).join(' ');
    sendLog(mainWindow, 'debug', `Received MSG #${msgid} (len=${payload.length}): ${hexPayload}`);
  }

  switch (msgid) {
    // Camera / gimbal discovery. These ride peripheral component ids (camera,
    // gimbal) so they're scoped to the ACTIVE vehicle key (which keys off the
    // autopilot component) rather than the sender's compid.
    case VIDEO_STREAM_INFORMATION_ID: {
      try {
        const v = deserializeVideoStreamInformation(payload);
        const vehicleKey = connectionRegistry.getActiveVehicleKey() ?? parseVehicleKey;
        safeSend(mainWindow, IPC_CHANNELS.CAMERA_VIDEO_STREAM_INFO, {
          vehicleKey,
          streamId: v.streamId,
          name: v.name,
          uri: v.uri,
          type: v.type,
          framerate: v.framerate,
          resolutionH: v.resolutionH,
          resolutionV: v.resolutionV,
          hfovDeg: v.hfov,
        });
      } catch { /* malformed — ignore */ }
      break;
    }
    case GIMBAL_DEVICE_ATTITUDE_STATUS_ID: {
      try {
        const g = deserializeGimbalDeviceAttitudeStatus(payload);
        // q is [w,x,y,z]; convert to roll/pitch/yaw degrees for display + geolocation.
        const [w, x, y, z] = [g.q[0] ?? 1, g.q[1] ?? 0, g.q[2] ?? 0, g.q[3] ?? 0];
        const RAD = 180 / Math.PI;
        const rollDeg = Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y)) * RAD;
        const sp = Math.max(-1, Math.min(1, 2 * (w * y - z * x)));
        const pitchDeg = Math.asin(sp) * RAD;
        const yawDeg = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)) * RAD;
        const vehicleKey = connectionRegistry.getActiveVehicleKey() ?? parseVehicleKey;
        safeSend(mainWindow, IPC_CHANNELS.CAMERA_GIMBAL_ATTITUDE, { vehicleKey, rollDeg, pitchDeg, yawDeg });
      } catch { /* malformed — ignore */ }
      break;
    }
    case GIMBAL_MANAGER_INFORMATION_ID: {
      try {
        const g = deserializeGimbalManagerInformation(payload);
        const RAD = 180 / Math.PI;
        const vehicleKey = connectionRegistry.getActiveVehicleKey() ?? parseVehicleKey;
        safeSend(mainWindow, IPC_CHANNELS.CAMERA_GIMBAL_INFO, {
          vehicleKey,
          capFlags: g.capFlags,
          rollMinDeg: g.rollMin * RAD,
          rollMaxDeg: g.rollMax * RAD,
          pitchMinDeg: g.pitchMin * RAD,
          pitchMaxDeg: g.pitchMax * RAD,
          yawMinDeg: g.yawMin * RAD,
          yawMaxDeg: g.yawMax * RAD,
        });
      } catch { /* malformed — ignore */ }
      break;
    }
    case MSG_HEARTBEAT: {
      // MAVLink wire order: custom_mode(4), type(1), autopilot(1), base_mode(1), system_status(1), mavlink_version(1)
      const customMode = readUint32(payload, 0);
      const vehicleType = payload[4]!;
      const autopilotType = payload[5]!;
      const baseMode = payload[6]!;

      // Companion computer heartbeat detection (MAV_COMP_ID_ONBOARD_COMPUTER = 191)
      if (packet.compid === 191) {
        mainWindow.webContents.send(IPC_CHANNELS.COMPANION_HEARTBEAT, {
          online: true,
          lastSeen: Date.now(),
          systemType: `type-${vehicleType}`,
        });
      }

      // Only process heartbeats from the connected autopilot, not companion computers/cameras/radios/etc.
      if (!isVehicleHeartbeat(vehicleType, autopilotType, packet.compid)) break;
      if (connectionState.componentId != null && packet.compid !== connectionState.componentId) break;

      currentVehicleType = vehicleType;
      const systemStatus = payload[7]!; // MAV_STATE
      const armedFlag = (baseMode & 0x80) !== 0; // MAV_MODE_FLAG_SAFETY_ARMED
      // Reject the armed flag only during the truly transient boot states
      // (UNINIT=0, BOOT=1, CALIBRATING=2). This preserves the #43 fix
      // (Pixhawk 6C false-positive during boot) while accepting STANDBY (3)
      // and above — ArduPilot legitimately reports armed=1 in STANDBY for a
      // brief window after the user arms before transitioning to ACTIVE.
      // Issue #84: the previous `>= 4` check was too strict and caused the
      // toolbar to miss legitimate armed states.
      const armed = armedFlag && systemStatus >= 3;

      // Log armed-state transitions so any future bug reports come with the
      // exact heartbeat values that were observed. Diagnostic only — does not
      // affect behavior.
      if (armed !== lastReportedArmed) {
        sendLog(
          mainWindow,
          'info',
          `Armed state: ${lastReportedArmed === null ? 'init' : lastReportedArmed} → ${armed}`,
          `base_mode=0x${baseMode.toString(16)} system_status=${systemStatus} armed_flag=${armedFlag} sysid=${packet.sysid} compid=${packet.compid}`
        );
        lastReportedArmed = armed;
      }

      // Get mode name based on autopilot + vehicle type
      let modeName = `Mode ${customMode}`;
      if (autopilotType === 12) {
        // PX4 encodes the mode in a main/sub bitfield, not by vehicle type.
        modeName = getPx4ModeName(customMode);
      } else
      // Fixed wing and VTOL types use plane modes
      if (vehicleType === 1 || (vehicleType >= 19 && vehicleType <= 25)) {
        modeName = PLANE_MODES[customMode] || modeName;
      } else if (vehicleType === 2 || (vehicleType >= 13 && vehicleType <= 15) || vehicleType === 29 || vehicleType === 35) {
        // Rotorcraft types: quad, hex, octo, tri, dodeca, deca
        modeName = COPTER_MODES[customMode] || modeName;
      } else if (vehicleType === 10 || vehicleType === 11) {
        // Ground rover and surface boat (boat uses rover modes in ArduPilot)
        modeName = ROVER_MODES[customMode] || modeName;
      } else if (vehicleType === 12) {
        // Submarine
        modeName = SUB_MODES[customMode] || modeName;
      }

      const flight: FlightState = {
        mode: modeName,
        modeNum: customMode,
        armed,
        isFlying: armed && (baseMode & 0x04) !== 0, // MAV_MODE_FLAG_CUSTOM_MODE_ENABLED as proxy
      };
      lastFlightModeName = modeName;
      queueMavlinkTelemetry(mainWindow, { flight });

      // Cache for bug report diagnostics
      cachedHeartbeat = { autopilot: autopilotType, type: vehicleType, base_mode: baseMode, custom_mode: customMode, system_status: payload[7]! };
      break;
    }

    case MSG_SYS_STATUS: {
      // Payload offset for battery: voltage_battery at offset 14 (uint16 mV), current_battery at 16 (int16 cA), battery_remaining at 30 (int8 %)
      const voltage = readUint16(payload, 14) / 1000; // mV to V
      const current = readInt16(payload, 16) / 100;   // cA to A
      const remaining = payload[30] === 255 ? -1 : payload[30]!; // -1 if unknown

      const battery: BatteryData = { voltage, current, remaining };
      const sensorHealth = {
        present: readUint32(payload, 0),
        enabled: readUint32(payload, 4),
        health: readUint32(payload, 8),
      };
      queueMavlinkTelemetry(mainWindow, { battery, sensorHealth });

      // Cache full SYS_STATUS for bug report diagnostics
      cachedSysStatus = {
        sensors_present: readUint32(payload, 0),
        sensors_enabled: readUint32(payload, 4),
        sensors_health: readUint32(payload, 8),
        load: readUint16(payload, 12),
        voltage_battery: readUint16(payload, 14),
        current_battery: readInt16(payload, 16),
        errors_count1: readUint16(payload, 18),
        errors_count2: readUint16(payload, 20),
        errors_count3: readUint16(payload, 22),
        errors_count4: readUint16(payload, 24),
      };
      break;
    }

    case MSG_BATTERY_STATUS: {
      // Per-monitor battery data (#126). One message per configured monitor;
      // SYS_STATUS above stays the source for the legacy primary slot.
      // v2 zero-truncation: extensions (time_remaining..fault_bitmask) are
      // routinely stripped, always pad before reading.
      const p = padTo(payload, 54);

      // Pack voltage = sum of populated cell slots (mV, 65535 = slot unused).
      // Monitors without per-cell sensing report the whole pack in slot 0;
      // 11-14S packs continue into voltages_ext.
      let mv = 0;
      let cells = 0;
      for (let i = 0; i < 10; i++) {
        const v = readUint16(p, 10 + i * 2);
        if (v !== 65535 && v > 0) { mv += v; cells++; }
      }
      for (let i = 0; i < 4; i++) {
        const v = readUint16(p, 41 + i * 2);
        if (v !== 0 && v !== 65535) { mv += v; cells++; }
      }

      const currentCa = readInt16(p, 30);
      const mah = readInt32(p, 0);
      const tempCdeg = readInt16(p, 8);
      const remainingPct = (p[35]! << 24) >> 24; // int8, -1 = unknown
      const timeRemaining = readInt32(p, 36);

      const instance = {
        id: p[32]!,
        voltage: mv / 1000,
        current: currentCa === -1 ? 0 : currentCa / 100,
        remaining: remainingPct < 0 ? -1 : remainingPct,
        ...(mah >= 0 ? { mahDrawn: mah } : {}),
        ...(cells > 1 ? { cellCount: cells, cellVoltage: mv / cells / 1000 } : {}),
        ...(tempCdeg !== 32767 ? { temperature: tempCdeg / 100 } : {}),
        ...(timeRemaining > 0 ? { timeRemaining } : {}),
      };

      // Merge into the pending batch by id, a flat field would let one
      // monitor's frame overwrite another's inside the 100ms batch window.
      const pending = (mavlinkTelemetryBatches[parseVehicleKey]?.batteryInstances ?? {}) as Record<number, unknown>;
      queueMavlinkTelemetry(mainWindow, { batteryInstances: { ...pending, [instance.id]: instance } });
      break;
    }

    case MSG_GPS_RAW_INT: {
      // MAVLink wire order (base fields, size-descending): time_usec(8) @0,
      // lat(4) @8, lon(4) @12, alt(4) @16, eph(2) @20, epv(2) @22, vel(2) @24,
      // cog(2) @26, fix_type(1) @28, satellites_visible(1) @29.
      const lat = readInt32(payload, 8) / 1e7;
      const lon = readInt32(payload, 12) / 1e7;
      const alt = readInt32(payload, 16) / 1000; // mm to m
      const hdop = readUint16(payload, 20) / 100; // eph = hdop * 100
      const vdop = readUint16(payload, 22) / 100; // epv = vdop * 100
      const fixType = payload[28]!;
      const satellites = payload[29]!;

      const gps: GpsData = { fixType, satellites, hdop, vdop, lat, lon, alt };
      // Cache for the NTRIP client's GGA uploads (issue #60)
      lastGpsRawForNtrip = { gps, atMs: Date.now() };
      queueMavlinkTelemetry(mainWindow, { gps });
      break;
    }

    case MSG_GPS2_RAW: {
      // Second GPS receiver. MAVLink wire order (base fields, size-descending):
      // time_usec(8) @0, lat(4) @8, lon(4) @12, alt(4) @16, dgps_age(4) @20,
      // eph(2) @24, epv(2) @26, vel(2) @28, cog(2) @30, fix_type(1) @32,
      // satellites_visible(1) @33, dgps_numch(1) @34. (The extra 4-byte
      // dgps_age shifts the 2-byte and 1-byte fields vs GPS_RAW_INT.)
      const lat = readInt32(payload, 8) / 1e7;
      const lon = readInt32(payload, 12) / 1e7;
      const alt = readInt32(payload, 16) / 1000; // mm to m
      const hdop = readUint16(payload, 24) / 100; // eph = hdop * 100
      const vdop = readUint16(payload, 26) / 100; // epv = vdop * 100
      const fixType = payload[32] ?? 0;
      const satellites = payload[33] ?? 0;

      const gps2: GpsData = { fixType, satellites, hdop, vdop, lat, lon, alt };
      queueMavlinkTelemetry(mainWindow, { gps2 });
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
      lastAttitudeAtMs = Date.now();
      queueMavlinkTelemetry(mainWindow, { attitude });
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
      queueMavlinkTelemetry(mainWindow, { position });
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
      queueMavlinkTelemetry(mainWindow, { vfrHud });
      break;
    }

    case MSG_WIND: {
      // WIND (168) wire order: direction(4), speed(4), speed_z(4) - all float32
      const direction = readFloat(payload, 0);
      const speed = readFloat(payload, 4);
      const speedZ = readFloat(payload, 8);
      queueMavlinkTelemetry(mainWindow, { wind: { direction, speed, speedZ } });
      break;
    }

    case MSG_WIND_COV: {
      // WIND_COV (231) — PX4's wind estimate (PX4 never sends ArduPilot's
      // WIND/168, so without this every wind display is silently empty on
      // PX4). Wire order: time_usec(8), wind_x(4, north m/s), wind_y(4, east),
      // wind_z(4, down), var_horiz(4), var_vert(4), wind_alt(4),
      // horiz_accuracy(4), vert_accuracy(4).
      const windN = readFloat(payload, 8);
      const windE = readFloat(payload, 12);
      const windD = readFloat(payload, 16);
      // wind_x/y is the wind VELOCITY vector (direction it blows toward);
      // WindData.direction is meteorological (where it comes FROM): +180.
      const dirFrom = (Math.atan2(windE, windN) * 180 / Math.PI + 180 + 360) % 360;
      queueMavlinkTelemetry(mainWindow, {
        wind: { direction: dirFrom, speed: Math.hypot(windN, windE), speedZ: -windD },
      });
      break;
    }

    case MSG_NAV_CONTROLLER_OUTPUT: {
      // NAV_CONTROLLER_OUTPUT (62) wire order: nav_roll(4), nav_pitch(4),
      //   alt_error(4), aspd_error(4), xtrack_error(4), nav_bearing(2, i16),
      //   target_bearing(2, i16), wp_dist(2, u16)
      // v2 zero-truncation: an idle vehicle (zero bearings/wp_dist) sends a
      // short payload; missing bytes read back as their true value, 0.
      const navController: NavControllerData = {
        altError: readFloat(payload, 8),
        aspdError: readFloat(payload, 12),
        xtrackError: readFloat(payload, 16),
        navBearing: readInt16(payload, 20),
        targetBearing: readInt16(payload, 22),
        wpDist: readUint16(payload, 24),
      };
      queueMavlinkTelemetry(mainWindow, { navController });
      break;
    }

    case MSG_POSITION_TARGET_GLOBAL_INT: {
      // POSITION_TARGET_GLOBAL_INT (87) wire order: time_boot_ms(4),
      //   lat_int(4, i32 degE7), lon_int(4, i32 degE7), alt(4, f32),
      //   vx/vy/vz/afx/afy/afz/yaw/yaw_rate (f32 each, @16..@47),
      //   type_mask(2, u16 @48), coordinate_frame(1, u8 @50).
      // The autopilot broadcasts its ACTIVE guided destination, so this mirrors
      // gotos commanded by ANY GCS on the link. v2 zero-truncation: trailing
      // zero bytes (frame=GLOBAL, low mask bits) are trimmed; the OOB-safe
      // reads below return 0, their true value.
      const guidedTarget: GuidedTargetData = {
        lat: readInt32(payload, 4) / 1e7,
        lon: readInt32(payload, 8) / 1e7,
        alt: readFloat(payload, 12),
        typeMask: readUint16(payload, 48),
        frame: payload[50] ?? 0,
        receivedAt: Date.now(),
      };
      queueMavlinkTelemetry(mainWindow, { guidedTarget });
      break;
    }

    case MSG_VIBRATION: {
      // VIBRATION (241) wire order: time_usec(8), vibration_x(4), vibration_y(4),
      //   vibration_z(4), clipping_0(4), clipping_1(4), clipping_2(4)
      // The clipping_* counts are usually 0, so MAVLink v2 truncates them away and
      // the payload arrives ~20 bytes. Require only through vibration_z (offset 16);
      // truncated clipping bytes read back as 0 (their real value).
      if (payload.length >= 20) {
        const x = readFloat(payload, 8);
        const y = readFloat(payload, 12);
        const z = readFloat(payload, 16);
        const clip0 = readUint32(payload, 20);
        const clip1 = readUint32(payload, 24);
        const clip2 = readUint32(payload, 28);
        queueMavlinkTelemetry(mainWindow, {
          vibration: { x, y, z, clip0, clip1, clip2, timestamp: Date.now() },
        });
      }
      break;
    }

    case MSG_MAG_CAL_PROGRESS: {
      // MAG_CAL_PROGRESS (191) wire order (floats first, then u8s):
      //   direction_x(0) direction_y(4) direction_z(8) f32,
      //   compass_id(12) cal_mask(13) cal_status(14) attempt(15) completion_pct(16) u8,
      //   completion_mask[10](17).
      // completion_pct (and low compass ids) are often 0 early on, so MAVLink v2
      // truncates them; the OOB-safe reads below return 0, which is the real value.
      const compassId = payload[12] ?? 0;
      const calStatus = payload[14] ?? 0;
      const completionPct = payload[16] ?? 0;
      handleMagCalProgress(compassId, calStatus, completionPct);

      // Coverage for the calibration sphere. completion_mask is a bitfield over
      // ArduPilot's 80 geodesic sections, so it says WHICH directions the
      // solver still has no samples for, which a percentage cannot. Zero-pad
      // first: v2 truncation drops the trailing mask bytes early in a run, and
      // those sections genuinely are uncovered.
      if (mainWindow) {
        const full = new Uint8Array(27);
        full.set(payload.subarray(0, Math.min(payload.length, 27)));
        const view = new DataView(full.buffer);
        safeSend(mainWindow, IPC_CHANNELS.CALIBRATION_MAG_COVERAGE, {
          compassId,
          completionPct,
          mask: Array.from(full.subarray(17, 27)),
          direction: [
            view.getFloat32(0, true),
            view.getFloat32(4, true),
            view.getFloat32(8, true),
          ] as [number, number, number],
        });
      }
      break;
    }

    case MSG_MAG_CAL_REPORT: {
      // MAG_CAL_REPORT (192) wire order (10 floats first, then u8s):
      //   fitness(0) ofs_x(4) ofs_y(8) ofs_z(12) diag_x(16) diag_y(20) diag_z(24)
      //   offdiag_x(28) offdiag_y(32) offdiag_z(36) f32,
      //   compass_id(40) cal_mask(41) cal_status(42) autosaved(43) u8.
      // cal_status is non-zero for SUCCESS(4)/FAILED(5+), so it is never truncated
      // away; fitness sits at offset 0 and is always present.
      const fitness = readFloat(payload, 0);
      const compassId = payload[40] ?? 0;
      const calMask = payload[41] ?? 0;
      const calStatus = payload[42] ?? 0;
      handleMagCalReport(compassId, calMask, calStatus, fitness);
      break;
    }

    case MSG_SERVO_OUTPUT_RAW: {
      // MAVLink v2 truncates trailing zero bytes and ArduPilot always sends
      // port=0 for the MAIN outputs, so the payload routinely arrives far shorter
      // than its nominal length. decodeServoOutputRaw handles the truncation and
      // is unit-tested in servo-output-decode.test.ts.
      const decoded = decodeServoOutputRaw(payload);
      if (decoded) {
        queueMavlinkTelemetry(mainWindow, {
          servoOutput: { outputs: decoded.outputs, timestamp: Date.now() },
        });
      }
      break;
    }

    case MSG_ESC_TELEMETRY_1_TO_4:
    case MSG_ESC_TELEMETRY_5_TO_8:
    case MSG_ESC_TELEMETRY_9_TO_12: {
      // ESC_TELEMETRY_N_TO_M wire order (size-sorted):
      //   voltage[4] U16, current[4] U16, totalcurrent[4] U16, rpm[4] U16, count[4] U16, temperature[4] U8
      // Total: 44 bytes. Voltage in cV, current in cA, rpm in eRPM.
      // temperature[] (the trailing field) is often 0 (ESC reports no temp), so
      // MAVLink v2 truncates it and the payload arrives ~40 bytes. Require only
      // through rpm (offset 24-31); truncated temperature bytes read back as 0.
      if (payload.length >= 32) {
        const baseMotorIndex =
          msgid === MSG_ESC_TELEMETRY_1_TO_4 ? 0 :
          msgid === MSG_ESC_TELEMETRY_5_TO_8 ? 4 : 8;

        // Build a sparse motors array preserving any previously-received groups
        const existingEsc = (mavlinkTelemetryBatches[parseVehicleKey]?.escTelemetry as EscTelemetryData | undefined)?.motors ?? [];
        const motors: Array<EscMotorTelemetry | undefined> = existingEsc.slice();
        while (motors.length < baseMotorIndex + 4) motors.push(undefined);

        for (let i = 0; i < 4; i++) {
          const voltageCv = readUint16(payload, 0 + i * 2);
          const currentCa = readUint16(payload, 8 + i * 2);
          const rpm = readUint16(payload, 24 + i * 2);
          const tempC = payload[40 + i] ?? 0;
          motors[baseMotorIndex + i] = {
            rpm,
            tempC,
            voltageV: voltageCv / 100,
            currentA: currentCa / 100,
          };
        }
        queueMavlinkTelemetry(mainWindow, {
          escTelemetry: { motors, timestamp: Date.now() } as EscTelemetryData,
        });
      }
      break;
    }

    case MSG_RC_CHANNELS_RAW: {
      // RC_CHANNELS_RAW (msg 35): 8 channels per port — fallback for FCs that don't populate msg 65 fully.
      // v2 wire order: time_boot_ms(U32), chan1-8(U16×8), port(U8), rssi(U8)
      // port (offset 20) is 0 for the primary RC input. When port and rssi are
      // both 0, v2 truncates them away, so `payload[20]` is undefined - treat a
      // missing port byte as 0 (primary) rather than failing the === 0 check.
      const rawPort = payload[20] ?? 0;
      if (rawPort === 0) {
        // Only use port 0 (primary RC input)
        const rawChannels: number[] = [];
        for (let i = 0; i < 8; i++) {
          rawChannels.push(readUint16(payload, 4 + i * 2));
        }
        rcMsg35 = { channels: rawChannels, rssi: payload[21] ?? 0 };
        emitMergedRcChannels(mainWindow);
      }
      break;
    }

    case MSG_RC_CHANNELS: {
      // RC_CHANNELS (msg 65): up to 18 channels — primary source.
      // v2 wire order: time_boot_ms(U32), chan1-18(U16×18), chancount(U8), rssi(U8)
      // chancount (offset 40) and rssi (offset 41) are the trailing bytes; v2 can
      // truncate them to 0/absent. Default to 0 so the chancount===0 inference
      // path below still runs instead of reading undefined.
      let chancount = payload[40] ?? 0;
      const rssi = payload[41] ?? 0;
      const channels: number[] = [];
      for (let i = 0; i < 18; i++) {
        channels.push(readUint16(payload, 4 + i * 2));
      }
      // Some FCs (e.g. ELRS over MAVLink) report chancount=0 while still populating
      // valid channel data. Infer count from actual values: valid channels have
      // values in the typical RC range (800-2200), unused ones are 0 or UINT16_MAX.
      if (chancount === 0) {
        let inferred = 0;
        for (let i = 0; i < 18; i++) {
          const v = channels[i]!;
          if (v > 0 && v < 65535) inferred = i + 1;
        }
        chancount = inferred;
      }
      // Trim to actual channel count (unused channels report UINT16_MAX = 65535)
      rcMsg65 = { channels: channels.slice(0, chancount), chancount, rssi };
      emitMergedRcChannels(mainWindow);
      break;
    }

    case MSG_RADIO_STATUS: {
      // RADIO_STATUS (109) from the telemetry modem (SiK/RFD900/ELRS gateway).
      // v2 wire order (size-sorted): rxerrors(u16)@0, fixed(u16)@2, rssi@4,
      // remrssi@5, txbuf@6, noise@7, remnoise@8. Zero-pad: an idle link with
      // zero errors truncates the tail away.
      const p = padTo(payload, 9);
      // The modem speaks for itself, not for the autopilot: ELRS sends this
      // from its own sysid on compid 68, so keying it by sender files the link
      // quality under a vehicle nobody is watching and the UI reads "--" while
      // the handset shows 100%.
      queueMavlinkTelemetry(mainWindow, {
        radioStatus: {
          rxErrors: readUint16(p, 0),
          fixed: readUint16(p, 2),
          rssi: p[4]!,
          remRssi: p[5]!,
          txbuf: p[6]!,
          noise: p[7]!,
          remNoise: p[8]!,
        },
      }, telemetryKeyFor(msgid, packet.compid, parseVehicleKey, connectionRegistry.getActiveVehicleKey()));
      break;
    }

    case MSG_NAMED_VALUE_FLOAT: {
      // NAMED_VALUE_FLOAT (251):
      //   timeBootMs(U32)@0, value(F32)@4, name(char[10])@8
      // ArduDeck's installed Lua scripts publish a heartbeat here ('AD_HB');
      // the script-installer's heartbeat-tracker watches for it.
      try {
        const value = readFloat(payload, 4);
        const name = new TextDecoder().decode(payload.slice(8, 18)).replace(/\0.*$/, '');
        // AD_HB heartbeats arrive every second - too noisy to log at info.
        // Other NVF names (rare) stay at info so unexpected floats are visible.
        if (name !== 'AD_HB') {
          sendLog(mainWindow, 'info', `NAMED_VALUE_FLOAT received: name="${name}" value=${value}`);
        }
        ingestNamedValueFloat(name, value);
      } catch (err) {
        sendLog(mainWindow, 'warn', `NAMED_VALUE_FLOAT parse failed: ${err instanceof Error ? err.message : err}`);
      }
      break;
    }

    case MSG_COMPONENT_METADATA:
    case MSG_COMPONENT_INFORMATION: {
      // The general metadata URI sits at a DIFFERENT offset in each message,
      // because the deprecated one carries a second CRC ahead of the strings:
      //   COMPONENT_METADATA(397):    time_boot_ms@0, file_crc@4, uri@8   (108)
      //   COMPONENT_INFORMATION(395): time_boot_ms@0, general_crc@4,
      //                               peripherals_crc@8, general_uri@12  (212)
      // Reading 395 at offset 8 lands on the peripherals CRC and yields an
      // empty string (confirmed against PX4 SITL, which answers both).
      //
      // Zero-pad first: the URI is null-padded and MAVLink v2 strips the
      // trailing zeros, so SITL's 397 arrives as 51 bytes, not 108.
      if (!pendingComponentMetadata) break;
      const isDeprecated = packet.msgid === MSG_COMPONENT_INFORMATION;
      const total = isDeprecated ? 212 : 108;
      const uriOffset = isDeprecated ? 12 : 8;
      const full = new Uint8Array(total);
      full.set(payload.subarray(0, Math.min(payload.length, total)));
      const uri = new TextDecoder()
        .decode(full.subarray(uriOffset, uriOffset + 100))
        .replace(/\0.*$/, '')
        .trim();
      const resolve = pendingComponentMetadata;
      pendingComponentMetadata = null;
      resolve(uri || null);
      break;
    }

    case MSG_EVENT: {
      // EVENT layout: id(U32)@0, event_time_boot_ms(U32)@4, sequence(U16)@8,
      // destination_component(U8)@10, destination_system(U8)@11,
      // log_levels(U8)@12, arguments(U8[40])@13. Total 53.
      //
      // MAVLink v2 truncates trailing zero bytes, and an all-zero argument
      // block is the COMMON case here (most events carry no arguments), so
      // zero-pad to the full length before reading rather than length-guarding.
      const full = new Uint8Array(53);
      full.set(payload.subarray(0, Math.min(payload.length, 53)));

      const eventId = readUint32(full, 0);
      const sequence = readUint16(full, 8);
      const logLevels = full[12]!;

      const seqKey = `${packet.sysid}:${packet.compid}`;
      if (lastEventSequence.get(seqKey) === sequence) break;
      lastEventSequence.set(seqKey, sequence);

      const formatted = formatPx4Event(eventId, full.subarray(13), logLevels);
      const severity = formatted ? formatted.severity : px4EventSeverity(logLevels);
      // Protocol/Disabled levels are machine-facing, never shown.
      if (severity === null) break;

      let text: string;
      if (formatted) {
        // Arming-check failures are PX4's equivalent of ArduPilot's "PreArm:"
        // messages. Labelling them the same keeps one Messages panel readable
        // across both firmwares, and matches the announcer's prearm phrase.
        text = formatted.group === 'arming_check' ? `PreArm: ${formatted.text}` : formatted.text;
      } else {
        // Unknown id: a custom PX4 build, or metadata older than the firmware.
        // Stay quiet for informational events, but never swallow a warning or
        // worse - an unexplained id beats silence when something is wrong.
        if (severity > 4) break;
        text = `PX4 event ${eventId}`;
      }

      const severityLabel = SEVERITY_LABELS[severity] ?? 'INFO';
      mainWindow.webContents.send(IPC_CHANNELS.MAVLINK_STATUSTEXT, { severity, severityLabel, text });
      statustextHistory.push({ ts: Date.now(), severity, severityLabel, text });
      if (statustextHistory.length > MAX_STATUSTEXT_HISTORY) {
        statustextHistory = statustextHistory.slice(-MAX_STATUSTEXT_HISTORY);
      }
      break;
    }

    case MSG_STATUSTEXT: {
      // STATUSTEXT base fields (both 1-byte types, declaration order preserved):
      //   severity(U8)@0, text(char[50])@1
      // Extension fields (after base): id(U16)@51, chunkSeq(U8)@53
      // v1 payloads are 51 bytes (no extensions), v2 payloads are 54 bytes
      const severity = payload[0]!;
      const text = new TextDecoder().decode(payload.slice(1, 51)).replace(/\0.*$/, '');

      // Forward STATUSTEXT from companion computer (MAV_COMP_ID_ONBOARD_COMPUTER = 191)
      if (packet.compid === 191) {
        mainWindow.webContents.send(IPC_CHANNELS.COMPANION_STATUSTEXT, {
          severity,
          text,
        });
      }
      const chunkId = payload.length >= 54 ? readUint16(payload, 51) : 0;
      const chunkSeq = payload.length >= 54 ? (payload[53] ?? 0) : 0;

      // Helper to push to statustext history ring buffer
      const pushStatustextHistory = (sev: number, sevLabel: string, msg: string): void => {
        statustextHistory.push({ ts: Date.now(), severity: sev, severityLabel: sevLabel, text: msg });
        if (statustextHistory.length > MAX_STATUSTEXT_HISTORY) statustextHistory = statustextHistory.slice(-MAX_STATUSTEXT_HISTORY);
      };

      if (chunkId === 0) {
        // Single-chunk message — emit immediately
        const severityLabel = SEVERITY_LABELS[severity] ?? 'INFO';
        mainWindow.webContents.send(IPC_CHANNELS.MAVLINK_STATUSTEXT, { severity, severityLabel, text });
        pushStatustextHistory(severity, severityLabel, text);
        // Forward to MAVLink calibration module if calibration is active
        if (isMavlinkCalibrationActive()) handleCalibrationStatusText(text, severity);
      } else {
        // Multi-chunk message — accumulate and reassemble
        let entry = statustextChunkBuffer.get(chunkId);
        if (!entry) {
          entry = { severity, chunks: [], timer: null };
          statustextChunkBuffer.set(chunkId, entry);
        }
        entry.chunks[chunkSeq] = text;

        // Clear previous flush timer
        if (entry.timer) clearTimeout(entry.timer);

        // Check if this is the last chunk (text shorter than 50 chars or contains null)
        const isLastChunk = text.length < 50;
        if (isLastChunk) {
          // Reassemble and emit
          const fullText = entry.chunks.join('');
          const severityLabel = SEVERITY_LABELS[entry.severity] ?? 'INFO';
          mainWindow.webContents.send(IPC_CHANNELS.MAVLINK_STATUSTEXT, { severity: entry.severity, severityLabel, text: fullText });
          pushStatustextHistory(entry.severity, severityLabel, fullText);
          if (isMavlinkCalibrationActive()) handleCalibrationStatusText(fullText, entry.severity);
          statustextChunkBuffer.delete(chunkId);
        } else {
          // Set timeout to flush incomplete messages after 2s
          entry.timer = setTimeout(() => {
            const buf = statustextChunkBuffer.get(chunkId);
            if (buf) {
              const fullText = buf.chunks.join('');
              const severityLabel = SEVERITY_LABELS[buf.severity] ?? 'INFO';
              mainWindow.webContents.send(IPC_CHANNELS.MAVLINK_STATUSTEXT, { severity: buf.severity, severityLabel, text: fullText });
              pushStatustextHistory(buf.severity, severityLabel, fullText);
              if (isMavlinkCalibrationActive()) handleCalibrationStatusText(fullText, buf.severity);
              statustextChunkBuffer.delete(chunkId);
            }
          }, 2000);
        }
      }
      break;
    }

    case MSG_TERRAIN_REPORT: {
      // TERRAIN_REPORT wire order (size-sorted): lat(i32)@0, lon(i32)@4,
      // terrain_height(f32)@8, current_height(f32)@12, spacing(u16)@16,
      // pending(u16)@18, loaded(u16)@20. v2 zero-truncation: an FC with no
      // terrain data sends pending/loaded as 0 which get truncated away, so
      // zero-pad rather than length-guard (truncated bytes ARE the real value).
      const p = padTo(payload, 22);
      safeSend(mainWindow, IPC_CHANNELS.MAVLINK_TERRAIN_STATUS, {
        sysid: packet.sysid,
        spacing: readUint16(p, 16),
        pending: readUint16(p, 18),
        loaded: readUint16(p, 20),
      });
      break;
    }

    case MSG_COMMAND_ACK: {
      // COMMAND_ACK wire layout (verified against pymavlink/common.xml):
      //   command       (uint16) @ 0
      //   result        (uint8)  @ 2
      //   progress      (uint8)  @ 3   (extension)
      //   result_param2 (int32)  @ 4   (extension, NOT reordered)
      //   target_system (uint8)  @ 8   (extension)
      //   target_component (uint8) @ 9 (extension)
      //
      // Non-extension fields are at fixed offsets in BOTH v1 and v2; v2
      // simply appends extension fields after them. The previous "v2 puts
      // result_param2 at offset 0" interpretation was incorrect — extension
      // fields are NEVER reordered, only non-extensions get size-sorted.
      // Result of the bug: COMMAND_ACK from any standard MAVLink sender
      // (SITL, real ArduPilot, Mission Planner, etc) was misparsed and the
      // actual command/result were silently dropped, breaking calibration
      // ACK detection for level/gyro and the wider command-tracking layer.
      const ackCommand = readUint16(payload, 0);
      const ackResult = payload[2] ?? 0;
      // MAV_RESULT: 0=ACCEPTED, 1=TEMPORARILY_REJECTED, 2=DENIED, 3=UNSUPPORTED, 4=FAILED, 5=IN_PROGRESS
      const MAV_RESULT_NAMES = ['ACCEPTED', 'TEMPORARILY_REJECTED', 'DENIED', 'UNSUPPORTED', 'FAILED', 'IN_PROGRESS'];
      const resultName = MAV_RESULT_NAMES[ackResult] ?? `UNKNOWN(${ackResult})`;

      // Log arm/disarm command results prominently and forward to messages panel
      if (ackCommand === 400) {
        if (armAckWatchdog) { clearTimeout(armAckWatchdog); armAckWatchdog = null; }
        const severity = ackResult === 0 ? 6 : 4; // MAV_SEVERITY_INFO=6, WARNING=4
        const severityLabel = SEVERITY_LABELS[severity] ?? 'INFO';
        const text = ackResult === 0 ? 'ARM/DISARM accepted' : `ARM/DISARM ${resultName}`;
        mainWindow.webContents.send(IPC_CHANNELS.MAVLINK_STATUSTEXT, { severity, severityLabel, text });
        sendLog(mainWindow, ackResult === 0 ? 'info' : 'warn', text);
      }

      // Log takeoff command results
      if (ackCommand === 22) {
        const severity = ackResult === 0 ? 6 : 4;
        const severityLabel = SEVERITY_LABELS[severity] ?? 'INFO';
        const text = ackResult === 0 ? 'Takeoff accepted' : `Takeoff ${resultName}`;
        mainWindow.webContents.send(IPC_CHANNELS.MAVLINK_STATUSTEXT, { severity, severityLabel, text });
        sendLog(mainWindow, ackResult === 0 ? 'info' : 'warn', text);
      }

      // Log DO_REPOSITION (go-to) results. FAILED almost always means the
      // destination breached the geofence: ArduPilot's set_destination only
      // fails for fence or missing terrain data, and sends no statustext
      // (verified against SITL: FENCE_RADIUS breach = bare FAILED).
      if (ackCommand === 192) {
        const severity = ackResult === 0 ? 6 : 4;
        const severityLabel = SEVERITY_LABELS[severity] ?? 'INFO';
        const sentTerrainFrame = lastGotoFrameBySysid.get(packet.sysid) === 11;
        const text = ackResult === 0 ? 'GO_TO accepted'
          : ackResult === 4 && sentTerrainFrame
            ? 'GO_TO FAILED - sent terrain-relative but the vehicle has no terrain data. Switch "Above" to Home in the fly popup.'
          : ackResult === 4 ? 'GO_TO FAILED - FC refused: destination outside geofence, mode switch to GUIDED refused, or terrain data missing'
          : `GO_TO ${resultName}`;
        mainWindow.webContents.send(IPC_CHANNELS.MAVLINK_STATUSTEXT, { severity, severityLabel, text });
        sendLog(mainWindow, ackResult === 0 ? 'info' : 'warn', text);
      }

      // Log DO_ORBIT (orbit) results
      if (ackCommand === 34) {
        const severity = ackResult === 0 ? 6 : 4;
        const severityLabel = SEVERITY_LABELS[severity] ?? 'INFO';
        const text = ackResult === 0 ? 'ORBIT accepted' : `ORBIT ${resultName}`;
        mainWindow.webContents.send(IPC_CHANNELS.MAVLINK_STATUSTEXT, { severity, severityLabel, text });
        sendLog(mainWindow, ackResult === 0 ? 'info' : 'warn', text);
      }

      // Log DO_SET_MODE (176) results — the FC tells us WHY a mode change was
      // refused (e.g. AUTOTUNE requested on the ground -> TEMPORARILY_REJECTED/
      // FAILED). Without this the request just silently does nothing.
      if (ackCommand === 176 && ackResult !== 0) {
        const text = `Mode change rejected by FC: ${resultName}`;
        mainWindow.webContents.send(IPC_CHANNELS.MAVLINK_STATUSTEXT, { severity: 4, severityLabel: 'WARNING', text });
        sendLog(mainWindow, 'warn', text, 'DO_SET_MODE was not accepted - the flight controller refused the requested mode (common for AUTOTUNE/AUTO/RTL when preconditions like being airborne or GPS lock are not met).');
      }

      // Log NAV_LAND results
      if (ackCommand === 21) {
        const severity = ackResult === 0 ? 6 : 4;
        const severityLabel = SEVERITY_LABELS[severity] ?? 'INFO';
        const text = ackResult === 0 ? 'LAND accepted' : `LAND ${resultName}`;
        mainWindow.webContents.send(IPC_CHANNELS.MAVLINK_STATUSTEXT, { severity, severityLabel, text });
        sendLog(mainWindow, ackResult === 0 ? 'info' : 'warn', text);
      }

      // A refused nav command must also kill the optimistic target overlay the
      // map drew at send time, otherwise the dotted line promises a flight the
      // FC already declined. IN_PROGRESS (5) is not a refusal.
      if ((ackCommand === 192 || ackCommand === 34 || ackCommand === 21)
        && ackResult !== 0 && ackResult !== 5) {
        safeSend(mainWindow, IPC_CHANNELS.MAVLINK_COMMAND_REJECTED, {
          command: ackCommand, result: ackResult, sysid: packet.sysid,
          frame: ackCommand === 192 ? lastGotoFrameBySysid.get(packet.sysid) : undefined,
        });
      }

      // Forward calibration-related COMMAND_ACKs (241=PREFLIGHT_CALIBRATION,
      // 42429=ACCELCAL_VEHICLE_POS, 42006=FIXED_MAG_CAL_YAW). FIXED_MAG_CAL_YAW
      // runs outside the activeCalType state machine — always forward it so
      // its dedicated pending-ACK resolver can fire.
      if (ackCommand === 241 || ackCommand === 42429) {
        const calActive = isMavlinkCalibrationActive();
        sendLog(mainWindow, 'info', `[CAL DIAG] COMMAND_ACK cmd=${ackCommand} result=${resultName} calActive=${calActive}`);
        if (calActive) {
          handleCalibrationCommandAck(ackCommand, ackResult);
        }
      } else if (ackCommand === 42006) {
        sendLog(mainWindow, 'info', `[CAL DIAG] COMMAND_ACK cmd=${ackCommand} (FIXED_MAG_CAL_YAW) result=${resultName}`);
        handleCalibrationCommandAck(ackCommand, ackResult);
      }
      break;
    }

    case 76: {
      // COMMAND_LONG (76) received FROM FC — ArduPilot sends ACCELCAL_VEHICLE_POS during 6-point calibration
      // Wire layout: param1-7(float32)@0-24, command(U16)@28, targetSystem(U8)@30, targetComponent(U8)@31, confirmation(U8)@32
      if (payload.length >= 30) {
        const incomingCommand = readUint16(payload, 28);
        const incomingParam1 = readFloat(payload, 0);
        sendLog(mainWindow, 'info', `[CAL DIAG] Incoming COMMAND_LONG cmd=${incomingCommand} param1=${incomingParam1} calActive=${isMavlinkCalibrationActive()}`);
        if (isMavlinkCalibrationActive()) {
          handleIncomingCommandLong(incomingCommand, incomingParam1);
        }
      } else {
        sendLog(mainWindow, 'warn', `[CAL DIAG] Incoming COMMAND_LONG too short: ${payload.length} bytes (need 30)`);
      }
      break;
    }

    case MSG_PARAM_VALUE: {
      // Deserialize parameter value
      const param = deserializeParamValue(payload);

      // PX4 transmits integer params bytewise: the param_value bytes hold the
      // raw typed integer bits, not a float. Reinterpret from the raw wire
      // bytes (not the already-decoded float, which is lossy for int bits)
      // before the value is cached or forwarded. ArduPilot keeps the float
      // (by-value) decoding from deserializeParamValue unchanged.
      if (connectionState.firmware === 'px4') {
        param.paramValue = decodePx4ParamValue(payload, param.paramType);
      }

      // Track received parameters
      receivedParams.set(param.paramId, param);
      expectedParamCount = param.paramCount;
      if (paramDownloadActive && param.paramIndex < 65535) {
        receivedParamIndices.add(param.paramIndex);
      }

      // Resolve any pending one-shot read for this paramId (PARAM_READ_BATCH).
      // Wrapped in try/catch because parseTelemetry runs inside a for-await
      // loop with no top-level error boundary — a thrown error here would
      // skip every subsequent packet in the same chunk, including the
      // COMMAND_ACK that completes a level/gyro calibration.
      try {
        const pendingRead = pendingParamReads.get(param.paramId);
        if (pendingRead) {
          pendingParamReads.delete(param.paramId);
          pendingRead(param.paramValue, param.paramType);
        }
      } catch (err) {
        console.error('[ipc-handlers] pending param read callback threw', err);
      }

      // Reset the stall timer on each received param during a bulk download.
      // In gap-fill mode a round that fills completely starts the next one at
      // link speed instead of idling out the round budget.
      if (paramDownloadActive) {
        paramRoundPending.delete(param.paramIndex);
        if (paramGapFillMode && !paramRecoveryInFlight && paramRoundPending.size === 0
            && receivedParams.size < param.paramCount) {
          if (paramDownloadTimeout) clearTimeout(paramDownloadTimeout);
          paramDownloadTimeout = null;
          setImmediate(() => void recoverParamDownload(mainWindow));
        } else {
          armParamInactivityTimer(mainWindow);
        }
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

      // Check if bulk download is complete (only during active download, not after individual PARAM_SET responses)
      if (paramDownloadActive && receivedParams.size >= param.paramCount) {
        paramDownloadActive = false;
        paramGapFillMode = false;
        paramRoundPending.clear();
        if (paramDownloadTimeout) {
          clearTimeout(paramDownloadTimeout);
          paramDownloadTimeout = null;
        }
        safeSend(mainWindow, IPC_CHANNELS.PARAM_COMPLETE);
        const elapsed = paramDownloadStartTime > 0 ? ((Date.now() - paramDownloadStartTime) / 1000).toFixed(1) : '?';
        sendLog(mainWindow, 'info', `Downloaded ${receivedParams.size} parameters via PARAM_REQUEST_LIST in ${elapsed}s`);
      }
      break;
    }

    // Mission messages - wrap in try-catch for payload size variations
    case MSG_MISSION_COUNT: {
      // Fence download uses the same message with mission_type=FENCE (offset 4 in
      // v2 size-sorted order: count(2), sys(1), comp(1), mission_type(1)).
      if ((payload.length >= 5 ? payload[4]! : 0) === MAV_MISSION_TYPE.FENCE && fenceDownloadState) {
        const count = payload[0]! | (payload[1]! << 8);
        fenceDownloadState.expected = count;
        if (count === 0) {
          safeSend(mainWindow, IPC_CHANNELS.FENCE_COMPLETE, []);
          if (fenceDownloadState.timeout) clearTimeout(fenceDownloadState.timeout);
          fenceDownloadState = null;
        } else {
          void requestMissionItem(mainWindow, 0, MAV_MISSION_TYPE.FENCE);
        }
        break;
      }

      // FC responded with mission count during download (shared with the
      // background-link handler so per-vehicle fleet downloads work too).
      handleMissionCountForDownload(mainWindow, payload);
      break;
    }

    case MSG_MISSION_ITEM:
    case MSG_MISSION_ITEM_INT: {
      // Fence items reuse this message with a trailing mission_type=FENCE byte
      // (offset 37 once the v2 extension is present).
      if ((payload.length >= 38 ? payload[37]! : 0) === MAV_MISSION_TYPE.FENCE && fenceDownloadState) {
        handleFenceItemReceived(mainWindow, msgid, payload);
        break;
      }

      // FC sent mission item during download (shared with the background-link
      // handler so per-vehicle fleet downloads work too).
      handleMissionItemForDownload(mainWindow, msgid, payload);
      break;
    }

    case MSG_MISSION_REQUEST:
    case MSG_MISSION_REQUEST_INT: {
      // mission_type at offset 4 (v2: seq(2), sys(1), comp(1), mission_type(1)).
      if ((payload.length >= 5 ? payload[4]! : 0) === MAV_MISSION_TYPE.FENCE || (fenceUploadState && !missionUploadState)) {
        handleFenceRequestForUpload(mainWindow, packet);
      } else {
        handleMissionRequestForUpload(mainWindow, packet);
      }
      break;
    }

    case MSG_MISSION_ACK: {
      // FC acknowledged operation
      try {
        // MAVLink v1: 3 bytes (target_system, target_component, type)
        // MAVLink v2: 4 bytes (adds mission_type)
        // type is at byte offset 2
        const ackType = payload.length >= 3 ? payload[2]! : 0;

        // Fence ACK: mission_type=FENCE at offset 3 (v2: sys, comp, type, mission_type).
        if ((payload.length >= 4 ? payload[3]! : 0) === MAV_MISSION_TYPE.FENCE) {
          if (ackType === MAV_MISSION_RESULT.ACCEPTED) {
            if (fenceUploadState) {
              const n = fenceUploadState.items.length;
              if (fenceUploadState.timeout) clearTimeout(fenceUploadState.timeout);
              fenceUploadState = null;
              safeSend(mainWindow, IPC_CHANNELS.FENCE_UPLOAD_COMPLETE, n);
              sendLog(mainWindow, 'info', `Uploaded ${n} fence items`);
            }
            if (fenceClearPending) {
              fenceClearPending = false;
              safeSend(mainWindow, IPC_CHANNELS.FENCE_CLEAR_COMPLETE);
              sendLog(mainWindow, 'info', 'Fence cleared from flight controller');
            }
          } else {
            if (fenceUploadState) {
              if (fenceUploadState.timeout) clearTimeout(fenceUploadState.timeout);
              fenceUploadState = null;
            }
            fenceClearPending = false;
            safeSend(mainWindow, IPC_CHANNELS.FENCE_ERROR, `Fence error: ${getMissionResultName(ackType)}`);
          }
          break;
        }

        if (ackType === MAV_MISSION_RESULT.ACCEPTED) {
          if (missionUploadState) {
            settleMissionUpload(mainWindow, true);
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
          sendLog(mainWindow, 'error', `Mission ACK error: ${errorMsg}`);

          if (missionUploadState) {
            // Routes the error to the per-vehicle callback, or emits the legacy
            // MISSION_ERROR event for a single-vehicle upload.
            settleMissionUpload(mainWindow, false, `Mission error: ${errorMsg}`);
          } else {
            safeSend(mainWindow, IPC_CHANNELS.MISSION_ERROR, `Mission error: ${errorMsg}`);
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
      // FC reports current waypoint. v2 zero-truncation: seq 0 arrives as an
      // EMPTY payload, so zero-pad instead of length-guarding (a guard here
      // silently ate the "back at waypoint 0" report).
      const p = padTo(payload, 2);
      const seq = p[0]! | (p[1]! << 8); // Little-endian uint16
      safeSend(mainWindow, IPC_CHANNELS.MISSION_CURRENT, seq);
      break;
    }

    case MSG_MISSION_ITEM_REACHED: {
      // FC reached a waypoint. Sole field is uint16 seq; for every waypoint
      // below 256 the high byte is zero and v2 truncation trims it, so the
      // packet arrives 1 byte long - zero-pad, never length-guard.
      try {
        const p = padTo(payload, 2);
        const seq = p[0]! | (p[1]! << 8);
        safeSend(mainWindow, IPC_CHANNELS.MISSION_REACHED, seq);
        sendLog(mainWindow, 'info', `Reached waypoint ${seq}`);
      } catch (err) {
        sendLog(mainWindow, 'error', 'Failed to parse MISSION_ITEM_REACHED', String(err));
      }
      break;
    }

    case MSG_FENCE_STATUS: {
      // FENCE_STATUS (162) - breach_status(1), breach_count(2), breach_type(1), breach_time(4)
      // Wire order (MAVLink v2 size-sorted): breach_time(4), breach_count(2), breach_status(1), breach_type(1)
      // All-zero "no breach" reports truncate to nothing under v2 - zero-pad.
      try {
        const p = padTo(payload, 8);
        const status: FenceStatus = {
          breachTime: readUint32(p, 0),
          breachCount: readUint16(p, 4),
          breachStatus: p[6]!,
          breachType: p[7]!,
        };
        safeSend(mainWindow, IPC_CHANNELS.FENCE_STATUS, status);
      } catch (err) {
        sendLog(mainWindow, 'error', 'Failed to parse FENCE_STATUS', String(err));
      }
      break;
    }

    case MSG_AUTOPILOT_VERSION: {
      // AUTOPILOT_VERSION (148) - extract board UID and board type
      // Wire order (v2 size-sorted): capabilities(8), uid(8), flight_sw_version(4),
      //   middleware_sw_version(4), os_sw_version(4), board_version(4), vendor_id(2),
      //   product_id(2), flight_custom_version(8), middleware_custom_version(8),
      //   os_custom_version(8), uid2(18)
      try {
        if (payload.length >= 60) {
          const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
          const uid = view.getBigUint64(8, true);

          // Extract board_version (offset 28, uint32 LE) — contains ArduPilot board type ID
          if (payload.length >= 32 && !connectionState.boardId) {
            const boardVersion = view.getUint32(28, true);
            if (boardVersion > 0) {
              const boardInfo = getBoardInfoFromVersion(boardVersion);
              if (boardInfo) {
                connectionState.boardId = boardInfo.name;
                sendConnectionState(mainWindow);
                sendLog(mainWindow, 'info', `Board type: ${boardInfo.name} (ID ${boardVersion})`);
              } else {
                sendLog(mainWindow, 'debug', `Unknown board type ID: ${boardVersion}`);
              }
            }
          }

          // Check uid2 (18 bytes at offset 60) - supersedes uid if non-zero
          let hasUid2 = false;
          if (payload.length >= 78) {
            for (let i = 60; i < 78; i++) {
              if (payload[i] !== 0) { hasUid2 = true; break; }
            }
          }

          let boardUid: string;
          if (hasUid2) {
            // uid2 as hex string
            boardUid = Array.from(payload.slice(60, 78)).map(b => b.toString(16).padStart(2, '0')).join('');
          } else if (uid !== 0n) {
            boardUid = uid.toString(16);
          } else {
            // No UID - use systemId fallback
            boardUid = `mavlink-${connectionState.systemId ?? 0}`;
          }

          if (!connectionState.boardUid) {
            connectionState.boardUid = boardUid;
            sendConnectionState(mainWindow);
            sendLog(mainWindow, 'info', `Board UID: ${boardUid}`);
          }

          // Decode and log firmware version
          // ArduPilot packs flight_sw_version as: major(8) | minor(8) | patch(8) | type(8)
          const flightSwVersion = view.getUint32(16, true);
          if (flightSwVersion > 0) {
            const major = (flightSwVersion >> 24) & 0xFF;
            const minor = (flightSwVersion >> 16) & 0xFF;
            const patch = (flightSwVersion >> 8) & 0xFF;
            const vType = flightSwVersion & 0xFF;
            const typeLabel = vType === 255 ? 'official' : vType >= 192 ? `rc${vType - 191}` : vType >= 128 ? `beta${vType - 127}` : vType >= 64 ? `alpha` : 'dev';
            sendLog(mainWindow, 'info', `Firmware: ${connectionState.vehicleType ?? 'ArduPilot'} v${major}.${minor}.${patch} (${typeLabel})`);
          }

          // Cache for bug report diagnostics
          cachedAutopilotVersion = {
            flight_sw_version: flightSwVersion,
            board_version: view.getUint32(28, true),
            capabilities: view.getUint32(0, true), // lower 32 bits of capabilities u64
          };
        }
      } catch (err) {
        sendLog(mainWindow, 'debug', 'Failed to parse AUTOPILOT_VERSION', String(err));
      }
      break;
    }

    case MSG_FILE_TRANSFER_PROTOCOL: {
      // FILE_TRANSFER_PROTOCOL (110) - route to FTP client
      // Payload: targetNetwork(1) + targetSystem(1) + targetComponent(1) + ftpPayload(251)
      // MAVLink v2 trims trailing zeros: a bare ACK (ResetSessions, TerminateSession)
      // arrives as ~9 bytes, so accept anything past the outer header and zero-pad.
      if (ftpClient && payload.length > 3) {
        // Zero-pad to 251 bytes for the FTP parser (v2 trimming removed trailing zeros)
        const ftpPayload = new Uint8Array(251);
        const ftpBytes = payload.subarray(3);
        ftpPayload.set(ftpBytes.subarray(0, Math.min(ftpBytes.length, 251)));
        ftpClient.handleResponse(ftpPayload);
      }
      break;
    }

    case MSG_LOG_ENTRY:
    case MSG_LOG_DATA:
    case MSG_STORAGE_INFORMATION: {
      if (logDownloadManager) {
        logDownloadManager.handleMessage(msgid, payload);
      }
      break;
    }
  }
}

/**
 * Inactivity window before the bulk param stream counts as stalled. Low-baud
 * serial links (SiK radios at 57600) get a much longer window: ArduPilot
 * throttles param streaming to a fraction of link bandwidth, so multi-second
 * gaps between PARAM_VALUEs are normal there, not a failure.
 */
function paramInactivityTimeoutMs(link: { type?: string; baudRate?: number } | null): number {
  if (link?.type === 'serial') {
    const baud = link.baudRate ?? 115200;
    if (baud <= 57600) return 30000;
    if (baud <= 115200) return 15000;
  }
  return 10000;
}

/**
 * Missing indices starting from `cursor`, wrapping once. Scanning from 0 every
 * round means an index the FC never returns pins the window to the same first
 * `limit` gaps forever; the cursor walks past it instead.
 */
function missingParamIndices(expected: number, seen: ReadonlySet<number>, limit: number, cursor: number): number[] {
  const missing: number[] = [];
  const start = expected > 0 ? cursor % expected : 0;
  for (let n = 0; n < expected && missing.length < limit; n++) {
    const i = (start + n) % expected;
    if (!seen.has(i)) missing.push(i);
  }
  return missing;
}

/**
 * Per-round budget for gap-fill reads. Unlike the initial stall window this
 * only has to cover one request/response round trip, so it stays short even on
 * slow radios; rounds that fill early are kicked off by the PARAM_VALUE handler.
 */
function paramGapRoundTimeoutMs(link: { type?: string; baudRate?: number } | null): number {
  if (link?.type === 'serial' && (link.baudRate ?? 115200) <= 57600) return 5000;
  return 2500;
}

function armParamInactivityTimer(mainWindow: BrowserWindow): void {
  if (paramDownloadTimeout) clearTimeout(paramDownloadTimeout);
  paramDownloadTimeout = setTimeout(() => {
    void recoverParamDownload(mainWindow);
  }, paramGapFillMode ? paramGapRoundMs : paramInactivityMs);
}

/**
 * The bulk param stream went quiet before completing. Instead of failing
 * outright (the old behavior, which fired a scary PARAM_ERROR while the
 * download was often still alive on slow links), try to recover:
 * - nothing received at all -> the PARAM_REQUEST_LIST itself was probably
 *   lost, re-send it (up to PARAM_LIST_MAX_RETRIES times)
 * - stalled mid-stream -> re-request the missing indices directly via
 *   PARAM_REQUEST_READ (lossy SiK links drop PARAM_VALUEs, and ArduPilot
 *   never re-sends them on its own)
 * Only gives up after PARAM_MAX_STALLED_ROUNDS consecutive rounds with zero
 * new params.
 */
async function recoverParamDownload(mainWindow: BrowserWindow): Promise<void> {
  paramDownloadTimeout = null;
  if (!paramDownloadActive) return;
  if (paramRecoveryInFlight) {
    // A round is still going out; let it finish and re-arm rather than overlapping.
    armParamInactivityTimer(mainWindow);
    return;
  }
  if (!currentTransport?.isOpen || !connectionState.isConnected) {
    paramDownloadActive = false;
    paramGapFillMode = false;
    return;
  }

  const targetSystem = connectionState.systemId ?? 1;
  const targetComponent = 1;

  if (expectedParamCount === 0) {
    if (paramListRetries >= PARAM_LIST_MAX_RETRIES) {
      paramDownloadActive = false;
      safeSend(mainWindow, IPC_CHANNELS.PARAM_ERROR,
        `Timeout: no parameters received after ${PARAM_LIST_MAX_RETRIES + 1} requests`);
      return;
    }
    paramListRetries++;
    sendLog(mainWindow, 'warn',
      `No parameters received yet, re-sending PARAM_REQUEST_LIST (attempt ${paramListRetries + 1}/${PARAM_LIST_MAX_RETRIES + 1})`);
    try {
      const payload = serializeParamRequestList({ targetSystem, targetComponent });
      const packet = await sendMavlinkPacket(PARAM_REQUEST_LIST_ID, payload, PARAM_REQUEST_LIST_CRC_EXTRA);
      await currentTransport.write(packet);
      connectionState.packetsSent++;
    } catch {
      // Send failed; the re-armed timer below retries next round.
    }
    armParamInactivityTimer(mainWindow);
    return;
  }

  if (receivedParamIndices.size <= paramProgressAtLastStall) {
    paramStalledRounds++;
  } else {
    paramStalledRounds = 0;
  }
  paramProgressAtLastStall = receivedParamIndices.size;

  if (paramStalledRounds >= PARAM_MAX_STALLED_ROUNDS) {
    paramDownloadActive = false;
    paramGapFillMode = false;
    safeSend(mainWindow, IPC_CHANNELS.PARAM_ERROR,
      `Timeout: received ${receivedParams.size}/${expectedParamCount} parameters`);
    return;
  }

  const missing = missingParamIndices(expectedParamCount, receivedParamIndices, paramGapChunk, paramGapCursor);
  if (missing.length === 0) {
    // Every index arrived but the by-name map is smaller (duplicate ids).
    // Nothing left to fetch; call it complete.
    paramDownloadActive = false;
    paramGapFillMode = false;
    safeSend(mainWindow, IPC_CHANNELS.PARAM_COMPLETE);
    return;
  }

  paramGapCursor = (missing[missing.length - 1]! + 1) % Math.max(expectedParamCount, 1);
  if (!paramGapFillMode) {
    paramGapFillMode = true;
    sendLog(mainWindow, 'info',
      `Parameter stream stalled at ${receivedParamIndices.size}/${expectedParamCount}, filling gaps by direct read`);
  }

  paramRoundPending.clear();
  for (const paramIndex of missing) paramRoundPending.add(paramIndex);
  // Arm before sending: a fast link can answer the first read while the rest are
  // still being written, and that handler needs a timer it can cancel.
  armParamInactivityTimer(mainWindow);

  paramRecoveryInFlight = true;
  try {
    for (const paramIndex of missing) {
      const payload = serializeParamRequestRead({ targetSystem, targetComponent, paramId: '', paramIndex });
      const packet = await sendMavlinkPacket(PARAM_REQUEST_READ_ID, payload, PARAM_REQUEST_READ_CRC_EXTRA);
      await currentTransport.write(packet);
      connectionState.packetsSent++;
      // Blasting a whole round back to back overruns a SiK radio's uplink buffer.
      if (paramGapSendGapMs > 0) await new Promise((r) => setTimeout(r, paramGapSendGapMs));
    }
  } catch {
    // Send failed; the armed timer retries next round.
  } finally {
    paramRecoveryInFlight = false;
  }
}

// Helper: Request a mission item from FC
async function requestMissionItem(mainWindow: BrowserWindow, seq: number, missionType: number = MAV_MISSION_TYPE.MISSION): Promise<void> {
  // A per-vehicle mission download targets that vehicle's transport+sysid; fence
  // downloads and legacy single-vehicle downloads stay on the primary connection.
  const dlTarget = missionType === MAV_MISSION_TYPE.MISSION ? missionDownloadState?.target : undefined;
  const transport = dlTarget?.transport ?? currentTransport;
  if (!transport?.isOpen) return;
  if (!dlTarget && !connectionState.isConnected) return;

  let packet: Uint8Array;
  const targetSystem = dlTarget?.sysid ?? connectionState.systemId ?? 1;

  if (detectedMavlinkVersion === 2) {
    // MAVLink v2: Use MISSION_REQUEST_INT (preferred, higher precision)
    const payload = serializeMissionRequestInt({
      targetSystem,
      targetComponent: 1,
      seq,
      missionType,
    });
    packet = await sendMavlinkPacket(MISSION_REQUEST_INT_ID, payload, MISSION_REQUEST_INT_CRC_EXTRA, { link: transport });
  } else {
    // MAVLink v1 packet but use v2 byte order (size-sorted) for payload!
    // ArduPilot uses v2 byte order internally regardless of packet format.
    // v2 order: seq(2), target_system(1), target_component(1) - no mission_type for v1
    // v1 path: manual payload without mission_type extension
    const payload = new Uint8Array(4);
    payload[0] = seq & 0xff;              // seq low byte
    payload[1] = (seq >> 8) & 0xff;       // seq high byte
    payload[2] = targetSystem & 0xff;     // target_system
    payload[3] = 1;                       // target_component
    packet = serializeV1(MISSION_REQUEST_ID, payload, MISSION_REQUEST_CRC_EXTRA_V1, { sysid: gcsSysid, compid: 190, sequence: nextTxSeq(transport) });
  }

  sendLog(mainWindow, 'debug', `Requesting mission item ${seq} (MAVLink v${detectedMavlinkVersion})`);

  transport.write(packet).catch(err => {
    sendLog(mainWindow, 'error', `Failed to request mission item ${seq}`, String(err));
  });
}

// Helper: Send a mission item to FC
async function sendMissionItem(mainWindow: BrowserWindow, item: MissionItem): Promise<void> {
  // Honor a per-vehicle upload target (survey / multi-vehicle); fall back to the
  // legacy primary connection for single-vehicle uploads.
  const override = missionUploadState?.target;
  const transport = override?.transport ?? currentTransport;
  // A per-vehicle upload (fleet / orchestrator) carries its own open transport, and
  // in pure multi-vehicle mode the primary connectionState is idle (isConnected
  // false) - so gating on it here silently dropped every MISSION_ITEM and the
  // upload timed out with "FC stopped requesting items". Only require the primary
  // connection for legacy single-vehicle uploads (no override target).
  if (!transport?.isOpen) return;
  if (!override && !connectionState.isConnected) return;

  let packet: Uint8Array;
  const targetSystem = override?.sysid ?? connectionState.systemId ?? 1;

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
    packet = await sendMavlinkPacket(MISSION_ITEM_INT_ID, payload, MISSION_ITEM_INT_CRC_EXTRA, { link: transport });
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
    // v1 path: manual payload without mission_type extension
    const payload = fullPayload.slice(0, 37);
    packet = serializeV1(MISSION_ITEM_ID, payload, MISSION_ITEM_CRC_EXTRA_V1, { sysid: gcsSysid, compid: 190, sequence: nextTxSeq(transport) });
  }

  sendLog(mainWindow, 'debug', `Sending mission item ${item.seq} (MAVLink v${detectedMavlinkVersion})`);

  transport.write(packet).catch(err => {
    sendLog(mainWindow, 'error', `Failed to send mission item ${item.seq}`, String(err));
  });
}

// Helper: Send mission ACK
async function sendMissionAck(mainWindow: BrowserWindow, result: number, missionType: number = MAV_MISSION_TYPE.MISSION): Promise<void> {
  // Honor the per-vehicle mission-download target so the closing ACK reaches the
  // fleet vehicle we downloaded from (not the idle primary).
  const dlTarget = missionType === MAV_MISSION_TYPE.MISSION ? missionDownloadState?.target : undefined;
  const transport = dlTarget?.transport ?? currentTransport;
  if (!transport?.isOpen) return;
  if (!dlTarget && !connectionState.isConnected) return;

  let packet: Uint8Array;
  const targetSystem = dlTarget?.sysid ?? connectionState.systemId ?? 1;

  if (detectedMavlinkVersion === 2) {
    const payload = serializeMissionAck({
      targetSystem,
      targetComponent: 1,
      type: result,
      missionType,
    });
    packet = await sendMavlinkPacket(MISSION_ACK_ID, payload, MISSION_ACK_CRC_EXTRA, { link: transport });
  } else {
    // MAVLink v1: 3 bytes (no mission_type)
    // v1 path: manual payload without mission_type extension
    const payload = new Uint8Array(3);
    payload[0] = targetSystem & 0xff;
    payload[1] = 1; // target_component
    payload[2] = result & 0xff;
    packet = serializeV1(MISSION_ACK_ID, payload, MISSION_ACK_CRC_EXTRA_V1, { sysid: gcsSysid, compid: 190, sequence: nextTxSeq(transport) });
  }

  transport.write(packet).catch(err => {
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
  // Auto-load signing key now that app is ready (safeStorage requires app.whenReady)
  autoLoadSigningKey();

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
    }
  };

  ipcMain.handle(IPC_CHANNELS.COMMS_START_PORT_WATCH, async (): Promise<void> => {
    // Don't start if already connected - no need to watch for new ports
    if (currentTransport) {
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
          safeSend(mainWindow, IPC_CHANNELS.COMMS_NEW_PORT, { newPorts, removedPorts: [] });
        }

        if (removedPorts.length > 0) {
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
  });

  ipcMain.handle(IPC_CHANNELS.COMMS_STOP_PORT_WATCH, async (): Promise<void> => {
    stopPortWatcher();
  });

  // ==================== MULTI-VEHICLE REGISTRY ====================
  // Read-only projections of the ConnectionRegistry plus active-vehicle
  // selection. Single-vehicle flows do not call these; they exist for the
  // fleet/vehicle-selector UI.

  ipcMain.handle(IPC_CHANNELS.COMMS_LIST_TRANSPORTS, async (): Promise<TransportInfoIpc[]> => {
    return connectionRegistry.listTransports().map(toTransportInfoIpc);
  });

  ipcMain.handle(IPC_CHANNELS.COMMS_LIST_VEHICLES, async (): Promise<VehicleInfoIpc[]> => {
    return connectionRegistry.listVehicles().map(toVehicleInfoIpc);
  });

  ipcMain.handle(IPC_CHANNELS.COMMS_SET_ACTIVE, async (_, payload: SetActiveSelectionPayload): Promise<void> => {
    // Best-effort: a stale selection (vehicle/transport already gone) must not throw
    // back to the renderer. The renderer's local active pointer is authoritative for
    // the view; this just keeps the main-process command target in sync when valid.
    try {
      connectionRegistry.setActive(payload.transportId, payload.vehicleKey ?? null);
    } catch (err) {
      sendLog(mainWindow, 'warn', 'Ignored stale active-vehicle selection', err instanceof Error ? err.message : String(err));
      // Loud, not just logged: a swallowed selection failure means every map/flight
      // command keeps targeting the PREVIOUS vehicle, which reads as "commands
      // stopped working" while the UI highlights the newly clicked one.
      safeSend(mainWindow, IPC_CHANNELS.MAVLINK_STATUSTEXT, {
        severity: 4,
        severityLabel: 'WARNING',
        text: `Vehicle selection failed to sync (${payload.vehicleKey ?? 'none'}) - commands still target the previous vehicle`,
      });
    }
    // Broadcast to every window so other views (the 3D world pop-out) follow the
    // same active vehicle. The initiating window's local pointer already matches,
    // so applying this is idempotent there.
    safeSend(mainWindow, IPC_CHANNELS.COMMS_ACTIVE_CHANGED, { transportId: payload.transportId, vehicleKey: payload.vehicleKey ?? null });
  });

  // Fleet formations are renderer-only state; main caches the latest map and relays
  // it to every window so the fleet strip and the 3D world pop-out show the same
  // groups. The initiating window applies its own broadcast idempotently (guarded
  // from re-emit); a window opening later hydrates the cache via COMMS_GET_FORMATIONS.
  let lastFormations: Record<string, string[]> = {};
  ipcMain.handle(IPC_CHANNELS.COMMS_SET_FORMATIONS, async (_, formations: Record<string, string[]>): Promise<void> => {
    lastFormations = formations ?? {};
    safeSend(mainWindow, IPC_CHANNELS.COMMS_FORMATIONS_CHANGED, lastFormations);
  });
  ipcMain.handle(IPC_CHANNELS.COMMS_GET_FORMATIONS, async (): Promise<Record<string, string[]>> => lastFormations);

  /** Close a background transport: notify of vehicle loss, then unregister. */
  const removeBackgroundTransport = async (transportId: TransportId): Promise<void> => {
    const entry = connectionRegistry.getTransport(transportId);
    if (!entry) return;
    for (const vehicle of entry.vehicles.values()) {
      safeSend(mainWindow, IPC_CHANNELS.COMMS_VEHICLE_LOST, vehicle.key);
    }
    try {
      if (entry.transport.isOpen) await entry.transport.close();
    } catch {
      // Best-effort close; we unregister regardless.
    }
    connectionRegistry.unregister(transportId);
  };

  ipcMain.handle(IPC_CHANNELS.COMMS_ADD_TRANSPORT, async (_, options: ConnectOptions): Promise<string> => {
    // The registry is MAVLink-only; MSP is mutually exclusive (single, legacy).
    if (connectionState.protocol === 'msp') {
      throw new Error('Cannot add background transports while connected via MSP');
    }
    const transport = buildBackgroundTransport(options);
    const parser = new MAVLinkParser();
    parser.registerMessages(getAllMessageInfos());
    const transportId = connectionRegistry.register(transport, parser, options);

    const dataHandler = createBackgroundDiscoveryHandler(transportId, mainWindow);
    transport.on('data', dataHandler);
    transport.on('error', (err: Error) => {
      connectionRegistry.recordTransportError(transportId, err.message);
    });
    transport.on('close', () => {
      void removeBackgroundTransport(transportId);
    });

    await transport.open();
    return transportId;
  });

  ipcMain.handle(IPC_CHANNELS.COMMS_REMOVE_TRANSPORT, async (_, transportId: string): Promise<void> => {
    if (transportId === primaryTransportId) {
      throw new Error('Cannot remove the primary transport; use disconnect');
    }
    await removeBackgroundTransport(transportId);
  });

  // The single active orchestration link, so fleet-log IPC can drive it (request lists,
  // fetch logs). One link at a time (engine or manual server).
  let activeOrchestrationLink: OrchestrationServerLink | null = null;
  // jobId -> {virtualSysid, logId} for naming the ingested artifact.
  const fleetLogJobs = new Map<string, { virtualSysid: number; logId: number }>();

  /**
   * A fetched fleet log arrived in full. Persist the .bin to disk, parse it, and record a
   * flight summary into the fleet history - the same roll-up the Log List feeds. Best
   * effort; a parse failure must not crash the link.
   */
  async function ingestFleetLogArtifact(jobId: string, bytes: Buffer): Promise<void> {
    try {
      const meta = fleetLogJobs.get(jobId);
      fleetLogJobs.delete(jobId);
      const { app } = await import('electron');
      const path = await import('path');
      const fs = await import('fs/promises');
      const dir = path.join(app.getPath('userData'), 'fleet-logs');
      await fs.mkdir(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const label = meta ? `sys${meta.virtualSysid}-log${meta.logId}` : jobId;
      const filePath = path.join(dir, `fleet-${label}-${stamp}.bin`);
      await fs.writeFile(filePath, bytes);

      const parser = createDataFlashParser();
      parser.feed(new Uint8Array(bytes));
      const log = parser.finalize();
      const healthResults = runHealthChecks(log);
      const summary = extractFlightSummary({
        log: log as unknown as LogLike,
        health: healthResults as unknown as HealthLike[],
        path: filePath,
        fileName: path.basename(filePath),
        fileMtimeMs: Date.now(),
        flightId: jobId,
      });
      recordFlight(summary);
      safeSend(mainWindow, IPC_CHANNELS.FLEET_LOG_JOB_EVENT, {
        type: 'log.ingested', id: jobId, vehicleKey: summary.vehicleKey, fileName: summary.fileName,
      });
    } catch (err) {
      console.warn('[fleet-log] failed to ingest fetched log:', err);
      safeSend(mainWindow, IPC_CHANNELS.FLEET_LOG_JOB_EVENT, {
        type: 'log.job', id: jobId, state: 'failed', message: 'parse/ingest failed',
      });
    }
  }

  // Connect to an orchestration server. Registers as a background transport so
  // its MAVLink-passthrough vehicles are demuxed and surfaced in the fleet just
  // like any other link. Coordination intents go over the same link's control
  // channel (OrchestrationServerLink.submitIntent); intent UX is future work.
  // Build + open an OrchestrationServerLink and register it as a background transport so
  // its passthrough vehicles surface in the fleet. Shared by the manual "Server" source and
  // the auto-connect when the local orchestrator engine comes up.
  async function connectOrchestrationLink(url: string, token?: string, onClose?: () => void): Promise<string> {
    if (connectionState.protocol === 'msp') {
      throw new Error('Cannot add an orchestration link while connected via MSP');
    }
    const link = new OrchestrationServerLink(url, token);
    const parser = new MAVLinkParser();
    parser.registerMessages(getAllMessageInfos());
    const transportId = connectionRegistry.register(link, parser, { type: 'tcp', host: url });

    const dataHandler = createBackgroundDiscoveryHandler(transportId, mainWindow);
    link.on('data', dataHandler);
    link.on('error', (err: Error) => connectionRegistry.recordTransportError(transportId, err.message));
    link.on('close', () => { void removeBackgroundTransport(transportId); onClose?.(); });
    link.onWelcome((info) => {
      safeSend(mainWindow, IPC_CHANNELS.COMMS_ORCHESTRATION_STATUS, {
        transportId, kind: 'welcome', serverName: info.serverName, serverVersion: info.serverVersion, capabilities: info.capabilities,
      } satisfies OrchestrationStatusIpc);
    });
    link.onControl((msg) => {
      safeSend(mainWindow, IPC_CHANNELS.COMMS_ORCHESTRATION_STATUS, {
        transportId, kind: 'control', control: msg as OrchestrationStatusIpc['control'],
      } satisfies OrchestrationStatusIpc);
    });
    link.onRoster((vehicles) => {
      safeSend(mainWindow, IPC_CHANNELS.COMMS_ORCHESTRATION_STATUS, {
        transportId, kind: 'roster', roster: vehicles,
      } satisfies OrchestrationStatusIpc);
    });
    // Fleet log fetch: forward job events to the renderer, and on a completed artifact
    // parse + record it into the fleet history (the same pipeline as opening a file).
    link.onLogEvent((msg) => {
      safeSend(mainWindow, IPC_CHANNELS.FLEET_LOG_JOB_EVENT, msg);
    });
    link.onLogArtifact(({ jobId, bytes }) => {
      void ingestFleetLogArtifact(jobId, bytes);
    });
    // NTRIP status from the engine's fleet-wide client, relayed to the same
    // renderer channel the local client uses (one unified RTK panel).
    link.onNtripStatus((status) => pushOrchestratorNtripStatus(status));

    // Expose this link so the renderer's fleet-log IPC can drive it. There is one
    // orchestration link at a time (engine or manual server), so a single ref suffices.
    activeOrchestrationLink = link;
    const clearRef = () => {
      if (activeOrchestrationLink === link) {
        activeOrchestrationLink = null;
        setNtripOrchestrator(null);
      }
    };
    link.on('close', clearRef);

    await link.open();
    // Hand NTRIP ownership to the engine: it injects corrections fleet-wide,
    // and exactly one injector may own RTCM per vehicle.
    setNtripOrchestrator({
      connect: (cfg, pw) => link.ntripConnect(cfg, pw),
      disconnect: () => link.ntripDisconnect(),
      requestStatus: () => link.ntripRequestStatus(),
      fetchSourcetable: (cfg, pw) => link.ntripFetchSourcetable(cfg, pw),
    });
    return transportId;
  }

  ipcMain.handle(IPC_CHANNELS.COMMS_ADD_ORCHESTRATION_LINK, async (_, url: string, token?: string): Promise<string> => {
    return connectOrchestrationLink(url, token);
  });

  // ── Fleet log fetch over the orchestrator ───────────────────────────────────
  // The desktop addresses fleet vehicles by the virtual sysid it sees on the
  // passthrough channel; the orchestrator maps it to the real link + runs the job.
  ipcMain.handle(IPC_CHANNELS.FLEET_LOG_LIST_REQUEST, async (_, virtualSysid: number): Promise<{ ok: boolean; id?: string; error?: string }> => {
    if (!activeOrchestrationLink) return { ok: false, error: 'No orchestrator connected' };
    const id = activeOrchestrationLink.requestLogList(virtualSysid);
    return { ok: true, id };
  });

  ipcMain.handle(IPC_CHANNELS.FLEET_LOG_FETCH, async (_, virtualSysid: number, logId: number): Promise<{ ok: boolean; id?: string; error?: string }> => {
    if (!activeOrchestrationLink) return { ok: false, error: 'No orchestrator connected' };
    const id = activeOrchestrationLink.fetchLog(virtualSysid, logId);
    fleetLogJobs.set(id, { virtualSysid, logId });
    return { ok: true, id };
  });

  ipcMain.handle(IPC_CHANNELS.FLEET_LOG_FETCH_CANCEL, async (_, virtualSysid: number): Promise<void> => {
    activeOrchestrationLink?.cancelLogFetch(virtualSysid);
  });

  // ── Local orchestrator engine (the invisible multi-vehicle engine) ──────────
  // Track the auto-connected orchestration link so STOP can tear it down too.
  let orchestratorLinkId: string | null = null;

  const connectToEngine = async (wsUrl: string): Promise<void> => {
    if (orchestratorLinkId) {
      await removeBackgroundTransport(orchestratorLinkId).catch(() => {});
      orchestratorLinkId = null;
    }
    try {
      // Reconnect if the engine link drops while the engine is still running
      // (engine restart, transient WS hiccup). Without this the desktop keeps a
      // dead link and every command writes to a closed socket - "no reaction" -
      // while telemetry quietly stops. Guarded by isRunning so an intentional
      // STOP doesn't trigger a reconnect storm.
      orchestratorLinkId = await connectOrchestrationLink(wsUrl, undefined, () => {
        orchestratorLinkId = null;
        if (orchestratorProcess.isRunning) {
          setTimeout(() => {
            if (orchestratorProcess.isRunning && !orchestratorLinkId) {
              sendLog(mainWindow, 'info', '[engine] link dropped; reconnecting to engine');
              void connectToEngine(wsUrl);
            }
          }, 1000);
        }
      });
    } catch (err) {
      console.error('[Orchestrator] auto-connect failed:', err);
      // Engine is up but the connect failed (e.g. race on spawn): retry shortly.
      if (orchestratorProcess.isRunning) {
        setTimeout(() => { if (orchestratorProcess.isRunning && !orchestratorLinkId) void connectToEngine(wsUrl); }, 1000);
      }
    }
  };

  ipcMain.handle(IPC_CHANNELS.ORCHESTRATOR_START, async (_, sources?: OrchestratorSource[]): Promise<OrchestratorStatus> => {
    const result = await orchestratorProcess.start(sources);
    if (result.success) await connectToEngine(result.wsUrl);
    return orchestratorProcess.getStatus();
  });

  ipcMain.handle(IPC_CHANNELS.ORCHESTRATOR_STOP, async (): Promise<OrchestratorStatus> => {
    if (orchestratorLinkId) {
      await removeBackgroundTransport(orchestratorLinkId).catch(() => {});
      orchestratorLinkId = null;
    }
    orchestratorProcess.stop();
    return orchestratorProcess.getStatus();
  });

  ipcMain.handle(IPC_CHANNELS.ORCHESTRATOR_STATUS, async (): Promise<OrchestratorStatus> => {
    return orchestratorProcess.getStatus();
  });

  ipcMain.handle(IPC_CHANNELS.ORCHESTRATOR_SET_SOURCES, async (_, sources: OrchestratorSource[]): Promise<OrchestratorStatus> => {
    const wasRunning = orchestratorProcess.isRunning;
    const result = await orchestratorProcess.setSources(sources);
    // A restart drops the WS; reconnect the desktop to the fresh engine.
    if (wasRunning && result.success) await connectToEngine(result.wsUrl);
    return orchestratorProcess.getStatus();
  });

  // Submit a group intent to an orchestration link. The server executes the
  // coordination; status streams back via COMMS_ORCHESTRATION_STATUS.
  ipcMain.handle(IPC_CHANNELS.COMMS_SUBMIT_INTENT, async (_, transportId: string, intent: OrchestrationIntentIpc): Promise<string | null> => {
    const entry = connectionRegistry.getTransport(transportId);
    if (entry && entry.transport instanceof OrchestrationServerLink) {
      return entry.transport.submitIntent(intent);
    }
    return null;
  });

  // Send a command to a specific vehicle (used by group commands and survey).
  // Routes to the vehicle's own transport + sysid via the registry.
  ipcMain.handle(IPC_CHANNELS.MAVLINK_VEHICLE_COMMAND, async (_, vehicleKey: string, cmd: VehicleCommand): Promise<boolean> => {
    try {
      switch (cmd.kind) {
        case 'arm':
          return await sendCommandLongToVehicle(vehicleKey, 400, { param1: 1, param2: cmd.force ? 21196 : 0 });
        case 'disarm':
          return await sendCommandLongToVehicle(vehicleKey, 400, { param1: 0, param2: cmd.force ? 21196 : 0 });
        case 'rtl':
          // MAV_CMD_NAV_RETURN_TO_LAUNCH (20) - vehicle-type agnostic, no mode-number lookup needed.
          return await sendCommandLongToVehicle(vehicleKey, 20, {});
        case 'takeoff':
          return await sendCommandLongToVehicle(vehicleKey, 22, { param7: cmd.altitude });
        case 'setmode': {
          const armedBit = lastReportedArmed ? 128 : 0;
          return await sendCommandLongToVehicle(vehicleKey, 176, { param1: 1 | armedBit, param2: cmd.customMode });
        }
        case 'mission-start': {
          // A mission only runs in AUTO - copter/rover won't start one from MISSION_START
          // alone. Switch the vehicle to AUTO (mode number by family) first, then send
          // MAV_CMD_MISSION_START. Needs the vehicle armed with a mission already uploaded.
          const veh = connectionRegistry.getVehicleByKey(vehicleKey);
          const mt = veh?.mavType ?? 0;
          const copterOrSub = [2, 3, 4, 12, 13, 14, 15, 29].includes(mt); // multirotor/heli + sub
          const autoMode = copterOrSub ? 3 : 10;
          await sendCommandLongToVehicle(vehicleKey, 176, { param1: 1, param2: autoMode });
          await new Promise((r) => setTimeout(r, 300));
          return await sendCommandLongToVehicle(vehicleKey, 300, {});
        }
        default:
          return false;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', `Vehicle command failed (${cmd.kind})`, message);
      return false;
    }
  });

  // ==================== Camera / video ====================
  ipcMain.handle(IPC_CHANNELS.CAMERA_START, async (_, source: CameraSourceConfig, resolvedUrl?: string) => {
    return mediaEngine.start(source, resolvedUrl);
  });
  ipcMain.handle(IPC_CHANNELS.CAMERA_STOP, async (_, sourceId: string) => {
    await mediaEngine.stop(sourceId);
  });
  ipcMain.handle(IPC_CHANNELS.CAMERA_SNAPSHOT, async (_, sourceId: string) => {
    return mediaEngine.snapshot(sourceId);
  });
  ipcMain.handle(IPC_CHANNELS.CAMERA_RECORD_TOGGLE, async (_, sourceId: string) => {
    return mediaEngine.toggleRecord(sourceId);
  });
  ipcMain.handle(IPC_CHANNELS.CAMERA_ENGINE_STATUS, async () => {
    return mediaEngine.getStatus();
  });
  ipcMain.handle(IPC_CHANNELS.CAMERA_ENGINE_INSTALL, async () => {
    return mediaEngine.downloadBinaries((line) => safeSend(mainWindow, IPC_CHANNELS.CAMERA_ENGINE_INSTALL_LOG, line));
  });

  ipcMain.handle(IPC_CHANNELS.CAMERA_GIMBAL_COMMAND, async (_, vehicleKey: string, cmd: GimbalCommand): Promise<boolean> => {
    try {
      switch (cmd.kind) {
        case 'pitchyaw': {
          const deviceId = cmd.deviceId ?? 0;
          if (cmd.via === 'mount') {
            // Legacy/alt mounts driven via MAV_CMD_DO_MOUNT_CONTROL (205) with
            // absolute angle targeting: param1=pitch, param2=roll, param3=yaw,
            // param7=mode (2 = MAV_MOUNT_MODE_MAVLINK_TARGETING). No rate mode.
            return await sendCommandLongToVehicle(vehicleKey, 205, {
              param1: cmd.pitchDeg, param2: 0, param3: cmd.yawDeg, param7: 2,
            });
          }
          // MAV_CMD_DO_GIMBAL_MANAGER_PITCHYAW (1000). Absolute angles go in
          // param1/2; rates go in param3/4 with the angle params NaN. param7 =
          // gimbal device id (0 = all). param5 = manager flags (0 = default).
          if (cmd.rate) {
            return await sendCommandLongToVehicle(vehicleKey, 1000, {
              param1: NaN, param2: NaN, param3: cmd.pitchDeg, param4: cmd.yawDeg, param5: 0, param7: deviceId,
            });
          }
          return await sendCommandLongToVehicle(vehicleKey, 1000, {
            param1: cmd.pitchDeg, param2: cmd.yawDeg, param3: NaN, param4: NaN, param5: 0, param7: deviceId,
          });
        }
        case 'point-roi': {
          // MAV_CMD_DO_SET_ROI_LOCATION (195) as COMMAND_INT so lat/lon keep
          // full degE7 precision (a float COMMAND_LONG would lose ~metres).
          const target = resolveVehicleTarget(vehicleKey);
          if (!target) return false;
          const payload = serializeCommandInt({
            targetSystem: target.sysid,
            targetComponent: 1,
            frame: 0,        // MAV_FRAME_GLOBAL — z is AMSL metres
            command: 195,
            current: 0,
            autocontinue: 0,
            param1: cmd.deviceId ?? 0,  // gimbal device id (0 = all)
            param2: 0, param3: 0, param4: 0,
            x: Math.round(cmd.lat * 1e7),
            y: Math.round(cmd.lon * 1e7),
            z: cmd.alt,
          });
          const packet = await sendMavlinkPacket(COMMAND_INT_ID, payload, COMMAND_INT_CRC_EXTRA, { link: target.transport });
          await target.transport.write(packet);
          connectionState.packetsSent++;
          return true;
        }
        case 'roi-none':
          // MAV_CMD_DO_SET_ROI_NONE (197) — release the ROI lock.
          return await sendCommandLongToVehicle(vehicleKey, 197, {});
        case 'retract':
          // MAV_CMD_DO_MOUNT_CONTROL (205), MAV_MOUNT_MODE_RETRACT (0) in param7.
          return await sendCommandLongToVehicle(vehicleKey, 205, { param7: 0 });
        case 'center':
          // DO_MOUNT_CONTROL, MAV_MOUNT_MODE_NEUTRAL (1).
          return await sendCommandLongToVehicle(vehicleKey, 205, { param7: 1 });
        default:
          return false;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', `Gimbal command failed (${cmd.kind})`, message);
      return false;
    }
  });

  ipcMain.handle(IPC_CHANNELS.CAMERA_CAMERA_COMMAND, async (_, vehicleKey: string, cmd: CameraCommand): Promise<boolean> => {
    try {
      if (cmd.kind === 'zoom') {
        // MAV_CMD_SET_CAMERA_ZOOM (531). param1 = ZOOM_TYPE (1 continuous, 2 range).
        return await sendCommandLongToVehicle(vehicleKey, 531, {
          param1: cmd.mode === 'range' ? 2 : 1, param2: cmd.value,
        });
      }
      // MAV_CMD_SET_CAMERA_FOCUS (532), same param convention.
      return await sendCommandLongToVehicle(vehicleKey, 532, {
        param1: cmd.mode === 'range' ? 2 : 1, param2: cmd.value,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', `Camera command failed (${cmd.kind})`, message);
      return false;
    }
  });

  // ==================== AUTO-RECONNECT LOGIC ====================
  // Handles automatic reconnection after expected reboots (EEPROM save, CLI save, etc.)

  /**
   * Check if auto-reconnect is pending
   */
  const isReconnectPending = (): boolean => pendingReconnect !== null;

  /**
   * Cancel reconnection and return to disconnected state
   */
  const cancelReconnect = (reason: string): void => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    pendingReconnect = null;
    resetMavlinkDiagCache();
    connectionState = {
      isConnected: false,
      isReconnecting: false,
      packetsReceived: 0,
      packetsSent: 0,
    };
    sendConnectionState(mainWindow);
    sendLog(mainWindow, 'warn', 'Reconnection cancelled', reason);
  };

  /**
   * Clear both heartbeat timers and any stale-link state. Call this from any
   * connection teardown path to avoid leaving orphan timers behind.
   */
  const clearHeartbeatTimers = (): void => {
    if (heartbeatWatchdog) {
      clearTimeout(heartbeatWatchdog);
      heartbeatWatchdog = null;
    }
    if (heartbeatGraceTimer) {
      clearTimeout(heartbeatGraceTimer);
      heartbeatGraceTimer = null;
    }
    connectionState.isStale = false;
    connectionState.staleSince = undefined;
  };

  /**
   * Force-disconnect the current link. Used when the grace period after a
   * stale link expires without heartbeats resuming.
   */
  const forceDisconnectStaleLink = (): void => {
    if (!connectionState.isConnected) return;
    sendLog(mainWindow, 'warn', 'Vehicle heartbeat lost', `No heartbeat received for ${HEARTBEAT_GRACE_MS / 1000}s — disconnecting`);
    if (currentTransport?.isOpen) {
      currentTransport.close().catch(() => {});
    } else {
      cleanupMspConnection();
      if (gcsHeartbeatInterval) {
        clearInterval(gcsHeartbeatInterval);
        gcsHeartbeatInterval = null;
      }
      if (mavlinkBatchTimer) {
        clearTimeout(mavlinkBatchTimer);
        mavlinkBatchTimer = null;
        mavlinkTelemetryBatches = {};
      }
      currentTransport = null;
      mavlinkParser = null;
      resetMavlinkDiagCache();
      connectionState.isConnected = false;
      connectionState.isWaitingForHeartbeat = false;
      connectionState.isStale = false;
      connectionState.staleSince = undefined;
      sendLog(mainWindow, 'info', 'Connection closed');
      sendConnectionState(mainWindow);
      // Heartbeats stopped (likely signal loss); keep trying to bring the link back.
      if (!suppressAutoReconnect && lastConnectOptions) scheduleAutoReconnect('Heartbeat lost');
    }
  };

  /**
   * Reset the heartbeat watchdog timer. Called on every real vehicle heartbeat.
   *
   * Two-stage behavior (see HEARTBEAT_STALE_MS / HEARTBEAT_GRACE_MS):
   *   - HEARTBEAT_STALE_MS of silence → mark link stale, keep transport open
   *   - HEARTBEAT_GRACE_MS of silence → actually disconnect
   *   - Any heartbeat while stale → clear stale flag, link resumes
   */
  const resetHeartbeatWatchdog = (): void => {
    if (heartbeatWatchdog) clearTimeout(heartbeatWatchdog);
    if (heartbeatGraceTimer) {
      clearTimeout(heartbeatGraceTimer);
      heartbeatGraceTimer = null;
    }

    // If link had gone stale, a heartbeat just resumed - announce recovery.
    if (connectionState.isStale) {
      const downMs = connectionState.staleSince ? Date.now() - connectionState.staleSince : 0;
      connectionState.isStale = false;
      connectionState.staleSince = undefined;
      sendLog(mainWindow, 'info', 'Vehicle heartbeat recovered', downMs > 0 ? `Link was silent for ${(downMs / 1000).toFixed(1)}s` : undefined);
      sendConnectionState(mainWindow);
    }

    heartbeatWatchdog = setTimeout(() => {
      heartbeatWatchdog = null;
      if (!connectionState.isConnected) return;

      // Stage 1: mark stale but keep the link alive.
      connectionState.isStale = true;
      connectionState.staleSince = Date.now();
      sendLog(mainWindow, 'warn', 'Vehicle heartbeat stale', `No heartbeat for ${HEARTBEAT_STALE_MS / 1000}s - link kept open, waiting for recovery`);
      sendConnectionState(mainWindow);

      // Stage 2: if silence continues past the grace window, disconnect.
      heartbeatGraceTimer = setTimeout(() => {
        heartbeatGraceTimer = null;
        forceDisconnectStaleLink();
      }, HEARTBEAT_GRACE_MS - HEARTBEAT_STALE_MS);
    }, HEARTBEAT_STALE_MS);
  };

  /**
   * Create the MAVLink data handler with backpressure support.
   * Reusable for both initial connection and reconnection.
   */
  const createMavlinkDataHandler = (): ((data: Uint8Array) => Promise<void>) => {
    return async (data: Uint8Array) => {
      if (!mavlinkParser) return;

      // Second-screen tee: mirror the raw stream before any parsing so the
      // phone sees exactly what the radio delivered.
      mavlinkTee.forward(data);

      // Link Doctor: keep a raw sample of what arrived while we waited for a
      // heartbeat, so a failed connect can say what the port was speaking.
      if (connectionState.isWaitingForHeartbeat && linkDoctorSampleBytes < 4096) {
        linkDoctorSample.push(data);
        linkDoctorSampleBytes += data.length;
      }

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

            // Detect signed incoming packets from FC
            if (packet.isSigned && !connectionState.fcSigning) {
              connectionState.fcSigning = true;
              sendLog(mainWindow, 'info', 'FC is sending signed packets - MAVLink signing is active on the vehicle');

              // Verify our key against the FC's signed packets on EVERY new connection.
              // This catches key mismatches when a proxy (mavproxy) overwrites the FC's key.
              // If the current key doesn't match, try ALL saved keys (like Mission Planner).
              // Must await so signing state is resolved BEFORE subsequent packets are sent.
              if (packet.signature) {
                try {
                  const packetDataWithoutSig = packet.buffer.slice(0, packet.buffer.length - MAVLINK_SIGNATURE_BLOCK_LEN);

                  const fcSysid = connectionState.systemId ?? packet.sysid;
                  const currentKeyFingerprint = signingKey
                    ? Array.from(signingKey.slice(0, 6)).map(b => b.toString(16).padStart(2, '0')).join('')
                    : null;

                  // Try current key first
                  let matchedKey: Uint8Array | null = null;
                  let matchedFingerprint: string | null = null;
                  const triedFingerprints: string[] = [];

                  if (signingKey && currentKeyFingerprint) {
                    triedFingerprints.push(currentKeyFingerprint);
                    const isValid = await verifySignature(signingKey, packetDataWithoutSig, packet.signature, true);
                    if (isValid) {
                      matchedKey = signingKey;
                      matchedFingerprint = currentKeyFingerprint;
                    }
                  }

                  // If current key didn't match, try saved keys - prioritize keys
                  // previously associated with this FC's sysid, skip current key (already tried)
                  if (!matchedKey && allSavedKeys.length > 0) {
                    const saved = signingStore.get('savedKeys') ?? [];
                    // Build priority order: keys matching this sysid first, then the rest
                    const indices = allSavedKeys.map((_, i) => i);
                    indices.sort((a, b) => {
                      const aMatch = (saved[a]?.systemIds ?? []).includes(fcSysid) ? 0 : 1;
                      const bMatch = (saved[b]?.systemIds ?? []).includes(fcSysid) ? 0 : 1;
                      return aMatch - bMatch;
                    });

                    for (const idx of indices) {
                      const fp = allSavedFingerprints[idx]!;
                      // Skip if same as current key (already tried above)
                      if (fp === currentKeyFingerprint) continue;
                      triedFingerprints.push(fp);
                      const savedKey = allSavedKeys[idx]!;
                      const isValid = await verifySignature(savedKey, packetDataWithoutSig, packet.signature, true);
                      if (isValid) {
                        matchedKey = savedKey;
                        matchedFingerprint = fp;
                        break;
                      }
                    }
                  }

                  // Track whether signing state changed so we can re-trigger requests
                  const wasSigningEnabled = signingEnabled;

                  if (matchedKey) {
                    // Switch to the matched key (may be a different saved key)
                    if (matchedKey !== signingKey) {
                      signingKey = matchedKey;
                      saveSigningKey(matchedKey);
                      signingLinkId = signingStore.get('linkId') ?? 0;
                      const fp = matchedFingerprint!.slice(0, 8);
                      sendLog(mainWindow, 'info', `Auto-matched saved signing key ${fp}...`);
                    }
                    signingEnabled = true;
                    signingKeyMismatch = false;
                    connectionState.signingEnabled = true;
                    const fingerprint = Array.from(signingKey!.slice(0, 4)).map(b => b.toString(16).padStart(2, '0')).join('');
                    sendLog(mainWindow, 'info', `MAVLink signing auto-enabled (key ${fingerprint}... verified against FC sysid=${fcSysid})`);
                    recordSigningEvent({
                      event: 'key-auto-matched',
                      actor: 'auto',
                      fingerprint: matchedFingerprint ?? fingerprint,
                      sysid: fcSysid,
                      transport: currentTransport?.portName,
                      detail: `Saved key verified against FC and signing auto-enabled${wasSigningEnabled ? '' : ' (was off)'}`,
                    });
                    // Associate this key with the FC's system ID for future fast-matching
                    if (matchedFingerprint) {
                      associateKeyWithSystem(matchedFingerprint, fcSysid);
                    }
                    safeSend(mainWindow, IPC_CHANNELS.MAVLINK_SIGNING_STATUS, getSigningStatus());
                  } else if (triedFingerprints.length > 0) {
                    // Key mismatch - disable signing to prevent proxy errors.
                    signingEnabled = false;
                    signingKeyMismatch = true;
                    connectionState.signingEnabled = false;
                    const triedList = triedFingerprints.map(f => f.slice(0, 8) + '...').join(', ');
                    sendLog(mainWindow, 'warn',
                      `Signing key mismatch - tried ${triedFingerprints.length} key(s): [${triedList}], none matched FC sysid=${fcSysid}.`,
                      'Enter the correct passphrase, or paste the raw key (hex/base64) from Mission Planner in the Connection panel.'
                    );
                    recordSigningEvent({
                      event: 'key-mismatch',
                      actor: 'system',
                      sysid: fcSysid,
                      transport: currentTransport?.portName,
                      detail: `FC sends signed packets but none of ${triedFingerprints.length} saved key(s) matched`,
                    });
                    safeSend(mainWindow, IPC_CHANNELS.MAVLINK_SIGNING_STATUS, getSigningStatus());
                  } else {
                    sendLog(mainWindow, 'warn', 'Vehicle requires MAVLink signing but no key is configured. Set a signing passphrase in the Connection panel before connecting.');
                  }

                  // RACE CONDITION FIX: If signing state changed after connection was
                  // already established, initial requests (stream rates, FTP params) were
                  // sent with the wrong signing state and got dropped by the FC.
                  // Re-trigger them now with the corrected signing state.
                  if (signingEnabled !== wasSigningEnabled && connectionState.isConnected) {
                    sendLog(mainWindow, 'info', 'Signing state changed after connect - re-requesting streams and params');
                    setTimeout(async () => {
                      if (!currentTransport?.isOpen || !connectionState.isConnected) return;
                      await sendStreamRateRequests(mainWindow, currentTelemetrySpeed);
                    }, 500);
                    // Notify renderer to re-trigger param fetch
                    safeSend(mainWindow, IPC_CHANNELS.MAVLINK_SIGNING_STATUS, getSigningStatus());
                  }
                } catch {
                  // Non-critical - signing verification failed, continue without signing
                }
              }

              sendConnectionState(mainWindow);
            }

            // Handle heartbeat (msgid 0)
            if (packet.msgid === 0) {
              // Detect MAVLink version from packet format
              detectedMavlinkVersion = packet.isMavlink2 ? 2 : 1;

              // MAVLink v2 reorders payload by size (largest first):
              // custom_mode(4) at offset 0, type(1) at offset 4, autopilot(1) at offset 5
              // Note: ArduPilot uses v2 byte order even with v1 packet framing
              const vehicleType = packet.payload[4]!;
              const autopilotType = packet.payload[5]!;

              // Skip heartbeats from non-vehicle components (companion computers, cameras, GCS, radios, etc.)
              // These send their own heartbeats but don't represent the actual vehicle
              if (!isVehicleHeartbeat(vehicleType, autopilotType, packet.compid)) {
                sendLog(mainWindow, 'debug', `Ignoring heartbeat from non-vehicle component: ${VEHICLE_NAMES[vehicleType] || vehicleType} (sysid=${packet.sysid}, compid=${packet.compid})`);
                continue;
              }

              // Reset heartbeat watchdog on every real vehicle heartbeat
              // This confirms the vehicle is still alive and communicating
              if (connectionState.isConnected) {
                resetHeartbeatWatchdog();
              }

              // Multi-vehicle shadow: mirror this vehicle into the registry,
              // keyed by (transport, sysid, compid) so a second vehicle or a
              // tracker never clobbers the primary. Auto-promote the first
              // discovered vehicle to active so single-vehicle behavior is
              // unchanged. Legacy connectionState reads below are untouched.
              if (primaryTransportId) {
                const discovered = connectionRegistry.recordHeartbeat(
                  primaryTransportId, packet.sysid, packet.compid, vehicleType,
                );
                if (discovered) {
                  if (connectionRegistry.getActiveVehicleKey() === null) {
                    connectionRegistry.setActive(primaryTransportId, discovered.vehicle.key);
                  }
                  if (discovered.isNew) {
                    safeSend(mainWindow, IPC_CHANNELS.COMMS_VEHICLE_DISCOVERED, toVehicleInfoIpc(discovered.vehicle));
                  }
                }
              }

              // First heartbeat from a real vehicle - connection confirmed!
              if (connectionState.isWaitingForHeartbeat) {
                if (heartbeatTimeout) {
                  clearTimeout(heartbeatTimeout);
                  heartbeatTimeout = null;
                }

                connectionState.isWaitingForHeartbeat = false;
                connectionState.isConnected = true;
                // A heartbeat means we're back: clear any reconnect-in-progress UI state.
                connectionState.isReconnecting = false;
                connectionState.reconnectAttempt = undefined;
                connectionState.protocol = 'mavlink';
                connectionState.systemId = packet.sysid;
                connectionState.componentId = packet.compid;
                connectionState.autopilot = AUTOPILOT_NAMES[autopilotType] || `Unknown (${autopilotType})`;
                connectionState.autopilotType = autopilotType;
                connectionState.firmware = autopilotType === 12 ? 'px4' : autopilotType === 3 ? 'ardupilot' : 'custom';
                connectionState.vehicleType = VEHICLE_NAMES[vehicleType] || `Unknown (${vehicleType})`;
                connectionState.mavType = vehicleType;
                connectionState.mavlinkVersion = detectedMavlinkVersion;
                connectionState.signingEnabled = signingEnabled;
                // Mark isSitl iff one of our MAVLink SITL launchers is
                // currently running. (iNav SITL uses MSP - tracked separately.)
                connectionState.isSitl = ardupilotSitlProcess.isRunning || px4SitlProcess.isRunning;

                // PX4 needs a manual-control source before it arms cleanly or
                // enters stick modes; feed the SITL a neutral virtual joystick.
                if (connectionState.firmware === 'px4') startPx4ManualControlStream();
                else stopPx4ManualControlStream();

                sendLog(mainWindow, 'info', `Connected to ${connectionState.autopilot} ${connectionState.vehicleType}`, `System ID: ${packet.sysid}, Component ID: ${packet.compid}, MAVLink v${detectedMavlinkVersion}`);
                sendConnectionState(mainWindow);

                // Request AUTOPILOT_VERSION to get board UID for param history
                try {
                  const cmdPayload = serializeCommandLong({
                    targetSystem: packet.sysid,
                    targetComponent: packet.compid,
                    command: 512, // MAV_CMD_REQUEST_MESSAGE
                    confirmation: 0,
                    param1: MSG_AUTOPILOT_VERSION,
                    param2: 0, param3: 0, param4: 0, param5: 0, param6: 0, param7: 0,
                  });
                  // Use sendMavlinkPacket to apply signing when enabled
                  const pkt = await sendMavlinkPacket(COMMAND_LONG_ID, cmdPayload, COMMAND_LONG_CRC_EXTRA);
                  await currentTransport!.write(pkt);
                } catch {
                  // Non-critical - boardUid will use fallback
                }

                // Start sending GCS heartbeats at 1Hz
                // ArduPilot requires GCS heartbeats to recognize us as a valid GCS
                const sysId = packet.sysid;
                const compId = packet.compid;
                const mavVer = detectedMavlinkVersion;

                const sendGcsHeartbeat = () => {
                  if (!currentTransport?.isOpen) return;
                  try {
                    const hbPayload = serializeHeartbeat({
                      type: 6, // MAV_TYPE_GCS
                      autopilot: 8, // MAV_AUTOPILOT_INVALID
                      baseMode: 0,
                      customMode: 0,
                      systemStatus: 4, // MAV_STATE_ACTIVE
                      mavlinkVersion: 3,
                    });
                    // Use sendMavlinkPacket to apply signing when enabled
                    sendMavlinkPacket(HEARTBEAT_ID, hbPayload, HEARTBEAT_CRC_EXTRA)
                      .then(pkt => currentTransport?.write(pkt))
                      .catch(() => {});
                  } catch {
                    // Non-critical
                  }
                };

                // Send first GCS heartbeat immediately
                sendGcsHeartbeat();
                if (gcsHeartbeatInterval) clearInterval(gcsHeartbeatInterval);
                gcsHeartbeatInterval = setInterval(sendGcsHeartbeat, 1000);

                // Start heartbeat watchdog to detect vehicle going offline
                resetHeartbeatWatchdog();

                // Request individual message streams via MAV_CMD_SET_MESSAGE_INTERVAL + REQUEST_DATA_STREAM
                // Uses stored speed preference from settings
                setTimeout(async () => {
                  const savedSpeed = (settingsStore.get('telemetrySpeed') as TelemetrySpeed | undefined) ?? 'normal';
                  currentTelemetrySpeed = savedSpeed;
                  await sendStreamRateRequests(mainWindow, savedSpeed);
                }, 1500);

                // Retry stream requests after 5s in case the FC wasn't ready the first time
                // ArduPilot may need 3-5 heartbeats before accepting a new GCS
                if (streamRateRetryTimeout) clearTimeout(streamRateRetryTimeout);
                streamRateRetryTimeout = setTimeout(async () => {
                  streamRateRetryTimeout = null;
                  if (!currentTransport?.isOpen || !connectionState.isConnected) return;
                  if (currentTelemetrySpeed === 'fc') return; // Nothing to retry, we never ask
                  sendLog(mainWindow, 'debug', 'Retrying stream rate requests');
                  await sendStreamRateRequests(mainWindow, currentTelemetrySpeed);
                }, 5000);
              }
            }

            // Parse telemetry data from known message types
            parseTelemetry(mainWindow, packet);

            // Broadcast raw frame to renderer(s) for the MAVLink Inspector and
            // any FieldGraph pop-outs, batched into 50ms buckets (see
            // flushPacketBatch). PACKET_BATCH_MAX bounds memory if the flush
            // timer is starved by a busy event loop.
            packetBatch.push({
              msgid: packet.msgid,
              sysid: packet.sysid,
              compid: packet.compid,
              seq: packet.seq,
              payload: Array.from(packet.payload),
              rxtime: packet.rxtime.getTime(),
              isMavlink2: packet.isMavlink2,
              isSigned: packet.isSigned,
            });
            if (packetBatch.length >= PACKET_BATCH_MAX) {
              flushPacketBatch(mainWindow);
            } else if (!packetBatchTimer) {
              packetBatchTimer = setTimeout(() => flushPacketBatch(mainWindow), PACKET_BATCH_FLUSH_MS);
            }

            // TEMP perf probe (diagnosing in-flight telemetry freeze): measure the
            // raw packet broadcast rate + top message ids. This is the "flood" the
            // renderer's per-packet decoders chew on. REMOVE after diagnosis.
            perfPktCount++;
            perfMsgHist.set(packet.msgid, (perfMsgHist.get(packet.msgid) ?? 0) + 1);
            if (!perfLogTimer) {
              perfLogTimer = setInterval(() => {
                const top = [...perfMsgHist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
                  .map(([id, c]) => `#${id}:${Math.round(c / 2)}`).join(' ');
                const mem = process.memoryUsage();
                sendLog(mainWindow, 'info', `[PERF main] mavlink-pkt/s=${Math.round(perfPktCount / 2)} rss=${Math.round(mem.rss / 1e6)}MB heap=${Math.round(mem.heapUsed / 1e6)}MB top6/s=[${top}]`);
                perfPktCount = 0;
                perfMsgHist.clear();
              }, 2000);
            }

            // Log packets (limit to not spam)
            if (connectionState.packetsReceived <= 10 || connectionState.packetsReceived % 100 === 0) {
              sendLog(mainWindow, 'packet', `MSG #${packet.msgid}`, `sysid=${packet.sysid} compid=${packet.compid} seq=${packet.seq} len=${packet.payload.length}`);
            }

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
      } catch (err) {
        const msg = err instanceof Error ? err.stack || err.message : JSON.stringify(err);
        console.error('[MAVLink] Data handler error:', msg);
        sendLog(mainWindow, 'error', `MAVLink processing error: ${msg}`);
      } finally {
        processingMavlink = false;
      }
    };
  };

  /**
   * Attempt MAVLink reconnection: set up parser/pipeline and wait for heartbeat.
   * Returns true if heartbeat received and connection restored.
   */
  const attemptMavlinkReconnect = async (transportDesc: string): Promise<boolean> => {
    // Clean up old MAVLink state
    cleanupTransportListeners();
    mavlinkParser = new MAVLinkParser();
    mavlinkParser.registerMessages(getAllMessageInfos());

    // Set up full MAVLink pipeline
    mavlinkDataHandler = createMavlinkDataHandler();
    currentTransport!.on('data', mavlinkDataHandler);

    // Multi-vehicle shadow: re-register the primary session after reconnect,
    // reusing the original connection's config.
    registerPrimarySession();

    // Set up error/close handlers
    transportErrorHandler = (error: Error) => {
      if (!isReconnectPending()) {
        console.error('Transport error:', error);
        sendLog(mainWindow, 'error', 'Transport error', error.message);
      }
      safeSend(mainWindow, 'connection:error', error.message);
    };
    currentTransport!.on('error', transportErrorHandler);

    transportCloseHandler = () => {
      if (heartbeatTimeout) {
        clearTimeout(heartbeatTimeout);
        heartbeatTimeout = null;
      }
      clearHeartbeatTimers();
      if (isReconnectPending()) {
        // Pause GCS heartbeats during reconnect (will restart on new heartbeat)
        if (gcsHeartbeatInterval) {
          clearInterval(gcsHeartbeatInterval);
          gcsHeartbeatInterval = null;
        }
        if (streamRateRetryTimeout) {
          clearTimeout(streamRateRetryTimeout);
          streamRateRetryTimeout = null;
        }
        if (legacyStreamFallbackTimeout) {
          clearTimeout(legacyStreamFallbackTimeout);
          legacyStreamFallbackTimeout = null;
        }
        sessionRatesRequested = false; // Reboot resets the FC's in-RAM rates
        // Release the dead transport NOW. Keeping the old SerialPort instance
        // (and its fd) around while the board re-enumerates can leave the tty
        // node busy/zombied on macOS, so every reconnect open fails until a
        // manual connect closes it (8-minute stuck "Rebooting..." spinner).
        cleanupTransportListeners();
        try { if (currentTransport?.isOpen) currentTransport.close(); } catch { /* already gone */ }
        currentTransport = null;
        sendLog(mainWindow, 'info', 'Connection closed for reboot, will reconnect...');
        return;
      }
      // Unexpected close (e.g. physical USB disconnect) - full cleanup
      // so port watcher can restart and detect reconnected devices
      const wasConnected = connectionState.isConnected;
      cancelCalibration('Flight controller disconnected');
      cleanupMspConnection();
      cleanupTransportListeners();
      if (gcsHeartbeatInterval) {
        clearInterval(gcsHeartbeatInterval);
        gcsHeartbeatInterval = null;
      }
      if (mavlinkBatchTimer) {
        clearTimeout(mavlinkBatchTimer);
        mavlinkBatchTimer = null;
        mavlinkTelemetryBatches = {};
      }
      if (legacyStreamFallbackTimeout) {
        clearTimeout(legacyStreamFallbackTimeout);
        legacyStreamFallbackTimeout = null;
      }
      sessionRatesRequested = false;
      lastAttitudeAtMs = 0;
      currentTransport = null;
      mavlinkParser = null;
      resetMavlinkDiagCache();
      resetHeartbeat();   // clear ArduDeck script-heartbeat state across FC swaps
      connectionState.isConnected = false;
      connectionState.isWaitingForHeartbeat = false;
      sendLog(mainWindow, 'info', 'Connection closed');
      sendConnectionState(mainWindow);
      // The link was up and dropped on its own: recover it automatically.
      if (wasConnected && !suppressAutoReconnect && lastConnectOptions) scheduleAutoReconnect('Link dropped');
    };
    currentTransport!.on('close', transportCloseHandler);

    // Signal heartbeat detection - the data handler will set isConnected when heartbeat arrives
    connectionState.isWaitingForHeartbeat = true;
    connectionState.transport = transportDesc;
    connectionState.packetsReceived = 0;
    connectionState.packetsSent = 0;

    // Wait for MAVLink heartbeat with timeout
    const heartbeatReceived = await new Promise<boolean>((resolve) => {
      const checkInterval = setInterval(() => {
        if (connectionState.isConnected) {
          clearInterval(checkInterval);
          resolve(true);
        }
      }, 100);
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve(false);
      }, 2500);
    });

    if (heartbeatReceived) {
      connectionState.isReconnecting = false;
      sendConnectionState(mainWindow);
      sendLog(mainWindow, 'info', 'Reconnected successfully!', `${connectionState.autopilot} ${connectionState.vehicleType}`);
      return true;
    }

    // Failed - clean up MAVLink pipeline
    cleanupTransportListeners();
    connectionState.isWaitingForHeartbeat = false;
    return false;
  };

  /**
   * Attempt to reconnect to the board
   */
  const attemptReconnect = async (): Promise<void> => {
    if (!pendingReconnect) return;

    const now = Date.now();
    const elapsed = now - pendingReconnect.startTime;

    // Check timeout
    if (elapsed > pendingReconnect.timeoutMs || pendingReconnect.attempt >= pendingReconnect.maxAttempts) {
      cancelReconnect('Reconnection timed out - board may need manual reconnection');
      return;
    }

    pendingReconnect.attempt++;
    connectionState.reconnectAttempt = pendingReconnect.attempt;
    sendConnectionState(mainWindow);

    // Unexpected-drop recovery backs off exponentially (1s..15s) and never gives up; a
    // known-reboot reconnect keeps its tight fixed cadence.
    const retryMs = pendingReconnect.auto
      ? Math.min(1000 * 2 ** Math.min(pendingReconnect.attempt - 1, 4), 15000)
      : 500;
    sendLog(mainWindow, 'info', pendingReconnect.auto
      ? `Reconnect attempt ${pendingReconnect.attempt}`
      : `Reconnect attempt ${pendingReconnect.attempt}/${pendingReconnect.maxAttempts}`);

    // Validate we have connection info (UDP has neither portPath nor host).
    if (!pendingReconnect.portPath && !pendingReconnect.host && pendingReconnect.options?.type !== 'udp') {
      cancelReconnect('No connection info available for reconnect');
      return;
    }

    try {
      if (pendingReconnect.portPath) {
        // Serial reconnection - check if the port is available, matching by USB identity so
        // a radio that re-enumerated to a new path (ttyUSB0 -> ttyUSB1) is still found.
        const ports = await listSerialPorts();
        let portAvailable = ports.some(p => p.path === pendingReconnect!.portPath);
        if (!portAvailable && lastSerialUsbId && (lastSerialUsbId.serialNumber || lastSerialUsbId.vendorId)) {
          const match = ports.find(p =>
            p.vendorId === lastSerialUsbId!.vendorId
            && p.productId === lastSerialUsbId!.productId
            && (!lastSerialUsbId!.serialNumber || p.serialNumber === lastSerialUsbId!.serialNumber));
          if (match) {
            sendLog(mainWindow, 'info', `Radio re-enumerated to ${match.path}, reconnecting there`);
            pendingReconnect.portPath = match.path;
            if (pendingReconnect.options) pendingReconnect.options.port = match.path;
            portAvailable = true;
          }
        }

        if (!portAvailable) {
          // Info, not debug: an invisible reason is exactly how the stuck
          // "Rebooting..." spinner went undiagnosable in the field.
          sendLog(mainWindow, 'info', `Port ${pendingReconnect.portPath} not available yet, retrying in ${retryMs}ms...`);
          reconnectTimer = setTimeout(() => attemptReconnect(), retryMs);
          return;
        }

        // Drop any stale transport left from the pre-reboot session before
        // re-opening the port (an fd still open on it reads as busy).
        if (currentTransport) {
          try { if (currentTransport.isOpen) currentTransport.close(); } catch { /* ignore */ }
          currentTransport = null;
        }

        // Port is back - attempt connection
        const transport = new SerialTransport(pendingReconnect.portPath, {
          baudRate: pendingReconnect.baudRate || 115200,
        });

        await transport.open();
        currentTransport = transport;

        if (pendingReconnect.protocol === 'mavlink') {
          // MAVLink reconnection - set up full pipeline and wait for heartbeat
          connectionState.portPath = pendingReconnect.portPath;
          const connected = await attemptMavlinkReconnect(
            `${pendingReconnect.portPath} @ ${pendingReconnect.baudRate || 115200}`
          );
          if (connected) {
            pendingReconnect = null;
            return;
          }
        } else {
          // Re-detect MSP protocol
          const mspInfo = await tryMspDetection(currentTransport, mainWindow);
          if (mspInfo) {
            const vehicleType = await getMspVehicleType(mspInfo.fcVariant) || 'Unknown';

            connectionState = {
              isConnected: true,
              isReconnecting: false,
              protocol: 'msp',
              transport: 'serial',
              connectionType: 'serial',
              portPath: pendingReconnect.portPath,
              fcVariant: mspInfo.fcVariant,
              fcVersion: mspInfo.fcVersion,
              boardId: mspInfo.boardId,
              apiVersion: mspInfo.apiVersion,
              autopilot: mspInfo.fcVariant,
              vehicleType,
              isLegacyBoard: isLegacyMspBoard(mspInfo.fcVariant, mspInfo.fcVersion),
              packetsReceived: 0,
              packetsSent: 0,
            };

            // Setup transport handlers for the new connection
            setupReconnectTransportHandlers(transport);

            sendConnectionState(mainWindow);
            sendLog(mainWindow, 'info', 'Reconnected successfully!', `${mspInfo.fcVariant} ${mspInfo.fcVersion}`);

            pendingReconnect = null;
            return;
          }
        }
      } else if (pendingReconnect.host) {
        // TCP reconnection (SITL)
        // Check if this was a SITL connection and BOTH SITL flavours are gone.
        // Either one being alive on TCP 5760 means the reconnect target is
        // valid - cancelling on iNav-only check would kill ArduPilot SITL
        // reconnects (and vice versa).
        if (
          pendingReconnect.host === '127.0.0.1'
          && pendingReconnect.tcpPort === 5760
          && !sitlProcess.isRunning
          && !ardupilotSitlProcess.isRunning
        ) {
          cancelReconnect('SITL is no longer running - reconnection cancelled');
          return;
        }

        const transport = new TcpTransport({
          host: pendingReconnect.host,
          port: pendingReconnect.tcpPort || 5760,
        });

        await transport.open();
        currentTransport = transport;

        if (pendingReconnect.protocol === 'mavlink') {
          // MAVLink reconnection over TCP
          const connected = await attemptMavlinkReconnect(
            `TCP ${pendingReconnect.host}:${pendingReconnect.tcpPort || 5760}`
          );
          if (connected) {
            // MAVLink reconnect path → ArduPilot SITL is the relevant flavour.
            connectionState.isSitl = ardupilotSitlProcess.isRunning;
            pendingReconnect = null;
            return;
          }
        } else {
          const mspInfo = await tryMspDetection(currentTransport, mainWindow);
          if (mspInfo) {
            const vehicleType = await getMspVehicleType(mspInfo.fcVariant) || 'Unknown';

            connectionState = {
              isConnected: true,
              isReconnecting: false,
              protocol: 'msp',
              transport: 'tcp',
              connectionType: 'tcp',
              fcVariant: mspInfo.fcVariant,
              fcVersion: mspInfo.fcVersion,
              boardId: mspInfo.boardId,
              apiVersion: mspInfo.apiVersion,
              autopilot: mspInfo.fcVariant,
              vehicleType,
              isLegacyBoard: isLegacyMspBoard(mspInfo.fcVariant, mspInfo.fcVersion),
              // MSP reconnect path → iNav SITL is the relevant flavour.
              isSitl: sitlProcess.isRunning,
              packetsReceived: 0,
              packetsSent: 0,
            };

            setupReconnectTransportHandlers(transport);

            sendConnectionState(mainWindow);
            sendLog(mainWindow, 'info', 'Reconnected successfully!', `${mspInfo.fcVariant} ${vehicleType}`);

            pendingReconnect = null;
            return;
          }
        }
      } else if (pendingReconnect.options?.type === 'udp') {
        // UDP reconnection (rebind the socket). Reached after the heartbeat watchdog
        // force-closes a silent UDP link, or if the socket errors.
        const o = pendingReconnect.options;
        const transport = o.udpMode === 'client' && o.udpRemoteHost && o.udpRemotePort
          ? new UdpTransport({
              localPort: o.udpClientLocalPort ?? 14550,
              remoteHost: o.udpRemoteHost,
              remotePort: o.udpRemotePort,
            })
          : new UdpTransport({ localPort: o.udpPort ?? 14550 });

        await transport.open();
        currentTransport = transport;

        const name = o.udpMode === 'client'
          ? `UDP client ${o.udpRemoteHost}:${o.udpRemotePort}`
          : `UDP :${o.udpPort ?? 14550}`;

        if (pendingReconnect.protocol === 'mavlink') {
          const connected = await attemptMavlinkReconnect(name);
          if (connected) {
            pendingReconnect = null;
            return;
          }
        } else {
          const mspInfo = await tryMspDetection(currentTransport, mainWindow);
          if (mspInfo) {
            const vehicleType = await getMspVehicleType(mspInfo.fcVariant) || 'Unknown';
            connectionState = {
              isConnected: true,
              isReconnecting: false,
              protocol: 'msp',
              transport: 'udp',
              connectionType: 'udp',
              fcVariant: mspInfo.fcVariant,
              fcVersion: mspInfo.fcVersion,
              boardId: mspInfo.boardId,
              apiVersion: mspInfo.apiVersion,
              autopilot: mspInfo.fcVariant,
              vehicleType,
              isLegacyBoard: isLegacyMspBoard(mspInfo.fcVariant, mspInfo.fcVersion),
              packetsReceived: 0,
              packetsSent: 0,
            };
            setupReconnectTransportHandlers(transport);
            sendConnectionState(mainWindow);
            sendLog(mainWindow, 'info', 'Reconnected successfully!', `${mspInfo.fcVariant} ${vehicleType}`);
            pendingReconnect = null;
            return;
          }
        }
      }

      // Protocol detection failed - close and retry
      sendLog(mainWindow, 'info', 'Reconnect: link opened but no heartbeat/protocol yet, retrying...');
      currentTransport?.close();
      currentTransport = null;
      reconnectTimer = setTimeout(() => attemptReconnect(), retryMs);

    } catch (err) {
      // Never retry silently: a busy tty (stale fd) or open error looping
      // invisibly is indistinguishable from a hang for the operator.
      sendLog(mainWindow, 'warn', 'Reconnect attempt failed', err instanceof Error ? err.message : String(err));
      // Clean up any partially opened transport
      if (currentTransport) {
        try {
          if (currentTransport.isOpen) {
            currentTransport.close();
          }
        } catch {
          // Ignore close errors
        }
      }
      currentTransport = null;
      reconnectTimer = setTimeout(() => attemptReconnect(), retryMs);
    }
  };

  /**
   * Setup transport handlers after successful reconnection
   */
  const setupReconnectTransportHandlers = (transport: Transport): void => {
    // Clean up any existing handlers first
    cleanupTransportListeners();

    // Setup error handler - don't spam during reconnect
    transportErrorHandler = (error: Error) => {
      if (!isReconnectPending()) {
        console.error('Transport error:', error);
        sendLog(mainWindow, 'error', 'Transport error', error.message);
      }
      safeSend(mainWindow, 'connection:error', error.message);
    };
    transport.on('error', transportErrorHandler);

    // Setup close handler (reuse same logic as initial connection)
    transportCloseHandler = () => {
      if (heartbeatTimeout) {
        clearTimeout(heartbeatTimeout);
        heartbeatTimeout = null;
      }

      clearHeartbeatTimers();

      // Check if this is an expected close (reboot in progress)
      if (isReconnectPending()) {
        if (gcsHeartbeatInterval) {
          clearInterval(gcsHeartbeatInterval);
          gcsHeartbeatInterval = null;
        }
        if (streamRateRetryTimeout) {
          clearTimeout(streamRateRetryTimeout);
          streamRateRetryTimeout = null;
        }
        if (legacyStreamFallbackTimeout) {
          clearTimeout(legacyStreamFallbackTimeout);
          legacyStreamFallbackTimeout = null;
        }
        sessionRatesRequested = false; // Reboot resets the FC's in-RAM rates
        // Release the dead transport NOW (see the matching branch in the
        // initial-connect close handler for why: stale fd = busy tty).
        cleanupTransportListeners();
        try { if (currentTransport?.isOpen) currentTransport.close(); } catch { /* already gone */ }
        currentTransport = null;
        sendLog(mainWindow, 'info', 'Connection closed for reboot, will reconnect...');
        return; // Don't update state - reconnect logic handles it
      }

      // Unexpected close (e.g. physical USB disconnect) - full cleanup
      // so port watcher can restart and detect reconnected devices
      cancelCalibration('Flight controller disconnected');
      cleanupMspConnection();
      cleanupTransportListeners();
      if (gcsHeartbeatInterval) {
        clearInterval(gcsHeartbeatInterval);
        gcsHeartbeatInterval = null;
      }
      if (mavlinkBatchTimer) {
        clearTimeout(mavlinkBatchTimer);
        mavlinkBatchTimer = null;
        mavlinkTelemetryBatches = {};
      }
      const wasConnected = connectionState.isConnected;
      currentTransport = null;
      mavlinkParser = null;
      resetMavlinkDiagCache();
      connectionState.isConnected = false;
      connectionState.isWaitingForHeartbeat = false;
      sendLog(mainWindow, 'info', 'Connection closed');
      sendConnectionState(mainWindow);
      // The link was up and dropped on its own: recover it automatically.
      if (wasConnected && !suppressAutoReconnect && lastConnectOptions) scheduleAutoReconnect('Link dropped');
    };
    transport.on('close', transportCloseHandler);
  };

  /**
   * Schedule auto-reconnect after an expected reboot operation.
   * Call this BEFORE sending the reboot command.
   */
  const scheduleReconnect = (options: {
    reason: string;
    delayMs: number; // Wait time before first reconnect attempt (board reboot time)
    timeoutMs?: number; // Total time to keep trying (default 5000ms)
    maxAttempts?: number; // Max connection attempts (default 10)
  }): void => {
    const { reason, delayMs, timeoutMs = 5000, maxAttempts = 10 } = options;

    // Cancel any existing reconnect
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    // Where to dial is decided by `resolveReconnectTarget`, which is a pure function so the
    // rule it encodes can be tested: `connectionState` is only populated WHILE connected, so a
    // reconnect scheduled after the link has already gone must fall back to the options the
    // user last connected with. See that module for what happened when it did not.
    const target = resolveReconnectTarget(connectionState, lastConnectOptions);
    pendingReconnect = {
      reason,
      portPath: target.portPath,
      host: target.host,
      options: target.options,
      tcpPort: target.tcpPort,
      protocol: target.protocol,
      baudRate: target.baudRate,
      startTime: Date.now() + delayMs, // Start timing from after initial delay
      attempt: 0,
      maxAttempts,
      timeoutMs,
    };

    // Update UI immediately
    connectionState.isReconnecting = true;
    connectionState.reconnectReason = reason;
    connectionState.reconnectAttempt = 0;
    connectionState.reconnectMaxAttempts = maxAttempts;
    sendConnectionState(mainWindow);

    sendLog(mainWindow, 'info', `Reconnect scheduled: ${reason}`, `Will attempt in ${delayMs}ms`);

    // Schedule first attempt after delay
    reconnectTimer = setTimeout(() => attemptReconnect(), delayMs);
  };

  /**
   * Schedule recovery from an UNEXPECTED link drop (signal loss, power cycle, cable unplug).
   * Unlike scheduleReconnect (built for a known board reboot), this re-dials the exact link
   * the user last connected with - serial / TCP / UDP - using exponential backoff and
   * effectively never giving up, so a vehicle that comes back is picked up automatically.
   * No-op if there's nothing to reconnect to or a reconnect is already running.
   */
  const scheduleAutoReconnect = (reason: string): void => {
    if (!lastConnectOptions || suppressAutoReconnect || isReconnectPending()) return;
    const o = lastConnectOptions;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }

    const tcpPortNum = typeof o.tcpPort === 'string' ? parseInt(o.tcpPort, 10) : o.tcpPort;
    pendingReconnect = {
      reason,
      options: o,
      auto: true,
      portPath: o.type === 'serial' ? o.port : undefined,
      host: o.type === 'tcp' ? o.host : undefined,
      tcpPort: tcpPortNum,
      protocol: o.protocol === 'msp' ? 'msp' : 'mavlink',
      baudRate: o.baudRate ?? 115200,
      startTime: Date.now(),
      attempt: 0,
      maxAttempts: Number.MAX_SAFE_INTEGER,
      timeoutMs: Number.MAX_SAFE_INTEGER,
    };

    connectionState.isReconnecting = true;
    connectionState.reconnectReason = reason;
    connectionState.reconnectAttempt = 0;
    sendConnectionState(mainWindow);
    sendLog(mainWindow, 'warn', 'Link lost - reconnecting automatically', reason);

    reconnectTimer = setTimeout(() => attemptReconnect(), 1000);
  };

  // Export scheduleReconnect for use by MSP handlers
  // We'll make it available via a global reference since MSP handlers are in separate file
  (globalThis as Record<string, unknown>).__ardudeck_scheduleReconnect = scheduleReconnect;

  // IPC handler to cancel reconnection (user requested)
  ipcMain.handle(IPC_CHANNELS.RECONNECT_CANCEL, async (): Promise<void> => {
    cancelReconnect('Cancelled by user');
  });

  // ==================== END AUTO-RECONNECT LOGIC ====================

  // Connect to a device
  ipcMain.handle(IPC_CHANNELS.COMMS_CONNECT, async (_, options: ConnectOptions): Promise<boolean> => {
    // Claim this connect attempt. Any older attempt still in flight will see a
    // newer generation at its next checkpoint and abandon itself, so we never
    // end up with two sockets racing to the same target.
    const myConnectGeneration = ++connectGeneration;

    // Cancel any pending auto-reconnect (user is manually connecting)
    if (pendingReconnect) {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      pendingReconnect = null;
      connectionState.isReconnecting = false;
    }

    // Remember how to re-dial this exact link so an unexpected drop (signal loss, power
    // cycle, cable unplug) recovers on its own. Capturing the serial port's USB identity
    // lets reconnect find the device even if it re-enumerates to a different path.
    lastConnectOptions = { ...options };
    suppressAutoReconnect = false;
    lastSerialUsbId = null;
    if (options.type === 'serial' && options.port) {
      void listSerialPorts()
        .then((ports) => {
          const m = ports.find((p) => p.path === options.port);
          lastSerialUsbId = m ? { vendorId: m.vendorId, productId: m.productId, serialNumber: m.serialNumber } : null;
        })
        .catch(() => { lastSerialUsbId = null; });
    }

    // Clear any existing heartbeat timeout
    if (heartbeatTimeout) {
      clearTimeout(heartbeatTimeout);
      heartbeatTimeout = null;
    }

    // BSOD FIX: Clean up existing listeners before closing
    cleanupTransportListeners();

    // A new link means the old virtual joystick must not keep transmitting.
    stopPx4ManualControlStream();
    clearPx4MotorTestTimers();

    // Disconnect existing connection. Close unconditionally, not only when
    // isOpen: a UDP transport whose open() failed (or whose error path fired)
    // can report isOpen=false while its socket still holds the port, and
    // skipping close here is how the app EADDRINUSE-blocks its own reconnect.
    if (currentTransport) {
      try { await currentTransport.close(); } catch { /* already gone */ }
    }
    currentTransport = null;

    // BSOD FIX: Wait for driver to fully release port resources
    // Windows USB-serial drivers (CH340, CP210x, FTDI) need time to cleanup.
    // TCP/UDP have no such driver, and adding the delay there only widens the
    // window where a connect retry can race in against a slow-starting SITL.
    if (options.type === 'serial') {
      await new Promise(r => setTimeout(r, 500));
    }

    // A newer connect attempt arrived during the settle delay. Abandon this one
    // before opening a socket, so only the latest attempt ever dials the target.
    if (myConnectGeneration !== connectGeneration) {
      sendLog(mainWindow, 'info', 'Connection attempt superseded by a newer request; abandoning the stale one.');
      return false;
    }

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
          if (options.udpMode === 'client') {
            if (!options.udpRemoteHost || !options.udpRemotePort) throw new Error('Remote host and port required for UDP client mode');
            // Bind to a fixed local port (default 14550). ArduPilot UDPIN
            // latches the source IP+port of the first packet it receives and
            // replies there for the lifetime of the link; using an ephemeral
            // port (0) breaks reconnects because the new source port doesn't
            // match the one the FC cached. See issue #86.
            const clientLocalPort = options.udpClientLocalPort ?? 14550;
            currentTransport = new UdpTransport({
              localPort: clientLocalPort,
              remoteHost: options.udpRemoteHost,
              remotePort: options.udpRemotePort,
            });
            transportName = `UDP client ${options.udpRemoteHost}:${options.udpRemotePort} (local :${clientLocalPort})`;
          } else {
            currentTransport = new UdpTransport({
              localPort: options.udpPort ?? 14550,
            });
            transportName = `UDP :${options.udpPort ?? 14550}`;
          }
          break;
        default:
          throw new Error(`Invalid connection type: ${options.type ?? 'undefined'}. Must be 'serial', 'tcp', or 'udp'.`);
      }

      // Defensive check - should never happen after the switch, but prevents null access
      if (!currentTransport) {
        throw new Error('Failed to create transport - this should not happen');
      }

      // Hold our own reference: a newer connect may reassign currentTransport
      // while this socket is opening, and we must be able to tear down exactly
      // the socket this attempt created (not the winner's).
      const thisTransport = currentTransport;

      sendLog(mainWindow, 'info', `Opening ${transportName}...`);

      // Create parser
      mavlinkParser = new MAVLinkParser();
      mavlinkParser.registerMessages(getAllMessageInfos());

      // BSOD FIX: MAVLink data handler with backpressure to prevent event loop starvation
      // Stored at module level so we can properly remove it on disconnect
      mavlinkDataHandler = createMavlinkDataHandler();

      // Setup data handler
      currentTransport.on('data', mavlinkDataHandler);

      // BSOD FIX: Store handler references for proper cleanup
      transportErrorHandler = (error: Error) => {
        // Don't spam logs during reconnection attempts
        if (!isReconnectPending()) {
          console.error('Transport error:', error);
          sendLog(mainWindow, 'error', 'Transport error', error.message);
        }
        safeSend(mainWindow, 'connection:error', error.message);
      };
      currentTransport.on('error', transportErrorHandler);

      // BSOD FIX: Store handler references for proper cleanup
      transportCloseHandler = () => {
        if (heartbeatTimeout) {
          clearTimeout(heartbeatTimeout);
          heartbeatTimeout = null;
        }

        clearHeartbeatTimers();

        // Check if this is an expected close (reboot in progress)
        if (isReconnectPending()) {
          // Release the dead transport NOW (stale fd = busy tty on macOS).
          cleanupTransportListeners();
          try { if (currentTransport?.isOpen) currentTransport.close(); } catch { /* already gone */ }
          currentTransport = null;
          sendLog(mainWindow, 'info', 'Connection closed for reboot, will reconnect...');
          return; // Don't update state - reconnect logic handles it
        }

        // Unexpected close (e.g. physical USB disconnect) - full cleanup
        // so port watcher can restart and detect reconnected devices
        cancelCalibration('Flight controller disconnected');
        cleanupMspConnection();
        cleanupTransportListeners();
        if (mavlinkBatchTimer) {
          clearTimeout(mavlinkBatchTimer);
          mavlinkBatchTimer = null;
          mavlinkTelemetryBatches = {};
        }
        // Stop the GCS heartbeat sender. The route-punch path (#86, #88)
        // can start this BEFORE we receive the FC's first heartbeat, so
        // it must be cleared even on early-close to avoid a leaked
        // interval ticking forever against a null transport.
        if (gcsHeartbeatInterval) {
          clearInterval(gcsHeartbeatInterval);
          gcsHeartbeatInterval = null;
        }
        const wasConnected = connectionState.isConnected;
        currentTransport = null;
        mavlinkParser = null;
        resetMavlinkDiagCache();
        connectionState.isConnected = false;
        connectionState.isWaitingForHeartbeat = false;
        sendLog(mainWindow, 'info', 'Connection closed');
        sendConnectionState(mainWindow);
        // The link was up and dropped on its own: recover it automatically.
        if (wasConnected && !suppressAutoReconnect && lastConnectOptions) scheduleAutoReconnect('Link dropped');
      };
      currentTransport.on('close', transportCloseHandler);

      // Open connection
      await currentTransport.open();

      // A newer connect superseded us while this socket was opening. Tear this
      // orphan down rather than leave a second live socket fighting for the FC's
      // single-client TCP serial port. Detach listeners first so this close does
      // not run the shared close handler and clobber the winner's module state.
      if (myConnectGeneration !== connectGeneration) {
        // BaseTransport extends EventEmitter; detach listeners so this orphan's
        // close does not run the shared close handler against the winner's state.
        const emitter = thisTransport as { removeAllListeners?: () => void };
        try { emitter.removeAllListeners?.(); } catch { /* ignore */ }
        try { await thisTransport.close(); } catch { /* ignore */ }
        sendLog(mainWindow, 'info', 'Connection attempt superseded while opening; closed the stale socket.');
        return false;
      }

      // If protocol is forced to MSP, skip MAVLink detection entirely
      if (options.protocol === 'msp') {
        sendLog(mainWindow, 'info', `Port opened, using MSP protocol (forced)...`);

        // Remove the MAVLink data handler that was attached above (line ~1589)
        // Without this, the closure stays attached and fires on every serial byte chunk
        if (mavlinkDataHandler) {
          currentTransport.off('data', mavlinkDataHandler as (...args: unknown[]) => void);
        }
        mavlinkParser = null;
        mavlinkDataHandler = null;

        // Set state to connecting (NOT waiting for heartbeat)
        connectionState = {
          isConnected: false,
          isWaitingForHeartbeat: false,
          transport: transportName,
          connectionType: options.type,
          packetsReceived: 0,
          packetsSent: 0,
        };
        sendConnectionState(mainWindow);

        // Go directly to MSP detection
        const mspInfo = await tryMspDetection(currentTransport, mainWindow);

        if (mspInfo) {
          const isLegacy = isLegacyMspBoard(mspInfo.fcVariant, mspInfo.fcVersion);
          sendLog(mainWindow, 'info', `Connected to ${mspInfo.fcVariant} ${mspInfo.fcVersion}${isLegacy ? ' (Legacy - CLI only)' : ''}`, `Board: ${mspInfo.boardId}`);

          // Get actual vehicle type from mixer config (not hardcoded)
          const vehicleType = await getMspVehicleType(mspInfo.fcVariant) || 'Unknown';

          // Normalize tcpPort to number for comparisons
          const tcpPortNum = typeof options.tcpPort === 'string' ? parseInt(options.tcpPort, 10) : options.tcpPort;
          // This is the MSP path → iNav SITL is what we expect to be running.
          const isSitlConnection = sitlProcess.isRunning && options.host === '127.0.0.1' && tcpPortNum === 5760;

          connectionState = {
            isConnected: true,
            isWaitingForHeartbeat: false,
            protocol: 'msp',
            transport: transportName,
            portPath: options.port, // Store port path for reconnection
            connectionType: options.type,
            fcVariant: mspInfo.fcVariant,
            fcVersion: mspInfo.fcVersion,
            boardId: mspInfo.boardId,
            apiVersion: mspInfo.apiVersion,
            autopilot: mspInfo.fcVariant,
            vehicleType,
            isLegacyBoard: isLegacy,
            isSitl: isSitlConnection,
            packetsReceived: connectionState.packetsReceived,
            packetsSent: connectionState.packetsSent,
          };
          sendConnectionState(mainWindow);

          // SITL auto-configure: if iNav SITL, configure platform based on profile name
          if (isSitlConnection && mspInfo.fcVariant === 'INAV') {
            const profileName = sitlProcess.currentProfileName;
            const platformChanged = await autoConfigureSitlPlatform(profileName);
            if (platformChanged) {
              // Board will reboot - close current transport and auto-reconnect
              sendLog(mainWindow, 'info', 'SITL platform changed, reconnecting...', `Changed to match profile: ${profileName}`);

              // Small delay to ensure reboot command is sent before closing transport
              await new Promise(resolve => setTimeout(resolve, 500));
              currentTransport?.close();
              currentTransport = null;
              resetMavlinkDiagCache();
              connectionState = { isConnected: false, isWaitingForHeartbeat: false, packetsReceived: 0, packetsSent: 0 };
              sendConnectionState(mainWindow);

              // Wait for SITL to reboot (typically ~3-4 seconds)
              await new Promise(resolve => setTimeout(resolve, 4000));

              // Auto-reconnect to SITL
              sendLog(mainWindow, 'info', 'Reconnecting to SITL...');
              try {
                const tcpTransport = new TcpTransport({
                  host: '127.0.0.1',
                  port: 5760,
                });
                await tcpTransport.open();
                currentTransport = tcpTransport;

                // Re-detect MSP
                const newMspInfo = await tryMspDetection(currentTransport, mainWindow);
                if (newMspInfo) {
                  const newVehicleType = await getMspVehicleType(newMspInfo.fcVariant) || 'Unknown';

                  connectionState = {
                    isConnected: true,
                    isWaitingForHeartbeat: false,
                    protocol: 'msp',
                    transport: 'tcp',
                    connectionType: 'tcp',
                    fcVariant: newMspInfo.fcVariant,
                    fcVersion: newMspInfo.fcVersion,
                    boardId: newMspInfo.boardId,
                    apiVersion: newMspInfo.apiVersion,
                    autopilot: newMspInfo.fcVariant,
                    vehicleType: newVehicleType,
                    isLegacyBoard: isLegacyMspBoard(newMspInfo.fcVariant, newMspInfo.fcVersion),
                    isSitl: true,
                    packetsReceived: 0,
                    packetsSent: 0,
                  };
                  sendConnectionState(mainWindow);
                  sendLog(mainWindow, 'info', `Reconnected: ${newMspInfo.fcVariant} ${newVehicleType}`, `Platform auto-configured to ${newVehicleType}`);
                  return true;
                }
              } catch (reconnectErr) {
                console.error('[SITL] Auto-reconnect failed:', reconnectErr);
                sendLog(mainWindow, 'warn', 'Auto-reconnect failed', 'Please reconnect manually');
              }
              return true; // Still return success, platform was changed
            }
          }

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

      // Multi-vehicle shadow: register the primary session now that the link is
      // confirmed MAVLink (the MSP path returned earlier). Vehicles populate as
      // their heartbeats arrive.
      registerPrimarySession(options);

      // ── UDP-client route-punch (#86, #88) ────────────────────────────────
      // UDP is connectionless: until the GCS sends *something*, the FC /
      // mavp2p / mavlink-router / SIYI HM30 telemetry endpoint has no idea
      // where to route its heartbeat back to. The ticket reporters saw
      // "waiting for MAVLink heartbeat (forced)" hang forever — Mission
      // Planner works in the same setup because it spams GCS heartbeats
      // from the moment the connection opens. Mirror that behaviour here.
      //
      // Scope: UDP client only. TCP/serial don't need this (the transport
      // itself establishes a return path), and UDP server mode auto-learns
      // the remote endpoint from the first incoming packet so the punch is
      // unnecessary there. We start at 1Hz immediately; when the FC's first
      // heartbeat arrives, the handler at sendGcsHeartbeat clears
      // gcsHeartbeatInterval and reinstalls its own (with sysid/compid
      // captured from the FC) — same variable, seamless handover.
      if (options.type === 'udp' && options.udpMode === 'client') {
        const sendEarlyGcsHeartbeat = () => {
          if (!currentTransport?.isOpen) return;
          try {
            const hbPayload = serializeHeartbeat({
              type: 6, // MAV_TYPE_GCS
              autopilot: 8, // MAV_AUTOPILOT_INVALID
              baseMode: 0,
              customMode: 0,
              systemStatus: 4, // MAV_STATE_ACTIVE
              mavlinkVersion: 3,
            });
            // sendMavlinkPacket defaults sysid=255 compid=190 (standard GCS),
            // so we don't need a discovered FC sysid to send this.
            sendMavlinkPacket(HEARTBEAT_ID, hbPayload, HEARTBEAT_CRC_EXTRA)
              .then(pkt => currentTransport?.write(pkt))
              .catch(() => { /* UDP write failures are non-fatal — next tick will retry */ });
          } catch {
            // Non-critical: serialize failure on a single tick is harmless,
            // the interval keeps trying.
          }
        };
        sendEarlyGcsHeartbeat();
        if (gcsHeartbeatInterval) clearInterval(gcsHeartbeatInterval);
        gcsHeartbeatInterval = setInterval(sendEarlyGcsHeartbeat, 1000);
      }

      // Set state to waiting for heartbeat (NOT connected yet)
      connectionState = {
        isConnected: false,
        isWaitingForHeartbeat: true,
        transport: transportName,
        portPath: options.port, // Store port path for reconnection after reboot
        connectionType: options.type,
        packetsReceived: 0,
        packetsSent: 0,
      };
      linkDoctorSample = [];
      linkDoctorSampleBytes = 0;
      sendConnectionState(mainWindow);

      // Set heartbeat timeout - try MSP if no MAVLink heartbeat
      // Auto-detection strategy:
      //   Serial: always try MSP fallback (physical FC, safe to probe)
      //   TCP/UDP: only try MSP if zero MAVLink data was received
      //     - If MAVLink data arrived (but no heartbeat), the remote end is MAVLink
      //       (e.g. mavproxy sending status packets first) — do NOT send MSP probe
      //       bytes which would corrupt the stream and potentially crash mavproxy.
      //     - If no data at all, likely an MSP device (they wait to be polled).
      // When protocol is forced to 'msp' via UI toggle, the early-exit above handles it.
      // When forced to 'mavlink', we skip MSP fallback entirely below.
      heartbeatTimeout = setTimeout(async () => {
        if (connectionState.isWaitingForHeartbeat && currentTransport?.isOpen) {
          // If user explicitly selected MAVLink, never try MSP fallback
          if (options.protocol === 'mavlink') {
            sendLog(mainWindow, 'warn', 'No MAVLink heartbeat received yet, still waiting (MAVLink forced)...', `Transport: ${transportName}`);
            return;
          }

          const isNetworkTransport = options.type === 'tcp' || options.type === 'udp';
          const receivedMavlinkData = connectionState.packetsReceived > 0;

          if (isNetworkTransport && receivedMavlinkData) {
            // Got MAVLink packets but no heartbeat yet — keep waiting for heartbeat
            // This protects mavproxy and other MAVLink endpoints from MSP probe corruption
            sendLog(mainWindow, 'warn', `Received ${connectionState.packetsReceived} MAVLink packet(s) but no heartbeat yet, still waiting...`, `Transport: ${transportName}`);
            return;
          }

          // Serial: always try MSP fallback
          // TCP/UDP with no data: likely MSP device, try detection
          sendLog(mainWindow, 'info', 'No MAVLink heartbeat, trying MSP protocol...');

          // IMPORTANT: Remove MAVLink handler before trying MSP
          // BSOD FIX: Use stored handler reference and clear it
          if (mavlinkDataHandler) {
            currentTransport.off('data', mavlinkDataHandler as (...args: unknown[]) => void);
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

            // Get actual vehicle type from mixer config (not hardcoded)
            const vehicleType = await getMspVehicleType(mspInfo.fcVariant) || 'Unknown';

            connectionState = {
              isConnected: true,
              isWaitingForHeartbeat: false,
              protocol: 'msp',
              transport: transportName,
              portPath: options.port, // Store port path for reconnection
              fcVariant: mspInfo.fcVariant,
              fcVersion: mspInfo.fcVersion,
              boardId: mspInfo.boardId,
              apiVersion: mspInfo.apiVersion,
              autopilot: mspInfo.fcVariant, // Show variant as autopilot
              vehicleType,
              isLegacyBoard: isLegacy,
              packetsReceived: connectionState.packetsReceived,
              packetsSent: connectionState.packetsSent,
            };
            sendConnectionState(mainWindow);

            // NOTE: MSP telemetry is NOT auto-started here.
            // The renderer will start/stop telemetry based on which view is active.
            // This prevents wasted polling when user is on config screens.
          } else {
            // Neither MAVLink nor MSP. Ask the Link Doctor what the port was
            // actually speaking so the error explains itself.
            const sample = new Uint8Array(linkDoctorSampleBytes);
            let offset = 0;
            for (const chunk of linkDoctorSample) {
              sample.set(chunk.subarray(0, Math.min(chunk.length, sample.length - offset)), offset);
              offset += chunk.length;
              if (offset >= sample.length) break;
            }
            const diagnosis = classifyStream(sample);
            safeSend(mainWindow, IPC_CHANNELS.CONNECTION_DIAGNOSIS, diagnosis);
            const errorMsg = diagnosis.protocol === 'silence' || diagnosis.protocol === 'unknown'
              ? 'Device did not respond to MAVLink or MSP. Check connection.'
              : diagnosis.summary;
            sendLog(mainWindow, 'error', 'No protocol detected', `${errorMsg} (link doctor: ${diagnosis.protocol})`);
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

  // ── Link Doctor / ELRS module setup ─────────────────────────────────────
  // Serial ports are exclusive: these probes open their own transport, so
  // they refuse to touch the port the primary connection is using.
  const assertPortFree = (port: string): void => {
    if (currentTransport?.isOpen && connectionState.portPath === port) {
      throw new Error('This port is in use by the active connection. Disconnect first.');
    }
  };

  ipcMain.handle(IPC_CHANNELS.LINKDOCTOR_PROBE, async (_e, port: string, baudRate: number) => {
    assertPortFree(port);
    const transport = new SerialTransport(port, { baudRate });
    const chunks: Uint8Array[] = [];
    let total = 0;
    const onData = (d: Uint8Array): void => {
      if (total < 8192) {
        chunks.push(d);
        total += d.length;
      }
    };
    await transport.open();
    transport.on('data', onData);
    try {
      await new Promise((r) => setTimeout(r, 1800));
    } finally {
      transport.off('data', onData);
      try { await transport.close(); } catch { /* port may vanish mid-probe */ }
    }
    const sample = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      sample.set(c, off);
      off += c.length;
    }
    return classifyStream(sample);
  });

  // ELRS TX Backpack (and other WiFi bridges) broadcast MAVLink to UDP 14550
  // until a GCS answers. Listening briefly is enough to detect one - this is
  // the only path for internal TX modules, which have no USB serial at all.
  ipcMain.handle(IPC_CHANNELS.LINKDOCTOR_PROBE_UDP, async (_e, port: number) => {
    if (currentTransport?.isOpen && connectionState.connectionType === 'udp') {
      throw new Error('A UDP connection is already active. Disconnect first.');
    }
    const dgram = await import('node:dgram');
    return await new Promise<{ diagnosis: ReturnType<typeof classifyStream>; sender: string | null }>(
      (resolve, reject) => {
        const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
        const chunks: Uint8Array[] = [];
        let total = 0;
        let sender: string | null = null;
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          try { socket.close(); } catch { /* already closed */ }
          // Datagram-aware classification: video streams (RTP/MPEG-TS) are
          // only recognisable with packet boundaries intact.
          resolve({ diagnosis: classifyDatagrams(chunks), sender });
        };
        const timer = setTimeout(finish, 2500);
        socket.on('message', (msg, rinfo) => {
          if (total < 8192) {
            chunks.push(new Uint8Array(msg));
            total += msg.length;
          }
          sender = `${rinfo.address}:${rinfo.port}`;
          if (total >= 2048) finish(); // plenty to classify - return early
        });
        socket.on('error', (err) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          try { socket.close(); } catch { /* already closed */ }
          reject(err);
        });
        socket.bind(port);
      },
    );
  });

  ipcMain.handle(IPC_CHANNELS.ELRS_DETECT, async (_e, port: string) => {
    assertPortFree(port);
    sendLog(mainWindow, 'info', `Looking for an ELRS module on ${port}...`);
    const info = await detectElrsModule(port);
    if (info) {
      sendLog(mainWindow, 'info', `ELRS module found: ${info.name} (${info.firmware ?? 'unknown firmware'}), Link Mode: ${info.linkMode?.value ?? 'n/a'}`);
    }
    return info;
  });

  ipcMain.handle(IPC_CHANNELS.ELRS_SET_LINK_MODE, async (_e, port: string, targetMode: string) => {
    assertPortFree(port);
    sendLog(mainWindow, 'info', `Changing ELRS Link Mode to ${targetMode} on ${port}...`);
    const result = await setElrsLinkMode(port, targetMode, 120_000, (progress) => {
      safeSend(mainWindow, IPC_CHANNELS.ELRS_PROGRESS, progress);
    });
    sendLog(
      mainWindow,
      result.status === 'confirmed' || result.status === 'probable' ? 'info' : 'warn',
      `ELRS Link Mode change: ${result.status}`,
    );
    return result;
  });

  ipcMain.handle(IPC_CHANNELS.ELRS_CANCEL, async () => {
    cancelElrsOperation();
  });

  // ── wfb-ng dongle receiver (WiFiLink / OpenIPC direct reception) ────────
  wfbngReceiver.setLogSink((level, line) => sendLog(mainWindow, level, line));

  ipcMain.handle(IPC_CHANNELS.WFBNG_STATUS, async () => wfbngReceiver.getStatus());

  ipcMain.handle(IPC_CHANNELS.WFBNG_INSTALL, async () =>
    wfbngReceiver.download((line) => sendLog(mainWindow, 'info', line)));

  ipcMain.handle(IPC_CHANNELS.WFBNG_LOCAL_IPS, async (): Promise<string[]> => {
    const nets = networkInterfaces();
    const ips: string[] = [];
    for (const addrs of Object.values(nets)) {
      for (const a of addrs ?? []) {
        if (a.family === 'IPv4' && !a.internal) ips.push(a.address);
      }
    }
    // Prefer common LAN ranges first (192.168.x, 10.x, 172.16-31.x).
    return ips.sort((x, y) => (x.startsWith('192.168') ? -1 : y.startsWith('192.168') ? 1 : 0));
  });

  ipcMain.handle(IPC_CHANNELS.WFBNG_IMPORT_KEY, async () => {
    const result = await dialog.showOpenDialog({
      title: 'Import wfb-ng pairing key',
      filters: [{ name: 'gs.key', extensions: ['key'] }, { name: 'All files', extensions: ['*'] }],
      properties: ['openFile'],
    });
    const file = result.filePaths[0];
    if (result.canceled || !file) return { imported: false };
    wfbngReceiver.importGsKey(file);
    sendLog(mainWindow, 'info', 'wfb-ng pairing key imported');
    return { imported: true };
  });

  ipcMain.handle(IPC_CHANNELS.WFBNG_SET_OPTIONS, async (_e, opts: { channel?: number; bandwidth?: 20 | 40 }) => {
    wfbngReceiver.setOptions(opts);
  });

  // Disconnect
  ipcMain.handle(IPC_CHANNELS.COMMS_DISCONNECT, async (): Promise<void> => {
    // User is intentionally disconnecting: stop the transport `close` handler from
    // mistaking this teardown for a drop and auto-reconnecting, and forget the saved link.
    suppressAutoReconnect = true;
    lastConnectOptions = null;
    lastSerialUsbId = null;

    // Cancel any pending auto-reconnect (user is intentionally disconnecting)
    if (pendingReconnect || reconnectTimer) {
      cancelReconnect('User disconnected');
    }

    // Tear down any in-flight calibration so its module-scope state can't
    // survive into the next connection (otherwise the next start would fail
    // with "Another calibration is already in progress").
    cancelCalibration('User disconnected');

    stopPx4ManualControlStream();
    clearPx4MotorTestTimers();

    try {
      // Exit CLI mode first (sends 'exit' command to leave board in MSP mode)
      // This prevents board staying in CLI mode after disconnect
      // NOTE: exitCliModeIfActive has internal timeout, won't block forever
      await exitCliModeIfActive();

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

      clearHeartbeatTimers();

      // Clear GCS heartbeat interval
      if (gcsHeartbeatInterval) {
        clearInterval(gcsHeartbeatInterval);
        gcsHeartbeatInterval = null;
      }

      // Clear MAVLink telemetry batch timer
      if (mavlinkBatchTimer) {
        clearTimeout(mavlinkBatchTimer);
        mavlinkBatchTimer = null;
        mavlinkTelemetryBatches = {};
      }

      if (currentTransport) {
        const transport = currentTransport;
        try {
          // Only attempt close if actually open
          if (transport.isOpen) {
            // Use timeout to prevent hanging on close
            const closePromise = transport.close();
            const timeoutPromise = new Promise<void>((_, reject) =>
              setTimeout(() => reject(new Error('Transport close timeout')), 2000)
            );

            await Promise.race([closePromise, timeoutPromise]);
          }
        } catch (closeErr) {
          // Transport may already be closed or in bad state - force cleanup
          console.warn('[Disconnect] Transport close error (forcing cleanup):', closeErr);

          // Try to remove all listeners to prevent further issues
          try {
            (transport as unknown as { removeAllListeners(): void }).removeAllListeners();
          } catch {
            // Ignore
          }
        }
      }
    } catch (error) {
      // Log but don't crash on disconnect errors
      console.error('[Disconnect] Error during disconnect:', error);
    } finally {
      // Always reset state, even if errors occurred
      // This ensures we can reconnect even if close failed
      currentTransport = null;
      mavlinkParser = null;
      paramRequestInFlight = false;
      if (legacyStreamFallbackTimeout) {
        clearTimeout(legacyStreamFallbackTimeout);
        legacyStreamFallbackTimeout = null;
      }
      sessionRatesRequested = false;
      lastAttitudeAtMs = 0;
      resetMavlinkDiagCache();
      if (ftpClient) {
        ftpClient.cleanup().catch(() => {});
        ftpClient = null;
      }
      // Vehicle-supplied PX4 metadata belongs to the link that supplied it; the
      // next vehicle may run different firmware, so fall back to the bundled
      // definitions until it reports its own.
      px4ComponentInfoStarted = false;
      px4VehicleParamMetadata = null;
      pendingComponentMetadata = null;
      lastEventSequence.clear();
      metadataCache.delete('px4');
      setPx4EventMetadata(null);
      signingKeyMismatch = false;
      connectionState = {
        isConnected: false,
        signingEnabled,
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
    gcsSysid = clampGcsSysid(settings.gcsSysid);
  });

  // Simulator authored obstacles, keyed by test site id.
  ipcMain.handle(IPC_CHANNELS.SIM_OBSTACLES_GET, async (_, siteId: string): Promise<AuthoredObstacle[]> => {
    const sites = simObstaclesStore.get('sites', {});
    return sites[siteId] ?? [];
  });

  ipcMain.handle(IPC_CHANNELS.SIM_OBSTACLES_SAVE, async (_, siteId: string, obstacles: AuthoredObstacle[]): Promise<void> => {
    const sites = simObstaclesStore.get('sites', {});
    sites[siteId] = obstacles;
    simObstaclesStore.set('sites', sites);
  });

  // Current connection state — lets detached windows opened after connect (which
  // missed the one-shot CONNECTION_STATE broadcast) hydrate on mount.
  ipcMain.handle(IPC_CHANNELS.CONNECTION_GET_STATE, async (): Promise<ConnectionState> => connectionState);

  // Telemetry stream rate control (MAVLink only)
  /**
   * The pilot's answer to "may I write this vehicle's stream-rate
   * parameters?". Granting sends the legacy REQUEST_DATA_STREAM set at the
   * capped rates; declining simply records the answer so they are not asked
   * again this session.
   */
  ipcMain.handle(
    IPC_CHANNELS.TELEMETRY_LEGACY_STREAM_CONSENT,
    async (_, requestId: string, granted: boolean): Promise<{ success: boolean }> => {
      const pending = pendingLegacyConsent.get(requestId);
      pendingLegacyConsent.delete(requestId);
      legacyConsentAnswered.add(requestId);

      const mainWindow = getMainWindow();
      if (!granted) {
        if (mainWindow) {
          sendLog(mainWindow, 'info', 'Legacy stream request declined',
            'The vehicle keeps its own SR*_ rates. Raise them on the vehicle if telemetry is too slow.');
        }
        return { success: true };
      }
      if (!pending || !pending.transport.isOpen) return { success: false };

      const preset = STREAM_RATE_PRESETS[currentTelemetrySpeed === 'fc' ? 'eco' : currentTelemetrySpeed];
      const rates = cappedLegacyRates(preset ?? { attitude: 10, position: 4, other: 2 });
      const streams = [
        { streamId: 2,  hz: rates.other },
        { streamId: 6,  hz: rates.position },
        { streamId: 10, hz: rates.attitude },
        { streamId: 11, hz: rates.position },
        { streamId: 12, hz: rates.other },
        { streamId: 1,  hz: rates.other },
      ];
      for (const req of streams) {
        if (!pending.transport.isOpen) break;
        try {
          const payload = serializeRequestDataStream({
            targetSystem: pending.sysid,
            targetComponent: pending.compid,
            reqStreamId: req.streamId,
            reqMessageRate: req.hz,
            startStop: 1,
          });
          const pkt = await sendMavlinkPacket(REQUEST_DATA_STREAM_ID, payload, REQUEST_DATA_STREAM_CRC_EXTRA, { link: pending.transport });
          await pending.transport.write(pkt);
          await new Promise(resolve => setTimeout(resolve, 20));
        } catch {
          // Best effort; the pilot can retry by reconnecting.
        }
      }
      if (mainWindow) {
        sendLog(mainWindow, 'info',
          `Legacy stream rates requested (ATT ${rates.attitude}Hz)`,
          'This vehicle saves them into its SR*_ parameters, as you approved.');
      }
      return { success: true };
    },
  );

  ipcMain.handle(IPC_CHANNELS.TELEMETRY_SET_STREAM_RATE, async (_, speed: TelemetrySpeed): Promise<{ success: boolean }> => {
    if (connectionState.protocol !== 'mavlink' || !connectionState.isConnected) {
      return { success: false };
    }
    await sendStreamRateRequests(mainWindow, speed);
    return { success: true };
  });

  // ============================================================================
  // MAVLink Signing handlers
  // ============================================================================

  // Set signing key from passphrase (hashed with SHA-256)
  ipcMain.handle(IPC_CHANNELS.MAVLINK_SIGNING_SET_KEY, async (_, passphrase: string): Promise<{ success: boolean; error?: string }> => {
    try {
      if (!passphrase || passphrase.length === 0) {
        return { success: false, error: 'Passphrase cannot be empty' };
      }
      const key = await passphraseToKey(passphrase);
      const newB64 = Buffer.from(key).toString('base64').slice(0, 12);
      const savedBefore = (signingStore.get('savedKeys') ?? []).length;
      signingKey = key;
      signingLinkId = signingStore.get('linkId') ?? 0;
      saveSigningKey(key);
      // Also save to multi-key list for auto-matching on future connections
      addToSavedKeys(key);
      const savedAfter = (signingStore.get('savedKeys') ?? []).length;
      signingSentToFc = false;
      signingKeyMismatch = false;
      signingStore.set('sentToFc', false);
      sendLog(mainWindow, 'info', `Signing key set: ${newB64}... (${savedAfter} key${savedAfter > 1 ? 's' : ''} stored)`);
      recordSigningEvent({
        event: 'key-set',
        actor: 'user',
        fingerprint: signingFingerprint(key),
        detail: savedAfter > savedBefore ? `New signing key stored (${savedAfter} total)` : 'Signing key set (already in saved list)',
      });
      safeSend(mainWindow, IPC_CHANNELS.MAVLINK_SIGNING_STATUS, getSigningStatus());
      return { success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: msg };
    }
  });

  // Enable signing on outgoing packets
  ipcMain.handle(IPC_CHANNELS.MAVLINK_SIGNING_ENABLE, async (): Promise<{ success: boolean; error?: string }> => {
    if (!signingKey) {
      // Try to load from storage
      signingKey = loadSigningKey();
      if (!signingKey) {
        return { success: false, error: 'No signing key configured. Set a passphrase first.' };
      }
    }
    signingEnabled = true;
    connectionState.signingEnabled = true;
    safeSend(mainWindow, IPC_CHANNELS.CONNECTION_STATE, connectionState);
    safeSend(mainWindow, IPC_CHANNELS.MAVLINK_SIGNING_STATUS, getSigningStatus());
    sendLog(mainWindow, 'info', 'MAVLink signing enabled');
    recordSigningEvent({
      event: 'signing-enabled',
      actor: 'user',
      fingerprint: signingKey ? signingFingerprint(signingKey) : undefined,
      transport: currentTransport?.portName,
      detail: 'Outgoing packet signing enabled',
    });
    return { success: true };
  });

  // Disable signing on outgoing packets
  ipcMain.handle(IPC_CHANNELS.MAVLINK_SIGNING_DISABLE, async (): Promise<{ success: boolean }> => {
    signingEnabled = false;
    connectionState.signingEnabled = false;
    safeSend(mainWindow, IPC_CHANNELS.CONNECTION_STATE, connectionState);
    safeSend(mainWindow, IPC_CHANNELS.MAVLINK_SIGNING_STATUS, getSigningStatus());
    sendLog(mainWindow, 'info', 'MAVLink signing disabled');
    recordSigningEvent({
      event: 'signing-disabled',
      actor: 'user',
      fingerprint: signingKey ? signingFingerprint(signingKey) : undefined,
      transport: currentTransport?.portName,
      detail: 'Outgoing packet signing disabled',
    });
    return { success: true };
  });

  // Get current signing status
  ipcMain.handle(IPC_CHANNELS.MAVLINK_SIGNING_GET_STATUS, async (): Promise<SigningStatus> => {
    // Try loading key from storage if not in memory
    if (!signingKey) {
      signingKey = loadSigningKey();
    }
    return getSigningStatus();
  });

  // Send SETUP_SIGNING message to the flight controller
  ipcMain.handle(IPC_CHANNELS.MAVLINK_SIGNING_SEND_TO_FC, async (): Promise<{ success: boolean; error?: string }> => {
    if (!currentTransport?.isOpen || !connectionState.isConnected) {
      return { success: false, error: 'Not connected' };
    }
    if (connectionState.protocol !== 'mavlink') {
      return { success: false, error: 'Signing is only available for MAVLink connections' };
    }
    if (detectedMavlinkVersion !== 2) {
      return { success: false, error: 'Signing requires MAVLink v2. This board uses MAVLink v1.' };
    }
    if (!signingKey) {
      return { success: false, error: 'No signing key configured' };
    }

    try {
      const targetSys = connectionState.systemId ?? 1;
      const targetComp = connectionState.componentId ?? 1;

      const payload = serializeSetupSigning({
        targetSystem: targetSys,
        targetComponent: targetComp,
        secretKey: Array.from(signingKey),
        initialTimestamp: getSigningTimestamp(),
      });

      // Send SETUP_SIGNING unsigned (FC doesn't know the key yet)
      // Sent twice for reliability, matching Mission Planner behavior
      const packet = serializeV2(SETUP_SIGNING_ID, payload, SETUP_SIGNING_CRC_EXTRA, {
        sysid: gcsSysid,
        compid: 190,
      });

      await currentTransport.write(packet);
      connectionState.packetsSent++;
      await currentTransport.write(packet);
      connectionState.packetsSent++;

      signingSentToFc = true;
      signingKeyMismatch = false;

      // Auto-enable signing after sending to FC (matches Mission Planner)
      signingEnabled = true;
      connectionState.signingEnabled = true;
      signingStore.set('sentToFc', true);

      const isNetwork = connectionState.connectionType === 'tcp' || connectionState.connectionType === 'udp';
      if (isNetwork) {
        sendLog(mainWindow, 'info', `SETUP_SIGNING sent to FC over network (sys=${targetSys}, comp=${targetComp})`,
          'If using a proxy, consider setting up signing via direct serial connection for reliability.');
      } else {
        sendLog(mainWindow, 'info', `SETUP_SIGNING sent to FC (sys=${targetSys}, comp=${targetComp})`);
      }
      recordSigningEvent({
        event: 'key-sent-to-fc',
        actor: 'user',
        fingerprint: signingFingerprint(signingKey),
        sysid: targetSys,
        transport: currentTransport?.portName,
        detail: isNetwork ? 'SETUP_SIGNING delivered over network link; signing auto-enabled' : 'SETUP_SIGNING delivered over serial link; signing auto-enabled',
      });

      // Verify delivery: wait up to 3 seconds for FC to respond with signed packets
      if (isNetwork && !connectionState.fcSigning) {
        const delivered = await new Promise<boolean>((resolve) => {
          const checkInterval = setInterval(() => {
            if (connectionState.fcSigning) {
              clearInterval(checkInterval);
              resolve(true);
            }
          }, 200);
          setTimeout(() => {
            clearInterval(checkInterval);
            resolve(false);
          }, 3000);
        });
        if (!delivered) {
          sendLog(mainWindow, 'warn', 'SETUP_SIGNING may not have reached the FC.',
            'No signed response received. Retry or configure signing via direct serial connection.');
        }
      }

      safeSend(mainWindow, IPC_CHANNELS.MAVLINK_SIGNING_STATUS, getSigningStatus());
      return { success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Failed to send SETUP_SIGNING', msg);
      return { success: false, error: msg };
    }
  });

  // Disable signing on FC and remove local key
  // Sends SETUP_SIGNING with all-zero key + timestamp=0 to FC (matches Mission Planner)
  ipcMain.handle(IPC_CHANNELS.MAVLINK_SIGNING_REMOVE_KEY, async (): Promise<{ success: boolean; error?: string }> => {
    // If connected to a MAVLink FC, send zero-key SETUP_SIGNING to disable on FC side
    if (currentTransport?.isOpen && connectionState.isConnected && connectionState.protocol === 'mavlink') {
      try {
        const targetSys = connectionState.systemId ?? 1;
        const targetComp = connectionState.componentId ?? 1;
        const payload = serializeSetupSigning({
          targetSystem: targetSys,
          targetComponent: targetComp,
          secretKey: new Array(32).fill(0),
          initialTimestamp: 0n,
        });
        // When signing is active, send SIGNED so the FC accepts it.
        // An unsigned packet would be silently dropped by a signing-enabled FC.
        const packet = signingEnabled && signingKey && detectedMavlinkVersion === 2
          ? serializeV2(SETUP_SIGNING_ID, payload, SETUP_SIGNING_CRC_EXTRA, {
              sysid: gcsSysid,
              compid: 190,
              sign: true,
              signingKey,
              linkId: signingLinkId,
            })
          : serializeV2(SETUP_SIGNING_ID, payload, SETUP_SIGNING_CRC_EXTRA, {
              sysid: gcsSysid,
              compid: 190,
            });
        await currentTransport.write(packet);
        connectionState.packetsSent++;
        await currentTransport.write(packet);
        connectionState.packetsSent++;
        sendLog(mainWindow, 'info', `SETUP_SIGNING (disable) sent to FC (sys=${targetSys}, comp=${targetComp})`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        sendLog(mainWindow, 'error', 'Failed to send disable-signing to FC', msg);
        return { success: false, error: `Failed to disable on FC: ${msg}` };
      }
    }

    // Capture the fingerprint before we drop the key, for the audit trail.
    const removedFingerprint = signingKey ? signingFingerprint(signingKey) : undefined;

    // Clean up local state
    signingKey = null;
    signingEnabled = false;
    signingSentToFc = false;
    signingStore.delete('encryptedKey');
    signingStore.delete('sentToFc');
    connectionState.signingEnabled = false;
    safeSend(mainWindow, IPC_CHANNELS.CONNECTION_STATE, connectionState);
    safeSend(mainWindow, IPC_CHANNELS.MAVLINK_SIGNING_STATUS, getSigningStatus());
    sendLog(mainWindow, 'info', 'MAVLink signing disabled and key removed');
    recordSigningEvent({
      event: 'key-removed',
      actor: 'user',
      fingerprint: removedFingerprint,
      transport: currentTransport?.portName,
      detail: 'Active signing key removed locally (zero-key sent to FC if connected)',
    });
    return { success: true };
  });

  // Return the tamper-evident signing audit log + a live chain verification, for
  // the Compliance view.
  ipcMain.handle(IPC_CHANNELS.MAVLINK_SIGNING_AUDIT_GET, async () => {
    const entries = getAuditLog();
    return { entries, chain: verifyAuditChain(entries), posture: getSecureLinkPosture() };
  });

  // Build and save a secure-link compliance evidence pack: machine-readable JSON
  // plus a human-readable Markdown posture report a buyer can hand to a reviewer.
  ipcMain.handle(IPC_CHANNELS.MAVLINK_SIGNING_EVIDENCE_EXPORT, async (): Promise<{ success: boolean; error?: string; path?: string }> => {
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const dlg = await dialog.showSaveDialog(mainWindow, {
        title: 'Export Secure Link Evidence Pack',
        defaultPath: `ardudeck-secure-link-evidence-${stamp}.json`,
        filters: [
          { name: 'Evidence Pack (JSON)', extensions: ['json'] },
          { name: 'Posture Report (Markdown)', extensions: ['md'] },
        ],
      });
      if (dlg.canceled || !dlg.filePath) return { success: false, error: 'Cancelled' };

      const pack = buildEvidencePack({
        posture: getSecureLinkPosture(),
        connection: {
          connected: connectionState.isConnected,
          transport: currentTransport?.portName,
          sysid: connectionState.systemId,
          mavlinkVersion: detectedMavlinkVersion,
          boardUid: connectionState.boardUid ?? null,
        },
        app: {
          name: app.getName(),
          version: app.getVersion(),
          platform: `${process.platform} ${process.arch}`,
          electron: process.versions.electron ?? 'unknown',
        },
        generatedAt: Date.now(),
      });

      const fs = await import('fs/promises');
      // The reviewer-facing report goes alongside the JSON regardless of which
      // extension they picked, so they always get both the data and the readable
      // summary. The chosen path drives which one opens by default.
      const isMd = dlg.filePath.toLowerCase().endsWith('.md');
      const jsonPath = isMd ? dlg.filePath.replace(/\.md$/i, '.json') : dlg.filePath;
      const mdPath = isMd ? dlg.filePath : dlg.filePath.replace(/\.json$/i, '.md');
      await fs.writeFile(jsonPath, JSON.stringify(pack, null, 2), 'utf-8');
      await fs.writeFile(mdPath, renderPostureReport(pack), 'utf-8');
      sendLog(mainWindow, 'info', `Secure-link evidence pack exported (${pack.auditLog.length} audit entries, chain ${pack.chain.ok ? 'verified' : 'BROKEN'})`);
      return { success: true, path: dlg.filePath };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: msg };
    }
  });

  // Parameter management handlers

  /**
   * Request parameters via traditional PARAM_REQUEST_LIST (fallback path).
   * Sends the MAVLink message and lets the PARAM_VALUE handler in parseTelemetry
   * stream results back to the renderer.
   */
  async function requestParamsTraditional(): Promise<{ success: boolean; error?: string }> {
    receivedParams.clear();
    receivedParamIndices.clear();
    expectedParamCount = 0;
    paramListRetries = 0;
    paramStalledRounds = 0;
    paramProgressAtLastStall = 0;
    paramInactivityMs = paramInactivityTimeoutMs(lastConnectOptions);
    paramGapRoundMs = paramGapRoundTimeoutMs(lastConnectOptions);
    paramGapFillMode = false;
    paramGapCursor = 0;
    paramRoundPending.clear();
    const slowSerial = lastConnectOptions?.type === 'serial' && (lastConnectOptions.baudRate ?? 115200) <= 57600;
    paramGapChunk = slowSerial ? 20 : 60;
    paramGapSendGapMs = slowSerial ? 30 : 0;
    paramDownloadActive = true;
    paramDownloadStartTime = Date.now();

    if (paramDownloadTimeout) {
      clearTimeout(paramDownloadTimeout);
      paramDownloadTimeout = null;
    }

    try {
      const targetSys = connectionState.systemId ?? 1;
      const targetComp = 1; // MAV_COMP_ID_AUTOPILOT1

      const payload = serializeParamRequestList({
        targetSystem: targetSys,
        targetComponent: targetComp,
      });

      const packet = await sendMavlinkPacket(PARAM_REQUEST_LIST_ID, payload, PARAM_REQUEST_LIST_CRC_EXTRA);
      await currentTransport!.write(packet);
      connectionState.packetsSent++;

      sendLog(mainWindow, 'info', 'Requesting parameters (traditional PARAM_REQUEST_LIST)...');

      armParamInactivityTimer(mainWindow);

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Failed to request parameters', message);
      return { success: false, error: message };
    }
  }

  /**
   * Try downloading parameters via MAVLink FTP (fast path).
   * Downloads @PARAM/param.pck and parses the packed binary format.
   * Returns true if successful (params sent to renderer), false to trigger fallback.
   */
  async function requestParamsViaFtp(): Promise<boolean> {
    const ftpStartTime = Date.now();
    const targetSys = connectionState.systemId ?? 1;
    const targetComp = 1;

    // Create FTP client if needed
    ftpClient = new MavlinkFtpClient({
      sendPacket: async (ftpPayload: Uint8Array) => {
        // Wrap FTP payload in FILE_TRANSFER_PROTOCOL MAVLink message
        const ftpMsg = serializeFileTransferProtocol({
          targetNetwork: 0,
          targetSystem: targetSys,
          targetComponent: targetComp,
          payload: Array.from(ftpPayload),
        });

        const packet = await sendMavlinkPacket(FILE_TRANSFER_PROTOCOL_ID, ftpMsg, FILE_TRANSFER_PROTOCOL_CRC_EXTRA);
        await currentTransport!.write(packet);
        connectionState.packetsSent++;
      },
      log: (level, message) => {
        sendLog(mainWindow, level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'debug', message);
      },
    });

    // Download the packed parameter file
    const fileData = await ftpClient.downloadFile(
      PARAM_PCK_PATH,
      (received, total) => {
        const percentage = total > 0 ? Math.round((received / total) * 100) : 0;
        safeSend(mainWindow, IPC_CHANNELS.PARAM_PROGRESS, {
          total: 0, // We don't know param count yet during FTP download
          received: 0,
          percentage,
        });
      },
    );

    // Cleanup FTP client
    ftpClient = null;

    if (!fileData || fileData.length === 0) {
      return false;
    }

    // Parse the packed parameter file
    const result = parseParamPack(fileData);
    if (!result || result.params.length === 0) {
      sendLog(mainWindow, 'warn', 'FTP: param.pck parse failed or empty');
      return false;
    }
    // A truncated pck decodes cleanly up to the cut and used to be delivered
    // as the full set, leaving the renderer with silently missing params
    // (e.g. PID tab failing scheme detection until a manual refresh). Treat
    // incomplete as failure so the traditional download (with gap-fill
    // recovery) takes over.
    if (!result.complete || result.params.length < result.totalParams) {
      sendLog(mainWindow, 'warn',
        `FTP: param.pck incomplete (${result.params.length}/${result.totalParams}), falling back to traditional download`);
      return false;
    }

    const ftpElapsed = ((Date.now() - ftpStartTime) / 1000).toFixed(1);
    sendLog(mainWindow, 'info', `Downloaded ${result.params.length} parameters via MAVLink FTP in ${ftpElapsed}s`);

    // Build bulk payload and populate receivedParams for PARAM_SET validation
    receivedParams.clear();
    expectedParamCount = result.totalParams;
    const paramCount = result.params.length;
    const bulkPayload: ParamValuePayload[] = [];

    for (let i = 0; i < paramCount; i++) {
      const p = result.params[i]!;
      const entry: ParamValuePayload = {
        paramId: p.name,
        paramValue: p.value,
        paramType: p.type,
        paramCount: result.totalParams,
        paramIndex: i,
        defaultValue: p.defaultValue,
      };

      receivedParams.set(p.name, entry);
      bulkPayload.push(entry);
    }

    // Single IPC event with all params — renderer applies in one state update
    safeSend(mainWindow, IPC_CHANNELS.PARAM_BULK_LOAD, bulkPayload);

    return true;
  }

  // Request all parameters from flight controller
  // Strategy: try MAVLink FTP first (fast), fall back to PARAM_REQUEST_LIST (universal)
  // Let main-process callers (the MCP test driver) start a download without
  // going through the renderer. Reading parameters must not depend on which
  // view happens to be mounted.
  requestAllParametersFromMain = async () => {
    if (!currentTransport?.isOpen || !connectionState.isConnected) {
      return { success: false, error: 'Not connected' };
    }
    if (detectedMavlinkVersion === 2 && connectionState.firmware !== 'px4') {
      try {
        if (await requestParamsViaFtp()) return { success: true };
      } catch { /* fall through to the streamed path */ }
    }
    return requestParamsTraditional();
  };

  ipcMain.handle(IPC_CHANNELS.PARAM_REQUEST_ALL, async (): Promise<{ success: boolean; error?: string }> => {
    if (!currentTransport?.isOpen || !connectionState.isConnected) {
      return { success: false, error: 'Not connected' };
    }

    // Guard against concurrent requests (renderer may fire multiple times on connect)
    if (paramRequestInFlight) {
      return { success: true }; // Already in progress
    }
    paramRequestInFlight = true;

    try {
      // Only attempt FTP on MAVLink v2 connections (FTP requires v2).
      // Skip it on PX4 outright: @PARAM/param.pck is an ArduPilot virtual
      // file, so on PX4 the fast path can only ever burn its open-timeout
      // before falling back — a guaranteed connect-time stall for nothing.
      if (detectedMavlinkVersion === 2 && connectionState.firmware !== 'px4') {
        try {
          sendLog(mainWindow, 'info', 'Requesting parameters via MAVLink FTP (fast path)...');
          const ftpSuccess = await requestParamsViaFtp();
          if (ftpSuccess) {
            return { success: true };
          }
          sendLog(mainWindow, 'info', 'FTP not available, falling back to traditional parameter download...');
        } catch (err) {
          sendLog(mainWindow, 'debug', `FTP attempt failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // Fallback: traditional PARAM_REQUEST_LIST
      return requestParamsTraditional();
    } finally {
      paramRequestInFlight = false;
    }
  });

  // Set a single parameter
  ipcMain.handle(IPC_CHANNELS.PARAM_SET, async (_, paramId: string, value: number, type: number): Promise<{ success: boolean; error?: string }> => {
    if (!currentTransport?.isOpen || !connectionState.isConnected) {
      return { success: false, error: 'Not connected' };
    }

    try {
      // Check if this param exists on the FC (if we have a param list)
      if (receivedParams.size > 0 && !receivedParams.has(paramId)) {
        sendLog(mainWindow, 'warn', `Parameter "${paramId}" does not exist on this flight controller`);
        return { success: false, error: `Parameter "${paramId}" not found on this board. Use the Parameters list to see available parameters.` };
      }

      // Build PARAM_SET message
      const setType = resolveParamSetType(type);
      const payload = serializeParamSet({
        targetSystem: connectionState.systemId ?? 1,
        targetComponent: 1, // MAV_COMP_ID_AUTOPILOT1
        paramId,
        paramValue: value,
        paramType: setType,
      });
      // PX4 expects integer params bytewise (raw int bits in the value field);
      // ArduPilot keeps the float32 (by-value) bytes written above.
      if (connectionState.firmware === 'px4') {
        encodePx4ParamSetValue(payload, value, setType);
      }

      // Use detected MAVLink version for compatibility (with signing if enabled)
      const packet = await sendMavlinkPacket(PARAM_SET_ID, payload, PARAM_SET_CRC_EXTRA);

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

  // Set multiple parameters in rapid succession (batch mode for file import)
  // Fires all PARAM_SET messages with minimal delay instead of waiting for each confirmation.
  // The FC echoes PARAM_VALUE for each accepted param which the renderer handles via the
  // existing onParamValue listener. We collect confirmations here to report success/fail counts.
  ipcMain.handle(IPC_CHANNELS.PARAM_SET_BATCH, async (_, params: Array<{ paramId: string; value: number; type: number }>): Promise<{
    success: boolean;
    sent: number;
    confirmed: number;
    failed: string[];
    error?: string;
  }> => {
    if (!currentTransport?.isOpen || !connectionState.isConnected) {
      return { success: false, sent: 0, confirmed: 0, failed: [], error: 'Not connected' };
    }

    if (params.length === 0) {
      return { success: true, sent: 0, confirmed: 0, failed: [] };
    }

    sendLog(mainWindow, 'info', `Batch setting ${params.length} parameters...`);

    const pendingConfirms = new Set<string>();
    const failed: string[] = [];
    let sent = 0;
    let confirmedCount = 0;
    // Guards the polling resolve from firing on an empty pendingConfirms
    // BEFORE the send loop has had a chance to enqueue everything. Without
    // this, the interval can resolve at the first tick where size === 0
    // (either at startup, or transiently between sends if the FC echoes
    // PARAM_VALUE faster than we can queue the next PARAM_SET) and the
    // remaining params are silently abandoned and counted as failed.
    let allSent = false;

    // Stream progress to the renderer so the compare modal's progress bar
    // can advance during the batch instead of jumping 0 → 100% at the end.
    // sent  = how many PARAM_SET messages we've put on the wire (write-side)
    // confirmed = how many got a PARAM_VALUE echo back from the FC (read-side)
    const emitProgress = () => {
      safeSend(mainWindow, IPC_CHANNELS.PARAM_SET_BATCH_PROGRESS, {
        sent,
        confirmed: confirmedCount,
        total: params.length,
      });
    };
    emitProgress();

    // Track confirmations via PARAM_VALUE responses echoed by the FC.
    // The main message loop already updates receivedParams on each PARAM_VALUE.
    // We poll receivedParams to detect when values match what we sent.
    const timeoutMs = Math.max(5000, params.length * 200);
    const confirmPromise = new Promise<void>((resolve) => {
      const deadline = Date.now() + timeoutMs;

      const intervalCheck = setInterval(() => {
        let confirmedThisTick = 0;
        for (const id of [...pendingConfirms]) {
          const p = params.find(pp => pp.paramId === id);
          if (!p) continue;
          const received = receivedParams.get(id);
          if (received && Math.fround(received.paramValue) === Math.fround(p.value)) {
            pendingConfirms.delete(id);
            confirmedCount++;
            confirmedThisTick++;
          }
        }
        if (confirmedThisTick > 0) emitProgress();
        // Only resolve on size===0 once the send loop has finished enqueuing.
        // Otherwise the deadline is the only exit, which keeps the polling
        // alive for the rest of the batch.
        if ((allSent && pendingConfirms.size === 0) || Date.now() >= deadline) {
          clearInterval(intervalCheck);
          for (const id of pendingConfirms) {
            failed.push(id);
          }
          resolve();
        }
      }, 50);
    });

    // Fire all PARAM_SET messages with small inter-message delays
    try {
      for (const p of params) {
        // Skip params that don't exist on FC
        if (receivedParams.size > 0 && !receivedParams.has(p.paramId)) {
          failed.push(p.paramId);
          continue;
        }

        try {
          const setType = resolveParamSetType(p.type);
          const payload = serializeParamSet({
            targetSystem: connectionState.systemId ?? 1,
            targetComponent: 1,
            paramId: p.paramId,
            paramValue: p.value,
            paramType: setType,
          });
          if (connectionState.firmware === 'px4') {
            encodePx4ParamSetValue(payload, p.value, setType);
          }

          const packet = await sendMavlinkPacket(PARAM_SET_ID, payload, PARAM_SET_CRC_EXTRA);
          await currentTransport.write(packet);
          connectionState.packetsSent++;
          pendingConfirms.add(p.paramId);
          sent++;
          emitProgress();

          // Small delay between messages to avoid overwhelming the FC serial buffer
          if (sent < params.length) {
            await new Promise(r => setTimeout(r, 20));
          }
        } catch {
          failed.push(p.paramId);
        }
      }
    } finally {
      allSent = true;
    }

    // Wait for confirmations (or timeout)
    await confirmPromise;

    const confirmed = sent - pendingConfirms.size;
    sendLog(mainWindow, 'info', `Batch complete: ${confirmed}/${sent} confirmed, ${failed.length} failed`);

    return {
      success: failed.length === 0,
      sent,
      confirmed,
      failed,
    };
  });

  // Read a batch of specific params by name. Used by post-calibration
  // verification to fetch FRESH values from the FC (the renderer's param
  // cache may still hold pre-cal values for INS_* and friends because
  // the FC doesn't broadcast PARAM_VALUE on internal cal saves).
  //
  // Sends one PARAM_REQUEST_READ per name in parallel and waits for the
  // matching PARAM_VALUE responses via the pendingParamReads map. Each
  // read is bounded by a 1500ms timeout so a missing-on-this-board param
  // (e.g. INS_ACC3* on a single-IMU board) doesn't block the whole batch.
  /**
   * Read named parameters straight off the vehicle, one PARAM_REQUEST_READ
   * each. Shared by PARAM_READ_BATCH and the post-reboot calibration check,
   * which must NOT trust the renderer's parameter cache: the cache is what the
   * FC said before the reboot, and the whole point is to find out what it says
   * now. Missing params are simply absent from the result.
   */
  const readParamsFromVehicle = async (paramIds: string[]): Promise<Record<string, number>> => {
    if (!currentTransport?.isOpen || !connectionState.isConnected) return {};
    const targetSystem = connectionState.systemId ?? 1;
    const PER_PARAM_TIMEOUT_MS = 1500;

    const readOne = (paramId: string): Promise<number | null> => new Promise((resolve) => {
      const timer = setTimeout(() => {
        pendingParamReads.delete(paramId);
        resolve(null);
      }, PER_PARAM_TIMEOUT_MS);

      pendingParamReads.set(paramId, (value) => {
        clearTimeout(timer);
        resolve(value);
      });

      (async () => {
        try {
          const reqPayload = serializeParamRequestRead({
            targetSystem,
            targetComponent: 1,
            paramId,
            paramIndex: -1,
          });
          const packet = await sendMavlinkPacket(PARAM_REQUEST_READ_ID, reqPayload, PARAM_REQUEST_READ_CRC_EXTRA);
          await currentTransport!.write(packet);
          connectionState.packetsSent++;
        } catch {
          clearTimeout(timer);
          pendingParamReads.delete(paramId);
          resolve(null);
        }
      })();
    });

    const results = await Promise.all(paramIds.map(readOne));
    const values: Record<string, number> = {};
    paramIds.forEach((id, i) => {
      const v = results[i];
      if (v !== null && v !== undefined) values[id] = v;
    });
    return values;
  };

  /** Record what a calibration wrote, so the reboot can be checked against it. */
  ipcMain.handle(IPC_CHANNELS.CALIBRATION_RECORD_SAVE, (_, boardUid: string, record: CalibrationRecord) => {
    if (!boardUid) return { success: false, error: 'No board identity' };
    const boards = calibrationRecordStore.get('boards');
    // One record per calibration type: the latest run is the one that matters.
    const existing = (boards[boardUid] ?? []).filter((r) => r.type !== record.type);
    boards[boardUid] = [record, ...existing].slice(0, 12);
    calibrationRecordStore.set('boards', boards);
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.CALIBRATION_RECORD_LIST, (_, boardUid: string): CalibrationRecord[] => {
    if (!boardUid) return [];
    return calibrationRecordStore.get('boards')[boardUid] ?? [];
  });

  /**
   * Read the calibration back off the vehicle and compare it with what was
   * written. This is the check that closes the "FC rebooted, so it must be
   * fine" gap: nothing else proves the values survived.
   */
  ipcMain.handle(IPC_CHANNELS.CALIBRATION_RECORD_VERIFY, async (_, boardUid: string): Promise<{
    success: boolean;
    records?: CalibrationRecord[];
    error?: string;
  }> => {
    if (!boardUid) return { success: false, error: 'No board identity' };
    if (!currentTransport?.isOpen || !connectionState.isConnected) {
      return { success: false, error: 'Not connected' };
    }

    const boards = calibrationRecordStore.get('boards');
    const records = boards[boardUid] ?? [];
    const unchecked = records.filter((r) => r.persistence === null);
    if (unchecked.length === 0) return { success: true, records };

    const names = [...new Set(unchecked.flatMap((r) => Object.keys(r.written)))];
    const readBack = await readParamsFromVehicle(names);
    const checkedAt = Date.now();

    boards[boardUid] = records.map((record) => {
      if (record.persistence !== null) return record;
      const result = verifyCalibrationPersisted(record.written, readBack);
      if (result.state === 'unverified') return record; // try again next connect
      sendLog(
        mainWindow,
        result.state === 'verified' ? 'info' : 'error',
        `Calibration check (${record.type}): ${result.summary}`,
      );
      // A calibration the reboot threw away is a flight-safety fact, so it goes
      // to the Messages panel at CRITICAL, where the voice announcer picks it
      // up too. A log line is exactly what gets missed.
      if (result.state !== 'verified' && mainWindow) {
        emitStatusText(mainWindow, 2, `${record.type} calibration did NOT survive the reboot. Recalibrate before flying.`);
      }
      return { ...record, persistence: { ...result, checkedAt } };
    });
    calibrationRecordStore.set('boards', boards);

    return { success: true, records: boards[boardUid] };
  });

  ipcMain.handle(IPC_CHANNELS.PARAM_READ_BATCH, async (_, paramIds: string[]): Promise<{
    success: boolean;
    values: Record<string, number>;
    types: Record<string, number>;
    missing: string[];
    error?: string;
  }> => {
    if (!currentTransport?.isOpen || !connectionState.isConnected) {
      return { success: false, values: {}, types: {}, missing: paramIds, error: 'Not connected' };
    }
    if (!Array.isArray(paramIds) || paramIds.length === 0) {
      return { success: true, values: {}, types: {}, missing: [] };
    }

    const targetSystem = connectionState.systemId ?? 1;
    const targetComponent = 1;
    const PER_PARAM_TIMEOUT_MS = 1500;

    const readOne = (paramId: string): Promise<{ value: number; type: number } | null> => new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (pendingParamReads.get(paramId)) {
          pendingParamReads.delete(paramId);
        }
        resolve(null); // missing — treat as "param not on this FC"
      }, PER_PARAM_TIMEOUT_MS);

      pendingParamReads.set(paramId, (value, type) => {
        clearTimeout(timer);
        resolve({ value, type });
      });

      // Fire the PARAM_REQUEST_READ. Errors during send fall through to
      // the timeout — we don't want a single bad param to crash the batch.
      (async () => {
        try {
          const reqPayload = serializeParamRequestRead({
            targetSystem,
            targetComponent,
            paramId,
            paramIndex: -1,
          });
          const packet = await sendMavlinkPacket(PARAM_REQUEST_READ_ID, reqPayload, PARAM_REQUEST_READ_CRC_EXTRA);
          await currentTransport!.write(packet);
          connectionState.packetsSent++;
        } catch {
          clearTimeout(timer);
          pendingParamReads.delete(paramId);
          resolve(null);
        }
      })();
    });

    const results = await Promise.all(paramIds.map(readOne));
    const values: Record<string, number> = {};
    const types: Record<string, number> = {};
    const missing: string[] = [];
    paramIds.forEach((id, i) => {
      const v = results[i];
      if (v === null || v === undefined) {
        missing.push(id);
      } else {
        values[id] = v.value;
        types[id] = v.type;
      }
    });

    return { success: true, values, types, missing };
  });

  // Fetch parameter metadata from ArduPilot
  ipcMain.handle(IPC_CHANNELS.PARAM_METADATA_FETCH, async (_, mavType: number): Promise<{ success: boolean; metadata?: ParameterMetadataStore; error?: string }> => {
    // PX4 has no live XML endpoint - serve the bundled QGC JSON instead.
    // Metadata is per-firmware, not per-vehicle, so we key the cache on 'px4'.
    if (connectionState.firmware === 'px4') {
      // Ask the vehicle for its OWN definitions in the background. That covers
      // custom and newer builds the bundled file predates; when it lands it is
      // pushed over PARAM_METADATA_RESULT. Never block the UI on it: the
      // transfer runs over MAVLink FTP and can take a while on a slow link.
      if (mainWindow) void refreshPx4ComponentMetadata(mainWindow);

      const cached = px4VehicleParamMetadata ?? metadataCache.get('px4');
      if (cached) {
        return { success: true, metadata: cached };
      }
      const metadata = getPx4ParameterMetadata();
      metadataCache.set('px4', metadata);
      sendLog(mainWindow, 'info', `Loaded ${Object.keys(metadata).length} PX4 parameter definitions from bundled metadata`);
      return { success: true, metadata };
    }

    const vehicleType = mavTypeToVehicleType(mavType);
    if (!vehicleType) {
      return { success: false, error: `Unknown vehicle type: ${mavType}` };
    }

    // Check in-memory cache first
    const cached = metadataCache.get(vehicleType);
    if (cached) {
      sendLog(mainWindow, 'info', `Using cached parameter metadata for ${vehicleType}`);
      return { success: true, metadata: cached };
    }

    // Check disk cache (survives app restarts, works offline)
    const cacheDir = join(app.getPath('userData'), 'param-metadata-cache');
    const cacheFile = join(cacheDir, `${vehicleType}.json`);
    const maxCacheAge = 7 * 24 * 60 * 60 * 1000; // 7 days

    let diskCacheMetadata: ParameterMetadataStore | null = null;
    try {
      const { stat } = await import('node:fs/promises');
      const fileStat = await stat(cacheFile);
      const age = Date.now() - fileStat.mtimeMs;
      if (age < maxCacheAge) {
        const data = await readFile(cacheFile, 'utf-8');
        diskCacheMetadata = JSON.parse(data) as ParameterMetadataStore;
        metadataCache.set(vehicleType, diskCacheMetadata);
        sendLog(mainWindow, 'info', `Loaded ${Object.keys(diskCacheMetadata).length} parameter definitions for ${vehicleType} from disk cache`);
        return { success: true, metadata: diskCacheMetadata };
      }
      // Cache exists but stale - keep reference as fallback
      const data = await readFile(cacheFile, 'utf-8');
      diskCacheMetadata = JSON.parse(data) as ParameterMetadataStore;
    } catch {
      // No disk cache or read error - continue to fetch
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

      // Cache in memory
      metadataCache.set(vehicleType, metadata);

      // Cache to disk
      try {
        const { mkdir } = await import('node:fs/promises');
        await mkdir(cacheDir, { recursive: true });
        await writeFile(cacheFile, JSON.stringify(metadata));
      } catch {
        // Non-critical - disk cache write failed
      }

      sendLog(mainWindow, 'info', `Loaded ${Object.keys(metadata).length} parameter definitions for ${vehicleType}`);
      return { success: true, metadata };
    } catch (error) {
      // Network fetch failed - use stale disk cache if available
      if (diskCacheMetadata) {
        metadataCache.set(vehicleType, diskCacheMetadata);
        sendLog(mainWindow, 'warn', `Offline - using cached parameter metadata for ${vehicleType} (may be outdated)`);
        return { success: true, metadata: diskCacheMetadata };
      }
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

      const packet = await sendMavlinkPacket(COMMAND_LONG_ID, payload, COMMAND_LONG_CRC_EXTRA);

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

  // Reboot the flight controller via MAVLink
  // Sends MAV_CMD_PREFLIGHT_REBOOT_SHUTDOWN (246) with param1=1 (normal reboot).
  // SITL caveat: ArduPilot SITL handles this command by calling exit() — it
  // does NOT respawn itself. So for SITL we skip the MAVLink command entirely
  // and just restart the child process; the new SITL boots from the just-saved
  // eeprom.bin so any prior PARAM_SET / PREFLIGHT_STORAGE work persists.
  ipcMain.handle(IPC_CHANNELS.MAVLINK_REBOOT, async (): Promise<boolean> => {
    if (!currentTransport?.isOpen || !connectionState.isConnected) {
      return false;
    }

    const isArdupilotSitl = !!connectionState.isSitl && ardupilotSitlProcess.isRunning;

    try {
      // Schedule auto-reconnect FIRST so the transport-close handler treats
      // the impending disconnect as expected rather than tearing down state
      // we still need (matches the pattern in ftpUpload's SITL path above).
      scheduleReconnect({
        reason: isArdupilotSitl ? 'Restarting SITL to apply changes' : 'Rebooting flight controller',
        delayMs: isArdupilotSitl ? 6000 : 3000,
        timeoutMs: 60000,
        maxAttempts: isArdupilotSitl ? 40 : 30,
      });

      if (isArdupilotSitl) {
        sendLog(mainWindow, 'info', 'Restarting SITL process (MAVLink reboot kills SITL without respawn)');
        const restartResult = await ardupilotSitlProcess.restart();
        if (!restartResult.success) {
          cancelReconnect(`SITL restart failed: ${restartResult.error ?? 'unknown error'}`);
          sendLog(mainWindow, 'error', 'SITL restart failed', restartResult.error ?? 'unknown error');
          return false;
        }
        return true;
      }

      const payload = serializeCommandLong({
        targetSystem: connectionState.systemId ?? 1,
        targetComponent: 1,
        command: 246, // MAV_CMD_PREFLIGHT_REBOOT_SHUTDOWN
        confirmation: 0,
        param1: 1, // 1 = normal reboot autopilot
        param2: 0,
        param3: 0,
        param4: 0,
        param5: 0,
        param6: 0,
        param7: 0,
      });

      const packet = await sendMavlinkPacket(COMMAND_LONG_ID, payload, COMMAND_LONG_CRC_EXTRA);
      await currentTransport.write(packet);
      connectionState.packetsSent++;

      sendLog(mainWindow, 'info', 'Sent reboot command to flight controller');

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Failed to reboot flight controller', message);
      return false;
    }
  });

  // ARM / DISARM via MAV_CMD_COMPONENT_ARM_DISARM (command 400)
  ipcMain.handle(IPC_CHANNELS.MAVLINK_ARM_DISARM, async (_, arm: boolean, force?: boolean): Promise<boolean> => {
    const target = activeFlightTarget();
    if (!target) {
      // Don't fail silently — this reads as a dead button otherwise.
      emitStatusText(mainWindow, 4, `Cannot ${arm ? 'arm' : 'disarm'}: no active vehicle`);
      sendLog(mainWindow, 'warn', `${arm ? 'ARM' : 'DISARM'} ignored: no active flight target`);
      return false;
    }

    try {
      // When arming without a transmitter, ArduPilot needs RC input.
      // Auto-start the SITL RC sender if SITL is running so ArduPilot
      // gets continuous 50Hz RC input and doesn't trigger RC failsafe.
      if (arm && ardupilotSitlProcess.isRunning && !ardupilotRcSender.isRunning
          && !ardupilotRcSender.hasExternalSource) {
        ardupilotRcSender.start();
        sendLog(mainWindow, 'info', 'Auto-started RC sender for SITL arming');
        // Give ArduPilot time to see RC input before arm command
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Also send a one-shot RC_CHANNELS_OVERRIDE via MAVLink as a fallback for
      // arming without a transmitter. Aux channels MUST be UINT16_MAX ("ignore")
      // or we hijack FLTMODE_CH and can slam the vehicle into a non-armable mode
      // right as we arm (this bit rovers, whose FLTMODE_CH commonly sits in 5-8).
      // Only stand in for a missing transmitter. With a handset actually driving RC, this
      // override would OUTRANK it and freeze the sticks at centre/idle the moment we armed.
      if (arm && !ardupilotRcSender.hasExternalSource) {
        const IGNORE = 65535;
        const rcPayload = serializeRcChannelsOverride({
          targetSystem: target.sysid,
          targetComponent: 1,
          chan1Raw: 1500, // Roll center
          chan2Raw: 1500, // Pitch center
          chan3Raw: 1000, // Throttle low
          chan4Raw: 1500, // Yaw center
          chan5Raw: IGNORE, chan6Raw: IGNORE, chan7Raw: IGNORE, chan8Raw: IGNORE,
          chan9Raw: IGNORE, chan10Raw: IGNORE, chan11Raw: IGNORE, chan12Raw: IGNORE,
          chan13Raw: IGNORE, chan14Raw: IGNORE, chan15Raw: IGNORE, chan16Raw: IGNORE,
          chan17Raw: IGNORE, chan18Raw: IGNORE,
        });
        const rcPacket = await sendMavlinkPacket(RC_CHANNELS_OVERRIDE_ID, rcPayload, RC_CHANNELS_OVERRIDE_CRC_EXTRA, { link: target.transport });
        await target.transport.write(rcPacket);
        // Give ArduPilot time to process the RC input
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      const payload = serializeCommandLong({
        targetSystem: target.sysid,
        targetComponent: 1,
        command: 400, // MAV_CMD_COMPONENT_ARM_DISARM
        confirmation: 0,
        param1: arm ? 1 : 0,      // 1 = arm, 0 = disarm
        param2: force ? 21196 : 0, // ArduPilot: 21196 = force arm/disarm (bypass safety checks)
        param3: 0,
        param4: 0,
        param5: 0,
        param6: 0,
        param7: 0,
      });

      const packet = await sendMavlinkPacket(COMMAND_LONG_ID, payload, COMMAND_LONG_CRC_EXTRA, { link: target.transport });
      await target.transport.write(packet);
      connectionState.packetsSent++;

      sendLog(mainWindow, 'info', `Sent ${arm ? 'ARM' : 'DISARM'} command${force ? ' (FORCE)' : ''} to sysid ${target.sysid}`);

      // Watchdog: the FC always ACKs COMMAND 400. If none arrives, the command
      // isn't reaching the vehicle (wrong sysid, one-way link, mode reject) —
      // surface that instead of leaving the operator staring at a silent button.
      if (armAckWatchdog) clearTimeout(armAckWatchdog);
      armAckWatchdog = setTimeout(() => {
        armAckWatchdog = null;
        emitStatusText(mainWindow, 4, `No response to ${arm ? 'ARM' : 'DISARM'} from sysid ${target.sysid} — check flight mode, sysid and link`);
      }, 3000);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', `Failed to ${arm ? 'arm' : 'disarm'}`, message);
      return false;
    }
  });

  // Switch ArduPilot flight mode. We send BOTH:
  //   1. MAV_CMD_DO_SET_MODE (command 176) via COMMAND_LONG — the modern,
  //      universally-supported path. FCU returns COMMAND_ACK so we know
  //      whether it took. This is what Mission Planner, QGC, and every
  //      current GCS use.
  //   2. The legacy SET_MODE message (msg 11) as a follow-up — some older
  //      ArduPilot builds and certain edge states accept the message but
  //      not the command. Belt-and-suspenders.
  // Symptom that drove us here: from a disarmed RTL state on a tailsitter,
  // legacy SET_MODE alone was being silently dropped — user couldn't get
  // out of RTL to arm. The COMMAND_LONG path resolves it.
  ipcMain.handle(IPC_CHANNELS.MAVLINK_SET_MODE, async (_, customMode: number): Promise<boolean> => {
    const target = activeFlightTarget();
    if (!target) {
      return false;
    }

    try {
      const armedBit = lastReportedArmed ? 128 : 0;
      const baseMode = 1 | armedBit; // MAV_MODE_FLAG_CUSTOM_MODE_ENABLED + armed bit

      // DO_SET_MODE param semantics differ by firmware. ArduPilot reads the
      // whole custom mode number from param2. PX4's commander casts param2 to
      // a uint8 MAIN mode and param3 to the SUB mode, so handing it the packed
      // 32-bit value ((main<<16)|(sub<<24)) truncates to main=0 and the switch
      // is silently refused. Unpack for PX4.
      const isPx4Mode = connectionState.firmware === 'px4';
      const px4Main = (customMode >> 16) & 0xff;
      const px4Sub = (customMode >> 24) & 0xff;

      // 1. MAV_CMD_DO_SET_MODE — preferred path
      const cmdPayload = serializeCommandLong({
        targetSystem: target.sysid,
        targetComponent: 1,
        command: 176, // MAV_CMD_DO_SET_MODE
        confirmation: 0,
        param1: baseMode,
        param2: isPx4Mode ? px4Main : customMode,
        param3: isPx4Mode ? px4Sub : 0,
        param4: 0,
        param5: 0,
        param6: 0,
        param7: 0,
      });
      const cmdPacket = await sendMavlinkPacket(COMMAND_LONG_ID, cmdPayload, COMMAND_LONG_CRC_EXTRA, { link: target.transport });
      await target.transport.write(cmdPacket);
      connectionState.packetsSent++;

      // 2. Legacy SET_MODE — fallback for older builds that don't honor cmd 176
      const setModePayload = serializeSetMode({
        targetSystem: target.sysid,
        baseMode,
        customMode,
      });
      const setModePacket = await sendMavlinkPacket(SET_MODE_ID, setModePayload, SET_MODE_CRC_EXTRA, { link: target.transport });
      await target.transport.write(setModePacket);
      connectionState.packetsSent++;

      sendLog(mainWindow, 'info', `Sent SET_MODE customMode=${customMode} (DO_SET_MODE + legacy) to sysid ${target.sysid}`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Failed to set mode', message);
      return false;
    }
  });

  // MAV_CMD_NAV_VTOL_TAKEOFF (command 84) — vertical takeoff for VTOL /
  // tailsitter / quadplane. Vehicle hovers up to `altitude` and holds
  // position.
  //
  // CRITICAL: must be sent via COMMAND_INT (msg 75), NOT COMMAND_LONG
  // (msg 76). NAV_VTOL_TAKEOFF carries an altitude in z; ArduPilot reads the
  // surrounding frame to know whether that's MSL or home-relative. With
  // COMMAND_LONG there is no frame field — ArduPilot defaults to absolute
  // MSL on this command, so `z=10m` means "fly to 10m AMSL". Home is
  // typically at >10m MSL → target is "below current alt" → FCU declares
  // takeoff complete instantly, motors spin briefly then drop to 0%, vehicle
  // sits there armed in the post-takeoff state. Using COMMAND_INT with
  // MAV_FRAME_GLOBAL_RELATIVE_ALT_INT (frame=6) makes the altitude relative
  // to home, which is what every GCS expects.
  // Sending plain NAV_TAKEOFF (22) to a tail-standing aircraft pitches it
  // forward into the ground — separate IPC keeps the call sites unambiguous
  // about which one they want.
  ipcMain.handle(IPC_CHANNELS.MAVLINK_COMMAND_VTOL_TAKEOFF, async (_, altitude: number): Promise<boolean> => {
    const target = activeFlightTarget();
    if (!target) {
      return false;
    }
    try {
      const payload = serializeCommandInt({
        targetSystem: target.sysid,
        targetComponent: 1,
        frame: 6,         // MAV_FRAME_GLOBAL_RELATIVE_ALT_INT
        command: 84,      // MAV_CMD_NAV_VTOL_TAKEOFF
        current: 0,
        autocontinue: 0,
        // param1 (transition heading): 0 = use vehicle's current heading
        param1: 0,
        param2: 0,
        param3: 0,
        param4: 0,
        x: 0,             // lat unused for VTOL takeoff (climbs in place)
        y: 0,             // lon unused for VTOL takeoff
        z: altitude,      // home-relative metres
      });
      const packet = await sendMavlinkPacket(COMMAND_INT_ID, payload, COMMAND_INT_CRC_EXTRA, { link: target.transport });
      await target.transport.write(packet);
      connectionState.packetsSent++;
      sendLog(mainWindow, 'info', `Sent VTOL_TAKEOFF (COMMAND_INT, rel-alt=${altitude}m) to sysid ${target.sysid}`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Failed to send VTOL takeoff command', message);
      return false;
    }
  });

  // MAV_CMD_NAV_TAKEOFF (command 22) - takeoff to altitude.
  // param1 = minimum pitch angle (deg). Copter ignores it; plane uses it as
  // initial climb pitch. 0° means "climb level" → plane won't lift off.
  // Default 15° is a safe climb pitch for fixed-wing.
  ipcMain.handle(IPC_CHANNELS.MAVLINK_COMMAND_TAKEOFF, async (_, altitude: number, pitchDeg?: number): Promise<boolean> => {
    const target = activeFlightTarget();
    if (!target) {
      return false;
    }

    const pitch = typeof pitchDeg === 'number' ? pitchDeg : 15;

    try {
      const payload = serializeCommandLong({
        targetSystem: target.sysid,
        targetComponent: 1,
        command: 22,
        confirmation: 0,
        param1: pitch,
        param2: 0,
        param3: 0,
        param4: 0,
        param5: 0,
        param6: 0,
        param7: altitude,
      });

      const packet = await sendMavlinkPacket(COMMAND_LONG_ID, payload, COMMAND_LONG_CRC_EXTRA, { link: target.transport });
      await target.transport.write(packet);
      connectionState.packetsSent++;

      sendLog(mainWindow, 'info', `Sent TAKEOFF command to sysid ${target.sysid}, altitude=${altitude}m pitch=${pitch}°`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Failed to send takeoff command', message);
      return false;
    }
  });

  // MAV_CMD_DO_REPOSITION (command 192) via COMMAND_INT - fly to a location in GUIDED mode.
  // Uses COMMAND_INT (msg 75) instead of COMMAND_LONG so lat/lon are int32 (degrees * 1e7)
  // which preserves full precision. COMMAND_LONG float32 truncates coordinates.
  ipcMain.handle(IPC_CHANNELS.MAVLINK_GOTO, async (_, lat: number, lon: number, alt: number, frame?: number, yawRad?: number): Promise<boolean> => {
    const target = activeFlightTarget();
    if (!target) {
      sendLog(mainWindow, 'warn', 'Move command: no active vehicle to command');
      return false;
    }

    // Altitude reference frame (COMMAND_INT *_INT variants): 6 = rel home
    // (default, legacy behavior), 11 = terrain, 5 = AMSL. Guard to the three
    // supported codes so a bad renderer value can't send a garbage frame.
    const altFrame = frame === 11 || frame === 5 ? frame : 6;

    try {
      const payload = serializeCommandInt({
        targetSystem: target.sysid,
        targetComponent: 1,
        frame: altFrame,    // MAV_FRAME_GLOBAL_{RELATIVE_ALT,TERRAIN_ALT,}_INT
        command: 192,       // MAV_CMD_DO_REPOSITION
        current: 0,
        autocontinue: 0,
        param1: -1,         // groundspeed: -1 = use default
        param2: 1,          // MAV_DO_REPOSITION_FLAGS_CHANGE_MODE (auto-switch to GUIDED)
        param3: 0,          // reserved
        // Yaw: PX4 stores param4 RAW into position_setpoint.yaw, which is in
        // RADIANS (navigator_main.cpp v1.15.4: rep->current.yaw = cmd.param4).
        // 0 forces the whole leg to be flown FACING NORTH; NaN = default yaw
        // behavior (face direction of travel). A finite yawRad (Look Here on
        // PX4) pins the heading. ArduPilot ignores it here — keep legacy 0.
        param4: connectionState.firmware === 'px4'
          ? (typeof yawRad === 'number' && Number.isFinite(yawRad) ? yawRad : NaN)
          : 0,
        x: Math.round(lat * 1e7),  // latitude as int32 (degrees * 1e7)
        y: Math.round(lon * 1e7),  // longitude as int32 (degrees * 1e7)
        z: alt,             // altitude (meters, relative to the frame above)
      });

      const packet = await sendMavlinkPacket(COMMAND_INT_ID, payload, COMMAND_INT_CRC_EXTRA, { link: target.transport });
      await target.transport.write(packet);
      connectionState.packetsSent++;
      lastGotoFrameBySysid.set(target.sysid, altFrame);

      // Mode + target sysid at send time: a FAILED ack with fence off means
      // either "not in GUIDED and the mode switch was refused" or the wrong
      // vehicle got the command - this line discriminates.
      const frameName = altFrame === 11 ? 'terrain' : altFrame === 5 ? 'AMSL' : 'rel-home';
      // Flag when the pinned selection did not resolve and the command fell back
      // to the primary/first vehicle - the "clicked SYS 7, commanded SYS 1" case.
      const activeKey = connectionRegistry.getActiveVehicleKey();
      const pinned = activeKey ? connectionRegistry.getVehicleByKey(activeKey) : null;
      const fallback = !pinned || pinned.sysid !== target.sysid ? ' [FALLBACK TARGET - fleet selection did not resolve]' : '';
      sendLog(mainWindow, fallback ? 'warn' : 'info', `Sent DO_REPOSITION to ${lat.toFixed(7)}, ${lon.toFixed(7)}, alt=${alt.toFixed(1)}m ${frameName} (mode=${lastFlightModeName}, sysid=${target.sysid})${fallback}`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Failed to send GO_TO command', message);
      return false;
    }
  });

  // MAV_CMD_DO_ORBIT (command 34) via COMMAND_INT - orbit a point at a given altitude.
  // ArduPilot copters/planes will switch to CIRCLE mode and orbit the specified center.
  // radius positive = clockwise orbit, negative = counter-clockwise (when viewed from above).
  // Concrete numeric defaults are used instead of NaN because some ArduPilot
  // build configs reject NaN params for DO_ORBIT.
  ipcMain.handle(IPC_CHANNELS.MAVLINK_ORBIT, async (_, lat: number, lon: number, alt: number, radius: number, frame?: number): Promise<boolean> => {
    const target = activeFlightTarget();
    if (!target) {
      sendLog(mainWindow, 'warn', 'ORBIT command skipped: no active vehicle');
      return false;
    }

    // Altitude frame: 6 = rel home (default), 11 = terrain, 5 = AMSL.
    const altFrame = frame === 11 || frame === 5 ? frame : 6;

    try {
      const payload = serializeCommandInt({
        targetSystem: target.sysid,
        targetComponent: 1,
        frame: altFrame,    // MAV_FRAME_GLOBAL_{RELATIVE_ALT,TERRAIN_ALT,}_INT
        command: 34,        // MAV_CMD_DO_ORBIT
        current: 0,
        autocontinue: 0,
        param1: radius,     // radius (m); negative = CCW
        param2: 5,          // velocity (m/s); positive = use this speed
        param3: 0,          // yaw behavior: 0 = HOLD_FRONT_TO_CIRCLE_CENTER (face center)
        param4: 0,          // orbits to complete; 0 = unlimited
        x: Math.round(lat * 1e7),
        y: Math.round(lon * 1e7),
        z: alt,
      });

      const packet = await sendMavlinkPacket(COMMAND_INT_ID, payload, COMMAND_INT_CRC_EXTRA, { link: target.transport });
      await target.transport.write(packet);
      connectionState.packetsSent++;

      sendLog(mainWindow, 'info', `Sent DO_ORBIT center=${lat.toFixed(7)}, ${lon.toFixed(7)} alt=${alt.toFixed(1)}m radius=${radius}m`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Failed to send ORBIT command', message);
      return false;
    }
  });

  // MAV_CMD_NAV_LAND (command 21) via COMMAND_INT - land at a specific lat/lon.
  // Sent as a guided-mode command; ArduPilot switches to LAND and descends at the target.
  ipcMain.handle(IPC_CHANNELS.MAVLINK_LAND, async (_, lat: number, lon: number): Promise<boolean> => {
    const target = activeFlightTarget();
    if (!target) return false;

    try {
      const payload = serializeCommandInt({
        targetSystem: target.sysid,
        targetComponent: 1,
        frame: 3,           // MAV_FRAME_GLOBAL_RELATIVE_ALT
        command: 21,        // MAV_CMD_NAV_LAND
        current: 0,
        autocontinue: 0,
        param1: 0,          // abort altitude (0 = use default)
        param2: 0,          // precision land mode (0 = normal)
        param3: 0,          // empty
        param4: NaN,        // desired yaw on touchdown (NaN = current heading)
        x: Math.round(lat * 1e7),
        y: Math.round(lon * 1e7),
        z: 0,               // landing altitude (ignored on touchdown)
      });

      const packet = await sendMavlinkPacket(COMMAND_INT_ID, payload, COMMAND_INT_CRC_EXTRA, { link: target.transport });
      await target.transport.write(packet);
      connectionState.packetsSent++;

      sendLog(mainWindow, 'info', `Sent NAV_LAND at ${lat.toFixed(7)}, ${lon.toFixed(7)}`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Failed to send LAND command', message);
      return false;
    }
  });

  // MAV_CMD_USER_1..5 via COMMAND_INT - dispatches to FC-side Lua script handlers.
  // Used by ArduDeck's installed scripts (e.g. orbit) to receive structured
  // commands with full lat/lon precision + 4 float params.
  ipcMain.handle(IPC_CHANNELS.MAVLINK_USER_COMMAND, async (
    _, cmdId: number, lat: number, lon: number, alt: number,
    param1: number, param2: number, param3: number, param4: number,
  ): Promise<boolean> => {
    const target = activeFlightTarget();
    if (!target) {
      sendLog(mainWindow, 'warn', 'USER_COMMAND skipped: no active vehicle');
      return false;
    }
    if (cmdId < 31010 || cmdId > 31014) {
      sendLog(mainWindow, 'error', `USER_COMMAND rejected: cmdId ${cmdId} outside USER_1..5 range`);
      return false;
    }
    try {
      const payload = serializeCommandInt({
        targetSystem: target.sysid,
        targetComponent: 1,
        frame: 6,           // MAV_FRAME_GLOBAL_RELATIVE_ALT_INT
        command: cmdId,
        current: 0,
        autocontinue: 0,
        param1, param2, param3, param4,
        x: Math.round(lat * 1e7),
        y: Math.round(lon * 1e7),
        z: alt,
      });
      const packet = await sendMavlinkPacket(COMMAND_INT_ID, payload, COMMAND_INT_CRC_EXTRA, { link: target.transport });
      await target.transport.write(packet);
      connectionState.packetsSent++;
      sendLog(mainWindow, 'info', `Sent USER_${cmdId - 31009} lat=${lat.toFixed(7)} lon=${lon.toFixed(7)} alt=${alt} p1=${param1} p2=${param2}`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', `Failed to send USER_${cmdId - 31009}`, message);
      return false;
    }
  });

  // ─── Script Installer IPC ──────────────────────────────────────────────────
  // Builds an FcAdapter against the local main-process closures (transport,
  // connectionState, sendMavlinkPacket etc) and wires the renderer-facing
  // installer API. State updates are pushed on SCRIPT_INSTALLER_STATE.

  const buildFcAdapter = (): FcAdapter => ({
    // Stable per-FC ID. Until AUTOPILOT_VERSION uid tracking is wired in, derive
    // a session-stable ID from the connection's transport+systemId. Replace
    // with the real uid2 from AUTOPILOT_VERSION when available.
    getAutopilotUid: () => {
      if (!connectionState.isConnected) return null;
      const sys = connectionState.systemId ?? 1;
      const transport = connectionState.portPath ?? connectionState.transport ?? 'unknown';
      return `sys${sys}@${transport}`;
    },
    getVehicleLabel: () => connectionState.autopilot ?? connectionState.vehicleType ?? null,
    isFtpSupported: () => Boolean(currentTransport?.isOpen && connectionState.isConnected),
    isVehicleArmed: () => lastReportedArmed === true,
    isSitl: () => connectionState.isSitl === true,
    probeWritability: async (probePath: string) => {
      // SITL: write directly to the host filesystem in the SITL working dir.
      // We control the SITL launcher (cwd = dirname(binaryPath)), so we know
      // exactly where /APM/scripts/ should go - no need to round-trip through
      // FTP. Probe = check the working dir is writable.
      if (connectionState.isSitl) {
        const cfg = ardupilotSitlProcess.currentConfig;
        if (!cfg) return { verdict: 'no_response' as const, detail: 'SITL is connected but ArduDeck has lost track of the launcher config - restart SITL from the connection panel.' };
        try {
          const binaryPath = ardupilotSitlProcess.getBinaryPath(cfg.vehicleType, cfg.releaseTrack);
          const fs = await import('fs/promises');
          const path = await import('path');
          // SITL loads scripts from <cwd>/scripts/, not /APM/scripts/.
          const scriptsDir = path.join(path.dirname(binaryPath), 'scripts');
          await fs.mkdir(scriptsDir, { recursive: true });
          // Quick write+delete probe to confirm permissions.
          const probe = path.join(scriptsDir, '.ardudeck_probe');
          await fs.writeFile(probe, '');
          await fs.unlink(probe);
          return { verdict: 'writable' as const };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return { verdict: 'rejected' as const, detail: `Could not write to SITL working directory: ${msg}` };
        }
      }
      const targetSys = connectionState.systemId ?? 1;
      const targetComp = 1;
      const probeClient = new MavlinkFtpClient({
        sendPacket: async (ftpPayload: Uint8Array) => {
          const ftpMsg = serializeFileTransferProtocol({
            targetNetwork: 0,
            targetSystem: targetSys,
            targetComponent: targetComp,
            payload: Array.from(ftpPayload),
          });
          const packet = await sendMavlinkPacket(FILE_TRANSFER_PROTOCOL_ID, ftpMsg, FILE_TRANSFER_PROTOCOL_CRC_EXTRA);
          await currentTransport!.write(packet);
          connectionState.packetsSent++;
        },
        log: (level, message) => sendLog(mainWindow, level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'debug', message),
      });
      const previousFtpClient = ftpClient;
      ftpClient = probeClient;
      try {
        const result = await probeClient.probeWrite(probePath, 1500);
        if (result.ok) return { verdict: 'writable' as const };
        const err = result.error ?? 'unknown';
        if (/no response/i.test(err)) {
          return { verdict: 'no_response' as const, detail: `FC did not respond to a write probe within 1.5 s. The MAVLink FTP server may be disabled or the FC has no writable filesystem (no SD card?).` };
        }
        if (/FileNotFound/i.test(err)) {
          return { verdict: 'no_sd_card' as const, detail: `Parent directory missing - typically means there is no SD card present, or /APM/scripts/ has not been created. ArduPilot creates /APM/scripts/ on boot when SCR_ENABLE=1, so a reboot may help.` };
        }
        return { verdict: 'rejected' as const, detail: `FC rejected the write probe: ${err}` };
      } finally {
        ftpClient = previousFtpClient;
      }
    },
    readParams: async (paramIds: string[]): Promise<Record<string, number>> => {
      // Reuse the existing PARAM_READ_BATCH path. We don't want to duplicate
      // the per-param request/timeout machinery, so call ourselves through
      // the same internal helper (extracted into a local closure if needed).
      // For simplicity we call the IPC handler's underlying logic here.
      const targetSystem = connectionState.systemId ?? 1;
      const targetComponent = 1;
      const PER_PARAM_TIMEOUT_MS = 1500;
      const out: Record<string, number> = {};
      await Promise.all(paramIds.map((paramId) => new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          if (pendingParamReads.get(paramId)) pendingParamReads.delete(paramId);
          resolve();
        }, PER_PARAM_TIMEOUT_MS);
        pendingParamReads.set(paramId, (value) => {
          clearTimeout(timer);
          out[paramId] = value;
          resolve();
        });
        (async () => {
          try {
            const reqPayload = serializeParamRequestRead({
              targetSystem, targetComponent, paramId, paramIndex: -1,
            });
            const packet = await sendMavlinkPacket(PARAM_REQUEST_READ_ID, reqPayload, PARAM_REQUEST_READ_CRC_EXTRA);
            await currentTransport!.write(packet);
            connectionState.packetsSent++;
          } catch {
            clearTimeout(timer);
            resolve();
          }
        })();
      })));
      return out;
    },
    setParam: async (paramId: string, value: number): Promise<boolean> => {
      // Best-effort PARAM_SET. We trust the existing receivedParams to track
      // the resulting PARAM_VALUE update; here we just send and verify by
      // re-reading after a short delay.
      try {
        const targetSystem = connectionState.systemId ?? 1;
        const targetComponent = 1;
        // Look up paramType from receivedParams cache, default to REAL32 (9).
        const cached = receivedParams.get(paramId);
        const paramType = resolveParamSetType(cached?.paramType ?? 9);
        const setPayload = serializeParamSet({
          targetSystem, targetComponent, paramId, paramValue: value, paramType,
        });
        if (connectionState.firmware === 'px4') {
          encodePx4ParamSetValue(setPayload, value, paramType);
        }
        const packet = await sendMavlinkPacket(PARAM_SET_ID, setPayload, PARAM_SET_CRC_EXTRA);
        await currentTransport!.write(packet);
        connectionState.packetsSent++;
        // Verify
        await new Promise(r => setTimeout(r, 500));
        const verify = await new Promise<number | null>((resolve) => {
          const timer = setTimeout(() => {
            if (pendingParamReads.get(paramId)) pendingParamReads.delete(paramId);
            resolve(null);
          }, 1500);
          pendingParamReads.set(paramId, (v) => { clearTimeout(timer); resolve(v); });
          (async () => {
            const reqPayload = serializeParamRequestRead({
              targetSystem, targetComponent, paramId, paramIndex: -1,
            });
            const pkt = await sendMavlinkPacket(PARAM_REQUEST_READ_ID, reqPayload, PARAM_REQUEST_READ_CRC_EXTRA);
            await currentTransport!.write(pkt);
            connectionState.packetsSent++;
          })().catch(() => {});
        });
        return verify === value;
      } catch (err) {
        sendLog(mainWindow, 'error', `setParam ${paramId} failed`, err instanceof Error ? err.message : String(err));
        return false;
      }
    },
    rebootAndReconnect: async (timeoutSec: number): Promise<boolean> => {
      try {
        const targetSystem = connectionState.systemId ?? 1;
        const targetComponent = 1;
        // Schedule auto-reconnect BEFORE sending the reboot command, so the
        // existing reconnect machinery captures the connection options while
        // the connection is still alive (it reads connectionState).
        scheduleReconnect({
          reason: 'ArduDeck script install: applying parameter change',
          delayMs: 4000,    // typical FC boot time
          timeoutMs: timeoutSec * 1000,
          maxAttempts: 20,
        });
        const cmdPayload = serializeCommandLong({
          targetSystem, targetComponent,
          command: 246, // MAV_CMD_PREFLIGHT_REBOOT_SHUTDOWN
          confirmation: 0,
          param1: 1, param2: 0, param3: 0, param4: 0, param5: 0, param6: 0, param7: 0,
        });
        const packet = await sendMavlinkPacket(COMMAND_LONG_ID, cmdPayload, COMMAND_LONG_CRC_EXTRA);
        await currentTransport!.write(packet);
        connectionState.packetsSent++;
        sendLog(mainWindow, 'info', 'Sent FC reboot command; waiting for reconnect…');
        // Poll for reconnect via the existing auto-reconnect logic
        const deadline = Date.now() + timeoutSec * 1000;
        while (Date.now() < deadline) {
          if (connectionState.isConnected && !connectionState.isReconnecting) {
            // Give the FC a moment to send its first heartbeat after reconnect
            // so subsequent param reads have a known systemId.
            await new Promise(r => setTimeout(r, 500));
            return true;
          }
          await new Promise(r => setTimeout(r, 250));
        }
        sendLog(mainWindow, 'warn', 'FC did not reconnect within the timeout window');
        return false;
      } catch (err) {
        sendLog(mainWindow, 'error', 'reboot failed', err instanceof Error ? err.message : String(err));
        return false;
      }
    },
    ftpUpload: async (path: string, contents: Uint8Array, onProgress) => {
      // SITL: bypass MAVLink-FTP entirely and write straight to the host
      // filesystem in the SITL working dir. ArduPilot's SITL FTP-write path
      // is genuinely unreliable, but we control the launcher's cwd so we
      // know exactly where the script should land. After writing, we also
      // restart the SITL process - ArduPilot only loads scripts at boot,
      // and a MAVLink reboot command on SITL kills the process without
      // respawning it (HAL_SITL just exit()s).
      if (connectionState.isSitl) {
        const cfg = ardupilotSitlProcess.currentConfig;
        if (!cfg) throw new Error('SITL launcher config unavailable - restart SITL from the connection panel');
        const fs = await import('fs/promises');
        const nodePath = await import('path');
        const binaryPath = ardupilotSitlProcess.getBinaryPath(cfg.vehicleType, cfg.releaseTrack);
        // SITL reads scripts from <cwd>/scripts/ — the /APM/ prefix used in
        // FC-style paths is the SD-card mount point on real hardware and does
        // NOT exist in HAL_SITL's filesystem. We strip the /APM/ prefix and
        // also write a copy to the FTP-virtual location so MAVLink-FTP-based
        // tooling sees the same file.
        const relPath = path.replace(/^\/+/, '');
        const sitlRelPath = relPath.replace(/^APM\//, '');
        const sitlFsPath = nodePath.join(nodePath.dirname(binaryPath), sitlRelPath);
        const ftpMirrorPath = nodePath.join(nodePath.dirname(binaryPath), relPath);
        await fs.mkdir(nodePath.dirname(sitlFsPath), { recursive: true });
        await fs.mkdir(nodePath.dirname(ftpMirrorPath), { recursive: true });
        onProgress(0, contents.length);
        await fs.writeFile(sitlFsPath, contents);
        await fs.writeFile(ftpMirrorPath, contents);
        onProgress(contents.length, contents.length);
        sendLog(mainWindow, 'info', `SITL: wrote ${contents.length} B → ${sitlFsPath} (and FTP mirror)`);

        // Restart SITL so ArduPilot loads the freshly-written script.
        //
        // Order matters here:
        //  1. Schedule the reconnect FIRST so isReconnectPending() returns
        //     true when the transport-close handler fires - otherwise the
        //     handler would do full cleanup (clearing currentTransport etc.)
        //     and the later reconnect would have no transport to recreate.
        //  2. Use restart() which actually awaits the process exit before
        //     respawning - the stock stop() is fire-and-forget and races
        //     the OS releasing TCP port 5760 against the new bind.
        //  3. Verify start() succeeded - it returns {success, error}, not
        //     throws; silent failures here were the previous bug.
        sendLog(mainWindow, 'info', 'SITL: restarting process to load the new script…');
        scheduleReconnect({
          reason: 'ArduDeck script install: restarting SITL to load script',
          delayMs: 8000,
          timeoutMs: 60000,
          maxAttempts: 40,
        });

        const restartResult = await ardupilotSitlProcess.restart();
        if (!restartResult.success) {
          throw new Error(`SITL restart failed: ${restartResult.error ?? 'unknown error'}`);
        }
        sendLog(mainWindow, 'info', `SITL: relaunched OK, waiting for ArduPilot to boot and load the script…`);
        return true;
      }

      const targetSys = connectionState.systemId ?? 1;
      const targetComp = 1;
      const client = new MavlinkFtpClient({
        sendPacket: async (ftpPayload: Uint8Array) => {
          const ftpMsg = serializeFileTransferProtocol({
            targetNetwork: 0,
            targetSystem: targetSys,
            targetComponent: targetComp,
            payload: Array.from(ftpPayload),
          });
          const packet = await sendMavlinkPacket(FILE_TRANSFER_PROTOCOL_ID, ftpMsg, FILE_TRANSFER_PROTOCOL_CRC_EXTRA);
          await currentTransport!.write(packet);
          connectionState.packetsSent++;
        },
        log: (level, message) => {
          sendLog(mainWindow, level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'debug', message);
        },
      });
      // Route incoming FTP responses to this client for the duration of upload.
      // The existing global ftpClient is for downloads; we temporarily redirect.
      const previousFtpClient = ftpClient;
      ftpClient = client;
      try {
        const result = await client.uploadFile(path, contents, onProgress);
        if (!result.ok) {
          // Surface the actual NAK message via a thrown error so the installer
          // service can include it in the user-facing error modal.
          throw new Error(result.error ?? 'FTP upload failed');
        }
        return true;
      } finally {
        ftpClient = previousFtpClient;
      }
    },
    getLoadedScriptCount: async () => null, // not implemented (best-effort optional check)
  });

  // Push script-health transitions to the renderer + auto-register the FC
  // when a previously-unknown vehicle starts publishing the AD_HB heartbeat.
  // This closes the loop for users who side-loaded the script manually:
  // they don't need to reopen any dialog, the registry just notices the
  // heartbeat and treats the FC as having ArduDeck commands installed.
  subscribeHealth((health) => {
    safeSend(mainWindow, IPC_CHANNELS.SCRIPT_HEALTH_CHANGED, health);
    if (health.status === 'present') {
      const adapter = buildFcAdapter();
      const uid = adapter.getAutopilotUid();
      if (!uid) return;
      const existing = scriptRegistry.get(uid);
      if (existing) return; // already known
      const bundle = getScriptBundle();
      const entry = scriptRegistry.buildFreshEntry({
        autopilotUid: uid,
        vehicleLabel: adapter.getVehicleLabel(),
        scriptVersion: String(health.version),
        scriptSha256: bundle.manifest.sha256,
        enabledCommands: bundle.manifest.commands.map(c => c.name),
        installMethod: 'manual',
      });
      scriptRegistry.setEntry(entry);
      sendLog(mainWindow, 'info', `Detected manually-installed ArduDeck script v${health.version} on ${uid}`);
    }
  });

  ipcMain.handle(IPC_CHANNELS.SCRIPT_INSTALLER_GET_MANIFEST, () => {
    return getScriptBundle().manifest;
  });
  ipcMain.handle(IPC_CHANNELS.SCRIPT_INSTALLER_GET_SOURCE, () => {
    return getScriptBundle().source;
  });
  ipcMain.handle(IPC_CHANNELS.SCRIPT_INSTALLER_RUN_PREFLIGHT, async () => {
    if (!currentTransport?.isOpen || !connectionState.isConnected) {
      return [{
        id: 'not_connected',
        label: 'Not connected to a flight controller',
        severity: 'block' as const,
        detail: 'Connect to an FC before running preflight checks.',
        fix: null,
      }];
    }
    const adapter = buildFcAdapter();
    const bundle = getScriptBundle();
    const requiredParams = bundle.manifest.requirements.map(r => r.param);
    const params = await adapter.readParams([...requiredParams, 'SCR_LD_NUM']);
    const loadedScriptCount = await adapter.getLoadedScriptCount();
    const { runPreflight } = await import('./script-installer/preflight.js');
    return runPreflight({
      manifest: bundle.manifest,
      paramValues: params,
      vehicleArmed: adapter.isVehicleArmed(),
      ftpSupported: adapter.isFtpSupported(),
      loadedScriptCount: loadedScriptCount ?? undefined,
    });
  });
  ipcMain.handle(IPC_CHANNELS.SCRIPT_INSTALLER_BEGIN, async () => {
    const adapter = buildFcAdapter();
    const bundle = getScriptBundle();
    void installerService.beginInstall({
      bundle,
      adapter,
      emitter: (phase) => safeSend(mainWindow, IPC_CHANNELS.SCRIPT_INSTALLER_STATE, phase),
    });
  });
  ipcMain.handle(IPC_CHANNELS.SCRIPT_INSTALLER_GRANT_CONSENT, () => {
    installerService.grantConsent();
  });
  ipcMain.handle(IPC_CHANNELS.SCRIPT_INSTALLER_APPLY_FIX, async (_, fix: PreflightFix) => {
    await installerService.applyFix(fix);
  });
  ipcMain.handle(IPC_CHANNELS.SCRIPT_INSTALLER_CANCEL, () => {
    installerService.cancelInstall();
  });
  ipcMain.handle(IPC_CHANNELS.SCRIPT_INSTALLER_GET_REGISTRY, () => {
    const adapter = buildFcAdapter();
    const uid = adapter.getAutopilotUid();
    return uid ? scriptRegistry.get(uid) : null;
  });
  ipcMain.handle(IPC_CHANNELS.SCRIPT_INSTALLER_GET_ALL_REGISTRY, () => {
    return scriptRegistry.getAll();
  });
  // Save the bundled Lua source to a user-chosen file path. Used as the
  // manual-install fallback when MAVLink FTP write is rejected by the FC.
  // The user copies the resulting .lua to /APM/scripts/ on the SD card and
  // reboots; the script registers itself when the heartbeat arrives.
  ipcMain.handle(IPC_CHANNELS.SCRIPT_INSTALLER_SAVE_TO_DISK, async (): Promise<{ success: boolean; filePath?: string; error?: string }> => {
    try {
      const bundle = getScriptBundle();
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Save ArduDeck Lua Script',
        defaultPath: bundle.manifest.filename,
        filters: [
          { name: 'Lua Script', extensions: ['lua'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      if (result.canceled || !result.filePath) return { success: false, error: 'Cancelled' };
      const fs = await import('fs/promises');
      await fs.writeFile(result.filePath, bundle.sourceBytes);
      sendLog(mainWindow, 'info', `Saved ${bundle.manifest.filename} → ${result.filePath} (${bundle.sourceBytes.length} bytes, sha256 ${bundle.manifest.sha256.slice(0, 12)}…)`);
      return { success: true, filePath: result.filePath };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      sendLog(mainWindow, 'error', `Failed to save Lua script to disk: ${msg}`);
      return { success: false, error: msg };
    }
  });

  // ─── MAVLink-FTP file browser (read-only) ──────────────────────────
  // Both handlers share the same transient FtpClient pattern as the script
  // installer's probeWritability: build a client wired to the live MAVLink
  // transport, swap it into the global ftpClient slot so incoming
  // FILE_TRANSFER_PROTOCOL responses reach it, do the operation, restore.

  function buildBrowserFtpClient(): MavlinkFtpClient {
    const targetSys = connectionState.systemId ?? 1;
    const targetComp = 1;
    return new MavlinkFtpClient({
      sendPacket: async (ftpPayload: Uint8Array) => {
        const ftpMsg = serializeFileTransferProtocol({
          targetNetwork: 0,
          targetSystem: targetSys,
          targetComponent: targetComp,
          payload: Array.from(ftpPayload),
        });
        const packet = await sendMavlinkPacket(FILE_TRANSFER_PROTOCOL_ID, ftpMsg, FILE_TRANSFER_PROTOCOL_CRC_EXTRA);
        await currentTransport!.write(packet);
        connectionState.packetsSent++;
      },
      log: (level, message) => sendLog(mainWindow, level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'debug', message),
    });
  }

  // ArduPilot's AP_Filesystem multiplexes several virtual filesystems behind
  // well-known prefixes. Only some of them implement opendir, so only some
  // are browsable:
  //   - "APM"     - SD card root (FATFS on real hw; on SITL POSIX maps to
  //                 cwd, may return FileNotFound depending on the build)
  //   - "@SYS"    - opendir at root only (threads.txt, etc.)
  //   - "@ROMFS"  - embedded firmware filesystem, opendir works
  // "@PARAM" and "@MISSION" deliberately omitted: they expose virtual files
  // (param.pck, mission.dat) for direct OpenFileRO access but their
  // backends do not implement opendir, so listing them returns FailErrno
  // with a meaningless stale errno. Users access those via the Parameters
  // and Mission views instead.
  const VIRTUAL_ROOTS: ReadonlyArray<{ kind: 'dir'; name: string }> = [
    { kind: 'dir', name: 'APM' },
    { kind: 'dir', name: '@SYS' },
    { kind: 'dir', name: '@ROMFS' },
  ];

  ipcMain.handle(IPC_CHANNELS.MAVLINK_FTP_LIST, async (_, path: string): Promise<{
    success: boolean;
    entries?: Array<{ kind: 'dir' | 'file'; name: string; size?: number }>;
    error?: string;
  }> => {
    if (!currentTransport?.isOpen || !connectionState.isConnected) {
      return { success: false, error: 'Not connected' };
    }
    if (connectionState.protocol !== 'mavlink') {
      return { success: false, error: 'MAVLink-FTP requires a MAVLink connection' };
    }
    const client = buildBrowserFtpClient();
    const previous = ftpClient;
    ftpClient = client;
    try {
      const result = await client.listDirectory(path);
      const isRoot = path === '/' || path === '';

      if ('error' in result) {
        if (isRoot) {
          // The FC rejected listing "/" (typical on SITL POSIX). Fall back to
          // the synthesized virtual mount points so the user has somewhere to go.
          return { success: true, entries: [...VIRTUAL_ROOTS] };
        }
        return { success: false, error: `Could not list ${path}: ${result.error}` };
      }

      if (isRoot) {
        const seen = new Set(result.entries.map(e => e.name));
        const merged = [...result.entries, ...VIRTUAL_ROOTS.filter(v => !seen.has(v.name))];
        return { success: true, entries: merged };
      }
      return { success: true, entries: result.entries };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    } finally {
      ftpClient = previous;
    }
  });

  ipcMain.handle(IPC_CHANNELS.MAVLINK_FTP_DOWNLOAD, async (_, fcPath: string): Promise<{
    success: boolean;
    savedTo?: string;
    bytes?: number;
    error?: string;
  }> => {
    if (!currentTransport?.isOpen || !connectionState.isConnected) {
      return { success: false, error: 'Not connected' };
    }
    if (connectionState.protocol !== 'mavlink') {
      return { success: false, error: 'MAVLink-FTP requires a MAVLink connection' };
    }
    // Ask user where to save the file before doing any FC work.
    const defaultName = fcPath.split('/').filter(Boolean).pop() ?? 'download.bin';
    const dlg = await dialog.showSaveDialog(mainWindow, {
      title: `Save ${fcPath}`,
      defaultPath: defaultName,
    });
    if (dlg.canceled || !dlg.filePath) {
      return { success: false, error: 'Cancelled' };
    }
    const client = buildBrowserFtpClient();
    const previous = ftpClient;
    ftpClient = client;
    try {
      const bytes = await client.downloadFile(fcPath);
      if (bytes === null) {
        return { success: false, error: `FTP download of ${fcPath} failed` };
      }
      const fs = await import('fs/promises');
      await fs.writeFile(dlg.filePath, bytes);
      sendLog(mainWindow, 'info', `FTP downloaded ${fcPath} (${bytes.length} B) → ${dlg.filePath}`);
      return { success: true, savedTo: dlg.filePath, bytes: bytes.length };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    } finally {
      ftpClient = previous;
    }
  });

  ipcMain.handle(IPC_CHANNELS.MAVLINK_FTP_UPLOAD, async (_, targetDir: string): Promise<{
    success: boolean;
    fcPath?: string;
    sourcePath?: string;
    bytes?: number;
    error?: string;
    cancelled?: boolean;
  }> => {
    if (!currentTransport?.isOpen || !connectionState.isConnected) {
      return { success: false, error: 'Not connected' };
    }
    if (connectionState.protocol !== 'mavlink') {
      return { success: false, error: 'MAVLink-FTP requires a MAVLink connection' };
    }
    const dlg = await dialog.showOpenDialog(mainWindow, {
      title: `Upload to ${targetDir}`,
      properties: ['openFile'],
    });
    if (dlg.canceled || dlg.filePaths.length === 0) {
      return { success: false, cancelled: true };
    }
    const sourcePath = dlg.filePaths[0]!;
    const fs = await import('fs/promises');
    const path = await import('path');
    const filename = path.basename(sourcePath);
    const fcPath = targetDir.endsWith('/') ? `${targetDir}${filename}` : `${targetDir}/${filename}`;

    let bytes: Uint8Array;
    try {
      const buf = await fs.readFile(sourcePath);
      bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    } catch (err) {
      return { success: false, error: `Could not read ${sourcePath}: ${err instanceof Error ? err.message : String(err)}` };
    }

    const client = buildBrowserFtpClient();
    const previous = ftpClient;
    ftpClient = client;
    try {
      // Best-effort pre-clean so we don't leave trailing bytes from a larger
      // existing file behind (OpenFileWO does not truncate). Errors here are
      // expected when the file doesn't exist - removeFile already maps
      // FileNotFound to ok.
      const rm = await client.removeFile(fcPath);
      if (!rm.ok) {
        sendLog(mainWindow, 'debug', `FTP pre-upload removeFile ${fcPath} -> ${rm.error ?? 'unknown'} (continuing)`);
      }
      const result = await client.uploadFile(fcPath, bytes);
      if (!result.ok) {
        return { success: false, error: result.error ?? `Upload of ${fcPath} failed` };
      }
      sendLog(mainWindow, 'info', `FTP uploaded ${sourcePath} → ${fcPath} (${bytes.length} B)`);
      return { success: true, fcPath, sourcePath, bytes: bytes.length };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    } finally {
      ftpClient = previous;
    }
  });

  ipcMain.handle(IPC_CHANNELS.MAVLINK_FTP_DELETE, async (_, fcPath: string, kind: 'file' | 'dir'): Promise<{
    success: boolean;
    error?: string;
  }> => {
    if (!currentTransport?.isOpen || !connectionState.isConnected) {
      return { success: false, error: 'Not connected' };
    }
    if (connectionState.protocol !== 'mavlink') {
      return { success: false, error: 'MAVLink-FTP requires a MAVLink connection' };
    }
    const client = buildBrowserFtpClient();
    const previous = ftpClient;
    ftpClient = client;
    try {
      const result = kind === 'dir'
        ? await client.removeDirectory(fcPath)
        : await client.removeFile(fcPath);
      if (!result.ok) {
        return { success: false, error: result.error ?? `Delete of ${fcPath} failed` };
      }
      sendLog(mainWindow, 'info', `FTP deleted ${kind} ${fcPath}`);
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    } finally {
      ftpClient = previous;
    }
  });

  ipcMain.handle(IPC_CHANNELS.MAVLINK_FTP_RENAME, async (_, oldPath: string, newPath: string): Promise<{
    success: boolean;
    error?: string;
  }> => {
    if (!currentTransport?.isOpen || !connectionState.isConnected) {
      return { success: false, error: 'Not connected' };
    }
    if (connectionState.protocol !== 'mavlink') {
      return { success: false, error: 'MAVLink-FTP requires a MAVLink connection' };
    }
    const client = buildBrowserFtpClient();
    const previous = ftpClient;
    ftpClient = client;
    try {
      const result = await client.rename(oldPath, newPath);
      if (!result.ok) {
        return { success: false, error: result.error ?? `Rename ${oldPath} → ${newPath} failed` };
      }
      sendLog(mainWindow, 'info', `FTP renamed ${oldPath} → ${newPath}`);
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    } finally {
      ftpClient = previous;
    }
  });

  ipcMain.handle(IPC_CHANNELS.SCRIPT_INSTALLER_UNINSTALL, async () => {
    const adapter = buildFcAdapter();
    const uid = adapter.getAutopilotUid();
    if (!uid) return;
    const bundle = getScriptBundle();
    const path = `/APM/scripts/${bundle.manifest.filename}`;
    // TODO: implement FTP delete in MavlinkFtpClient. For now, mark uninstalled
    // in the registry but warn the user the file remains until they remove it
    // manually (via SD card or another GCS).
    sendLog(mainWindow, 'warn', `Uninstall: registry cleared for ${uid}; file at ${path} must be removed manually until FTP delete is implemented.`);
    scriptRegistry.appendAudit(uid, 'uninstall', `Cleared registry entry; file ${path} remains on FC.`);
    scriptRegistry.remove(uid);
    void adapter; // suppress unused
  });

  // PX4 motor test: MAV_CMD_ACTUATOR_TEST (310). param1 = value (motors 0..1),
  // param2 = timeout seconds (<= 0 releases control = stop, PX4 clamps to 3 s
  // max per command), param5 = output function (ACTUATOR_OUTPUT_FUNCTION:
  // MOTOR1 = 1). Denied by PX4 when armed or when COM_MOT_TEST_EN != 1.
  const sendPx4ActuatorTest = async (fn: number, value: number, timeoutS: number): Promise<void> => {
    if (!currentTransport?.isOpen || !connectionState.isConnected) return;
    const payload = serializeCommandLong({
      targetSystem: connectionState.systemId ?? 1,
      targetComponent: 1,
      command: 310, // MAV_CMD_ACTUATOR_TEST
      confirmation: 0,
      param1: value,
      param2: timeoutS,
      param3: 0,
      param4: 0,
      param5: fn,
      param6: 0,
      param7: 0,
    });
    const packet = await sendMavlinkPacket(COMMAND_LONG_ID, payload, COMMAND_LONG_CRC_EXTRA);
    await currentTransport.write(packet);
    connectionState.packetsSent++;
  };

  // Chain re-sends so a duration beyond PX4's 3 s per-command cap keeps running.
  const schedulePx4MotorRun = (fn: number, durationS: number, startDelayMs: number): void => {
    for (let offset = 0; offset < durationS; offset += 1) {
      const timeoutS = Math.min(durationS - offset, 3);
      const t = setTimeout(() => {
        void sendPx4ActuatorTest(fn, px4MotorTestValue, timeoutS).catch(() => { /* transport churn mid-test */ });
      }, startDelayMs + offset * 1000);
      px4MotorTestTimers.push(t);
    }
  };
  let px4MotorTestValue = 0;

  // Motor Test via MAV_CMD_DO_MOTOR_TEST (command 209)
  // Spins a single motor (or sequences through N motors) at the requested throttle.
  // ArduPilot refuses the command if the vehicle is armed.
  ipcMain.handle(IPC_CHANNELS.MOTOR_TEST_START, async (_, request: MotorTestStartRequest): Promise<MotorTestResponse> => {
    if (!currentTransport?.isOpen || !connectionState.isConnected) {
      return { success: false, error: 'Not connected' };
    }
    if (connectionState.protocol !== 'mavlink') {
      return { success: false, error: 'Motor test requires MAVLink connection' };
    }

    if (connectionState.firmware === 'px4') {
      try {
        px4MotorTestValue = Math.max(0, Math.min(1, request.throttle / 100));
        if (request.motorCount && request.motorCount > 1) {
          // PX4 has no FC-side sequence mode: chain the motors here.
          for (let i = 0; i < request.motorCount; i++) {
            schedulePx4MotorRun(i + 1, request.duration, i * request.duration * 1000);
          }
        } else {
          // First segment sent immediately so transport errors surface to the UI
          await sendPx4ActuatorTest(request.motor, px4MotorTestValue, Math.min(request.duration, 3));
          if (request.duration > 3) {
            for (let offset = 3; offset < request.duration; offset += 1) {
              const timeoutS = Math.min(request.duration - offset, 3);
              const t = setTimeout(() => {
                void sendPx4ActuatorTest(request.motor, px4MotorTestValue, timeoutS).catch(() => { /* transport churn */ });
              }, offset * 1000);
              px4MotorTestTimers.push(t);
            }
          }
        }
        sendLog(mainWindow, 'info',
          `Actuator test: motor ${request.motorCount && request.motorCount > 1 ? `1-${request.motorCount} sequence` : request.motor}, ${request.throttle}%, ${request.duration}s`);
        return { success: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        sendLog(mainWindow, 'error', 'Failed to send actuator test command', message);
        return { success: false, error: message };
      }
    }

    try {
      // MOTOR_TEST_THROTTLE_TYPE: 0=PERCENT, 1=PWM
      const throttleType = request.throttleType === 'pwm' ? 1 : 0;

      const payload = serializeCommandLong({
        targetSystem: connectionState.systemId ?? 1,
        targetComponent: 1,
        command: 209, // MAV_CMD_DO_MOTOR_TEST
        confirmation: 0,
        param1: request.motor,             // Motor number (1-based)
        param2: throttleType,              // Throttle type
        param3: request.throttle,          // Throttle value (% or PWM)
        param4: request.duration,          // Duration (seconds)
        param5: request.motorCount ?? 0,   // Motor count for sequence (0 = single motor)
        param6: 0,                         // Test order (0 = default)
        param7: 0,
      });

      const packet = await sendMavlinkPacket(COMMAND_LONG_ID, payload, COMMAND_LONG_CRC_EXTRA);
      await currentTransport.write(packet);
      connectionState.packetsSent++;

      sendLog(mainWindow, 'info',
        `Motor test: motor ${request.motor}, ${request.throttle}${request.throttleType === 'pwm' ? ' PWM' : '%'}, ${request.duration}s${request.motorCount ? ` (seq ${request.motorCount})` : ''}`);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Failed to send motor test command', message);
      return { success: false, error: message };
    }
  });

  // Servo Test via MAV_CMD_DO_SET_SERVO (command 183)
  // Drives a single output channel to a specific PWM. Used by the Servo Output
  // tab's per-row test buttons. ArduPilot accepts this even when armed for
  // ground testing; user is responsible for safety (props off, etc.).
  ipcMain.handle(IPC_CHANNELS.SERVO_TEST_PULSE, async (_, request: { channel: number; pwm: number }) => {
    if (!currentTransport?.isOpen || !connectionState.isConnected) {
      return { success: false, error: 'Not connected' };
    }
    if (connectionState.protocol !== 'mavlink') {
      return { success: false, error: 'Servo test requires MAVLink connection' };
    }
    try {
      const payload = serializeCommandLong({
        targetSystem: connectionState.systemId ?? 1,
        targetComponent: 1,
        command: 183, // MAV_CMD_DO_SET_SERVO
        confirmation: 0,
        param1: request.channel,
        param2: request.pwm,
        param3: 0, param4: 0, param5: 0, param6: 0, param7: 0,
      });
      const packet = await sendMavlinkPacket(COMMAND_LONG_ID, payload, COMMAND_LONG_CRC_EXTRA);
      await currentTransport.write(packet);
      connectionState.packetsSent++;
      sendLog(mainWindow, 'info', `Servo test: ch ${request.channel} -> ${request.pwm}us`);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Failed to send servo test', message);
      return { success: false, error: message };
    }
  });

  // RC Override stick test — drives RC1..RC4 with synthetic stick positions.
  // Unlike DO_SET_SERVO, this goes through the autopilot's mixer so it works
  // for outputs assigned to mixer functions (Aileron/Elevator/Throttle/etc).
  // Assumes default RCMAP (Roll=RC1, Pitch=RC2, Throttle=RC3, Yaw=RC4).
  ipcMain.handle(IPC_CHANNELS.RC_OVERRIDE_SET, async (_, request: { roll: number; pitch: number; throttle: number; yaw: number; modeChannel?: number; modePwm?: number }) => {
    if (!currentTransport?.isOpen || !connectionState.isConnected) {
      return { success: false, error: 'Not connected' };
    }
    if (connectionState.protocol !== 'mavlink') {
      return { success: false, error: 'RC override requires MAVLink connection' };
    }
    try {
      // Aux channels default to UINT16_MAX = "ignore" per MAVLink spec, so we
      // don't accidentally hijack FLTMODE_CH or other RCx_OPTION-driven aux
      // functions with stale values. If the caller asks us to pin a specific
      // channel (typically FLTMODE_CH so the test stays in MANUAL while RX is
      // detached) we override that single aux slot.
      const IGNORE = 65535;
      const aux: number[] = new Array(14).fill(IGNORE); // chan5-18
      if (request.modeChannel && request.modePwm && request.modeChannel >= 5 && request.modeChannel <= 18) {
        aux[request.modeChannel - 5] = request.modePwm;
      }
      const payload = serializeRcChannelsOverride({
        targetSystem: connectionState.systemId ?? 1,
        targetComponent: 1,
        chan1Raw: request.roll,
        chan2Raw: request.pitch,
        chan3Raw: request.throttle,
        chan4Raw: request.yaw,
        chan5Raw: aux[0]!, chan6Raw: aux[1]!, chan7Raw: aux[2]!, chan8Raw: aux[3]!,
        chan9Raw: aux[4]!, chan10Raw: aux[5]!, chan11Raw: aux[6]!, chan12Raw: aux[7]!,
        chan13Raw: aux[8]!, chan14Raw: aux[9]!, chan15Raw: aux[10]!, chan16Raw: aux[11]!,
        chan17Raw: aux[12]!, chan18Raw: aux[13]!,
      });
      const packet = await sendMavlinkPacket(RC_CHANNELS_OVERRIDE_ID, payload, RC_CHANNELS_OVERRIDE_CRC_EXTRA);
      await currentTransport.write(packet);
      connectionState.packetsSent++;
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  });

  // Release RC override by sending UINT16_MAX on every channel - ArduPilot's
  // documented signal that the GCS is no longer overriding RC.
  ipcMain.handle(IPC_CHANNELS.RC_OVERRIDE_RELEASE, async () => {
    if (!currentTransport?.isOpen || !connectionState.isConnected) {
      return { success: false, error: 'Not connected' };
    }
    if (connectionState.protocol !== 'mavlink') {
      return { success: false, error: 'RC override requires MAVLink connection' };
    }
    try {
      const RELEASE = 65535; // UINT16_MAX = "ignore this channel"
      const payload = serializeRcChannelsOverride({
        targetSystem: connectionState.systemId ?? 1,
        targetComponent: 1,
        chan1Raw: RELEASE, chan2Raw: RELEASE, chan3Raw: RELEASE, chan4Raw: RELEASE,
        chan5Raw: RELEASE, chan6Raw: RELEASE, chan7Raw: RELEASE, chan8Raw: RELEASE,
        chan9Raw: RELEASE, chan10Raw: RELEASE, chan11Raw: RELEASE, chan12Raw: RELEASE,
        chan13Raw: RELEASE, chan14Raw: RELEASE, chan15Raw: RELEASE, chan16Raw: RELEASE,
        chan17Raw: RELEASE, chan18Raw: RELEASE,
      });
      const packet = await sendMavlinkPacket(RC_CHANNELS_OVERRIDE_ID, payload, RC_CHANNELS_OVERRIDE_CRC_EXTRA);
      await currentTransport.write(packet);
      connectionState.packetsSent++;
      sendLog(mainWindow, 'info', 'RC override released');
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  });

  // Releases an override set by SERVO_TEST_PULSE. ArduPilot interprets PWM=0
  // on DO_SET_SERVO as "stop overriding this channel" and returns it to the
  // autopilot's normal control.
  ipcMain.handle(IPC_CHANNELS.SERVO_TEST_RELEASE, async (_, request: { channel: number }) => {
    if (!currentTransport?.isOpen || !connectionState.isConnected) {
      return { success: false, error: 'Not connected' };
    }
    if (connectionState.protocol !== 'mavlink') {
      return { success: false, error: 'Servo test requires MAVLink connection' };
    }
    try {
      const payload = serializeCommandLong({
        targetSystem: connectionState.systemId ?? 1,
        targetComponent: 1,
        command: 183,
        confirmation: 0,
        param1: request.channel,
        param2: 0,
        param3: 0, param4: 0, param5: 0, param6: 0, param7: 0,
      });
      const packet = await sendMavlinkPacket(COMMAND_LONG_ID, payload, COMMAND_LONG_CRC_EXTRA);
      await currentTransport.write(packet);
      connectionState.packetsSent++;
      sendLog(mainWindow, 'info', `Servo test release: ch ${request.channel}`);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Failed to send servo release', message);
      return { success: false, error: message };
    }
  });

  // Stop all motors by sending DO_MOTOR_TEST with throttle=0 to every motor.
  // ArduPilot's motor test auto-stops on its duration timer, but this gives
  // a user-triggered immediate stop.
  ipcMain.handle(IPC_CHANNELS.MOTOR_TEST_STOP, async (_, motorCount: number): Promise<MotorTestResponse> => {
    if (!currentTransport?.isOpen || !connectionState.isConnected) {
      return { success: false, error: 'Not connected' };
    }

    if (connectionState.firmware === 'px4') {
      try {
        clearPx4MotorTestTimers();
        // timeout <= 0 = ACTION_RELEASE_CONTROL: hands the output back to the
        // (disarmed) allocator, which stops the motor.
        for (let motor = 1; motor <= motorCount; motor++) {
          await sendPx4ActuatorTest(motor, 0, 0);
        }
        sendLog(mainWindow, 'info', `Actuator test STOP sent to ${motorCount} motors`);
        return { success: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        sendLog(mainWindow, 'error', 'Failed to stop motors', message);
        return { success: false, error: message };
      }
    }

    try {
      for (let motor = 1; motor <= motorCount; motor++) {
        const payload = serializeCommandLong({
          targetSystem: connectionState.systemId ?? 1,
          targetComponent: 1,
          command: 209, // MAV_CMD_DO_MOTOR_TEST
          confirmation: 0,
          param1: motor,
          param2: 0, // percent
          param3: 0, // 0% throttle
          param4: 0, // 0 seconds
          param5: 0,
          param6: 0,
          param7: 0,
        });
        const packet = await sendMavlinkPacket(COMMAND_LONG_ID, payload, COMMAND_LONG_CRC_EXTRA);
        await currentTransport.write(packet);
        connectionState.packetsSent++;
      }
      sendLog(mainWindow, 'info', `Motor test STOP sent to ${motorCount} motors`);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Failed to stop motors', message);
      return { success: false, error: message };
    }
  });

  // Save parameters to file
  ipcMain.handle(IPC_CHANNELS.PARAM_SAVE_FILE, async (_, params: Array<{ id: string; value: number }>, vehicleType?: string): Promise<{ success: boolean; error?: string; filePath?: string }> => {
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

      // Header with vehicle type and timestamp for cross-vehicle-type safety
      const header = [
        `# ArduDeck Parameter File`,
        vehicleType ? `# Vehicle: ${vehicleType}` : null,
        `# Date: ${new Date().toISOString()}`,
        `# Parameters: ${params.length}`,
        '',
      ].filter(Boolean).join('\n');

      // Format: PARAM_NAME,VALUE (one per line)
      // MAVLink parameters are 32-bit floats. When decoded into JS 64-bit doubles
      // they carry floating-point noise (e.g. 0.18000000715255737 instead of 0.18).
      // toPrecision(6) recovers the original 6 significant digits; parseFloat strips
      // trailing zeros so integers stored as floats still look clean (e.g. "1" not "1.00000").
      const formatValue = (value: number): string => {
        if (Number.isInteger(value)) return String(value);
        return String(parseFloat(value.toPrecision(6)));
      };
      const content = header + '\n\n' + params.map(p => `${p.id},${formatValue(p.value)}`).join('\n');

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
  ipcMain.handle(IPC_CHANNELS.MISSION_IMPORT_AREA, async (event): Promise<{ success: boolean; error?: string; format?: 'kml' | 'geojson'; content?: string; fileName?: string }> => {
    try {
      // Parent the dialog to the window that invoked it (the Area Editor is a
      // separate window) so focus returns there, not to the main window.
      const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
      const result = await dialog.showOpenDialog(parentWindow, {
        title: 'Import Survey Area',
        filters: [
          { name: 'Boundary Files', extensions: ['kml', 'kmz', 'geojson', 'json', 'shp', 'zip'] },
          { name: 'KML / KMZ', extensions: ['kml', 'kmz'] },
          { name: 'GeoJSON', extensions: ['geojson', 'json'] },
          { name: 'Shapefile', extensions: ['shp', 'zip'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile'],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: 'Cancelled' };
      }

      const filePath = result.filePaths[0]!;
      const path = await import('path');
      const fs = await import('fs/promises');
      const ext = path.extname(filePath).replace(/^\./, '').toLowerCase();
      const fileName = path.basename(filePath);

      if (ext === 'kmz') {
        // KMZ is a zip; pull the first .kml entry (conventionally doc.kml).
        const AdmZip = (await import('adm-zip')).default;
        const zip = new AdmZip(filePath);
        const kmlEntry = zip.getEntries().find((e) => e.entryName.toLowerCase().endsWith('.kml'));
        if (!kmlEntry) return { success: false, error: 'No .kml found inside the KMZ archive' };
        return { success: true, format: 'kml', content: kmlEntry.getData().toString('utf-8'), fileName };
      }

      if (ext === 'shp') {
        // Shapefile geometry lives in the .shp; the sibling .prj (same basename)
        // carries the CRS. Convert to GeoJSON in-process and reuse the GeoJSON path.
        const { shapefileToGeoJson } = await import('./gis/shapefile-to-geojson.js');
        const shpBuf = await fs.readFile(filePath);
        const prjPath = filePath.replace(/\.shp$/i, '.prj');
        let prj: string | undefined;
        try { prj = await fs.readFile(prjPath, 'utf-8'); } catch { prj = undefined; }
        const { geojson, featureCount } = shapefileToGeoJson(new Uint8Array(shpBuf), prj);
        if (featureCount === 0) return { success: false, error: 'No polygon or line geometry found in the shapefile' };
        return { success: true, format: 'geojson', content: JSON.stringify(geojson), fileName };
      }

      if (ext === 'zip') {
        // A zipped shapefile bundle: pull the .shp + matching .prj out of the archive.
        const AdmZip = (await import('adm-zip')).default;
        const { shapefileToGeoJson } = await import('./gis/shapefile-to-geojson.js');
        const zip = new AdmZip(filePath);
        const entries = zip.getEntries();
        const shpEntry = entries.find((e) => e.entryName.toLowerCase().endsWith('.shp'));
        if (!shpEntry) return { success: false, error: 'No .shp found inside the zip archive' };
        const base = shpEntry.entryName.replace(/\.shp$/i, '').toLowerCase();
        const prjEntry = entries.find((e) => e.entryName.toLowerCase() === `${base}.prj`);
        const prj = prjEntry ? prjEntry.getData().toString('utf-8') : undefined;
        const { geojson, featureCount } = shapefileToGeoJson(new Uint8Array(shpEntry.getData()), prj);
        if (featureCount === 0) return { success: false, error: 'No polygon or line geometry found in the shapefile' };
        return { success: true, format: 'geojson', content: JSON.stringify(geojson), fileName };
      }

      const content = await fs.readFile(filePath, 'utf-8');
      const format: 'kml' | 'geojson' = ext === 'kml' ? 'kml' : 'geojson';
      return { success: true, format, content, fileName };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PARAM_LOAD_FILE, async (): Promise<{ success: boolean; error?: string; params?: Array<{ id: string; value: number }>; vehicleType?: string; filePath?: string }> => {
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

      const filePath = result.filePaths[0]!;
      const fs = await import('fs/promises');
      const content = await fs.readFile(filePath, 'utf-8');

      // Parse: PARAM_NAME,VALUE (one per line)
      // Also supports PARAM_NAME VALUE (space-separated, like Mission Planner)
      const params: Array<{ id: string; value: number }> = [];
      let vehicleType: string | undefined;
      const lines = content.split(/\r?\n/);

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Parse header comments for metadata
        if (trimmed.startsWith('#')) {
          const vehicleMatch = trimmed.match(/^#\s*Vehicle:\s*(.+)/i);
          if (vehicleMatch?.[1]) {
            vehicleType = vehicleMatch[1].trim();
          }
          continue;
        }

        // Try comma-separated first, then space/tab
        let parts = trimmed.split(',');
        if (parts.length < 2) {
          parts = trimmed.split(/\s+/);
        }

        if (parts.length >= 2) {
          const id = parts[0]!.trim();
          const value = parseFloat(parts[1]!.trim());

          if (id && !isNaN(value)) {
            params.push({ id, value });
          }
        }
      }

      sendLog(mainWindow, 'info', `Loaded ${params.length} parameters from ${filePath}${vehicleType ? ` (${vehicleType})` : ''}`);
      return { success: true, params, vehicleType, filePath };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Failed to load parameters', message);
      return { success: false, error: message };
    }
  });

  // Save parameters to a specific file path (offline mode - Save)
  ipcMain.handle(IPC_CHANNELS.PARAM_SAVE_TO_PATH, async (_, params: Array<{ id: string; value: number }>, filePath: string, vehicleType?: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const header = [
        `# ArduDeck Parameter File`,
        vehicleType ? `# Vehicle: ${vehicleType}` : null,
        `# Date: ${new Date().toISOString()}`,
        `# Parameters: ${params.length}`,
        '',
      ].filter(Boolean).join('\n');

      const formatValue = (value: number): string => {
        if (Number.isInteger(value)) return String(value);
        return String(parseFloat(value.toPrecision(6)));
      };
      const content = header + '\n\n' + params.map(p => `${p.id},${formatValue(p.value)}`).join('\n');

      const fs = await import('fs/promises');
      await fs.writeFile(filePath, content, 'utf-8');

      sendLog(mainWindow, 'info', `Saved ${params.length} parameters to ${filePath}`);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Failed to save parameters', message);
      return { success: false, error: message };
    }
  });

  // ============================================================================
  // Parameter History (Version Control)
  // ============================================================================

  ipcMain.handle(IPC_CHANNELS.PARAM_HISTORY_SAVE, async (
    _,
    boardUid: string,
    boardName: string,
    changes: ParamChange[],
    vehicleType?: string
  ): Promise<{ success: boolean; checkpointId?: string }> => {
    try {
      const { randomUUID } = await import('crypto');
      const checkpoint: ParamCheckpoint = {
        id: randomUUID(),
        timestamp: Date.now(),
        changes,
        vehicleType,
      };

      const boards = paramHistoryStore.get('boards');
      const existing = boards[boardUid];
      if (existing) {
        existing.checkpoints.unshift(checkpoint);
        // Keep max 100 checkpoints per board
        if (existing.checkpoints.length > 100) {
          existing.checkpoints = existing.checkpoints.slice(0, 100);
        }
        existing.boardName = boardName;
      } else {
        boards[boardUid] = {
          boardUid,
          boardName,
          checkpoints: [checkpoint],
        };
      }
      paramHistoryStore.set('boards', boards);
      sendLog(mainWindow, 'info', `Param checkpoint saved: ${changes.length} change(s) for board ${boardUid}`);
      return { success: true, checkpointId: checkpoint.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Failed to save param checkpoint', message);
      return { success: false };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PARAM_HISTORY_LIST, async (
    _,
    boardUid: string
  ): Promise<ParamCheckpoint[]> => {
    const boards = paramHistoryStore.get('boards');
    return boards[boardUid]?.checkpoints ?? [];
  });

  ipcMain.handle(IPC_CHANNELS.PARAM_HISTORY_RESTORE, async (
    _,
    boardUid: string,
    checkpointId: string
  ): Promise<{ success: boolean; changes?: ParamChange[] }> => {
    const boards = paramHistoryStore.get('boards');
    const board = boards[boardUid];
    if (!board) return { success: false };
    const checkpoint = board.checkpoints.find(c => c.id === checkpointId);
    if (!checkpoint) return { success: false };
    return { success: true, changes: checkpoint.changes };
  });

  ipcMain.handle(IPC_CHANNELS.PARAM_HISTORY_DELETE, async (
    _,
    boardUid: string,
    checkpointId: string
  ): Promise<{ success: boolean }> => {
    const boards = paramHistoryStore.get('boards');
    const board = boards[boardUid];
    if (!board) return { success: false };
    board.checkpoints = board.checkpoints.filter(c => c.id !== checkpointId);
    paramHistoryStore.set('boards', boards);
    return { success: true };
  });

  // Focus the main window and navigate it to a view. Used by secondary
  // windows (area editor) whose UI links back into the main app.
  ipcMain.handle(IPC_CHANNELS.NAV_OPEN_VIEW, async (_, view: string) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    safeSend(mainWindow, IPC_CHANNELS.NAV_DEEP_LINK_OPEN, { view });
  });

  // ============================================================================
  // Fleet vault (local git repo + GitHub sync)
  // ============================================================================
  // isomorphic-git is imported lazily so app startup doesn't pay for it.

  const vault = () => import('./fleet-repo/fleet-repo-manager');

  ipcMain.handle(IPC_CHANNELS.FLEET_REPO_STATUS, async () => (await vault()).status());

  ipcMain.handle(IPC_CHANNELS.FLEET_REPO_SNAPSHOT_PARAMS, async (
    _,
    uid: string,
    boardName: string,
    params: Array<{ id: string; value: number }>,
    vehicleType?: string,
    note?: string,
    sitl?: boolean,
  ) => {
    try {
      // The stack is taken from the live link rather than passed in: these are
      // the connected vehicle's parameters, and main is the only place that
      // knows which flight stack produced them.
      const result = await (await vault()).snapshotParams(
        uid, boardName, params, vehicleType, note, sitl, connectionState.firmware,
      );
      if (result.changed) sendLog(mainWindow, 'info', `Vault: snapshot of ${params.length} params for ${boardName}`);
      return { success: true, ...result };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Snapshot failed';
      sendLog(mainWindow, 'error', 'Vault: param snapshot failed', message);
      return { success: false, error: message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FLEET_REPO_SNAPSHOT_MISSION, async (
    _,
    site: string,
    missionName: string,
    items: MissionItem[],
  ) => {
    try {
      const result = await (await vault()).snapshotMission(site, missionName, formatWaypointsFile(items));
      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Snapshot failed' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FLEET_REPO_SNAPSHOT_AREA, async (
    _,
    site: string,
    kmlContent: string,
  ) => {
    try {
      const result = await (await vault()).snapshotArea(site, kmlContent);
      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Snapshot failed' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FLEET_REPO_HISTORY, async (_, limit?: number) => {
    try {
      return await (await vault()).history(limit);
    } catch {
      return [];
    }
  });

  ipcMain.handle(IPC_CHANNELS.FLEET_REPO_READ_FILE, async (
    _,
    filepath: string,
    oid?: string,
  ) => {
    const v = await vault();
    return oid ? v.readFileAtCommit(oid, filepath) : v.readWorkingFile(filepath);
  });

  ipcMain.handle(IPC_CHANNELS.FLEET_REPO_LIST_UNITS, async () => (await vault()).listUnits());
  ipcMain.handle(IPC_CHANNELS.FLEET_REPO_LIST_SITES, async () => (await vault()).listSites());
  ipcMain.handle(IPC_CHANNELS.FLEET_REPO_OPEN_DIR, async () => (await vault()).openRepoDir());

  ipcMain.handle(IPC_CHANNELS.FLEET_REPO_GH_DEVICE_START, async () => {
    try {
      return { success: true, ...(await (await vault()).githubDeviceStart()) };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Device flow failed' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FLEET_REPO_GH_DEVICE_POLL, async (_, deviceCode: string) =>
    (await vault()).githubDevicePoll(deviceCode));

  ipcMain.handle(IPC_CHANNELS.FLEET_REPO_GH_SET_TOKEN, async (_, token: string) =>
    (await vault()).githubSetToken(token));

  ipcMain.handle(IPC_CHANNELS.FLEET_REPO_GH_DISCONNECT, async () => {
    (await vault()).githubDisconnect();
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.FLEET_REPO_GH_CREATE_REPO, async (_, repoName: string) =>
    (await vault()).githubCreateRepo(repoName));

  ipcMain.handle(IPC_CHANNELS.FLEET_REPO_SET_CUSTOM_REMOTE, async (
    _,
    url: string,
    token: string,
    username?: string,
  ) => (await vault()).setCustomRemote(url, token, username));

  ipcMain.handle(IPC_CHANNELS.FLEET_REPO_RENAME_UNIT, async (_, uid: string, name: string) =>
    (await vault()).renameUnit(uid, name));

  ipcMain.handle(IPC_CHANNELS.FLEET_REPO_LINK_UNIT, async (_, unitUid: string, aliasUid: string) =>
    (await vault()).linkUnit(unitUid, aliasUid));

  ipcMain.handle(IPC_CHANNELS.FLEET_REPO_SET_AUTO_SYNC, async (_, enabled: boolean) => {
    (await vault()).setAutoSync(enabled);
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.FLEET_REPO_GH_LIST_REPOS, async () =>
    (await vault()).githubListRepos());

  ipcMain.handle(IPC_CHANNELS.FLEET_REPO_GH_USE_EXISTING, async (_, fullName: string) =>
    (await vault()).githubUseExistingRepo(fullName));

  ipcMain.handle(IPC_CHANNELS.FLEET_REPO_GH_SYNC, async () => {
    const result = await (await vault()).githubSync();
    if (result.success) sendLog(mainWindow, 'info', 'Vault: synced with GitHub');
    else sendLog(mainWindow, 'warn', 'Vault: sync failed', result.error);
    return result;
  });

  // ============================================================================
  // Mission Planning handlers
  // ============================================================================

  // Download mission from flight controller
  ipcMain.handle(IPC_CHANNELS.MISSION_DOWNLOAD, async (): Promise<{ success: boolean; error?: string }> => {
    // Download from the ACTIVE/selected vehicle. In single-vehicle this resolves to
    // the primary connection (unchanged); in fleet mode it resolves the selected
    // fleet vehicle's background transport + virtual sysid, and its responses are
    // routed in from the background-link handler.
    const target = resolveVehicleTarget(connectionRegistry.getActiveVehicleKey());
    if (!target) {
      return { success: false, error: 'Vehicle not reachable' };
    }

    // Initialize download state (carry the target so responses + per-item requests
    // + the closing ACK all go to the right vehicle).
    missionDownloadState = {
      expected: 0,
      received: new Map(),
      timeout: null,
      target: { transport: target.transport, sysid: target.sysid },
    };

    try {
      // Send MISSION_REQUEST_LIST to start download
      // v1: target_system(1), target_component(1) = 2 bytes
      // v2: target_system(1), target_component(1), mission_type(1) = 3 bytes
      let packet: Uint8Array;
      const targetSystem = target.sysid;

      if (detectedMavlinkVersion === 2) {
        const payload = serializeMissionRequestList({
          targetSystem,
          targetComponent: 1,
          missionType: MAV_MISSION_TYPE.MISSION,
        });
        packet = await sendMavlinkPacket(MISSION_REQUEST_LIST_ID, payload, MISSION_REQUEST_LIST_CRC_EXTRA, { link: target.transport });
      } else {
        // MAVLink v1: manual payload (no mission_type)
        // v1 path: manual payload without mission_type extension
        const payload = new Uint8Array(2);
        payload[0] = targetSystem & 0xff;
        payload[1] = 1; // target_component
        packet = serializeV1(MISSION_REQUEST_LIST_ID, payload, MISSION_REQUEST_LIST_CRC_EXTRA_V1, { sysid: gcsSysid, compid: 190, sequence: nextTxSeq(target.transport) });
      }

      await target.transport.write(packet);
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

      // DIAGNOSTIC: Log upload attempt details
      console.log(`[MISSION UPLOAD] MAVLink v${detectedMavlinkVersion}, targetSystem=${targetSystem}, count=${items.length}`);
      console.log(`[MISSION UPLOAD] MISSION_COUNT_CRC_EXTRA=${MISSION_COUNT_CRC_EXTRA} (should be 221)`);

      if (detectedMavlinkVersion === 2) {
        const payload = serializeMissionCount({
          targetSystem,
          targetComponent: 1,
          count: items.length,
          missionType: MAV_MISSION_TYPE.MISSION,
        });
        console.log(`[MISSION UPLOAD] v2 payload: ${Array.from(payload).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
        packet = await sendMavlinkPacket(MISSION_COUNT_ID, payload, MISSION_COUNT_CRC_EXTRA);
      } else {
        // MAVLink v1 packet but use v2 byte order (size-sorted) for payload!
        // ArduPilot uses v2 byte order internally regardless of packet format.
        // v2 order: count(2), target_system(1), target_component(1) - no mission_type for v1
        const payload = new Uint8Array(4);
        payload[0] = items.length & 0xff;         // count low byte
        payload[1] = (items.length >> 8) & 0xff;  // count high byte
        payload[2] = targetSystem & 0xff;         // target_system
        payload[3] = 1;                           // target_component
        console.log(`[MISSION UPLOAD] v1 payload: ${Array.from(payload).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
        packet = serializeV1(MISSION_COUNT_ID, payload, MISSION_COUNT_CRC_EXTRA_V1, { sysid: gcsSysid, compid: 190, sequence: nextTxSeq(currentTransport) });
      }

      console.log(`[MISSION UPLOAD] Full packet (${packet.length} bytes): ${Array.from(packet).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
      await currentTransport.write(packet);
      console.log(`[MISSION UPLOAD] Packet written to transport OK`);
      connectionState.packetsSent++;

      // Log raw bytes for debugging
      const hexBytes = Array.from(packet).map(b => b.toString(16).padStart(2, '0')).join(' ');
      sendLog(mainWindow, 'debug', `Sent MISSION_COUNT: ${hexBytes}`);
      sendLog(mainWindow, 'info', `Uploading ${items.length} mission items (MAVLink v${detectedMavlinkVersion})...`);

      // Set timeout waiting for FC to request first item
      missionUploadState.timeout = setTimeout(() => {
        if (missionUploadState && missionUploadState.currentSeq === 0) {
          settleMissionUpload(mainWindow, false, 'Timeout: FC did not request mission items');
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

  // Upload a mission to a specific vehicle (survey / multi-vehicle). Reuses the
  // proven upload engine via a per-vehicle target override and resolves when the
  // FC ACKs. Sequential: one vehicle at a time (callers await before the next).
  ipcMain.handle(IPC_CHANNELS.MISSION_UPLOAD_TO_VEHICLE, async (_, vehicleKey: string, items: MissionItem[]): Promise<{ success: boolean; error?: string }> => {
    if (items.length === 0) return { success: false, error: 'No mission items to upload' };
    const target = resolveVehicleTarget(vehicleKey);
    if (!target) return { success: false, error: 'Vehicle not reachable' };
    // Mission protocol (REQUEST/ACK) is routed to this upload from whichever link
    // it arrives on - primary or background - via handleMissionRequestForUpload,
    // so the target may be on any connected link. Uploads are sequential: one at
    // a time (the singleton missionUploadState carries the active target).
    if (missionUploadState) {
      return { success: false, error: 'Another mission upload is in progress' };
    }

    const total = items.length;
    const progress = (state: MissionVehicleProgress['state'], sent: number, error?: string): void => {
      safeSend(mainWindow, IPC_CHANNELS.MISSION_VEHICLE_PROGRESS, { vehicleKey, sent, total, state, error } satisfies MissionVehicleProgress);
    };
    progress('uploading', 0);

    const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
      missionUploadState = {
        items,
        currentSeq: 0,
        timeout: null,
        target: { transport: target.transport, sysid: target.sysid },
        onComplete: (ok, error) => resolve({ success: ok, error }),
      };

      void (async () => {
        try {
          let packet: Uint8Array;
          if (detectedMavlinkVersion === 2) {
            const payload = serializeMissionCount({
              targetSystem: target.sysid,
              targetComponent: 1,
              count: total,
              missionType: MAV_MISSION_TYPE.MISSION,
            });
            packet = await sendMavlinkPacket(MISSION_COUNT_ID, payload, MISSION_COUNT_CRC_EXTRA, { link: target.transport });
          } else {
            const payload = new Uint8Array(4);
            payload[0] = total & 0xff;
            payload[1] = (total >> 8) & 0xff;
            payload[2] = target.sysid & 0xff;
            payload[3] = 1;
            packet = serializeV1(MISSION_COUNT_ID, payload, MISSION_COUNT_CRC_EXTRA_V1, { sysid: gcsSysid, compid: 190, sequence: nextTxSeq(target.transport) });
          }
          await target.transport.write(packet);
          connectionState.packetsSent++;
          if (missionUploadState) {
            missionUploadState.timeout = setTimeout(() => {
              if (missionUploadState && missionUploadState.currentSeq === 0) {
                settleMissionUpload(mainWindow, false, 'Timeout: FC did not request mission items');
              }
            }, 10000);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          settleMissionUpload(mainWindow, false, message);
        }
      })();
    });

    progress(result.success ? 'complete' : 'error', result.success ? total : 0, result.error);
    return result;
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
        packet = await sendMavlinkPacket(MISSION_CLEAR_ALL_ID, payload, MISSION_CLEAR_ALL_CRC_EXTRA);
      } else {
        // MAVLink v1: manual payload (no mission_type)
        // v1 path: manual payload without mission_type extension
        const payload = new Uint8Array(2);
        payload[0] = targetSystem & 0xff;
        payload[1] = 1; // target_component
        packet = serializeV1(MISSION_CLEAR_ALL_ID, payload, MISSION_CLEAR_ALL_CRC_EXTRA_V1, { sysid: gcsSysid, compid: 190 });
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
    // Jump-to-waypoint on the ACTIVE/selected vehicle (single-vehicle resolves to
    // the primary; fleet resolves the selected vehicle). One-shot: the FC reports
    // back via MISSION_CURRENT telemetry, no ACK handshake to route.
    const target = resolveVehicleTarget(connectionRegistry.getActiveVehicleKey());
    if (!target) {
      return { success: false, error: 'Vehicle not reachable' };
    }

    try {
      // v1 wire order: target_system(1), target_component(1), seq(2)
      // v2 wire order: seq(2), target_system(1), target_component(1)
      let packet: Uint8Array;
      const targetSystem = target.sysid;

      if (detectedMavlinkVersion === 2) {
        const payload = serializeMissionSetCurrent({
          targetSystem,
          targetComponent: 1,
          seq,
        });
        packet = await sendMavlinkPacket(MISSION_SET_CURRENT_ID, payload, MISSION_SET_CURRENT_CRC_EXTRA, { link: target.transport });
      } else {
        // MAVLink v1 packet but use v2 byte order (size-sorted) for payload!
        // ArduPilot uses v2 byte order internally regardless of packet format.
        // v2 order: seq(2), target_system(1), target_component(1)
        const payload = new Uint8Array(4);
        payload[0] = seq & 0xff;              // seq low byte
        payload[1] = (seq >> 8) & 0xff;       // seq high byte
        payload[2] = targetSystem & 0xff;     // target_system
        payload[3] = 1;                       // target_component
        packet = serializeV1(MISSION_SET_CURRENT_ID, payload, MISSION_SET_CURRENT_CRC_EXTRA, { sysid: gcsSysid, compid: 190, sequence: nextTxSeq(target.transport) });
      }

      await target.transport.write(packet);
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
  ipcMain.handle(IPC_CHANNELS.MISSION_SAVE_FILE, async (_, items: MissionItem[], format?: 'waypoints' | 'plan' | 'kmz'): Promise<{ success: boolean; filePath?: string; error?: string }> => {
    try {
      // When the caller picked a format explicitly (Export dropdown), default
      // the filename + filter to it so the saved file is unambiguous; otherwise
      // offer all and decide by the chosen extension.
      const allFilters = {
        waypoints: { name: 'Waypoints', extensions: ['waypoints', 'txt'] },
        plan: { name: 'QGC Plan', extensions: ['plan'] },
        kmz: { name: 'DJI KMZ', extensions: ['kmz'] },
      };
      const first = format && format in allFilters ? format : 'waypoints';
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Mission',
        defaultPath: `mission.${first === 'waypoints' ? 'waypoints' : first === 'plan' ? 'plan' : 'kmz'}`,
        filters: [
          allFilters[first],
          ...(['waypoints', 'plan', 'kmz'] as const).filter((f) => f !== first).map((f) => allFilters[f]),
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (result.canceled || !result.filePath) {
        return { success: false, error: 'Cancelled' };
      }

      const fs = await import('fs/promises');
      const path = await import('path');
      const ext = path.extname(result.filePath).toLowerCase();

      if (ext === '.kmz' || (ext === '' && format === 'kmz')) {
        // DJI WPML mission (issue #121): zip with wpmz/template.kml + waylines.wpml
        const { templateKml, waylinesWpml, waypointCount } = buildDjiWpml(items, Date.now());
        if (waypointCount === 0) {
          return { success: false, error: 'No exportable waypoints (DJI KMZ needs plain waypoints with coordinates)' };
        }
        const AdmZip = (await import('adm-zip')).default;
        const zip = new AdmZip();
        zip.addFile('wpmz/template.kml', Buffer.from(templateKml, 'utf-8'));
        zip.addFile('wpmz/waylines.wpml', Buffer.from(waylinesWpml, 'utf-8'));
        await fs.writeFile(result.filePath, zip.toBuffer());
        sendLog(mainWindow, 'info', `Saved DJI KMZ mission (${waypointCount} waypoints) to ${result.filePath}`);
        return { success: true, filePath: result.filePath };
      }

      let content: string;
      if (ext === '.plan' || (ext === '' && format === 'plan')) {
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
          { name: 'Mission Files', extensions: ['waypoints', 'txt', 'plan', 'kmz'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile'],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: 'Cancelled' };
      }

      const filePath = result.filePaths[0]!;
      const fs = await import('fs/promises');
      const path = await import('path');
      const ext = path.extname(filePath).toLowerCase();

      let items: MissionItem[];
      if (ext === '.kmz') {
        // DJI WPML mission (issue #121): waylines.wpml inside the zip holds the waypoints
        const AdmZip = (await import('adm-zip')).default;
        const zip = new AdmZip(filePath);
        const entry = zip.getEntries().find((e) => e.entryName.toLowerCase().endsWith('waylines.wpml'));
        if (!entry) {
          return { success: false, error: 'Not a DJI waypoint mission: no waylines.wpml inside the .kmz' };
        }
        items = parseDjiWpml(entry.getData().toString('utf-8'));
        if (items.length === 0) {
          return { success: false, error: 'No waypoints found in the DJI mission' };
        }
      } else {
        const content = await fs.readFile(filePath, 'utf-8');
        if (ext === '.plan') {
          items = parseQgcPlan(content);
        } else {
          items = parseWaypointsFile(content);
        }
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
        packet = await sendMavlinkPacket(MISSION_REQUEST_LIST_ID, payload, MISSION_REQUEST_LIST_CRC_EXTRA);
      } else {
        // MAVLink v1 doesn't support fence mission type in the standard way
        // Most FCs require v2 for fence operations
        const payload = new Uint8Array(3);
        payload[0] = targetSystem & 0xff;
        payload[1] = 1;
        payload[2] = MAV_MISSION_TYPE.FENCE;
        packet = serializeV1(MISSION_REQUEST_LIST_ID, payload, MISSION_REQUEST_LIST_CRC_EXTRA_V1, { sysid: gcsSysid, compid: 190, sequence: nextTxSeq(currentTransport) });
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
        packet = await sendMavlinkPacket(MISSION_COUNT_ID, payload, MISSION_COUNT_CRC_EXTRA);
      } else {
        const payload = new Uint8Array(5);
        payload[0] = items.length & 0xff;
        payload[1] = (items.length >> 8) & 0xff;
        payload[2] = targetSystem & 0xff;
        payload[3] = 1;
        payload[4] = MAV_MISSION_TYPE.FENCE;
        packet = serializeV1(MISSION_COUNT_ID, payload, MISSION_COUNT_CRC_EXTRA_V1, { sysid: gcsSysid, compid: 190, sequence: nextTxSeq(currentTransport) });
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
        packet = await sendMavlinkPacket(MISSION_CLEAR_ALL_ID, payload, MISSION_CLEAR_ALL_CRC_EXTRA);
      } else {
        const payload = new Uint8Array(3);
        payload[0] = targetSystem & 0xff;
        payload[1] = 1;
        payload[2] = MAV_MISSION_TYPE.FENCE;
        packet = serializeV1(MISSION_CLEAR_ALL_ID, payload, MISSION_CLEAR_ALL_CRC_EXTRA_V1, { sysid: gcsSysid, compid: 190 });
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

      const filePath = result.filePaths[0]!;
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
        packet = await sendMavlinkPacket(MISSION_REQUEST_LIST_ID, payload, MISSION_REQUEST_LIST_CRC_EXTRA);
      } else {
        const payload = new Uint8Array(3);
        payload[0] = targetSystem & 0xff;
        payload[1] = 1;
        payload[2] = MAV_MISSION_TYPE.RALLY;
        packet = serializeV1(MISSION_REQUEST_LIST_ID, payload, MISSION_REQUEST_LIST_CRC_EXTRA_V1, { sysid: gcsSysid, compid: 190, sequence: nextTxSeq(currentTransport) });
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
        packet = await sendMavlinkPacket(MISSION_COUNT_ID, payload, MISSION_COUNT_CRC_EXTRA);
      } else {
        const payload = new Uint8Array(5);
        payload[0] = items.length & 0xff;
        payload[1] = (items.length >> 8) & 0xff;
        payload[2] = targetSystem & 0xff;
        payload[3] = 1;
        payload[4] = MAV_MISSION_TYPE.RALLY;
        packet = serializeV1(MISSION_COUNT_ID, payload, MISSION_COUNT_CRC_EXTRA_V1, { sysid: gcsSysid, compid: 190, sequence: nextTxSeq(currentTransport) });
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
        packet = await sendMavlinkPacket(MISSION_CLEAR_ALL_ID, payload, MISSION_CLEAR_ALL_CRC_EXTRA);
      } else {
        const payload = new Uint8Array(3);
        payload[0] = targetSystem & 0xff;
        payload[1] = 1;
        payload[2] = MAV_MISSION_TYPE.RALLY;
        packet = serializeV1(MISSION_CLEAR_ALL_ID, payload, MISSION_CLEAR_ALL_CRC_EXTRA_V1, { sysid: gcsSysid, compid: 190 });
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

      const filePath = result.filePaths[0]!;
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
      sendLog(mainWindow, 'info', `Detected ${boards.length} ${boards.length === 1 ? 'board' : 'boards'}`);
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
        const boards = await getBetaflightBoards();
        sendLog(mainWindow, 'info', `Found ${boards.length} Betaflight boards`);
        return { success: true, boards };
      }

      if (source === 'inav') {
        const boards = await getInavBoards();
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

      // For BF/iNav, use dedicated version fetchers; others use flat list
      let versions: FirmwareVersion[];
      if (source === 'betaflight') {
        versions = await getBetaflightVersions(boardId);
      } else if (source === 'inav') {
        versions = await getInavVersions(vehicleType, boardId);
      } else {
        const manifest = await fetchFirmwareVersions(source, vehicleType, boardId);
        versions = manifest.versions;
      }
      const groups: VersionGroup[] = [{
        major: 'all',
        label: 'All Versions',
        versions,
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
  // --- EdgeTX radio SD-card packages -------------------------------------

  /**
   * Compute the ArduDeck HUD widget config from the connected vehicle's
   * param cache. Values the vehicle can't provide are omitted so the widget
   * keeps its own defaults.
   */
  function computeHudConfig(): Record<string, string | number> {
    const num = (name: string): number | null => {
      const p = receivedParams.get(name);
      return p ? p.paramValue : null;
    };
    const cfg: Record<string, string | number> = {};
    const vehicleName = connectionState.boardId || connectionState.vehicleType;
    if (vehicleName) cfg.name = vehicleName;

    if (connectionState.firmware === 'px4') {
      // PX4 names AND means something different here, so this is not a rename:
      //   BAT1_N_CELLS    cell count outright (no dividing a pack voltage)
      //   BAT1_V_CHARGED  full CELL voltage      BAT1_V_EMPTY  empty CELL voltage
      //   BAT_LOW_THR / BAT_CRIT_THR   fractions of remaining capacity (0..0.5,
      //                                units "norm"), NOT voltages
      // The widget wants per-cell warning voltages, so map the thresholds back
      // through PX4's own linear voltage model: a threshold of t sits at
      // v_empty + t * (v_charged - v_empty). Taking BAT_LOW_THR as a voltage
      // would put the warning at 0.15 V per cell.
      const cells = num('BAT1_N_CELLS');
      if (cells && cells > 0) cfg.cells = Math.round(cells);

      const vFull = num('BAT1_V_CHARGED');
      const vEmpty = num('BAT1_V_EMPTY');
      const low = num('BAT_LOW_THR');
      const crit = num('BAT_CRIT_THR');
      if (vFull !== null && vEmpty !== null) {
        const lowCell = low === null ? null : px4CellVoltageAtThreshold(vEmpty, vFull, low);
        const critCell = crit === null ? null : px4CellVoltageAtThreshold(vEmpty, vFull, crit);
        if (lowCell !== null) cfg.low_cell = lowCell;
        if (critCell !== null) cfg.crit_cell = critCell;
      }

      // PX4 ships BAT1_CAPACITY as -1 when the user has not set it.
      const px4Cap = num('BAT1_CAPACITY');
      if (px4Cap && px4Cap > 0) cfg.capacity = Math.round(px4Cap);
      return cfg;
    }

    const vmax = num('MOT_BAT_VOLT_MAX');
    const cells = vmax && vmax > 0 ? Math.round(vmax / 4.2) : 0;
    if (cells > 0) {
      cfg.cells = cells;
      const low = num('BATT_LOW_VOLT');
      const crt = num('BATT_CRT_VOLT');
      if (low && low > 0) cfg.low_cell = Number((low / cells).toFixed(2));
      if (crt && crt > 0) cfg.crit_cell = Number((crt / cells).toFixed(2));
    }
    const cap = num('BATT_CAPACITY');
    if (cap && cap > 0) cfg.capacity = Math.round(cap);
    return cfg;
  }

  async function writeHudCfgFile(
    win: BrowserWindow,
    volumePath: string,
    cfg: Record<string, string | number>,
  ): Promise<{ ok: boolean; cfg?: Record<string, string | number>; error?: string }> {
    const lines = [`# generated by ArduDeck ${new Date().toISOString()}`];
    for (const [k, v] of Object.entries(cfg)) {
      if (v !== '' && v !== null && v !== undefined) lines.push(`${k}=${v}`);
    }
    try {
      await writeFile(join(volumePath, 'WIDGETS', 'ardudeck', 'hud.cfg'), lines.join('\n') + '\n', 'utf8');
      sendLog(win, 'info', `ArduDeck HUD config written (${Object.keys(cfg).length} values)`);
      return { ok: true, cfg };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendLog(win, 'warn', 'Could not write HUD config', message);
      return { ok: false, error: message };
    }
  }

  async function generateHudConfig(
    win: BrowserWindow,
    volumePath: string,
  ): Promise<{ ok: boolean; cfg?: Record<string, string | number>; error?: string }> {
    return writeHudCfgFile(win, volumePath, computeHudConfig());
  }

  ipcMain.handle(IPC_CHANNELS.EDGETX_HUD_CONFIG_SUGGEST, async (): Promise<{ connected: boolean; cfg: Record<string, string | number> }> => {
    return { connected: connectionState.isConnected, cfg: computeHudConfig() };
  });

  ipcMain.handle(IPC_CHANNELS.EDGETX_HUD_CONFIG_WRITE, async (
    _,
    volumePath: string,
    cfg: Record<string, string | number>,
  ) => {
    if (!mainWindow) return { ok: false, error: 'no window' };
    return writeHudCfgFile(mainWindow, volumePath, cfg);
  });

  ipcMain.handle(IPC_CHANNELS.EDGETX_HUD_CONFIG_GET, async (_, volumePath: string): Promise<Record<string, string> | null> => {
    try {
      const raw = await readFile(join(volumePath, 'WIDGETS', 'ardudeck', 'hud.cfg'), 'utf8');
      const cfg: Record<string, string> = {};
      for (const line of raw.split('\n')) {
        const m = line.match(/^(\w+)=(.+)$/);
        if (m) cfg[m[1]!] = m[2]!.trim();
      }
      return cfg;
    } catch {
      return null;
    }
  });

  // Voice announcer phrases: same 16kHz wav set the EdgeTX widget ships,
  // served from the bundled resources so the renderer never touches disk.
  ipcMain.handle(IPC_CHANNELS.VOICE_GET_WAV, async (_, name: string): Promise<Uint8Array | null> => {
    if (!/^[a-z0-9_]+$/.test(name)) return null;
    try {
      return await readFile(join(
        app.getAppPath(), 'resources', 'edgetx', 'ardudeck-hud',
        'SD', 'WIDGETS', 'ardudeck', 'snd', `${name}.wav`,
      ));
    } catch {
      return null;
    }
  });

  ipcMain.handle(IPC_CHANNELS.EDGETX_HUD_CONFIG_REGEN, async (_, volumePath: string) => {
    if (!mainWindow) return { ok: false, error: 'no window' };
    if (!connectionState.isConnected) {
      return { ok: false, error: 'Connect the vehicle first - config values come from its parameters' };
    }
    return generateHudConfig(mainWindow, volumePath);
  });

  ipcMain.handle(IPC_CHANNELS.EDGETX_HUD_MAPS_WRITE, async (
    _,
    volumePath: string,
    maps: Array<{ name: string; base64: string; lat: number; lon: number; mpp: number; w: number; h: number }>,
    mission?: Array<{ seq: number; lat: number; lon: number }>,
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      const card = await probeEdgeTxVolume(volumePath);
      if (!card) return { ok: false, error: 'SD card is no longer mounted' };
      const mapsDir = join(volumePath, 'WIDGETS', 'ardudeck', 'maps');
      const { mkdir } = await import('node:fs/promises');
      await mkdir(mapsDir, { recursive: true });
      if (maps.length > 0) {
        const lines = [`# generated by ArduDeck ${new Date().toISOString()}`];
        for (let i = 0; i < maps.length; i++) {
          const m = maps[i]!;
          const file = `${m.name}.png`;
          await writeFile(join(mapsDir, file), Buffer.from(m.base64, 'base64'));
          lines.push(`map${i + 1}=${m.lat.toFixed(6)},${m.lon.toFixed(6)},${m.mpp.toFixed(3)},${m.w},${m.h},${file}`);
        }
        await writeFile(join(mapsDir, 'maps.cfg'), lines.join('\n') + '\n', 'utf8');
        sendLog(mainWindow, 'info', `Field maps written (${maps.length} zoom levels)`);
      }
      if (mission) {
        // mission overlay for the map tile; written on every apply so the
        // route on the radio tracks the planner
        const wpLines = mission.map((wp, i) => `wp${i + 1}=${wp.seq},${wp.lat.toFixed(6)},${wp.lon.toFixed(6)}`);
        await writeFile(join(mapsDir, 'mission.cfg'), wpLines.join('\n') + '\n', 'utf8');
        sendLog(mainWindow, 'info', `Mission overlay written (${mission.length} waypoints)`);
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.EDGETX_EJECT, async (_, volumePath: string): Promise<{ ok: boolean; error?: string }> => {
    // Only eject volumes we identified as EdgeTX cards - never arbitrary paths.
    const card = await probeEdgeTxVolume(volumePath);
    if (!card) return { ok: false, error: 'Not a mounted EdgeTX SD card' };
    const execFile = promisify(execFileCb);
    try {
      if (process.platform === 'darwin') {
        await execFile('diskutil', ['eject', volumePath]);
      } else if (process.platform === 'win32') {
        const letter = volumePath.slice(0, 2); // "E:"
        await execFile('powershell', ['-NoProfile', '-Command',
          `(New-Object -comObject Shell.Application).Namespace(17).ParseName('${letter}').InvokeVerb('Eject')`]);
      } else {
        await execFile('umount', [volumePath]);
      }
      sendLog(mainWindow, 'info', `Ejected ${volumePath}`);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.EDGETX_SCAN, async (): Promise<EdgeTxScanResult> => {
    const cards = await scanForEdgeTxCards();
    const installed: EdgeTxScanResult['installed'] = {};
    for (const card of cards) {
      installed[card.volumePath] = (await readEdgeTxManifest(card.volumePath)).packages;
    }
    return { cards, catalog: edgeTxCatalogInfo(), installed };
  });

  ipcMain.handle(IPC_CHANNELS.EDGETX_INSTALL, async (
    _,
    volumePath: string,
    packageId: string,
    variantId: string,
  ): Promise<{ success: boolean; record?: InstalledPackageRecord; error?: string }> => {
    const pkg = getEdgeTxPackage(packageId);
    if (!pkg) return { success: false, error: `Unknown package: ${packageId}` };
    const card = await probeEdgeTxVolume(volumePath);
    if (!card) return { success: false, error: 'SD card is no longer mounted or is not an EdgeTX card' };
    try {
      sendLog(mainWindow, 'info', `Installing ${pkg.name} (${variantId}) to ${card.volumeName}`);
      const record = await installEdgeTxPackage(volumePath, pkg, variantId, card.freeBytes, (p) => {
        safeSend(mainWindow, IPC_CHANNELS.EDGETX_PROGRESS, { packageId, ...p });
      });
      // ArduDeck HUD: generate widget config from the connected vehicle so the
      // radio side needs zero setup.
      if (packageId === 'ardudeck-hud') {
        await generateHudConfig(mainWindow, volumePath);
      }
      sendLog(mainWindow, 'info', `${pkg.name} ${record.version} installed (${record.files.length} files)`);
      return { success: true, record };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendLog(mainWindow, 'error', `EdgeTX package install failed`, message);
      return { success: false, error: message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.EDGETX_REMOVE, async (
    _,
    volumePath: string,
    packageId: string,
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      await removeEdgeTxPackage(volumePath, packageId);
      if (packageId === 'ardudeck-hud') {
        // hud.cfg is generated after install, so it is not in the package
        // manifest; clean it (and the now-empty dir) explicitly.
        const { rm, rmdir } = await import('node:fs/promises');
        await rm(join(volumePath, 'WIDGETS', 'ardudeck', 'hud.cfg'), { force: true });
        await rm(join(volumePath, 'WIDGETS', 'ardudeck', 'maps'), { recursive: true, force: true });
        try { await rmdir(join(volumePath, 'WIDGETS', 'ardudeck')); } catch { /* not empty; leave it */ }
      }
      sendLog(mainWindow, 'info', `EdgeTX package ${packageId} removed`);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendLog(mainWindow, 'error', `EdgeTX package removal failed`, message);
      return { success: false, error: message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.FIRMWARE_DOWNLOAD, async (
    _,
    version: FirmwareVersion
  ): Promise<{ success: boolean; filePath?: string; error?: string }> => {
    try {
      // Resolve Betaflight cloud build URLs before downloading
      if (version.downloadUrl.includes('build.betaflight.com/api/builds/')) {
        sendLog(mainWindow, 'info', `Resolving Betaflight firmware URL for ${version.boardId} @ ${version.version}...`);
        version = { ...version, downloadUrl: await resolveBetaflightDownloadUrl(version.downloadUrl) };
      }
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

      // ArduPilot boards with a serial port use the ArduPilot bootloader protocol.
      // Only boards confirmed as ArduPilot (by VID/PID or MAVLink) use this path.
      // .apj hint only applies to unidentified boards (vid-pid) — NOT MSP boards,
      // since iNav/Betaflight don't have the ArduPilot bootloader.
      const isApjFile = firmwarePath.toLowerCase().endsWith('.apj');
      const isArduPilotBoard = board.flasher === 'ardupilot' || board.detectionMethod === 'mavlink';
      const apjOnUnidentifiedBoard = isApjFile && board.detectionMethod !== 'msp';
      const useArduPilotFlasher = board.port && (isArduPilotBoard || apjOnUnidentifiedBoard);

      sendLog(mainWindow, 'info', `Routing decision: isApj=${isApjFile}, isArduPilotBoard=${isArduPilotBoard}, apjOnUnidentified=${apjOnUnidentifiedBoard}, useArduPilot=${!!useArduPilotFlasher}, hasPort=${!!board.port}`);

      if (useArduPilotFlasher) {
        sendLog(mainWindow, 'info', `Using ArduPilot bootloader flasher (${isApjFile ? '.apj file' : 'board type'})...`);
        result = await flashWithArduPilotBootloader(firmwarePath, board, mainWindow, firmwareAbortController, options);
      } else {
        // For non-ArduPilot boards, use VID-based routing
        // CP2102/FTDI (10c4, 0403, 1a86) = Serial bootloader, STM32 native (0483) = DFU
        const hasSerialPort = board.port && (board.detectionMethod === 'msp' || board.detectionMethod === 'bootloader');

        if (hasSerialPort) {
          const vid = board.usbVid;
          const isNativeUsb = vid === 0x0483; // STM32 native USB
          const isUsbSerial = vid === 0x10c4 || vid === 0x0403 || vid === 0x1a86; // CP2102, FTDI, CH340

          if (isNativeUsb && board.detectionMethod === 'msp') {
            // MSP board with native USB: CLI 'dfu' reboots into DFU mode (USB DFU device).
            // The board re-enumerates as VID 0x0483/PID 0xDF11 — no serial port.
            sendLog(mainWindow, 'info', 'MSP board with native USB - using DFU via CLI reboot...');
            result = await flashWithDfu(firmwarePath, board, mainWindow, firmwareAbortController);
          } else if (isNativeUsb) {
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
        } else if (board.flasher === 'dfu' || board.flasher === 'ardupilot') {
          // ArduPilot boards without a port (e.g. in DFU mode) fall through to DFU
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

      const filePath = result.filePaths[0]!;
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

      const packet = await sendMavlinkPacket(COMMAND_LONG_ID, payload, COMMAND_LONG_CRC_EXTRA);

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
    ports?: Array<{ path: string; manufacturer?: string; vendorId?: string; productId?: string; friendlyName?: string }>;
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
          friendlyName: p.friendlyName,
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parser: any = new MAVLinkParser();
      parser.registerMessages(getAllMessageInfos());
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
          let packet: any;
          while ((packet = parser.parseNext()) !== null) {
            if (packet.msgid === 0) { // HEARTBEAT
              const payload = packet.payload;
              const vehicleType = payload.length > 4 ? payload[4] : 0;
              const vTypeName = VEHICLE_NAMES[vehicleType] || `Type ${vehicleType}`;

              const autopilotType = payload.length > 5 ? payload[5]! : 0;

              // Skip non-vehicle heartbeats (companion computers, cameras, radios, etc.)
              if (!isVehicleHeartbeat(vehicleType ?? 0, autopilotType, packet.compid)) {
                sendLog(mainWindow, 'debug', `Skipping non-vehicle heartbeat: ${vTypeName}`);
                return;
              }
              const autopilotName = AUTOPILOT_NAMES[autopilotType] || `Autopilot ${autopilotType}`;

              sendLog(mainWindow, 'info', `Heartbeat received: ${autopilotName}, ${vTypeName}`);
              sendLog(mainWindow, 'debug', `  system: ${packet.sysid}, component: ${packet.compid}, MAVLink v${packet.header === 0xFD ? 2 : 1}`);

              if (timeoutId) clearTimeout(timeoutId);
              resolve({
                targetSystem: packet.sysid,
                targetComponent: packet.compid,
                mavlinkVersion: packet.header === 0xFD ? 2 : 1,
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
        ? serializeV2(COMMAND_LONG_ID, cmdPayload, COMMAND_LONG_CRC_EXTRA, { sysid: gcsSysid, compid: 190, sequence: 0 })
        : serializeV1(COMMAND_LONG_ID, cmdPayload, COMMAND_LONG_CRC_EXTRA, { sysid: gcsSysid, compid: 190, sequence: 0 });

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
            if (pkt.msgid === AUTOPILOT_VERSION_ID) {
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
    protocol?: 'mavlink' | 'msp' | 'dfu' | 'usb' | 'bootloader';
    boardName?: string;
    boardId?: string;
    targetName?: string;
    fcVariant?: string;
    firmware?: string;
    firmwareVersion?: string;
    mcuType?: string;
    inBootloader?: boolean;
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parser: any = new MAVLinkParser();
      parser.registerMessages(getAllMessageInfos());
      let gotHeartbeat = false;

      // Quick heartbeat check (1.5s timeout)
      const heartbeatResult = await Promise.race([
        new Promise<{ systemId: number; componentId: number; mavVersion: 1 | 2; vehicleType: number } | null>((resolve) => {
          const handler = (data: Uint8Array) => {
            parser.feed(data);
            let pkt;
            while ((pkt = parser.parseNext()) !== null) {
              if (pkt.msgid === 0) { // HEARTBEAT
                const vType = pkt.payload.length > 4 ? pkt.payload[4]! : 0;
                const vAutopilot = pkt.payload.length > 5 ? pkt.payload[5]! : 0;
                // Skip non-vehicle heartbeats (companion computers, cameras, radios, etc.)
                if (!isVehicleHeartbeat(vType, vAutopilot, pkt.compid)) continue;
                gotHeartbeat = true;
                transport.off('data', handler);
                resolve({
                  systemId: pkt.sysid,
                  componentId: pkt.compid,
                  mavVersion: pkt.header === 0xFD ? 2 : 1,
                  vehicleType: vType,
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
          ? serializeV2(COMMAND_LONG_ID, cmdPayload, COMMAND_LONG_CRC_EXTRA, { sysid: gcsSysid, compid: 190, sequence: 0 })
          : serializeV1(COMMAND_LONG_ID, cmdPayload, COMMAND_LONG_CRC_EXTRA, { sysid: gcsSysid, compid: 190, sequence: 0 });

        await transport.write(packet);

        // Wait for AUTOPILOT_VERSION (2.5s timeout — H7 boards can be slow to respond)
        const versionResult = await Promise.race([
          new Promise<{ boardName?: string; firmwareVersion?: string } | null>((resolve) => {
            const handler = (data: Uint8Array) => {
              parser.feed(data);
              let pkt;
              while ((pkt = parser.parseNext()) !== null) {
                if (pkt.msgid === AUTOPILOT_VERSION_ID) {
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
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
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
        // Use targetName (full build target like "JHEF405PRO") when available
        const target = mspResult.targetName || mspResult.boardId;

        sendLog(mainWindow, 'info', `Detected: ${firmwareName} v${mspResult.fcVersion} on ${target} (short: ${mspResult.boardId})`);

        return {
          success: true,
          protocol: 'msp',
          boardName: target,
          boardId: target,
          targetName: mspResult.targetName,
          fcVariant: mspResult.fcVariant,
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

  // ESP32 flashing via esptool
  ipcMain.handle(IPC_CHANNELS.ESP32_CHECK_ESPTOOL, async () => {
    const { isEsptoolAvailable } = await import('./firmware/esp32-flasher.js');
    return isEsptoolAvailable();
  });

  ipcMain.handle(IPC_CHANNELS.ESP32_DOWNLOAD_ESPTOOL, async () => {
    const { downloadEsptool } = await import('./firmware/esp32-flasher.js');
    await downloadEsptool();
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.ESP32_DETECT, async (_event, port: string) => {
    const { detectEsp32Chip } = await import('./firmware/esp32-flasher.js');
    return detectEsp32Chip(port);
  });

  ipcMain.handle(IPC_CHANNELS.ESP32_FLASH, async (
    _event,
    options: { port: string; chip: string; firmwarePath: string; flashOffset?: string; baudRate?: number; eraseAll?: boolean },
  ) => {
    const { flashEsp32 } = await import('./firmware/esp32-flasher.js');
    firmwareAbortController = new AbortController();
    return flashEsp32(options, mainWindow, firmwareAbortController);
  });

  ipcMain.handle(IPC_CHANNELS.ESP32_FLASH_TEMPLATE, async (
    _event,
    options: { templateId: string; port: string; detectedChip?: string; eraseAll?: boolean },
  ) => {
    const { flashTemplate } = await import('./firmware/esp32-flasher.js');
    firmwareAbortController = new AbortController();
    return flashTemplate(options, mainWindow, firmwareAbortController);
  });

  // Register MSP handlers for Betaflight/iNav/Cleanflight support
  registerMspHandlers(mainWindow);

  // Register Calibration handlers with MAVLink deps for ArduPilot calibration support
  const mavlinkCalibrationDeps: MavlinkCalibrationDeps = {
    sendCommandLong: async (command, params) => {
      if (!currentTransport?.isOpen || !connectionState.isConnected) return false;
      try {
        const payload = serializeCommandLong({
          targetSystem: connectionState.systemId ?? 1,
          targetComponent: 1,
          command,
          confirmation: 0,
          ...params,
        });
        const packet = await sendMavlinkPacket(COMMAND_LONG_ID, payload, COMMAND_LONG_CRC_EXTRA);
        await currentTransport.write(packet);
        connectionState.packetsSent++;
        return true;
      } catch {
        return false;
      }
    },
    sendCommandAck: async (command, result) => {
      if (!currentTransport?.isOpen || !connectionState.isConnected) return false;
      try {
        const payload = serializeCommandAck({
          command,
          result,
          progress: 0,
          resultParam2: 0,
          targetSystem: connectionState.systemId ?? 1,
          targetComponent: 1,
        });
        const packet = await sendMavlinkPacket(COMMAND_ACK_ID, payload, COMMAND_ACK_CRC_EXTRA);
        await currentTransport.write(packet);
        connectionState.packetsSent++;
        return true;
      } catch {
        return false;
      }
    },
    sendLog: (level, message, details) => sendLog(mainWindow, level, `[Calibration] ${message}`, details),
    sendProgress: (event) => safeSend(mainWindow, IPC_CHANNELS.CALIBRATION_PROGRESS, event),
    sendComplete: (event) => safeSend(mainWindow, IPC_CHANNELS.CALIBRATION_COMPLETE, event),
  };
  initCalibrationHandlers(mainWindow, mavlinkCalibrationDeps);

  // Register Mission Library handlers
  initMissionLibraryHandlers();

  // ============================================================================
  // Driver utilities
  // ============================================================================

  ipcMain.handle(IPC_CHANNELS.DRIVER_OPEN_BUNDLED, async (_event, driverName: string): Promise<{ success: boolean; error?: string }> => {
    try {
      // Get the resources path (works in both dev and production)
      const resourcesPath = app.isPackaged
        ? join(app.getAppPath() + '.unpacked', 'resources', 'drivers')
        : join(app.getAppPath(), 'resources', 'drivers');

      const driverPath = join(resourcesPath, driverName);

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

  // ============================================================================
  // SITL (Software-In-The-Loop Simulation)
  // ============================================================================

  // Set main window for SITL process to forward output
  sitlProcess.setMainWindow(mainWindow);

  // Start SITL process
  ipcMain.handle(IPC_CHANNELS.SITL_START, async (_event, config: SitlConfig): Promise<{ success: boolean; command?: string; error?: string }> => {
    try {
      // Reset auto-config flag for new SITL session
      resetSitlAutoConfig();
      const command = await sitlProcess.start(config);
      return { success: true, command };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[SITL] Failed to start:', message);
      return { success: false, error: message };
    }
  });

  // Stop SITL process
  ipcMain.handle(IPC_CHANNELS.SITL_STOP, async (): Promise<{ success: boolean }> => {
    try {
      sitlProcess.stop();
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[SITL] Failed to stop:', message);
      return { success: false };
    }
  });

  // Get SITL status
  ipcMain.handle(IPC_CHANNELS.SITL_STATUS, async (): Promise<SitlStatus> => {
    return {
      isRunning: sitlProcess.isRunning,
    };
  });

  // Delete SITL EEPROM file
  ipcMain.handle(IPC_CHANNELS.SITL_DELETE_EEPROM, async (_event, filename: string): Promise<{ success: boolean; error?: string }> => {
    try {
      await sitlProcess.deleteEeprom(filename);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  });

  // =============================================================================
  // ArduPilot SITL Handlers
  // =============================================================================

  // Set main window for ArduPilot SITL process
  ardupilotSitlProcess.setMainWindow(mainWindow);
  swarmSitlProcess.setMainWindow(mainWindow);
  orchestratorProcess.setMainWindow(mainWindow);
  ardupilotSitlDownloader.setMainWindow(mainWindow);
  px4SitlProcess.setMainWindow(mainWindow);
  px4SitlDownloader.setMainWindow(mainWindow);

  // Sweep stale macOS SITL caches: legacy per-track layout (pre tag-keyed
  // paths) + old tag-keyed dirs that aren't the current SITL_RELEASE_TAG.
  // Best-effort; doesn't block IPC handler registration.
  void ardupilotSitlDownloader.cleanupLegacyMacBinaries().catch(err => {
    console.warn('[SITL] legacy mac cache cleanup failed:', err);
  });

  // Start ArduPilot SITL process
  ipcMain.handle(IPC_CHANNELS.ARDUPILOT_SITL_START, async (_event, config: ArduPilotSitlConfig): Promise<{ success: boolean; command?: string; error?: string }> => {
    const result = await ardupilotSitlProcess.start(config);
    // Do NOT auto-start the RC sender here.
    //
    // It streams roll/pitch/yaw = 1500 and throttle = 1000 at 50 Hz to 127.0.0.1:5501, which is
    // the SAME port a real RC source uses. Starting SITL therefore silently HIJACKED any external
    // transmitter: measured in a dataflash log, roll/pitch/yaw sat at exactly 1500 for ~93% of a
    // flight and throttle snapped by >300 PWM between consecutive samples 46% of the time, because
    // two senders were alternating. Rudder arming became impossible (yaw never held full deflection
    // long enough) and the aircraft was barely controllable.
    //
    // Arming without a transmitter still works: the arm handler starts the sender on demand, and
    // the Start RC button starts it explicitly.
    return result;
  });

  // Stop ArduPilot SITL process
  ipcMain.handle(IPC_CHANNELS.ARDUPILOT_SITL_STOP, async (): Promise<{ success: boolean }> => {
    try {
      ardupilotSitlProcess.stop();
      ardupilotRcSender.stop();
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ArduPilot SITL] Failed to stop:', message);
      return { success: false };
    }
  });

  // Get ArduPilot SITL status
  ipcMain.handle(IPC_CHANNELS.ARDUPILOT_SITL_STATUS, async (): Promise<ArduPilotSitlStatus> => {
    return ardupilotSitlProcess.getStatus();
  });

  // ---- Swarm SITL (multiple instances → fleet) ----------------------------
  // A swarm and the single SITL both want base port 5760, so they are mutually
  // exclusive: starting a swarm tears down any single instance + its RC sender.
  ipcMain.handle(IPC_CHANNELS.SWARM_SITL_START, async (_event, config: SwarmSitlConfig): Promise<{ success: boolean; error?: string; instances?: SwarmSitlStatus['instances'] }> => {
    if (ardupilotSitlProcess.isRunning) {
      ardupilotRcSender.stop();
      await ardupilotSitlProcess.stopAndWait(5000);
      // Let the OS fully release port 5760 before the swarm rebinds it.
      await new Promise<void>((r) => setTimeout(r, 1000));
    }
    return swarmSitlProcess.start(config);
  });

  ipcMain.handle(IPC_CHANNELS.SWARM_SITL_STOP, async (): Promise<{ success: boolean }> => {
    try {
      swarmSitlProcess.stop();
      return { success: true };
    } catch (error) {
      console.error('[Swarm SITL] Failed to stop:', error instanceof Error ? error.message : error);
      return { success: false };
    }
  });

  ipcMain.handle(IPC_CHANNELS.SWARM_SITL_STATUS, async (): Promise<SwarmSitlStatus> => {
    return swarmSitlProcess.getStatus();
  });

  // Download ArduPilot SITL binary
  ipcMain.handle(IPC_CHANNELS.ARDUPILOT_SITL_DOWNLOAD, async (
    _event,
    vehicleType: ArduPilotVehicleType,
    releaseTrack: ArduPilotReleaseTrack
  ): Promise<{ success: boolean; path?: string; error?: string }> => {
    // Download Cygwin DLLs first on Windows
    if (process.platform === 'win32') {
      const cygwinResult = await ardupilotSitlDownloader.downloadCygwin();
      if (!cygwinResult.success) {
        return { success: false, error: `Failed to download Cygwin DLLs: ${cygwinResult.error}` };
      }
    }

    return ardupilotSitlDownloader.download(vehicleType, releaseTrack);
  });

  // Check if ArduPilot SITL binary exists
  ipcMain.handle(IPC_CHANNELS.ARDUPILOT_SITL_CHECK_BINARY, async (
    _event,
    vehicleType: ArduPilotVehicleType,
    releaseTrack: ArduPilotReleaseTrack
  ): Promise<ArduPilotSitlBinaryInfo> => {
    return ardupilotSitlDownloader.checkBinary(vehicleType, releaseTrack);
  });

  // Check if platform supports ArduPilot SITL
  ipcMain.handle(IPC_CHANNELS.ARDUPILOT_SITL_CHECK_PLATFORM, async (): Promise<{ supported: boolean; useDocker: boolean; error?: string }> => {
    return ardupilotSitlProcess.isPlatformSupported();
  });

  // ---- PX4 SITL (mirror of ArduPilot SITL: download a bundle, spawn, connect UDP 14550) ----
  ipcMain.handle(IPC_CHANNELS.PX4_SITL_START, async (_event, config: Px4SitlConfig): Promise<{ success: boolean; command?: string; error?: string }> => {
    return px4SitlProcess.start(config);
  });

  ipcMain.handle(IPC_CHANNELS.PX4_SITL_STOP, async (): Promise<{ success: boolean }> => {
    try {
      px4SitlProcess.stop();
      return { success: true };
    } catch (error) {
      console.error('[PX4 SITL] Failed to stop:', error instanceof Error ? error.message : error);
      return { success: false };
    }
  });

  ipcMain.handle(IPC_CHANNELS.PX4_SITL_STATUS, async (): Promise<Px4SitlStatus> => {
    return px4SitlProcess.getStatus();
  });

  ipcMain.handle(IPC_CHANNELS.PX4_SITL_DOWNLOAD, async (
    _event,
    releaseTrack: Px4ReleaseTrack
  ): Promise<{ success: boolean; path?: string; error?: string }> => {
    return px4SitlDownloader.download(releaseTrack);
  });

  ipcMain.handle(IPC_CHANNELS.PX4_SITL_CHECK_BINARY, async (
    _event,
    releaseTrack: Px4ReleaseTrack
  ): Promise<Px4SitlBinaryInfo> => {
    return px4SitlDownloader.checkBinary(releaseTrack);
  });

  ipcMain.handle(IPC_CHANNELS.PX4_SITL_CHECK_PLATFORM, async (): Promise<{ supported: boolean; needsJava: boolean; error?: string }> => {
    return px4SitlDownloader.checkPlatform();
  });

  // ArduPilot SITL RC control - send RC values
  ipcMain.handle(IPC_CHANNELS.ARDUPILOT_SITL_RC_SEND, async (_event, state: Partial<VirtualRCState>): Promise<void> => {
    ardupilotRcSender.setState(state);
    // Flag a live external source so arming does not clobber it with an override.
    ardupilotRcSender.noteExternalSource();
    ardupilotRcSender.sendOnce();
  });

  // Start ArduPilot RC sender (continuous 50Hz)
  ipcMain.handle(IPC_CHANNELS.ARDUPILOT_SITL_RC_START, async (): Promise<{ success: boolean }> => {
    ardupilotRcSender.start();
    return { success: true };
  });

  // Stop ArduPilot RC sender
  ipcMain.handle(IPC_CHANNELS.ARDUPILOT_SITL_RC_STOP, async (): Promise<{ success: boolean }> => {
    ardupilotRcSender.stop();
    return { success: true };
  });

  // List frame catalog (cached upstream vehicleinfo.py)
  ipcMain.handle(IPC_CHANNELS.ARDUPILOT_SITL_LIST_FRAMES, async () => {
    const { listFrames } = await import('./sitl/frame-config.js');
    return listFrames();
  });

  // Force-refresh the frame catalog from upstream
  ipcMain.handle(IPC_CHANNELS.ARDUPILOT_SITL_REFRESH_FRAMES, async () => {
    const { listFrames } = await import('./sitl/frame-config.js');
    return listFrames({ force: true });
  });

  // SITL custom frames (user-authored JSON physics models) ----------------
  ipcMain.handle(IPC_CHANNELS.ARDUPILOT_SITL_CUSTOM_FRAME_LIST, async () => {
    const { listCustomFrames } = await import('./sitl/custom-frame-storage.js');
    return listCustomFrames();
  });

  ipcMain.handle(IPC_CHANNELS.ARDUPILOT_SITL_CUSTOM_FRAME_LOAD, async (_e, id: string) => {
    const { loadCustomFrame } = await import('./sitl/custom-frame-storage.js');
    return loadCustomFrame(id);
  });

  ipcMain.handle(IPC_CHANNELS.ARDUPILOT_SITL_CUSTOM_FRAME_SAVE, async (_e, payload: { name: string; frame: import('../shared/sitl-custom-frame.js').SitlCustomFrame; existingId?: string }) => {
    const { saveCustomFrame } = await import('./sitl/custom-frame-storage.js');
    return saveCustomFrame(payload.name, payload.frame, payload.existingId);
  });

  ipcMain.handle(IPC_CHANNELS.ARDUPILOT_SITL_CUSTOM_FRAME_DELETE, async (_e, id: string) => {
    const { deleteCustomFrame } = await import('./sitl/custom-frame-storage.js');
    return deleteCustomFrame(id);
  });

  ipcMain.handle(IPC_CHANNELS.ARDUPILOT_SITL_CUSTOM_FRAME_IMPORT, async () => {
    const { importCustomFrame } = await import('./sitl/custom-frame-storage.js');
    return importCustomFrame();
  });

  ipcMain.handle(IPC_CHANNELS.ARDUPILOT_SITL_CUSTOM_FRAME_EXPORT, async (_e, id: string) => {
    const { exportCustomFrame } = await import('./sitl/custom-frame-storage.js');
    return exportCustomFrame(id);
  });

  // =============================================================================
  // Simulator Handlers (FlightGear, X-Plane integration)
  // =============================================================================

  // Detect installed simulators
  ipcMain.handle(IPC_CHANNELS.SIMULATOR_DETECT, async (_event, customFlightGearPath?: string, customXPlanePath?: string): Promise<SimulatorInfo[]> => {
    return detectSimulators(customFlightGearPath, customXPlanePath);
  });

  // Browse for FlightGear executable
  ipcMain.handle(IPC_CHANNELS.SIMULATOR_BROWSE_FG, async (): Promise<{ success: boolean; path?: string; error?: string }> => {
    try {
      const platform = process.platform;
      let filters: { name: string; extensions: string[] }[];
      let title: string;

      if (platform === 'win32') {
        filters = [
          { name: 'FlightGear Executable', extensions: ['exe'] },
          { name: 'All Files', extensions: ['*'] },
        ];
        title = 'Select FlightGear Executable (fgfs.exe)';
      } else if (platform === 'darwin') {
        filters = [
          { name: 'Applications', extensions: ['app'] },
          { name: 'All Files', extensions: ['*'] },
        ];
        title = 'Select FlightGear Application';
      } else {
        filters = [
          { name: 'All Files', extensions: ['*'] },
        ];
        title = 'Select FlightGear Executable (fgfs)';
      }

      const result = await dialog.showOpenDialog(mainWindow, {
        title,
        filters,
        properties: platform === 'darwin' ? ['openFile', 'treatPackageAsDirectory'] : ['openFile'],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false };
      }

      const selectedPath = result.filePaths[0];
      return { success: true, path: selectedPath };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Simulator] Browse for FlightGear failed:', message);
      return { success: false, error: message };
    }
  });

  // Launch FlightGear
  ipcMain.handle(IPC_CHANNELS.SIMULATOR_LAUNCH_FG, async (_event, config: FlightGearConfig, customPath?: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = await flightGearLauncher.launch(config, customPath);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Simulator] Failed to launch FlightGear:', message);
      return { success: false, error: message };
    }
  });

  // Stop FlightGear
  ipcMain.handle(IPC_CHANNELS.SIMULATOR_STOP_FG, async (): Promise<{ success: boolean }> => {
    try {
      await flightGearLauncher.stop();
      return { success: true };
    } catch (error) {
      console.error('[Simulator] Failed to stop FlightGear:', error);
      return { success: false };
    }
  });

  // Get FlightGear status
  ipcMain.handle(IPC_CHANNELS.SIMULATOR_FG_STATUS, async (): Promise<{ running: boolean; pid?: number }> => {
    const status = flightGearLauncher.getStatus();
    return { running: status.running, pid: status.pid ?? undefined };
  });

  // -------------------------------------------------------------------------
  // ArduPilot SITL -> FlightGear viewer (external-FDM, no bridge)
  // -------------------------------------------------------------------------

  ipcMain.handle(IPC_CHANNELS.ARDUPILOT_FG_DETECT, async (_event, customPath?: string): Promise<{ installed: boolean; path: string | null; version: string | null }> => {
    const info = await detectFlightGear(customPath);
    return { installed: info.installed, path: info.path, version: info.version };
  });

  ipcMain.handle(IPC_CHANNELS.ARDUPILOT_FG_BROWSE, async (): Promise<{ success: boolean; path?: string; error?: string }> => {
    try {
      const platform = process.platform;
      let filters: { name: string; extensions: string[] }[];
      let title: string;

      if (platform === 'win32') {
        filters = [
          { name: 'FlightGear Executable', extensions: ['exe'] },
          { name: 'All Files', extensions: ['*'] },
        ];
        title = 'Select FlightGear Executable (fgfs.exe)';
      } else if (platform === 'darwin') {
        filters = [
          { name: 'Applications', extensions: ['app'] },
          { name: 'All Files', extensions: ['*'] },
        ];
        title = 'Select FlightGear Application';
      } else {
        filters = [{ name: 'All Files', extensions: ['*'] }];
        title = 'Select FlightGear Executable (fgfs)';
      }

      const result = await dialog.showOpenDialog(mainWindow, {
        title,
        filters,
        properties: platform === 'darwin' ? ['openFile', 'treatPackageAsDirectory'] : ['openFile'],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false };
      }
      return { success: true, path: result.filePaths[0] };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ArduPilot FlightGear] Browse failed:', message);
      return { success: false, error: message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.ARDUPILOT_FG_LAUNCH, async (_event, config: ArduPilotFlightGearConfig, customPath?: string): Promise<{ success: boolean; error?: string }> => {
    try {
      return await ardupilotFlightGear.launch(config, customPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ArduPilot FlightGear] Failed to launch:', message);
      return { success: false, error: message };
    }
  });

  ipcMain.handle(IPC_CHANNELS.ARDUPILOT_FG_STOP, async (): Promise<{ success: boolean }> => {
    try {
      await ardupilotFlightGear.stop();
      return { success: true };
    } catch (error) {
      console.error('[ArduPilot FlightGear] Failed to stop:', error);
      return { success: false };
    }
  });

  ipcMain.handle(IPC_CHANNELS.ARDUPILOT_FG_STATUS, async (): Promise<{ running: boolean; pid: number | null; aircraft: string | null }> => {
    return ardupilotFlightGear.getStatus();
  });

  // Browse for X-Plane executable
  ipcMain.handle(IPC_CHANNELS.SIMULATOR_BROWSE_XP, async (): Promise<{ success: boolean; path?: string; error?: string }> => {
    try {
      const platform = process.platform;
      let filters: { name: string; extensions: string[] }[];
      let title: string;

      if (platform === 'win32') {
        filters = [
          { name: 'X-Plane Executable', extensions: ['exe'] },
          { name: 'All Files', extensions: ['*'] },
        ];
        title = 'Select X-Plane Executable (X-Plane.exe)';
      } else if (platform === 'darwin') {
        filters = [
          { name: 'Applications', extensions: ['app'] },
          { name: 'All Files', extensions: ['*'] },
        ];
        title = 'Select X-Plane Application';
      } else {
        filters = [
          { name: 'All Files', extensions: ['*'] },
        ];
        title = 'Select X-Plane Executable';
      }

      const result = await dialog.showOpenDialog(mainWindow, {
        title,
        filters,
        properties: platform === 'darwin' ? ['openFile', 'treatPackageAsDirectory'] : ['openFile'],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false };
      }

      const selectedPath = result.filePaths[0];

      return { success: true, path: selectedPath };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Simulator] Browse for X-Plane failed:', message);
      return { success: false, error: message };
    }
  });

  // Launch X-Plane
  ipcMain.handle(IPC_CHANNELS.SIMULATOR_LAUNCH_XP, async (_event, config: XPlaneConfig, customPath?: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = await xplaneLauncher.launch(config, customPath);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Simulator] Failed to launch X-Plane:', message);
      return { success: false, error: message };
    }
  });

  // Stop X-Plane
  ipcMain.handle(IPC_CHANNELS.SIMULATOR_STOP_XP, async (): Promise<{ success: boolean }> => {
    try {
      await xplaneLauncher.stop();
      return { success: true };
    } catch (error) {
      console.error('[Simulator] Failed to stop X-Plane:', error);
      return { success: false };
    }
  });

  // Get X-Plane status
  ipcMain.handle(IPC_CHANNELS.SIMULATOR_XP_STATUS, async (): Promise<{ running: boolean; pid?: number }> => {
    const status = xplaneLauncher.getStatus();
    return { running: status.running, pid: status.pid ?? undefined };
  });

  // Start protocol bridge (FlightGear <-> X-Plane format for iNav SITL)
  ipcMain.handle(IPC_CHANNELS.BRIDGE_START, async (_event, config?: BridgeConfig): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = await protocolBridge.start(config);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Simulator] Failed to start bridge:', message);
      return { success: false, error: message };
    }
  });

  // Stop protocol bridge
  ipcMain.handle(IPC_CHANNELS.BRIDGE_STOP, async (): Promise<{ success: boolean }> => {
    try {
      await protocolBridge.stop();
      return { success: true };
    } catch (error) {
      console.error('[Simulator] Failed to stop bridge:', error);
      return { success: false };
    }
  });

  // Get bridge status
  ipcMain.handle(IPC_CHANNELS.BRIDGE_STATUS, async (): Promise<{ running: boolean }> => {
    return { running: protocolBridge.isRunning() };
  });

  // =============================================================================
  // Virtual RC Control (for SITL testing)
  // =============================================================================

  // Set virtual RC values
  ipcMain.handle(IPC_CHANNELS.VIRTUAL_RC_SET, async (_, state: Partial<VirtualRCState>): Promise<void> => {
    setVirtualRC(state);
  });

  // Get virtual RC values
  ipcMain.handle(IPC_CHANNELS.VIRTUAL_RC_GET, async (): Promise<VirtualRCState> => {
    return getVirtualRC();
  });

  // Reset virtual RC to defaults
  ipcMain.handle(IPC_CHANNELS.VIRTUAL_RC_RESET, async (): Promise<void> => {
    resetVirtualRC();
  });

  // =============================================================================
  // Bug Report / Logging
  // =============================================================================

  // Initialize unified logger
  initUnifiedLogger(mainWindow);

  // Collect logs from JSONL files
  ipcMain.handle(IPC_CHANNELS.REPORT_COLLECT_LOGS, async (_event, hours = 24): Promise<FileLogEntry[]> => {
    return collectLogs(hours);
  });

  // Get system info
  ipcMain.handle(IPC_CHANNELS.REPORT_GET_SYSTEM_INFO, async (): Promise<SystemInfo> => {
    return collectSystemInfo();
  });

  // Get encryption info
  ipcMain.handle(IPC_CHANNELS.REPORT_GET_ENCRYPTION_INFO, async (): Promise<{ isPlaceholderKey: boolean; keyVersion: number; formatVersion: number }> => {
    return getEncryptionInfo();
  });

  // Collect MSP board dump (CLI commands: status, dump all, diff all)
  ipcMain.handle(IPC_CHANNELS.REPORT_COLLECT_MSP_DUMP, async (): Promise<{ success: boolean; dump?: BoardDumpMsp; error?: string }> => {
    try {
      // Get connection state
      if (!connectionState.isConnected || connectionState.protocol !== 'msp') {
        return { success: false, error: 'Not connected to MSP board' };
      }

      // Notify progress
      safeSend(mainWindow, IPC_CHANNELS.REPORT_PROGRESS, { stage: 'cli_enter', message: 'Entering CLI mode...' });

      // Enter CLI mode and collect data via the CLI dump function
      const { enterCliMode, sendCliCommand, exitCliMode, getCliDump } = await import('./cli/cli-handlers.js');

      await enterCliMode();

      // Collect status
      safeSend(mainWindow, IPC_CHANNELS.REPORT_PROGRESS, { stage: 'status', message: 'Collecting status...' });
      let statusOutput = '';
      await sendCliCommand('status');
      await new Promise(resolve => setTimeout(resolve, 500));

      // Get dump all
      safeSend(mainWindow, IPC_CHANNELS.REPORT_PROGRESS, { stage: 'dump', message: 'Collecting dump all...' });
      const dumpOutput = await getCliDump(false); // false = dump all (not diff)

      // Get diff all
      safeSend(mainWindow, IPC_CHANNELS.REPORT_PROGRESS, { stage: 'diff', message: 'Collecting diff all...' });
      const diffOutput = await getCliDump(true); // true = diff

      // Exit CLI (will reboot board)
      safeSend(mainWindow, IPC_CHANNELS.REPORT_PROGRESS, { stage: 'cli_exit', message: 'Exiting CLI mode (board will reboot)...' });
      await exitCliMode();

      const dump = createMspBoardDump(
        statusOutput,
        dumpOutput || '',
        diffOutput || '',
        connectionState.fcVariant || 'Unknown',
        connectionState.fcVersion || 'Unknown',
        connectionState.boardId || 'Unknown'
      );

      return { success: true, dump };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  });

  // Collect MAVLink board dump (from cached parameter/telemetry data)
  ipcMain.handle(IPC_CHANNELS.REPORT_COLLECT_MAVLINK_DUMP, async (): Promise<{ success: boolean; dump?: BoardDumpMavlink; error?: string }> => {
    try {
      if (!connectionState.isConnected || connectionState.protocol !== 'mavlink') {
        return { success: false, error: 'Not connected to MAVLink board' };
      }

      safeSend(mainWindow, IPC_CHANNELS.REPORT_PROGRESS, { stage: 'board_dump', message: 'Collecting MAVLink diagnostics...' });

      const defaultSysStatus: BoardDumpMavlink['sys_status'] = {
        sensors_present: 0, sensors_enabled: 0, sensors_health: 0, load: 0,
        voltage_battery: 0, current_battery: 0,
        errors_count1: 0, errors_count2: 0, errors_count3: 0, errors_count4: 0,
      };
      const defaultHeartbeat: BoardDumpMavlink['heartbeat'] = {
        autopilot: 0, type: 0, base_mode: 0, custom_mode: 0, system_status: 0,
      };

      // Decode firmware version from flight_sw_version (ArduPilot encoding: major<<24 | minor<<16 | patch<<8 | type)
      let fcVersion = 'Unknown';
      if (cachedAutopilotVersion) {
        const swVer = cachedAutopilotVersion.flight_sw_version;
        const major = (swVer >> 24) & 0xFF;
        const minor = (swVer >> 16) & 0xFF;
        const patch = (swVer >> 8) & 0xFF;
        if (major > 0 || minor > 0 || patch > 0) {
          fcVersion = `${major}.${minor}.${patch}`;
        }
      }

      return {
        success: true,
        dump: {
          type: 'mavlink',
          parameters: {}, // Will be filled by renderer from parameter store
          sys_status: cachedSysStatus ?? defaultSysStatus,
          heartbeat: cachedHeartbeat ?? defaultHeartbeat,
          autopilot_version: cachedAutopilotVersion ?? undefined,
          statustext_history: statustextHistory.map(e => ({ ...e, text: applyPrivacyFilter(e.text) })),
          board_uid: connectionState.boardUid,
          board_id: connectionState.boardId,
          fc_variant: connectionState.autopilot || 'Unknown',
          fc_version: fcVersion,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  });

  // Create and save encrypted report
  ipcMain.handle(IPC_CHANNELS.REPORT_SAVE, async (
    _event,
    userDescription: string,
    boardDump: BoardDump | null,
    logHours = 24
  ): Promise<{ success: boolean; filePath?: string; error?: string }> => {
    try {
      // Show save dialog
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Bug Report',
        defaultPath: `ardudeck-report-${Date.now()}.deckreport`,
        filters: [{ name: 'DeckReport Files', extensions: ['deckreport'] }],
      });

      if (canceled || !filePath) {
        return { success: false, error: 'Save canceled' };
      }

      // Notify progress
      safeSend(mainWindow, IPC_CHANNELS.REPORT_PROGRESS, { stage: 'collecting', message: 'Collecting logs...' });

      // Create payload
      const payload = await createReportPayload(userDescription, boardDump, logHours);

      // Notify progress
      safeSend(mainWindow, IPC_CHANNELS.REPORT_PROGRESS, { stage: 'encrypting', message: 'Encrypting report...' });

      // Encrypt and save
      saveEncryptedReport(payload, filePath);

      sendLog(mainWindow, 'info', 'Bug report saved', filePath);

      return { success: true, filePath };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      sendLog(mainWindow, 'error', 'Failed to save bug report', message);
      return { success: false, error: message };
    }
  });

  // ============================================================================
  // App Version & Updates
  // ============================================================================

  ipcMain.handle(IPC_CHANNELS.APP_GET_VERSION, (): string => {
    return app.getVersion();
  });

  ipcMain.handle(IPC_CHANNELS.APP_CHECK_UPDATE, (): void => {
    checkForUpdates();
  });

  ipcMain.handle(IPC_CHANNELS.APP_DOWNLOAD_UPDATE, (): void => {
    downloadUpdate();
  });

  ipcMain.handle(IPC_CHANNELS.APP_INSTALL_UPDATE, (): void => {
    installUpdate();
  });

  ipcMain.handle(IPC_CHANNELS.APP_RELAUNCH, (): void => {
    app.relaunch();
    app.exit(0);
  });

  ipcMain.handle(IPC_CHANNELS.APP_OPEN_EXTERNAL, (_event, url: string): void => {
    if (typeof url === 'string' && (url.startsWith('https://') || url.startsWith('http://'))) {
      shell.openExternal(url);
    }
  });

  // ==================== LUA GRAPH EDITOR ====================

  ipcMain.handle(IPC_CHANNELS.LUA_GRAPH_SAVE, async (_event, graph: unknown): Promise<{ success: boolean; filePath?: string; error?: string }> => {
    try {
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Lua Graph',
        defaultPath: `${(graph as any)?.name || 'untitled'}.adgraph`,
        filters: [
          { name: 'ArduDeck Graph', extensions: ['adgraph'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      if (result.canceled || !result.filePath) return { success: false };
      const fs = await import('fs/promises');
      await fs.writeFile(result.filePath, JSON.stringify(graph, null, 2), 'utf-8');
      return { success: true, filePath: result.filePath };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Save failed' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.LUA_GRAPH_OPEN, async (): Promise<{ success: boolean; data?: unknown; filePath?: string; error?: string }> => {
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Open Lua Graph',
        filters: [
          { name: 'ArduDeck Graph', extensions: ['adgraph'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile'],
      });
      if (result.canceled || result.filePaths.length === 0) return { success: false };
      const filePath = result.filePaths[0]!;
      const fs = await import('fs/promises');
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);
      return { success: true, data, filePath };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Open failed' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.LUA_GRAPH_EXPORT_LUA, async (_event, code: string, name: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const safeName = (name || 'script').replace(/[^a-zA-Z0-9_-]/g, '_');
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Export Lua Script',
        defaultPath: `${safeName}.lua`,
        filters: [
          { name: 'Lua Script', extensions: ['lua'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      if (result.canceled || !result.filePath) return { success: false };
      const fs = await import('fs/promises');
      await fs.writeFile(result.filePath, code, 'utf-8');
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Export failed' };
    }
  });

  // Initialize auto-updater (handles auto-check on its own schedule)
  initAutoUpdater(mainWindow);

  // Companion computer (agent WebSocket)
  registerCompanionIpcHandlers(mainWindow);

  // DroneBridge ESP32 (REST API)
  registerDroneBridgeIpcHandlers(mainWindow);

  // MAVLink forwarding tee (mobile second-screen / secondary GCS). The
  // injector reads currentTransport at call time so it survives reconnects.
  mavlinkTee.setInjector((bytes) => {
    currentTransport?.write(bytes).catch(() => {
      // Link down mid-forward; the phone will retry with its own heartbeat.
    });
  });
  ipcMain.handle(IPC_CHANNELS.MAVLINK_FORWARD_START, async (_e, opts: { listenPort?: number; endpoints?: { host: string; port: number }[] }) => {
    const status = await mavlinkTee.start(opts ?? {});
    sendLog(mainWindow, 'info', 'MAVLink forward started', `listen :${status.listenPort}, ${status.endpoints.length} endpoint(s)`);
    return status;
  });
  ipcMain.handle(IPC_CHANNELS.MAVLINK_FORWARD_STOP, async () => {
    await mavlinkTee.stop();
    sendLog(mainWindow, 'info', 'MAVLink forward stopped');
  });
  ipcMain.handle(IPC_CHANNELS.MAVLINK_FORWARD_STATUS, () => mavlinkTee.status());

  // Map overlays (RainViewer radar, OpenAIP airspace/airports)
  setupOverlayHandlers();

  // Traffic overlays (ADS-B + glider/OGN)
  setupTrafficHandlers(mainWindow);

  // Loopback control endpoint that lets the ArduDeck Trainer game borrow this
  // app's flight controller and physics engine. See sim-handover-server.ts.
  void startSimHandoverServer({
    userDataPath: app.getPath('userData'),
    isVehicleArmed: () => lastReportedArmed === true,
    setParam: (paramId, value) => buildFcAdapter().setParam(paramId, value),
    setRcExternallyOwned: (owned) => ardupilotRcSender.setExternalOwner(owned),
    reconnectVehicle: async (reason, timeoutSec) => {
      scheduleReconnect({
        reason,
        delayMs: 4000,
        timeoutMs: timeoutSec * 1000,
        maxAttempts: 20,
      });
      const deadline = Date.now() + timeoutSec * 1000;
      while (Date.now() < deadline) {
        if (connectionState.isConnected && !connectionState.isReconnecting) {
          // Let the first heartbeat land so subsequent reads have a systemId.
          await new Promise((r) => setTimeout(r, 500));
          return true;
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      return false;
    },
    log: (level, message) => sendLog(mainWindow, level, message),
  }).catch((err) => {
    console.warn('[sim-handover] endpoint failed to start:', err);
  });

  // Fly what is planned here, in the Trainer. Unlike the endpoint above, ArduDeck is the one
  // SPAWNING the simulator on this path, so there is nothing to negotiate: it keeps the flight
  // controller by construction and the Trainer is told so.
  setupTrainerHandlers(mainWindow, {
    home: () => {
      const at = ardupilotSitlProcess.currentConfig?.homeLocation ?? null;
      // `lng` here, `lon` on the wire. One rename, at the boundary, rather than two spellings
      // travelling together for the rest of the journey.
      return at ? { lat: at.lat, lon: at.lng, altM: at.alt, headingDeg: at.heading } : null;
    },
    frame: () => ({
      frameClass: ardupilotSitlProcess.simFrame?.frameClass ?? null,
      frameType: ardupilotSitlProcess.simFrame?.frameType ?? null,
      framePath: ardupilotSitlProcess.simFramePath ?? null,
    }),
    releasePhysics: async () => {
      if (lastReportedArmed === true) return false;
      // Marked externally owned BEFORE stopping, so nothing in the SITL lifecycle can race in
      // and respawn the engine onto UDP 9002. Same order as the hand over, for the same reason.
      ardupilotSitlProcess.setEngineManaged(false);
      simEngineProcess.stop();
      ardupilotRcSender.setExternalOwner(true);
      return true;
    },
    log: (level, message) => sendLog(mainWindow, level, message),
  });

  // NTRIP client for RTK corrections (issue #60)
  setupNtripHandlers(mainWindow, {
    sendGpsRtcm: async (fragment) => {
      if (!currentTransport?.isOpen || !connectionState.isConnected) return false;
      const payload = serializeGpsRtcmData(fragment);
      const pkt = await sendMavlinkPacket(GPS_RTCM_DATA_ID, payload, GPS_RTCM_DATA_CRC_EXTRA);
      await currentTransport.write(pkt);
      connectionState.packetsSent++;
      return true;
    },
    getGgaPosition: () => {
      if (!lastGpsRawForNtrip) return null;
      // A stale fix means the vehicle link is down; stop telling the caster
      // we're still at the last known point.
      if (Date.now() - lastGpsRawForNtrip.atMs > 10000) return null;
      return lastGpsRawForNtrip.gps;
    },
    listAvailableSerialPorts: async () => {
      const ports = await listSerialPorts();
      const busyPath = currentTransport?.isOpen ? currentTransport.portName : null;
      return busyPath ? ports.filter((p) => p.path !== busyPath) : ports;
    },
  });

  // === Log Download & Diagnostics ===

  ipcMain.handle(IPC_CHANNELS.LOG_LIST_REQUEST, async (): Promise<LogListEntry[]> => {
    if (!currentTransport) return [];

    const targetSys = connectionState.systemId ?? 1;
    logDownloadManager = new LogDownloadManager(
      sendMavlinkPacket,
      (data) => currentTransport!.write(data),
      (level, msg) => mainWindow && sendLog(mainWindow, level as ConsoleLogEntry['level'], msg),
      targetSys,
      1,
    );

    return logDownloadManager.requestLogList();
  });

  ipcMain.handle(IPC_CHANNELS.LOG_DOWNLOAD, async (_, logId: number, logSize: number, timeUtc?: number): Promise<string | null> => {
    if (!currentTransport || !logDownloadManager || !mainWindow) return null;

    // PX4 logs are ULog (.ulg), ArduPilot logs are DataFlash (.bin). ArduDeck
    // itself sniffs the format from the magic bytes either way, but the
    // extension has to be right for the file to be usable elsewhere: Flight
    // Review and PlotJuggler reject a ULog named .bin.
    const isUlog = connectionState.firmware === 'px4';
    const logExt = isUlog ? 'ulg' : 'bin';
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Flight Log',
      defaultPath: `log_${logId}.${logExt}`,
      filters: [
        { name: isUlog ? 'PX4 ULog' : 'ArduPilot Flight Logs', extensions: [logExt] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (result.canceled || !result.filePath) return null;

    // Throttle progress to 4Hz: the manager reports per 90-byte chunk, and at
    // full USB rate that is thousands of IPC sends + renderer re-renders per
    // second, enough to starve the renderer for the whole download.
    let lastProgressSent = 0;
    const data = await logDownloadManager.downloadLog(logId, logSize, (received, total) => {
      const now = Date.now();
      if (now - lastProgressSent < 250 && received < total) return;
      lastProgressSent = now;
      safeSend(mainWindow!, IPC_CHANNELS.LOG_DOWNLOAD_PROGRESS, { logId, received, total });
    });

    if (!data) {
      safeSend(mainWindow, IPC_CHANNELS.LOG_DOWNLOAD_ERROR, { logId, error: 'Download failed' });
      return null;
    }

    await writeFile(result.filePath, data);
    // Record the download in recents immediately (not only when the file is
    // later opened) and stamp the FC identity so the list badge matches this
    // exact log, not whatever log happens to carry the same id next flight.
    {
      rememberRecentLog({
        path: result.filePath,
        name: basename(result.filePath),
        size: data.length,
        openedAt: Date.now(),
        fcLogId: logId,
        fcTimeUtc: timeUtc,
        fcSizeBytes: logSize,
      });
    }
    safeSend(mainWindow, IPC_CHANNELS.LOG_DOWNLOAD_COMPLETE, { logId, path: result.filePath, size: data.length });
    return result.filePath;
  });

  ipcMain.handle(IPC_CHANNELS.LOG_DOWNLOAD_CANCEL, async () => {
    logDownloadManager?.cancel();
  });

  ipcMain.handle(IPC_CHANNELS.LOG_ERASE_ALL, async (): Promise<boolean> => {
    if (!currentTransport) return false;
    if (!logDownloadManager) {
      logDownloadManager = new LogDownloadManager(
        sendMavlinkPacket,
        (data) => currentTransport!.write(data),
        (level, msg) => mainWindow && sendLog(mainWindow, level as ConsoleLogEntry['level'], msg),
        connectionState.systemId ?? 1,
        1,
      );
    }
    await logDownloadManager.eraseAllLogs();
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.LOG_STORAGE_INFO, async (): Promise<{ totalBytes: number; usedBytes: number; availableBytes: number } | null> => {
    if (!currentTransport) return null;
    if (!logDownloadManager) {
      logDownloadManager = new LogDownloadManager(
        sendMavlinkPacket,
        (data) => currentTransport!.write(data),
        (level, msg) => mainWindow && sendLog(mainWindow, level as ConsoleLogEntry['level'], msg),
        connectionState.systemId ?? 1,
        1,
      );
    }
    return logDownloadManager.requestStorageInfo();
  });

  ipcMain.handle(IPC_CHANNELS.LOG_OPEN_DIALOG, async (): Promise<{ path: string } | null> => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Open Flight Log',
      filters: [
        { name: 'Flight Logs', extensions: ['bin', 'log', 'ulg'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return { path: result.filePaths[0] };
  });

  // Read + parse a .bin in chunks on the main process and emit progress while
  // the parser is actually working. Doing this on main avoids the previous
  // model where the renderer received the file as `number[]` (100M JS Numbers
  // for a 100MB log) and then sent it back to main for parsing — that
  // double-IPC-marshal was the multi-minute "frozen UI" symptom users saw.
  // Detect log format from the leading magic bytes. ULog files start with the
  // ASCII bytes 'U','L','o','g' (0x55 0x4C 0x6F 0x67). Everything else defaults
  // to dataflash so any non-ULog file behaves exactly as before (preserves
  // ArduPilot logs and the All-Files-pick-anything behavior).
  const detectLogFormat = (buf: Uint8Array): 'dataflash' | 'ulog' => {
    if (buf.length >= 4 && buf[0] === 0x55 && buf[1] === 0x4c && buf[2] === 0x6f && buf[3] === 0x67) {
      return 'ulog';
    }
    return 'dataflash';
  };

  ipcMain.handle(IPC_CHANNELS.LOG_PARSE_FILE, async (_, filePath: string): Promise<unknown> => {
    if (!existsSync(filePath)) {
      // Stale recent — clean it up so the user doesn't keep seeing it.
      const logs = recentLogsStore.get('logs').filter((l) => l.path !== filePath);
      recentLogsStore.set('logs', logs);
      throw new Error(`File no longer exists: ${filePath}`);
    }

    const buffer = await readFile(filePath);
    const totalBytes = buffer.length;

    // Add to recent logs up-front so the UI can refresh its list while parsing.
    const name = filePath.split(/[\\/]/).pop() ?? filePath;
    rememberRecentLog({ path: filePath, name, size: totalBytes, openedAt: Date.now() });

    // Stream the file into the parser in 1 MB chunks so we can emit progress
    // and yield the event loop between feeds. Without the yield, IPC events
    // queued by sendLogParseProgress would not flush to the renderer until
    // the entire parse completed, leaving the progress bar stuck at 0%.
    const logFormat = detectLogFormat(buffer);
    const parser = logFormat === 'ulog' ? createUlogParser() : createDataFlashParser();
    const CHUNK = 1024 * 1024;
    const yieldEventLoop = () => new Promise<void>((r) => setImmediate(r));
    const sendProgress = (bytesConsumed: number) => {
      mainWindow?.webContents.send(IPC_CHANNELS.LOG_PARSE_PROGRESS, {
        bytesConsumed, totalBytes,
      });
    };

    sendProgress(0);
    for (let offset = 0; offset < totalBytes; offset += CHUNK) {
      const end = Math.min(offset + CHUNK, totalBytes);
      const slice = new Uint8Array(buffer.buffer, buffer.byteOffset + offset, end - offset);
      parser.feed(slice);
      sendProgress(end);
      await yieldEventLoop();
    }
    const log = parser.finalize();

    const healthResults = logFormat === 'ulog' ? runPx4HealthChecks(log) : runHealthChecks(log);

    // Fleet Forensics: persist a compact per-vehicle flight summary so health
    // trends + maintenance flags can roll up across the fleet. Best-effort - a
    // failure here must never break opening the log.
    try {
      const { statSync } = await import('node:fs');
      const { randomUUID } = await import('node:crypto');
      let mtimeMs = Date.now();
      try { mtimeMs = statSync(filePath).mtimeMs; } catch { /* keep now */ }
      const summary = extractFlightSummary({
        log: log as unknown as LogLike,
        health: healthResults as unknown as HealthLike[],
        path: filePath,
        fileName: name,
        fileMtimeMs: mtimeMs,
        flightId: randomUUID(),
      });
      recordFlight(summary);
    } catch (err) {
      console.warn('[fleet-log] failed to record flight summary:', err);
    }

    // Serialize Maps to plain objects for IPC transfer
    const formats: Record<number, unknown> = {};
    for (const [k, v] of log.formats) formats[k] = v;
    const messages: Record<string, unknown> = {};
    for (const [k, v] of log.messages) messages[k] = v;
    // unitLabels / multValues were added to DataFlashLog after the package's
    // dist was last built. Guard so a stale dist doesn't crash the IPC handler
    // (and so older logs that simply have no UNIT/FMTU records also work).
    const unitLabels: Record<string, string> = {};
    if (log.unitLabels instanceof Map) {
      for (const [k, v] of log.unitLabels) unitLabels[k] = v;
    }
    const multValues: Record<string, number> = {};
    if (log.multValues instanceof Map) {
      for (const [k, v] of log.multValues) multValues[k] = v;
    }

    return {
      log: {
        format: log.format,
        formats,
        messages,
        metadata: log.metadata,
        timeRange: log.timeRange,
        messageTypes: log.messageTypes,
        unitLabels,
        multValues,
      },
      healthResults,
      path: filePath,
    };
  });

  // ─── AI Flight Log Analysis ─────────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.LOG_AI_ANALYZE, async (_, args: {
    provider: 'claude' | 'openai' | 'gemini';
    messages: { role: 'user' | 'assistant'; content: string }[];
    systemContext: string;
  }): Promise<{ success: boolean; response?: string; error?: string }> => {
    const { provider, messages, systemContext } = args;

    const apiKey = getApiKey(`ai-${provider}`);
    if (!apiKey) {
      return { success: false, error: `No API key configured for ${provider}. Add it in Settings.` };
    }

    try {
      const response = await callAiProvider(provider, apiKey, systemContext, messages);
      return { success: true, response };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  });

  // Claude tool-use loop proxy. The renderer owns the loop (it holds the parsed
  // log and executes tools locally); this handler just forwards one Messages
  // call with the API key attached and returns the raw content + stop_reason.
  ipcMain.handle(IPC_CHANNELS.LOG_AI_CLAUDE_TOOL, async (_, args: {
    system: string;
    messages: unknown[];
    tools: unknown[];
  }): Promise<{ success: boolean; content?: unknown[]; stop_reason?: string; error?: string }> => {
    const apiKey = getApiKey('ai-claude');
    if (!apiKey) {
      return { success: false, error: 'No API key configured for claude. Add it in Settings.' };
    }
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
          system: args.system,
          tools: args.tools,
          messages: args.messages,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        return { success: false, error: `Claude API error ${res.status}: ${body}` };
      }
      const json = await res.json() as { content: unknown[]; stop_reason: string };
      return { success: true, content: json.content, stop_reason: json.stop_reason };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg };
    }
  });

  // ─── AI Chat Persistence ────────────────────────────────────────────────────

  ipcMain.handle(IPC_CHANNELS.LOG_CHAT_SAVE, (_, args: {
    logPath: string;
    messages: { role: string; content: string }[];
    insightCards: unknown[];
  }) => {
    const conversations = chatStore.get('conversations');
    conversations[args.logPath] = { messages: args.messages, insightCards: args.insightCards };
    chatStore.set('conversations', conversations);
  });

  ipcMain.handle(IPC_CHANNELS.LOG_CHAT_LOAD, (_, logPath: string) => {
    const conversations = chatStore.get('conversations');
    return conversations[logPath] ?? null;
  });

  ipcMain.handle(IPC_CHANNELS.LOG_RECENT_GET, () => {
    return recentLogsStore.get('logs');
  });

  ipcMain.handle(IPC_CHANNELS.LOG_RECENT_ADD, (_, entry: { path: string; name: string; size: number }) => {
    rememberRecentLog({ ...entry, openedAt: Date.now() });
  });

  // Remove a single entry from the recent-logs list. Does NOT touch the .bin
  // on disk — the user can always re-open the file via "Open .bin File".
  ipcMain.handle(IPC_CHANNELS.LOG_RECENT_REMOVE, (_, filePath: string) => {
    const logs = recentLogsStore.get('logs').filter((l) => l.path !== filePath);
    recentLogsStore.set('logs', logs);
  });

  // Wipe the entire recent-logs list. Same scope as the per-row remove —
  // .bin files on disk are untouched.
  ipcMain.handle(IPC_CHANNELS.LOG_RECENT_CLEAR, () => {
    recentLogsStore.set('logs', []);
  });

  // Fleet Forensics: cross-vehicle flight-summary history (built up as logs are
  // opened). Returns vehicles with their flights newest-first.
  ipcMain.handle(IPC_CHANNELS.FLEET_LOG_HISTORY_GET, () => {
    return getFleetHistory();
  });
  ipcMain.handle(IPC_CHANNELS.FLEET_LOG_HISTORY_CLEAR, () => {
    clearFleetHistory();
  });

  // Area Editor window
  ipcMain.handle(IPC_CHANNELS.AREA_EDITOR_OPEN, () => {
    openAreaEditorWindow();
  });

  // Main window reports its current map viewport so the Area Editor can open on
  // the same location (fire-and-forget on every camera move).
  ipcMain.on(IPC_CHANNELS.MAP_VIEWPORT_REPORT, (_event, v: { lat: number; lng: number; zoom: number }) => {
    if (v && Number.isFinite(v.lat) && Number.isFinite(v.lng) && Number.isFinite(v.zoom)) setMainMapViewport(v);
  });

  // Area Editor commit: editor window sends finished polygon; main delivers it
  // to the main window so it can activate the survey workflow.
  ipcMain.handle(IPC_CHANNELS.AREA_EDITOR_COMMIT, (_event, payload: { polygon: Array<{ lat: number; lng: number }> }) => {
    const main = getMainWindow();
    if (!main || main.isDestroyed() || main.webContents.isDestroyed()) return;
    main.webContents.send(IPC_CHANNELS.AREA_EDITOR_AREA_RECEIVED, payload);
  });

  // Area Editor multi-area commit: editor window sends multiple polygons (each
  // with optional holes); main delivers them to the main window in one go.
  ipcMain.handle(IPC_CHANNELS.AREA_EDITOR_COMMIT_AREAS, (_event, payload: { areas: Array<{ polygon: Array<{ lat: number; lng: number }>; holes?: Array<Array<{ lat: number; lng: number }>>; name?: string; kind?: 'area' | 'corridor'; corridorWidth?: number; corridorBranches?: Array<Array<{ lat: number; lng: number }>>; config?: Record<string, unknown> }> }) => {
    const main = getMainWindow();
    if (!main || main.isDestroyed() || main.webContents.isDestroyed()) return;
    main.webContents.send(IPC_CHANNELS.AREA_EDITOR_AREAS_RECEIVED, payload);
    // Bring the main window forward so the user sees the survey land in the planner.
    if (main.isMinimized()) main.restore();
    main.show();
    main.focus();
  });

  // KML / KMZ area export
  ipcMain.handle(IPC_CHANNELS.EXPORT_AREAS_KML, async (_, { areas, format }: { areas: ExportArea[]; format: 'kml' | 'kmz' }): Promise<{ success: boolean; filePath?: string; error?: string }> => {
    try {
      const isKmz = format === 'kmz';
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Export Areas',
        defaultPath: isKmz ? 'areas.kmz' : 'areas.kml',
        filters: isKmz
          ? [
              { name: 'KMZ Archive', extensions: ['kmz'] },
              { name: 'All Files', extensions: ['*'] },
            ]
          : [
              { name: 'KML File', extensions: ['kml'] },
              { name: 'All Files', extensions: ['*'] },
            ],
      });

      if (result.canceled || !result.filePath) {
        return { success: false, error: 'Cancelled' };
      }

      const kmlString = areasToKml(areas);
      const fs = await import('fs/promises');

      if (isKmz) {
        const AdmZip = (await import('adm-zip')).default;
        const zip = new AdmZip();
        zip.addFile('doc.kml', Buffer.from(kmlString, 'utf-8'));
        await fs.writeFile(result.filePath, zip.toBuffer());
      } else {
        await fs.writeFile(result.filePath, kmlString, 'utf-8');
      }

      return { success: true, filePath: result.filePath };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  });

  // ─── Procedural frame generator (ardudeck-frame crate) ──────────────────
  // Shells out to a release-built Rust binary rather than reimplementing the
  // motor-factor tables in TS/WASM, so the 3D sim frame and the crate's SITL
  // physics model can never drift apart.
  ipcMain.handle(IPC_CHANNELS.FRAME_GENERATE_BLUEPRINT, async (_event, args: FrameBlueprintRequest): Promise<FrameBlueprintResult> => {
    console.log('[frame-blueprint] request', { frameClass: args.frameClass, frameType: args.frameType, customFramePath: args.customFramePath, hasProfile: !!args.profile });
    const binaryPath = findFrameBlueprintBinary();
    console.log('[frame-blueprint] resolved binary:', binaryPath ?? '(not found)');
    if (!binaryPath) {
      return { error: 'frame_blueprint binary not built' };
    }

    // Build the crate's snake_case BuildInput from the real launched frame +
    // vehicle profile when either is present. With neither, fall back to the
    // preset invocation (<class> <type>).
    const spec = buildFrameSpecInput(args);
    const cliArgs = spec ? ['--spec', JSON.stringify(spec)] : [args.frameClass, args.frameType];

    try {
      const execFile = promisify(execFileCb);
      const { stdout } = await execFile(binaryPath, cliArgs, { maxBuffer: 4 * 1024 * 1024 });
      const parsed = JSON.parse(stdout.trim()) as FrameBlueprintResult;
      const partCount = parsed && 'blueprint' in parsed && (parsed.blueprint as { parts?: unknown[] })?.parts?.length;
      console.log('[frame-blueprint] ok:', 'error' in parsed ? parsed.error : `${partCount} parts (${spec ? 'real build' : 'preset'})`);
      return parsed;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[frame-blueprint] invocation failed:', message);
      return { error: `frame_blueprint invocation failed: ${message}` };
    }
  });

}

/**
 * Assemble the crate's snake_case `BuildInput` from a blueprint request. Reads
 * the launched SITL custom frame off disk (for real mass / disc area / motor
 * count) and folds in the vehicle-profile subset. Returns null when neither
 * source is available, signalling the caller to use the preset invocation.
 */
function buildFrameSpecInput(args: FrameBlueprintRequest): Record<string, unknown> | null {
  let sitl: Record<string, number> | undefined;
  if (args.customFramePath && existsSync(args.customFramePath)) {
    try {
      const raw = JSON.parse(readFileSync(args.customFramePath, 'utf8')) as Record<string, unknown>;
      const mass = Number(raw.mass);
      const diagonal = Number(raw.diagonal_size);
      const disc = Number(raw.disc_area);
      const motors = Number(raw.num_motors);
      if (Number.isFinite(mass) && Number.isFinite(diagonal) && Number.isFinite(disc) && Number.isFinite(motors)) {
        sitl = { mass, diagonal_size: diagonal, disc_area: disc, num_motors: Math.round(motors) };
      }
    } catch (e) {
      console.warn('[frame-blueprint] could not read custom frame file:', e instanceof Error ? e.message : e);
    }
  }

  let profile: Record<string, unknown> | undefined;
  if (args.profile) {
    const p = args.profile;
    profile = {
      weight_g: p.weightG,
      frame_size_mm: p.frameSizeMm ?? null,
      motor_count: p.motorCount != null ? Math.round(p.motorCount) : null,
      motor_kv: p.motorKv ?? null,
      prop_diameter_mm: p.propDiameterMm ?? null,
      esc_rating_a: p.escRatingA ?? null,
      battery_cells: Math.round(p.batteryCells),
      cog_offset_mm: p.cogOffsetMm ?? null,
    };
  }

  if (!sitl && !profile) return null;
  return { sitl: sitl ?? null, profile: profile ?? null, class: args.frameClass, frame_type: args.frameType };
}

/**
 * Locate the `frame_blueprint` binary (ardudeck-frame crate), checking in order:
 *   1. the packaged copy under Resources/frame-blueprint (electron-builder
 *      extraResources: frame-bin -> frame-blueprint),
 *   2. the CI/dev staging dir at apps/desktop/frame-bin (written by stage-frame.mjs),
 *   3. a locally built cargo target, found by walking up to the repo root (the dir
 *      holding `crates/`) since `app.getAppPath()` isn't reliable in dev.
 * Returns null when no binary is present (dev builds without the generator staged).
 */
function findFrameBlueprintBinary(): string | null {
  const ext = process.platform === 'win32' ? '.exe' : '';
  const exe = `frame_blueprint${ext}`;

  // 1. Production: bundled under Resources/frame-blueprint.
  const packaged = join(process.resourcesPath, 'frame-blueprint', exe);
  if (existsSync(packaged)) return packaged;

  const here = dirname(fileURLToPath(import.meta.url));

  // 2. CI/dev staging dir. This file compiles into out/main, so frame-bin is two
  //    levels up (out/main -> out -> desktop).
  const staged = join(here, '..', '..', 'frame-bin', exe);
  if (existsSync(staged)) return staged;

  // 3. Dev fallback: a locally built cargo target under the repo root.
  let dir = here;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'crates'))) {
      const binPath = join(dir, 'crates', 'ardudeck-frame', 'target', 'release', exe);
      return existsSync(binPath) ? binPath : null;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

async function callAiProvider(
  provider: 'claude' | 'openai' | 'gemini',
  apiKey: string,
  system: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
): Promise<string> {
  if (provider === 'claude') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system,
        messages,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Claude API error ${res.status}: ${body}`);
    }
    const json = await res.json() as { content: { type: string; text: string }[] };
    return json.content.map((c) => c.text).join('');
  }

  if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 2048,
        messages: [{ role: 'system', content: system }, ...messages],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${body}`);
    }
    const json = await res.json() as { choices: { message: { content: string } }[] };
    return json.choices[0]?.message?.content ?? '';
  }

  if (provider === 'gemini') {
    // Gemini: system instruction + conversation history
    const contents = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: { maxOutputTokens: 2048 },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Gemini API error ${res.status}: ${body}`);
    }
    const json = await res.json() as { candidates: { content: { parts: { text: string }[] } }[] };
    return json.candidates[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
  }

  throw new Error(`Unknown provider: ${provider}`);
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
  const valueRegex = /<value\s+code="(-?\d+)"[^>]*>([^<]*)<\/value>/g;
  const bitRegex = /<bit\s+code="(\d+)"[^>]*>([^<]*)<\/bit>/g;

  let match;
  while ((match = paramRegex.exec(xml)) !== null) {
    const attrString = match[1]!;
    const content = match[2]!;

    // Parse attributes
    const attrs: Record<string, string> = {};
    let attrMatch;
    while ((attrMatch = attrRegex.exec(attrString)) !== null) {
      attrs[attrMatch[1]!] = attrMatch[2]!;
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
      const fieldName = fieldMatch[1]!;
      const fieldValue = fieldMatch[2]!;
      const value = fieldValue.trim();

      switch (fieldName) {
        case 'Range': {
          const parts = value.split(/\s+/);
          if (parts.length >= 2) {
            param.range = {
              min: parseFloat(parts[0]!),
              max: parseFloat(parts[1]!),
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
        case 'ReadOnly':
          param.readOnly = value.toLowerCase() === 'true';
          break;
      }
    }

    // Parse <values> element
    let valueMatch;
    while ((valueMatch = valueRegex.exec(content)) !== null) {
      if (!param.values) param.values = {};
      param.values[parseInt(valueMatch[1]!, 10)] = valueMatch[2]!.trim();
    }

    // Parse <bitmask> element
    let bitMatch;
    while ((bitMatch = bitRegex.exec(content)) !== null) {
      if (!param.bitmask) param.bitmask = {};
      param.bitmask[parseInt(bitMatch[1]!, 10)] = bitMatch[2]!.trim();
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
      seq: parseInt(parts[0]!, 10),
      current: parts[1] === '1',
      frame: parseInt(parts[2]!, 10) as MavFrame,
      command: parseInt(parts[3]!, 10),
      param1: parseFloat(parts[4]!),
      param2: parseFloat(parts[5]!),
      param3: parseFloat(parts[6]!),
      param4: parseFloat(parts[7]!),
      latitude: parseFloat(parts[8]!),
      longitude: parseFloat(parts[9]!),
      altitude: parseFloat(parts[10]!),
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
      plannedHomePosition: items.length > 0 ? [items[0]!.latitude, items[0]!.longitude, items[0]!.altitude] : [0, 0, 0],
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
      seq: parseInt(parts[0]!, 10),
      command: parseInt(parts[1]!, 10),
      frame: parseInt(parts[2]!, 10),
      param1: parseFloat(parts[3]!),
      param2: parseFloat(parts[4]!),
      param3: parseFloat(parts[5]!),
      param4: parseFloat(parts[6]!),
      latitude: parseFloat(parts[7]!),
      longitude: parseFloat(parts[8]!),
      altitude: parseFloat(parts[9]!),
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
      seq: parseInt(parts[0]!, 10),
      command: parseInt(parts[1]!, 10),
      frame: parseInt(parts[2]!, 10),
      param1: parseFloat(parts[3]!),
      param2: parseFloat(parts[4]!),
      param3: parseFloat(parts[5]!),
      param4: parseFloat(parts[6]!),
      latitude: parseFloat(parts[7]!),
      longitude: parseFloat(parts[8]!),
      altitude: parseFloat(parts[9]!),
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
  try {
    // Shutdown unified logger (flushes remaining logs)
    shutdownLogger();
  } catch (err) {
    console.warn('[Shutdown] Error shutting down logger:', err);
  }

  try {
    // Drop the NTRIP caster connection so it doesn't linger past the app
    cleanupNtrip();
  } catch (err) {
    console.warn('[Shutdown] Error stopping NTRIP client:', err);
  }

  try {
    // Close the sim handover endpoint and remove its discovery file, so the
    // Trainer game never dials a port that died with this app.
    await stopSimHandoverServer();
  } catch (err) {
    console.warn('[Shutdown] Error stopping sim handover endpoint:', err);
  }

  try {
    // Stop SITL process if running
    sitlProcess.stop();
  } catch (err) {
    console.warn('[Shutdown] Error stopping SITL:', err);
  }

  try {
    // Same reaping duty for the ArduPilot, swarm and PX4 SITL children.
    // These were never stopped on quit: closing the app orphaned a running
    // px4, whose single-instance lock then failed every future launch with
    // "PX4 server already running for instance 0" (exit 255) until the
    // orphan was hunted down by hand.
    ardupilotSitlProcess.stop();
    swarmSitlProcess.stop();
    px4SitlProcess.stop();
    stopPx4ManualControlStream();
    clearPx4MotorTestTimers();
  } catch (err) {
    console.warn('[Shutdown] Error stopping firmware SITLs:', err);
  }

  try {
    // Stop the flight model. It is a SEPARATE child process, and it was the one thing spawned
    // here that shutdown never reaped: closing the window left `ardudeck-sim-engine` running
    // and holding UDP 9002 forever.
    //
    // That port is the physics link, and exactly one process can own it. So an orphan from a
    // closed ArduDeck silently blocks the Trainer from starting its own flight controller, and
    // the only symptom is the Trainer refusing to launch while saying a flight controller is
    // already running - which is true, and useless, because the application it belongs to is
    // not on screen. Found after it blocked three separate launches in one session.
    await simEngineProcess.stopAndWait();
  } catch (err) {
    console.warn('[Shutdown] Error stopping the sim engine:', err);
  }

  try {
    // Tear down the media engine (MediaMTX hub + any ffmpeg ingest/record).
    mediaEngine.shutdown();
  } catch (err) {
    console.warn('[Shutdown] Error stopping media engine:', err);
  }

  try {
    // Stop the multi-vehicle engine so it doesn't outlive the desktop and squat its ports
    // (a stale engine is what makes the next launch fail with "exited (code 1)").
    orchestratorProcess.stop();
  } catch (err) {
    console.warn('[Shutdown] Error stopping orchestrator engine:', err);
  }

  try {
    // Full cleanup of MSP connection (stops telemetry AND clears transport)
    cleanupMspConnection();
  } catch (err) {
    console.warn('[Shutdown] Error cleaning up MSP:', err);
  }

  try {
    // Clean up transport listeners
    cleanupTransportListeners();
  } catch (err) {
    console.warn('[Shutdown] Error cleaning transport listeners:', err);
  }

  try {
    // Close transport if open
    if (currentTransport?.isOpen) {
      await currentTransport.close();
    }
  } catch (err) {
    console.warn('[Shutdown] Error closing transport:', err);
  }

  // Clear heartbeat timeout
  if (heartbeatTimeout) {
    clearTimeout(heartbeatTimeout);
    heartbeatTimeout = null;
  }

  // Clear heartbeat watchdog and grace timer
  if (heartbeatWatchdog) {
    clearTimeout(heartbeatWatchdog);
    heartbeatWatchdog = null;
  }
  if (heartbeatGraceTimer) {
    clearTimeout(heartbeatGraceTimer);
    heartbeatGraceTimer = null;
  }

  // Reset state
  currentTransport = null;
  mavlinkParser = null;
}
