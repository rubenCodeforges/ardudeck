// metrics.ts
import si from 'systeminformation';
import type { MetricsData } from '@ardudeck/companion-types';

export async function collectMetrics(): Promise<MetricsData> {
  const [cpu, mem, disk, temp] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.fsSize(),
    si.cpuTemperature(),
  ]);

  const rootDisk = disk.find(d => d.mount === '/') || disk[0];

  return {
    cpu: Math.round(cpu.currentLoad * 10) / 10,
    ram: Math.round((mem.used / mem.total) * 1000) / 10,
    ramTotal: mem.total,
    ramUsed: mem.used,
    disk: rootDisk ? Math.round((rootDisk.used / rootDisk.size) * 1000) / 10 : 0,
    diskTotal: rootDisk?.size ?? 0,
    diskUsed: rootDisk?.used ?? 0,
    temp: temp.main ?? -1,
  };
}
