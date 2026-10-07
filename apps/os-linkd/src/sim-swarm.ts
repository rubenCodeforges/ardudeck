import { existsSync } from 'node:fs';
import {
  SwarmSitl, generateDefaultParams, clampSwarmSize,
  type SwarmFormation, type SwarmHome, type SwarmInstanceStatus,
} from '@ardudeck/sitl';
import type { LinkService } from './link-service.js';
import type { LogFn } from './param-fetcher.js';

const LINK_OWNER = 'sim';
const MODEL = 'quad';
/** ArduPilot's own SITL field (CMAC, Canberra), used when this machine has no GNSS fix. */
const FALLBACK_HOME: SwarmHome = { lat: -35.363261, lng: 149.165230, alt: 584, heading: 0 };
const FORMATIONS: readonly SwarmFormation[] = ['grid', 'line', 'circle'];

export interface SimSwarmRequest {
  count: number;
  formation?: SwarmFormation;
  spacingM?: number;
}

export interface SimSwarmStatus {
  available: boolean;
  running: boolean;
  instances: SwarmInstanceStatus[];
}

export function parseSimSwarmRequest(body: Record<string, unknown>): SimSwarmRequest {
  const count = Number(body.count);
  if (!Number.isFinite(count)) throw new Error('count is required');
  const formation = FORMATIONS.find((f) => f === body.formation) ?? 'grid';
  const spacing = Number(body.spacingM);
  return { count: clampSwarmSize(count), formation, spacingM: Number.isFinite(spacing) && spacing > 0 ? spacing : 15 };
}

/**
 * A simulated copter swarm the OS can start without the app, using the same
 * launcher as the app's swarm SITL. Instances join the fleet as orchestrator
 * links and spawn around the ground station's own GNSS position when it has one.
 */
export class SimSwarm {
  private readonly swarm: SwarmSitl;

  constructor(
    private readonly link: LinkService,
    private readonly sitlBinary: string,
    private readonly workDir: string,
    private readonly log: LogFn,
  ) {
    this.swarm = new SwarmSitl({
      onInstance: (s) => { if (s.state === 'error' || s.state === 'exited') this.log('warn', `sim ${s.sysid}: ${s.state} ${s.error ?? ''}`); },
    });
  }

  get status(): SimSwarmStatus {
    return { available: existsSync(this.sitlBinary), running: this.swarm.isRunning, instances: this.swarm.snapshot() };
  }

  async start(request: SimSwarmRequest): Promise<SimSwarmStatus> {
    if (!existsSync(this.sitlBinary)) throw new Error(`no ArduPilot SITL at ${this.sitlBinary}`);
    await this.link.setExtraLinks(LINK_OWNER, []);
    const instances = await this.swarm.start({
      binaryPath: this.sitlBinary,
      workDir: this.workDir,
      model: MODEL,
      count: request.count,
      formation: request.formation ?? 'grid',
      spacingM: request.spacingM ?? 15,
      home: this.home(),
      baseParams: generateDefaultParams('copter', MODEL),
    });
    await this.link.setExtraLinks(LINK_OWNER, instances.map((i) => `tcpout:127.0.0.1:${i.tcpPort}`));
    this.log('info', `sim swarm: ${instances.length} copters`);
    return this.status;
  }

  async stop(): Promise<SimSwarmStatus> {
    await this.link.setExtraLinks(LINK_OWNER, []);
    this.swarm.stop();
    this.log('info', 'sim swarm stopped');
    return this.status;
  }

  /** Kill the simulators without the armed check, for when the service itself exits. */
  dispose(): void {
    this.swarm.stop();
  }

  private home(): SwarmHome {
    const fix = this.link.gnss.operatorFix();
    if (fix?.lat == null || fix.lon == null) return FALLBACK_HOME;
    return { lat: fix.lat, lng: fix.lon, alt: fix.altMsl ?? 0, heading: 0 };
  }
}
