import { EventEmitter } from 'node:events';
import { SerialTransport, listSerialPorts } from '@ardudeck/comms';
import { UbxParser, UBX, ubxPoll, decodeMonVer } from '@ardudeck/vehicle-core';
import { StreamSniffer, type StreamKind } from './sniff.js';
import { identifyUblox, UNKNOWN_NMEA_RECEIVER, type ReceiverIdentity } from './receiver.js';
import { NmeaFixReader, EMPTY_FIX, type GnssFix } from './nmea.js';
import type { LogFn } from '../param-fetcher.js';

export type DeviceRole = 'probing' | 'gnss' | 'vehicle-link' | 'rtcm-source' | 'unknown' | 'busy';

export interface SerialDevice {
  path: string;
  vendorId: string | null;
  productId: string | null;
  manufacturer: string | null;
  role: DeviceRole;
  protocol: StreamKind | null;
  /** Baud rate the traffic was found at (for bridges); USB-native devices report 115200. */
  baudRate: number | null;
  receiver: ReceiverIdentity | null;
  fix: GnssFix | null;
  lastProbe: number;
}

/** Native USB CDC devices ignore the baud rate; bridges need the right one. */
const NATIVE_CDC_VENDORS = new Set(['1546', '0483', '1209', '26ac', '2dae']);
const BRIDGE_BAUDS = [38400, 9600, 115200, 230400, 57600];
/** Never touch the ground station's own non-GNSS hardware (Dell LTE modem, Intel UARTs). */
const IGNORED_VENDORS = new Set(['413c', '8086']);
const LISTEN_MS = 2200;
const MONVER_MS = 1500;
const SCAN_MS = 5000;
const RETRY_UNKNOWN_MS = 60_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Finds out what is on every serial port, on any hardware, without guessing
 * from USB IDs alone (GNSS modules and telemetry radios share the same
 * CP210x / CH340 bridges). It only listens first; a u-blox version query is
 * sent only to a port already proven to be a GNSS. Identified receivers stay
 * open here: this service is their single owner and publishes their fix.
 */
export class GnssDetector extends EventEmitter {
  private readonly devices = new Map<string, SerialDevice>();
  private readonly open = new Map<string, SerialTransport>();
  private timer: NodeJS.Timeout | null = null;
  private scanning = false;

  constructor(private readonly log: LogFn, private readonly isLinkPort: (path: string) => boolean) {
    super();
  }

