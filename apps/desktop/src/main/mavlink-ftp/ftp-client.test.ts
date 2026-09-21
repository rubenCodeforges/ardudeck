import { describe, it, expect } from 'vitest';
import { MavlinkFtpClient } from './ftp-client';
import {
  FtpOpcode,
  FtpError,
  parseFtpPayload,
  serializeFtpPayload,
  type FtpPayload,
} from './ftp-types';

const READ_SIZE = 16;

function makeFile(size: number): Uint8Array {
  const f = new Uint8Array(size);
  for (let i = 0; i < size; i++) f[i] = (i * 7 + 3) & 0xff;
  return f;
}

interface FcOptions {
  /** Answer BurstReadFile, or NAK it as UnknownCommand. */
  burst?: boolean;
  /** Return true to swallow the nth burst data packet (0-based, per burst). */
  dropBurstPacket?: (indexInBurst: number) => boolean;
  /** Serve only this many bytes even though OpenFileRO reported the full size. */
  servedBytes?: number;
  /** End each burst after this many packets, the way a bounded FC scheduler does. */
  burstMaxPackets?: number;
  /** Size OpenFileRO reports when it differs from the file, as ArduPilot's @PARAM estimate does. */
  reportedSize?: number;
  /** NAK reads whose size differs from the first one, as ArduPilot's @PARAM filesystem does. */
  lockReadSize?: boolean;
  /** NAK reads past the end with Fail instead of EOF. */
  failPastEnd?: boolean;
  /** Serve a partial chunk at these offsets without it being the end of the file. */
  shortReadAt?: Set<number>;
  /** Serve full chunks at ANY offset and never signal EOF, like a runaway server. */
  endless?: boolean;
  /** Overrun cap handed to the client (production default is 8 MiB). */
  maxOverrunBytes?: number;
}

/**
 * Minimal FTP server. Replies synchronously with seq = request.seq + 1, the way
 * ArduPilot and PX4 do, so the client's matching is exercised for real.
 */
function attachFc(file: Uint8Array, opts: FcOptions = {}) {
  const served = opts.servedBytes ?? file.length;
  const stats = { reads: 0, bursts: 0, burstOffsets: [] as number[] };
  let client!: MavlinkFtpClient;

  const reply = (req: FtpPayload, fields: Partial<FtpPayload>) => {
    client.handleResponse(serializeFtpPayload({
      seqNumber: (req.seqNumber + 1) & 0xffff,
      session: req.session,
      opcode: FtpOpcode.Ack,
      size: 0,
      reqOpcode: req.opcode,
      burstComplete: 0,
      offset: 0,
      data: new Uint8Array(0),
      ...fields,
    }));
  };

  const nak = (req: FtpPayload, err: number) =>
    reply(req, { opcode: FtpOpcode.Nak, size: 1, data: Uint8Array.of(err) });

  let lockedSize: number | null = null;
  const sizeRejected = (req: FtpPayload) => {
    if (!opts.lockReadSize) return false;
    lockedSize ??= req.size;
    return req.size !== lockedSize;
  };

  client = new MavlinkFtpClient({
    readSize: READ_SIZE,
    maxOverrunBytes: opts.maxOverrunBytes,
    sendPacket: async (raw) => {
      const req = parseFtpPayload(raw);
      switch (req.opcode) {
        case FtpOpcode.ResetSessions:
        case FtpOpcode.TerminateSession:
          reply(req, {});
          return;

        case FtpOpcode.OpenFileRO: {
          const size = new Uint8Array(4);
          new DataView(size.buffer).setUint32(0, opts.reportedSize ?? file.length, true);
          reply(req, { session: 1, size: 4, data: size });
          return;
        }

        case FtpOpcode.ReadFile: {
          stats.reads++;
          if (sizeRejected(req)) { nak(req, FtpError.FailErrno); return; }
          if (opts.endless) {
            reply(req, { offset: req.offset, size: req.size, data: new Uint8Array(req.size) });
            return;
          }
          if (req.offset >= served) { nak(req, opts.failPastEnd ? FtpError.Fail : FtpError.EOF); return; }
          const short = opts.shortReadAt?.has(req.offset) ? Math.floor(req.size / 2) : req.size;
          const end = Math.min(req.offset + short, served);
          reply(req, { offset: req.offset, size: end - req.offset, data: file.subarray(req.offset, end) });
          return;
        }

        case FtpOpcode.BurstReadFile: {
          if (!opts.burst) { nak(req, FtpError.UnknownCommand); return; }
          stats.bursts++;
          stats.burstOffsets.push(req.offset);
          if (sizeRejected(req)) { nak(req, FtpError.FailErrno); return; }
          if (req.offset >= served) { nak(req, FtpError.EOF); return; }
          const cap = opts.burstMaxPackets ?? Infinity;
          const stopAt = Math.min(served, req.offset + cap * req.size);
          let n = 0;
          for (let off = req.offset; off < stopAt; off += req.size, n++) {
            const short = opts.shortReadAt?.has(off) ? Math.floor(req.size / 2) : req.size;
            const end = Math.min(off + short, stopAt);
            const last = off + req.size >= stopAt;
            // The burst_complete packet always goes out: losing it only costs an
            // idle timeout, which is a separate concern from gap recovery.
            if (!last && opts.dropBurstPacket?.(n)) continue;
            reply(req, {
              offset: off,
              size: end - off,
              burstComplete: last ? 1 : 0,
              data: file.subarray(off, end),
            });
          }
          return;
        }

        default:
          nak(req, FtpError.UnknownCommand);
      }
    },
  });

  return { client, stats };
}

