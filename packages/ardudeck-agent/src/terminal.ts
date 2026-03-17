// terminal.ts
import type { IPty } from 'node-pty';

let pty: typeof import('node-pty') | null = null;

try {
  pty = await import('node-pty');
} catch {
  console.warn('[terminal] node-pty not available — terminal feature disabled');
}

interface TerminalSession {
  process: IPty;
  timeoutHandle: ReturnType<typeof setTimeout> | null;
  lastActivity: number;
}

const sessions = new Map<string, TerminalSession>();

export function isTerminalAvailable(): boolean {
  return pty !== null;
}

export function createSession(
  sessionId: string,
  timeoutMs: number,
  onData: (data: string) => void,
  onExit: () => void
): boolean {
  if (!pty) return false;
  if (sessions.has(sessionId)) return true;

  const shell = process.env.SHELL || '/bin/bash';
  const proc = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: process.env.HOME || '/',
    env: process.env as Record<string, string>,
  });

  const session: TerminalSession = {
    process: proc,
    timeoutHandle: null,
    lastActivity: Date.now(),
  };

  const resetTimeout = () => {
    session.lastActivity = Date.now();
    if (session.timeoutHandle) clearTimeout(session.timeoutHandle);
    session.timeoutHandle = setTimeout(() => {
      console.log(`[terminal] Session ${sessionId} timed out`);
      destroySession(sessionId);
      onExit();
    }, timeoutMs);
  };

  proc.onData((data: string) => {
    resetTimeout();
    onData(data);
  });

  proc.onExit(() => {
    sessions.delete(sessionId);
    if (session.timeoutHandle) clearTimeout(session.timeoutHandle);
    onExit();
  });

  resetTimeout();
  sessions.set(sessionId, session);
  return true;
}

export function writeToSession(sessionId: string, data: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  session.process.write(data);
  session.lastActivity = Date.now();
  return true;
}

export function resizeSession(sessionId: string, cols: number, rows: number): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  session.process.resize(cols, rows);
  return true;
}

export function destroySession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  if (session.timeoutHandle) clearTimeout(session.timeoutHandle);
  session.process.kill();
  sessions.delete(sessionId);
}

export function destroyAllSessions(): void {
  for (const [id] of sessions) {
    destroySession(id);
  }
}
