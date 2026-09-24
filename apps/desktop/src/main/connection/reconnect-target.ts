import type { ConnectOptions } from '../../shared/ipc-channels';

/**
 * Where a reconnect should dial, worked out from what we know about the link.
 *
 * Extracted from `scheduleReconnect` because it is the part that was wrong, and because the
 * function it lives in is a closure inside a twelve-thousand-line module that cannot be reached
 * from a test without booting the whole app.
 *
 * The rule the original got wrong: **`connectionState` is only populated while connected.** A
 * caller that schedules a reconnect AFTER the link has already gone finds it empty, so the
 * target has to fall back to `lastConnectOptions`, which outlives the connection because it is
 * what unexpected-drop recovery re-dials.
 *
 * That is not a hypothetical ordering. Relaunching SITL to move the take-off point kills the
 * link as its first act, so every reconnect scheduled for it is scheduled after the drop. It
 * cancelled itself one millisecond in with "No connection info available for reconnect", and
 * the vehicle simply never came back.
 */

/** The live connection, as much of it as is still set. */
export interface LiveConnection {
  connectionType?: 'serial' | 'tcp' | 'udp';
  portPath?: string;
  /** 'crsf' links never reconnect through here; it resolves like a cleared protocol. */
  protocol?: 'msp' | 'mavlink' | 'crsf';
  isSitl?: boolean;
}

export interface ReconnectTarget {
  portPath?: string;
  /** Set only for a TCP link. Its presence is what tells the reconnect loop to dial TCP. */
  host?: string;
  tcpPort: number;
  protocol: 'msp' | 'mavlink';
  baudRate: number;
  /** Carried so a UDP link, which has neither host nor port path, is still recognisable. */
  options?: ConnectOptions;
}

/** SITL's MAVLink port, and the default for any TCP link that did not say otherwise. */
const DEFAULT_TCP_PORT = 5760;
const DEFAULT_BAUD = 115200;

export function resolveReconnectTarget(
  live: LiveConnection,
  last: ConnectOptions | null,
): ReconnectTarget {
  const isTcp = live.connectionType === 'tcp' || live.isSitl === true || last?.type === 'tcp';
  const lastTcpPort = typeof last?.tcpPort === 'string' ? parseInt(last.tcpPort, 10) : last?.tcpPort;

  return {
    portPath: live.portPath ?? (last?.type === 'serial' ? last.port : undefined),
    // 127.0.0.1 is the right default rather than a guess: the only TCP link that reaches here
    // without a recorded host is SITL, which is always loopback.
    host: isTcp ? ((last?.type === 'tcp' ? last.host : undefined) ?? '127.0.0.1') : undefined,
    tcpPort: (isTcp ? lastTcpPort : undefined) ?? DEFAULT_TCP_PORT,
    // A cleared protocol used to fall through to MSP, so a MAVLink link scheduled after its drop
    // was re-dialled as MSP: the socket opens, no heartbeat ever parses, and it reads as a dead
    // board rather than as the wrong protocol.
    protocol: (live.protocol === 'crsf' ? undefined : live.protocol)
      ?? (last ? (last.protocol === 'msp' ? 'msp' : 'mavlink') : 'msp'),
    // The baud actually connected with, never a hardcoded default: reconnecting at 115200 to a
    // 1,500,000-baud board opens the port fine and then parses nothing.
    baudRate: (last?.type === 'serial' ? last.baudRate : undefined) ?? DEFAULT_BAUD,
    options: last ?? undefined,
  };
}

/**
 * Whether a target is dialable at all. The reconnect loop asks this before trying, since a
 * target with nothing in it can only fail once per attempt until it times out.
 */
export function canDial(target: Pick<ReconnectTarget, 'portPath' | 'host' | 'options'>): boolean {
  return Boolean(target.portPath) || Boolean(target.host) || target.options?.type === 'udp';
}
