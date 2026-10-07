/**
 * ArduDeck OS integration.
 *
 * On ArduDeck OS the vehicle link is owned by a system service (os-linkd)
 * rather than by this app: it listens to the radio, tracks the vehicle and
 * caches its parameters while the app is closed. When that service answers on
 * loopback, the app connects through it instead of opening the radio itself,
 * and loads the cached parameters instead of downloading them again.
 *
 * Everywhere else (macOS, Windows, other Linux) the probe fails fast and the
 * app behaves exactly as before.
 */
import { spawn } from 'node:child_process';
import type { OsIntegrationInfo, OsParamSnapshot, OsLinksState } from '../shared/ardudeck-os-types.js';
import type { SwarmSitlConfig, SwarmSitlStatus } from '../shared/ipc-channels.js';

const API_BASE = 'http://127.0.0.1:47801/v1';
const PROBE_TIMEOUT_MS = 800;
const PARAMS_TIMEOUT_MS = 3000;
/** Starting a swarm waits for every simulator to announce its port. */
const SIM_START_TIMEOUT_MS = 60_000;
/**
 * Fixed local port for the app's side of the OS link. Like UDP client mode in
 * general (issue #86), a stable source port keeps reconnects on the same
 * learned client slot, and it must not be 14550, which the service owns.
 */
export const OS_CLIENT_LOCAL_PORT = 14571;

interface InfoResponse {
  service?: string;
  apiVersion?: number;
  version?: string;
  os?: { id: string | null; name: string | null };
  link?: { clientHost?: string; clientPort?: number };
  vehicle?: { connected: boolean; sysid: number; uid: string; firmware: string; mode: string; armed: boolean } | null;
  params?: { status: string; received: number; total: number };
}

const NOT_AVAILABLE: OsIntegrationInfo = { available: false };

let lastEndpoint: { host: string; port: number } | null = null;
/** Set by the last successful probe: on ArduDeck OS the OS owns the vehicle link. */
let osManaged = false;

/** True when connections must go through the ArduDeck OS link (see COMMS_CONNECT). */
export function isOsManaged(): boolean {
  return osManaged;
}

export async function probeArduDeckOs(): Promise<OsIntegrationInfo> {
  if (process.platform !== 'linux') return NOT_AVAILABLE;
  try {
    const res = await fetch(`${API_BASE}/info`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    if (!res.ok) return NOT_AVAILABLE;
    const info = (await res.json()) as InfoResponse;
    if (info.service !== 'ardudeck-os-linkd' || !info.link?.clientPort) return NOT_AVAILABLE;
    const endpoint = { host: info.link.clientHost || '127.0.0.1', port: info.link.clientPort };
    lastEndpoint = endpoint;
    osManaged = true;
    return {
      available: true,
      osName: info.os?.name ?? null,
      serviceVersion: info.version ?? null,
      clientHost: endpoint.host,
      clientPort: endpoint.port,
      clientLocalPort: OS_CLIENT_LOCAL_PORT,
      vehicle: info.vehicle && info.vehicle.connected
        ? { sysid: info.vehicle.sysid, uid: info.vehicle.uid, firmware: info.vehicle.firmware, mode: info.vehicle.mode, armed: info.vehicle.armed }
        : null,
      paramsCached: info.params?.status === 'complete',
    };
  } catch {
    return NOT_AVAILABLE;
  }
}

/** True when a UDP client connection targets the ArduDeck OS link service. */
export function isOsLinkEndpoint(host: string | undefined, port: number | undefined): boolean {
  if (!host || !port) return false;
  const target = lastEndpoint ?? { host: '127.0.0.1', port: 14570 };
  const loopback = (h: string) => h === '127.0.0.1' || h === 'localhost' || h === '::1';
  return port === target.port && (host === target.host || (loopback(host) && loopback(target.host)));
}

/**
 * Cached parameter set for the vehicle the service is tracking, or null when
 * there is none, it is incomplete, or it belongs to a different board.
 */
export async function fetchOsParams(expectedBoardUid?: string): Promise<OsParamSnapshot | null> {
  try {
    const res = await fetch(`${API_BASE}/vehicle/params`, { signal: AbortSignal.timeout(PARAMS_TIMEOUT_MS) });
    if (!res.ok) return null;
    const snap = (await res.json()) as OsParamSnapshot;
    if (!snap.complete || !Array.isArray(snap.params) || snap.params.length !== snap.paramCount) return null;
    if (expectedBoardUid && snap.uid !== expectedBoardUid) return null;
    return snap;
  } catch {
    return null;
  }
}

/** Saved connections, active one and detected devices, straight from the OS. */
export async function getOsLinks(): Promise<OsLinksState | null> {
  try {
    const res = await fetch(`${API_BASE}/links`, { signal: AbortSignal.timeout(PARAMS_TIMEOUT_MS) });
    return res.ok ? ((await res.json()) as OsLinksState) : null;
  } catch {
    return null;
  }
}

type OsWriteResult<T> = { success: true; body: T } | { success: false; error: string };

async function osWrite<T>(method: 'POST' | 'DELETE', path: string, body: unknown, timeoutMs = PARAMS_TIMEOUT_MS): Promise<OsWriteResult<T>> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-ArduDeck': '1' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const json = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (res.ok) return { success: true, body: json };
    return { success: false, error: json.error ?? `HTTP ${res.status}` };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Switch the OS link to another saved connection (affects every client, as intended). */
export async function setOsActiveLink(id: string): Promise<{ success: boolean; error?: string }> {
  const result = await osWrite('POST', '/links/active', { id });
  return result.success ? { success: true } : result;
}

/** Start the OS's simulated swarm; its vehicles join the fleet through the OS engine. */
export async function startOsSimSwarm(config: SwarmSitlConfig): Promise<{ success: boolean; error?: string; status?: SwarmSitlStatus }> {
  const result = await osWrite<SwarmSitlStatus>('POST', '/sim/swarm',
    { count: config.count, formation: config.formation, spacingM: config.spacingM }, SIM_START_TIMEOUT_MS);
  return result.success ? { success: true, status: result.body } : result;
}

export async function stopOsSimSwarm(): Promise<{ success: boolean; error?: string }> {
  const result = await osWrite('DELETE', '/sim/swarm', undefined);
  return result.success ? { success: true } : result;
}

export async function getOsSimStatus(): Promise<SwarmSitlStatus> {
  try {
    const res = await fetch(`${API_BASE}/sim`, { signal: AbortSignal.timeout(PARAMS_TIMEOUT_MS) });
    if (res.ok) return (await res.json()) as SwarmSitlStatus;
  } catch {
    // Service unreachable: report no swarm.
  }
  return { isRunning: false, instances: [] };
}

/** Open the system's Vehicle Link settings window. */
export function openOsLinkSettings(): void {
  const child = spawn('gtk-launch', ['com.ardudeck.Settings'], { detached: true, stdio: 'ignore' });
  child.on('error', () => { /* not installed: nothing to open */ });
  child.unref();
}
