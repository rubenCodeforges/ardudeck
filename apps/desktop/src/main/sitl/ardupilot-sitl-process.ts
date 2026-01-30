/**
 * ArduPilot SITL Process Manager
 * Manages ArduPilot SITL (Software-In-The-Loop) simulator process lifecycle
 */

import { spawn, ChildProcess } from 'node:child_process';
import { app, BrowserWindow } from 'electron';
import { chmod } from 'node:fs/promises';
import path from 'node:path';
import type {
  ArduPilotSitlConfig,
  ArduPilotSitlStatus,
  ArduPilotVehicleType,
} from '../../shared/ipc-channels.js';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';

/**
 * Map vehicle type to binary name
 */
const VEHICLE_BINARY_MAP: Record<ArduPilotVehicleType, string> = {
  copter: 'ArduCopter',
  plane: 'ArduPlane',
  rover: 'ArduRover',
  sub: 'ArduSub',
};

/**
 * Map vehicle type to default model
 */
const DEFAULT_MODELS: Record<ArduPilotVehicleType, string> = {
  copter: 'quad',
  plane: 'plane',
  rover: 'rover',
  sub: 'vectored',
};

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

  /**
   * Check if Docker is available (for macOS)
   */
  async isDockerAvailable(): Promise<boolean> {
    if (process.platform !== 'darwin') return false;

    try {
      const { execSync } = await import('node:child_process');
      execSync('docker --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if the current platform supports ArduPilot SITL
   */
  isPlatformSupported(): { supported: boolean; useDocker: boolean; error?: string } {
    const platform = process.platform;

    if (platform === 'darwin') {
      // macOS uses Docker
      return { supported: true, useDocker: true };
    }

    if (platform === 'win32' || platform === 'linux') {
      return { supported: true, useDocker: false };
    }

    return {
      supported: false,
      useDocker: false,
      error: `Unsupported platform: ${platform}`,
    };
  }

  /**
   * Get the platform-specific SITL binary path
   */
  getBinaryPath(vehicleType: ArduPilotVehicleType, releaseTrack: string): string {
    const userDataPath = app.getPath('userData');
    const binaryName = VEHICLE_BINARY_MAP[vehicleType];
    const platform = process.platform;

    // Structure: userData/ardupilot-sitl/{track}/{vehicle}/{binary}
    const basePath = path.join(userDataPath, 'ardupilot-sitl', releaseTrack, vehicleType);

    if (platform === 'win32') {
      // On Windows, we need Cygwin. Binary is .exe
      return path.join(basePath, `${binaryName}.exe`);
    } else {
      // On Linux, it's an ELF binary (macOS uses Docker with Linux binary)
      return path.join(basePath, `${binaryName}.elf`);
    }
  }

  /**
   * Get Cygwin DLL directory (Windows only)
   */
  private getCygwinDllPath(): string {
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, 'ardupilot-sitl', 'cygwin');
  }

  /**
   * Build command line arguments for SITL
   */
  private buildArgs(config: ArduPilotSitlConfig): string[] {
    const args: string[] = [];

    // Model/frame type (-M<model>)
    const model = config.model || DEFAULT_MODELS[config.vehicleType];
    args.push(`-M${model}`);

    // Home location (-O<lat,lng,alt,hdg>)
    const { lat, lng, alt, heading } = config.homeLocation;
    args.push(`-O${lat},${lng},${alt},${heading}`);

    // Serial port 0 as TCP server (--serial0 tcp:0 means listen on first available port starting from 5760)
    args.push('--serial0', 'tcp:0');

    // Speedup (-s<n>)
    if (config.speedup && config.speedup > 1) {
      args.push(`-s${config.speedup}`);
    }

    // Wipe EEPROM (--wipe)
    if (config.wipeOnStart) {
      args.push('--wipe');
    }

    // Simulator integration
    if (config.simulator && config.simulator !== 'none') {
      args.push('--sim', config.simulator);
      if (config.simAddress) {
        args.push('--sim-address', config.simAddress);
      }
    }

    // Default parameters file
    if (config.defaultsFile) {
      args.push('--defaults', config.defaultsFile);
    }

    return args;
  }

  /**
   * Build Docker command for macOS
   */
  private buildDockerArgs(config: ArduPilotSitlConfig, binaryPath: string): string[] {
    const binaryName = VEHICLE_BINARY_MAP[config.vehicleType];
    const model = config.model || DEFAULT_MODELS[config.vehicleType];
    const { lat, lng, alt, heading } = config.homeLocation;

    // Docker run with:
    // - Remove container after exit
    // - Map TCP port 5760 for MAVLink
    // - Map UDP port 5501 for RC input
    // - Mount the binary directory
    // - Use a minimal Linux image that can run ELF binaries
    const dockerArgs = [
      'run', '--rm',
      '-p', '5760:5760',
      '-p', '5501:5501/udp',
      '-v', `${path.dirname(binaryPath)}:/sitl:ro`,
      '-w', '/sitl',
      '--name', 'ardupilot-sitl',
      'ubuntu:22.04',
      `/sitl/${binaryName}.elf`,
      `-M${model}`,
      `-O${lat},${lng},${alt},${heading}`,
      '--serial0', 'tcp:0.0.0.0:5760',
    ];

    // Add speedup
    if (config.speedup && config.speedup > 1) {
      dockerArgs.push(`-s${config.speedup}`);
    }

    // Add wipe flag
    if (config.wipeOnStart) {
      dockerArgs.push('--wipe');
    }

    return dockerArgs;
  }

  /**
   * Start the ArduPilot SITL process
   */
  async start(config: ArduPilotSitlConfig): Promise<{ success: boolean; command?: string; error?: string }> {
    if (this._isRunning) {
      this.stop();
    }

    // Check platform support first
    const platformCheck = this.isPlatformSupported();
    if (!platformCheck.supported) {
      return {
        success: false,
        error: platformCheck.error,
      };
    }

    try {
      const binaryPath = this.getBinaryPath(config.vehicleType, config.releaseTrack);

      // Check if binary exists
      const { access } = await import('node:fs/promises');
      try {
        await access(binaryPath);
      } catch {
        return {
          success: false,
          error: `SITL binary not found at ${binaryPath}. Please download it first.`,
        };
      }

      // macOS: Check Docker availability
      if (platformCheck.useDocker) {
        const dockerAvailable = await this.isDockerAvailable();
        if (!dockerAvailable) {
          return {
            success: false,
            error: 'Docker is required for ArduPilot SITL on macOS. Please install Docker Desktop.',
          };
        }
      }

      // Make binary executable (needed for Docker volume mount too)
      if (process.platform !== 'win32') {
        try {
          await chmod(binaryPath, 0o755);
        } catch (err) {
          console.error('Failed to chmod SITL binary:', err);
        }
      }

      this._currentConfig = config;

      let commandString: string;
      let spawnCmd: string;
      let spawnArgs: string[];

      if (platformCheck.useDocker) {
        // macOS: Use Docker
        spawnCmd = 'docker';
        spawnArgs = this.buildDockerArgs(config, binaryPath);
        commandString = `docker ${spawnArgs.join(' ')}`;
      } else {
        // Linux/Windows: Run binary directly
        const args = this.buildArgs(config);
        spawnCmd = binaryPath;
        spawnArgs = args;
        commandString = `${binaryPath} ${args.join(' ')}`;
      }

      // Environment setup
      const env = { ...process.env };

      // Windows: Add Cygwin DLLs to PATH
      if (process.platform === 'win32') {
        const cygwinPath = this.getCygwinDllPath();
        env.PATH = `${cygwinPath};${env.PATH}`;
      }

      // Spawn options
      const spawnOptions = {
        cwd: path.dirname(binaryPath),
        env,
        stdio: ['pipe', 'pipe', 'pipe'] as const,
        shell: process.platform === 'win32',
      };

      this.process = spawn(spawnCmd, spawnArgs, spawnOptions);
      this._isRunning = true;

      // Forward stdout to renderer
      this.process.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        this.sendToRenderer(IPC_CHANNELS.ARDUPILOT_SITL_STDOUT, text);
      });

      // Forward stderr to renderer
      this.process.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        this.sendToRenderer(IPC_CHANNELS.ARDUPILOT_SITL_STDERR, text);
      });

      // Handle process errors
      this.process.on('error', (error: Error) => {
        console.error('ArduPilot SITL process error:', error);
        this._isRunning = false;
        this.sendToRenderer(IPC_CHANNELS.ARDUPILOT_SITL_ERROR, error.message);
      });

      // Handle process exit
      this.process.on('exit', (code: number | null, signal: string | null) => {
        this._isRunning = false;
        this.process = null;
        this._currentConfig = null;
        this.sendToRenderer(IPC_CHANNELS.ARDUPILOT_SITL_EXIT, { code, signal });
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
   * Stop the ArduPilot SITL process
   */
  stop(): void {
    // On macOS, also stop the Docker container
    if (process.platform === 'darwin') {
      try {
        const { execSync } = require('node:child_process');
        execSync('docker stop ardupilot-sitl', { stdio: 'ignore' });
      } catch {
        // Container may not exist or already stopped
      }
    }

    if (this.process) {
      try {
        // Send SIGTERM first for graceful shutdown
        this.process.kill('SIGTERM');

        // Force kill after 2 seconds if still running
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
   * Get current status
   */
  getStatus(): ArduPilotSitlStatus {
    return {
      isRunning: this._isRunning,
      pid: this.process?.pid,
      vehicleType: this._currentConfig?.vehicleType,
      tcpPort: 5760, // Default port
    };
  }

  /**
   * Send message to renderer process
   */
  private sendToRenderer(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }
}

// Singleton instance
export const ardupilotSitlProcess = new ArduPilotSitlProcessManager();
