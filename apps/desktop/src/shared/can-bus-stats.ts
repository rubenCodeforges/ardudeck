export type CanBusDiagnosis = 'healthy' | 'no-ack' | 'bus-off' | 'rx-errors' | 'idle';

export interface CanBusStats {
  /** Nominal (Std Timings) bitrate the interface runs at, bit/s. */
  bitrate: number | null;
  /** Counters as named in the file (tx_success, tx_timedout, num_busoff_err ...). ECR is decoded from hex. */
  counters: Record<string, number>;
}

export interface CanBusHealth extends CanBusStats {
  diagnosis: CanBusDiagnosis;
  /** Counter changes between the two samples the diagnosis used. */
  deltas: Record<string, number>;
  /** Milliseconds between the two samples. */
  intervalMs: number;
}

/** 0-based interface: CAN_P1 is can0. */
export function canStatsPath(iface: number): string {
  return `@SYS/can${iface}_stats.txt`;
}

export function parseCanBusStats(text: string): CanBusStats {
  const counters: Record<string, number> = {};
  let bitrate: number | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const std = /^Std Timings:\s*bitrate=(\d+)/.exec(line);
    if (std) {
      bitrate = Number(std[1]);
      continue;
    }
    const ecr = /^ECR:\s*([0-9a-fA-F]+)$/.exec(line);
    if (ecr) {
      counters.ECR = parseInt(ecr[1]!, 16);
      continue;
    }
    const m = /^([a-z][a-z0-9_]*):\s*(\d+)$/.exec(line);
    if (m) counters[m[1]!] = Number(m[2]);
  }
  return { bitrate, counters };
}

/** Counter changes from `prev` to `curr`. A counter that went down means the FC rebooted, so its current value is the change. */
export function canCounterDeltas(prev: Record<string, number>, curr: Record<string, number>): Record<string, number> {
  const reset = Object.keys(curr).some((k) => k !== 'ECR' && prev[k] !== undefined && curr[k]! < prev[k]!);
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(curr)) {
    if (k === 'ECR') continue;
    out[k] = reset ? v : v - (prev[k] ?? 0);
  }
  return out;
}

export function diagnoseCanBus(prev: Record<string, number>, curr: Record<string, number>): CanBusDiagnosis {
  const d = canCounterDeltas(prev, curr);
  const rising = (k: string) => (d[k] ?? 0) > 0;
  if ((rising('tx_timedout') || rising('tx_abort')) && !rising('tx_success')) return 'no-ack';
  if (rising('num_busoff_err')) return 'bus-off';
  if (rising('rx_errors') || rising('rx_overflow')) return 'rx-errors';
  if (rising('tx_success') || rising('rx_received')) return 'healthy';
  return 'idle';
}
