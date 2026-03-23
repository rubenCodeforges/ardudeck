/**
 * Stateless HTTP client for the DroneBridge ESP32 REST API.
 * No auth required — DroneBridge uses open HTTP endpoints.
 */

import type {
  DroneBridgeInfo,
  DroneBridgeStats,
  DroneBridgeSettings,
  DroneBridgeClients,
} from '../../shared/dronebridge-types.js';

const DEFAULT_TIMEOUT = 5000;

/** Fetch with AbortController timeout */
async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

function baseUrl(ip: string): string {
  return `http://${ip}`;
}

/**
 * Probe a DroneBridge device — returns info if reachable, null otherwise.
 */
export async function probe(ip: string): Promise<DroneBridgeInfo | null> {
  try {
    const res = await fetchWithTimeout(`${baseUrl(ip)}/api/system/info`);
    if (!res.ok) return null;
    return (await res.json()) as DroneBridgeInfo;
  } catch {
    return null;
  }
}

/**
 * Get system info. Throws on failure.
 */
export async function getInfo(ip: string): Promise<DroneBridgeInfo> {
  const res = await fetchWithTimeout(`${baseUrl(ip)}/api/system/info`);
  if (!res.ok) throw new Error(`DroneBridge API error: ${res.status} ${res.statusText}`);
  return (await res.json()) as DroneBridgeInfo;
}

/**
 * Get system stats (connected clients, throughput, RSSI).
 */
export async function getStats(ip: string): Promise<DroneBridgeStats> {
  const res = await fetchWithTimeout(`${baseUrl(ip)}/api/system/stats`);
  if (!res.ok) throw new Error(`DroneBridge API error: ${res.status} ${res.statusText}`);
  return (await res.json()) as DroneBridgeStats;
}

/**
 * Get all configurable settings.
 */
export async function getSettings(ip: string): Promise<DroneBridgeSettings> {
  const res = await fetchWithTimeout(`${baseUrl(ip)}/api/settings`);
  if (!res.ok) throw new Error(`DroneBridge API error: ${res.status} ${res.statusText}`);
  return (await res.json()) as DroneBridgeSettings;
}

/**
 * Update settings. Accepts partial settings object.
 */
export async function updateSettings(
  ip: string,
  settings: Partial<DroneBridgeSettings>,
): Promise<{ status: string; msg: string }> {
  const res = await fetchWithTimeout(`${baseUrl(ip)}/api/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error(`DroneBridge API error: ${res.status} ${res.statusText}`);
  return (await res.json()) as { status: string; msg: string };
}

/**
 * Get connected UDP clients.
 */
export async function getClients(ip: string): Promise<DroneBridgeClients> {
  const res = await fetchWithTimeout(`${baseUrl(ip)}/api/system/clients`);
  if (!res.ok) throw new Error(`DroneBridge API error: ${res.status} ${res.statusText}`);
  return (await res.json()) as DroneBridgeClients;
}

/**
 * Add a UDP client endpoint.
 */
export async function addUdpClient(
  ip: string,
  clientIp: string,
  clientPort: number,
): Promise<void> {
  const res = await fetchWithTimeout(`${baseUrl(ip)}/api/settings/clients/udp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      udp_client_ip: clientIp,
      udp_client_port: clientPort,
      save: true,
    }),
  });
  if (!res.ok) throw new Error(`DroneBridge API error: ${res.status} ${res.statusText}`);
}

/**
 * Clear all UDP client endpoints.
 */
export async function clearUdpClients(ip: string): Promise<void> {
  const res = await fetchWithTimeout(`${baseUrl(ip)}/api/settings/clients/clear_udp`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`DroneBridge API error: ${res.status} ${res.statusText}`);
}
