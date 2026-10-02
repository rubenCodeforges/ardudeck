/**
 * Local Orchestrator Process Manager
 *
 * The orchestrator is the invisible engine behind multi-vehicle mode: a localhost
 * child process the desktop spawns (exactly like SITL) that terminates every vehicle
 * link - UDP, TCP, serial radios - manages their health and reconnection, and presents
 * the whole fleet to the desktop over a single WebSocket. The user never sees a port or
 * a transport type; they press one button and the engine comes up.
 *
 * This manager owns the child's lifecycle and its source list. Sources are passed as
 * `--link` / `--peer` args; changing them restarts the engine (a sub-second blip), which
 * keeps the orchestrator's config-at-startup model simple. Once the WebSocket is
 * accepting connections, the IPC layer auto-connects the desktop to it.
 */

import { spawn, execFile, ChildProcess } from 'node:child_process';
import { app, BrowserWindow } from 'electron';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { IPC_CHANNELS, type OrchestratorSource, type OrchestratorStatus } from '../../shared/ipc-channels.js';
import { t } from '../../shared/i18n/index.js';

/** Where the engine binds its north WebSocket and where the desktop dials it. */
const WS_HOST = '127.0.0.1';
const WS_PORT = 8790;
export const ORCHESTRATOR_WS_URL = `ws://${WS_HOST}:${WS_PORT}`;

/** Default sources: listen on the standard ArduPilot GCS UDP ports. Covers SITL and any
 * forwarder/radio configured to push here - the zero-config common case. */
const DEFAULT_SOURCES: OrchestratorSource[] = [
  { kind: 'udp', port: 14550 },
  { kind: 'udp', port: 14551 },
  { kind: 'udp', port: 14552 },
  { kind: 'udp', port: 14553 },
];

function sourceToArgs(s: OrchestratorSource): string[] {
  switch (s.kind) {
    case 'udp': return ['--link', `udpin:0.0.0.0:${s.port}`];
    case 'tcp': return ['--link', `tcpout:${s.host}:${s.port}`];
    case 'serial': return ['--link', `serial:${s.path}:${s.baud}`];
    // Drone dials in (cellular/remote): the engine listens, so the link survives signal
    // loss and follows the drone's address across NAT rebinds. udpin is the common case
    // (mavlink-router/mavproxy `udpout`); tcpin for a drone running a TCP client.
    case 'cellular': return ['--link', `${s.proto === 'tcp' ? 'tcpin' : 'udpin'}:0.0.0.0:${s.port}`];
    case 'peer': return ['--peer', s.url];
  }
}

/** Resolve the orchestrator binary: explicit override, then a bundled resource, then the
 * dev build in the sibling repo. Returns null if none is present. */
function resolveBinary(): string | null {
  const exe = process.platform === 'win32' ? 'ardudeck-orchestrator.exe' : 'ardudeck-orchestrator';
  const candidates = [
    process.env.ARDUDECK_ORCHESTRATOR_BIN,
    process.resourcesPath ? path.join(process.resourcesPath, 'orchestrator', exe) : null,
    path.join(app.getAppPath(), '..', '..', '..', 'ardudeck-orchestrator', 'target', 'release', exe),
    path.join(app.getAppPath(), '..', '..', '..', 'ardudeck-orchestrator', 'target', 'debug', exe),
  ];
  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }
  return null;
}

/** Is anything currently accepting connections on this localhost port? */
function isPortOpen(port: number, timeoutMs = 500): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect({ host: WS_HOST, port });
    const done = (v: boolean) => { sock.destroy(); resolve(v); };
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
    sock.setTimeout(timeoutMs, () => done(false));
  });
}

/** Best-effort kill of whatever process is listening on a TCP port. Used to clear a stale
 * engine that outlived the desktop (reload/crash) and still holds the ports - which would
 * otherwise make the next spawn die with "exited (code 1)". Platform-specific, never throws. */
