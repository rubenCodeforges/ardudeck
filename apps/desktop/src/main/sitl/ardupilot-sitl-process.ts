/**
 * ArduPilot SITL Process Manager
 *
 * Runs SITL natively on all platforms:
 * - macOS: Native ARM64/x64 binary (built by our CI)
 * - Linux: Native x64 binary
 * - Windows: Cygwin binary + DLLs
 */

import { spawn, ChildProcess } from 'node:child_process';
import { app, BrowserWindow } from 'electron';
import { chmod, writeFile } from 'node:fs/promises';
import path from 'node:path';
import Store from 'electron-store';
import type {
  ArduPilotSitlConfig,
  ArduPilotSitlStatus,
  ArduPilotVehicleType,
  ArduPilotReleaseTrack,
} from '../../shared/ipc-channels.js';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';
import { isVtolFrame } from './frame-config.js';
import type { AuthoredObstacle, SimObstacleStoreSchema } from '../../shared/sim-obstacle-types.js';
import { generateDefaultParams, resolveCopterFrame, sitlFrameForMotorCount, killProcessTree, reapSitlOnPort, withPathPrepended } from '@ardudeck/sitl';
import { ardupilotSitlDownloader } from './ardupilot-sitl-downloader.js';
import { simEngineProcess } from '../sim/sim-engine-process.js';
import { t } from '../../shared/i18n/index.js';

