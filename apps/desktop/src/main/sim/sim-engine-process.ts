/**
 * Sim-Engine Process Manager
 *
 * Spawns and supervises the headless `ardudeck-sim-engine` binary, which binds
 * the SITL JSON FDM UDP port and runs ArduDeck's own 6DOF physics. Mirrors the
 * lifecycle shape of `ardupilot-sitl-process.ts`.
 *
 * The engine is a native Rust binary. In a packaged app it is bundled under
 * Resources/sim-engine via electron-builder extraResources; in dev/CI it is
 * staged at apps/desktop/sim-engine-bin, with a locally built cargo target as a
 * final fallback. No system Node is required.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import dgram from 'node:dgram';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { chmod } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export interface SimEngineStartOptions {
  /** UDP port for the JSON FDM backend (SITL connects here). Default 9002. */
  fdmPort?: number;
  /** WebSocket port the engine streams state on. Default 9020. */
  wsPort?: number;
  /** Vehicle dynamics model. Default 'copter'. */
  kind?: 'copter' | 'plane' | 'rover';
  /** Absolute path to a SITL custom-frame JSON to use for physics params. */
  framePath?: string;
  /** Home location, used for NED<->geo mapping in the engine. */
  home?: { lat: number; lng: number; alt: number; heading: number };
  /** Simulate battery sag (copter). Default true. */
  battery?: boolean;
  /** Inject IMU sensor noise. Default false. */
  noise?: boolean;
  /** Steady + turbulent wind as `n,e,d,intensity,tau`. Omit for calm. */
  wind?: string;
  /** Path to an obstacles JSON (array of authored obstacles, geographic).
   *  Projected to NED by the engine at load via `--home`. Omit for none. */
  obstaclesPath?: string;
  /** Path to a terrain heightfield JSON (geographic). Omit for flat ground. */
  terrainPath?: string;
  /** Path to a wind-profile JSON (shear + veer + gusts). Omit for uniform wind. */
  windProfilePath?: string;
}

const DEFAULT_FDM_PORT = 9002;
const DEFAULT_WS_PORT = 9020;

class SimEngineProcessManager {
  private process: ChildProcess | null = null;
  private _isRunning = false;
  private _wsPort: number | null = null;
  private _loggedBinaryPath = false;
  /** Last stderr line from the engine, surfaced in a startup failure. */
  private _lastStderr = '';

  get isRunning(): boolean {
    return this._isRunning;
  }

  get wsPort(): number | null {
    return this._wsPort;
  }

  /** Resolve the native engine binary, or null if it is not present. */
  private resolveBinary(): string | null {
    const exe = process.platform === 'win32' ? 'ardudeck-sim-engine.exe' : 'ardudeck-sim-engine';
    // Production: bundled under Resources/sim-engine (electron-builder extraResources).
    const packaged = path.join(process.resourcesPath, 'sim-engine', exe);
    if (existsSync(packaged)) return this.logResolved(packaged);
    // Dev/build: the CI staging dir at apps/desktop/sim-engine-bin. moduleDir is the
    // bundled out/main dir, so sim-engine-bin is two levels up (out/main -> out -> desktop).
    const staged = path.resolve(moduleDir, '../../sim-engine-bin', exe);
    if (existsSync(staged)) return this.logResolved(staged);
    // Dev fallback: a locally built cargo target (crate-local; no root workspace).
    const cargoTarget = path.resolve(moduleDir, '../../../../crates/ardudeck-sim-engine/target/release', exe);
    if (existsSync(cargoTarget)) return this.logResolved(cargoTarget);
    return null;
  }

  private logResolved(p: string): string {
    if (!this._loggedBinaryPath) {
      console.log('[sim-engine] resolved binary:', p);
      this._loggedBinaryPath = true;
    }
    return p;
  }

  /** True when the native engine binary can be located on this machine/build. */
  isBinaryAvailable(): boolean {
    return this.resolveBinary() !== null;
  }

  /**
   * Kill any stale `ardudeck-sim-engine` process bound to `fdmPort`. Matches by
   * process name so it never touches an unrelated process that happens to hold
   * the port. macOS/Linux only (uses lsof); a no-op on Windows.
   */
  private async reapOrphans(fdmPort: number): Promise<void> {
    if (process.platform === 'win32') return;
    try {
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const run = promisify(execFile);
      const { stdout } = await run('lsof', ['-ti', `UDP:${fdmPort}`]).catch(() => ({ stdout: '' }));
      const pids = stdout.split('\n').map((s) => s.trim()).filter(Boolean);
      let reaped = 0;
      for (const pid of pids) {
        const { stdout: cmd } = await run('ps', ['-o', 'command=', '-p', pid]).catch(() => ({ stdout: '' }));
        if (!cmd.includes('ardudeck-sim-engine')) continue;
        try { process.kill(Number(pid), 'SIGKILL'); reaped++; } catch { /* already gone */ }
      }
      if (reaped > 0) {
        console.log(`[sim-engine] reaped ${reaped} orphan engine(s) on UDP ${fdmPort}`);
        // Give the OS a moment to release the port before we bind it.
        await new Promise((r) => setTimeout(r, 200));
      }
    } catch { /* best effort */ }
  }

