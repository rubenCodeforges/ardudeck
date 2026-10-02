import { describe, it, expect } from 'vitest';
import { candidateHosts, unaddressedAdapters } from './camera-discovery';

describe('camera discovery targets', () => {
  it('tries the last address and RunCam default first, then the neighbours', () => {
    const hosts = candidateHosts([{ name: 'en0', address: '192.168.0.20', netmask: '255.255.255.0' }], '192.168.0.47');
    expect(hosts.slice(0, 2)).toEqual(['192.168.0.47', '192.168.1.10']);
    expect(hosts).toContain('192.168.0.1');
    expect(hosts).toContain('192.168.0.254');
    expect(hosts).not.toContain('192.168.0.20');
    expect(hosts).not.toContain('192.168.0.0');
    expect(hosts).not.toContain('192.168.0.255');
  });

  it('caps a big office network at the /24 around this computer', () => {
    const hosts = candidateHosts([{ name: 'en0', address: '10.4.7.9', netmask: '255.255.0.0' }]);
    expect(hosts.length).toBe(1 + 253);
    expect(hosts.every((h) => h === '192.168.1.10' || h.startsWith('10.4.7.'))).toBe(true);
  });

  it('skips self-assigned adapters', () => {
    expect(candidateHosts([{ name: 'en7', address: '169.254.12.3', netmask: '255.255.0.0' }])).toEqual(['192.168.1.10']);
  });

  it('spots a wired adapter with only a self-assigned address', () => {
    const v4 = (address: string, internal = false) => ({ address, netmask: '255.255.0.0', family: 'IPv4' as const, mac: '', internal, cidr: null });
    expect(unaddressedAdapters({
      lo0: [v4('127.0.0.1', true)],
      en0: [v4('192.168.0.20')],
      en7: [v4('169.254.12.3')],
    })).toEqual(['en7']);
  });
});
