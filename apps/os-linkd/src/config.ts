import { homedir } from 'node:os';
import { join } from 'node:path';

export interface LinkdConfig {
  /** Default UDP listen port for the built-in Wi-Fi telemetry connection (ELRS backpacks and bridges send to 14550). */
  vehiclePort: number;
  /** UDP port local GCS clients (the ArduDeck app, QGC, MAVProxy) talk to. */
  clientPort: number;
  /** Address the client socket binds to. Loopback by default: only this device can command through the link. */
  clientBind: string;
  /** HTTP API port, always on loopback. */
  apiPort: number;
  /** Saved connections and which one is active (links.json). */
  settingsFile: string;
  /** Where per-vehicle parameter caches are stored. */
  stateDir: string;
  /** MAVLink identity used for the service's own requests (params, AUTOPILOT_VERSION). */
  sysid: number;
  compid: number;
  /** The orchestrator binary that terminates every vehicle link. */
  engineBinary: string;
  /** Loopback address the orchestrator serves its fleet WebSocket on; the app connects here too. */
  engineBind: string;
  /** ArduCopter SITL used for the OS's simulated swarm. */
  sitlBinary: string;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export function loadConfig(): LinkdConfig {
  const stateHome = process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state');
  const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return {
    vehiclePort: envInt('ARDUDECK_LINKD_VEHICLE_PORT', 14550),
    clientPort: envInt('ARDUDECK_LINKD_CLIENT_PORT', 14570),
    clientBind: process.env.ARDUDECK_LINKD_CLIENT_BIND || '127.0.0.1',
    apiPort: envInt('ARDUDECK_LINKD_API_PORT', 47801),
    stateDir: process.env.ARDUDECK_LINKD_STATE_DIR || join(stateHome, 'ardudeck-os'),
    settingsFile: process.env.ARDUDECK_LINKD_SETTINGS || join(configHome, 'ardudeck-os', 'links.json'),
    // Deliberately not 255: ArduPilot's GCS failsafe tracks heartbeats from
    // SYSID_MYGCS (255 by default), and this service heartbeats on its own, so
    // as 255 it could keep that failsafe from firing after the pilot's real GCS
    // is gone. compid 191 keeps our FTP/param replies apart from the app (190).
    sysid: envInt('ARDUDECK_LINKD_SYSID', 254),
    compid: envInt('ARDUDECK_LINKD_COMPID', 191),
    engineBinary: process.env.ARDUDECK_ORCHESTRATOR_BIN || join(homedir(), '.local', 'opt', 'ardudeck-orchestrator', 'ardudeck-orchestrator'),
    engineBind: process.env.ARDUDECK_ENGINE_BIND || '127.0.0.1:8790',
    sitlBinary: process.env.ARDUDECK_SITL_BIN || join(homedir(), '.local', 'opt', 'sitl', 'arducopter'),
  };
}