  async start(opts: SimEngineStartOptions): Promise<{ success: boolean; wsPort?: number; error?: string }> {
    if (this._isRunning) this.stop();

    const binary = this.resolveBinary();
    if (!binary) {
      return {
        success: false,
        error: 'ArduDeck physics engine binary not found. Rebuild or run scripts/fetch-sim-engine.mjs.',
      };
    }
    if (process.platform !== 'win32') {
      try { await chmod(binary, 0o755); } catch { /* best effort */ }
    }

    const fdmPort = opts.fdmPort ?? DEFAULT_FDM_PORT;
    const wsPort = opts.wsPort ?? DEFAULT_WS_PORT;

    const args: string[] = ['--fdm-port', String(fdmPort), '--ws-port', String(wsPort)];
    args.push('--kind', opts.kind ?? 'copter');
    if (opts.framePath) args.push('--frame', opts.framePath);
    if (opts.home) {
      args.push('--home', `${opts.home.lat},${opts.home.lng},${opts.home.alt},${opts.home.heading}`);
    }
    // Battery sag defaults on for copters; only meaningful with a frame file.
    if ((opts.battery ?? true) && (opts.kind ?? 'copter') === 'copter' && opts.framePath) {
      args.push('--battery');
    }
    if (opts.noise) args.push('--noise');
    if (opts.wind) args.push('--wind', opts.wind);
    // Environmental coupling inputs. Each is absent by default, keeping the
    // launch byte-identical to the calm/flat no-arg case.
    if (opts.obstaclesPath) args.push('--obstacles', opts.obstaclesPath);
    if (opts.terrainPath) args.push('--terrain', opts.terrainPath);
    if (opts.windProfilePath) args.push('--wind-profile', opts.windProfilePath);

    // Spawn, then confirm the engine actually binds the FDM port and replies with
    // real JSON BEFORE we let SITL launch against it. A blind delay is not enough:
    // reaping a stale engine frees the port a beat later, so a fresh spawn can lose
    // the bind race and exit, leaving SITL to spin on "No JSON sensor message". We
    // probe for a genuine reply and retry the whole spawn if it does not come.
    const MAX_ATTEMPTS = 3;
    let lastErr = '';
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      // Reap any orphaned engine still holding the FDM port (dev hot-reload, a
      // lost handle, or a previous crash). Kill only OUR binary, matched by name.
      await this.reapOrphans(fdmPort);
      if (attempt > 1) await new Promise((r) => setTimeout(r, 250)); // let the port free

      this._lastStderr = '';
      try {
        this.process = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (err) {
        lastErr = err instanceof Error ? err.message : 'spawn failed';
        continue;
      }
      this._isRunning = true;
      this._wsPort = wsPort;
      this.process.stdout?.on('data', (d: Buffer) => console.log('[sim-engine]', d.toString().trim()));
      this.process.stderr?.on('data', (d: Buffer) => {
        const line = d.toString().trim();
        if (line) this._lastStderr = line;
        console.error('[sim-engine]', line);
      });
      this.process.on('exit', () => {
        this._isRunning = false;
        this._wsPort = null;
        this.process = null;
      });
      this.process.on('error', (err) => {
        console.error('[sim-engine] process error:', err);
        this._lastStderr = err instanceof Error ? err.message : String(err);
        this._isRunning = false;
      });

      const ready = await this.probeReady(fdmPort, 3000);
      if (ready && this._isRunning) {
        return { success: true, wsPort };
      }

      // Not ready: the engine either exited (bind race, bad arg, crash) or never
      // replied. Record why, tear it down, and try again.
      lastErr =
        this._lastStderr ||
        (this._isRunning ? 'engine bound but did not reply on the FDM port' : 'engine exited on startup');
      this.stop();
      await new Promise((r) => setTimeout(r, 150));
    }

    this._isRunning = false;
    this._wsPort = null;
    return { success: false, error: `sim-engine did not become ready: ${lastErr}` };
  }

  /**
   * Probe the FDM port for a live engine: send SIM_JSON servo packets and resolve
   * true on the first JSON reply, or false after `timeoutMs`. This is exactly the
   * handshake SITL does, so a success guarantees SITL will get its sensor feed.
   */
  private probeReady(fdmPort: number, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const sock = dgram.createSocket('udp4');
      let done = false;
      // A minimal SIM_JSON servo packet: magic(18458) + frame_rate + frame_count
      // + 16 PWM channels at idle. The engine replies with a JSON state line.
      const pkt = Buffer.alloc(40);
      pkt.writeUInt16LE(18458, 0);
      pkt.writeUInt16LE(400, 2);
      pkt.writeUInt32LE(1, 4);
      for (let i = 0; i < 16; i++) pkt.writeUInt16LE(1000, 8 + i * 2);

      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        clearInterval(poll);
        clearTimeout(deadline);
        try {
          sock.close();
        } catch {
          /* already closed */
        }
        resolve(ok);
      };

      sock.on('message', () => finish(true));
      sock.on('error', () => {
        /* ignore; the deadline handles a persistently unreachable port */
      });
      const poll = setInterval(() => {
        // Stop early if the process has already died; the deadline still resolves.
        if (!this._isRunning) {
          finish(false);
          return;
        }
        try {
          sock.send(pkt, fdmPort, '127.0.0.1');
        } catch {
          /* transient send failure; retried on the next tick */
        }
      }, 50);
      const deadline = setTimeout(() => finish(false), timeoutMs);
    });
  }

  stop(): void {
    if (this.process) {
      try {
        this.process.kill('SIGTERM');
        const proc = this.process;
        setTimeout(() => { try { proc.kill('SIGKILL'); } catch { /* dead */ } }, 1500);
      } catch (err) {
        console.error('[sim-engine] failed to kill:', err);
      }
      this.process = null;
      this._isRunning = false;
      this._wsPort = null;
    }
  }
}

export const simEngineProcess = new SimEngineProcessManager();
