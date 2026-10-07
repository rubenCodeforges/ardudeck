import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import { waitForSerial0Announce } from './readiness';

describe('SITL SERIAL0 readiness', () => {
  it('resolves on the announcement even when it arrives split across chunks', async () => {
    const out = new PassThrough();
    const ready = waitForSerial0Announce([out], 1000);
    out.write('bind port 5770 for SERIAL0\r\nSERIAL0 on TC');
    out.write('P port 5770\r\nWaiting for connection ....\r\n');
    expect(await ready).toBe(true);
  });

  it('finds it on stderr, where native SITL prints it', async () => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const ready = waitForSerial0Announce([stdout, stderr], 1000);
    stdout.write('Waiting for connection ....\n');
    stderr.write('bind port 5770 for SERIAL0\nSERIAL0 on TCP port 5770\n');
    expect(await ready).toBe(true);
    expect(stdout.listenerCount('data')).toBe(0);
    expect(stderr.listenerCount('data')).toBe(0);
  });

  it('ignores other serial ports', async () => {
    const out = new PassThrough();
    const ready = waitForSerial0Announce([out], 100);
    out.write('SERIAL1 on TCP port 5762\n');
    expect(await ready).toBe(false);
  });

  it('reports not ready once every stream has ended', async () => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const ready = waitForSerial0Announce([stdout, stderr], 5000);
    stdout.write('Starting sketch\n');
    stdout.destroy();
    stderr.destroy();
    expect(await ready).toBe(false);
  });

  it('leaves the stream flowing for the log reader after it resolves', async () => {
    const out = new PassThrough();
    const logged: string[] = [];
    out.on('data', (d: Buffer) => logged.push(d.toString()));
    const ready = waitForSerial0Announce([out], 1000);
    out.write('SERIAL0 on TCP port 5760\n');
    expect(await ready).toBe(true);
    out.write('New connection on SERIAL0\n');
    await new Promise((r) => setImmediate(r));
    expect(logged.join('')).toContain('New connection on SERIAL0');
    expect(out.listenerCount('data')).toBe(1);
  });

  it('handles a missing stdout', async () => {
    expect(await waitForSerial0Announce([null, undefined], 10)).toBe(false);
  });
});
