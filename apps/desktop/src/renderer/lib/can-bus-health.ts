import { canCounterDeltas, diagnoseCanBus, type CanBusHealth, type CanBusStats } from '../../shared/can-bus-stats.js';

const last = new Map<number, { stats: CanBusStats; at: number }>();

async function read(iface: number): Promise<CanBusStats | null> {
  const res = await window.electronAPI.canBusStats(iface);
  return res.success ? res.data : null;
}

export async function sampleCanBusHealth(iface: number, gapMs = 2000): Promise<CanBusHealth | null> {
  let prev = last.get(iface);
  if (!prev || Date.now() - prev.at > 30_000) {
    const first = await read(iface);
    if (!first) return null;
    prev = { stats: first, at: Date.now() };
    await new Promise((r) => setTimeout(r, gapMs));
  }
  const stats = await read(iface);
  if (!stats) return null;
  const now = Date.now();
  last.set(iface, { stats, at: now });
  return {
    ...stats,
    diagnosis: diagnoseCanBus(prev.stats.counters, stats.counters),
    deltas: canCounterDeltas(prev.stats.counters, stats.counters),
    intervalMs: now - prev.at,
  };
}
