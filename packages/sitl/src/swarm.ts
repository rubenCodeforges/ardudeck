import { spawn, type ChildProcess } from 'node:child_process';
import { chmod, mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { waitForSerial0Announce } from './readiness.js';
import { killProcessTree, reapSitlOnPort } from './process-os.js';

/** ArduPilot shifts every instance port by this much per `-I` step. */
const INSTANCE_PORT_STRIDE = 10;
const BASE_TCP_PORT = 5760;
const METERS_PER_DEG_LAT = 111_320;
/** Spawning all binaries on the same tick stalls a small CPU. */
const SPAWN_STAGGER_MS = 700;
const READY_TIMEOUT_MS = 20_000;

export const MIN_SWARM_SIZE = 2;
export const MAX_SWARM_SIZE = 20;

export type SwarmFormation = 'grid' | 'line' | 'circle';
export type SwarmInstanceState = 'spawning' | 'ready' | 'exited' | 'error';

export interface SwarmHome {
  lat: number;
  lng: number;
  alt: number;
  heading: number;
}

export interface SwarmLayout {
  count: number;
  /** Nominal distance between neighbouring spawn points, metres. */
  spacingM: number;
  formation: SwarmFormation;
  /** Centre of the formation. */
  home: SwarmHome;
}

export interface SwarmLaunch extends SwarmLayout {
  binaryPath: string;
  /** Each instance keeps its EEPROM and logs in `<workDir>/i<index>`. */
  workDir: string;
  /** SITL physics model passed as `-M`, e.g. `quad`. */
  model: string;
  speedup?: number;
  /** Frame and simulation defaults, usually from `generateDefaultParams`. */
  baseParams: string;
  /** Upstream ArduPilot defaults file stacked beneath ours, if available. */
  upstreamDefaultsPath?: string | null;
  env?: NodeJS.ProcessEnv;
}

export interface SwarmInstanceStatus {
  index: number;
  sysid: number;
  tcpPort: number;
  home: SwarmHome;
  state: SwarmInstanceState;
  pid?: number;
  error?: string;
}

export interface SwarmEvents {
  onInstance?(status: SwarmInstanceStatus): void;
  onLog?(index: number, sysid: number, line: string, isError: boolean): void;
  onState?(isRunning: boolean): void;
}

interface Instance extends SwarmInstanceStatus {
  process: ChildProcess | null;
}

export function swarmTcpPort(index: number): number {
  return BASE_TCP_PORT + index * INSTANCE_PORT_STRIDE;
}

export function clampSwarmSize(count: number): number {
  return Math.max(MIN_SWARM_SIZE, Math.min(MAX_SWARM_SIZE, Math.floor(count)));
}

/** Spread `count` spawn points around the formation centre. */
export function layoutSwarmHomes(layout: SwarmLayout): SwarmHome[] {
  const { count, spacingM, formation, home } = layout;
  const metersPerDegLng = METERS_PER_DEG_LAT * Math.max(Math.cos((home.lat * Math.PI) / 180), 1e-6);
  return formationOffsets(formation, count, spacingM).map(({ east, north }) => ({
    lat: home.lat + north / METERS_PER_DEG_LAT,
    lng: home.lng + east / metersPerDegLng,
    alt: home.alt,
    heading: home.heading,
  }));
}

function formationOffsets(formation: SwarmFormation, count: number, spacingM: number): Array<{ east: number; north: number }> {
  if (formation === 'line') {
    return Array.from({ length: count }, (_, i) => ({ east: (i - (count - 1) / 2) * spacingM, north: 0 }));
  }
  if (formation === 'circle') {
    // Neighbours sit about spacingM apart along the ring.
    const radius = count > 1 ? (spacingM * count) / (2 * Math.PI) : 0;
    return Array.from({ length: count }, (_, i) => {
      const angle = (2 * Math.PI * i) / count;
      return { east: radius * Math.cos(angle), north: radius * Math.sin(angle) };
    });
  }
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  return Array.from({ length: count }, (_, i) => ({
    east: ((i % cols) - (cols - 1) / 2) * spacingM,
    north: (Math.floor(i / cols) - (rows - 1) / 2) * spacingM,
  }));
}

/** Per-instance overrides stacked on the frame defaults. */
export function swarmInstanceParams(sysid: number): string[] {
  return [
    // ArduPilot 4.6 renamed SYSID_THISMAV to MAV_SYSID; each firmware ignores the one it does not know.
    `MAV_SYSID ${sysid}`,
    `SYSID_THISMAV ${sysid}`,
    // A wiped copter has no battery monitor, which reads as 0 V in every GCS.
    'BATT_MONITOR 4',
    // No RC sender per instance: the swarm must arm and fly over MAVLink without tripping failsafes.
    'FS_THR_ENABLE 0',
    'FS_GCS_ENABLE 0',
  ];
}

export function swarmInstanceArgs(launch: SwarmLaunch, index: number, home: SwarmHome, defaultsArg: string): string[] {
  const speedup = launch.speedup && launch.speedup > 1 ? launch.speedup : 1;
  return [
    `-M${launch.model}`,
    `-O${home.lat},${home.lng},${home.alt},${home.heading}`,
    `-I${index}`,
    '--serial0', 'tcp:0',
    `-s${speedup}`,
    // SYSID only applies from --defaults on a fresh EEPROM; without the wipe every vehicle reports as SYS 1.
    '--wipe',
    '--defaults', defaultsArg,
  ];
}

/** Runs N ArduPilot SITL instances, each on its own TCP port and sysid. */
export class SwarmSitl {
  private instances: Instance[] = [];
  private running = false;

  constructor(private readonly events: SwarmEvents = {}) {}

  get isRunning(): boolean {
    return this.running;
  }

  snapshot(): SwarmInstanceStatus[] {
    return this.instances.map(({ process: _process, ...status }) => ({ ...status }));
  }

  async start(launch: SwarmLaunch): Promise<SwarmInstanceStatus[]> {
    if (this.running) this.stop();
    await access(launch.binaryPath);
    if (process.platform !== 'win32') await chmod(launch.binaryPath, 0o755).catch(() => undefined);

    const count = clampSwarmSize(launch.count);
    const homes = layoutSwarmHomes({ ...launch, count });
    this.instances = [];
    this.setRunning(true);

    for (let index = 0; index < count; index++) {
      await this.spawnInstance(launch, index, homes[index] ?? launch.home);
      if (index < count - 1) await new Promise<void>((r) => setTimeout(r, SPAWN_STAGGER_MS));
    }
    this.events.onState?.(this.running);
    return this.snapshot();
  }

  stop(): void {
    for (const inst of this.instances) {
      if (inst.process) killProcessTree(inst.process);
      inst.process = null;
    }
    this.instances = [];
    this.setRunning(false);
  }

  private async spawnInstance(launch: SwarmLaunch, index: number, home: SwarmHome): Promise<void> {
    const inst: Instance = { index, sysid: index + 1, tcpPort: swarmTcpPort(index), home, state: 'spawning', process: null };
    this.instances.push(inst);
    try {
      const dir = path.join(launch.workDir, `i${index}`);
      await mkdir(dir, { recursive: true });
      const defaultsArg = await this.writeDefaults(launch, inst.sysid, dir);
      await reapSitlOnPort(inst.tcpPort);
      const child = spawn(launch.binaryPath, swarmInstanceArgs(launch, index, home, defaultsArg), {
        cwd: dir,
        env: launch.env ?? process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      inst.process = child;
      inst.pid = child.pid;
      this.watch(inst, child);
    } catch (err) {
      this.update(inst, 'error', err instanceof Error ? err.message : 'spawn failed');
    }
    this.events.onInstance?.(this.status(inst));
  }

  private async writeDefaults(launch: SwarmLaunch, sysid: number, dir: string): Promise<string> {
    const overlayPath = path.join(dir, 'swarm-defaults.parm');
    await writeFile(overlayPath, `${launch.baseParams}\n${swarmInstanceParams(sysid).join('\n')}\n`, 'utf-8');
    return launch.upstreamDefaultsPath ? `${launch.upstreamDefaultsPath},${overlayPath}` : overlayPath;
  }

  private watch(inst: Instance, child: ChildProcess): void {
    child.stdout?.on('data', (d: Buffer) => this.log(inst, d.toString(), false));
    child.stderr?.on('data', (d: Buffer) => this.log(inst, d.toString(), true));
    child.on('error', (err) => this.update(inst, 'error', err.message));
    child.on('exit', () => {
      inst.process = null;
      this.update(inst, 'exited');
    });
    void waitForSerial0Announce([child.stdout, child.stderr], READY_TIMEOUT_MS).then((ready) => {
      if (inst.state !== 'spawning') return;
      if (ready) this.update(inst, 'ready');
      else this.update(inst, 'error', 'SITL did not report its MAVLink port in time');
    });
  }

  private update(inst: Instance, state: SwarmInstanceState, error?: string): void {
    inst.state = state;
    if (error) inst.error = error;
    this.events.onInstance?.(this.status(inst));
    this.events.onState?.(this.running);
  }

  private log(inst: Instance, text: string, isError: boolean): void {
    for (const raw of text.split('\n')) {
      const line = raw.trimEnd();
      if (line) this.events.onLog?.(inst.index, inst.sysid, line, isError);
    }
  }

  private status(inst: Instance): SwarmInstanceStatus {
    const { process: _process, ...status } = inst;
    return { ...status };
  }

  private setRunning(running: boolean): void {
    this.running = running;
    this.events.onState?.(running);
  }
}
