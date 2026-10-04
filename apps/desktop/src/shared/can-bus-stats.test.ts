import { describe, expect, it } from 'vitest';
import { canCounterDeltas, canStatsPath, diagnoseCanBus, parseCanBusStats } from './can-bus-stats';

const NO_ACK = `------- Clock Config -------
CAN_CLK_FREQ:   80MHz
Std Timings: bitrate=500000 presc=10
sjw=1 bs1=13 bs2=2 sample_point=87.50000%
FD Timings:  bitrate=4000000 presc=1
sjw=5 bs1=14 bs2=5 sample_point=75.00000%
------- CAN Interface Stats -------
tx_requests:    3105
tx_rejected:    0
tx_overflow:    0
tx_success:     0
tx_timedout:    3103
tx_abort:       0
rx_received:    0
rx_overflow:    0
rx_errors:      0
num_busoff_err: 355
num_events:     0
ECR:            80
fdf_rx:         0
fdf_tx_req:     0
fdf_tx:         0
`;

const healthy = (txSuccess: number, rx: number, busoff = 2) => `------- Clock Config -------
CAN_CLK_FREQ:   80MHz
Std Timings: bitrate=1000000 presc=5
sjw=1 bs1=13 bs2=2 sample_point=87.50000%
------- CAN Interface Stats -------
tx_requests:    ${txSuccess}
tx_rejected:    0
tx_overflow:    0
tx_success:     ${txSuccess}
tx_timedout:    0
tx_abort:       0
rx_received:    ${rx}
rx_overflow:    0
rx_errors:      0
num_busoff_err: ${busoff}
num_events:     0
ECR:            0
`;

const bump = (counters: Record<string, number>, changes: Record<string, number>) => {
  const out = { ...counters };
  for (const [k, v] of Object.entries(changes)) out[k] = (out[k] ?? 0) + v;
  return out;
};

describe('parseCanBusStats', () => {
  it('reads the Std bitrate, not the FD one', () => {
    expect(parseCanBusStats(NO_ACK).bitrate).toBe(500000);
    expect(parseCanBusStats(healthy(5760, 341)).bitrate).toBe(1000000);
  });

  it('reads every counter and decodes ECR as hex', () => {
    const { counters } = parseCanBusStats(NO_ACK);
    expect(counters).toMatchObject({
      tx_requests: 3105, tx_rejected: 0, tx_overflow: 0, tx_success: 0, tx_timedout: 3103, tx_abort: 0,
      rx_received: 0, rx_overflow: 0, rx_errors: 0, num_busoff_err: 355, num_events: 0, ECR: 0x80, fdf_tx: 0,
    });
    expect(counters.CAN_CLK_FREQ).toBeUndefined();
    expect(counters.sjw).toBeUndefined();
  });

  it('handles CRLF and an empty file', () => {
    expect(parseCanBusStats(NO_ACK.replace(/\n/g, '\r\n')).counters.tx_timedout).toBe(3103);
    expect(parseCanBusStats('')).toEqual({ bitrate: null, counters: {} });
  });

  it('builds the @SYS path for a 0-based interface', () => {
    expect(canStatsPath(0)).toBe('@SYS/can0_stats.txt');
    expect(canStatsPath(1)).toBe('@SYS/can1_stats.txt');
  });
});

describe('diagnoseCanBus', () => {
  const noAck = parseCanBusStats(NO_ACK).counters;
  const ok = parseCanBusStats(healthy(5760, 341)).counters;

  it('no-ack when timeouts rise and nothing is acknowledged', () => {
    expect(diagnoseCanBus(noAck, bump(noAck, { tx_requests: 40, tx_timedout: 40, num_busoff_err: 3 }))).toBe('no-ack');
    expect(diagnoseCanBus(noAck, bump(noAck, { tx_abort: 5 }))).toBe('no-ack');
  });

  it('healthy when traffic flows, even with old bus-off counts', () => {
    const later = parseCanBusStats(healthy(5900, 360)).counters;
    expect(diagnoseCanBus(ok, later)).toBe('healthy');
  });

  it('bus-off when the bus-off counter rises while frames still get through', () => {
    expect(diagnoseCanBus(ok, bump(ok, { tx_success: 10, rx_received: 4, num_busoff_err: 1 }))).toBe('bus-off');
  });

  it('rx-errors when receive errors or overflows rise', () => {
    expect(diagnoseCanBus(ok, bump(ok, { tx_success: 10, rx_received: 4, rx_errors: 2 }))).toBe('rx-errors');
    expect(diagnoseCanBus(ok, bump(ok, { rx_overflow: 1 }))).toBe('rx-errors');
  });

  it('idle when nothing moves, judging deltas not absolute counts', () => {
    expect(diagnoseCanBus(noAck, noAck)).toBe('idle');
    expect(diagnoseCanBus(ok, ok)).toBe('idle');
  });

  it('treats a counter reset (FC reboot) as the new values', () => {
    const rebooted = parseCanBusStats(healthy(12, 3, 0)).counters;
    expect(canCounterDeltas(ok, rebooted).tx_success).toBe(12);
    expect(diagnoseCanBus(ok, rebooted)).toBe('healthy');
  });
});
