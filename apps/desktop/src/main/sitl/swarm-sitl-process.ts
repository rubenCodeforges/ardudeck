/**
 * ArduPilot Swarm SITL Process Manager
 *
 * Spawns N independent ArduPilot SITL processes that together form a fleet.
 * Each instance uses ArduPilot's `-I<instance>` flag, which offsets every
 * simulator/MAVLink port by 10*index — so instance i exposes its MAVLink TCP
 * server on 5760 + 10*i and its internal RC/FDM ports never collide. Each
 * instance also gets:
 *   - its own working directory (EEPROM + logs isolated per vehicle),
 *   - a unique SYSID_THISMAV (so the vehicles are distinct on the link),
 *   - a home location offset from the base by the chosen formation.
 *
 * Vehicles reach the desktop as plain TCP links: once an instance's port is
 * accepting connections this manager pushes a `ready` event, and the renderer
 * adds a background TCP transport for it. The existing multi-vehicle registry
 * then surfaces all instances as a fleet with no further wiring.
 */

import { spawn, ChildProcess } from 'node:child_process';
import { app, BrowserWindow } from 'electron';
import { chmod, mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import type {
  SwarmSitlConfig,
  SwarmSitlStatus,
  SwarmInstanceStatus,
  SwarmInstanceState,
  ArduPilotVehicleType,
} from '../../shared/ipc-channels.js';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';
import { ardupilotSitlDownloader } from './ardupilot-sitl-downloader.js';
import { generateDefaultParams } from './ardupilot-sitl-process.js';
import { resolveDefaultsFile } from './frame-config.js';

const BASE_TCP_PORT = 5760;
/** ArduPilot shifts all instance ports by this many per `-I` step. */
const INSTANCE_PORT_STRIDE = 10;
const MAX_INSTANCES = 20;
/** Earth radius constants for the small-offset lat/lng conversion. */
const METERS_PER_DEG_LAT = 111_320;

const DEFAULT_MODELS: Record<ArduPilotVehicleType, string> = {
  copter: 'quad',
  plane: 'plane',
  rover: 'rover',
  sub: 'vectored',
};

interface Instance {
  index: number;
  sysid: number;
  tcpPort: number;
  home: { lat: number; lng: number; alt: number; heading: number };
  state: SwarmInstanceState;
  process: ChildProcess | null;
  pid?: number;
  error?: string;
}

/**
 * Spread `count` spawn points around a base home per the chosen formation.
 * Returns home objects (lat/lng/alt/heading) for each instance index.
 */
function computeHomes(config: SwarmSitlConfig): Array<{ lat: number; lng: number; alt: number; heading: number }> {
  const { count, spacingM, formation, homeLocation: base } = config;
  const latRad = (base.lat * Math.PI) / 180;
  const metersPerDegLng = METERS_PER_DEG_LAT * Math.max(Math.cos(latRad), 1e-6);

  const offsets: Array<{ east: number; north: number }> = [];
  if (formation === 'line') {
    for (let i = 0; i < count; i++) {
      offsets.push({ east: (i - (count - 1) / 2) * spacingM, north: 0 });
    }
  } else if (formation === 'circle') {
    // Radius chosen so neighbouring points sit ~spacingM apart along the ring.
    const radius = count > 1 ? (spacingM * count) / (2 * Math.PI) : 0;
    for (let i = 0; i < count; i++) {
      const angle = (2 * Math.PI * i) / count;
      offsets.push({ east: radius * Math.cos(angle), north: radius * Math.sin(angle) });
    }
  } else {
    // grid: roughly-square lattice, centred on the base home.
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);
    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      offsets.push({
        east: (col - (cols - 1) / 2) * spacingM,
        north: (row - (rows - 1) / 2) * spacingM,
      });
    }
  }

  return offsets.map(({ east, north }) => ({
    lat: base.lat + north / METERS_PER_DEG_LAT,
    lng: base.lng + east / metersPerDegLng,
    alt: base.alt,
    heading: base.heading,
  }));
}

/**
 * Readiness is detected from the SITL's own stdout ("SERIAL0 on TCP port …")
 * instead of probing the TCP port. Probing (connect then immediately destroy)
 * kills the Windows Cygwin SITL build: it treats a SERIAL0 client disconnect
 * as a reason to exit cleanly (code 0), so a successful probe deleted the
 * instance it was probing. The stdout announcement is emitted before the
 * server accepts connections, and the engine's tcpout sources retry until the
 * port is actually open, so announcing on stdout costs nothing.
 */
