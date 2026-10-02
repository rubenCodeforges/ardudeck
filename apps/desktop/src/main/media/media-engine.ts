/**
 * Media engine — turns any network camera source into something a Chromium
 * <video> can actually play, at low latency.
 *
 * Architecture:
 *  - MediaMTX runs as a long-lived sidecar (the "hub"). It ingests RTSP / SRT
 *    and republishes every path as WebRTC/WHEP, which the renderer plays
 *    directly. This is the lowest-latency path that needs zero per-source code.
 *  - ffmpeg is the normalizer for inputs MediaMTX can't pull itself — raw
 *    H.264-over-UDP (RubyFPV, companion GStreamer pipelines). ffmpeg remuxes
 *    (-c copy, no transcode) and publishes into the hub over RTSP.
 *  - ffmpeg also does snapshot + record (copy, no re-encode).
 *  - 'webrtc' sources are already WHEP — passed straight through, no hub.
 *  - 'uvc' never reaches here; the renderer plays capture devices directly.
 *
 * Binaries are resolved from resources/bin first (bundled), then PATH. When
 * neither is present the engine degrades gracefully: start() returns a clear
 * error and getStatus() reports what's missing so the UI can guide setup.
 */

import { spawn, type ChildProcess, spawnSync } from 'node:child_process';
import { basename, dirname, join } from 'node:path';
import { existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { app } from 'electron';
import { mediaBinariesDownloader } from './media-binaries-downloader.js';
import { bridgeFailureReason, buildWfbngSdp, buildWfbngFfmpegArgs, wfbngPort, wfbngShouldTranscode } from './wfbng.js';
import { needsH264Relay, buildH264RelayArgs, encoderChain } from './h264-relay.js';
import { wfbngReceiver } from './wfbng-receiver.js';
import type {
  CameraSourceConfig,
  CameraStartResult,
  CameraStreamSession,
  CameraMediaActionResult,
  MediaEngineStatus,
  CanvasStreamStartResult,
  CanvasStreamStatus,
  CameraStartPhase,
} from '../../shared/camera-types.js';
import { HUB_HOST, HUB_RTSP_PORT, HUB_WEBRTC_PORT, HUB_SRT_PORT } from '../../shared/camera-types.js';
import { t } from '../../shared/i18n/index.js';

const API_PORT = 9997;
// A real stream passes this within a fraction of a second; a handshake-only path never does.
const VIDEO_MIN_BYTES = 4096;
const VIDEO_FLOW_TIMEOUT_MS = 5000;
const RTSP_PORT = HUB_RTSP_PORT;
const WEBRTC_PORT = HUB_WEBRTC_PORT;
const WEBRTC_UDP_PORT = 8189;
const SRT_PORT = HUB_SRT_PORT;
const HOST = HUB_HOST;
/** Bridged-ingest reconnect: base backoff, ceiling, and the wfb-rx rtp-stall window. */
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 5000;
const RTP_STALL_MS = 4000;
const WATCHDOG_TICK_MS = 2000;

interface ActiveSession {
  session: CameraStreamSession;
  /** ffmpeg ingest process (rtp-udp / rubyfpv inputs), if any. */
  ingest?: ChildProcess;
  /** ffmpeg recording process, if recording. */
  record?: ChildProcess;
  recordPath?: string;
  /** Hub path registered via the API (pull sources) — must be deleted on stop. */
  configuredPath?: string;
  /** True when this session started the wfb-ng dongle receiver sidecar. */
  usesWfbReceiver?: boolean;
  /** Config kept so a dropped ingest can be rebuilt without the renderer. */
  source?: CameraSourceConfig;
  resolvedUrl?: string;
  /** Auto-reconnect bookkeeping for a bridged ingest that exits or stalls. */
  restartAttempts?: number;
  restartTimer?: ReturnType<typeof setTimeout>;
  /** Last wfb-rx rtp packet count + when it last advanced, for stall detection. */
  lastRtp?: number;
  lastRtpAt?: number;
}

export class MediaEngine {
  /** Startup progress for the Vision panel; set by the IPC layer. */
  onPhase: ((sourceId: string, phase: CameraStartPhase) => void) | null = null;

  private hub: ChildProcess | null = null;
  private sessions = new Map<string, ActiveSession>();
  /** In-flight start() per source id, so concurrent starts of the same feed
      (Vision panel + OSD backdrop + grid tile all mount at once) run once. */
  private starting = new Map<string, Promise<CameraStartResult>>();
  private ffmpegPath: string | null = null;
  private mediamtxPath: string | null = null;
  private hubReady = false;
  /** Last reason the hub failed to come up (mediamtx stderr / exit code). */
  private lastHubError: string | null = null;
  /** Rolling tail of mediamtx stdout+stderr, for surfacing source-pull errors. */
  private hubLog = '';
  /**
   * ffmpeg's own output. It was piped and never read, so a relay that failed
   * said only "failed to start", and once the pipe buffer filled ffmpeg would
   * block on its next write.
   */
  private ffmpegLog = '';
  /** Encoder the last relay actually started with, for diagnostics. */
  private relayEncoder: string | null = null;
  /** Periodic stall check for bridged (wfb-ng) sessions. */
  private watchdog: ReturnType<typeof setInterval> | null = null;
  /**
   * Last seen state of each hub WebRTC session, newest last. The hub deletes a session
   * the moment it times out, so a later Diag click would otherwise find nothing.
   */
  private webrtcSeen = new Map<string, string>();
  logSink?: (level: 'info' | 'warn' | 'error', msg: string) => void;

  /** Resolve binaries; idempotent. Called lazily on first use. */
  private resolveBinaries(): void {
    if (this.ffmpegPath === null) this.ffmpegPath = this.findBinary('ffmpeg');
    if (this.mediamtxPath === null) this.mediamtxPath = this.findBinary('mediamtx');
  }

  private binDir(): string {
    // Mirrors esp32-flasher: bundled binaries live under
    // resources/bin/<platform>/, unpacked from the asar when packaged.
    const appPath = app.getAppPath();
    const base = app.isPackaged ? appPath.replace('app.asar', 'app.asar.unpacked') : appPath;
    return join(base, 'resources', 'bin', process.platform);
  }

  /**
   * Resolve a binary: bundled (resources/bin/<platform>) first, then the
   * on-demand download dir (userData/media-bin), then PATH.
   */
  private findBinary(name: 'ffmpeg' | 'mediamtx'): string | null {
    const ext = process.platform === 'win32' ? '.exe' : '';
    const bundled = join(this.binDir(), name + ext);
    if (existsSync(bundled)) return bundled;
    const downloaded = mediaBinariesDownloader.binaryPath(name);
    if (existsSync(downloaded)) return downloaded;
    // Probe PATH.
    const probe = spawnSync(name, ['-version'], { stdio: 'ignore' });
    if (!probe.error) return name;
    return null;
  }

  /** Fetch missing binaries on demand, then re-resolve. */
  async downloadBinaries(onLog?: (line: string) => void): Promise<MediaEngineStatus> {
    await mediaBinariesDownloader.ensure(onLog);
    this.ffmpegPath = null;
    this.mediamtxPath = null;
    return this.getStatus();
  }

  getStatus(): MediaEngineStatus {
    this.resolveBinaries();
    const detail = !this.mediamtxPath
      ? t('main:media.engineNotInstalledDetail')
      : this.lastHubError
        ? t('main:media.hubFailedDetail', { error: this.lastHubError })
        : !this.ffmpegPath
          ? t('main:media.ffmpegMissingDetail')
          : undefined;
    return {
      hubReady: this.hubReady,
      ffmpegReady: this.ffmpegPath !== null,
      ffmpegPath: this.ffmpegPath,
      ...(detail !== undefined ? { detail } : {}),
    };
  }

  /** Start MediaMTX if not already running. Resolves once the API answers. */
  private async ensureHub(): Promise<boolean> {
    if (this.hubReady && this.hub) return true;
    this.resolveBinaries();
    if (!this.mediamtxPath) return false;

    // MediaMTX watches the DIRECTORY of its config file for hot-reload. The
    // userData root contains Electron's SingletonSocket (a unix socket) which
    // the directory watcher can't stat ("operation not supported on socket"),
    // and that aborts startup. So the config lives in its own clean subdir.
    const cfgDir = join(app.getPath('userData'), 'media-engine');
    if (!existsSync(cfgDir)) mkdirSync(cfgDir, { recursive: true });
    const cfgPath = join(cfgDir, 'mediamtx.yml');
    writeFileSync(cfgPath, this.hubConfig(), 'utf8');

    this.lastHubError = null;
    // Keep a rolling tail of mediamtx output so both a startup failure (port
    // clash, bad config) and a per-source pull failure (DNS, refused, 404, 401)
    // surface a real reason instead of a generic message.
    this.hubLog = '';
    const append = (d: Buffer) => { this.hubLog = (this.hubLog + d.toString()).slice(-4000); };
    this.hub = spawn(this.mediamtxPath, [cfgPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.hub.stderr?.on('data', append);
    this.hub.stdout?.on('data', append);
    this.hub.on('exit', (code) => {
      this.hubReady = false;
      this.hub = null;
      const errLine = this.hubLog.split('\n').reverse().find((l) => /ERR|error|panic/i.test(l));
      this.lastHubError = errLine?.trim() || `mediamtx exited (code ${code ?? 'null'})`;
    });

    // Poll the API until it answers (or give up after ~5s).
    for (let i = 0; i < 25; i++) {
      await delay(200);
      if (await this.hubAlive()) {
        this.hubReady = true;
        return true;
      }
    }
    return false;
  }

  private async hubAlive(): Promise<boolean> {
    try {
      const res = await fetch(`http://${HOST}:${API_PORT}/v3/paths/list`);
      return res.ok;
    } catch {
      return false;
    }
  }

  private hubConfig(): string {
    return [
      // 'info' so source-pull failure reasons ("destroyed: dial tcp i/o
      // timeout", "401 Unauthorized", "bad status code: 404") are logged — at
      // 'error' level mediamtx omits them and we'd only get a generic failure.
      'logLevel: info',
      'api: yes',
      `apiAddress: ${HOST}:${API_PORT}`,
      'rtsp: yes',
      // Bound to loopback: the only thing that connects to the hub's RTSP server
      // is our own ffmpeg bridge (over 127.0.0.1). Keeping it off all-interfaces
      // means nothing is exposed to the LAN and macOS never shows the firewall
      // "accept incoming connections?" prompt. Camera sources are OUTBOUND pulls,
      // which need no inbound listener.
      `rtspAddress: ${HOST}:${RTSP_PORT}`,
      // TCP-only RTSP server: the only RTSP publisher is our own ffmpeg bridge
      // (which we tell -rtsp_transport tcp). This drops the default UDP RTP
      // listeners on :8000/:8001 so the hub can't collide with another RTSP
      // server (or a second instance) on those ports.
      'rtspTransports: [tcp]',
      'webrtc: yes',
      `webrtcAddress: ${HOST}:${WEBRTC_PORT}`,
      // A local UDP ICE listener is REQUIRED — MediaMTX refuses to start if none
      // of UDP/TCP/ICEServers is set. This is the loopback host-candidate path.
      `webrtcLocalUDPAddress: ${HOST}:${WEBRTC_UDP_PORT}`,
      'srt: yes',
      `srtAddress: ${HOST}:${SRT_PORT}`,
      'hls: no',
      'rtmp: no',
      // MoQ (Media-over-QUIC) is on by default in MediaMTX v1.19+ and binds
      // :8892 — we don't use it, and leaving it on risks a port collision.
      'moq: no',
      'paths:',
      '  all_others:',
      '',
    ].join('\n');
  }

  /**
   * Register a pull-source path with the hub. Uses `replace` (not `add`) so it
   * is idempotent — re-running for the same source id (a retry, a transport
   * switch, or a dev StrictMode remount) upserts instead of failing with
   * "path already exists".
   */
  private async addHubPath(name: string, source: string, rtspTransport: 'automatic' | 'tcp' | 'udp' = 'automatic'): Promise<boolean> {
    try {
      const res = await fetch(`http://${HOST}:${API_PORT}/v3/config/paths/replace/${encodeURIComponent(name)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          source,
          sourceOnDemand: false,
          // 'automatic' (default) negotiates UDP then falls back to TCP. The
          // operator can override per source. Forcing 'udp' silently fails
          // against TCP-only sources, so it's an explicit opt-in only.
          rtspTransport,
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async removeHubPath(name: string): Promise<void> {
    try {
      await fetch(`http://${HOST}:${API_PORT}/v3/config/paths/delete/${encodeURIComponent(name)}`, { method: 'POST' });
    } catch {
      /* best-effort */
    }
  }

  /**
   * Pull the last source-related error line for a path out of the mediamtx log,
   * trimmed to the human-readable reason. Returns null if nothing relevant.
   */
  private lastSourceError(name: string): string | null {
    const line = this.hubLog
      .split('\n')
      .reverse()
      // Only this path's lines: the hub log is shared, and another feed's failure is not this one's.
      .find((l) =>
        l.includes(`[path ${name}]`) &&
        /(ERR|destroyed|timeout|refused|no route|unauthorized|not found|bad status|failed|denied)/i.test(l),
      );
    if (!line) return null;
    // mediamtx lines look like: "<ts> ERR [path cam_x] [RTSP source] <reason>".
    // Strip the timestamp + bracketed prefixes for a clean message.
    return line.replace(/^\S+\s+\S+\s+/, '').replace(/ERR\s*/i, '').replace(/\[[^\]]*\]\s*/g, '').trim() || null;
  }

  /** Track codec names ("H264", "H265", "Generic", ...) of a hub path. */
  private async pathTracks(name: string): Promise<string[]> {
    try {
      const res = await fetch(`http://${HOST}:${API_PORT}/v3/paths/get/${encodeURIComponent(name)}`);
      if (!res.ok) return [];
      const info = (await res.json()) as { tracks?: string[] };
      return info.tracks ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Poll the hub API until the named path is publishing, or time out.
   *
   * `aliveCheck` separates a dead process from a slow one: a software H.265
   * decode plus an H.264 encode on a modest laptop can take longer than the
   * base deadline, and killing that is indistinguishable, to the pilot, from
   * the transcode being broken. A process that has exited fails immediately
   * instead of burning the whole timeout.
   */
  private async waitPathReady(
    name: string,
    timeoutMs: number,
    aliveCheck?: () => boolean,
    maxMs = timeoutMs,
  ): Promise<boolean> {
    const start = Date.now();
    let deadline = start + timeoutMs;
    while (Date.now() < deadline) {
      if (aliveCheck) {
        if (!aliveCheck()) return false;
        // Still working: let it run on, up to the hard ceiling.
        if (Date.now() + 1000 > deadline && deadline < start + maxMs) {
          deadline = Math.min(start + maxMs, deadline + 5000);
        }
      }
      try {
        const res = await fetch(`http://${HOST}:${API_PORT}/v3/paths/get/${encodeURIComponent(name)}`);
        if (res.ok) {
          const info = (await res.json()) as { ready?: boolean };
          if (info.ready) return true;
        }
      } catch {
        /* hub momentarily unreachable — keep polling */
      }
      await delay(300);
    }
    return false;
  }

  /** Bytes the hub has received on a path, or -1 if it cannot say. */
  private async pathBytesReceived(name: string): Promise<number> {
    try {
      const res = await fetch(`http://${HOST}:${API_PORT}/v3/paths/get/${encodeURIComponent(name)}`);
      if (!res.ok) return -1;
      const info = (await res.json()) as { bytesReceived?: number; inboundBytes?: number };
      return info.bytesReceived ?? info.inboundBytes ?? -1;
    } catch {
      return -1;
    }
  }

  /**
   * A pulled path can be "ready" off the RTSP handshake alone while no video ever arrives
   * (UDP dropped by a firewall). Returns the bytes seen if the stream never got going.
   */
  private async videoStalled(name: string, minBytes = VIDEO_MIN_BYTES, timeoutMs = VIDEO_FLOW_TIMEOUT_MS): Promise<number | null> {
    const deadline = Date.now() + timeoutMs;
    let bytes = -1;
    while (Date.now() < deadline) {
      bytes = await this.pathBytesReceived(name);
      if (bytes < 0 || bytes >= minBytes) return null;
      await delay(250);
    }
    return bytes;
  }

  private whepUrl(name: string): string {
    return `http://${HOST}:${WEBRTC_PORT}/${name}/whep`;
  }

  private rtspUrl(name: string): string {
    return `rtsp://${HOST}:${RTSP_PORT}/${name}`;
  }

  /**
   * Bring the hub up so a renderer can publish into `name` over WHIP. MediaMTX
   * creates the path on first publish and drops it when the publisher leaves.
   */
  async preparePublish(name: string): Promise<CanvasStreamStartResult> {
    this.resolveBinaries();
    if (!this.mediamtxPath) {
      return { ok: false, needsInstall: true, error: this.getStatus().detail ?? t('main:media.engineNotInstalled') };
    }
    if (!(await this.ensureHub())) {
      return { ok: false, error: this.getStatus().detail ?? t('main:media.hubFailed') };
    }
    return {
      ok: true,
      whipUrl: `http://${HOST}:${WEBRTC_PORT}/${name}/whip`,
      rtspUrl: this.rtspUrl(name),
    };
  }

  async publishStatus(name: string): Promise<CanvasStreamStatus> {
    if (!this.hubReady) return { publishing: false, readers: 0 };
    try {
      const res = await fetch(`http://${HOST}:${API_PORT}/v3/paths/get/${encodeURIComponent(name)}`);
      if (!res.ok) return { publishing: false, readers: 0 };
      const info = (await res.json()) as { ready?: boolean; readers?: unknown[] };
      return { publishing: info.ready === true, readers: info.readers?.length ?? 0 };
    } catch {
      return { publishing: false, readers: 0 };
    }
  }

  /**
   * Start a stream. `resolvedUrl` lets the caller override config.url (used for
   * 'mavlink' sources whose URI is discovered at runtime).
   *
   * Idempotent + concurrency-safe per source: an already-live session is
   * returned as-is, and concurrent starts of the same source share one
   * in-flight attempt (prevents duplicate ffmpeg bridges and, for wfbng, a
   * dongle claim-storm from multiple render surfaces).
   */
  async start(source: CameraSourceConfig, resolvedUrl?: string): Promise<CameraStartResult> {
    const live = this.sessions.get(source.id);
    if (live && live.session.status === 'live') return { ok: true, session: live.session };
    const inflight = this.starting.get(source.id);
    if (inflight) return inflight;
    const p = this.doStart(source, resolvedUrl).finally(() => { this.starting.delete(source.id); });
    this.starting.set(source.id, p);
    return p;
  }

  private async doStart(source: CameraSourceConfig, resolvedUrl?: string): Promise<CameraStartResult> {
    // WebRTC sources are already WHEP — no hub, no transcode.
    if (source.kind === 'webrtc') {
      const url = resolvedUrl ?? source.url;
      if (!url) return { ok: false, error: t('main:media.noWhepUrl') };
      const session: CameraStreamSession = {
        sourceId: source.id,
        vehicleKey: source.vehicleKey,
        playback: { kind: 'webrtc', whepUrl: url },
        status: 'live',
      };
      this.sessions.set(source.id, { session });
      return { ok: true, session };
    }

    const ok = await this.ensureHub();
    if (!ok) {
      return { ok: false, error: this.getStatus().detail ?? t('main:media.hubFailed') };
    }

    const name = `cam_${source.id.replace(/[^a-zA-Z0-9]/g, '')}`;
    const url = resolvedUrl ?? source.url;
    if (!url) return { ok: false, error: t('main:media.noUrl') };

    const needsBridge = source.kind === 'rtp-udp' || source.kind === 'rubyfpv' || source.kind === 'wfbng';
    let ingest: ChildProcess | undefined;
    let ingestOutput = '';

    this.onPhase?.(source.id, 'connecting');
    if (needsBridge) {
      if (!this.ffmpegPath) return { ok: false, error: t('main:media.ffmpegRequiredUdp') };
      let args: string[];
      if (source.kind === 'wfbng') {
        // Dongle mode (default): ArduDeck drives the plugged-in RTL8812AU via
        // the wfb-ng receiver sidecar, which emits RTP on the local udp port.
        // Network mode skips this - a separate ground station forwards here.
        if ((source.wfbMode ?? 'dongle') === 'dongle') {
          const rx = await wfbngReceiver.ensureRunning(wfbngPort(url));
          if (!rx.ok) return { ok: false, error: rx.error };
        }
        // wfb-ng ground stations forward RAW RTP (not MPEG-TS), which ffmpeg
        // can only parse via an SDP description. H.265 is transcoded to H.264
        // because the WebRTC playback path cannot decode H.265.
        const codec = source.wfbCodec ?? 'h265';
        const sdpDir = join(app.getPath('userData'), 'media-sdp');
        mkdirSync(sdpDir, { recursive: true });
        const sdpPath = join(sdpDir, `${name}.sdp`);
        writeFileSync(sdpPath, buildWfbngSdp(wfbngPort(url), codec));
        args = buildWfbngFfmpegArgs(sdpPath, wfbngShouldTranscode(codec, source.wfbTranscode), this.rtspUrl(name));
      } else {
        // Raw H.264/UDP -> publish into the hub over RTSP, copy only.
        args = [
          '-fflags', 'nobuffer', '-flags', 'low_delay',
          '-i', url,
          '-c', 'copy',
          '-f', 'rtsp', '-rtsp_transport', 'tcp',
          this.rtspUrl(name),
        ];
      }
      // No shell. On Windows a shell spawn hands cmd.exe one unquoted command
      // string, so a space anywhere in the path (a username with a space is
      // enough) splits the command and the process never starts.
      ingest = spawn(this.ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
      ingest.stderr?.on('data', (d: Buffer) => { ingestOutput = (ingestOutput + d.toString()).slice(-8000); });
      this.superviseIngest(source, resolvedUrl, ingest);
    } else {
      // rtsp / srt / mavlink-rtsp — hub pulls directly.
      const added = await this.addHubPath(name, url, source.rtspTransport ?? 'tcp');
      if (!added) return { ok: false, error: t('main:media.hubRejectedPath') };
    }

    // Wait until the path is actually publishing before handing back the WHEP
    // url — MediaMTX returns 404 on a read of a path that isn't streaming yet,
    // so this prevents the renderer from racing the source connection.
    const ready = await this.waitPathReady(name, 12000);
    if (!ready) {
      // Surface mediamtx's actual source-pull error (DNS, refused, 404, 401,
      // timeout) rather than a generic message.
      const reason = ingest
        ? bridgeFailureReason(ingestOutput, wfbngPort(url), source.kind === 'wfbng' ? (source.wfbCodec ?? 'h265') : undefined)
        : this.lastSourceError(name);
      if (ingest) await killProcAndWait(ingest);
      else await this.removeHubPath(name);
      return {
        ok: false,
        error: reason
          ? `Source didn't start: ${reason}`
          : `Source did not start streaming — check the URL is reachable (${url})`,
      };
    }

    // A pulled stream can be un-playable over WebRTC even though the hub
    // ingested it fine: an H.265 camera, or a misdeclared H.264 track ingested
    // as "Generic" (old SIYI firmware). WHEP answers those with a bare 400, so
    // normalize through an ffmpeg H.264 relay instead and play that.
    let playPath = name;
    if (!needsBridge) {
      this.onPhase?.(source.id, 'checking-video');
      const stalledAt = await this.videoStalled(name);
      if (stalledAt !== null) {
        await this.removeHubPath(name);
        const transport = source.rtspTransport ?? 'tcp';
        return {
          ok: false,
          error: transport === 'tcp'
            ? `Camera connected but sent no video (${stalledAt} bytes in ${VIDEO_FLOW_TIMEOUT_MS / 1000} s). Another app or device may be holding the camera's stream.`
            : `Camera connected but its video never arrived (${stalledAt} bytes in ${VIDEO_FLOW_TIMEOUT_MS / 1000} s). A firewall is probably dropping the UDP video: set the RTSP transport to TCP.`,
        };
      }
      const tracks = await this.pathTracks(name);
      if (needsH264Relay(tracks)) {
        if (!this.ffmpegPath) {
          await this.removeHubPath(name);
          return {
            ok: false,
            error: `Camera is sending ${tracks.join('+')}, which the built-in player cannot decode. Click Install to enable live conversion, or switch the camera encoder to H.264.`,
          };
        }
        const relayName = `${name}h264`;
        this.onPhase?.(source.id, 'converting');
        const attempts: string[] = [];
        let started = false;
        for (const encoder of encoderChain(process.platform)) {
          this.ffmpegLog = '';
          // No shell. On Windows a shell spawn hands cmd.exe one unquoted
          // command string, so a space or a non-ASCII character anywhere in
          // the path is enough to stop the process ever starting.
          const proc = spawn(
            this.ffmpegPath,
            buildH264RelayArgs(this.rtspUrl(name), this.rtspUrl(relayName), encoder),
            { stdio: ['ignore', 'ignore', 'pipe'] },
          );
          let exited = false;
          proc.once('exit', () => { exited = true; });
          this.superviseIngest(source, resolvedUrl, proc);
          const ready = await this.waitPathReady(relayName, 12000, () => !exited, 40000);
          if (ready) {
            ingest = proc;
            started = true;
            this.relayEncoder = encoder;
            this.logSink?.('info', `H.264 relay started with ${encoder}`);
            break;
          }
          killProc(proc);
          const why = this.ffmpegFailureReason();
          attempts.push(`${encoder}: ${why ?? 'no output'}`);
        }
        if (!started) {
          await this.removeHubPath(name);
          return {
            ok: false,
            error: `Camera is sending ${tracks.join('+')} and no H.264 encoder worked (${attempts.join('; ')})`,
          };
        }
        playPath = relayName;
      }
    }

    this.sampleWebrtcSessions();
    const session: CameraStreamSession = {
      sourceId: source.id,
      vehicleKey: source.vehicleKey,
      playback: { kind: 'webrtc', whepUrl: this.whepUrl(playPath) },
      status: 'live',
      path: playPath,
    };
    const prev = this.sessions.get(source.id);
    if (prev?.restartTimer) clearTimeout(prev.restartTimer);
    const active: ActiveSession = { session, source, resolvedUrl };
    if (ingest) active.ingest = ingest;
    if (!needsBridge) active.configuredPath = name;
    if (source.kind === 'wfbng' && (source.wfbMode ?? 'dongle') === 'dongle') active.usesWfbReceiver = true;
    this.sessions.set(source.id, active);
    if (needsBridge) this.ensureWatchdog();
    this.onPhase?.(source.id, 'opening');
    return { ok: true, session };
  }

  /**
   * Wire a bridged ingest ffmpeg for auto-reconnect. A camera power-cycle or RF
   * dropout kills or stalls the stream; without this the feed stays dead until
   * the user toggles it. On an unexpected exit we re-run start() (idempotent:
   * it rebuilds the receiver, SDP, ffmpeg and hub path) after a capped backoff.
   */
  private superviseIngest(source: CameraSourceConfig, resolvedUrl: string | undefined, ingest: ChildProcess): void {
    ingest.stderr?.on('data', (d: Buffer) => {
      this.ffmpegLog = (this.ffmpegLog + d.toString()).slice(-4000);
    });
    // A spawn that never starts (missing or half-downloaded binary) emits
    // 'error', and with no listener Node throws it on the main process.
    ingest.on('error', (err: Error) => {
      this.ffmpegLog = `${this.ffmpegLog}\nffmpeg could not start: ${err.message}`.slice(-4000);
    });
    ingest.on('exit', () => {
      const a = this.sessions.get(source.id);
      if (!a || a.session.status === 'stopped') return; // intentional stop / gone
      if (a.ingest === ingest) a.ingest = undefined;
      a.session.status = 'error';
      const attempt = (a.restartAttempts ?? 0) + 1;
      a.restartAttempts = attempt;
      const delay = Math.min(RECONNECT_BASE_MS * attempt, RECONNECT_MAX_MS);
      if (a.restartTimer) clearTimeout(a.restartTimer);
      a.restartTimer = setTimeout(() => {
        const cur = this.sessions.get(source.id);
        if (!cur || cur.session.status === 'stopped') return;
        void this.start(source, resolvedUrl);
      }, delay);
    });
  }

  /** Bounce a live-but-silent bridged session so superviseIngest reconnects it. */
  private ensureWatchdog(): void {
    if (this.watchdog) return;
    this.watchdog = setInterval(() => {
      const stats = wfbngReceiver.getLastStats();
      const now = Date.now();
      let anyBridged = false;
      for (const a of this.sessions.values()) {
        if (!a.usesWfbReceiver || a.session.status === 'stopped') continue;
        anyBridged = true;
        if (a.session.status !== 'live' || !a.ingest) continue;
        // rtp advancing => data flowing. Frozen for RTP_STALL_MS => camera gone.
        const rtp = stats?.rtp ?? a.lastRtp ?? 0;
        if (a.lastRtp === undefined || rtp !== a.lastRtp) {
          a.lastRtp = rtp;
          a.lastRtpAt = now;
        } else if (a.lastRtpAt && now - a.lastRtpAt > RTP_STALL_MS) {
          this.logSink?.('warn', 'Camera stream stalled (no RTP) — reconnecting.');
          a.lastRtpAt = now; // give the restart room before re-tripping
          if (a.ingest) killProc(a.ingest); // exit handler drives the reconnect
        }
      }
      if (!anyBridged && this.watchdog) {
        clearInterval(this.watchdog);
        this.watchdog = null;
      }
    }, WATCHDOG_TICK_MS);
  }

  async stop(sourceId: string): Promise<void> {
    const active = this.sessions.get(sourceId);
    if (!active) return;
    active.session.status = 'stopped';
    if (active.restartTimer) clearTimeout(active.restartTimer);
    if (active.record) killProc(active.record);
    // Wait for it to exit: a restart right after would otherwise find the UDP port still bound.
    if (active.ingest) await killProcAndWait(active.ingest);
    if (active.configuredPath) await this.removeHubPath(active.configuredPath);
    this.sessions.delete(sourceId);
    // Last dongle-mode session gone -> release the dongle receiver.
    if (active.usesWfbReceiver && ![...this.sessions.values()].some((s) => s.usesWfbReceiver)) {
      wfbngReceiver.stop();
    }
  }

  /** Grab a single JPEG frame from a live session. */
  async snapshot(sourceId: string): Promise<CameraMediaActionResult> {
    const active = this.sessions.get(sourceId);
    if (!active?.session.path) return { ok: false, error: t('main:media.noStreamSnapshot') };
    if (!this.ffmpegPath) return { ok: false, error: t('main:media.ffmpegRequiredSnapshot') };
    const filePath = join(this.mediaDir('photos'), `snapshot_${stamp()}.jpg`);
    return new Promise((resolve) => {
      const p = spawn(this.ffmpegPath as string, [
        '-y', '-rtsp_transport', 'tcp', '-i', this.rtspUrl(active.session.path as string),
        '-frames:v', '1', '-q:v', '2', filePath,
      ], { stdio: 'ignore' });
      p.on('exit', (code) => resolve(code === 0 ? { ok: true, filePath } : { ok: false, error: t('main:media.snapshotFailed') }));
      p.on('error', (e) => resolve({ ok: false, error: e.message }));
    });
  }

  /** Toggle recording for a session. Returns the file when recording starts. */
  async toggleRecord(sourceId: string): Promise<CameraMediaActionResult> {
    const active = this.sessions.get(sourceId);
    if (!active?.session.path) return { ok: false, error: t('main:media.noStreamRecord') };
    if (active.record) {
      killProc(active.record);
      const filePath = active.recordPath;
      delete active.record;
      delete active.recordPath;
      return { ok: true, ...(filePath ? { filePath } : {}) };
    }
    if (!this.ffmpegPath) return { ok: false, error: t('main:media.ffmpegRequiredRecord') };
    const filePath = join(this.mediaDir('videos'), `recording_${stamp()}.mp4`);
    const p = spawn(this.ffmpegPath, [
      '-rtsp_transport', 'tcp', '-i', this.rtspUrl(active.session.path),
      '-c', 'copy', '-f', 'mp4', filePath,
    ], { stdio: ['pipe', 'ignore', 'ignore'] });
    active.record = p;
    active.recordPath = filePath;
    return { ok: true, filePath };
  }

  // Where people look for photos and videos, not the app's hidden data folder.
  private mediaDir(kind: 'photos' | 'videos'): string {
    let dir: string;
    try {
      dir = join(app.getPath(kind === 'photos' ? 'pictures' : 'videos'), 'ArduDeck');
    } catch {
      dir = join(app.getPath('userData'), 'camera-media');
    }
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }

  /** Only ever reveal files this engine wrote. */
  isOwnMedia(filePath: string): boolean {
    const name = basename(filePath);
    if (!/^(snapshot|recording)_[\w-]+\.(jpg|mp4)$/.test(name)) return false;
    const dir = dirname(filePath);
    const dirs = [join(app.getPath('userData'), 'camera-media')];
    for (const k of ['pictures', 'videos'] as const) {
      try { dirs.push(join(app.getPath(k), 'ArduDeck')); } catch { /* platform without it */ }
    }
    return dirs.includes(dir) && existsSync(filePath);
  }

  /**
   * Recent media-hub log lines, newest last. The failure reason for a feed
   * lives here and nowhere the operator can reach: field builds cannot be
   * debugged live, so this is what gets mirrored into the app console.
   */
  /** The line ffmpeg complained on, for a relay failure message. */
  private ffmpegFailureReason(): string | null {
    const lines = this.ffmpegLog.split('\n').map((l) => l.trim()).filter(Boolean);
    const notable = [...lines].reverse().find((l) =>
      /error|unable|invalid|failed|not found|no such|denied|unknown encoder|refused/i.test(l));
    return notable ?? lines[lines.length - 1] ?? null;
  }

  /**
   * Everything needed to explain a video failure, in one block the operator can
   * paste. Assembled here because half of it (binary paths, versions, the logs)
   * only exists in the main process, and asking a pilot to run PowerShell and
   * screenshot File Explorer costs a day per round trip.
   */
  async diagnostics(): Promise<string> {
    const lines: string[] = [];
    lines.push(`ArduDeck media engine diagnostics  ${new Date().toISOString()}`);
    lines.push(`platform: ${process.platform} ${process.arch}`);
    this.resolveBinaries();

    for (const [name, path] of [['ffmpeg', this.ffmpegPath], ['mediamtx', this.mediamtxPath]] as const) {
      if (!path) {
        lines.push(`${name}: NOT FOUND`);
        continue;
      }
      let size = 'unknown size';
      try {
        size = `${Math.round(statSync(path).size / 1024)} KB`;
      } catch { /* a path that resolved from PATH has no stat here */ }
      lines.push(`${name}: ${path} (${size})`);
      // mediamtx only knows --version; given ffmpeg's -version it prints its usage instead.
      const probe = spawnSync(path, [name === 'mediamtx' ? '--version' : '-version'], { encoding: 'utf8' });
      const first = (probe.stdout ?? '').split('\n')[0]?.trim();
      lines.push(`  ${probe.error ? `spawn failed: ${probe.error.message}` : first ?? 'no version output'}`);
    }

    lines.push(`hub ready: ${this.hubReady}${this.lastHubError ? ` (last error: ${this.lastHubError})` : ''}`);
    lines.push(`relay encoder in use: ${this.relayEncoder ?? 'none'}`);
    lines.push(`encoder chain: ${encoderChain(process.platform).join(' -> ')}`);

    for (const [id, active] of this.sessions) {
      const s = active.session;
      const src = active.source;
      lines.push(`session ${id}: kind=${src?.kind ?? '-'} status=${s.status} path=${s.path ?? '-'}`);
      lines.push(`  url: ${active.resolvedUrl ?? src?.url ?? '-'}  transport: ${src?.rtspTransport ?? 'tcp'}`);
      if (s.error) lines.push(`  error: ${s.error}`);
    }

    lines.push('--- network adapters ---', ...networkSummary());
    await this.recordWebrtcSessions();
    lines.push('--- hub webrtc sessions (last seen) ---', ...(this.webrtcSeen.size ? [...this.webrtcSeen.values()] : ['none seen']));

    const hub = this.recentHubLog(30);
    if (hub.length) lines.push('--- mediamtx ---', ...hub);
    const ff = this.recentFfmpegLog(30);
    if (ff.length) lines.push('--- ffmpeg ---', ...ff);
    return lines.join('\n');
  }

  /** Poll the hub's WebRTC sessions for a while after a playback starts. */
  private sampleWebrtcSessions(): void {
    let n = 0;
    const t = setInterval(() => {
      n += 1;
      void this.recordWebrtcSessions();
      if (n >= 15) clearInterval(t);
    }, 1000);
  }

  private async recordWebrtcSessions(): Promise<void> {
    try {
      const res = await fetch(`http://${HOST}:${API_PORT}/v3/webrtcsessions/list`);
      if (!res.ok) return;
      const body = (await res.json()) as { items?: Record<string, unknown>[] };
      for (const s of body.items ?? []) {
        const id = String(s.id ?? '?');
        this.webrtcSeen.delete(id);
        this.webrtcSeen.set(id, [
          `${id.slice(0, 8)} ${String(s.state ?? '?')} path=${String(s.path ?? '?')}`,
          `established=${String(s.peerConnectionEstablished ?? '?')}`,
          `local=${String(s.localCandidate ?? '-') || '-'} remote=${String(s.remoteCandidate ?? '-') || '-'}`,
          `from=${String(s.remoteAddr ?? '?')} in=${String(s.bytesReceived ?? 0)} out=${String(s.bytesSent ?? 0)}`,
        ].join(' '));
      }
      while (this.webrtcSeen.size > 8) {
        const oldest = this.webrtcSeen.keys().next().value;
        if (oldest === undefined) break;
        this.webrtcSeen.delete(oldest);
      }
    } catch {
      /* hub down; nothing to record */
    }
  }

  /** ffmpeg's recent output, for the console entry beside the hub log. */
  recentFfmpegLog(lines = 12): string[] {
    return this.ffmpegLog
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(-lines);
  }

  recentHubLog(lines = 12): string[] {
    return this.hubLog
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .slice(-lines);
  }

  /** Tear everything down — called on app quit. */
  shutdown(): void {
    if (this.watchdog) { clearInterval(this.watchdog); this.watchdog = null; }
    for (const [id] of this.sessions) void this.stop(id);
    if (this.hub) killProc(this.hub);
    this.hub = null;
    this.hubReady = false;
  }
}

/** Adapters and their IPv4 addresses: VPN, virtual and loopback adapters decide which paths WebRTC can take. */
function networkSummary(): string[] {
  const out: string[] = [];
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    const v4 = (addrs ?? []).filter((a) => a.family === 'IPv4').map((a) => a.address);
    if (v4.length) out.push(`${name}: ${v4.join(', ')}`);
  }
  return out.length ? out : ['none'];
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function killProc(p: ChildProcess): void {
  try {
    p.kill('SIGTERM');
    setTimeout(() => {
      try {
        p.kill('SIGKILL');
      } catch {
        /* already gone */
      }
    }, 1500);
  } catch {
    /* already gone */
  }
}

function killProcAndWait(p: ChildProcess, timeoutMs = 2500): Promise<void> {
  if (p.exitCode !== null || p.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(done, timeoutMs);
    p.once('exit', done);
    killProc(p);
  });
}

let stampCounter = 0;
let lastStamp = '';
/** Monotonic-ish filename stamp without Date.now (kept testable/deterministic-friendly). */
// Local date and time, so files sort and read naturally in the folder; the counter only splits same-second shots.
function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const t = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
  stampCounter = t === lastStamp ? stampCounter + 1 : 0;
  lastStamp = t;
  return stampCounter ? `${t}-${stampCounter}` : t;
}

/** Process-wide singleton. */
export const mediaEngine = new MediaEngine();
