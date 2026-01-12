/**
 * Unified Logger Service
 *
 * Central logging service that:
 * - Intercepts console.log/warn/error in main process
 * - Receives logs from renderer via IPC
 * - Writes all logs to JSONL files with rotation
 * - Sends logs to renderer for display in DebugConsole
 */

import { app, ipcMain, BrowserWindow } from 'electron';
import { join, dirname } from 'path';
import { createWriteStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync, WriteStream } from 'fs';
import { IPC_CHANNELS, type ConsoleLogEntry } from '../../shared/ipc-channels.js';

// Configuration
const MAX_FILE_SIZE_MB = 10; // Rotate after 10MB per file
const MAX_TOTAL_SIZE_MB = 50; // Keep max 50MB total
const MAX_AGE_DAYS = 7; // Delete files older than 7 days
const FLUSH_INTERVAL_MS = 5000; // Flush buffer every 5 seconds

// Log entry for JSONL file (more detailed than ConsoleLogEntry)
export interface FileLogEntry {
  id: number;
  ts: number; // timestamp
  level: 'info' | 'warn' | 'error' | 'debug' | 'packet';
  source: 'main' | 'renderer' | 'msp' | 'mavlink' | 'cli' | 'firmware';
  msg: string;
  details?: string;
  // Additional metadata
  stack?: string;
  sessionId?: string;
}

// State
let logId = 0;
let mainWindow: BrowserWindow | null = null;
let writeStream: WriteStream | null = null;
let currentLogFile: string | null = null;
let currentFileSize = 0;
let logBuffer: string[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let sessionId: string | null = null;
let isInitialized = false;

// Original console methods (saved before intercept)
const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
  debug: console.debug,
};

/**
 * Get the logs directory path
 */
export function getLogsDir(): string {
  return join(app.getPath('userData'), 'logs');
}

/**
 * Generate a new log filename with timestamp
 */
function generateLogFileName(): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `ardudeck-${timestamp}.jsonl`;
}

/**
 * Generate a unique session ID for this app run
 */
function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create a new log file and write stream
 */
function createNewLogFile(): void {
  const logsDir = getLogsDir();

  // Ensure logs directory exists
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
  }

  // Close existing stream
  if (writeStream) {
    writeStream.end();
    writeStream = null;
  }

  // Create new file
  currentLogFile = join(logsDir, generateLogFileName());
  writeStream = createWriteStream(currentLogFile, { flags: 'a' });
  currentFileSize = 0;

  // Handle stream errors
  writeStream.on('error', (err) => {
    originalConsole.error('[UnifiedLogger] Write stream error:', err);
  });
}

/**
 * Rotate log file if needed
 */
function rotateIfNeeded(): void {
  if (currentFileSize >= MAX_FILE_SIZE_MB * 1024 * 1024) {
    createNewLogFile();
    cleanupOldLogs();
  }
}

/**
 * Clean up old log files based on age and total size
 */
function cleanupOldLogs(): void {
  const logsDir = getLogsDir();
  if (!existsSync(logsDir)) return;

  try {
    const files = readdirSync(logsDir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => ({
        name: f,
        path: join(logsDir, f),
        stat: statSync(join(logsDir, f)),
      }))
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs); // Newest first

    const now = Date.now();
    const maxAgeMs = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    let totalSize = 0;

    for (const file of files) {
      const age = now - file.stat.mtimeMs;

      // Delete if too old
      if (age > maxAgeMs) {
        unlinkSync(file.path);
        continue;
      }

      // Delete if over total size limit
      totalSize += file.stat.size;
      if (totalSize > MAX_TOTAL_SIZE_MB * 1024 * 1024) {
        // Don't delete the current log file
        if (file.path !== currentLogFile) {
          unlinkSync(file.path);
        }
      }
    }
  } catch (err) {
    originalConsole.error('[UnifiedLogger] Cleanup error:', err);
  }
}

/**
 * Write a log entry to file
 */
function writeToFile(entry: FileLogEntry): void {
  if (!writeStream) return;

  const line = JSON.stringify(entry) + '\n';
  logBuffer.push(line);
  currentFileSize += line.length;

  rotateIfNeeded();
}

/**
 * Flush buffer to disk
 */
function flushBuffer(): void {
  if (!writeStream || logBuffer.length === 0) return;

  for (const line of logBuffer) {
    writeStream.write(line);
  }
  logBuffer = [];
}

/**
 * Send log entry to renderer for display
 */
