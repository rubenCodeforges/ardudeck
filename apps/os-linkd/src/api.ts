import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import type { LinkService } from './link-service.js';

export const API_VERSION = 1;
export const SERVICE_NAME = 'ardudeck-os-linkd';

export interface OsInfo {
  id: string | null;
  name: string | null;
  version: string | null;
}

/** Parse /etc/os-release so clients can tell they are on ArduDeck OS. */
export function readOsRelease(path = '/etc/os-release'): OsInfo {
  try {
    const fields: Record<string, string> = {};
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
      if (m) fields[m[1]!] = m[2]!.replace(/^"|"$/g, '');
    }
    return { id: fields.ID ?? null, name: fields.NAME ?? null, version: fields.VERSION_ID ?? null };
  } catch {
    return { id: null, name: null, version: null };
  }
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store',
  });
  res.end(data);
}

/**
 * Loopback-only HTTP API consumed by the desktop app, desktop widgets and
 * scripts. Read-only: anything that commands the vehicle goes through the
 * MAVLink client port instead.
 *
 *   GET /v1/info              service, OS and link details
 *   GET /v1/vehicle           live vehicle state, or null
 *   GET /v1/vehicle/params    cached parameter snapshot for the live vehicle
 */
export function createApi(link: LinkService, serviceVersion: string, os: OsInfo = readOsRelease()): Server {
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' });
    const path = (req.url ?? '/').split('?')[0]!.replace(/\/+$/, '');
    const v = link.vehicle;

    switch (path) {
      case '/v1/info':
        return json(res, 200, {
          service: SERVICE_NAME,
          apiVersion: API_VERSION,
          version: serviceVersion,
          os,
          link: link.linkInfo,
          vehicle: v ? { connected: v.connected, sysid: v.sysid, uid: v.uid, firmware: v.firmware, mode: v.mode, armed: v.armed } : null,
          params: { status: link.fetcher.status, ...link.fetcher.progress, error: link.fetcher.lastError },
        });
      case '/v1/vehicle':
        return json(res, 200, v);
      case '/v1/vehicle/params': {
        if (!v) return json(res, 404, { error: 'no vehicle' });
        const snap = link.cache.get(v.uid);
        if (!snap) return json(res, 404, { error: 'no cached parameters', status: link.fetcher.status });
        return json(res, 200, snap);
      }
      default:
        return json(res, 404, { error: 'not found' });
    }
  });
}