  start(): void {
    void this.scan();
    this.timer = setInterval(() => void this.scan(), SCAN_MS);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const t of this.open.values()) await t.close().catch(() => {});
    this.open.clear();
  }

  list(): SerialDevice[] {
    return [...this.devices.values()];
  }

  /** Best current fix among owned receivers: the operator's position. */
  operatorFix(): (GnssFix & { path: string }) | null {
    let best: (GnssFix & { path: string }) | null = null;
    for (const d of this.devices.values()) {
      if (d.role !== 'gnss' || !d.fix || d.fix.quality === 0) continue;
      if (!best || d.fix.quality > best.quality || (d.fix.quality === best.quality && d.fix.satellitesUsed > best.satellitesUsed)) {
        best = { ...d.fix, path: d.path };
      }
    }
    return best;
  }

  private async scan(): Promise<void> {
    if (this.scanning) return;
    this.scanning = true;
    try {
      const ports = await listSerialPorts().catch(() => []);
      const present = new Set<string>();
      for (const p of ports) {
        const vid = p.vendorId?.toLowerCase() ?? null;
        if (!vid || IGNORED_VENDORS.has(vid)) continue; // built-in UARTs have no VID
        present.add(p.path);
        let d = this.devices.get(p.path);
        if (!d) {
          d = { path: p.path, vendorId: vid, productId: p.productId?.toLowerCase() ?? null, manufacturer: p.manufacturer ?? null,
            role: 'probing', protocol: null, baudRate: null, receiver: null, fix: null, lastProbe: 0 };
          this.devices.set(p.path, d);
        }
        if (this.isLinkPort(p.path)) {
          d.role = 'vehicle-link';
          continue;
        }
        const due = d.role === 'probing' || ((d.role === 'unknown' || d.role === 'busy') && Date.now() - d.lastProbe > RETRY_UNKNOWN_MS);
        if (due) await this.probe(d);
      }
      for (const path of [...this.devices.keys()]) {
        if (present.has(path)) continue;
        this.devices.delete(path);
        const t = this.open.get(path);
        if (t) await t.close().catch(() => {});
        this.open.delete(path);
        this.log('info', `gnss: ${path} removed`);
        this.emit('changed');
      }
    } finally {
      this.scanning = false;
    }
  }

  private async probe(d: SerialDevice): Promise<void> {
    d.lastProbe = Date.now();
    const bauds = NATIVE_CDC_VENDORS.has(d.vendorId ?? '') ? [115200] : BRIDGE_BAUDS;
    for (const baud of bauds) {
      const t = new SerialTransport(d.path, { baudRate: baud });
      const sniffer = new StreamSniffer();
      const onData = (b: Uint8Array) => sniffer.push(b);
      t.on('data', onData);
      try {
        await t.open();
      } catch (err) {
        d.role = 'busy';
        d.protocol = null;
        this.log('debug', `gnss: ${d.path} busy (${err instanceof Error ? err.message : err})`);
        t.removeAllListeners();
        return;
      }
      await sleep(LISTEN_MS);
      const kind = sniffer.verdict();
      if (kind === 'nmea' || kind === 'ubx' || kind === 'rtcm') {
        t.off('data', onData);
        await this.adoptGnss(d, t, kind, baud);
        return;
      }
      t.removeAllListeners();
      await t.close().catch(() => {});
      if (kind === 'mavlink') {
        Object.assign(d, { role: 'vehicle-link', protocol: kind, baudRate: baud });
        this.log('info', `gnss: ${d.path} carries MAVLink at ${baud} (vehicle link)`);
        this.emit('changed');
        return;
      }
    }
    Object.assign(d, { role: 'unknown', protocol: null, baudRate: null });
    this.emit('changed');
  }

  /** Identify a proven GNSS (u-blox MON-VER), then keep it open for its fix. */
  private async adoptGnss(d: SerialDevice, t: SerialTransport, kind: StreamKind, baud: number): Promise<void> {
    const ubx = new UbxParser();
    let identity: ReceiverIdentity | null = null;
    const onUbx = (b: Uint8Array) => {
      for (const m of ubx.push(b)) {
        if (m.cls === UBX.MON_VER[0] && m.id === UBX.MON_VER[1]) {
          const v = decodeMonVer(m.payload);
          if (v) identity = identifyUblox(v);
        }
      }
    };
    t.on('data', onUbx);
    await t.write(ubxPoll(UBX.MON_VER)).catch(() => {});
    await sleep(MONVER_MS);
    t.off('data', onUbx);

    const reader = new NmeaFixReader();
    t.on('data', (b: Uint8Array) => {
      reader.push(b);
      d.fix = reader.fix;
    });
    t.on('error', () => {});
    t.on('close', () => {
      this.open.delete(d.path);
      d.role = 'probing'; // re-detect if it comes back
    });
    this.open.set(d.path, t);
    Object.assign(d, {
      role: kind === 'rtcm' ? 'rtcm-source' : 'gnss',
      protocol: kind,
      baudRate: baud,
      receiver: identity ?? UNKNOWN_NMEA_RECEIVER,
      fix: { ...EMPTY_FIX },
    });
    const r = d.receiver!;
    this.log('info', `gnss: ${d.path} ${r.vendor} ${r.model ?? 'NMEA receiver'}${r.firmware ? ` (${r.firmware})` : ''}${r.rtkBase ? ', RTK base capable' : ', position only'}`);
    this.emit('changed');
  }
}