function sendToRenderer(entry: ConsoleLogEntry): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  try {
    mainWindow.webContents.send(IPC_CHANNELS.CONSOLE_LOG, entry);
  } catch {
    // Window may be closing
  }
}

/**
 * Core logging function
 */
export function log(
  level: FileLogEntry['level'],
  source: FileLogEntry['source'],
  message: string,
  details?: string,
  stack?: string
): void {
  const id = ++logId;
  const ts = Date.now();

  // Create file entry (more detailed)
  const fileEntry: FileLogEntry = {
    id,
    ts,
    level,
    source,
    msg: message,
    details,
    stack,
    sessionId: sessionId || undefined,
  };

  // Write to file
  writeToFile(fileEntry);

  // Create renderer entry (simpler)
  const rendererEntry: ConsoleLogEntry = {
    id,
    timestamp: ts,
    level,
    message: `[${source.toUpperCase()}] ${message}`,
    details,
  };

  // Send to renderer
  sendToRenderer(rendererEntry);
}

/**
 * Convenience logging methods
 */
export const logger = {
  info: (source: FileLogEntry['source'], message: string, details?: string) =>
    log('info', source, message, details),

  warn: (source: FileLogEntry['source'], message: string, details?: string) =>
    log('warn', source, message, details),

  error: (source: FileLogEntry['source'], message: string, details?: string, stack?: string) =>
    log('error', source, message, details, stack),

  debug: (source: FileLogEntry['source'], message: string, details?: string) =>
    log('debug', source, message, details),

  packet: (source: FileLogEntry['source'], message: string, details?: string) =>
    log('packet', source, message, details),
};

/**
 * Intercept console methods in main process
 */
function interceptConsole(): void {
  console.log = (...args: unknown[]) => {
    const message = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    log('info', 'main', message);
    originalConsole.log(...args);
  };

  console.warn = (...args: unknown[]) => {
    const message = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    log('warn', 'main', message);
    originalConsole.warn(...args);
  };

  console.error = (...args: unknown[]) => {
    const message = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    const stack = args.find((a) => a instanceof Error)?.stack;
    log('error', 'main', message, undefined, stack as string | undefined);
    originalConsole.error(...args);
  };

  console.debug = (...args: unknown[]) => {
    const message = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    log('debug', 'main', message);
    originalConsole.debug(...args);
  };
}

/**
 * Setup IPC handler for renderer logs
 */
function setupRendererLogHandler(): void {
  // Remove existing handler if any
  try {
    ipcMain.removeHandler('log:entry');
  } catch {
    // Ignore if not registered
  }

  // Register handler for renderer logs
  ipcMain.handle(
    'log:entry',
    (_event, level: FileLogEntry['level'], message: string, details?: string) => {
      log(level, 'renderer', message, details);
    }
  );
}

/**
 * Initialize the unified logger
 */
export function initUnifiedLogger(window: BrowserWindow): void {
  if (isInitialized) {
    // Just update the window reference
    mainWindow = window;
    return;
  }

  mainWindow = window;
  sessionId = generateSessionId();

  // Create initial log file
  createNewLogFile();

  // Setup flush timer
  flushTimer = setInterval(flushBuffer, FLUSH_INTERVAL_MS);

  // Intercept console
  interceptConsole();

  // Setup IPC handler
  setupRendererLogHandler();

  // Clean up old logs on startup
  cleanupOldLogs();

  isInitialized = true;

  // Log initialization
  log('info', 'main', `Unified logger initialized. Session: ${sessionId}`);
}

/**
 * Shutdown the logger (call before app quit)
 */
export function shutdownLogger(): void {
  if (!isInitialized) return;

  log('info', 'main', 'Logger shutting down');

  // Flush remaining buffer
  flushBuffer();

  // Stop flush timer
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }

  // Close write stream
  if (writeStream) {
    writeStream.end();
    writeStream = null;
  }

  isInitialized = false;
}

/**
 * Get all log files for report generation
 */
export function getLogFiles(): string[] {
  const logsDir = getLogsDir();
  if (!existsSync(logsDir)) return [];

  return readdirSync(logsDir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => join(logsDir, f))
    .sort((a, b) => {
      const statA = statSync(a);
      const statB = statSync(b);
      return statB.mtimeMs - statA.mtimeMs; // Newest first
    });
}

/**
 * Get current session ID
 */
export function getSessionId(): string | null {
  return sessionId;
}
