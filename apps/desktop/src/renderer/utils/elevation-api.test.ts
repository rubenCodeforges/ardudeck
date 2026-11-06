import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./source-elevation', () => ({
  sourceElevation: async () => null,
  terrainTileElevations: async (points: unknown[]) => points.map(() => null),
}));

import {
  MAX_SAMPLES_PER_LEG,
  clearElevationCache,
  getElevation,
  getElevations,
  isElevationApiBackingOff,
  parseRetryAfter,
  sampleLeg,
} from './elevation-api';

function respond(status: number, body?: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers });
}

function pointsCount(url: string): number {
  return new URL(url).searchParams.get('latitude')!.split(',').length;
}

const fetchMock = vi.fn<(url: string) => Promise<Response>>();
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  clearElevationCache();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  warn.mockRestore();
});

const line = (n: number) => Array.from({ length: n }, (_, i) => ({ lat: 44.2 + i * 0.01, lon: 19.4 - i * 0.01 }));

describe('Open-Meteo backoff', () => {
  it('stops the chain on 429, honours Retry-After and warns once per window', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    fetchMock.mockResolvedValue(respond(429, { reason: 'limit' }, { 'Retry-After': '120' }));

    const first = await getElevations(line(450));
    expect(first.every((h) => h === null)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(isElevationApiBackingOff()).toBe(true);

    // Other callers during the window send nothing and do not warn again.
    await getElevations(line(300).map((p) => ({ lat: p.lat + 1, lon: p.lon })));
    await getElevation(45, 20);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 120_001);
    expect(isElevationApiBackingOff()).toBe(false);
    fetchMock.mockImplementation(async (url) => respond(200, { elevation: Array(pointsCount(url)).fill(321) }));
    expect(await getElevation(45, 20)).toBe(321);
  });

  it('backs off exponentially without Retry-After, and resets after a success', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const t0 = Date.now();
    fetchMock.mockResolvedValue(respond(429));
    await getElevation(1, 1);
    expect(isElevationApiBackingOff()).toBe(true);
    vi.setSystemTime(t0 + 30_001);
    expect(isElevationApiBackingOff()).toBe(false);

    await getElevation(2, 2);
    vi.setSystemTime(t0 + 30_001 + 59_000);
    expect(isElevationApiBackingOff()).toBe(true);
    vi.setSystemTime(t0 + 30_001 + 60_001);
    expect(isElevationApiBackingOff()).toBe(false);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('parses Retry-After as seconds or an HTTP date', () => {
    expect(parseRetryAfter('7')).toBe(7000);
    expect(parseRetryAfter(new Date(1_000_000 + 5000).toUTCString(), 1_000_000)).toBe(5000);
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter('soon')).toBeNull();
  });
});

describe('request sharing', () => {
  it('two callers asking for the same points send one request', async () => {
    let release: (r: Response) => void = () => {};
    fetchMock.mockImplementation(() => new Promise<Response>((r) => { release = r; }));
    const pts = line(40);
    const a = getElevations(pts);
    const b = getElevations(pts);
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    release(respond(200, { elevation: pts.map((_, i) => i) }));
    expect(await a).toEqual(pts.map((_, i) => i));
    expect(await b).toEqual(pts.map((_, i) => i));

    // Answers are cached: a third ask is free.
    expect(await getElevations(pts)).toEqual(pts.map((_, i) => i));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a repeated point inside one call is sent once', async () => {
    fetchMock.mockImplementation(async (url) => respond(200, { elevation: Array(pointsCount(url)).fill(10) }));
    await getElevations([{ lat: 1, lon: 1 }, { lat: 1, lon: 1 }, { lat: 2, lon: 2 }]);
    expect(pointsCount(fetchMock.mock.calls[0]![0])).toBe(2);
  });
});

describe('sampleLeg', () => {
  it('caps a 1,200 km leg at MAX_SAMPLES_PER_LEG, ends included', () => {
    const a = { lat: 44.2, lon: 19.4 }, b = { lat: 53.2, lon: 8.5 };
    const pts = sampleLeg(a, b, 5);
    expect(pts).toHaveLength(MAX_SAMPLES_PER_LEG);
    expect(pts[0]).toEqual(a);
    expect(pts[pts.length - 1]!.lat).toBeCloseTo(b.lat, 9);
    expect(pts[pts.length - 1]!.lon).toBeCloseTo(b.lon, 9);
    expect(Math.ceil(pts.length / 100)).toBe(2);
  });

  it('keeps the requested spacing on a short leg, and honours minSamples and a local maxSamples', () => {
    const a = { lat: 53.27, lon: 8.46 }, b = { lat: 53.27, lon: 8.4615 }; // about 100 m
    expect(sampleLeg(a, b, 25)).toHaveLength(5);
    expect(sampleLeg(a, a, 25, { minSamples: 4 })).toHaveLength(5);
    const far = { lat: 53.37, lon: 8.46 };
    expect(sampleLeg(a, far, 2, { maxSamples: 400 })).toHaveLength(400);
  });
});
