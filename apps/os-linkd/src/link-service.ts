import type { Transport } from '@ardudeck/comms';
import {
  MAVLinkParser, getAllMessageInfos, serializeV2,
  COMMAND_LONG_ID, COMMAND_LONG_CRC_EXTRA, serializeCommandLong,
  HEARTBEAT_ID, HEARTBEAT_CRC_EXTRA, serializeHeartbeat,
  AUTOPILOT_VERSION_ID, SYS_STATUS_ID, GPS_RAW_INT_ID, GLOBAL_POSITION_INT_ID, VFR_HUD_ID, ATTITUDE_ID,
} from '@ardudeck/mavlink-ts';
import type { LinkdConfig } from './config.js';
import { ClientRouter } from './client-router.js';
import { VehicleTracker, type VehicleState } from './vehicle-state.js';
import { ParamCache } from './param-cache.js';
import { ParamFetcher, type LogFn } from './param-fetcher.js';
import { GnssDetector } from './gnss/detector.js';
import { LinkSettingsStore, parseConnection, type Connection, type LinkSettings } from './connections.js';
import { EngineProcess } from './engine/engine-process.js';
import { EngineTransport } from './engine/engine-transport.js';
import { engineLinkFor } from './engine/engine-links.js';
import { SitlProbe } from './discovery/sitl-probe.js';

const MAV_CMD_REQUEST_MESSAGE = 512;
const MAV_CMD_SET_MESSAGE_INTERVAL = 511;
const MAV_TYPE_GCS = 6;
const MAV_AUTOPILOT_INVALID = 8;
const MAV_STATE_ACTIVE = 4;

/**
 * Telemetry the OS needs for its widgets, at rates a narrow ELRS link can carry.
 * ArduPilot only streams what a GCS asked for, so on a direct link the service
 * asks itself. The orchestrator sets stream rates on its own links.
 */
const WANTED_STREAMS: ReadonlyArray<[msgid: number, hz: number]> = [
  [SYS_STATUS_ID, 1],
  [GPS_RAW_INT_ID, 1],
  [GLOBAL_POSITION_INT_ID, 2],
  [VFR_HUD_ID, 2],
  [ATTITUDE_ID, 4],
];
const STREAM_STALE_MS = 5000;
const STREAM_RETRY_MS = 10_000;
const TICK_MS = 1000;
/** Give AUTOPILOT_VERSION this long before caching params under the sysid fallback key. */
const IDENTITY_GRACE_MS = 6000;
const IDENTITY_RETRY_MS = 2000;
const FETCH_RETRY_MS = 60_000;
/** Retry opening a connection that failed (radio unplugged, port busy) this often. */
const REOPEN_MS = 5000;
const MAX_FETCH_ATTEMPTS = 3;

/** UDP only becomes writable once the vehicle's address is latched; stream transports are writable when open. */
type VehicleTransport = Transport & { readonly canWrite?: boolean; removeAllListeners(): unknown };

function writable(t: VehicleTransport | null): boolean {
  return !!t && t.isOpen && (t.canWrite ?? true);
}

interface Session {
  startedAt: number;
  identityRequests: number;
  lastIdentityRequest: number;
  fetchAttempts: number;
  lastFetchAttempt: number;
  fetched: boolean;
  streamRequested: Map<number, number>;
}

/**
 * The ArduDeck OS link: runs the orchestrator with the OS's links, fans the
 * fleet's MAVLink out to local GCS clients, tracks the vehicle and keeps its
 * parameters cached.
 * Background parameter downloads only run while the vehicle is disarmed and
 * no GCS client is attached, so they never compete with a pilot.
 */
export class LinkService {
  readonly router: ClientRouter;
  readonly tracker = new VehicleTracker();
  readonly cache: ParamCache;
  readonly fetcher: ParamFetcher;
  readonly gnss: GnssDetector;

  readonly engine: EngineProcess;
  readonly discovery = new SitlProbe(() => this.localTcpPortsInLinks());
  private readonly engineTransport: EngineTransport;
  /** Links added at runtime by their owner (the simulator), on top of the active connection. */
  private readonly extraLinks = new Map<string, string[]>();
  private transport: VehicleTransport | null = null;
  private readonly injectedTransport: VehicleTransport | null;
  private readonly settingsStore: LinkSettingsStore;
  private settingsState: LinkSettings;
  private linkError: string | null = null;
  private lastOpenAttempt = 0;
  private applying: Promise<void> | null = null;
  private readonly parser = new MAVLinkParser();
  private seq = 0;
  private tick: NodeJS.Timeout | null = null;
  private session: Session | null = null;
  /** Last time each message id arrived from the tracked vehicle. */
  private readonly lastRx = new Map<number, number>();
  readonly stats = { rxBytes: 0, txBytes: 0, clientBytes: 0 };

