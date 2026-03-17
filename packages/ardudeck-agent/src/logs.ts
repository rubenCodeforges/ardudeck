// logs.ts
import { spawn, type ChildProcess } from 'child_process';
import type { LogEntry, LogLevel } from '@ardudeck/companion-types';

let logProcess: ChildProcess | null = null;
let listeners: Array<(entry: LogEntry) => void> = [];

function parseLogLevel(line: string): LogLevel {
  const lower = line.toLowerCase();
  if (lower.includes('error') || lower.includes('err]')) return 'error';
  if (lower.includes('warn') || lower.includes('warning')) return 'warn';
  if (lower.includes('debug')) return 'debug';
  return 'info';
}

function parseLine(line: string): LogEntry {
  return {
    timestamp: Date.now(),
    level: parseLogLevel(line),
    message: line.trim(),
    source: 'system',
  };
}

export function startLogTailing(): void {
  if (logProcess) return;

  // Try journalctl first (systemd), fall back to tail -f /var/log/syslog
  try {
    logProcess = spawn('journalctl', ['-f', '-n', '0', '--no-pager', '-o', 'short'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    try {
      logProcess = spawn('tail', ['-f', '-n', '0', '/var/log/syslog'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      console.warn('[logs] Neither journalctl nor /var/log/syslog available');
      return;
    }
  }

  logProcess.stdout?.on('data', (chunk: Buffer) => {
    const lines = chunk.toString().split('\n').filter(l => l.trim());
    for (const line of lines) {
      const entry = parseLine(line);
      for (const listener of listeners) {
        listener(entry);
      }
    }
  });

  logProcess.on('exit', () => {
    logProcess = null;
  });
}

export function onLogEntry(callback: (entry: LogEntry) => void): () => void {
  listeners.push(callback);
  return () => {
    listeners = listeners.filter(l => l !== callback);
  };
}

export function stopLogTailing(): void {
  if (logProcess) {
    logProcess.kill();
    logProcess = null;
  }
  listeners = [];
}
