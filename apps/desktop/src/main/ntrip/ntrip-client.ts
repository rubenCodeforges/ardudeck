/**
 * NTRIP caster client (issue #60). Speaks both protocol revisions over a raw
 * socket: v1 is the classic HTTP/1.0-shaped request answered with "ICY 200 OK"
 * and an unframed byte stream; v2 is proper HTTP/1.1 with an Ntrip-Version
 * header, where the response may use chunked transfer encoding (decoded here
 * before anything reaches the RTCM framer). 'auto' tries v2 first and falls
 * back to v1 once if the caster refuses the request form, then remembers what
 * worked for reconnects. Handles sourcetable fetch, the correction stream,
 * periodic GGA upload, and auto-reconnect with backoff.
 */

import { Socket, connect as netConnect } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
import type {
  NtripConfig,
  NtripMountpoint,
  NtripSourcetableResult,
  NtripStatus,
} from '../../shared/ntrip-types.js';
import { INITIAL_NTRIP_STATUS } from '../../shared/ntrip-types.js';
import { RtcmFramer, type RtcmFrame } from './rtcm.js';

const CONNECT_TIMEOUT_MS = 10000;
const SOURCETABLE_TIMEOUT_MS = 15000;
/** No caster bytes for this long while connected -> treat the link as dead. */
const STREAM_STALL_TIMEOUT_MS = 20000;
const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS = 30000;
const USER_AGENT = 'NTRIP ArduDeck';

function basicAuthHeader(username: string, password: string): string {
  return `Authorization: Basic ${Buffer.from(`${username}:${password}`).toString('base64')}\r\n`;
}

function buildRequest(
  config: NtripConfig,
  password: string,
  path: string,
  version: 'v1' | 'v2',
): string {
  let req =
    `GET /${path} HTTP/1.${version === 'v2' ? '1' : '0'}\r\n` +
    `Host: ${config.host}:${config.port}\r\n`;
  if (version === 'v2') req += 'Ntrip-Version: Ntrip/2.0\r\n';
  req += `User-Agent: ${USER_AGENT}\r\nAccept: */*\r\n`;
  if (config.username) req += basicAuthHeader(config.username, password);
  req += 'Connection: close\r\n\r\n';
  return req;
}

/**
 * Incremental HTTP/1.1 chunked-transfer decoder. NTRIP v2 casters may frame
 * the correction stream (and the sourcetable) in chunks; feeding the raw
 * socket bytes to the RTCM framer would interleave chunk-size lines with the
 * data and every straddling frame would fail its CRC. On any framing desync
 * it stops emitting rather than pass garbage through.
 */
class ChunkedDecoder {
  private buf: Buffer = Buffer.alloc(0);
  /** Bytes left in the current chunk; -1 = expecting the chunk's trailing CRLF. */
  private remaining = 0;
  private done = false;

  push(chunk: Buffer): Buffer {
    if (this.done) return Buffer.alloc(0);
    this.buf = this.buf.length === 0 ? chunk : Buffer.concat([this.buf, chunk]);
    const out: Buffer[] = [];
    while (!this.done) {
      if (this.remaining > 0) {
        if (this.buf.length === 0) break;
        const take = Math.min(this.remaining, this.buf.length);
        out.push(this.buf.subarray(0, take));
        this.buf = this.buf.subarray(take);
        this.remaining -= take;
        if (this.remaining === 0) this.remaining = -1;
        continue;
      }
      if (this.remaining === -1) {
        if (this.buf.length < 2) break;
        this.buf = this.buf.subarray(2);
        this.remaining = 0;
        continue;
      }
      const lineEnd = this.buf.indexOf('\r\n');
      if (lineEnd === -1) {
        if (this.buf.length > 16384) this.done = true; // no size line in 16KB: desync
        break;
      }
      const sizeToken = this.buf.subarray(0, lineEnd).toString('latin1').trim().split(';')[0] ?? '';
      this.buf = this.buf.subarray(lineEnd + 2);
      const size = /^[0-9a-fA-F]+$/.test(sizeToken) ? parseInt(sizeToken, 16) : NaN;
      if (Number.isNaN(size) || size === 0) {
        this.done = true; // 0 = terminal chunk; NaN = desync, stop emitting
        break;
      }
      this.remaining = size;
    }
    return out.length === 1 ? out[0]! : Buffer.concat(out);
  }
}

/**
 * Map raw Node socket errors to plain language before they reach status.error
 * (users were shown "getaddrinfo ENOTFOUND 1CEN" verbatim). Returns the
 * friendly text plus whether the failure is permanent: a hostname that does
 * not resolve is almost always a typo (or a mountpoint pasted into the host
 * field), so retrying it would just loop.
 */