  constructor(private readonly config: LinkdConfig, private readonly log: LogFn, transport?: VehicleTransport) {
    this.parser.registerMessages(getAllMessageInfos());
    this.router = new ClientRouter(config.clientPort, config.clientBind);
    this.cache = new ParamCache(`${config.stateDir}/params`);
    this.fetcher = new ParamFetcher(this.cache, (id, p, crc) => this.send(id, p, crc), config.compid, log);
    this.injectedTransport = transport ?? null;
    this.engine = new EngineProcess(config.engineBinary, config.engineBind, log);
    this.engineTransport = new EngineTransport(`ws://${config.engineBind}`, 'ArduDeck OS');
    this.settingsStore = new LinkSettingsStore(config.settingsFile, config.vehiclePort);
    this.settingsState = this.settingsStore.load();
    // The serial port of the active vehicle link is never probed by the GNSS detector.
    this.gnss = new GnssDetector(log, (path) => {
      const c = this.activeConnection;
      return this.settingsState.enabled && c?.type === 'serial' && c.path === path;
    });
  }

  async start(): Promise<void> {
    await this.applyLink();
    if (!this.injectedTransport) {
      this.gnss.start();
      this.discovery.start();
    }

    this.router.on('uplink', (bytes: Uint8Array) => {
      this.stats.clientBytes += bytes.length;
      if (writable(this.transport)) void this.transport!.write(bytes).catch(() => {});
    });
    this.router.on('client', (c: { host: string; port: number }) => {
      this.log('info', `client attached ${c.host}:${c.port}`);
      if (this.fetcher.busy) this.fetcher.abort(); // a GCS is in charge now
    });
    this.router.on('error', (err: Error) => this.log('warn', `client socket: ${err.message}`));
    await this.router.start();

    this.tick = setInterval(() => this.onTick(), TICK_MS);
    this.log('info', `clients ${this.config.clientBind}:${this.config.clientPort}`);
  }

  // ---------------------------------------------------------------- connections

  get settings(): LinkSettings {
    return this.settingsState;
  }

  get activeConnection(): Connection | null {
    return this.settingsState.connections.find((c) => c.id === this.settingsState.activeId) ?? null;
  }

  /**
   * Any change that would drop the live link is refused while the vehicle is
   * armed, whoever asks (quick settings, Link Settings, the app, a script).
   */
  private assertSafeToDropLink(): void {
    const v = this.tracker.current;
    if (v?.connected && v.armed) throw new Error('the vehicle is armed; disarm before changing or turning off the vehicle link');
  }

  async setEnabled(enabled: boolean): Promise<void> {
    if (!enabled) this.assertSafeToDropLink();
    this.settingsState = { ...this.settingsState, enabled };
    await this.commit();
  }

  async setActive(id: string): Promise<void> {
    if (!this.settingsState.connections.some((c) => c.id === id)) throw new Error(`no connection ${id}`);
    if (id !== this.settingsState.activeId) this.assertSafeToDropLink();
    this.settingsState = { ...this.settingsState, activeId: id, enabled: true };
    await this.commit();
  }

  /** Add (or replace by id) a connection; `activate` switches to it. */
  async upsertConnection(input: unknown, activate: boolean): Promise<Connection> {
    const conn = parseConnection(input);
    // Activating another connection, or editing the active one, reopens the link.
    if (activate || conn.id === this.settingsState.activeId) this.assertSafeToDropLink();
    const others = this.settingsState.connections.filter((c) => c.id !== conn.id);
    this.settingsState = {
      ...this.settingsState,
      connections: [...others, conn],
      ...(activate ? { activeId: conn.id, enabled: true } : {}),
    };
    await this.commit();
    return conn;
  }

  async removeConnection(id: string): Promise<void> {
    if (id === this.settingsState.activeId) this.assertSafeToDropLink();
    const connections = this.settingsState.connections.filter((c) => c.id !== id);
    if (connections.length === 0) throw new Error('cannot remove the last connection');
    const activeId = this.settingsState.activeId === id ? connections[0]!.id : this.settingsState.activeId;
    this.settingsState = { ...this.settingsState, connections, activeId };
    await this.commit();
  }

  /** Replace the runtime links one owner contributes; restarts the engine. */
  async setExtraLinks(owner: string, links: string[]): Promise<void> {
    this.assertSafeToDropLink();
    if (links.length > 0) this.extraLinks.set(owner, links);
    else this.extraLinks.delete(owner);
    await this.applyLink();
  }

