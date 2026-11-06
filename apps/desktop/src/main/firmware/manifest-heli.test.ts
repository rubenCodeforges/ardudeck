import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getPath: () => '/tmp', isPackaged: false, getAppPath: () => '/tmp' } }));

import { groupArduPilotVersions, isHeliEntry } from './manifest-fetcher';
import type { ArduPilotManifestEntry } from '../../shared/firmware-types';

const base = 'https://firmware.ardupilot.org/Copter';
const entry = (path: string, version: string, type: string, extra: Partial<ArduPilotManifestEntry> = {}): ArduPilotManifestEntry => ({
  vehicletype: 'Copter',
  platform: 'MatekF405',
  format: 'apj',
  'mav-firmware-version': version,
  'mav-firmware-version-type': type,
  url: `${base}/${path}`,
  ...extra,
});

// The live manifest lists the heli build first for MatekF405; the old dedupe kept it for "Copter".
const MANIFEST: ArduPilotManifestEntry[] = [
  entry('stable-4.6.3/MatekF405-heli/arducopter-heli.apj', '4.6.3', 'STABLE-4.6.3', { 'mav-type': 'HELICOPTER' }),
  entry('stable-4.6.3/MatekF405/arducopter.apj', '4.6.3', 'STABLE-4.6.3', { 'mav-type': 'QUADROTOR' }),
  entry('stable/MatekF405-heli/arducopter-heli.apj', '4.6.3', 'OFFICIAL'),
  entry('stable/MatekF405/arducopter.apj', '4.6.3', 'OFFICIAL'),
  entry('beta/MatekF405-heli/arducopter-heli.apj', '4.7.0', 'BETA', { 'mav-type': 'HELICOPTER' }),
  entry('beta/MatekF405/arducopter.apj', '4.7.0', 'BETA', { 'mav-type': 'QUADROTOR' }),
];

const urls = (groups: ReturnType<typeof groupArduPilotVersions>) => groups.flatMap((g) => g.versions.map((v) => v.downloadUrl));

describe('ArduPilot heli builds', () => {
  it('Copter never resolves to the heli build, even when it is listed first', () => {
    const got = urls(groupArduPilotVersions(MANIFEST, 'copter', 'MatekF405'));
    expect(got).toEqual([`${base}/beta/MatekF405/arducopter.apj`, `${base}/stable-4.6.3/MatekF405/arducopter.apj`]);
    expect(got.some((u) => u.includes('heli'))).toBe(false);
  });

  it('Traditional helicopter gets only the heli build', () => {
    const got = urls(groupArduPilotVersions(MANIFEST, 'heli', 'MatekF405'));
    expect(got).toEqual([`${base}/beta/MatekF405-heli/arducopter-heli.apj`, `${base}/stable-4.6.3/MatekF405-heli/arducopter-heli.apj`]);
  });

  it('recognises a heli entry by mav-type or by its -heli path', () => {
    expect(isHeliEntry({ 'mav-type': 'HELICOPTER' })).toBe(true);
    expect(isHeliEntry({ url: `${base}/stable/X-heli/arducopter-heli.apj` })).toBe(true);
    expect(isHeliEntry({ 'mav-type': 'QUADROTOR', url: `${base}/stable/X/arducopter.apj` })).toBe(false);
  });
});

// SpeedyBee F405 V3: the live manifest entries for this board, heli listed first and the
// multirotor build tagged mav-type "Copter". Beta 1.2 handed the heli build to "Copter".
const SPEEDYBEE_F4V3: ArduPilotManifestEntry[] = [
  {
    "vehicletype": "Copter",
    "platform": "speedybeef4v3",
    "format": "apj",
    "mav-type": "HELICOPTER",
    "mav-firmware-version": "4.7.2",
    "mav-firmware-version-type": "STABLE-4.7.2",
    "url": "https://firmware.ardupilot.org/Copter/stable-4.7.2/speedybeef4v3-heli/arducopter-heli.apj",
    "board_id": 1082
  },
  {
    "vehicletype": "Copter",
    "platform": "speedybeef4v3",
    "format": "apj",
    "mav-type": "Copter",
    "mav-firmware-version": "4.7.2",
    "mav-firmware-version-type": "STABLE-4.7.2",
    "url": "https://firmware.ardupilot.org/Copter/stable-4.7.2/speedybeef4v3/arducopter.apj",
    "board_id": 1082
  },
  {
    "vehicletype": "Copter",
    "platform": "speedybeef4v3",
    "format": "apj",
    "mav-type": "HELICOPTER",
    "mav-firmware-version": "4.7.2",
    "mav-firmware-version-type": "OFFICIAL",
    "url": "https://firmware.ardupilot.org/Copter/stable/speedybeef4v3-heli/arducopter-heli.apj",
    "board_id": 1082
  },
  {
    "vehicletype": "Copter",
    "platform": "speedybeef4v3",
    "format": "apj",
    "mav-type": "Copter",
    "mav-firmware-version": "4.7.2",
    "mav-firmware-version-type": "OFFICIAL",
    "url": "https://firmware.ardupilot.org/Copter/stable/speedybeef4v3/arducopter.apj",
    "board_id": 1082
  },
  {
    "vehicletype": "Copter",
    "platform": "speedybeef4v3",
    "format": "apj",
    "mav-type": "HELICOPTER",
    "mav-firmware-version": "4.7.2",
    "mav-firmware-version-type": "BETA",
    "url": "https://firmware.ardupilot.org/Copter/beta/speedybeef4v3-heli/arducopter-heli.apj",
    "board_id": 1082
  },
  {
    "vehicletype": "Copter",
    "platform": "speedybeef4v3",
    "format": "apj",
    "mav-type": "Copter",
    "mav-firmware-version": "4.7.2",
    "mav-firmware-version-type": "BETA",
    "url": "https://firmware.ardupilot.org/Copter/beta/speedybeef4v3/arducopter.apj",
    "board_id": 1082
  }
];

describe('SpeedyBeeF4V3 Copter (#163)', () => {
  it('offers the multirotor build for Copter', () => {
    const got = urls(groupArduPilotVersions(SPEEDYBEE_F4V3, 'copter', 'speedybeef4v3'));
    expect(got.length).toBeGreaterThan(0);
    expect(got.every((u) => /\/speedybeef4v3\/arducopter\.apj$/.test(u))).toBe(true);
  });
  it('offers the heli build only for Heli', () => {
    const got = urls(groupArduPilotVersions(SPEEDYBEE_F4V3, 'heli', 'speedybeef4v3'));
    expect(got.length).toBeGreaterThan(0);
    expect(got.every((u) => u.endsWith('arducopter-heli.apj'))).toBe(true);
  });
});