function classifySocketError(
  message: string,
  config: NtripConfig,
): { message: string; permanent: boolean } {
  if (/ENOTFOUND|EAI_AGAIN/.test(message)) {
    return {
      message: `Host not found: "${config.host}". Enter the caster server name, e.g. caster.centipede.fr (the mountpoint goes in its own field).`,
      permanent: true,
    };
  }
  if (/ECONNREFUSED/.test(message)) {
    return {
      message: `Connection refused by ${config.host}:${config.port}. Check the port (NTRIP casters usually use 2101).`,
      permanent: false,
    };
  }
  if (/ETIMEDOUT|Connection timed out/.test(message)) {
    return {
      message: `Could not reach ${config.host}:${config.port} (timed out).`,
      permanent: false,
    };
  }
  return { message, permanent: false };
}

function openSocket(config: NtripConfig): Socket {
  if (config.useTls) {
    // Casters are commonly fronted by certs that don't match bare IPs; being
    // strict here would make TLS unusable for half the fleet-survey setups.
    return tlsConnect({ host: config.host, port: config.port, rejectUnauthorized: false });
  }
  return netConnect({ host: config.host, port: config.port });
}

/** Parse one sourcetable STR row (fields are ';'-separated, spec-ordered). */
function parseStrLine(line: string): NtripMountpoint | null {
  const f = line.split(';');
  if (f[0] !== 'STR' || !f[1]) return null;
  return {
    name: f[1],
    identifier: f[2] ?? '',
    format: f[3] ?? '',
    navSystem: f[6] ?? '',
    country: f[8] ?? '',
    lat: Number(f[9]) || 0,
    lon: Number(f[10]) || 0,
    needsGga: f[11] === '1',
    needsAuth: (f[15] ?? 'N') !== 'N',
  };
}

/**
 * One-shot sourcetable fetch. Independent of any running stream so the
 * mountpoint list can be refreshed while corrections are flowing.
 */
export function fetchSourcetable(
  config: NtripConfig,
  password: string,
): Promise<NtripSourcetableResult> {
  return new Promise((resolve) => {
    if (!config.host) {
      resolve({ success: false, error: 'Caster host is not set' });
      return;
    }
    let settled = false;
    const done = (result: NtripSourcetableResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(result);
    };

    let socket: Socket;
    try {
      socket = openSocket(config);
    } catch (err) {
      resolve({ success: false, error: err instanceof Error ? err.message : String(err) });
      return;
    }
    const timer = setTimeout(() => done({ success: false, error: 'Sourcetable request timed out' }), SOURCETABLE_TIMEOUT_MS);

    const chunks: Buffer[] = [];
    // v1-only casters answer a v2-form sourcetable request fine (the STR body
    // is identical), so only an explicit v1 setting downgrades the request.
    const version = config.protocol === 'v1' ? 'v1' : 'v2';
    // TLS sockets also emit 'connect' (TCP level) before the handshake, so
    // attach only the event that means "ready to write" for this socket kind.
    socket.on(config.useTls ? 'secureConnect' : 'connect', () =>
      socket.write(buildRequest(config, password, '', version)));
    socket.on('data', (d: Buffer) => chunks.push(d));
    socket.on('error', (err: Error) =>
      done({ success: false, error: classifySocketError(err.message, config).message }));
    socket.on('close', () => {
      const raw = Buffer.concat(chunks);
      const full = raw.toString('latin1');
      if (/(^|\r\n)HTTP\/\d\.\d 401/.test(full) || full.startsWith('HTTP/1.0 401')) {
        done({ success: false, error: 'Authentication rejected by caster' });
        return;
      }
      // Split headers from body; v2 casters may chunk-encode the body, which
      // would otherwise splice hex chunk-size lines into the STR rows.
      let text = full;
      const headerEnd = full.indexOf('\r\n\r\n');
      if (headerEnd !== -1) {
        const headers = full.slice(0, headerEnd);
        let body: Buffer = raw.subarray(headerEnd + 4);
        if (/transfer-encoding:\s*chunked/i.test(headers)) {
          body = new ChunkedDecoder().push(body);
        }
        text = body.toString('latin1');
      }
      const mountpoints = text
        .split(/\r?\n/)
        .map(parseStrLine)
        .filter((m): m is NtripMountpoint => m !== null);
      if (mountpoints.length === 0) {
        done({ success: false, error: 'Caster returned no mountpoints' });
        return;
      }
      done({ success: true, mountpoints });
    });
  });
}

export interface NtripClientDeps {
  /** Encrypted-store password lookup, resolved at connect time. */
  getPassword: () => string;
  /** Current GGA sentence, or null when the vehicle has no usable fix. */
  getGga: () => string | null;
  /** Complete CRC-checked RTCM frame ready for MAVLink injection. */
  onRtcmFrame: (frame: RtcmFrame) => void | Promise<void>;
  onStatus: (status: NtripStatus) => void;
}

