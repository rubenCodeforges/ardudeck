import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { listSerialPorts } from '@ardudeck/comms';

/** One way of reaching a vehicle. Exactly one is active at a time. */
export type Connection =
  | { id: string; name: string; type: 'udp-listen'; port: number }
  | { id: string; name: string; type: 'udp-peer'; host: string; port: number; localPort?: number }
  | { id: string; name: string; type: 'tcp'; host: string; port: number }
  | { id: string; name: string; type: 'serial'; path: string; baudRate: number };

export type NewConnection = Omit<Connection, 'id'> & { id?: string };

export interface LinkSettings {
  /** Master switch: off closes the vehicle link entirely. */
  enabled: boolean;
  activeId: string;
  connections: Connection[];
}

export type DeviceKind = 'flight-controller' | 'radio' | 'serial';

export interface DetectedDevice {
  path: string;
  kind: DeviceKind;
  label: string;
  vendorId: string | null;
  productId: string | null;
  /** Baud rate to suggest when turning this device into a connection. */
  suggestedBaud: number;
}

export const DEFAULT_CONNECTION: Connection = {
  id: 'udp-14550', name: 'Wi-Fi telemetry (UDP 14550)', type: 'udp-listen', port: 14550,
};

/**
 * USB vendor classes. Flight-controller vendors follow the desktop app's
 * KNOWN_BOARDS (firmware-types.ts); bridge-chip vendors are what SiK and ELRS
 * radios ship with. A board-level table can replace this once KNOWN_BOARDS
 * moves into @ardudeck/vehicle-core.
 */
const FC_VENDORS: Record<string, string> = {
  '1209': 'ArduPilot flight controller',
  '26ac': 'Pixhawk',
  '2dae': 'Cube',
  '0483': 'STM32 flight controller',
  '3162': 'SpeedyBee flight controller',
};
const RADIO_VENDORS: Record<string, string> = {
  '0403': 'FTDI radio (SiK)',
  '10c4': 'CP210x radio (SiK / ELRS)',
  '1a86': 'CH340 radio (ELRS)',
};

export function classifyDevice(path: string, vendorId?: string, productId?: string, manufacturer?: string): DetectedDevice | null {
  const vid = vendorId?.toLowerCase() ?? null;
  const pid = productId?.toLowerCase() ?? null;
  if (!vid) return null; // built-in UARTs, Bluetooth: not vehicle hardware
  // The ground station's own non-GNSS hardware: Dell LTE modem ports and
  // Intel on-board UARTs. GNSS receivers are sorted out by the GNSS detector.
  if (vid === '413c' || vid === '8086') return null;
  if (FC_VENDORS[vid]) return { path, kind: 'flight-controller', label: FC_VENDORS[vid]!, vendorId: vid, productId: pid, suggestedBaud: 115200 };
  if (RADIO_VENDORS[vid]) return { path, kind: 'radio', label: RADIO_VENDORS[vid]!, vendorId: vid, productId: pid, suggestedBaud: 57600 };
  return { path, kind: 'serial', label: manufacturer || 'USB serial device', vendorId: vid, productId: pid, suggestedBaud: 57600 };
}

export async function detectDevices(): Promise<DetectedDevice[]> {
  try {
    const ports = await listSerialPorts();
    return ports
      .map((p) => classifyDevice(p.path, p.vendorId, p.productId, p.manufacturer))
      .filter((d): d is DetectedDevice => d !== null);
  } catch {
    return [];
  }
}

/** Validate untrusted input from the API into a Connection, or throw. */
export function parseConnection(input: unknown): Connection {
  if (!input || typeof input !== 'object') throw new Error('connection must be an object');
  const o = input as Record<string, unknown>;
  const id = typeof o.id === 'string' && /^[\w.-]{1,64}$/.test(o.id) ? o.id : randomUUID().slice(0, 8);
  const port = (v: unknown, field: string) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(`${field} must be a port number`);
    return n;
  };
  const host = (v: unknown) => {
    if (typeof v !== 'string' || !/^[\w.:-]{1,253}$/.test(v)) throw new Error('host must be a hostname or IP');
    return v;
  };
  const name = typeof o.name === 'string' && o.name.trim() ? o.name.trim().slice(0, 80) : '';
  switch (o.type) {
    case 'udp-listen': {
      const p = port(o.port, 'port');
      return { id, name: name || `UDP listen :${p}`, type: 'udp-listen', port: p };
    }
    case 'udp-peer': {
      const h = host(o.host);
      const p = port(o.port, 'port');
      return { id, name: name || `UDP ${h}:${p}`, type: 'udp-peer', host: h, port: p, ...(o.localPort ? { localPort: port(o.localPort, 'localPort') } : {}) };
    }
    case 'tcp': {
      const h = host(o.host);
      const p = port(o.port, 'port');
      return { id, name: name || `TCP ${h}:${p}`, type: 'tcp', host: h, port: p };
    }
    case 'serial': {
      if (typeof o.path !== 'string' || !/^\/dev\/[\w./-]+$/.test(o.path)) throw new Error('path must be a /dev serial device');
      const baud = Number(o.baudRate ?? 57600);
      if (![9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600, 1500000].includes(baud)) throw new Error('unsupported baud rate');
      return { id, name: name || `${o.path} @ ${baud}`, type: 'serial', path: o.path, baudRate: baud };
    }
    default:
      throw new Error('type must be udp-listen, udp-peer, tcp or serial');
  }
}

/** Persisted in $XDG_CONFIG_HOME/ardudeck-os/links.json. */
export class LinkSettingsStore {
  constructor(private readonly file: string, private readonly defaultPort: number) {}

  load(): LinkSettings {
    const fallback = { ...DEFAULT_CONNECTION, port: this.defaultPort, name: `Wi-Fi telemetry (UDP ${this.defaultPort})`, id: `udp-${this.defaultPort}` };
    try {
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<LinkSettings>;
      const connections = (raw.connections ?? []).flatMap((c) => {
        try { return [parseConnection(c)]; } catch { return []; }
      });
      if (connections.length === 0) connections.push(fallback);
      const activeId = connections.some((c) => c.id === raw.activeId) ? raw.activeId! : connections[0]!.id;
      return { enabled: raw.enabled !== false, activeId, connections };
    } catch {
      return { enabled: true, activeId: fallback.id, connections: [fallback] };
    }
  }

  save(settings: LinkSettings): void {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(`${this.file}.tmp`, JSON.stringify(settings, null, 2));
    renameSync(`${this.file}.tmp`, this.file);
  }
}
