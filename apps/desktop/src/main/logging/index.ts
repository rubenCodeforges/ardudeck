/**
 * Logging module exports
 */

export {
  initUnifiedLogger,
  shutdownLogger,
  log,
  logger,
  getLogsDir,
  getLogFiles,
  getSessionId,
  type FileLogEntry,
} from './unified-logger.js';

export {
  collectLogs,
  collectSystemInfo,
  createReportPayload,
  createMspBoardDump,
  createMavlinkBoardDump,
  applyPrivacyFilter,
  estimatePayloadSize,
  type BoardDump,
  type BoardDumpMsp,
  type BoardDumpMavlink,
  type SystemInfo,
  type ReportPayload,
} from './report-generator.js';

export {
  encryptReport,
  saveEncryptedReport,
  parseHeader,
  getEncryptionInfo,
  decryptReport,
} from './report-encryptor.js';

export { PUBLIC_KEY, PUBLIC_KEY_VERSION, IS_PLACEHOLDER_KEY } from './public-key.js';
