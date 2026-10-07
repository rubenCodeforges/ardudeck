import type { Connection } from '../connections.js';

/** The orchestrator's link syntax (rust-mavlink connection strings) for a saved connection. */
export function engineLinkFor(c: Connection): string {
  switch (c.type) {
    case 'udp-listen': return `udpin:0.0.0.0:${c.port}`;
    case 'udp-peer': return `udpout:${c.host}:${c.port}`;
    case 'tcp': return `tcpout:${c.host}:${c.port}`;
    case 'serial': return `serial:${c.path}:${c.baudRate}`;
  }
}

export function engineArgs(bind: string, links: readonly string[]): string[] {
  return ['--bind', bind, ...links.flatMap((link) => ['--link', link])];
}
