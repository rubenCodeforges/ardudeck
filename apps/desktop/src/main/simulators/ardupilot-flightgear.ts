/**
 * ArduPilot FlightGear Viewer
 *
 * Launches FlightGear as a pure *visualizer* for a running ArduPilot SITL.
 *
 * Unlike the iNav path (protocol-bridge.ts), ArduPilot SITL runs its OWN
 * flight dynamics and streams standard FlightGear FGNetFDM packets to
 * 127.0.0.1:5503 whenever it is launched with `--enable-fgview`. FlightGear
 * then renders those packets with its own physics disabled:
 *
 *   fgfs --fdm=external --native-fdm=socket,in,<hz>,,5503,udp --aircraft=<shell>
 *
 * That means: no custom protocol XML files, no UDP bridge, no X-Plane server,
 * no dataref guessing. FlightGear is a window onto the SITL-flown mission.
 * The chosen aircraft is a visual shell only; with an external FDM FlightGear
 * uses the incoming position/attitude, not the model's own flight model.
 */

import { spawn, ChildProcess } from 'child_process';
import { detectFlightGear } from './simulator-detector';
import type { ArduPilotFlightGearConfig } from '../../shared/ipc-channels.js';

export type { ArduPilotFlightGearConfig };

/** Port ArduPilot SITL sends FGNetFDM packets to (fixed in the firmware). */
export const ARDUPILOT_FG_FDM_PORT = 5503;

/** Visual airframe shells that ship with a stock FlightGear base install. */
export const ARDUPILOT_FG_AIRCRAFT = [
  // A VISIBLE model is essential: `ufo` is FlightGear's free-fly camera object,
  // not an aircraft - it renders nothing (just a cursor) so the vehicle is
  // invisible and you float as a spectator. c172p ships with base FlightGear and
  // renders a real airframe driven by the external FDM.
  { id: 'c172p', name: 'Cessna 172P (visible, ships with FlightGear)' },
  { id: 'Rascal110-JSBSim', name: 'Rascal 110 (if installed)' },
  { id: 'ufo', name: 'UFO (camera only - no visible aircraft)' },
] as const;

/**
 * Build the FlightGear command-line arguments for viewing an ArduPilot SITL.
 * Pure function so it can be unit-tested without spawning a process.
 */
export function buildFlightGearViewerArgs(config: ArduPilotFlightGearConfig): string[] {
  const args: string[] = [];
  const port = config.fdmPort ?? ARDUPILOT_FG_FDM_PORT;
  const rate = config.updateRate ?? 10;

  // External FDM: FlightGear renders the position/attitude streamed by SITL and
  // runs no physics of its own. The empty host field means "listen on any".
  args.push('--fdm=external');
  args.push(`--native-fdm=socket,in,${rate},,${port},udp`);

  args.push(`--aircraft=${config.aircraft}`);

  if (config.lat !== undefined && config.lon !== undefined) {
    args.push(`--lat=${config.lat}`);
    args.push(`--lon=${config.lon}`);
  }
  if (config.altitudeFt !== undefined) {
    args.push(`--altitude=${config.altitudeFt}`);
  }
  if (config.headingDeg !== undefined) {
    args.push(`--heading=${config.headingDeg}`);
  }

  args.push(`--timeofday=${config.timeOfDay ?? 'noon'}`);

  // Stream scenery on demand. Base FlightGear ships only the San Francisco area;
  // a SITL home anywhere else (the common case) has no terrain tiles and renders
  // a black screen forever. TerraSync downloads the tiles for wherever the
  // vehicle is over the network. Opt out with terraSync: false.
  if (config.terraSync !== false) {
    args.push('--enable-terrasync');
  }

  // Start in an external chase view so you SEE the aircraft flying, instead of
  // the default cockpit view (which, on a camera object, is why it looked like
  // floating spectating). View 2 is FlightGear's "Chase View".
  args.push('--prop:/sim/current-view/view-number=2');
  args.push('--disable-ai-traffic');
  args.push('--disable-real-weather-fetch');
  args.push('--disable-random-objects');
  args.push('--disable-splash-screen');
  // Skip FlightGear's AI carriers/scenarios (the Nimitz/Eisenhower spam in the
  // console) - irrelevant to a drone view.
  args.push('--disable-ai-models');

  if (config.fullscreen) {
    args.push('--enable-fullscreen');
  } else {
    args.push(`--geometry=${config.geometry ?? '1280x720'}`);
  }

  return args;
}

class ArduPilotFlightGearViewer {
  private process: ChildProcess | null = null;
  private config: ArduPilotFlightGearConfig | null = null;

  isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }

  getStatus(): { running: boolean; pid: number | null; aircraft: string | null } {
    return {
      running: this.isRunning(),
      pid: this.process?.pid ?? null,
      aircraft: this.config?.aircraft ?? null,
    };
  }

  async launch(
    config: ArduPilotFlightGearConfig,
    customPath?: string,
  ): Promise<{ success: boolean; error?: string }> {
    if (this.isRunning()) {
      return { success: false, error: 'FlightGear is already running' };
    }

    const fgInfo = await detectFlightGear(customPath);
    if (!fgInfo.installed || !fgInfo.executable) {
      return {
        success: false,
        error: 'FlightGear not found. Install it from flightgear.org or set a custom path.',
      };
    }

    const args = buildFlightGearViewerArgs(config);

    try {
      this.process = spawn(fgInfo.executable, args, {
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      this.config = config;

      this.process.stderr?.on('data', (data: Buffer) => {
        const output = data.toString().trim();
        if (output) {
          console.error('[ArduPilot FlightGear]', output);
        }
      });

      this.process.on('exit', () => {
        this.process = null;
        this.config = null;
      });

      this.process.on('error', (err) => {
        console.error('[ArduPilot FlightGear] Process error:', err);
        this.process = null;
        this.config = null;
      });

      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[ArduPilot FlightGear] Failed to launch:', message);
      this.process = null;
      this.config = null;
      return { success: false, error: message };
    }
  }

  async stop(): Promise<void> {
    if (!this.process) return;

    const proc = this.process;
    proc.kill('SIGTERM');

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        if (proc && !proc.killed) {
          try {
            proc.kill('SIGKILL');
          } catch {
            // already gone
          }
        }
        resolve();
      }, 3000);

      proc.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    this.process = null;
    this.config = null;
  }
}

export const ardupilotFlightGear = new ArduPilotFlightGearViewer();
