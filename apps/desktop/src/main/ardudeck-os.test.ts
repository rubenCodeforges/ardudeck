import { describe, it, expect, vi, afterEach } from 'vitest';
import { probeArduDeckOs, isOsLinkEndpoint, fetchOsParams, OS_CLIENT_LOCAL_PORT } from './ardudeck-os';

const realPlatform = process.platform;

function mockFetch(body: unknown, ok = true) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok, json: async () => body } as Response);
}

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(process, 'platform', { value: realPlatform });
});

describe('probeArduDeckOs', () => {
  it('is unavailable off Linux without probing', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(await probeArduDeckOs()).toEqual({ available: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('is unavailable when nothing answers', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await probeArduDeckOs()).toEqual({ available: false });
  });

  it('ignores a different service on the port', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    mockFetch({ service: 'something-else', link: { clientPort: 14570 } });
    expect((await probeArduDeckOs()).available).toBe(false);
  });

  it('reports the link endpoint and live vehicle', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    mockFetch({
      service: 'ardudeck-os-linkd', version: '0.1.0', os: { id: 'ardudeck-os', name: 'ArduDeck OS' },
      link: { clientHost: '127.0.0.1', clientPort: 14570 },
      vehicle: { connected: true, sysid: 1, uid: 'abc', firmware: 'ardupilot', mode: 'Loiter', armed: false },
      params: { status: 'complete', received: 10, total: 10 },
    });
    expect(await probeArduDeckOs()).toEqual({
      available: true, osName: 'ArduDeck OS', serviceVersion: '0.1.0', clientHost: '127.0.0.1', clientPort: 14570,
      clientLocalPort: OS_CLIENT_LOCAL_PORT,
      vehicle: { sysid: 1, uid: 'abc', firmware: 'ardupilot', mode: 'Loiter', armed: false }, paramsCached: true,
    });
    expect(isOsLinkEndpoint('localhost', 14570)).toBe(true);
    expect(isOsLinkEndpoint('192.168.4.1', 14570)).toBe(false);
    expect(isOsLinkEndpoint('127.0.0.1', 14550)).toBe(false);
  });
});

describe('fetchOsParams', () => {
  const snap = {
    uid: 'board1', firmwareVersion: '4.7.1', fetchedAt: 1, updatedAt: 1, complete: true, source: 'ftp', paramCount: 1,
    params: [{ paramId: 'A', paramValue: 1, paramType: 9, paramIndex: 0 }],
  };

  it('returns a complete snapshot for the expected board', async () => {
    mockFetch(snap);
    expect(await fetchOsParams('board1')).toEqual(snap);
  });

  it('rejects another board, incomplete sets and errors', async () => {
    mockFetch(snap);
    expect(await fetchOsParams('board2')).toBeNull();
    mockFetch({ ...snap, complete: false });
    expect(await fetchOsParams()).toBeNull();
    mockFetch({ error: 'no vehicle' }, false);
    expect(await fetchOsParams()).toBeNull();
  });
});
