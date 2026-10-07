import { describe, it, expect } from 'vitest';
import type { ConnectionState } from '../../shared/ipc-channels';
import { isPrimaryLinkUp } from './primary-link';

const base: ConnectionState = { isConnected: true, packetsReceived: 0, packetsSent: 0 } as ConnectionState;

describe('isPrimaryLinkUp', () => {
  it('is the plain connected flag on a single-vehicle link', () => {
    expect(isPrimaryLinkUp(base)).toBe(true);
    expect(isPrimaryLinkUp({ ...base, isConnected: false })).toBe(false);
  });

  it('is false while only a focused fleet vehicle makes the app look connected', () => {
    expect(isPrimaryLinkUp({ ...base, focus: { vehicleKey: 'k', viaFleet: true, primaryLink: false } })).toBe(false);
    expect(isPrimaryLinkUp({ ...base, focus: { vehicleKey: 'k', viaFleet: true, primaryLink: true } })).toBe(true);
  });
});