describe('MavlinkFtpClient burst download', () => {
  it('downloads a file in a single burst', async () => {
    const file = makeFile(200);
    const { client, stats } = attachFc(file, { burst: true });

    expect(await client.downloadFile('@PARAM/param.pck')).toEqual(file);
    expect(stats.bursts).toBe(1);
    expect(stats.reads).toBe(0);
  });

  it('refills holes left by dropped burst packets', async () => {
    const file = makeFile(400);
    const { client, stats } = attachFc(file, {
      burst: true,
      dropBurstPacket: (n) => n % 3 === 1,
    });

    expect(await client.downloadFile('@PARAM/param.pck')).toEqual(file);
    // Gaps are patched by targeted reads, not by replaying the stream.
    expect(stats.bursts).toBe(1);
    expect(stats.reads).toBeGreaterThan(0);
    expect(stats.reads).toBeLessThan(file.length / READ_SIZE);
  });

  it('resumes the next burst past the last one instead of restarting at zero', async () => {
    const file = makeFile(320);
    const { client, stats } = attachFc(file, { burst: true, burstMaxPackets: 4 });

    expect(await client.downloadFile('@PARAM/param.pck')).toEqual(file);
    expect(stats.burstOffsets).toEqual([0, 64, 128, 192, 256]);
  });

  it('falls back to sequential reads when the FC has no BurstReadFile', async () => {
    const file = makeFile(200);
    const { client, stats } = attachFc(file, { burst: false });

    expect(await client.downloadFile('@PARAM/param.pck')).toEqual(file);
    expect(stats.reads).toBeGreaterThan(0);
  });

  it('returns only the bytes actually served when the file ends early', async () => {
    const file = makeFile(200);
    const { client } = attachFc(file, { burst: false, servedBytes: 64 });

    const data = await client.downloadFile('@PARAM/param.pck');
    expect(data).toEqual(file.subarray(0, 64));
  });
});

describe('MavlinkFtpClient short reads mid-file', () => {
  // A server may serve fewer bytes than asked for without the file having
  // ended. Treating that as EOF silently truncates the download, which is how
  // a log pulled through the file browser comes back short.
  it('does not end a sequential download on a short read below the reported size', async () => {
    const file = makeFile(400);
    const { client } = attachFc(file, { burst: false, shortReadAt: new Set([READ_SIZE]) });

    expect(await client.downloadFile('/APM/LOGS/1.BIN')).toEqual(file);
  });

  it('patches a short burst packet instead of stopping there', async () => {
    const file = makeFile(400);
    const { client } = attachFc(file, { burst: true, shortReadAt: new Set([READ_SIZE]) });

    expect(await client.downloadFile('/APM/LOGS/1.BIN')).toEqual(file);
  });

  it('still ends on an EOF NAK wherever it lands', async () => {
    const file = makeFile(400);
    const { client } = attachFc(file, { burst: false, servedBytes: 128 });

    expect(await client.downloadFile('/APM/LOGS/1.BIN')).toEqual(file.subarray(0, 128));
  });
});

