import { connect, type Socket } from 'node:net';
import { readFile } from 'node:fs/promises';
import { MAVLinkParser, getAllMessageInfos, HEARTBEAT_ID } from '@ardudeck/mavlink-ts';
import { isVehicleHeartbeat, VEHICLE_NAMES } from '@ardudeck/vehicle-core';

/** SITL serves MAVLink on 5760 (+10 per instance) and a second console on 5762. */
export const SITL_PORTS: readonly number[] = [5760, 5762, 5770, 5780, 5790, 5800, 5810, 5820, 5830];
const SECOND_CONSOLE_PORT = 5762;
const HOST = '127.0.0.1';
const PROBE_TIMEOUT_MS = 2500;
const PROBE_EVERY_MS = 5000;
/** A simulator that stops answering drops off the list after this long. */
const FORGET_AFTER_MS = 15_000;
const TCP_ESTABLISHED = '01';

export interface DiscoveredVehicle {
  /** Stable while the simulator runs: `tcp-<host>-<port>`. */
  id: string;
  label: string;
  sysid: number;
  /** What to save to connect to it. */
  connection: { name: string; type: 'tcp'; host: string; port: number };
  seenAt: number;
}

/**
 * Local ports someone is already talking to. SITL serves one client per port and a
 * new connection replaces the old one, so a probe must never touch a port in use.
 */
export function busyLocalPorts(procNetTcp: string): Set<number> {
  const busy = new Set<number>();
  for (const line of procNetTcp.split('\n').slice(1)) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 4 || cols[3] !== TCP_ESTABLISHED) continue;
    busy.add(Number.parseInt(cols[1]!.split(':')[1]!, 16));
  }
  return busy;
}

async function readBusyPorts(): Promise<Set<number>> {
  const tables = await Promise.all(['/proc/net/tcp', '/proc/net/tcp6'].map((f) => readFile(f, 'utf8').catch(() => '')));
  const busy = new Set<number>();
  for (const table of tables) for (const port of busyLocalPorts(table)) busy.add(port);
  return busy;
}

/** Connect, wait for one vehicle heartbeat, disconnect. */
function probePort(port: number): Promise<{ sysid: number; mavType: number } | null> {
  return new Promise((resolve) => {
    const parser = new MAVLinkParser();
    parser.registerMessages(getAllMessageInfos());
    const socket: Socket = connect({ host: HOST, port });
    const finish = (result: { sysid: number; mavType: number } | null) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(PROBE_TIMEOUT_MS, () => finish(null));
    socket.once('error', () => finish(null));
    socket.on('data', (chunk: Buffer) => {
      parser.feed(new Uint8Array(chunk));
      for (let pkt = parser.parseNext(); pkt; pkt = parser.parseNext()) {
        if (pkt.msgid !== HEARTBEAT_ID || pkt.payload.length < 6) continue;
        const mavType = pkt.payload[4]!;
        if (isVehicleHeartbeat(mavType, pkt.payload[5]!, pkt.compid)) return finish({ sysid: pkt.sysid, mavType });
      }
    });
  });
}

/**
 * Finds ArduPilot SITL instances on this machine so the OS can offer them as
 * connections. A TCP simulator stays silent until someone connects, so it has to
 * be asked; ports that are part of the OS link or held by another client are skipped.
 */
export class SitlProbe {
  private readonly found = new Map<number, DiscoveredVehicle>();
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly portsInUse: () => Set<number>) {}

  get vehicles(): DiscoveredVehicle[] {
    const now = Date.now();
    const live = [...this.found.entries()].filter(([, v]) => now - v.seenAt < FORGET_AFTER_MS);
    const livePorts = new Set(live.map(([port]) => port));
    // 5762 is the same simulator's second console: offer it only while 5760 is taken.
    return live.filter(([port]) => !(port === SECOND_CONSOLE_PORT && livePorts.has(port - 2))).map(([, v]) => v);
  }

  start(): void {
    this.timer = setInterval(() => void this.sweep(), PROBE_EVERY_MS);
    void this.sweep();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async sweep(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const linked = this.portsInUse();
      const skip = new Set([...linked, ...(await readBusyPorts())]);
      // The second console of a simulator the OS link already uses is the same vehicle.
      if (linked.has(SECOND_CONSOLE_PORT - 2)) skip.add(SECOND_CONSOLE_PORT);
      for (const port of SITL_PORTS) {
        if (skip.has(port)) {
          this.found.delete(port);
          continue;
        }
        const heard = await probePort(port);
        if (heard) this.found.set(port, this.describe(port, heard.sysid, heard.mavType));
      }
    } finally {
      this.running = false;
    }
  }

  private describe(port: number, sysid: number, mavType: number): DiscoveredVehicle {
    const label = `${VEHICLE_NAMES[mavType] ?? 'Vehicle'} SITL`;
    return {
      id: `tcp-${HOST}-${port}`,
      label,
      sysid,
      connection: { name: `${label} (TCP ${port})`, type: 'tcp', host: HOST, port },
      seenAt: Date.now(),
    };
  }
}
