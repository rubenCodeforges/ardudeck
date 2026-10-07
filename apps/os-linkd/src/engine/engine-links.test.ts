import { describe, it, expect } from 'vitest';
import { engineArgs, engineLinkFor } from './engine-links';

describe('engineLinkFor', () => {
  it('maps every saved connection type to an orchestrator link', () => {
    expect(engineLinkFor({ id: 'a', name: 'Wi-Fi', type: 'udp-listen', port: 14550 })).toBe('udpin:0.0.0.0:14550');
    expect(engineLinkFor({ id: 'b', name: 'Peer', type: 'udp-peer', host: '10.0.0.2', port: 14555 })).toBe('udpout:10.0.0.2:14555');
    expect(engineLinkFor({ id: 'c', name: 'SITL', type: 'tcp', host: '127.0.0.1', port: 5760 })).toBe('tcpout:127.0.0.1:5760');
    expect(engineLinkFor({ id: 'd', name: 'Radio', type: 'serial', path: '/dev/ttyUSB0', baudRate: 57600 })).toBe('serial:/dev/ttyUSB0:57600');
  });

  it('passes one --link per link after the bind address', () => {
    expect(engineArgs('127.0.0.1:8790', ['udpin:0.0.0.0:14550', 'tcpout:127.0.0.1:5760']))
      .toEqual(['--bind', '127.0.0.1:8790', '--link', 'udpin:0.0.0.0:14550', '--link', 'tcpout:127.0.0.1:5760']);
  });
});