export class NtripClient {
  private deps: NtripClientDeps;
  private config: NtripConfig | null = null;
  private socket: Socket | null = null;
  private framer = new RtcmFramer();
  private status: NtripStatus = { ...INITIAL_NTRIP_STATUS, rtcmTypeCounts: {} };

  /** User intent: keep the stream up (drives auto-reconnect). */
  private enabled = false;
  private headerBuf = '';
  private headersDone = false;
  private ggaTimer: NodeJS.Timeout | null = null;
  private statusTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private bytesThisSecond = 0;
  /** Protocol revision the current/last socket attempt used. */
  private attemptVersion: 'v1' | 'v2' = 'v2';
  /** Revision that produced a 200; reconnects reuse it instead of re-probing. */
  private negotiatedVersion: 'v1' | 'v2' | null = null;
  /** Set when an 'auto' v2 attempt was refused; all further attempts use v1. */
  private v2Refused = false;
  /** Active when the caster streams with chunked transfer encoding (v2). */
  private chunkDecoder: ChunkedDecoder | null = null;

  constructor(deps: NtripClientDeps) {
    this.deps = deps;
  }

  getStatus(): NtripStatus {
    return { ...this.status, rtcmTypeCounts: { ...this.status.rtcmTypeCounts } };
  }

  connect(config: NtripConfig): { success: boolean; error?: string } {
    if (!config.host) return { success: false, error: 'Caster host is not set' };
    if (!config.mountpoint) return { success: false, error: 'Mountpoint is not set' };
    this.teardownSocket();
    this.clearReconnect();
    this.enabled = true;
    this.config = config;
    this.reconnectAttempt = 0;
    this.negotiatedVersion = null;
    this.v2Refused = false;
    this.status = {
      ...INITIAL_NTRIP_STATUS,
      rtcmTypeCounts: {},
      mountpoint: config.mountpoint,
      state: 'connecting',
      ggaState: config.sendPosition ? 'waiting-for-fix' : 'off',
    };
    this.openStream();
    return { success: true };
  }

  disconnect(): void {
    this.enabled = false;
    this.clearReconnect();
    this.teardownSocket();
    this.setStatus({ state: 'disconnected', dataRateBps: 0 });
  }

  private openStream(): void {
    const config = this.config;
    if (!config || !this.enabled) return;

    this.framer.reset();
    this.headerBuf = '';
    this.headersDone = false;

    let socket: Socket;
    try {
      socket = openSocket(config);
    } catch (err) {
      this.handleStreamFailure(err instanceof Error ? err.message : String(err));
      return;
    }
    this.socket = socket;
    socket.setTimeout(CONNECT_TIMEOUT_MS);

    const protocol = config.protocol ?? 'auto';
    this.attemptVersion =
      protocol === 'auto' ? (this.v2Refused ? 'v1' : (this.negotiatedVersion ?? 'v2')) : protocol;

    const sendRequest = () => {
      socket.write(buildRequest(config, this.deps.getPassword(), encodeURI(config.mountpoint), this.attemptVersion));
    };
    if (config.useTls) socket.on('secureConnect', sendRequest);
    else socket.on('connect', sendRequest);

    socket.on('timeout', () => {
      // Doubles as connect timeout and stream-stall watchdog.
      const reason = this.headersDone ? 'Correction stream stalled' : 'Connection timed out';
      socket.destroy(new Error(reason));
    });

    socket.on('data', (chunk: Buffer) => this.handleData(chunk));
    socket.on('error', (err: Error) => this.handleStreamFailure(err.message));
    socket.on('close', () => {
      if (this.socket !== socket) return; // superseded by a newer socket
      if (this.enabled) this.handleStreamFailure(this.status.error ?? 'Caster closed the connection');
    });
  }

