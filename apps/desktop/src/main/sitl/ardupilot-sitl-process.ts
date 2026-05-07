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
import type {
  ArduPilotSitlConfig,
  ArduPilotSitlStatus,
  ArduPilotVehicleType,
  ArduPilotReleaseTrack,
} from '../../shared/ipc-channels.js';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';
import { ardupilotSitlDownloader } from './ardupilot-sitl-downloader.js';

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
function generateDefaultParams(
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
  // Default to a realistic 14S Li-Ion (heavy industrial multirotor). Override via
  // simBattVoltage/simBattCapAh in the SITL config when we add UI fields.
  const battV = typeof simBattVoltage === 'number' && simBattVoltage > 0 ? simBattVoltage : 60.9;
  const battAh = typeof simBattCapAh === 'number' && simBattCapAh > 0 ? simBattCapAh : 56;
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

    // Custom frame JSON overrides the built-in -M model when provided. SITL
    // expects `<type>:<absolute path>` where type is the physics class
    // (quad/hexa/octa) — derived from the frame's motor count.
    if (config.customFramePath && config.customFrameMotors) {
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

      const overlay = generateDefaultParams(
        config.vehicleType,
        model,
        config.simBattVoltage,
        config.simBattCapAh,
      );
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
      if (config.customFramePath) {
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

      this.process = spawn(spawnCmd, args, {
        cwd: path.dirname(binaryPath),
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        // Run the binary directly on all platforms. Using shell on Windows
        // breaks launches for userData paths that include spaces/non-ASCII.
        shell: false,
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

  stop(): void {
    if (this.process) {
      try {
        this.process.kill('SIGTERM');

        setTimeout(() => {
          if (this.process) {
            try {
              this.process.kill('SIGKILL');
            } catch {
              // Already dead
            }
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
    };
  }

  private sendToRenderer(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }
}

export const ardupilotSitlProcess = new ArduPilotSitlProcessManager();
