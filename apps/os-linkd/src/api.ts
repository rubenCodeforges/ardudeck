import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import type { LinkService } from './link-service.js';
import { parseSimSwarmRequest, type SimSwarm } from './sim-swarm.js';
import type { LogFn } from './param-fetcher.js';
import { detectDevices } from './connections.js';

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
    // ArduDeck OS brands itself as a Fedora variant (ID stays 'fedora' for package tooling).
    return {
      id: fields.VARIANT_ID ?? fields.ID ?? null,
      name: fields.VARIANT ?? fields.NAME ?? null,
      version: fields.VERSION_ID ?? null,
    };
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

const MAX_BODY = 16 * 1024;

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? (JSON.parse(text) as Record<string, unknown>) : {});
      } catch {
        reject(new Error('invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Loopback-only HTTP API consumed by the desktop app, the shell extension,
 * the link settings window and scripts. Vehicle commands never go through
 * here; they use the MAVLink client port.
 *
 *   GET    /v1/info              service, OS and link details
 *   GET    /v1/vehicle           live vehicle state, or null
 *   GET    /v1/vehicle/params    cached parameter snapshot for the live vehicle
 *   GET    /v1/links             saved connections, active one, detected USB devices, discovered simulators
 *   GET    /v1/gnss              GNSS receivers on this machine (model, RTK capability, fix) and the operator position
 *   POST   /v1/links             {connection, activate?} add or replace a connection
 *   POST   /v1/links/active      {id} switch to a saved connection
 *   POST   /v1/links/enabled     {enabled} master switch for the vehicle link
 *   DELETE /v1/links/:id         remove a saved connection
 *   GET    /v1/sim               simulated swarm: available, isRunning, instances
 *   POST   /v1/sim/swarm         {count, formation?, spacingM?} start a simulated copter swarm
 *   DELETE /v1/sim/swarm         stop it
 *
 * Writes require the `X-ArduDeck: 1` header and a JSON body. A custom header
 * forces a CORS preflight that this server never approves, so a web page
 * open in a browser on the tablet cannot change links.
 */
export interface ApiOptions {
  os?: OsInfo;
  log?: LogFn;
  sim?: SimSwarm;
}

export function createApi(link: LinkService, serviceVersion: string, { os = readOsRelease(), log, sim }: ApiOptions = {}): Server {
  return createServer((req: IncomingMessage, res: ServerResponse) => {
    const path = (req.url ?? '/').split('?')[0]!.replace(/\/+$/, '');
    if (req.method === 'POST' || req.method === 'DELETE') {
      void handleWrite(link, sim, req, res, path, log);
      return;
    }
    if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' });
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
        log?.('info', `served ${snap.params.length} cached params for ${snap.uid} (complete: ${snap.complete})`);
        return json(res, 200, snap);
      }
      case '/v1/links':
        void detectDevices().then((detected) => {
          // What the detector actually heard beats a guess from the USB vendor.
          const seen = new Map(link.gnss.list().map((d) => [d.path, d]));
          const merged = detected.flatMap((d) => {
            const s = seen.get(d.path);
            if (s?.role === 'gnss' || s?.role === 'rtcm-source') return [];
            if (s?.role === 'vehicle-link' && s.baudRate) return [{ ...d, kind: 'radio' as const, verified: true, suggestedBaud: s.baudRate }];
            return [{ ...d, verified: false }];
          });
          const saved = new Set(link.settings.connections.map((c) => (c.type === 'tcp' ? `${c.host}:${c.port}` : '')));
          const discovered = link.discovery.vehicles.filter((v) => !saved.has(`${v.connection.host}:${v.connection.port}`));
          json(res, 200, { ...link.settings, link: link.linkInfo, detected: merged, discovered });
        });
        return;
      case '/v1/gnss':
        return json(res, 200, { operator: link.gnss.operatorFix(), devices: link.gnss.list() });
      case '/v1/sim':
        return json(res, 200, sim?.status ?? { available: false, isRunning: false, instances: [] });
      default:
        return json(res, 404, { error: 'not found' });
    }
  });
}

async function handleWrite(link: LinkService, sim: SimSwarm | undefined, req: IncomingMessage, res: ServerResponse, path: string, log?: LogFn): Promise<void> {
  if (req.headers['x-ardudeck'] !== '1') return json(res, 403, { error: 'missing X-ArduDeck header' });
  try {
    if (path === '/v1/sim/swarm') {
      if (!sim) return json(res, 404, { error: 'simulator not available' });
      if (req.method === 'DELETE') return json(res, 200, await sim.stop());
      return json(res, 200, await sim.start(parseSimSwarmRequest(await readJson(req))));
    }
    if (req.method === 'DELETE') {
      const m = /^\/v1\/links\/([\w.-]+)$/.exec(path);
      if (!m) return json(res, 404, { error: 'not found' });
      await link.removeConnection(m[1]!);
      log?.('info', `links: removed ${m[1]}`);
      return json(res, 200, link.settings);
    }
    const body = await readJson(req);
    switch (path) {
      case '/v1/links': {
        const conn = await link.upsertConnection(body.connection, body.activate === true);
        log?.('info', `links: saved ${conn.id} (${conn.name})${body.activate === true ? ', active' : ''}`);
        return json(res, 200, link.settings);
      }
      case '/v1/links/active':
        await link.setActive(String(body.id ?? ''));
        log?.('info', `links: active ${String(body.id)}`);
        return json(res, 200, link.settings);
      case '/v1/links/enabled':
        await link.setEnabled(body.enabled === true);
        log?.('info', `links: ${body.enabled === true ? 'enabled' : 'disabled'}`);
        return json(res, 200, link.settings);
      default:
        return json(res, 404, { error: 'not found' });
    }
  } catch (err) {
    return json(res, 400, { error: err instanceof Error ? err.message : String(err) });
  }
}