  private localTcpPortsInLinks(): Set<number> {
    const ports = new Set<number>();
    for (const link of this.engine.status.links) {
      const m = /^tcpout:(?:127\.0\.0\.1|localhost):(\d+)$/.exec(link);
      if (m) ports.add(Number(m[1]));
    }
    return ports;
  }

  private engineLinks(): string[] {
    const conn = this.activeConnection;
    const primary = this.settingsState.enabled && conn ? [engineLinkFor(conn)] : [];
    return [...primary, ...[...this.extraLinks.values()].flat()];
  }

  private async commit(): Promise<void> {
    this.settingsStore.save(this.settingsState);
    await this.applyLink();
  }

  /** Close whatever is open and open the active connection (if enabled). Serialised. */
  private applyLink(): Promise<void> {
    const run = async () => {
      await this.closeTransport();
      this.linkError = null;
      if (this.injectedTransport) {
        await this.openTransport(this.injectedTransport, 'injected transport');
        return;
      }
      const links = this.engineLinks();
      await this.engine.apply(links);
      if (links.length === 0) {
        this.log('info', 'vehicle link disabled');
        return;
      }
      await this.openTransport(this.engineTransport, 'orchestrator');
    };
    const prev = this.applying ?? Promise.resolve();
    this.applying = prev.then(run, run).finally(() => { this.applying = null; });
    return this.applying;
  }

  private async openTransport(t: VehicleTransport, label: string): Promise<void> {
    this.lastOpenAttempt = Date.now();
    t.on('data', (data: Uint8Array) => this.onVehicleData(data));
    t.on('error', (err: Error) => {
      this.linkError = err.message;
      this.log('warn', `vehicle link: ${err.message}`);
    });
    try {
      await t.open();
      this.transport = t;
      this.log('info', `vehicle link ${label}`);
    } catch (err) {
      this.linkError = err instanceof Error ? err.message : String(err);
      this.log('warn', `vehicle link ${label} failed: ${this.linkError}`);
      t.removeAllListeners();
    }
  }

  private async closeTransport(): Promise<void> {
    const t = this.transport;
    this.transport = null;
    this.fetcher.abort();
    this.session = null;
    this.tracker.reset();
    this.parser.reset();
    if (!t) return;
    t.removeAllListeners();
    await t.close().catch(() => {});
  }

  async stop(): Promise<void> {
    if (this.tick) clearInterval(this.tick);
    this.tick = null;
    this.discovery.stop();
    this.fetcher.abort();
    this.cache.flush();
    await this.gnss.stop();
    await this.router.stop();
    await this.transport?.close();
    await this.engine.stop();
  }

  get vehicle(): VehicleState | null {
    return this.tracker.current;
  }

  get linkInfo() {
    return {
      enabled: this.settingsState.enabled,
      active: this.activeConnection,
      open: !!this.transport?.isOpen,
      error: this.linkError,
      clientHost: this.config.clientBind,
      clientPort: this.config.clientPort,
      canWrite: writable(this.transport),
      engine: { ...this.engine.status, url: `ws://${this.config.engineBind}` },
      roster: this.engineTransport.roster,
      clients: this.router.list().map(({ host, port }) => ({ host, port })),
      ...this.stats,
    };
  }

  private frame(msgid: number, payload: Uint8Array, crcExtra: number): Uint8Array {
    return serializeV2(msgid, payload, crcExtra, {
      sysid: this.config.sysid,
      compid: this.config.compid,
      sequence: this.seq++ & 0xff,
    });
  }

  /** Send a message from the service's own MAVLink identity. */
  async send(msgid: number, payload: Uint8Array, crcExtra: number): Promise<void> {
    if (!writable(this.transport)) throw new Error('vehicle link is not writable yet');
    const packet = this.frame(msgid, payload, crcExtra);
    this.stats.txBytes += packet.length;
    await this.transport!.write(packet);
  }

  private onVehicleData(data: Uint8Array): void {
    this.stats.rxBytes += data.length;
    this.router.forward(data);
    this.parser.feed(data);
    for (let pkt = this.parser.parseNext(); pkt; pkt = this.parser.parseNext()) {
      const event = this.tracker.handle(pkt);
      if (pkt.sysid === this.tracker.current?.sysid) this.lastRx.set(pkt.msgid, Date.now());
      this.fetcher.handlePacket(pkt, this.tracker.current);
      if (event === 'new') this.onNewVehicle();
      else if (event === 'identity') this.log('info', `vehicle identity ${this.tracker.current?.uid}`);
    }
  }

