import { describe, it, expect, afterEach } from 'vitest';
import { createSocket, type Socket } from 'node:dgram';
import { ClientRouter } from './client-router.js';

const PORT = 24570 + Math.floor(Math.random() * 1000);

function client(): Promise<Socket> {
  return new Promise((resolve) => {
    const s = createSocket('udp4');
    s.bind(0, '127.0.0.1', () => resolve(s));
  });
}

describe('ClientRouter', () => {
  let router: ClientRouter | null = null;
  const sockets: Socket[] = [];
  afterEach(async () => {
    await router?.stop();
    router = null;
    for (const s of sockets.splice(0)) s.close();
  });

  it('learns a client from its first datagram, passes it uplink and fans vehicle data back', async () => {
    router = new ClientRouter(PORT, '127.0.0.1');
    await router.start();
    const uplink: Uint8Array[] = [];
    router.on('uplink', (b: Uint8Array) => uplink.push(b));

    const c = await client();
    sockets.push(c);
    const received = new Promise<Buffer>((resolve) => c.once('message', resolve));
    await new Promise<void>((r) => c.send(Uint8Array.from([0xfd, 1, 2]), PORT, '127.0.0.1', () => r()));
    await new Promise((r) => setTimeout(r, 50));

    expect(router.list()).toHaveLength(1);
    expect(Array.from(uplink[0]!)).toEqual([0xfd, 1, 2]);

    router.forward(Uint8Array.from([9, 9]));
    expect(Array.from(await received)).toEqual([9, 9]);
  });
});
