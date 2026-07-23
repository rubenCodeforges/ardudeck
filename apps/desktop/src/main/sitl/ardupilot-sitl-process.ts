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
import type { AuthoredObstacle, SimObstacleStoreSchema } from '../../shared/sim-obstacle-types.js';
import { ardupilotSitlDownloader } from './ardupilot-sitl-downloader.js';
import { simEngineProcess } from '../sim/sim-engine-process.js';

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

// Model → FRAME_CLASS mapping for ArduPilot Copter
// See: https://ardupilot.org/copter/docs/parameters.html#frame-class
const COPTER_FRAME_CLASS: Record<string, number> = {
  'quad': 1,       // Quad
  '+': 1,          // Quad
  'hexa': 2,       // Hexa
  'octa': 3,       // Octa
  'octaquad': 4,   // OctaQuad
  'y6': 5,         // Y6
  'heli': 6,       // Heli
  'tri': 7,        // Tri
  'singlecopter': 8,
  'coax': 9,       // CoaxCopter
};

/**
 * Generate a defaults param file for SITL based on vehicle type and model.
 * This ensures essential parameters (like FRAME_CLASS) are set on first boot
 * or after EEPROM wipe, avoiding the "Check frame class" arming error.
 */
export function generateDefaultParams(
  vehicleType: ArduPilotVehicleType,
  model: string,
  simBattVoltage?: number,
  simBattCapAh?: number,
): string {
  const lines: string[] = [];

  if (vehicleType === 'copter') {
    const frameClass = COPTER_FRAME_CLASS[model] ?? 1; // Default to Quad
    lines.push(`FRAME_CLASS ${frameClass}`);
  }

  if (vehicleType === 'plane') {
    // Upstream ArduPilot plane-jsbsim.parm defaults. These are the
    // known-good baseline: without them, SITL plane drifts on the ground
    // with uncalibrated INS, modes don't map correctly, etc.
    // Source: ArduPilot/ardupilot Tools/autotest/default_params/plane-jsbsim.parm
    // Tracking:
    //   https://discuss.ardupilot.org/t/sitl-vehicle-on-mission-planner-moving-while-disarmed/65968
    lines.push('EK2_ENABLE      1');
    lines.push('BATT_MONITOR    4');
    lines.push('LOG_BITMASK     65535');
    lines.push('AIRSPEED_CRUISE 22.00');
    lines.push('PTCH_TRIM_DEG   0.00');
    lines.push('TRIM_THROTTLE   50');
    lines.push('PTCH_LIM_MIN_DEG -20.00');
    lines.push('PTCH_LIM_MAX_DEG 25.00');
    lines.push('ROLL_LIMIT_DEG  65.00');
    lines.push('LAND_DISARMDELAY 3');
    lines.push('LAND_PITCH_DEG  1.00');
    lines.push('LAND_FLARE_SEC  3');
    lines.push('ARSPD_USE       1');
    lines.push('AIRSPEED_MAX    30');
    lines.push('AIRSPEED_MIN    10');
    lines.push('KFF_RDDRMIX     0.5');
    lines.push('THR_MAX         100');
    // NOTE: the upstream JSBSim parm file sets RC2/RC4/SERVO2/SERVO4 REVERSED=1
    // because JSBSim's elevator/rudder sign convention is flipped. The
    // built-in `-Mplane` physics model is NOT flipped, so reversing here
    // makes the plane dive instead of climb during takeoff. Leaving them at
    // firmware default (not reversed).
    lines.push('RC1_MAX         2000');
    lines.push('RC1_MIN         1000');
    lines.push('RC1_TRIM        1500');
    lines.push('RC2_MAX         2000');
    lines.push('RC2_MIN         1000');
    lines.push('RC2_TRIM        1500');
    lines.push('RC3_MAX         2000');
    lines.push('RC3_MIN         1000');
    lines.push('RC3_TRIM        1000');
    lines.push('SERVO3_MIN      1000');
    lines.push('SERVO3_MAX      2000');
    lines.push('RC4_MAX         2000');
    lines.push('RC4_MIN         1000');
    lines.push('RC4_TRIM        1500');
    lines.push('RC5_MAX         2000');
    lines.push('RC5_MIN         1000');
    lines.push('RC5_TRIM        1500');
    lines.push('RC6_MAX         2000');
    lines.push('RC6_MIN         1000');
    lines.push('RC6_TRIM        1500');
    lines.push('RC7_MAX         2000');
    lines.push('RC7_MIN         1000');
    lines.push('RC7_TRIM        1500');
    lines.push('RC8_MAX         2000');
    lines.push('RC8_MIN         1000');
    lines.push('RC8_TRIM        1500');
    lines.push('FLTMODE1        10'); // AUTO
    lines.push('FLTMODE2        11'); // RTL
    lines.push('FLTMODE3        12'); // LOITER
    lines.push('FLTMODE4        5');  // FBWA
    lines.push('FLTMODE5        2');  // STABILIZE
    lines.push('FLTMODE6        0');  // MANUAL
    lines.push('FLTMODE_CH      8');
    lines.push('WP_LOITER_RAD   80');
    lines.push('WP_RADIUS       50');
    lines.push('RLL2SRV_RMAX    90');
    lines.push('RLL2SRV_TCONST  0.250000');
    lines.push('RLL_RATE_D      0.017430');
    lines.push('RLL_RATE_FF     0.237212');
    lines.push('RLL_RATE_I      0.25');
    lines.push('RLL_RATE_P      0.3');
    lines.push('PTCH2SRV_RMAX_DN 90');
    lines.push('PTCH2SRV_RMAX_UP 90');
    lines.push('PTCH2SRV_TCONST  0.25');
    lines.push('PTCH_RATE_D     0.007265');
    lines.push('PTCH_RATE_FF    0.595723');
    lines.push('PTCH_RATE_I     0.11');
    lines.push('PTCH_RATE_P     0.15');
    lines.push('PTCH2SRV_RLL    1');
    lines.push('NAVL1_PERIOD    15');
    lines.push('ACRO_LOCKING    1');
    lines.push('INS_ACCOFFS_X   0.001');
    lines.push('INS_ACCOFFS_Y   0.001');
    lines.push('INS_ACCOFFS_Z   0.001');
    lines.push('INS_ACCSCAL_X   1.001');
    lines.push('INS_ACCSCAL_Y   1.001');
    lines.push('INS_ACCSCAL_Z   1.001');
    lines.push('INS_ACC2OFFS_X  0.001');
    lines.push('INS_ACC2OFFS_Y  0.001');
    lines.push('INS_ACC2OFFS_Z  0.001');
    lines.push('INS_ACC2SCAL_X  1.001');
    lines.push('INS_ACC2SCAL_Y  1.001');
    lines.push('INS_ACC2SCAL_Z  1.001');
    lines.push('INS_GYR_CAL     0');

    // Layered on top of upstream defaults ----------------------------------

    // Disable RC failsafe in SITL: our UDP RC sender isn't recognized as
    // live RC → SHORT failsafe → CIRCLE, and LONG failsafe → RTL after 20s.
    //   https://discuss.ardupilot.org/t/fs-long-actn-and-fs-short-actn/77900
    lines.push('THR_FAILSAFE    0');
    lines.push('FS_SHORT_ACTN   0');
    lines.push('FS_LONG_ACTN    0');

    // TAKEOFF mode tuning so the plane actually climbs when mode switches
    // to TAKEOFF (13). Without these, plane ground-rolls forever without
    // rotating, or holds wings level past the target altitude.
    //   https://ardupilot.org/plane/docs/automatic-takeoff.html
    lines.push('TKOFF_ROTATE_SPD 12');
    lines.push('TKOFF_LVL_ALT   2');
    lines.push('TECS_PITCH_MAX  20');
    lines.push('TKOFF_THR_MAX   100');
    lines.push('TKOFF_THR_MINACC 0');
    lines.push('TKOFF_THR_MINSPD 0');

    // VTOL/quadplane/tailsitter only: enable Q-mode operations inside GUIDED.
    // Without this, NAV_VTOL_TAKEOFF in GUIDED is silently ignored — vehicle
    // stays armed at 0% throttle and never lifts. The param is harmless on
    // pure-plane builds where Q_ENABLE=0 (FCU just doesn't register it).
    //   https://ardupilot.org/plane/docs/parameters.html#q-guided-mode
    lines.push('Q_GUIDED_MODE   1');
  }

  // Sim-calmness for every vehicle (no wind).
  lines.push('SIM_WIND_SPD 0');
  lines.push('SIM_WIND_DIR 0');
  lines.push('SIM_WIND_T 0');
  // Simulated battery: must be set in defaults so SITL initializes the SOC
  // model on every boot. Runtime PARAM_SET on SIM_BATT_VOLTAGE alone does
  // NOT re-initialize the simulated battery; only SIM_BATT_CAP_AH change
  // resets state of charge. Writing both here forces a fresh init at boot.
  //
  // CRITICAL: SIM_BATT_VOLTAGE feeds the SITL motor model. Thrust scales with
  // supply voltage relative to the frame's reference voltage. The built-in
  // `-M<model>` frames (quad/hexa/plane/etc.) are calibrated around a ~12.6V (3S)
  // reference, so a higher default over-drives them: hover throttle produces
  // several times the intended thrust and the vehicle rockets past its takeoff
  // target and oscillates (a 14S/60.9V default made a 10m NAV_TAKEOFF climb to
  // >1200m). Keep the default matched to the built-in frames' reference. A high
  // industrial-pack voltage is only safe when paired with a custom frame whose
  // refVoltage matches, so pass it explicitly via simBattVoltage in that case.
  const battV = typeof simBattVoltage === 'number' && simBattVoltage > 0 ? simBattVoltage : 12.6;
  const battAh = typeof simBattCapAh === 'number' && simBattCapAh > 0 ? simBattCapAh : 10;
  lines.push(`SIM_BATT_VOLTAGE ${battV}`);
  lines.push(`SIM_BATT_CAP_AH ${battAh}`);
  // Disable SITL terrain model. If user picks a home location at a real-world
  // spot with high terrain (mountains), spawning at alt=0 AMSL puts the
  // vehicle below ground and AGL goes negative ("flying underground"). With
  // terrain disabled, SITL treats ground as flat at home altitude everywhere.
  lines.push('TERRAIN_ENABLE 0');
  lines.push('SIM_TERRAIN 0');

  return lines.join('\n');
}