  private onNewVehicle(): void {
    const v = this.tracker.current!;
    this.log('info', `vehicle sysid ${v.sysid} (${v.firmware}, ${v.mode}) on link`);
    this.session = { startedAt: Date.now(), identityRequests: 0, lastIdentityRequest: 0, fetchAttempts: 0, lastFetchAttempt: 0, fetched: false, streamRequested: new Map() };
    this.lastRx.clear();
  }

  private onTick(now = Date.now()): void {
    // A connection that failed to open (radio unplugged, port busy) is retried.
    if (!this.transport && !this.applying && this.settingsState.enabled && now - this.lastOpenAttempt > REOPEN_MS) {
      void this.applyLink();
    }
    this.sendHeartbeat();
    if (this.tracker.checkTimeout(now)) {
      this.log('info', 'vehicle link lost');
      this.fetcher.abort();
      this.session = null;
      return;
    }
    const v = this.tracker.current;
    const s = this.session;
    if (!v?.connected || !s || !writable(this.transport)) return;

    if (!v.uidFromBoard && s.identityRequests < 3 && now - s.lastIdentityRequest > IDENTITY_RETRY_MS) {
      s.identityRequests++;
      s.lastIdentityRequest = now;
      void this.send(COMMAND_LONG_ID, serializeCommandLong({
        targetSystem: v.sysid, targetComponent: v.compid, command: MAV_CMD_REQUEST_MESSAGE, confirmation: 0,
        param1: AUTOPILOT_VERSION_ID, param2: 0, param3: 0, param4: 0, param5: 0, param6: 0, param7: 0,
      }), COMMAND_LONG_CRC_EXTRA).catch(() => {});
    }

    if (this.transport !== this.engineTransport) this.requestMissingStreams(v, s, now);

    if (v.armed && this.fetcher.busy) {
      this.log('info', 'params: vehicle armed, pausing download');
      this.fetcher.abort();
    }
    if (this.shouldFetch(v, s, now)) {
      s.fetchAttempts++;
      s.lastFetchAttempt = now;
      void this.fetcher.fetch(v).then((ok) => { if (ok && this.session === s) s.fetched = true; });
    }
  }

  /**
   * 1 Hz GCS heartbeat toward the vehicle side, like mavlink-router and the
   * desktop app's MavlinkTee. Relays that learn their clients (MavlinkTee,
   * mavlink-router, companion bridges) drop a silent client after ~15 s, which
   * would cut the OS off between its own requests.
   */
  private sendHeartbeat(): void {
    const payload = serializeHeartbeat({
      type: MAV_TYPE_GCS, autopilot: MAV_AUTOPILOT_INVALID, baseMode: 0, customMode: 0,
      systemStatus: MAV_STATE_ACTIVE, mavlinkVersion: 3,
    });
    if (writable(this.transport)) {
      void this.send(HEARTBEAT_ID, payload, HEARTBEAT_CRC_EXTRA).catch(() => {});
    }
  }

  /** Ask for at most one missing stream per tick so requests never burst the uplink. */
  private requestMissingStreams(v: VehicleState, s: Session, now: number): void {
    if (this.router.hasClients || this.fetcher.busy || now - s.startedAt < 3000) return;
    for (const [msgid, hz] of WANTED_STREAMS) {
      const fresh = now - (this.lastRx.get(msgid) ?? 0) < STREAM_STALE_MS;
      const asked = now - (s.streamRequested.get(msgid) ?? 0) < STREAM_RETRY_MS;
      if (fresh || asked) continue;
      s.streamRequested.set(msgid, now);
      void this.send(COMMAND_LONG_ID, serializeCommandLong({
        targetSystem: v.sysid, targetComponent: v.compid, command: MAV_CMD_SET_MESSAGE_INTERVAL, confirmation: 0,
        param1: msgid, param2: Math.round(1e6 / hz), param3: 0, param4: 0, param5: 0, param6: 0, param7: 0,
      }), COMMAND_LONG_CRC_EXTRA).catch(() => {});
      return;
    }
  }

  private shouldFetch(v: VehicleState, s: Session, now: number): boolean {
    if (s.fetched || this.fetcher.busy || v.armed || this.router.hasClients) return false;
    if (s.fetchAttempts >= MAX_FETCH_ATTEMPTS) return false;
    if (s.fetchAttempts > 0 && now - s.lastFetchAttempt < FETCH_RETRY_MS) return false;
    // Wait for the board identity so the cache lands under a stable key.
    return v.uidFromBoard || now - s.startedAt > IDENTITY_GRACE_MS;
  }
}