function killByTcpPort(port: number): Promise<void> {
  return new Promise((resolve) => {
    const cb = () => resolve();
    if (process.platform === 'win32') {
      // Find the PID(s) on the port and force-kill each.
      execFile(
        'cmd',
        ['/c', `for /f "tokens=5" %a in ('netstat -ano ^| findstr LISTENING ^| findstr :${port}') do taskkill /F /PID %a`],
        cb,
      );
    } else {
      execFile('/bin/sh', ['-c', `lsof -ti tcp:${port} | xargs kill -9 2>/dev/null`], cb);
    }
  });
}

/** Poll until the WebSocket port accepts connections (the engine takes a moment to bind). */
function waitForPort(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const attempt = () => {
      const sock = net.connect({ host: WS_HOST, port });
      sock.once('connect', () => { sock.destroy(); resolve(true); });
      sock.once('error', () => {
        sock.destroy();
        if (Date.now() >= deadline) { resolve(false); return; }
        setTimeout(attempt, 300);
      });
    };
    attempt();
  });
}

class OrchestratorProcessManager {
  private child: ChildProcess | null = null;
  private mainWindow: BrowserWindow | null = null;
  private _isRunning = false;
  private sources: OrchestratorSource[] = DEFAULT_SOURCES;
  private lastError: string | undefined;
  /** Crash-supervision: restart a crashed engine so the fleet self-heals, but back off and
   * give up if it keeps dying fast (bad args, port conflict) instead of thrashing. */
  private restartTimer: NodeJS.Timeout | null = null;
  private crashCount = 0;
  private startedAt = 0;
  private intentionalStop = false;
  private static readonly MAX_RAPID_CRASHES = 5;
  private static readonly STABLE_UPTIME_MS = 20_000;

