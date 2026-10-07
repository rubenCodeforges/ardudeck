import { BaseTransport } from '@ardudeck/comms';

const CHANNEL_MAVLINK = 0x00;
const CHANNEL_CONTROL = 0x01;
/** The engine restarts when links change; reconnect quickly so clients see no gap. */
const RECONNECT_MS = 250;

export interface RosterVehicle {
  uuid: string;
  virtualSysid: number;
  realSysid: number;
  linkId: number;
  bearer: string;
}

export interface EngineInfo {
  serverName: string;
  serverVersion: string;
  capabilities: string[];
}

/**
 * The link service's connection to the orchestrator: MAVLink for the whole
 * fleet arrives on one WebSocket, already given a distinct sysid per vehicle.
 * It stays open across engine restarts and reconnects on its own, so the
 * link service treats it like any other vehicle transport.
 */
export class EngineTransport extends BaseTransport {
  readonly portName: string;
  info: EngineInfo | null = null;
  roster: RosterVehicle[] = [];

  private socket: WebSocket | null = null;
  private connected = false;
  private wanted = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(private readonly url: string, private readonly clientName: string) {
    super();
    this.portName = url;
  }

  get isOpen(): boolean { return this.wanted; }
  get canWrite(): boolean { return this.connected; }
  get bytesToRead(): number { return 0; }
  get bytesToWrite(): number { return 0; }

  async open(): Promise<void> {
    this.wanted = true;
    this.connect();
  }

  async close(): Promise<void> {
    this.wanted = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close();
    this.socket = null;
    this.connected = false;
  }

  async write(data: Uint8Array): Promise<void> {
    if (!this.connected || !this.socket) return;
    const frame = new Uint8Array(data.length + 1);
    frame[0] = CHANNEL_MAVLINK;
    frame.set(data, 1);
    this.socket.send(frame);
  }

  async read(): Promise<number> { return 0; }
  async readByte(): Promise<number> { return -1; }
  async discardInBuffer(): Promise<void> {}

  private connect(): void {
    if (!this.wanted) return;
    const socket = new WebSocket(this.url);
    socket.binaryType = 'arraybuffer';
    this.socket = socket;
    socket.onopen = () => {
      this.connected = true;
      this.sendControl({ type: 'hello', clientName: this.clientName, clientVersion: 'os', supports: ['mavlink-passthrough', 'intents'] });
      this.emit('open');
    };
    socket.onmessage = (event) => this.onFrame(new Uint8Array(event.data as ArrayBuffer));
    // A refused connection reports only `error`, a dropped one `error` then `close`.
    socket.onclose = () => this.onSocketGone(socket);
    socket.onerror = () => this.onSocketGone(socket);
  }

  private onSocketGone(socket: WebSocket): void {
    if (this.socket !== socket) return;
    const wasConnected = this.connected;
    this.connected = false;
    this.socket = null;
    if (wasConnected) {
      this.roster = [];
      this.emit('roster', this.roster);
      this.emit('close');
    }
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (!this.wanted || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, RECONNECT_MS);
  }

  private onFrame(frame: Uint8Array): void {
    if (frame.length < 2) return;
    if (frame[0] === CHANNEL_MAVLINK) this.emit('data', frame.subarray(1));
    else if (frame[0] === CHANNEL_CONTROL) this.onControl(new TextDecoder().decode(frame.subarray(1)));
  }

  private onControl(text: string): void {
    let msg: { type?: string; [key: string]: unknown };
    try {
      msg = JSON.parse(text) as typeof msg;
    } catch {
      return;
    }
    if (msg.type === 'welcome') {
      this.info = { serverName: String(msg.serverName ?? ''), serverVersion: String(msg.serverVersion ?? ''), capabilities: (msg.capabilities as string[]) ?? [] };
    } else if (msg.type === 'roster') {
      this.roster = (msg.vehicles as RosterVehicle[]) ?? [];
      this.emit('roster', this.roster);
    }
  }

  private sendControl(body: Record<string, unknown>): void {
    const json = new TextEncoder().encode(JSON.stringify({ v: 1, ...body }));
    const frame = new Uint8Array(json.length + 1);
    frame[0] = CHANNEL_CONTROL;
    frame.set(json, 1);
    this.socket?.send(frame);
  }
}
