import { UdpTransport, type Transport } from '@ardudeck/comms';
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

const MAV_CMD_REQUEST_MESSAGE = 512;
const MAV_CMD_SET_MESSAGE_INTERVAL = 511;
const MAV_TYPE_GCS = 6;
const MAV_AUTOPILOT_INVALID = 8;
const MAV_STATE_ACTIVE = 4;

/**
 * Telemetry the OS needs for its widgets, at rates a narrow ELRS link can carry.
 * ArduPilot only streams what a GCS asked for, so with no client attached the
 * service asks itself. Once a GCS attaches it owns stream rates and we stay quiet.
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
const MAX_FETCH_ATTEMPTS = 3;

/** UDP only becomes writable once the vehicle's address is latched; stream transports are writable when open. */
type VehicleTransport = Transport & { readonly canWrite?: boolean };

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
 * The ArduDeck OS link: owns the vehicle transport, fans raw MAVLink out to
 * local GCS clients, tracks the vehicle and keeps its parameters cached.
 * Background parameter downloads only run while the vehicle is disarmed and
 * no GCS client is attached, so they never compete with a pilot.
 */
export class LinkService {
  readonly router: ClientRouter;
  readonly tracker = new VehicleTracker();
  readonly cache: ParamCache;
  readonly fetcher: ParamFetcher;

  private transport: VehicleTransport | null = null;
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
    if (transport) this.transport = transport;
  }

  async start(): Promise<void> {
    this.transport ??= new UdpTransport({ localPort: this.config.vehiclePort });
    this.transport.on('data', (data: Uint8Array) => this.onVehicleData(data));
    this.transport.on('error', (err: Error) => this.log('warn', `vehicle link: ${err.message}`));
    await this.transport.open();

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
    this.log('info', `vehicle link UDP :${this.config.vehiclePort}, clients ${this.config.clientBind}:${this.config.clientPort}`);
  }

  async stop(): Promise<void> {
    if (this.tick) clearInterval(this.tick);
    this.tick = null;
    this.fetcher.abort();
    this.cache.flush();
    await this.router.stop();
    await this.transport?.close();
  }

  get vehicle(): VehicleState | null {
    return this.tracker.current;
  }

  get linkInfo() {
    return {
      type: 'udp' as const,
      vehiclePort: this.config.vehiclePort,
      clientHost: this.config.clientBind,
      clientPort: this.config.clientPort,
      canWrite: writable(this.transport),
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

    this.requestMissingStreams(v, s, now);

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
    // Discovery: with no live vehicle, also announce on the LAN so a relay that
    // learns its clients starts streaming to us without any configuration.
    const t = this.transport as (VehicleTransport & { sendTo?: (d: Uint8Array, h: string, p: number) => Promise<void> }) | null;
    if (!this.tracker.current?.connected && t?.isOpen && t.sendTo) {
      const packet = this.frame(HEARTBEAT_ID, payload, HEARTBEAT_CRC_EXTRA);
      this.stats.txBytes += packet.length;
      void t.sendTo(packet, '255.255.255.255', this.config.vehiclePort).catch(() => {});
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
