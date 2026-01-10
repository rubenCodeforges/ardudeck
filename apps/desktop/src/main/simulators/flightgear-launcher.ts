/**
 * FlightGear Launcher
 *
 * Manages launching and stopping FlightGear with the correct arguments
 * for integration with ArduDeck's protocol bridge.
 */

import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { app } from 'electron';
import { detectFlightGear } from './simulator-detector';

export interface FlightGearConfig {
  // Aircraft selection
  aircraft: string;           // e.g., 'c172p' (Cessna 172)

  // Location
  airport?: string;           // e.g., 'KSFO'
  runway?: string;            // e.g., '28L'
  lat?: number;               // Custom latitude
  lon?: number;               // Custom longitude
  altitude?: number;          // Starting altitude in feet

  // Environment
  timeOfDay?: 'dawn' | 'morning' | 'noon' | 'afternoon' | 'dusk' | 'evening' | 'midnight';
  season?: 'summer' | 'winter';

  // Network config for ArduDeck bridge
  bridgeHost?: string;        // Default: 127.0.0.1
  bridgeOutPort?: number;     // FG → Bridge (Default: 5505)
  bridgeInPort?: number;      // Bridge → FG (Default: 5506)
  updateRate?: number;        // Hz (Default: 60)

  // Window settings
  fullscreen?: boolean;
  geometry?: string;          // e.g., '1280x720'
}

// Default aircraft options
export const FLIGHTGEAR_AIRCRAFT = [
  { id: 'c172p', name: 'Cessna 172P Skyhawk' },
  { id: 'c182s', name: 'Cessna 182S Skylane' },
  { id: 'pa28-161', name: 'Piper PA-28-161 Warrior' },
  { id: 'j3cub', name: 'Piper J-3 Cub' },
  { id: 'dr400', name: 'Robin DR400' },
  { id: 'ufo', name: 'UFO (Testing)' },
] as const;

// Popular airports
export const FLIGHTGEAR_AIRPORTS = [
  { id: 'KSFO', name: 'San Francisco International' },
  { id: 'KLAX', name: 'Los Angeles International' },
  { id: 'KJFK', name: 'New York JFK' },
  { id: 'KORD', name: 'Chicago O\'Hare' },
  { id: 'EGLL', name: 'London Heathrow' },
  { id: 'LFPG', name: 'Paris Charles de Gaulle' },
  { id: 'EDDF', name: 'Frankfurt Airport' },
] as const;

class FlightGearLauncher {
  private process: ChildProcess | null = null;
  private config: FlightGearConfig | null = null;