  get isRunning(): boolean {
    return this._isRunning;
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  getStatus(): OrchestratorStatus {
    return {
      isRunning: this._isRunning,
      wsUrl: ORCHESTRATOR_WS_URL,
      sources: this.sources,
      error: this.lastError,
    };
  }

  /** Spawn the engine with the given sources (or the current/default set). Resolves once the
   * WebSocket is accepting connections, so the caller can immediately auto-connect. */
  async start(sources?: OrchestratorSource[]): Promise<{ success: boolean; error?: string; wsUrl: string }> {
    if (sources && sources.length > 0) this.sources = sources;
    if (this._isRunning) this.stop();

    // Self-heal: if a previous engine outlived the desktop (a reload or crash where stop()
    // never ran), it still holds the WS + link ports and a fresh spawn would die with
    // "exited (code 1)". We own nothing on this port now, so clear whatever is squatting it.
    await this.reapStaleEngine();

    const binary = resolveBinary();
    if (!binary) {
      this.lastError = t('main:orchestrator.engineNotFound');
      this.emitState();
      return { success: false, error: this.lastError, wsUrl: ORCHESTRATOR_WS_URL };
    }

    const args = ['--bind', `${WS_HOST}:${WS_PORT}`, ...this.sources.flatMap(sourceToArgs)];
    this.log('info', `Starting multi-vehicle engine: ${this.sources.length} source(s)`);

    if (this.restartTimer) { clearTimeout(this.restartTimer); this.restartTimer = null; }

    try {
      const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      this.child = child;
      this._isRunning = true;
      this.lastError = undefined;
      this.intentionalStop = false;
      this.startedAt = Date.now();
      this.emitState();

      child.stdout?.on('data', (d: Buffer) => this.log('info', d.toString().trimEnd()));
      child.stderr?.on('data', (d: Buffer) => this.log('info', d.toString().trimEnd()));
      child.on('exit', (code) => {
        if (this.child === child) {
          this.child = null;
          this._isRunning = false;
          if (code && code !== 0) this.lastError = `Engine exited (code ${code})`;
          this.emitState();
          // Unexpected exit (we didn't stop it): self-heal so the fleet doesn't silently
          // die mid-flight. Reset the crash counter after a stable run so a single later
          // crash still recovers; give up only on a tight crash loop.
          if (!this.intentionalStop) this.scheduleRestart();
        }
      });
      child.on('error', (err) => {
        if (this.child === child) {
          this.lastError = err.message;
          this._isRunning = false;
          this.child = null;
          this.emitState();
        }
      });
    } catch (e) {
      this._isRunning = false;
      this.lastError = e instanceof Error ? e.message : t('main:orchestrator.spawnFailed');
      this.emitState();
      return { success: false, error: this.lastError, wsUrl: ORCHESTRATOR_WS_URL };
    }

    const ready = await waitForPort(WS_PORT, 15_000);
    if (!ready) {
      this.stop();
      this.lastError = t('main:orchestrator.connectTimeout');
      this.emitState();
      return { success: false, error: this.lastError, wsUrl: ORCHESTRATOR_WS_URL };
    }
    this.emitState();
    return { success: true, wsUrl: ORCHESTRATOR_WS_URL };
  }

  /** Replace the source list and, if running, restart to apply it. */
  async setSources(sources: OrchestratorSource[]): Promise<{ success: boolean; error?: string; wsUrl: string }> {
    this.sources = sources;
    if (this._isRunning) {
      return this.start(sources);
    }
    this.emitState();
    return { success: true, wsUrl: ORCHESTRATOR_WS_URL };
  }

  /** Clear a stale engine squatting the WS port before we spawn. No-op if we already own a
   * child or the port is free. Killing the holder on the WS port frees its link ports too
   * (same process), so the new engine can bind everything. */
  private async reapStaleEngine(): Promise<void> {
    if (this.child) return;
    if (!(await isPortOpen(WS_PORT))) return;
    this.log('info', 'Clearing a stale engine still holding the port'); // i18n-exempt
    await killByTcpPort(WS_PORT);
    // Give the OS a moment to release the sockets before we rebind.
    for (let i = 0; i < 10 && (await isPortOpen(WS_PORT, 150)); i++) {
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  /** After an unexpected engine exit, restart it with backoff. Reset the crash counter once
   * the previous run was stable, so transient crashes always recover and only a tight
   * crash-loop (bad binary/args/port) trips the give-up guard. */
  private scheduleRestart(): void {
    if (this.intentionalStop) return;
    if (Date.now() - this.startedAt > OrchestratorProcessManager.STABLE_UPTIME_MS) {
      this.crashCount = 0;
    }
    this.crashCount++;
    if (this.crashCount > OrchestratorProcessManager.MAX_RAPID_CRASHES) {
      this.lastError = t('main:orchestrator.keepsCrashing');
      this.log('error', this.lastError);
      this.emitState();
      return;
    }
    const delay = Math.min(this.crashCount * 1000, 5000);
    this.log('info', `Engine crashed; restarting in ${delay}ms (attempt ${this.crashCount})`);
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (!this.intentionalStop && !this._isRunning) void this.start();
    }, delay);
  }

  stop(): void {
    this.intentionalStop = true;
    if (this.restartTimer) { clearTimeout(this.restartTimer); this.restartTimer = null; }
    this.crashCount = 0;
    const child = this.child;
    this.child = null;
    this._isRunning = false;
    if (child) {
      child.removeAllListeners('exit');
      try { child.kill('SIGTERM'); } catch { /* already gone */ }
      setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } }, 1500);
    }
    this.emitState();
  }

  private emitState(): void {
    this.send(IPC_CHANNELS.ORCHESTRATOR_STATE, this.getStatus());
  }

  private log(level: 'info' | 'error', message: string): void {
    if (!message) return;
    this.send(IPC_CHANNELS.ORCHESTRATOR_LOG, { level, message, ts: Date.now() });
  }

  private send(channel: string, payload: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, payload);
    }
  }
}

export const orchestratorProcess = new OrchestratorProcessManager();