  private handleData(chunk: Buffer): void {
    if (!this.headersDone) {
      this.headerBuf += chunk.toString('latin1');
      const headerEnd = this.headerBuf.indexOf('\r\n\r\n');
      if (headerEnd === -1) {
        if (this.headerBuf.length > 8192) this.failPermanently('Caster sent an invalid response header');
        return;
      }
      const header = this.headerBuf.slice(0, headerEnd);
      const firstLine = header.split('\r\n', 1)[0] ?? '';

      if (firstLine.startsWith('SOURCETABLE')) {
        this.failPermanently(`Mountpoint "${this.config?.mountpoint}" not found (caster returned its sourcetable)`);
        return;
      }
      if (/ 401\b/.test(firstLine)) {
        this.failPermanently('Authentication rejected by caster (check username/password)');
        return;
      }
      if (!/^ICY 200/.test(firstLine) && !/^HTTP\/\d\.\d 200/.test(firstLine)) {
        // 'auto' probes v2 first; an unrecognized refusal from a v1-only
        // caster gets one immediate retry with the classic request form.
        // 401/SOURCETABLE above are real answers, not version mismatches.
        if (this.config?.protocol !== 'v1' && this.config?.protocol !== 'v2'
            && this.attemptVersion === 'v2' && !this.v2Refused) {
          this.v2Refused = true;
          this.teardownSocket();
          this.openStream();
          return;
        }
        this.failPermanently(`Caster refused the stream: ${firstLine || 'empty response'}`);
        return;
      }

      this.negotiatedVersion = this.attemptVersion;
      this.chunkDecoder = /transfer-encoding:\s*chunked/i.test(header) ? new ChunkedDecoder() : null;
      this.headersDone = true;
      this.reconnectAttempt = 0;
      this.socket?.setTimeout(STREAM_STALL_TIMEOUT_MS);
      this.setStatus({
        state: 'connected',
        connectedAtMs: Date.now(),
      });
      delete this.status.error;
      this.startGgaUploads();
      this.startStatusTicker();

      const rest = this.headerBuf.slice(headerEnd + 4);
      this.headerBuf = '';
      if (rest.length > 0) this.ingestRtcm(Buffer.from(rest, 'latin1'));
      return;
    }
    this.ingestRtcm(chunk);
  }

  private ingestRtcm(raw: Buffer): void {
    const chunk = this.chunkDecoder ? this.chunkDecoder.push(raw) : raw;
    if (chunk.length === 0) return;
    this.status.bytesReceived += chunk.length;
    this.bytesThisSecond += chunk.length;
    const frames = this.framer.push(new Uint8Array(chunk));
    for (const frame of frames) {
      this.status.rtcmTypeCounts[frame.type] = (this.status.rtcmTypeCounts[frame.type] ?? 0) + 1;
      void this.deps.onRtcmFrame(frame);
    }
  }

  /** Count a forwarded/dropped injection, reported by the IPC layer. */
  noteInjection(forwarded: boolean): void {
    if (forwarded) this.status.rtcmForwarded++;
    else this.status.rtcmDropped++;
  }

  private startGgaUploads(): void {
    this.stopGgaUploads();
    const config = this.config;
    if (!config?.sendPosition) {
      this.setStatus({ ggaState: 'off' });
      return;
    }
    const sendGga = () => {
      if (!this.socket || !this.headersDone) return;
      const gga = this.deps.getGga();
      if (gga === null) {
        this.setStatus({ ggaState: 'waiting-for-fix' });
        return;
      }
      this.socket.write(gga);
      this.status.ggaSentCount++;
      this.setStatus({ ggaState: 'sending' });
    };
    // VRS casters wait for the first GGA before they start streaming.
    sendGga();
    const intervalMs = Math.max(1, config.ggaIntervalSec) * 1000;
    this.ggaTimer = setInterval(sendGga, intervalMs);
  }

  private stopGgaUploads(): void {
    if (this.ggaTimer) clearInterval(this.ggaTimer);
    this.ggaTimer = null;
  }

  private startStatusTicker(): void {
    this.stopStatusTicker();
    this.statusTimer = setInterval(() => {
      this.status.dataRateBps = this.bytesThisSecond;
      this.bytesThisSecond = 0;
      this.pushStatus();
    }, 1000);
  }

  private stopStatusTicker(): void {
    if (this.statusTimer) clearInterval(this.statusTimer);
    this.statusTimer = null;
  }

  /** Transient failure: keep trying while the user wants the stream up. */
  private handleStreamFailure(reason: string): void {
    this.teardownSocket();
    if (!this.enabled) return;
    const classified = this.config
      ? classifySocketError(reason, this.config)
      : { message: reason, permanent: false };
    if (classified.permanent) {
      this.failPermanently(classified.message);
      return;
    }
    this.clearReconnect();
    this.reconnectAttempt++;
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** (this.reconnectAttempt - 1), RECONNECT_MAX_MS);
    this.setStatus({ state: 'reconnecting', error: classified.message, dataRateBps: 0 });
    this.reconnectTimer = setTimeout(() => this.openStream(), delay);
  }

  /** Config-level failure (bad mountpoint/credentials): retrying won't help. */
  private failPermanently(reason: string): void {
    this.enabled = false;
    this.clearReconnect();
    this.teardownSocket();
    this.setStatus({ state: 'error', error: reason, dataRateBps: 0 });
  }

  private teardownSocket(): void {
    this.stopGgaUploads();
    this.stopStatusTicker();
    if (this.socket) {
      const s = this.socket;
      this.socket = null;
      s.removeAllListeners();
      s.destroy();
    }
    this.headersDone = false;
    this.headerBuf = '';
    this.chunkDecoder = null;
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private setStatus(patch: Partial<NtripStatus>): void {
    Object.assign(this.status, patch);
    this.pushStatus();
  }

  private pushStatus(): void {
    this.deps.onStatus(this.getStatus());
  }
}