/** Motor count for a stock ArduPilot copter frame model name (octaquad -> 8, etc). */
function motorCountForModel(model: string | undefined): number {
  const m = (model ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (m.includes('octaquad') || m.includes('octoquad') || m.includes('x8')) return 8;
  if (m.includes('dodeca')) return 12;
  if (m.includes('deca')) return 10;
  if (m.includes('octa') || m.includes('octo')) return 8;
  if (m.includes('y6')) return 6;
  if (m.includes('hexa') || m.includes('hex')) return 6;
  if (m.includes('tri')) return 3;
  return 4;
}

/**
 * When the ArduDeck engine runs without a user custom frame it falls back to a
 * hardcoded 4-motor quad model; on any non-quad vehicle that motor-count
 * mismatch makes the aircraft oscillate ("wobbles hysterically"). Synthesize a
 * matching default frame - correct `num_motors` plus mass / disc area / battery
 * scaled proportionally so hover throttle stays balanced - and write it to a
 * temp file for the engine's `--frame`.
 */
async function stageDefaultEngineFrame(model: string | undefined): Promise<string | undefined> {
  const n = motorCountForModel(model);
  const scale = n / 4;
  const frame = {
    mass: 1.5 * scale,
    diagonal_size: 0.4 * Math.sqrt(scale),
    refSpd: 15.0, refAngle: 45.0, refVoltage: 12.6, refCurrent: 30.0 * scale,
    refAlt: 0, refTempC: 25, refBatRes: 0.025, maxVoltage: 12.6,
    battCapacityAh: 5.0 * scale, propExpo: 0.65, refRotRate: 360,
    hoverThrOut: 0.39, pwmMin: 1000, pwmMax: 2000,
    spin_min: 0.15, spin_max: 0.95, slew_max: 150,
    disc_area: 0.05 * scale, mdrag_coef: 0.10, num_motors: n,
  };
  try {
    const file = path.join(app.getPath('temp'), `ardudeck-default-frame-${n}m.json`);
    await writeFile(file, JSON.stringify(frame));
    return file;
  } catch (err) {
    console.warn('[SITL] could not stage default engine frame:', err);
    return undefined;
  }
}

/**
 * Engine `--obstacles` schema: one geographic obstacle. Matches the engine's
 * serde struct `ObstacleFile` (crates/ardudeck-sim-engine/src/main.rs), which
 * reads exactly these keys and ignores any extras (id/label). The engine
 * projects lat/lon to local NED at load using --home.
 */
interface EngineObstacleFile {
  lat: number;
  lon: number;
  shape: string;
  radius: number;
  height: number;
}

/**
 * Site id for the authored-obstacle store, matching the renderer's
 * `siteIdFromOrigin`: home lat/lon rounded to 3 decimal places so a field keeps
 * one obstacle set.
 */
function siteIdFromOrigin(lat: number, lon: number): string {
  return `${lat.toFixed(3)}_${lon.toFixed(3)}`;
}

// The authored obstacles are persisted by ipc-handlers under the named
// electron-store 'sim-obstacles'. A second Store with the same name reads the
// same on-disk file, so the engine launch path can pick them up without
// reaching into the renderer's store.
let simObstaclesStore: Store<SimObstacleStoreSchema> | null = null;
function readSiteObstacles(siteId: string): AuthoredObstacle[] {
  if (!simObstaclesStore) {
    simObstaclesStore = new Store<SimObstacleStoreSchema>({
      name: 'sim-obstacles',
      defaults: { sites: {} },
    });
  }
  const sites = simObstaclesStore.get('sites', {});
  return sites[siteId] ?? [];
}

/**
 * Serialize the authored obstacles for the active site to a temp JSON file in
 * the engine's expected geographic shape, returning its path. Returns undefined
 * when there are none, so no --obstacles arg is passed. Uses a single
 * deterministic file under userData, overwritten on each launch.
 */
async function writeObstaclesFileForSite(home: { lat: number; lng: number }): Promise<string | undefined> {
  const siteId = siteIdFromOrigin(home.lat, home.lng);
  const obstacles = readSiteObstacles(siteId);
  if (obstacles.length === 0) return undefined;
  const engineObstacles: EngineObstacleFile[] = obstacles.map((o) => ({
    lat: o.lat,
    lon: o.lon,
    shape: o.shape,
    radius: o.radius,
    height: o.height,
  }));
  const filePath = path.join(app.getPath('userData'), 'sim-engine-obstacles.json');
  await writeFile(filePath, JSON.stringify(engineObstacles), 'utf-8');
  return filePath;
}

const DEFAULT_MODELS: Record<ArduPilotVehicleType, string> = {
  copter: 'quad',
  plane: 'plane',
  rover: 'rover',
  sub: 'vectored',
};

/**
 * The value SITL is launched with as `-M<...>`.
 *
 * `JSON` means SITL takes its physics from an external process over UDP 9002
 * rather than simulating internally, which is what makes the physics handover
 * to the Trainer game possible at all.
 */
/** Frames ArduDeck's physics engine cannot fly, so the engine is bypassed. */
export function sitlFrameIsVtol(config: ArduPilotSitlConfig): boolean {
  if (config.vehicleType !== 'plane') return false;
  const model = config.model || DEFAULT_MODELS[config.vehicleType];
  return isVtolFrame(model, config.vehicleType);
}

export function simModelFor(config: ArduPilotSitlConfig): string {
  // ArduDeck's engine models copters, planes and rovers. A quadplane's lift
  // rotors live on outputs the fixed-wing model never reads, so under the
  // engine a QHover takeoff gets no lift and flips. ArduPilot's own quadplane
  // physics does model them, so VTOL frames stay on it.
  if (config.useArduDeckSim && !sitlFrameIsVtol(config)) return 'JSON:127.0.0.1';
  // Custom frame JSON overrides the built-in -M model when provided. SITL
  // expects `<frame>:<absolute path>`. The JSON carries mass / prop / battery
  // numbers but NOT the motor layout, so the layout still comes from this
  // frame name and must stay paired with the FRAME_TYPE that
  // generateDefaultParams writes for the same name.
  if (config.customFramePath && config.customFrameMotors) {
    return `${sitlFrameForMotorCount(config.customFrameMotors)}:${config.customFramePath}`;
  }
  return config.model || DEFAULT_MODELS[config.vehicleType];
}

/**
 * The model whose PHYSICS actually run, which is what FRAME_CLASS / FRAME_TYPE must match.
 *
 * NOT `simModelFor`: that answers `JSON:127.0.0.1` whenever ArduDeck's own engine is driving,
 * which says nothing about the airframe and resolves to the quad fallback. With a custom frame
 * active the layout comes from the MOTOR COUNT, so a 60 kg octa was being reported as a quad
 * while its frame file said eight motors: a contradiction that gave the borrower four mounts
 * for an eight-motor aircraft.
 *
 * One function, used by both the parameter writer and anything reporting the frame outward, so
 * the two cannot drift again.
 */
export function paramModelFor(config: ArduPilotSitlConfig): string {
  return config.vehicleType === 'copter' && config.customFramePath && config.customFrameMotors
    ? sitlFrameForMotorCount(config.customFrameMotors)
    : config.model || DEFAULT_MODELS[config.vehicleType];
}

class ArduPilotSitlProcessManager {
  private process: ChildProcess | null = null;
  private _isRunning = false;
  private mainWindow: BrowserWindow | null = null;
  private _currentConfig: ArduPilotSitlConfig | null = null;
  /**
   * False while an external owner (the Trainer game) holds UDP 9002. Every
   * simEngineProcess start/stop this manager would normally do is suppressed,
   * otherwise a SITL relaunch would silently steal the FDM port back from the
   * process that is actually flying the aircraft.
   */
  private _engineManaged = true;
  /**
   * True only for the window in which relaunchWithHome is deliberately killing
   * SITL to respawn it. The exit event carries this so the renderer can tell an
   * intentional restart from a crash; every other death leaves it false.
   */
  private _relaunching = false;

  get isRunning(): boolean {
    return this._isRunning;
  }

  get currentConfig(): ArduPilotSitlConfig | null {
    return this._currentConfig;
  }

  get engineManaged(): boolean {
    return this._engineManaged;
  }

  setEngineManaged(managed: boolean): void {
    this._engineManaged = managed;
  }

  /**
   * The frame name SITL is currently running with ("JSON", "quad", ...), or
   * null when it is not running. The `-M` argument's `:suffix` (FDM address or
   * custom frame path) is dropped; callers care about the model, not the path.
   */
  get simModel(): string | null {
    if (!this._currentConfig) return null;
    return simModelFor(this._currentConfig).split(':')[0] ?? null;
  }

  /**
   * The airframe this stack is MIXING for, as FRAME_CLASS / FRAME_TYPE.
   *
   * Resolved from the FULL model string, exactly as `generateDefaultParams` does when it writes
   * those two parameters, so this cannot report one airframe while the vehicle flies another.
   * Deliberately not derived from `simModel`, which drops the `:suffix` and would answer "quad"
   * for a custom octa frame.
   */
  /**
   * The custom frame JSON this vehicle is simulated from, if there is one.
   *
   * It carries mass, prop, disc area and battery: the AIRCRAFT. `simFrame` above carries the
   * layout. A borrower needs both, because adopting the layout alone leaves it flying a 3 kg
   * default under gains tuned for whatever this really is, which diverges on the first input.
   */
  get simFramePath(): string | null {
    return this._currentConfig?.customFramePath ?? null;
  }

  get simFrame(): { frameClass: number; frameType: number } | null {
    if (!this._currentConfig || this._currentConfig.vehicleType !== 'copter') return null;
    const { frameClass, frameType } = resolveCopterFrame(paramModelFor(this._currentConfig));
    return { frameClass, frameType: frameType ?? 1 };
  }

  /**
   * Relaunch SITL at a new simulated origin.
   *
   * This exists because `-O` on SITL's command line outranks the SIM_OPOS_*
   * parameters: SITL reboots by re-exec'ing its own argv, so a PARAM_SET plus
   * an FC reboot re-applies the ORIGINAL `-O` and the origin never moves. Only
   * a relaunch with a new `-O` actually takes. Verified experimentally, see
   * sim-handover-server.ts.
   */
  async relaunchWithHome(home: { lat: number; lng: number; alt: number; heading: number }): Promise<{ success: boolean; error?: string }> {
    const cfg = this._currentConfig;
    if (!cfg) return { success: false, error: 'SITL is not running' };
    const next: ArduPilotSitlConfig = { ...cfg, homeLocation: home };
    this._relaunching = true;
    try {
      await this.stopAndWait(5000);
      // Brief pause for the OS to fully release the bound TCP port (5760).
      await new Promise<void>((r) => setTimeout(r, 1000));
      const res = await this.start(next);
      if (!res.success) {
        // The kill already reached the renderer as a relaunch, which told it to
        // hold its "running" state. Nothing is coming back, so say so on the
        // error channel the renderer already treats as "SITL is down".
        this.sendToRenderer(
          IPC_CHANNELS.ARDUPILOT_SITL_ERROR,
          `SITL relaunch at the new take-off point failed: ${res.error ?? 'unknown error'}`,
        );
      }
      return { success: res.success, error: res.error };
    } finally {
      this._relaunching = false;
    }
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  isPlatformSupported(): { supported: boolean; useDocker: boolean; error?: string } {
    const platform = process.platform;

    if (platform === 'darwin' || platform === 'linux' || platform === 'win32') {
      // All platforms run natively now (no Docker)
      return { supported: true, useDocker: false };
    }

    return {
      supported: false,
      useDocker: false,
      error: `Unsupported platform: ${platform}`,
    };
  }

  getBinaryPath(vehicleType: ArduPilotVehicleType, releaseTrack: ArduPilotReleaseTrack): string {
    return ardupilotSitlDownloader.getBinaryPath(vehicleType, releaseTrack);
  }

  private getCygwinDllPath(): string {
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, 'ardupilot-sitl', 'cygwin');
  }

  private buildArgs(config: ArduPilotSitlConfig): string[] {
    const args: string[] = [];

    args.push(`-M${simModelFor(config)}`);

    const { lat, lng, alt, heading } = config.homeLocation;
    args.push(`-O${lat},${lng},${alt},${heading}`);

    // TCP MAVLink server on port 5760
    args.push('--serial0', 'tcp:0');

    // Always stream FlightGear FGNetFDM packets to 127.0.0.1:5503. This is
    // harmless when nothing is listening (plain outbound UDP), and it means the
    // user can open the FlightGear viewer at any time AFTER launching SITL
    // without restarting it. FlightGear attaches with `--fdm=external`; see
    // simulators/ardupilot-flightgear.ts.
    args.push('--enable-fgview');
    args.push('--fg', '127.0.0.1');

    // Always specify speedup on macOS ARM64 to avoid crash (ArduPilot issue #19588)
    const speedup = config.speedup && config.speedup > 1 ? config.speedup : 1;
    args.push(`-s${speedup}`);

    if (config.wipeOnStart) {
      args.push('--wipe');
    }

    if (config.simulator && config.simulator !== 'none') {
      args.push('--sim', config.simulator);
      if (config.simAddress) {
        args.push('--sim-address', config.simAddress);
      }
    }

    if (config.defaultsFile) {
      args.push('--defaults', config.defaultsFile);
    }

    return args;
  }

  async start(config: ArduPilotSitlConfig): Promise<{ success: boolean; command?: string; error?: string }> {
    if (this._isRunning) {
      this.stop();
    }

    // Use the ArduDeck physics engine only when explicitly requested AND its
    // binary is actually present; otherwise fall back to built-in physics so a
    // missing engine can never strand SITL waiting for a dead FDM.
    // While the engine is externally owned the FDM is guaranteed by that owner,
    // so a missing local binary is not a reason to downgrade.
    if (config.useArduDeckSim && this._engineManaged && !simEngineProcess.isBinaryAvailable()) {
      console.warn('[SITL] ArduDeck engine requested but binary not found; using built-in physics.');
      config = { ...config, useArduDeckSim: false };
    }

    const platformCheck = this.isPlatformSupported();
    if (!platformCheck.supported) {
      return { success: false, error: platformCheck.error };
    }

    try {
      const binaryPath = this.getBinaryPath(config.vehicleType, config.releaseTrack);

      const { access } = await import('node:fs/promises');
      try {
        await access(binaryPath);
      } catch {
        return {
          success: false,
          error: `SITL binary not found at ${binaryPath}. Please download it first.`,
        };
      }

      // Make binary executable (macOS/Linux)
      if (process.platform !== 'win32') {
        try {
          await chmod(binaryPath, 0o755);
        } catch (err) {
          console.error('Failed to chmod SITL binary:', err);
        }
      }

      // Build the --defaults stack: upstream autotest params first (so
      // frame-specific defaults like Q_ENABLE / Q_FRAME_CLASS land), then
      // our ArduDeck overlay on top so user tweaks (sim wind, batt, terrain)
      // win on conflicts. ArduPilot loads `--defaults a,b,c` left-to-right
      // with later files overriding earlier — same semantics Mission Planner
      // relies on for its identity.parm overlay.
      const model = paramModelFor(config);
      const defaultsStack: string[] = [];

      // Pin the VTOL mixer when the frame's own defaults do not.
      //
      // SITL keeps its EEPROM between runs. quadplane.parm sets only Q_ENABLE
      // and leans on the firmware defaults (Q_FRAME_CLASS 1 / Q_FRAME_TYPE 1),
      // while firefly.parm writes 5 / 11 for its Y6. Switch Firefly -> Quadplane
      // without a wipe and the Y6 mix stays behind while SITL flies a quad
      // layout, so the controller drives the wrong motors and it flips on the
      // first QHover takeoff. Same trap the copter branch already guards with
      // FRAME_CLASS + FRAME_TYPE.
      const vtolMixerLines: string[] = [];

      if (!config.defaultsFile) {
        try {
          const { resolveDefaultsFile } = await import('./frame-config.js');
          const upstream = await resolveDefaultsFile(config.vehicleType, model);
          if (upstream) {
            defaultsStack.push(upstream);
            if (sitlFrameIsVtol(config)) {
              const { readFile } = await import('node:fs/promises');
              const text = await readFile(upstream, 'utf-8').catch(() => '');
              if (!/^\s*Q_FRAME_CLASS\b/m.test(text)) vtolMixerLines.push('Q_FRAME_CLASS   1');
              if (!/^\s*Q_FRAME_TYPE\b/m.test(text)) vtolMixerLines.push('Q_FRAME_TYPE    1');
            }
          }
        } catch (err) {
          console.warn('[SITL] upstream defaults resolve failed, falling back to overlay only:', err);
        }
      }

      // Default the simulated pack to the active custom frame's own voltage and
      // capacity, so SIM_BATT_VOLTAGE reflects the real airframe (e.g. a 14S
      // 60.9V pack) instead of the built-in 12.6V default that looks wrong in
      // the parameter tree. The engine path overrides battery voltage over the
      // JSON FDM link anyway; this keeps the parameter honest and gives the
      // built-in-physics fallback the right pack. An explicit user override
      // (simBattVoltage > 0) still wins.
      let effBattVoltage = config.simBattVoltage;
      let effBattCapAh = config.simBattCapAh;
      // FC battery params derived from the active frame (capacity + cell
      // thresholds), so the Battery config tab reflects the real pack instead of
      // ArduPilot's ~3S firmware defaults (which read as a 3S battery on a 14S
      // airframe). These set thresholds only; failsafe actions stay at default.
      const frameBattLines: string[] = [];
      if (config.customFramePath) {
        try {
          const { readFile } = await import('node:fs/promises');
          const raw = JSON.parse(await readFile(config.customFramePath, 'utf-8')) as {
            maxVoltage?: number;
            refVoltage?: number;
            battCapacityAh?: number;
          };
          if ((effBattVoltage === undefined || effBattVoltage <= 0) &&
              typeof raw.maxVoltage === 'number' && raw.maxVoltage > 0) {
            effBattVoltage = raw.maxVoltage;
          }
          if ((effBattCapAh === undefined || effBattCapAh <= 0) &&
              typeof raw.battCapacityAh === 'number' && raw.battCapacityAh > 0) {
            effBattCapAh = raw.battCapacityAh;
          }
          if (typeof raw.battCapacityAh === 'number' && raw.battCapacityAh > 0) {
            frameBattLines.push(`BATT_CAPACITY ${Math.round(raw.battCapacityAh * 1000)}`);
          }
          // refVoltage is the nominal pack voltage (cells * 3.7V for LiPo), so it
          // gives an unambiguous cell count. Thresholds use the same LiPo per-cell
          // references as the Battery tab (low 3.6, critical 3.5) so it detects.
          const cells = typeof raw.refVoltage === 'number' && raw.refVoltage > 0
            ? Math.round(raw.refVoltage / 3.7)
            : 0;
          if (cells > 0) {
            frameBattLines.push(`BATT_LOW_VOLT ${(cells * 3.6).toFixed(1)}`);
            frameBattLines.push(`BATT_CRT_VOLT ${(cells * 3.5).toFixed(1)}`);
          }
        } catch (err) {
          console.warn('[SITL] could not read custom frame for battery defaults:', err);
        }
      }

      const overlayBase = generateDefaultParams(
        config.vehicleType,
        model,
        effBattVoltage,
        effBattCapAh,
      );
      const overlayExtras = [...frameBattLines, ...vtolMixerLines];
      const overlay = overlayExtras.length > 0
        ? `${overlayBase}\n${overlayExtras.join('\n')}`
        : overlayBase;
      if (overlay && !config.defaultsFile) {
        const overlayPath = path.join(path.dirname(binaryPath), 'ardudeck-defaults.parm');
        await writeFile(overlayPath, overlay, 'utf-8');
        defaultsStack.push(overlayPath);
      }

      if (defaultsStack.length > 0 && !config.defaultsFile) {
        config = { ...config, defaultsFile: defaultsStack.join(',') };
      }

      // Stage the active custom frame so ArduPilot SITL can actually open it.
      // SITL's AP::FS().stat() runs paths through map_filename() which strips
      // the leading `/` on SITL builds, turning any absolute path into a
      // relative one resolved against SITL's cwd. The only reliable solution
      // is to write the file INSIDE SITL's cwd (the binary's directory) and
      // pass a bare filename to `-Mtype:<filename>`.
      // ArduDeck in-app simulator: start the headless physics engine BEFORE
      // SITL so its JSON FDM UDP socket is bound when SITL connects. The engine
      // (not SITL) consumes the custom frame, so we skip SITL-side frame staging
      // and pass the original frame path straight to the engine.
      if (config.useArduDeckSim && this._engineManaged) {
        const engineKind =
          config.vehicleType === 'plane' ? 'plane' :
          config.vehicleType === 'rover' ? 'rover' : 'copter';
        // Without a user custom frame the engine defaults to a 4-motor quad,
        // which oscillates on non-quad vehicles. Stage a default frame matching
        // the selected copter model's motor count so the mixer/dynamics agree.
        let engineFramePath = config.customFramePath;
        if (!engineFramePath && engineKind === 'copter') {
          engineFramePath = await stageDefaultEngineFrame(config.model);
        }
        const windIntensity = config.simWindIntensity ?? 0;
        // Feed authored obstacles for the active site into the engine so it
        // models real wake turbulence around them. None => no arg (unchanged).
        const obstaclesPath = await writeObstaclesFileForSite(config.homeLocation).catch((err) => {
          console.warn('[SITL] could not stage sim obstacles for engine:', err);
          return undefined;
        });
        const engineResult = await simEngineProcess.start({
          kind: engineKind,
          framePath: engineFramePath,
          home: config.homeLocation,
          noise: config.simSensorNoise ?? false,
          obstaclesPath,
          // Always model the battery in the engine path. It reports the frame's
          // real pack voltage/current back to SITL; without it the firmware
          // falls back to SITL's internal 12.6V default and the reported
          // voltage is wrong for anything but a 3S frame. Battery sag is the
          // headline of the engine, not an opt-in fidelity knob.
          battery: true,
          wind: windIntensity > 0 ? `0,0,0,${windIntensity},1` : undefined,
        });
        if (!engineResult.success) {
          this._isRunning = false;
          return { success: false, error: `sim-engine failed to start: ${engineResult.error}` };
        }
      } else if (config.customFramePath) {
        try {
          const { stageFramePathForLaunch } = await import('./custom-frame-storage.js');
          const sitlCwd = path.dirname(binaryPath);
          const stagedFilename = await stageFramePathForLaunch(config.customFramePath, sitlCwd);
          if (stagedFilename) {
            config = { ...config, customFramePath: stagedFilename };
          } else {
            // Staging failed (file missing, unreadable, or invalid JSON).
            // Clear the active frame entirely so SITL launches with the
            // built-in `-M{model}` instead of getting the original (broken)
            // path passed in and panicking with "failed to load".
            console.warn('[SITL] custom frame staging failed; the active frame file is missing or unreadable. Falling back to built-in physics.');
            config = { ...config, customFramePath: undefined, customFrameMotors: undefined };
          }
        } catch (err) {
          console.warn('[SITL] custom frame staging threw; falling back to built-in physics:', err);
          config = { ...config, customFramePath: undefined, customFrameMotors: undefined };
        }
      }

      this._currentConfig = config;

      const args = this.buildArgs(config);
      const spawnCmd = binaryPath;
      const commandString = `${binaryPath} ${args.join(' ')}`;

      // Environment setup
      // Windows: the Cygwin DLLs the binary needs
      const env = process.platform === 'win32' ? withPathPrepended(process.env, this.getCygwinDllPath()) : { ...process.env };

      // Reap any stale SITL still holding the MAVLink TCP port. A previous crash
      // or a dev hot-reload can orphan an arducopter/plane/rover process that
      // stop() never reached; it keeps port 5760 bound and the new SITL dies with
      // "bind failed on port 5760 - Address already in use". Kill only an
      // ArduPilot SITL binary, matched by name, so nothing unrelated is touched.
      await reapSitlOnPort(5760);

      const child = spawn(spawnCmd, args, {
        cwd: path.dirname(binaryPath),
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      this.process = child;
      this._isRunning = true;
      const launchedAt = Date.now();
      // Snapshot the active config now so the exit handler can attribute the
      // crash to the (vehicle, model, track) tuple even after _currentConfig
      // has been cleared.
      const launchedVehicleType = config.vehicleType;
      const launchedModel = config.model || DEFAULT_MODELS[config.vehicleType];
      const launchedTrack = config.releaseTrack;

      child.stdout?.on('data', (data: Buffer) => {
        this.sendToRenderer(IPC_CHANNELS.ARDUPILOT_SITL_STDOUT, data.toString());
      });

      child.stderr?.on('data', (data: Buffer) => {
        this.sendToRenderer(IPC_CHANNELS.ARDUPILOT_SITL_STDERR, data.toString());
      });

      child.on('error', (error: Error) => {
        console.error('ArduPilot SITL process error:', error);
        this._isRunning = false;
        this.sendToRenderer(IPC_CHANNELS.ARDUPILOT_SITL_ERROR, error.message);
      });

      child.on('exit', (code: number | null, signal: string | null) => {
        // A relaunch kills the old SITL and spawns a new one; if the old child's
        // exit lands after that spawn, this handler would null out the SUCCESSOR's
        // process/config and kill its engine. Only the process that is still the
        // active one may tear state down.
        const wasActive = this.process === child;
        if (wasActive) {
          this._isRunning = false;
          this.process = null;
          this._currentConfig = null;
          // If SITL dies, tear down the sim engine too so it isn't orphaned.
          if (this._engineManaged) simEngineProcess.stop();
        }
        // Early-crash detection: an exit within the first few seconds with
        // a fatal signal (or a non-zero code, since some crashes don't
        // surface a signal on Windows) almost always means the binary can't
        // run this physics frame on this platform. Surface that to the
        // renderer along with the (vehicle, model, track) tuple so the UI
        // can offer a one-click switch to the dev track binary, which is
        // rebuilt nightly and ships the platform-specific fixes that haven't
        // landed in `stable` yet.
        const uptimeMs = Date.now() - launchedAt;
        const fatalSignals = new Set(['SIGILL', 'SIGSEGV', 'SIGBUS', 'SIGABRT', 'SIGFPE']);
        const wasEarlyCrash =
          uptimeMs < 5000 &&
          (signal !== null
            ? fatalSignals.has(signal)
            : code !== null && code !== 0);
        this.sendToRenderer(IPC_CHANNELS.ARDUPILOT_SITL_EXIT, {
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

      // Tell the renderer what SITL is actually running with. Without this a
      // relaunch driven from main (the sim handover endpoint moving the take-off
      // point) leaves the renderer showing the old home and, after the exit
      // above, believing SITL is stopped while it is flying.
      this.sendToRenderer(IPC_CHANNELS.ARDUPILOT_SITL_STARTED, {
        homeLocation: config.homeLocation,
        vehicleType: launchedVehicleType,
        model: launchedModel,
        releaseTrack: launchedTrack,
        pid: child.pid,
        command: commandString,
        wasRelaunch: this._relaunching,
      });

      return { success: true, command: commandString };
    } catch (err) {
      console.error('Failed to start ArduPilot SITL:', err);
      this._isRunning = false;
      return {
        success: false,
        error: err instanceof Error ? err.message : t('common:unknownError'),
      };
    }
  }

  /**
   * Kill any stale ArduPilot SITL process still bound to the MAVLink TCP port.
   * Matches by binary name (arducopter/arduplane/ardurover) so it never touches
   * an unrelated process that happens to hold the port. macOS/Linux only (uses
   * lsof); a no-op on Windows.
   */
  stop(): void {
    // Tear down the in-app sim engine alongside SITL (no-op if not running).
    if (this._engineManaged) simEngineProcess.stop();
    // Capture the child in a LOCAL so the SIGKILL escalation still targets it
    // after we null `this.process` below. Reading `this.process` inside the
    // timer was always null by the time it fired, so SITL (which routinely
    // ignores SIGTERM) never got SIGKILLed - it survived Stop, kept port 5760
    // bound, and the next Start couldn't bind ("can't connect after restart").
    const proc = this.process;
    if (proc) {
      killProcessTree(proc);
      this.process = null;
      this._isRunning = false;
      this._currentConfig = null;
    }
  }

  /**
   * Stop the SITL process and resolve only after it has actually exited (or
   * after `timeoutMs` if the OS is being slow). Unlike stop(), this awaits
   * the underlying child process's 'exit' event before returning, which is
   * required when you intend to immediately respawn SITL with the same TCP
   * port - otherwise start() races the dying child for the port and the new
   * SITL silently fails to bind.
   */
  async stopAndWait(timeoutMs: number = 5000): Promise<void> {
    if (this._engineManaged) simEngineProcess.stop();
    const proc = this.process;
    if (!proc) return;
    return new Promise<void>((resolve) => {
      let settled = false;
      const settle = () => { if (!settled) { settled = true; resolve(); } };
      proc.once('exit', settle);
      killProcessTree(proc);
      this.process = null;
      this._isRunning = false;
      this._currentConfig = null;
      // Belt-and-braces fallback so we don't hang forever.
      setTimeout(settle, timeoutMs);
    });
  }

  /**
   * Stop the running SITL (waiting for actual exit) and immediately start
   * it again with the same config. Returns whatever start() returns.
   *
   * Use this when you've changed something on disk that ArduPilot only picks
   * up on cold boot (e.g. wrote a new Lua script under /APM/scripts/).
   */
  async restart(): Promise<{ success: boolean; command?: string; error?: string }> {
    const cfg = this._currentConfig;
    if (!cfg) return { success: false, error: t('main:sitl.noActiveConfig') };
    await this.stopAndWait(5000);
    // Brief pause for the OS to fully release the bound TCP port (5760).
    await new Promise<void>(r => setTimeout(r, 1000));
    return this.start(cfg);
  }

  getStatus(): ArduPilotSitlStatus {
    return {
      isRunning: this._isRunning,
      pid: this.process?.pid,
      vehicleType: this._currentConfig?.vehicleType,
      tcpPort: 5760,
      simStateWsPort: simEngineProcess.wsPort ?? undefined,
    };
  }

  private sendToRenderer(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }
}

export const ardupilotSitlProcess = new ArduPilotSitlProcessManager();
