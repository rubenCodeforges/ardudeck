// network.ts
import si from 'systeminformation';
import type { NetworkInfo, NetworkInterface } from '@ardudeck/companion-types';

export async function collectNetworkInfo(): Promise<NetworkInfo> {
  const [ifaces, wifi] = await Promise.all([
    si.networkInterfaces(),
    si.wifiNetworks().catch(() => []),
  ]);

  const ifaceList = Array.isArray(ifaces) ? ifaces : [ifaces];

  const interfaces: NetworkInterface[] = ifaceList
    .filter(i => !i.internal)
    .map(i => {
      const wifiInfo = Array.isArray(wifi)
        ? wifi.find(w => 'iface' in w && w.iface === i.iface)
        : undefined;

      return {
        name: i.iface,
        ip4: i.ip4 || '',
        ip6: i.ip6 || '',
        mac: i.mac || '',
        type: i.type === 'wireless' ? 'wireless' : i.virtual ? 'virtual' : 'wired',
        speed: i.speed ?? 0,
        ssid: wifiInfo?.ssid,
        signal: wifiInfo?.signalLevel,
      };
    });

  return { interfaces };
}
