import net from 'node:net';
import os from 'node:os';
import type { CameraDiscoveryResult } from '../../shared/camera-settings-types.js';
import { WIFILINK_DEFAULT_HOST } from '../../shared/wifilink-settings.js';
import { SshSession } from './ssh-session.js';

const PROBE_TIMEOUT_MS = 400;
const CONCURRENCY = 64;

function portOpen(host: string, port: number, timeoutMs = PROBE_TIMEOUT_MS): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.connect({ host, port });
    const done = (open: boolean) => { sock.destroy(); resolve(open); };
    sock.setTimeout(timeoutMs, () => done(false));
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
  });
}

function sshBanner(host: string, timeoutMs = 1000): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    const sock = net.connect({ host, port: 22 });
    const done = () => { sock.destroy(); resolve(data.split('\n')[0]?.trim() ?? ''); };
    sock.setTimeout(timeoutMs, done);
    sock.on('data', (d) => { data += d.toString(); if (data.includes('\n')) done(); });
    sock.once('error', done);
  });
}

const ipToInt = (ip: string) => ip.split('.').reduce((n, o) => (n << 8) + Number(o), 0) >>> 0;
const intToIp = (n: number) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');

export interface AdapterAddress { name: string; address: string; netmask: string }

/** Hosts to probe: the likely addresses first, then every neighbour on each local network (capped at a /24). */
export function candidateHosts(adapters: AdapterAddress[], lastHost?: string): string[] {
  const hosts = new Set<string>();
  if (lastHost) hosts.add(lastHost);
  hosts.add(WIFILINK_DEFAULT_HOST);
  for (const a of adapters) {
    if (a.address.startsWith('169.254.')) continue;
    const self = ipToInt(a.address);
    const prefix = a.netmask.split('.').reduce((n, o) => n + Number(o).toString(2).replace(/0/g, '').length, 0);
    const bits = Math.max(prefix, 24);
    const mask = bits === 32 ? 0xffffffff : (0xffffffff << (32 - bits)) >>> 0;
    const base = (self & mask) >>> 0;
    const size = 2 ** (32 - bits);
    for (let i = 1; i < size - 1; i++) {
      const h = (base + i) >>> 0;
      if (h !== self) hosts.add(intToIp(h));
    }
  }
  return [...hosts];
}

/** Wired adapters that are up but only self-assigned: the camera straight in, with no address to talk to it on. */
export function unaddressedAdapters(ifaces: NodeJS.Dict<os.NetworkInterfaceInfo[]>): string[] {
  const out: string[] = [];
  for (const [name, infos] of Object.entries(ifaces)) {
    const v4 = (infos ?? []).filter((i) => i.family === 'IPv4' && !i.internal);
    if (v4.length > 0 && v4.every((i) => i.address.startsWith('169.254.'))) out.push(name);
  }
  return out;
}

function localAdapters(): AdapterAddress[] {
  const out: AdapterAddress[] = [];
  for (const [name, infos] of Object.entries(os.networkInterfaces())) {
    for (const i of infos ?? []) {
      if (i.family === 'IPv4' && !i.internal) out.push({ name, address: i.address, netmask: i.netmask });
    }
  }
  return out;
}

async function mapPool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  }));
  return out;
}

export async function discoverCameras(login: { username: string; password: string }, lastHost?: string): Promise<CameraDiscoveryResult> {
  const hosts = candidateHosts(localAdapters(), lastHost);
  // An OpenIPC camera answers SSH and serves its video over RTSP; only those are worth a closer look.
  const open = await mapPool(hosts, CONCURRENCY, async (h) => ((await portOpen(h, 22)) && (await portOpen(h, 554)) ? h : null));
  const likely = open.filter((h): h is string => h !== null);

  const cameras: CameraDiscoveryResult['cameras'] = [];
  for (const host of likely) {
    if (!/dropbear/i.test(await sshBanner(host))) continue;
    try {
      const session = await SshSession.open({ host, ...login }, 5000);
      try {
        const r = await session.run('[ -x /usr/sbin/wifilink ] && echo wifilink\n', 5000);
        if (r.stdout.includes('wifilink')) cameras.push({ host, needsLogin: false });
      } finally {
        session.close();
      }
    } catch (err) {
      // Right kind of device, different password: still the camera, so offer it with the login fields.
      if ((err as { level?: string }).level === 'client-authentication') cameras.push({ host, needsLogin: true });
    }
  }
  return { cameras, unaddressedAdapters: unaddressedAdapters(os.networkInterfaces()) };
}