function watchStdoutReady(inst: Instance, child: ChildProcess, onReady: () => void, timeoutMs: number): void {
  const timer = setTimeout(() => {
    if (inst.state === 'spawning') {
      inst.state = 'error';
      inst.error = 'SITL did not announce its MAVLink port in time';
      onReady(); // flush state
    }
  }, timeoutMs);
  const onData = (d: Buffer) => {
    if (d.toString().includes('SERIAL0 on TCP port')) {
      clearTimeout(timer);
      child.stdout?.off('data', onData);
      if (inst.state === 'spawning') {
        inst.state = 'ready';
        onReady(); // flush state
      }
    }
  };
  child.stdout?.on('data', onData);
}

class SwarmSitlProcessManager {
  private instances: Instance[] = [];
  private mainWindow: BrowserWindow | null = null;
  private _isRunning = false;

  get isRunning(): boolean {
    return this._isRunning;
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  /**
   * Build the args for one instance. Mirrors the single-SITL launch but adds
   * `-I<index>` (the port/instance offset) and points serial0 at the offset
   * TCP port. The defaults file carries the per-instance SYSID.
   */
  private buildArgs(
    config: SwarmSitlConfig,
    index: number,
    model: string,
    home: { lat: number; lng: number; alt: number; heading: number },
    defaultsArg: string | null,
    wipe: boolean,
  ): string[] {
    const args: string[] = [];
    args.push(`-M${model}`);
    args.push(`-O${home.lat},${home.lng},${home.alt},${home.heading}`);
    args.push(`-I${index}`);
    // serial0 → TCP server; with -I the actual port is BASE + index*STRIDE.
    args.push('--serial0', 'tcp:0');
    const speedup = config.speedup && config.speedup > 1 ? config.speedup : 1;
    args.push(`-s${speedup}`);
    if (wipe) args.push('--wipe');
    if (defaultsArg) args.push('--defaults', defaultsArg);
    return args;
  }

  /**
   * Compose the per-instance `--defaults` argument: upstream frame defaults
   * (shared across instances) stacked first, then our overlay carrying the
   * standard SITL calmness params plus this instance's SYSID and failsafe
   * relaxations so it can be armed over MAVLink without a live RC sender.
   */
  private async writeInstanceDefaults(
    config: SwarmSitlConfig,
    model: string,
    sysid: number,
    upstreamPath: string | null,
    instanceDir: string,
  ): Promise<string | null> {
    const overlayLines = generateDefaultParams(config.vehicleType, model);
    const extra: string[] = [
      // Distinct MAVLink system id per vehicle. ArduPilot renamed
      // SYSID_THISMAV -> MAV_SYSID in 4.6; write BOTH so old and new firmware
      // each pick up the one they recognise (the other is an unknown param and
      // is ignored). Without this every instance reports as "SYS 1".
      `MAV_SYSID ${sysid}`,
      `SYSID_THISMAV ${sysid}`,
      // A wiped copter defaults BATT_MONITOR=0 (no battery telemetry -> 0.0V in
      // the GCS). Enable the analog monitor so the simulated battery
      // (SIM_BATT_* from the overlay) is actually reported. Harmless on frames
      // that already set it.
      'BATT_MONITOR 4',
      // No live RC sender per instance — let the swarm arm over MAVLink in
      // GUIDED/AUTO without tripping RC/GCS failsafes. (Plane failsafe lines
      // are already in the overlay; these cover copter and the GCS link.)
      'FS_THR_ENABLE 0',
      'FS_GCS_ENABLE 0',
      // NOTE: telemetry streaming is NOT configured here. ArduPilot master ignores
      // the SRx_* stream-rate params on a TCP link, so the GCS must actively request
      // streams - which it now does per vehicle on discovery (requestStreamsOnTransport
      // in ipc-handlers.ts). That path also fixes real multi-vehicle hardware.
    ];
    const overlay = `${overlayLines}\n${extra.join('\n')}\n`;
    const overlayPath = path.join(instanceDir, 'swarm-defaults.parm');
    try {
      await writeFile(overlayPath, overlay, 'utf-8');
    } catch {
      return upstreamPath;
    }
    return upstreamPath ? `${upstreamPath},${overlayPath}` : overlayPath;
  }

  async start(config: SwarmSitlConfig): Promise<{ success: boolean; error?: string; instances?: SwarmInstanceStatus[] }> {
    if (this._isRunning) {
      this.stop();
    }

    const count = Math.max(2, Math.min(MAX_INSTANCES, Math.floor(config.count)));
    const model = config.model || DEFAULT_MODELS[config.vehicleType];

    const binaryPath = ardupilotSitlDownloader.getBinaryPath(config.vehicleType, config.releaseTrack);
    try {
      await access(binaryPath);
    } catch {
      return { success: false, error: `SITL binary not found at ${binaryPath}. Download it on the SITL tab first.` };
    }
    if (process.platform !== 'win32') {
      try { await chmod(binaryPath, 0o755); } catch { /* best effort */ }
    }

    // Upstream frame defaults are identical for every instance; resolve once.
    let upstreamPath: string | null = null;
    try {
      upstreamPath = await resolveDefaultsFile(config.vehicleType, model);
    } catch {
      upstreamPath = null;
    }

    const homes = computeHomes({ ...config, count });
    const swarmRoot = path.join(app.getPath('userData'), 'ardupilot-sitl', 'swarm');

    this.instances = [];
    this._isRunning = true;

    const env = { ...process.env };
    if (process.platform === 'win32') {
      const cygwinPath = path.join(app.getPath('userData'), 'ardupilot-sitl', 'cygwin');
      env.PATH = `${cygwinPath};${env.PATH}`;
    }

    for (let i = 0; i < count; i++) {
      const sysid = i + 1;
      const tcpPort = BASE_TCP_PORT + i * INSTANCE_PORT_STRIDE;
      const home = homes[i] ?? config.homeLocation;
      const instanceDir = path.join(swarmRoot, `i${i}`);

      const inst: Instance = {
        index: i, sysid, tcpPort, home, state: 'spawning', process: null,
      };
      this.instances.push(inst);

      try {
        await mkdir(instanceDir, { recursive: true });
        const defaultsArg = await this.writeInstanceDefaults(config, model, sysid, upstreamPath, instanceDir);
        // Always wipe swarm instances: SYSID_THISMAV (and the rest of our
        // overlay) is only guaranteed to apply from --defaults on a fresh
        // EEPROM. Without the wipe a previously-stored SYSID_THISMAV=1 sticks
        // and every vehicle shows up as "SYS 1". These are disposable sim
        // vehicles, so a clean boot every launch is the right default.
        const args = this.buildArgs(config, i, model, home, defaultsArg, true);

        const child = spawn(binaryPath, args, {
          cwd: instanceDir,
          env,
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: process.platform === 'win32',
        });
        inst.process = child;
        inst.pid = child.pid;

        child.stdout?.on('data', (d: Buffer) => this.emitLog(inst, d.toString(), false));
        child.stderr?.on('data', (d: Buffer) => this.emitLog(inst, d.toString(), true));
        child.on('error', (err: Error) => {
          inst.state = 'error';
          inst.error = err.message;
          this.emitInstance(inst);
          this.emitState();
        });
        child.on('exit', () => {
          inst.process = null;
          inst.state = 'exited';
          this.emitInstance(inst);
          this.emitState();
        });

        this.emitInstance(inst);

        // Detect readiness from stdout (see watchStdoutReady) — never probe
        // the TCP port, a probe's instant disconnect kills the Cygwin SITL.
        watchStdoutReady(inst, child, () => {
          this.emitInstance(inst);
          this.emitState();
        }, 20_000);
      } catch (err) {
        inst.state = 'error';
        inst.error = err instanceof Error ? err.message : 'spawn failed';
        this.emitInstance(inst);
      }

      // Stagger spawns so N binaries don't all hit the CPU on the same tick.
      if (i < count - 1) {
        await new Promise<void>((r) => setTimeout(r, 700));
      }
    }

    this.emitState();
    return { success: true, instances: this.snapshot() };
  }

  stop(): void {
    for (const inst of this.instances) {
      const proc = inst.process;
      if (!proc) continue;
      try {
        proc.kill('SIGTERM');
        setTimeout(() => { try { proc.kill('SIGKILL'); } catch { /* gone */ } }, 2000);
      } catch { /* ignore */ }
      inst.process = null;
    }
    this.instances = [];
    this._isRunning = false;
    this.emitState();
  }

  getStatus(): SwarmSitlStatus {
    return { isRunning: this._isRunning, instances: this.snapshot() };
  }

  private snapshot(): SwarmInstanceStatus[] {
    return this.instances.map((i) => ({
      index: i.index,
      sysid: i.sysid,
      tcpPort: i.tcpPort,
      home: i.home,
      state: i.state,
      pid: i.pid,
      error: i.error,
    }));
  }

  private emitInstance(inst: Instance): void {
    this.send(IPC_CHANNELS.SWARM_SITL_INSTANCE, {
      index: inst.index,
      sysid: inst.sysid,
      tcpPort: inst.tcpPort,
      home: inst.home,
      state: inst.state,
      pid: inst.pid,
      error: inst.error,
    } satisfies SwarmInstanceStatus);
  }

  private emitState(): void {
    this.send(IPC_CHANNELS.SWARM_SITL_STATE, this.getStatus());
  }

  private emitLog(inst: Instance, text: string, isError: boolean): void {
    for (const raw of text.split('\n')) {
      const line = raw.trimEnd();
      if (!line) continue;
      this.send(IPC_CHANNELS.SWARM_SITL_LOG, {
        index: inst.index, sysid: inst.sysid, isError, line,
      });
    }
  }

  private send(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }
}

export const swarmSitlProcess = new SwarmSitlProcessManager();