class ArduPilotSitlProcessManager {
  private process: ChildProcess | null = null;
  private _isRunning = false;
  private mainWindow: BrowserWindow | null = null;
  private _currentConfig: ArduPilotSitlConfig | null = null;

  get isRunning(): boolean {
    return this._isRunning;
  }

  get currentConfig(): ArduPilotSitlConfig | null {
    return this._currentConfig;
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

    // ArduDeck in-app simulator: SITL uses our headless engine as its external
    // flight dynamics model. The engine binds UDP 9002 and runs our 6DOF
    // physics; SITL just streams servo PWM to it and reads state back.
    if (config.useArduDeckSim) {
      args.push('-MJSON:127.0.0.1');
    } else if (config.customFramePath && config.customFrameMotors) {
    // Custom frame JSON overrides the built-in -M model when provided. SITL
    // expects `<type>:<absolute path>` where type is the physics class
    // (quad/hexa/octa) — derived from the frame's motor count.
      const typePrefix =
        config.customFrameMotors === 8 ? 'octa' :
        config.customFrameMotors === 6 ? 'hexa' :
        'quad';
      args.push(`-M${typePrefix}:${config.customFramePath}`);
    } else {
      const model = config.model || DEFAULT_MODELS[config.vehicleType];
      args.push(`-M${model}`);
    }

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
    if (config.useArduDeckSim && !simEngineProcess.isBinaryAvailable()) {
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
      const model = config.model || DEFAULT_MODELS[config.vehicleType];
      const defaultsStack: string[] = [];

      if (!config.defaultsFile) {
        try {
          const { resolveDefaultsFile } = await import('./frame-config.js');
          const upstream = await resolveDefaultsFile(config.vehicleType, model);
          if (upstream) defaultsStack.push(upstream);
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
      const overlay = frameBattLines.length > 0
        ? `${overlayBase}\n${frameBattLines.join('\n')}`
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
      if (config.useArduDeckSim) {
        const engineKind =
          config.vehicleType === 'plane' ? 'plane' :
          config.vehicleType === 'rover' ? 'rover' : 'copter';
        const windIntensity = config.simWindIntensity ?? 0;
        // Feed authored obstacles for the active site into the engine so it
        // models real wake turbulence around them. None => no arg (unchanged).
        const obstaclesPath = await writeObstaclesFileForSite(config.homeLocation).catch((err) => {
          console.warn('[SITL] could not stage sim obstacles for engine:', err);
          return undefined;
        });
        const engineResult = await simEngineProcess.start({
          kind: engineKind,
          framePath: config.customFramePath,
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
      const env = { ...process.env };

      // Windows: Add Cygwin DLLs to PATH
      if (process.platform === 'win32') {
        const cygwinPath = this.getCygwinDllPath();
        env.PATH = `${cygwinPath};${env.PATH}`;
      }

      // Reap any stale SITL still holding the MAVLink TCP port. A previous crash
      // or a dev hot-reload can orphan an arducopter/plane/rover process that
      // stop() never reached; it keeps port 5760 bound and the new SITL dies with
      // "bind failed on port 5760 - Address already in use". Kill only an
      // ArduPilot SITL binary, matched by name, so nothing unrelated is touched.
      await this.reapStaleSitl(5760);

      this.process = spawn(spawnCmd, args, {
        cwd: path.dirname(binaryPath),
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
      });
      this._isRunning = true;
      const launchedAt = Date.now();
      // Snapshot the active config now so the exit handler can attribute the
      // crash to the (vehicle, model, track) tuple even after _currentConfig
      // has been cleared.
      const launchedVehicleType = config.vehicleType;
      const launchedModel = config.model || DEFAULT_MODELS[config.vehicleType];
      const launchedTrack = config.releaseTrack;

      this.process.stdout?.on('data', (data: Buffer) => {
        this.sendToRenderer(IPC_CHANNELS.ARDUPILOT_SITL_STDOUT, data.toString());
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        this.sendToRenderer(IPC_CHANNELS.ARDUPILOT_SITL_STDERR, data.toString());
      });

      this.process.on('error', (error: Error) => {
        console.error('ArduPilot SITL process error:', error);
        this._isRunning = false;
        this.sendToRenderer(IPC_CHANNELS.ARDUPILOT_SITL_ERROR, error.message);
      });

      this.process.on('exit', (code: number | null, signal: string | null) => {
        this._isRunning = false;
        this.process = null;
        this._currentConfig = null;
        // If SITL dies, tear down the sim engine too so it isn't orphaned.
        simEngineProcess.stop();
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
        });
      });

      return { success: true, command: commandString };
    } catch (err) {
      console.error('Failed to start ArduPilot SITL:', err);
      this._isRunning = false;
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  /**
   * Kill any stale ArduPilot SITL process still bound to the MAVLink TCP port.
   * Matches by binary name (arducopter/arduplane/ardurover) so it never touches
   * an unrelated process that happens to hold the port. macOS/Linux only (uses
   * lsof); a no-op on Windows.
   */
  private async reapStaleSitl(tcpPort: number): Promise<void> {
    if (process.platform === 'win32') return;
    try {
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const run = promisify(execFile);
      const { stdout } = await run('lsof', ['-ti', `TCP:${tcpPort}`]).catch(() => ({ stdout: '' }));
      const pids = stdout.split('\n').map((s) => s.trim()).filter(Boolean);
      const SITL_BINARIES = ['arducopter', 'arduplane', 'ardurover', 'ardusub'];
      let reaped = 0;
      for (const pid of pids) {
        const { stdout: cmd } = await run('ps', ['-o', 'command=', '-p', pid]).catch(() => ({ stdout: '' }));
        if (!SITL_BINARIES.some((b) => cmd.toLowerCase().includes(b))) continue;
        try {
          process.kill(Number(pid), 'SIGKILL');
          reaped++;
        } catch {
          /* already gone */
        }
      }
      if (reaped > 0) {
        console.log(`[sitl] reaped ${reaped} stale SITL process(es) on TCP ${tcpPort}`);
        // Give the OS a moment to release the port before SITL binds it.
        await new Promise((r) => setTimeout(r, 300));
      }
    } catch (err) {
      console.warn('[sitl] reapStaleSitl failed (continuing):', err);
    }
  }

  stop(): void {
    // Tear down the in-app sim engine alongside SITL (no-op if not running).
    simEngineProcess.stop();
    // Capture the child in a LOCAL so the SIGKILL escalation still targets it
    // after we null `this.process` below. Reading `this.process` inside the
    // timer was always null by the time it fired, so SITL (which routinely
    // ignores SIGTERM) never got SIGKILLed - it survived Stop, kept port 5760
    // bound, and the next Start couldn't bind ("can't connect after restart").
    const proc = this.process;
    if (proc) {
      try {
        proc.kill('SIGTERM');
        setTimeout(() => {
          try {
            proc.kill('SIGKILL');
          } catch {
            // Already dead
          }
        }, 2000);
      } catch (err) {
        console.error('Failed to kill ArduPilot SITL process:', err);
      }
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
    simEngineProcess.stop();
    const proc = this.process;
    if (!proc) return;
    return new Promise<void>((resolve) => {
      let settled = false;
      const settle = () => { if (!settled) { settled = true; resolve(); } };
      proc.once('exit', settle);
      try {
        proc.kill('SIGTERM');
        setTimeout(() => {
          try { proc.kill('SIGKILL'); } catch { /* already dead */ }
        }, 2000);
      } catch { /* ignore */ }
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
    if (!cfg) return { success: false, error: 'No active SITL config to restart with' };
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
