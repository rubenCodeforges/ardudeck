/**
 * SITL Process Manager
 * Manages iNav/Betaflight SITL simulator process lifecycle
 */

import { spawn, ChildProcess } from 'node:child_process';
import { app, BrowserWindow } from 'electron';
import { access, chmod } from 'node:fs/promises';
import path from 'node:path';

export interface SitlConfig {
  /** Profile name (e.g., "Airplane", "Quadcopter") */
  profileName?: string;
  /** EEPROM filename for persistent config storage */
  eepromFileName: string;
  /** Simulator type for Phase 2: 'xp' (X-Plane) or 'rf' (RealFlight) */
  simulator?: 'xp' | 'rf';
  /** Use IMU data from simulator */
  useImu?: boolean;
  /** Simulator IP address */
  simIp?: string;
  /** Simulator port */
  simPort?: number;
  /** Channel mapping string (e.g., "M01-01,S01-02") */
  channelMap?: string;
  /** Serial port for RX passthrough */
  serialPort?: string;
  /** Serial baud rate */
  baudRate?: number;
  /** Serial stop bits */
  stopBits?: 'One' | 'Two';
  /** Serial parity */
  parity?: 'None' | 'Even' | 'Odd';
  /** Serial UART number for RX */
  serialUart?: number;
}

class SitlProcessManager {
  private process: ChildProcess | null = null;
  private _isRunning = false;
  private mainWindow: BrowserWindow | null = null;
  private _currentProfileName: string | null = null;

  get isRunning(): boolean {
    return this._isRunning;
  }

  get currentProfileName(): string | null {
    return this._currentProfileName;
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  /**
   * Get the platform-specific SITL binary path
   */
  private getSitlBinaryPath(): string {
    const basePath = app.isPackaged
      ? path.join(app.getAppPath() + '.unpacked', 'resources', 'sitl')
      : path.join(app.getAppPath(), 'resources', 'sitl');

    const platform = process.platform;
    const arch = process.arch;

    if (platform === 'win32') {
      return path.join(basePath, 'windows', 'inav_SITL.exe');
    } else if (platform === 'linux') {
      if (arch === 'arm64') {
        return path.join(basePath, 'linux', 'arm64', 'inav_SITL');
      }
      return path.join(basePath, 'linux', 'inav_SITL');
    } else if (platform === 'darwin') {
      return path.join(basePath, 'macos', 'inav_SITL');
    }

    throw new Error(`Unsupported platform: ${platform}`);
  }

  /**
   * Get the path for EEPROM storage
   */
  private getEepromPath(filename: string): string {
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, 'sitl', filename);
  }

  /**
   * Ensure SITL directory exists in userData
   */
  private async ensureSitlDir(): Promise<void> {
    const sitlDir = path.join(app.getPath('userData'), 'sitl');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(sitlDir, { recursive: true });
  }

  /**
   * Start the SITL process
   */
  async start(config: SitlConfig): Promise<string> {
    if (this._isRunning) {
      this.stop();
    }

    await this.ensureSitlDir();

    // Store profile name for auto-configuration on connect
    this._currentProfileName = config.profileName || null;

    const sitlPath = this.getSitlBinaryPath();
    const eepromPath = this.getEepromPath(config.eepromFileName);

    // Build command line arguments
    const args: string[] = [];
    args.push(`--path=${eepromPath}`);

    // Phase 2: Simulator integration
    if (config.simulator) {
      args.push(`--sim=${config.simulator}`);

      if (config.useImu) {
        args.push('--useimu');
      }

      if (config.simIp) {
        args.push(`--simip=${config.simIp}`);
      }

      if (config.simPort) {
        args.push(`--simport=${config.simPort}`);
      }

      if (config.channelMap) {
        args.push(`--chanmap=${config.channelMap}`);
      }
    }

    // Phase 2: Serial RX passthrough
    if (config.serialPort) {
      args.push(`--serialport=${config.serialPort}`);

      if (config.baudRate) {
        args.push(`--baudrate=${config.baudRate}`);
      }

      if (config.stopBits) {
        args.push(`--stopbits=${config.stopBits}`);
      }

      if (config.parity) {
        args.push(`--parity=${config.parity}`);
      }

      if (config.serialUart !== undefined) {
        args.push(`--serialuart=${config.serialUart}`);
      }
    }

    // Verify SITL binary exists before attempting spawn
    try {
      await access(sitlPath);
    } catch {
      const msg = `SITL binary not found at: ${sitlPath}`;
      console.error('[SITL]', msg);
      this._isRunning = false;
      throw new Error(msg);
    }

    // Make binary executable on Unix platforms
    if (process.platform !== 'win32') {
      try {
        await chmod(sitlPath, 0o755);
      } catch (err) {
        console.error('Failed to chmod SITL binary:', err);
      }
    }

    // Build the command string for logging
    const commandString = `${sitlPath} ${args.join(' ')}\n`;

    // Spawn options - cwd must be binary directory for SITL to work properly
    // Explicitly set stdio to pipe to ensure we can capture output
    // Only override PATH on Unix - Windows needs its system PATH for DLL resolution (e.g. cygwin1.dll)
    const spawnEnv = process.platform === 'win32'
      ? { ...process.env }
      : { ...process.env, PATH: '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin' };

    const spawnOptions = {
      cwd: path.dirname(sitlPath),
      stdio: ['pipe', 'pipe', 'pipe'] as ['pipe', 'pipe', 'pipe'],
      env: spawnEnv,
    };


    try {
      this.process = spawn(sitlPath, args, spawnOptions);
      this._isRunning = true;


      // Forward stdout to renderer AND main process log
      this.process!.stdout?.on('data', (data: Buffer) => {
        const text = data.toString();
        this.sendToRenderer('sitl:stdout', text);
      });

      // Forward stderr to renderer AND main process log
      this.process!.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        this.sendToRenderer('sitl:stderr', text);
      });

      // Handle process errors
      this.process!.on('error', (error: Error) => {
        console.error('SITL process error:', error);
        this._isRunning = false;
        this.sendToRenderer('sitl:error', error.message);
      });

      // Handle process exit
      this.process!.on('exit', (code: number | null, signal: string | null) => {
        this._isRunning = false;
        this.process = null;
        this.sendToRenderer('sitl:exit', { code, signal });
      });

      return commandString;
    } catch (err) {
      console.error('Failed to start SITL:', err);
      this._isRunning = false;
      throw err;
    }
  }

  /**
   * Stop the SITL process
   */
  stop(): void {
    if (this.process) {
      try {
        this.process.kill();
      } catch (err) {
        console.error('Failed to kill SITL process:', err);
      }
      this.process = null;
      this._isRunning = false;
      this._currentProfileName = null;
    }
  }

  /**
   * Delete an EEPROM file
   */
  async deleteEeprom(filename: string): Promise<void> {
    const { rm } = await import('node:fs/promises');
    const eepromPath = this.getEepromPath(filename);
    try {
      await rm(eepromPath);
    } catch (err) {
      console.error('Failed to delete EEPROM file:', err);
    }
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
export const sitlProcess = new SitlProcessManager();
