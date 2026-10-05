import { describe, it, expect, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serializeV2, serializeHeartbeat, HEARTBEAT_ID, HEARTBEAT_CRC_EXTRA } from '@ardudeck/mavlink-ts';
import { LinkService } from './link-service.js';
import type { LinkdConfig } from './config.js';

/** In-memory vehicle side: tests push MAVLink in with `emit('data', …)`. */
class FakeTransport extends EventEmitter {
  isOpen = false;
  canWrite = true;
  bytesToRead = 0;
  bytesToWrite = 0;
  portName = 'fake';
  baudRate = 0;
  async open() { this.isOpen = true; }
  async close() { this.isOpen = false; }
  async write() { /* swallow */ }
}

function heartbeat(armed: boolean): Uint8Array {
  const payload = serializeHeartbeat({ type: 2, autopilot: 3, baseMode: armed ? 0x81 : 0x01, customMode: 5, systemStatus: armed ? 4 : 3, mavlinkVersion: 3 });
  return serializeV2(HEARTBEAT_ID, payload, HEARTBEAT_CRC_EXTRA, { sysid: 1, compid: 1 });
}

describe('LinkService safety', () => {
  let dir: string;
  let service: LinkService | null = null;
  afterEach(async () => {
    await service?.stop();
    service = null;
    rmSync(dir, { recursive: true, force: true });
  });

  async function start() {
    dir = mkdtempSync(join(tmpdir(), 'linkd-'));
    const config: LinkdConfig = {
      vehiclePort: 14550, clientPort: 25000 + Math.floor(Math.random() * 5000), clientBind: '127.0.0.1', apiPort: 0,
      settingsFile: join(dir, 'links.json'), stateDir: dir, sysid: 254, compid: 191,
    };
    const transport = new FakeTransport();
    service = new LinkService(config, () => {}, transport as never);
    await service.start();
    return transport;
  }

  it('refuses to turn the link off or switch it while the vehicle is armed', async () => {
    const t = await start();
    t.emit('data', heartbeat(true));
    expect(service!.vehicle?.armed).toBe(true);
    await expect(service!.setEnabled(false)).rejects.toThrow(/armed/);
    await expect(service!.upsertConnection({ type: 'udp-listen', port: 14600 }, true)).rejects.toThrow(/armed/);
    expect(service!.settings.enabled).toBe(true);
  });

  it('allows it once disarmed', async () => {
    const t = await start();
    t.emit('data', heartbeat(false));
    await expect(service!.setEnabled(false)).resolves.toBeUndefined();
    expect(service!.settings.enabled).toBe(false);
  });
});
