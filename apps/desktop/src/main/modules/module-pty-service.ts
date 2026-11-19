import type * as Pty from 'node-pty';
import { randomUUID } from 'node:crypto';
import { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';

interface Session {
  ptyProc: Pty.IPty;
  moduleSlug: string;
  windowId: number;
}

const sessions = new Map<string, Session>();

export interface PtySpawnOpts {
  moduleSlug: string;
  windowId: number;
  shell: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
}

let ptyModule: Promise<typeof Pty> | null = null;

/**
 * node-pty is a native addon. Loaded at startup, a build without its binary (the Linux AppImage of RC3 had none)
 * killed the main process before any window opened. Loading it on the first terminal keeps a missing binary
 * down to that one cargo feature.
 */
function loadPty(): Promise<typeof Pty> {
  ptyModule ??= import('node-pty').catch((err: unknown) => {
    ptyModule = null;
    throw new Error(`terminal support is not available in this build: ${err instanceof Error ? err.message : String(err)}`); // i18n-exempt
  });
  return ptyModule;
}

export async function spawnPty(opts: PtySpawnOpts): Promise<string> {
  const pty = await loadPty();
  const id = `${opts.moduleSlug}:${randomUUID()}`;
  const ptyProc = pty.spawn(opts.shell, opts.args ?? [], {
    name: 'xterm-256color',
    cols: opts.cols ?? 100,
    rows: opts.rows ?? 30,
    cwd: opts.cwd ?? process.env['HOME'],
    env: { ...process.env, ...(opts.env ?? {}) } as Record<string, string>,
  });
  sessions.set(id, { ptyProc, moduleSlug: opts.moduleSlug, windowId: opts.windowId });

  ptyProc.onData((data) => {
    const w = BrowserWindow.fromId(opts.windowId);
    if (w && !w.isDestroyed()) {
      w.webContents.send(IPC_CHANNELS.MODULE_HOST_PTY_DATA, id, data);
    }
  });

  ptyProc.onExit(({ exitCode }) => {
    const w = BrowserWindow.fromId(opts.windowId);
    if (w && !w.isDestroyed()) {
      w.webContents.send(IPC_CHANNELS.MODULE_HOST_PTY_EXIT, id, exitCode);
    }
    sessions.delete(id);
  });

  return id;
}

export function writePty(id: string, data: string): void {
  sessions.get(id)?.ptyProc.write(data);
}

export function resizePty(id: string, cols: number, rows: number): void {
  sessions.get(id)?.ptyProc.resize(cols, rows);
}

export function killPty(id: string): void {
  const s = sessions.get(id);
  if (!s) return;
  s.ptyProc.kill();
  sessions.delete(id);
}

export function killAllForModule(slug: string): void {
  for (const [id, s] of sessions) {
    if (s.moduleSlug === slug) {
      s.ptyProc.kill();
      sessions.delete(id);
    }
  }
}
