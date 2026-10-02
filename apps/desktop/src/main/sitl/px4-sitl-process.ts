/**
 * PX4 SITL Process Manager
 *
 * Mirrors ArduPilotSitlProcessManager, but for PX4 SITL. The big structural
 * difference is that PX4 does NOT carry a built-in flight dynamics model: it
 * talks to an EXTERNAL physics simulator (jMAVSim by default) over TCP 4560.
 * So a launch is up to TWO child processes: the physics sim first, then the
 * px4 binary that connects to it. Both are tracked and torn down together.
 *
 * The GCS attaches over UDP 14550 (PX4 SITL's default offboard MAVLink port),
 * not a TCP server like ArduPilot's 5760.
 */

import { spawn, ChildProcess } from 'node:child_process';
import { BrowserWindow } from 'electron';
import { chmod, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import type {
  Px4SitlConfig,
  Px4SitlStatus,
  Px4VehicleType,
  Px4ReleaseTrack,
} from '../../shared/ipc-channels.js';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';
import { px4SitlBundleDir, px4PathHasSpace } from './px4-paths.js';
import { t } from '../../shared/i18n/index.js';

/**
 * PX4_SIM_MODEL for each airframe class. We use PX4's built-in SIH
 * (Simulation-In-Hardware) airframes, verified present in the bundle
 * (10040_sihsim_quadx / 10041_sihsim_airplane / 10042_sihsim_xvert), so no
 * external simulator is needed. A wrong name aborts px4 on boot with "Unknown
 * model". NOTE: SIH has no rover model in this PX4 version, so rover falls back
 * to the quad SIH to keep the link up; true PX4 rover SITL needs Gazebo, which
 * we do not bundle.
 */
const DEFAULT_MODELS: Record<Px4VehicleType, string> = {
  copter: 'sihsim_quadx',
  plane: 'sihsim_airplane',
  vtol: 'sihsim_xvert',
  rover: 'sihsim_quadx',
};

/** GCS-facing MAVLink UDP port PX4 SITL offers by default. */
const PX4_GCS_UDP_PORT = 14550;

/** TCP port PX4 and the external physics sim rendezvous on. */
const PX4_SIM_TCP_PORT = 4560;

class Px4SitlProcessManager {
  private process: ChildProcess | null = null;
  /**
   * The external physics simulator (jMAVSim) child, when the backend needs
   * one. Tracked separately so stop() reaps it alongside the px4 binary; a
   * leaked jMAVSim keeps TCP 4560 bound and the next launch cannot connect.
   */
  private simProcess: ChildProcess | null = null;
  private _isRunning = false;
  private mainWindow: BrowserWindow | null = null;
  private _currentConfig: Px4SitlConfig | null = null;
  /**
   * True only while restart() is deliberately killing PX4 to respawn it. The
   * exit event carries this so the renderer can tell an intentional restart
   * from a crash; every other death leaves it false.
   */
  private _relaunching = false;

  get isRunning(): boolean {
    return this._isRunning;
  }

  get currentConfig(): Px4SitlConfig | null {
    return this._currentConfig;
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  /** Root of the downloaded bundle for a track (see px4-paths.ts). */
  getBundleDir(releaseTrack: Px4ReleaseTrack): string {
    return px4SitlBundleDir(releaseTrack);
  }

  /** Path to the `px4` executable inside the bundle: `<bundle>/bin/px4`. */
  getBinaryPath(releaseTrack: Px4ReleaseTrack): string {
    return path.join(this.getBundleDir(releaseTrack), 'bin', 'px4');
  }

  /**
   * Resolve the PX4_SIM_MODEL to launch. An explicit config.model wins
   * verbatim (the renderer may pass a stock name we do not enumerate here),
   * otherwise it derives from the airframe class.
   */
  private simModelFor(config: Px4SitlConfig): string {
    return config.model || DEFAULT_MODELS[config.vehicleType];
  }

  /**
   * Delete PX4's persisted SITL state so the next boot starts from defaults.
   *
   * px4 does NOT keep that state in `rootfs/` itself: it creates a per-airframe
   * working dir `rootfs/sitl_<PX4_SIM_MODEL>/` and writes parameters.bson,
   * parameters_backup.bson, dataman, eeprom/ and log/ in THERE. Dropping those
   * dirs wholesale is the wipe; px4 recreates them (and their etc/test_data
   * symlinks) on the next boot. The loose top-level sweep stays for bundles
   * that ran under an older launcher which used rootfs/ directly.
   *
   * Best-effort and fully defensive: a wipe that fails must not block launch.
   */
  private async wipeState(bundleDir: string): Promise<void> {
    const rootfs = path.join(bundleDir, 'rootfs');
    const entries = await readdir(rootfs).catch(() => [] as string[]);
    try {
      await Promise.all(
        entries
          .filter((name) => name.startsWith('sitl_'))
          .map((name) => rm(path.join(rootfs, name), { recursive: true, force: true }).catch(() => {})),
      );
    } catch (err) {
      console.warn('[px4-sitl] could not remove per-airframe working dirs:', err);
    }
    try {
      await rm(path.join(rootfs, 'eeprom'), { recursive: true, force: true });
    } catch (err) {
      console.warn('[px4-sitl] could not remove eeprom dir:', err);
    }
    try {
      await Promise.all(
        entries
          .filter((name) => name.endsWith('.bson') || name.startsWith('parameters'))
          .map((name) => rm(path.join(rootfs, name), { force: true }).catch(() => {})),
      );
    } catch (err) {
      console.warn('[px4-sitl] could not sweep param files:', err);
    }
  }

  /**
   * Spawn the external physics simulator for the chosen backend, when one is
   * needed. Returns the command string it launched (for logging), or null when
   * the backend spawns nothing extra here ('gz' and 'none'). Throws on a
   * genuine spawn failure so start() can surface it.
   */
  private spawnPhysicsSim(config: Px4SitlConfig, bundleDir: string): string | null {
    const backend = config.simulator ?? 'jmavsim';

    if (backend === 'none') {
      // No external dynamics. px4 still boots and offers the MAVLink link, so
      // this is useful to smoke-test the GCS connection, but the vehicle has
      // no physics and will not respond to arming/flight. px4 may block briefly
      // waiting for a sim that never connects; that is acceptable here.
      return null;
    }

    if (backend === 'gz') {
      // Gazebo (gz) needs a separately installed Gazebo Sim on the host plus a
      // world/model set we do not bundle. Wiring that up is a TODO; for now we
      // spawn nothing and let px4 launch on its own so the failure mode is a
      // visible "waiting for simulator" rather than a broken child spawn.
      console.warn('[px4-sitl] gz backend requires a separate Gazebo install; launching px4 without a bundled sim.');
      return null;
    }

    // jmavsim (default): our bundle ships jmavsim_run.jar under jmavsim/.
    // -Djava.ext.dirs= clears any host extension dirs that would otherwise
    // shadow the jar's bundled classes. -q quiet, -r 250 the sim rate,
    // -lockstep pairs each PX4 step with a sim step for deterministic timing,
    // -tcp binds the rendezvous socket PX4 dials into.
    const jmavsimDir = path.join(bundleDir, 'jmavsim');
    const jarPath = path.join(jmavsimDir, 'jmavsim_run.jar');
    const simArgs = [
      '-Djava.ext.dirs=',
      '-jar', jarPath,
      '-q',
      '-r', '250',
      '-lockstep',
      '-tcp', `127.0.0.1:${PX4_SIM_TCP_PORT}`,
    ];
    const simCmd = `java ${simArgs.join(' ')}`;

    const sim = spawn('java', simArgs, {
      cwd: jmavsimDir,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.simProcess = sim;

    sim.stdout?.on('data', (data: Buffer) => {
      this.sendToRenderer(IPC_CHANNELS.PX4_SITL_STDOUT, data.toString());
    });
    sim.stderr?.on('data', (data: Buffer) => {
      this.sendToRenderer(IPC_CHANNELS.PX4_SITL_STDERR, data.toString());
    });
    sim.on('error', (error: Error) => {
      console.error('[px4-sitl] jMAVSim process error:', error);
      this.sendToRenderer(IPC_CHANNELS.PX4_SITL_ERROR, `jMAVSim: ${error.message}`);
    });
    sim.on('exit', () => {
      // Only clear the pointer if this is still the tracked sim; a restart may
      // have replaced it with a successor already.
      if (this.simProcess === sim) this.simProcess = null;
    });

    return simCmd;
  }

  /**
   * Insert the PX4_HOME_* -> SIH_LOC_* mapping into the bundle's rcS,
   * once (marker-guarded), right before `dataman start` so it runs after the
   * airframe file but before any module reads the params. SIH_LOC_LAT0/LON0
   * are int32 in 1e-7 degrees; SIH_LOC_H0 is ground altitude in meters.
   * rcS is executed by /bin/sh with px4 module shims on PATH, so plain shell
   * plus awk is available.
   */
  private async ensureSihHomeInRcs(bundleDir: string): Promise<void> {
    const marker = '# ArduDeck: SIH home from PX4_HOME_*';
    const rcsPath = path.join(bundleDir, 'etc', 'init.d-posix', 'rcS');
    try {
      const { readFile, writeFile } = await import('node:fs/promises');
      const rcs = await readFile(rcsPath, 'utf8');
      if (rcs.includes(marker)) return;
      const anchor = '\ndataman start';
      if (!rcs.includes(anchor)) {
        console.warn('[px4-sitl] rcS has no "dataman start" anchor; SIH home patch skipped');
        return;
      }
      const block = [
        '',
        marker,
        'if [ -n "${PX4_HOME_LAT:-}" ]; then',
        '\tparam set SIH_LOC_LAT0 $(awk "BEGIN {printf \\"%.0f\\", ${PX4_HOME_LAT}*10000000}")',
        'fi',
        'if [ -n "${PX4_HOME_LON:-}" ]; then',
        '\tparam set SIH_LOC_LON0 $(awk "BEGIN {printf \\"%.0f\\", ${PX4_HOME_LON}*10000000}")',
        'fi',
        'if [ -n "${PX4_HOME_ALT:-}" ]; then',
        '\tparam set SIH_LOC_H0 ${PX4_HOME_ALT}',
        'fi',
        '',
      ].join('\n');
      await writeFile(rcsPath, rcs.replace(anchor, `${block}\ndataman start`));
      console.log('[px4-sitl] patched rcS with SIH home-position mapping');
    } catch (err) {
      // Non-fatal: the sim still runs, just at the SIH default location.
      console.warn('[px4-sitl] could not patch rcS for SIH home:', err);
    }

    // Upstream bug (present at least in v1.15.x): px4-rc.simulator maps
    // PX4_HOME_LAT/LON into SIH_LOC_LAT0/LON0 with RAW DEGREES, but those
    // params are Int32 in deg*1e7 — 42.44 becomes 42, i.e. 4.2e-6 degrees,
    // which is (0,0) in the Atlantic. It also runs AFTER our rcS block, so
    // its unscaled write wins. Rescale it in place.
    const simRcPath = path.join(bundleDir, 'etc', 'init.d-posix', 'px4-rc.simulator');
    try {
      const { readFile, writeFile } = await import('node:fs/promises');
      const rc = await readFile(simRcPath, 'utf8');
      if (rc.includes('SIH_LOC_LAT0 $(awk')) return; // already fixed
      const rawLat = 'param set SIH_LOC_LAT0 ${PX4_HOME_LAT}';
      const rawLon = 'param set SIH_LOC_LON0 ${PX4_HOME_LON}';
      if (!rc.includes(rawLat) || !rc.includes(rawLon)) return; // different PX4 version — rcS block covers it
      const fixed = rc
        .replace(rawLat, 'param set SIH_LOC_LAT0 $(awk "BEGIN {printf \\"%.0f\\", ${PX4_HOME_LAT}*10000000}")')
        .replace(rawLon, 'param set SIH_LOC_LON0 $(awk "BEGIN {printf \\"%.0f\\", ${PX4_HOME_LON}*10000000}")');
      await writeFile(simRcPath, fixed);
      console.log('[px4-sitl] rescaled px4-rc.simulator SIH_LOC mapping (upstream deg vs degE7 bug)');
    } catch (err) {
      console.warn('[px4-sitl] could not patch px4-rc.simulator:', err);
    }
  }

  /**
   * Kill any px4 process launched from this bundle that we no longer track
   * (previous app run, crashed instance). SIGKILL is safe here: it is a
   * simulator with no state worth a graceful exit, and the stale one is by
   * definition unmanaged. A short settle lets the OS release px4's lock.
   */
  private async reapStalePx4(bundleDir: string): Promise<void> {
    if (process.platform === 'win32') return; // posix SITL only
    try {
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const run = promisify(execFile);
      // pkill exits 1 when nothing matched — that is the common, healthy case.
      await run('pkill', ['-9', '-f', path.join(bundleDir, 'bin', 'px4')]).then(
        () => {
          console.log('[px4-sitl] reaped stale px4 instance(s) from a previous run');
          return new Promise<void>((r) => setTimeout(r, 300));
        },
        () => undefined,
      );
    } catch { /* best effort */ }
  }

  async start(config: Px4SitlConfig): Promise<{ success: boolean; command?: string; error?: string }> {
    // Concurrency guard. start() awaits several fs operations before it marks
    // _isRunning, so two rapid calls (double-click, re-render) both passed the
    // old guard and BOTH spawned a px4: the second overwrote this.process and
    // the first ran on as an orphan that stop() could never reach, keeping
    // 14550 alive and the GCS "connected" to a vehicle we no longer managed.
    if (this._startInFlight) {
      return { success: false, error: 'PX4 SITL is already starting' };
    }
    this._startInFlight = true;
    try {
      return await this.doStart(config);
    } finally {
      this._startInFlight = false;
    }
  }

  private _startInFlight = false;

  private async doStart(config: Px4SitlConfig): Promise<{ success: boolean; command?: string; error?: string }> {
    if (this._isRunning) {
      this.stop();
    }

    try {
      const bundleDir = this.getBundleDir(config.releaseTrack);
      const binaryPath = this.getBinaryPath(config.releaseTrack);

      const { access } = await import('node:fs/promises');
      try {
        await access(binaryPath);
      } catch {
        return {
          success: false,
          error: `PX4 SITL not downloaded for the ${config.releaseTrack} track`,
        };
      }

      // Make the px4 binary executable in case extraction dropped the +x bit.
      try {
        await chmod(binaryPath, 0o755);
      } catch (err) {
        console.error('[px4-sitl] failed to chmod px4 binary:', err);
      }

      // Wipe persisted SITL state before launch when requested.
      if (config.wipeOnStart) {
        await this.wipeState(bundleDir);
      }

      // PX4_HOME_* env only positions EXTERNAL simulators (jMAVSim/Gazebo
      // generate GPS at that spot). The built-in SIH model reads its origin
      // from SIH_LOC_LAT0/LON0/H0 params, which nothing sets, so the vehicle
      // spawned at (0,0) in the Atlantic regardless of the chosen home.
      // Patch the bundle's rcS once to map the env into those params.
      await this.ensureSihHomeInRcs(bundleDir);

      // Reap stale px4 processes from OUR bundle before starting. Orphans
      // survive app crashes/force-quits, and px4's single-instance lock then
      // fails every launch with "PX4 server already running for instance 0"
      // (exit 255). Matching on the bundle's binary path keeps this from ever
      // touching a px4 the user runs themselves.
      await this.reapStalePx4(bundleDir);

      this._currentConfig = config;

      // No external physics simulator: we run PX4's built-in SIH model
      // (PX4_SIM_MODEL=sihsim_*), so px4 computes the dynamics itself. That is
      // what keeps the bundle self-contained (no jMAVSim/Java, no Gazebo).
      const simCmd: string | null = null;

      const model = this.simModelFor(config);

      // PX4 cannot run from a path containing a space: its rc scripts glob
      // ${R}etc/... unquoted (see px4-paths.ts), and since px4 derives ${R}
      // from getcwd() a space-free symlink is useless - getcwd() hands back the
      // physical, spaced path. px4SitlBundleDir() already picks a space-free
      // location, so this only fires if the username itself has a space.
      const runDir = bundleDir;
      if (px4PathHasSpace(runDir)) {
        return {
          success: false,
          error:
            `PX4 SITL cannot run from a path containing spaces: ${runDir}\n` +
            'PX4\'s startup scripts split the path and never find the airframe.',
        };
      }

      // The exact px4 posix argv (data path, -s startup script, working dir)
      // varies across PX4 versions, so the version-matched invocation lives in
      // the bundle as `px4-launch.sh` (written by build-px4-sitl-bundle.sh). The
      // app just runs that script with the airframe/home/speed passed by env,
      // exactly the variables PX4's own sitl_run.sh reads. If the launcher is
      // missing (an older bundle), fall back to the canonical direct invocation
      // so the failure is a visible px4 error rather than a missing-file spawn.
      const launchScript = path.join(runDir, 'px4-launch.sh');
      const hasLauncher = await access(launchScript).then(() => true).catch(() => false);
      let spawnCmd: string;
      let spawnArgs: string[];
      let cwd: string;
      if (hasLauncher) {
        try { await chmod(launchScript, 0o755); } catch { /* best effort */ }
        spawnCmd = launchScript;
        spawnArgs = [];
        cwd = runDir;
      } else {
        spawnCmd = path.join(runDir, 'bin', 'px4');
        spawnArgs = ['-d', 'etc/init.d-posix/rcS'];
        cwd = path.join(runDir, 'rootfs');
      }

      const env = {
        ...process.env,
        PX4_SIM_MODEL: model,
        PX4_SIM_HOSTNAME: '127.0.0.1',
        PX4_HOME_LAT: String(config.homeLocation.lat),
        PX4_HOME_LON: String(config.homeLocation.lng),
        PX4_HOME_ALT: String(config.homeLocation.alt),
        PX4_SIM_SPEED_FACTOR: String(config.speedup ?? 1),
        PX4_SITL_SIMULATOR: config.simulator ?? 'jmavsim',
      };

      const commandString = `${spawnCmd}${spawnArgs.length ? ' ' + spawnArgs.join(' ') : ''}`;

      const child = spawn(spawnCmd, spawnArgs, {
        cwd,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      this.process = child;
      this._isRunning = true;
      const launchedAt = Date.now();
      // Snapshot the active config so the exit handler can attribute a crash to
      // the (vehicle, model, track) tuple even after _currentConfig is cleared.
      const launchedVehicleType = config.vehicleType;
      const launchedModel = model;
      const launchedTrack = config.releaseTrack;

      child.stdout?.on('data', (data: Buffer) => {
        this.sendToRenderer(IPC_CHANNELS.PX4_SITL_STDOUT, data.toString());
      });

      child.stderr?.on('data', (data: Buffer) => {
        this.sendToRenderer(IPC_CHANNELS.PX4_SITL_STDERR, data.toString());
      });

      child.on('error', (error: Error) => {
        console.error('PX4 SITL process error:', error);
        this._isRunning = false;
        this.sendToRenderer(IPC_CHANNELS.PX4_SITL_ERROR, error.message);
      });

      child.on('exit', (code: number | null, signal: string | null) => {
        // A restart kills the old px4 and spawns a new one; if the old child's
        // exit lands after that spawn, this handler must not null out the
        // SUCCESSOR's process/config. Only the still-active process may tear
        // state down.
        const wasActive = this.process === child;
        if (wasActive) {
          this._isRunning = false;
          this.process = null;
          this._currentConfig = null;
          // If px4 dies, reap the physics sim too so it is not orphaned holding
          // TCP 4560.
          this.killSim();
        }
        // Early-crash detection: an exit within the first few seconds with a
        // fatal signal (or a non-zero code, since some crashes surface no
        // signal) almost always means the bundle cannot run this airframe on
        // this platform. Surface it with the (vehicle, model, track) tuple so
        // the UI can offer a switch to the dev-track bundle.
        const uptimeMs = Date.now() - launchedAt;
        const fatalSignals = new Set(['SIGILL', 'SIGSEGV', 'SIGBUS', 'SIGABRT', 'SIGFPE']);
        const wasEarlyCrash =
          uptimeMs < 5000 &&
          (signal !== null
            ? fatalSignals.has(signal)
            : code !== null && code !== 0);
        this.sendToRenderer(IPC_CHANNELS.PX4_SITL_EXIT, {
          code,
          signal,
          uptimeMs,
          wasEarlyCrash,
          vehicleType: launchedVehicleType,
          model: launchedModel,
          releaseTrack: launchedTrack,
          relaunching: this._relaunching,
        });
      });

      // Tell the renderer what PX4 is actually running with, so a restart
      // driven from main keeps the renderer's home/model in sync and it does
      // not believe SITL is stopped while it is flying.
      this.sendToRenderer(IPC_CHANNELS.PX4_SITL_STARTED, {
        homeLocation: config.homeLocation,
        vehicleType: launchedVehicleType,
        model: launchedModel,
        releaseTrack: launchedTrack,
        pid: child.pid,
        command: commandString,
        wasRelaunch: this._relaunching,
        udpPort: PX4_GCS_UDP_PORT,
      });

      // Report the full launch: the physics sim command (if any) plus px4.
      const fullCommand = simCmd ? `${simCmd}\n${commandString}` : commandString;
      return { success: true, command: fullCommand };
    } catch (err) {
      console.error('Failed to start PX4 SITL:', err);
      this._isRunning = false;
      this.killSim();
      return {
        success: false,
        error: err instanceof Error ? err.message : t('common:unknownError'),
      };
    }
  }

  /**
   * Kill the tracked physics simulator child (SIGTERM, then SIGKILL). jMAVSim
   * is a JVM that can ignore SIGTERM, so the escalation targets a LOCAL capture
   * of the child rather than this.simProcess (which we null immediately).
   */
  private killSim(): void {
    const sim = this.simProcess;
    if (!sim) return;
    this.simProcess = null;
    try {
      sim.kill('SIGTERM');
      setTimeout(() => {
        try {
          sim.kill('SIGKILL');
        } catch {
          // Already dead.
        }
      }, 2000);
    } catch (err) {
      console.error('[px4-sitl] failed to kill jMAVSim:', err);
    }
  }

  stop(): void {
    // Capture the child in a LOCAL so the SIGKILL escalation still targets it
    // after we null this.process below; reading this.process inside the timer
    // would be null by the time it fires and px4 (which can ignore SIGTERM)
    // would survive stop() and keep its ports bound.
    const proc = this.process;
    if (proc) {
      try {
        proc.kill('SIGTERM');
        setTimeout(() => {
          try {
            proc.kill('SIGKILL');
          } catch {
            // Already dead.
          }
        }, 2000);
      } catch (err) {
        console.error('Failed to kill PX4 SITL process:', err);
      }
      this.process = null;
      this._isRunning = false;
      this._currentConfig = null;
    }
    // Always reap the physics sim, even if px4 was already gone.
    this.killSim();
  }

  /**
   * Stop the running PX4 SITL and immediately start it again with the same
   * config. Returns whatever start() returns. The _relaunching flag rides the
   * exit event so the renderer treats the teardown as an intentional restart.
   */
  async restart(): Promise<{ success: boolean; command?: string; error?: string }> {
    const cfg = this._currentConfig;
    if (!cfg) return { success: false, error: t('main:sitl.noActivePx4Config') };
    this._relaunching = true;
    try {
      this.stop();
      // Brief pause so the OS releases the bound UDP/TCP ports before we rebind.
      await new Promise<void>((r) => setTimeout(r, 1000));
      return await this.start(cfg);
    } finally {
      this._relaunching = false;
    }
  }

  getStatus(): Px4SitlStatus {
    return {
      isRunning: this._isRunning,
      pid: this.process?.pid,
      vehicleType: this._currentConfig?.vehicleType,
      udpPort: PX4_GCS_UDP_PORT,
    };
  }

  private sendToRenderer(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }
}

export const px4SitlProcess = new Px4SitlProcessManager();