  /**
   * Check if FlightGear is currently running
   */
  isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }

  /**
   * Get the current configuration
   */
  getConfig(): FlightGearConfig | null {
    return this.config;
  }

  /**
   * Get user-writable data directory for ArduDeck FlightGear files
   * This avoids permission issues when FlightGear is installed in Program Files
   */
  private getUserDataDir(): string {
    const platform = process.platform;
    let baseDir: string;

    if (platform === 'win32') {
      // Windows: Use AppData/Roaming
      baseDir = process.env.APPDATA || join(process.env.USERPROFILE || '', 'AppData', 'Roaming');
    } else if (platform === 'darwin') {
      // macOS: Use ~/Library/Application Support
      baseDir = join(process.env.HOME || '', 'Library', 'Application Support');
    } else {
      // Linux: Use ~/.local/share
      baseDir = process.env.XDG_DATA_HOME || join(process.env.HOME || '', '.local', 'share');
    }

    return join(baseDir, 'ArduDeck', 'flightgear');
  }

  /**
   * Install ArduDeck protocol files to a user-writable directory
   * Returns the path to the data directory that should be added with --data
   */
  private installProtocolFiles(): string {
    // Use user-writable directory to avoid permission issues on Windows
    const userDataDir = this.getUserDataDir();
    const protocolDir = join(userDataDir, 'Protocol');

    // Ensure Protocol directory exists
    if (!existsSync(protocolDir)) {
      mkdirSync(protocolDir, { recursive: true });
    }

    // Get path to bundled protocol files
    // In development: resources/flightgear/Protocol/
    // In production: app.getAppPath()/resources/flightgear/Protocol/
    const isDev = !app.isPackaged;
    const resourcesPath = isDev
      ? join(app.getAppPath(), 'resources', 'flightgear', 'Protocol')
      : join(process.resourcesPath, 'flightgear', 'Protocol');

    const files = ['ardudeck-out.xml', 'ardudeck-in.xml'];

    for (const file of files) {
      const srcPath = join(resourcesPath, file);
      const destPath = join(protocolDir, file);

      if (existsSync(srcPath)) {
        try {
          copyFileSync(srcPath, destPath);
          console.log(`[FlightGear] Installed protocol file: ${file} to ${destPath}`);
        } catch (err) {
          console.warn(`[FlightGear] Could not copy ${file}:`, err);
        }
      } else {
        console.warn(`[FlightGear] Protocol file not found: ${srcPath}`);
      }
    }

    return userDataDir;
  }

  /**
   * Build command line arguments for FlightGear
   * @param config FlightGear configuration
   * @param userDataDir Path to user-writable data directory with our protocol files
   */
  private buildArgs(config: FlightGearConfig, userDataDir: string): string[] {
    const args: string[] = [];

    // DON'T set --fg-root explicitly - let FlightGear use its defaults
    // This preserves access to downloaded scenery/aircraft data in user directories

    // Add user data directory as additional data path (for our protocol files)
    // This allows FlightGear to find ardudeck-out.xml and ardudeck-in.xml
    // without needing write access to Program Files
    args.push(`--data=${userDataDir}`);

    // Aircraft
    args.push(`--aircraft=${config.aircraft}`);

    // Location
    if (config.airport) {
      args.push(`--airport=${config.airport}`);
      if (config.runway) {
        args.push(`--runway=${config.runway}`);
      }
    } else if (config.lat !== undefined && config.lon !== undefined) {
      args.push(`--lat=${config.lat}`);
      args.push(`--lon=${config.lon}`);
      if (config.altitude) {
        args.push(`--altitude=${config.altitude}`);
      }
    }

    // Time of day
    if (config.timeOfDay) {
      args.push(`--timeofday=${config.timeOfDay}`);
    }

    // Season
    if (config.season) {
      args.push(`--season=${config.season}`);
    }

    // Network protocol for ArduDeck bridge
    const host = config.bridgeHost || '127.0.0.1';
    const outPort = config.bridgeOutPort || 5505;
    const inPort = config.bridgeInPort || 5506;
    const rate = config.updateRate || 60;

    // Output: FlightGear → ArduDeck (sensor data)
    // Using generic protocol with our custom XML definition
    args.push(`--generic=socket,out,${rate},${host},${outPort},udp,ardudeck-out`);

    // Input: ArduDeck → FlightGear (control surfaces)
    args.push(`--generic=socket,in,${rate},${host},${inPort},udp,ardudeck-in`);

    // Disable AI traffic for performance
    args.push('--disable-ai-traffic');
    args.push('--disable-random-objects');

    // Window settings
    if (config.fullscreen) {
      args.push('--enable-fullscreen');
    } else if (config.geometry) {
      args.push(`--geometry=${config.geometry}`);
    }

    // Enable HTTP server for additional control (optional)
    args.push('--httpd=8080');

    // Disable splash screen for faster startup
    args.push('--disable-splash-screen');

    return args;
  }

  /**
   * Launch FlightGear
   * @param config FlightGear configuration
   * @param customPath Optional user-specified path to FlightGear executable
   */
  async launch(config: FlightGearConfig, customPath?: string): Promise<{ success: boolean; error?: string }> {
    // Check if already running
    if (this.isRunning()) {
      return { success: false, error: 'FlightGear is already running' };
    }

    // Detect FlightGear installation (use custom path if provided)
    const fgInfo = await detectFlightGear(customPath);
    if (!fgInfo.installed || !fgInfo.executable || !fgInfo.path) {
      return { success: false, error: 'FlightGear not found. Please install FlightGear or set a custom path.' };
    }

    // Install our protocol files to a user-writable directory
    // This returns the path that we'll add with --data option
    const userDataDir = this.installProtocolFiles();

    // Build arguments (includes --data pointing to our protocol files)
    // We don't set --fg-root to let FlightGear use its defaults (preserves downloaded data)
    const args = this.buildArgs(config, userDataDir);

    console.log('[FlightGear] Launching with args:', args.join(' '));

    try {
      // Spawn FlightGear process
      // Don't override FG_ROOT env var - let FlightGear use its defaults
      this.process = spawn(fgInfo.executable, args, {
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.config = config;

      // Handle stdout
      this.process.stdout?.on('data', (data: Buffer) => {
        const output = data.toString().trim();
        if (output) {
          console.log('[FlightGear]', output);
        }
      });

      // Handle stderr
      this.process.stderr?.on('data', (data: Buffer) => {
        const output = data.toString().trim();
        if (output) {
          console.error('[FlightGear Error]', output);
        }
      });

      // Handle process exit
      this.process.on('exit', (code, signal) => {
        console.log(`[FlightGear] Process exited with code ${code}, signal ${signal}`);
        this.process = null;
        this.config = null;
      });

      // Handle errors
      this.process.on('error', (err) => {
        console.error('[FlightGear] Process error:', err);
        this.process = null;
        this.config = null;
      });

      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[FlightGear] Failed to launch:', message);
      return { success: false, error: message };
    }
  }

  /**
   * Stop FlightGear
   */
  async stop(): Promise<void> {
    if (!this.process) {
      return;
    }

    console.log('[FlightGear] Stopping...');

    // Try graceful shutdown first
    this.process.kill('SIGTERM');

    // Wait a bit for graceful shutdown
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        // Force kill if still running
        if (this.process && !this.process.killed) {
          console.log('[FlightGear] Force killing...');
          this.process.kill('SIGKILL');
        }
        resolve();
      }, 3000);

      if (this.process) {
        this.process.once('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      } else {
        clearTimeout(timeout);
        resolve();
      }
    });

    this.process = null;
    this.config = null;
    console.log('[FlightGear] Stopped');
  }

  /**
   * Get process info
   */
  getStatus(): { running: boolean; pid: number | null; aircraft: string | null; airport: string | null } {
    return {
      running: this.isRunning(),
      pid: this.process?.pid || null,
      aircraft: this.config?.aircraft || null,
      airport: this.config?.airport || null,
    };
  }
}

// Singleton instance
export const flightGearLauncher = new FlightGearLauncher();
