import { describe, it, expect, afterEach } from 'vitest';
import { createSocket } from 'dgram';
import { UdpTransport } from './udp-transport.js';

describe('UdpTransport receive buffer', () => {
  let t: UdpTransport | null = null;
  afterEach(async () => { await t?.close(); t = null; });

  it('stays bounded when the consumer only listens to data events', async () => {
    const port = 30000 + Math.floor(Math.random() * 20000);
    t = new UdpTransport({ localPort: port });
    let seen = 0;
    t.on('data', (d: Uint8Array) => { seen += d.length; });
    await t.open();
    const tx = createSocket('udp4');
    const chunk = Buffer.alloc(1400, 0xfd);
    for (let i = 0; i < 1100; i++) {
      await new Promise<void>((r) => tx.send(chunk, port, '127.0.0.1', () => r()));
      // Pace the burst so the kernel's socket buffer doesn't drop datagrams.
      if (i % 20 === 19) await new Promise((r) => setTimeout(r, 5));
    }
    await new Promise((r) => setTimeout(r, 300));
    tx.close();
    expect(seen).toBeGreaterThan(1024 * 1024);
    expect(t.bytesToRead).toBeLessThanOrEqual(1024 * 1024 + 1400);
  });
});
