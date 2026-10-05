import { homedir } from 'node:os';
import { join } from 'node:path';

export interface LinkdConfig {
  /** UDP port the vehicle side listens on (ELRS backpack / telemetry bridges broadcast to 14550). */
  vehiclePort: number;
  /** UDP port local GCS clients (the ArduDeck app, QGC, MAVProxy) talk to. */
  clientPort: number;
  /** Address the client socket binds to. Loopback by default: only this device can command through the link. */
  clientBind: string;
  /** HTTP API port, always on loopback. */
  apiPort: number;
  /** Where per-vehicle parameter caches are stored. */
  stateDir: string;
  /** MAVLink identity used for the service's own requests (params, AUTOPILOT_VERSION). */
  sysid: number;
  compid: number;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export function loadConfig(): LinkdConfig {
  const stateHome = process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state');
  return {
    vehiclePort: envInt('ARDUDECK_LINKD_VEHICLE_PORT', 14550),
    clientPort: envInt('ARDUDECK_LINKD_CLIENT_PORT', 14570),
    clientBind: process.env.ARDUDECK_LINKD_CLIENT_BIND || '127.0.0.1',
    apiPort: envInt('ARDUDECK_LINKD_API_PORT', 47801),
    stateDir: process.env.ARDUDECK_LINKD_STATE_DIR || join(stateHome, 'ardudeck-os'),
    // 255 is the GCS convention; compid 191 keeps our requests distinct from the
    // desktop app (190) so FTP/param replies can be told apart.
    sysid: envInt('ARDUDECK_LINKD_SYSID', 255),
    compid: envInt('ARDUDECK_LINKD_COMPID', 191),
  };
}