describe('MavlinkFtpClient with an estimated file size (ArduPilot @PARAM/param.pck)', () => {
  it('stops at the real end when OpenFileRO over-reports the size', async () => {
    const file = makeFile(200);
    const { client, stats } = attachFc(file, { burst: true, reportedSize: 320, lockReadSize: true });

    expect(await client.downloadFile('@PARAM/param.pck')).toEqual(file);
    expect(stats.bursts).toBe(1);
    expect(stats.reads).toBe(0);
  });

  it('keeps reading when OpenFileRO under-reports the size', async () => {
    const file = makeFile(300);
    const { client } = attachFc(file, { burst: true, reportedSize: 100, lockReadSize: true });

    expect(await client.downloadFile('@PARAM/param.pck')).toEqual(file);
  });

  it('patches dropped burst packets without changing the read size', async () => {
    const file = makeFile(390);
    const { client, stats } = attachFc(file, {
      burst: true,
      reportedSize: 480,
      lockReadSize: true,
      dropBurstPacket: (n) => n % 4 === 2,
    });

    expect(await client.downloadFile('@PARAM/param.pck')).toEqual(file);
    expect(stats.bursts).toBe(1);
    expect(stats.reads).toBeGreaterThan(0);
  });

  it('trusts the reported size when the FC errors instead of sending EOF past the end', async () => {
    for (const burst of [true, false]) {
      // An exact multiple of the read size, so no short packet marks the end.
      const file = makeFile(320);
      const { client } = attachFc(file, { burst, failPastEnd: true });

      expect(await client.downloadFile('/APM/LOGS/1.BIN')).toEqual(file);
    }
  });

  it('reads sequentially past a wrong size estimate', async () => {
    for (const reportedSize of [100, 200, 320]) {
      const file = makeFile(200);
      const { client } = attachFc(file, { burst: false, reportedSize, lockReadSize: true });

      expect(await client.downloadFile('@PARAM/param.pck')).toEqual(file);
    }
  });
});

describe('MavlinkFtpClient runaway server', () => {
  it('aborts instead of growing forever when full chunks never stop', async () => {
    const file = makeFile(100);
    const { client } = attachFc(file, { endless: true, maxOverrunBytes: 4 * READ_SIZE });

    expect(await client.downloadFile('@PARAM/param.pck')).toBeNull();
  });
});

describe('MavlinkFtpClient response matching', () => {
  it('ignores a reply whose seq belongs to an earlier request', async () => {
    let sentSeq = -1;
    const client = new MavlinkFtpClient({
      sendPacket: async (raw) => { sentSeq = parseFtpPayload(raw).seqNumber; },
    });

    const probe = client.probeWrite('/APM/x', 40);
    // A late ACK for the *previous* request: its seq is our seq, not our seq + 1.
    client.handleResponse(serializeFtpPayload({
      seqNumber: sentSeq, session: 1, opcode: FtpOpcode.Ack, size: 0,
      reqOpcode: FtpOpcode.OpenFileWO, burstComplete: 0, offset: 0, data: new Uint8Array(0),
    }));

    expect(await probe).toEqual({ ok: false, error: 'no response (timed out)' });
  });

  it('accepts the matching reply', async () => {
    let sentSeq = -1;
    const client = new MavlinkFtpClient({
      sendPacket: async (raw) => {
        sentSeq = parseFtpPayload(raw).seqNumber;
        client.handleResponse(serializeFtpPayload({
          seqNumber: (sentSeq + 1) & 0xffff, session: 1, opcode: FtpOpcode.Ack, size: 0,
          reqOpcode: FtpOpcode.OpenFileWO, burstComplete: 0, offset: 0, data: new Uint8Array(0),
        }));
      },
    });

    expect((await client.probeWrite('/APM/x', 200)).ok).toBe(true);
  });
});
