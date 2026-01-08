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
import { detectFlightGear, getFlightGearRoot } from './simulator-detector';

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
   * Install ArduDeck protocol files to FlightGear's Protocol directory
   */
  private installProtocolFiles(fgRoot: string): void {
    const protocolDir = join(fgRoot, 'Protocol');

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

      // Only copy if source exists and dest doesn't (or is older)
      if (existsSync(srcPath)) {
        try {
          copyFileSync(srcPath, destPath);
          console.log(`[FlightGear] Installed protocol file: ${file}`);
        } catch (err) {
          console.warn(`[FlightGear] Could not copy ${file}:`, err);
        }
      } else {
        console.warn(`[FlightGear] Protocol file not found: ${srcPath}`);
      }
    }
  }

  /**
   * Build command line arguments for FlightGear
   */
  private buildArgs(config: FlightGearConfig, fgRoot: string): string[] {
    const args: string[] = [];

    // Set FG_ROOT
    args.push(`--fg-root=${fgRoot}`);

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
   */
  async launch(config: FlightGearConfig): Promise<{ success: boolean; error?: string }> {
    // Check if already running
    if (this.isRunning()) {
      return { success: false, error: 'FlightGear is already running' };
    }

    // Detect FlightGear installation
    const fgInfo = await detectFlightGear();
    if (!fgInfo.installed || !fgInfo.executable || !fgInfo.path) {
      return { success: false, error: 'FlightGear not found. Please install FlightGear first.' };
    }

    const fgRoot = getFlightGearRoot(fgInfo.path);
    if (!fgRoot) {
      return { success: false, error: 'Could not determine FlightGear data directory' };
    }

    // Install our protocol files to FlightGear's data directory
    this.installProtocolFiles(fgRoot);

    // Build arguments
    const args = this.buildArgs(config, fgRoot);

    console.log('[FlightGear] Launching with args:', args.join(' '));

    try {
      // Spawn FlightGear process
      this.process = spawn(fgInfo.executable, args, {
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          FG_ROOT: fgRoot,
        },
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
