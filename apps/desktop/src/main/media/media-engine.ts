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
import { join } from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { app } from 'electron';
import { mediaBinariesDownloader } from './media-binaries-downloader.js';
import { buildWfbngSdp, buildWfbngFfmpegArgs, wfbngPort, wfbngShouldTranscode } from './wfbng.js';
import { needsH264Relay, buildH264RelayArgs } from './h264-relay.js';
import { wfbngReceiver } from './wfbng-receiver.js';
import type {
  CameraSourceConfig,
  CameraStartResult,
  CameraStreamSession,
  CameraMediaActionResult,
  MediaEngineStatus,
} from '../../shared/camera-types.js';

const API_PORT = 9997;
const RTSP_PORT = 8554;
const WEBRTC_PORT = 8889;
const WEBRTC_UDP_PORT = 8189;
const SRT_PORT = 8890;
const HOST = '127.0.0.1';
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
  /** Periodic stall check for bridged (wfb-ng) sessions. */
  private watchdog: ReturnType<typeof setInterval> | null = null;
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
      ? 'Video engine not installed. Click Install to download it (~95MB, one time).'
      : this.lastHubError
        ? `Media hub failed to start: ${this.lastHubError}`
        : !this.ffmpegPath
          ? 'ffmpeg not found — RTSP/WebRTC still work, but UDP bridging, snapshot and record need it. Click Install.'
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
      shell: process.platform === 'win32',
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
      .find((l) =>
        (l.includes(name) || /source/i.test(l)) &&
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

  /** Poll the hub API until the named path is publishing, or time out. */
  private async waitPathReady(name: string, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
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

  private whepUrl(name: string): string {
    return `http://${HOST}:${WEBRTC_PORT}/${name}/whep`;
  }

  private rtspUrl(name: string): string {
    return `rtsp://${HOST}:${RTSP_PORT}/${name}`;
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
      if (!url) return { ok: false, error: 'WebRTC source has no WHEP url' };
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
      return { ok: false, error: this.getStatus().detail ?? 'Media hub failed to start' };
    }

    const name = `cam_${source.id.replace(/[^a-zA-Z0-9]/g, '')}`;
    const url = resolvedUrl ?? source.url;
    if (!url) return { ok: false, error: 'Source has no url' };

    const needsBridge = source.kind === 'rtp-udp' || source.kind === 'rubyfpv' || source.kind === 'wfbng';
    let ingest: ChildProcess | undefined;

    if (needsBridge) {
      if (!this.ffmpegPath) return { ok: false, error: 'ffmpeg required to bridge UDP sources' };
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
      ingest = spawn(this.ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'], shell: process.platform === 'win32' });
      this.superviseIngest(source, resolvedUrl, ingest);
    } else {
      // rtsp / srt / mavlink-rtsp — hub pulls directly.
      const added = await this.addHubPath(name, url, source.rtspTransport ?? 'automatic');
      if (!added) return { ok: false, error: 'Hub rejected the source path' };
    }

    // Wait until the path is actually publishing before handing back the WHEP
    // url — MediaMTX returns 404 on a read of a path that isn't streaming yet,
    // so this prevents the renderer from racing the source connection.
    const ready = await this.waitPathReady(name, 12000);
    if (!ready) {
      // Surface mediamtx's actual source-pull error (DNS, refused, 404, 401,
      // timeout) rather than a generic message.
      const reason = this.lastSourceError(name);
      if (ingest) killProc(ingest);
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
        ingest = spawn(this.ffmpegPath, buildH264RelayArgs(this.rtspUrl(name), this.rtspUrl(relayName)), {
          stdio: ['ignore', 'ignore', 'pipe'],
          shell: process.platform === 'win32',
        });
        this.superviseIngest(source, resolvedUrl, ingest);
        const relayReady = await this.waitPathReady(relayName, 12000);
        if (!relayReady) {
          killProc(ingest);
          await this.removeHubPath(name);
          return { ok: false, error: `Camera is sending ${tracks.join('+')} and the H.264 conversion failed to start` };
        }
        playPath = relayName;
      }
    }

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
    return { ok: true, session };
  }

  /**
   * Wire a bridged ingest ffmpeg for auto-reconnect. A camera power-cycle or RF
   * dropout kills or stalls the stream; without this the feed stays dead until
   * the user toggles it. On an unexpected exit we re-run start() (idempotent:
   * it rebuilds the receiver, SDP, ffmpeg and hub path) after a capped backoff.
   */
  private superviseIngest(source: CameraSourceConfig, resolvedUrl: string | undefined, ingest: ChildProcess): void {
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
    if (active.ingest) killProc(active.ingest);
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
    if (!active?.session.path) return { ok: false, error: 'No live stream to snapshot' };
    if (!this.ffmpegPath) return { ok: false, error: 'ffmpeg required for snapshots' };
    const dir = this.mediaDir();
    const filePath = join(dir, `snapshot_${stamp()}.jpg`);
    return new Promise((resolve) => {
      const p = spawn(this.ffmpegPath as string, [
        '-y', '-rtsp_transport', 'tcp', '-i', this.rtspUrl(active.session.path as string),
        '-frames:v', '1', '-q:v', '2', filePath,
      ], { stdio: 'ignore', shell: process.platform === 'win32' });
      p.on('exit', (code) => resolve(code === 0 ? { ok: true, filePath } : { ok: false, error: 'Snapshot failed' }));
      p.on('error', (e) => resolve({ ok: false, error: e.message }));
    });
  }

  /** Toggle recording for a session. Returns the file when recording starts. */
  async toggleRecord(sourceId: string): Promise<CameraMediaActionResult> {
    const active = this.sessions.get(sourceId);
    if (!active?.session.path) return { ok: false, error: 'No live stream to record' };
    if (active.record) {
      killProc(active.record);
      const filePath = active.recordPath;
      delete active.record;
      delete active.recordPath;
      return { ok: true, ...(filePath ? { filePath } : {}) };
    }
    if (!this.ffmpegPath) return { ok: false, error: 'ffmpeg required for recording' };
    const filePath = join(this.mediaDir(), `recording_${stamp()}.mp4`);
    const p = spawn(this.ffmpegPath, [
      '-rtsp_transport', 'tcp', '-i', this.rtspUrl(active.session.path),
      '-c', 'copy', '-f', 'mp4', filePath,
    ], { stdio: ['pipe', 'ignore', 'ignore'], shell: process.platform === 'win32' });
    active.record = p;
    active.recordPath = filePath;
    return { ok: true, filePath };
  }

  private mediaDir(): string {
    const dir = join(app.getPath('userData'), 'camera-media');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }

  /**
   * Recent media-hub log lines, newest last. The failure reason for a feed
   * lives here and nowhere the operator can reach: field builds cannot be
   * debugged live, so this is what gets mirrored into the app console.
   */
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

let stampCounter = 0;
/** Monotonic-ish filename stamp without Date.now (kept testable/deterministic-friendly). */
function stamp(): string {
  stampCounter += 1;
  return `${process.hrtime.bigint().toString()}_${stampCounter}`;
}

/** Process-wide singleton. */
export const mediaEngine = new MediaEngine();
