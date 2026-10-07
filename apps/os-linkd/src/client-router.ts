import { createSocket, type Socket } from 'node:dgram';
import { EventEmitter } from 'node:events';

export interface ClientEndpoint {
  host: string;
  port: number;
  lastSeen: number;
}

/** A client that stops talking for this long is dropped (GCS heartbeat is 1 Hz). */
export const CLIENT_TTL_MS = 15_000;
const MAX_CLIENTS = 8;

/**
 * Local GCS fan-out, modelled on the desktop app's MavlinkTee: any datagram
 * arriving on the client port registers its sender, every vehicle chunk goes
 * to all registered clients, and client datagrams are handed back via
 * 'uplink' for injection into the vehicle link.
 */
export class ClientRouter extends EventEmitter {
  private socket: Socket | null = null;
  private readonly clients = new Map<string, ClientEndpoint>();
  private expiryTimer: NodeJS.Timeout | null = null;

  constructor(private readonly port: number, private readonly bind: string) {
    super();
  }

  async start(): Promise<void> {
    const socket = createSocket({ type: 'udp4', reuseAddr: true });
    socket.on('message', (msg, rinfo) => {
      const key = `${rinfo.address}:${rinfo.port}`;
      const now = Date.now();
      const existing = this.clients.get(key);
      if (existing) {
        existing.lastSeen = now;
      } else {
        if (this.clients.size >= MAX_CLIENTS) this.evictOldest();
        this.clients.set(key, { host: rinfo.address, port: rinfo.port, lastSeen: now });
        this.emit('client', { host: rinfo.address, port: rinfo.port });
      }
      this.emit('uplink', new Uint8Array(msg));
    });
    socket.on('error', (err) => this.emit('error', err));
    await new Promise<void>((resolve, reject) => {
      socket.once('error', reject);
      socket.bind(this.port, this.bind, () => {
        socket.off('error', reject);
        resolve();
      });
    });
    this.socket = socket;
    this.expiryTimer = setInterval(() => this.expire(), 1000);
  }

  /** Send a raw vehicle chunk to every live client. */
  forward(data: Uint8Array): void {
    if (!this.socket) return;
    for (const c of this.clients.values()) {
      this.socket.send(data, c.port, c.host);
    }
  }

  list(): ClientEndpoint[] {
    return [...this.clients.values()];
  }

  get hasClients(): boolean {
    return this.clients.size > 0;
  }

  async stop(): Promise<void> {
    if (this.expiryTimer) clearInterval(this.expiryTimer);
    this.expiryTimer = null;
    this.clients.clear();
    const socket = this.socket;
    this.socket = null;
    if (socket) await new Promise<void>((resolve) => socket.close(() => resolve()));
  }

  private expire(now = Date.now()): void {
    for (const [key, c] of this.clients) {
      if (now - c.lastSeen > CLIENT_TTL_MS) this.clients.delete(key);
    }
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldest = Infinity;
    for (const [key, c] of this.clients) {
      if (c.lastSeen < oldest) {
        oldest = c.lastSeen;
        oldestKey = key;
      }
    }
    if (oldestKey) this.clients.delete(oldestKey);
  }
}
