import { createSocket, type Socket } from 'node:dgram';
import { afterEach, describe, expect, it } from 'vitest';
import { UdpTransport } from '@ardudeck/comms';

// Pins reply detection and the ~60 B/s ELRS-backpack send metering.
const MSG_HEARTBEAT = 0;
const MSG_PARAM_REQUEST_READ = 20;
const MSG_COMMAND_LONG = 76;
const CMD_ARM = 400;

function v2Frame(msgid: number, payload: number[]): Uint8Array {
  return new Uint8Array([
    0xfd, payload.length, 0, 0, 1, 255, 190,
    msgid & 0xff, (msgid >> 8) & 0xff, (msgid >> 16) & 0xff,
    ...payload,
    0, 0,
  ]);
}

function msgidOf(frame: Uint8Array): number {
  return frame[7]! | (frame[8]! << 8) | (frame[9]! << 16);
}

const heartbeat = () => v2Frame(MSG_HEARTBEAT, [0, 0, 0, 0, 6, 8, 0, 0, 3]);
const paramRead = (index: number) => v2Frame(MSG_PARAM_REQUEST_READ, [index, 0, 1, 1]);
const arm = () => {
  const payload = new Array<number>(33).fill(0);
  payload[28] = CMD_ARM & 0xff;
  payload[29] = CMD_ARM >> 8;
  return v2Frame(MSG_COMMAND_LONG, payload);
};

interface Peer {
  socket: Socket;
  port: number;
  received: { at: number; data: Uint8Array }[];
}

async function peer(): Promise<Peer> {
  const socket = createSocket('udp4');
  const received: Peer['received'] = [];
  socket.on('message', (msg) => received.push({ at: Date.now(), data: new Uint8Array(msg) }));
  await new Promise<void>((resolve) => socket.bind(0, '127.0.0.1', resolve));
  return { socket, port: socket.address().port, received };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Ephemeral-range port for the transport itself; nothing else on the box listens here.
const transportPort = () => 40000 + Math.floor(Math.random() * 20000);

describe('UdpTransport reply detection', () => {
  const cleanup: (() => unknown)[] = [];
  afterEach(async () => {
    for (const c of cleanup.splice(0)) await c();
  });

  it('learns the reply target from MAVLink frames only, and keeps re-learning', async () => {
    const port = transportPort();
    const transport = new UdpTransport({ localPort: port });
    await transport.open();
    cleanup.push(() => transport.close());
    const noise = await peer();
    const vehicle = await peer();
    cleanup.push(() => noise.socket.close(), () => vehicle.socket.close());

    noise.socket.send(Buffer.from([1, 2, 3]), port, '127.0.0.1');
    await sleep(50);
    expect(transport.canWrite).toBe(false);

    vehicle.socket.send(Buffer.from(heartbeat()), port, '127.0.0.1');
    await sleep(50);
    expect(transport.canWrite).toBe(true);
    await transport.write(heartbeat());
    await sleep(50);
    expect(vehicle.received.length).toBe(1);
    expect(noise.received.length).toBe(0);

    // The vehicle moves (backpack rebooted onto a new address): follow it.
    const vehicle2 = await peer();
    cleanup.push(() => vehicle2.socket.close());
    vehicle2.socket.send(Buffer.from(heartbeat()), port, '127.0.0.1');
    await sleep(50);
    await transport.write(heartbeat());
    await sleep(50);
    expect(vehicle2.received.length).toBe(1);
    expect(vehicle.received.length).toBe(1);
  });

  it('never overwrites a configured target', async () => {
    const port = transportPort();
    const target = await peer();
    const other = await peer();
    cleanup.push(() => target.socket.close(), () => other.socket.close());
    const transport = new UdpTransport({
      localPort: port,
      remoteHost: '127.0.0.1',
      remotePort: target.port,
    });
    await transport.open();
    cleanup.push(() => transport.close());

    other.socket.send(Buffer.from(heartbeat()), port, '127.0.0.1');
    await sleep(50);
    await transport.write(heartbeat());
    await sleep(50);
    expect(target.received.length).toBe(1);
    expect(other.received.length).toBe(0);
  });
});

describe('UdpTransport metered uplink', () => {
  const cleanup: (() => unknown)[] = [];
  afterEach(async () => {
    for (const c of cleanup.splice(0)) await c();
  });

  async function linked(): Promise<{ transport: UdpTransport; vehicle: Peer }> {
    const port = transportPort();
    const transport = new UdpTransport({ localPort: port });
    await transport.open();
    cleanup.push(() => transport.close());
    const vehicle = await peer();
    cleanup.push(() => vehicle.socket.close());
    vehicle.socket.send(Buffer.from(heartbeat()), port, '127.0.0.1');
    await sleep(50);
    expect(transport.narrowUplink).toBe(true);
    return { transport, vehicle };
  }

  it('sends the pilot command ahead of queued housekeeping and meters the rest', async () => {
    const { transport, vehicle } = await linked();

    for (let i = 0; i < 4; i++) void transport.write(paramRead(i));
    void transport.write(arm());
    await sleep(2600);

    const order = vehicle.received.map((r) => msgidOf(r.data));
    expect(order).toEqual([
      MSG_COMMAND_LONG,
      MSG_PARAM_REQUEST_READ,
      MSG_PARAM_REQUEST_READ,
      MSG_PARAM_REQUEST_READ,
      MSG_PARAM_REQUEST_READ,
    ]);
    // 45 bytes of COMMAND_LONG is over a second of a 40 B/s budget.
    expect(vehicle.received[1]!.at - vehicle.received[0]!.at).toBeGreaterThan(1000);
    // 16-byte reads are 400 ms apart.
    expect(vehicle.received[2]!.at - vehicle.received[1]!.at).toBeGreaterThan(350);
  });

  it('never holds the heartbeat', async () => {
    const { transport, vehicle } = await linked();

    for (let i = 0; i < 4; i++) void transport.write(paramRead(i));
    await sleep(100);
    await transport.write(heartbeat());
    await sleep(50);

    const order = vehicle.received.map((r) => msgidOf(r.data));
    expect(order).toEqual([MSG_PARAM_REQUEST_READ, MSG_HEARTBEAT]);
  });

  it('drops a retry of a frame still waiting in the queue', async () => {
    const { transport, vehicle } = await linked();

    void transport.write(paramRead(5));
    void transport.write(paramRead(5));
    void transport.write(paramRead(5));
    await sleep(600);
    expect(vehicle.received.length).toBe(1);

    void transport.write(paramRead(5));
    await sleep(300);
    expect(vehicle.received.length).toBe(2);
  });
});
