import type { UbxVersion } from '@ardudeck/vehicle-core';

export interface ReceiverIdentity {
  vendor: 'u-blox' | 'unknown';
  /** Module name, e.g. "NEO-M8N", "ZED-F9P". Null for receivers that only speak NMEA. */
  model: string | null;
  firmware: string | null;
  protocolVersion: string | null;
  constellations: string[];
  /** Can be configured as an RTK base (survey-in / fixed position, RTCM out). */
  rtkBase: boolean;
  /** Can compute an RTK solution as a rover. */
  rtkRover: boolean;
}

export const UNKNOWN_NMEA_RECEIVER: ReceiverIdentity = {
  vendor: 'unknown', model: null, firmware: null, protocolVersion: null, constellations: [], rtkBase: false, rtkRover: false,
};

/**
 * u-blox capabilities from MON-VER. High-precision firmware (HPG) or an
 * RTK module name means the receiver can run as a base; standard-precision
 * modules (M8N, M9N, M10) give position only.
 */
export function identifyUblox(v: UbxVersion): ReceiverIdentity {
  const ext = (key: string) => v.extensions.find((e) => e.startsWith(`${key}=`))?.slice(key.length + 1) ?? null;
  const model = ext('MOD');
  const firmware = ext('FWVER');
  const constellations = v.extensions.filter((e) => /^[A-Z;]+$/.test(e) && e.includes('GPS')).flatMap((e) => e.split(';'));
  const rtkModule = /M8P|F9P|X20P/.test(model ?? '');
  const hpg = /HPG/.test(firmware ?? '');
  return {
    vendor: 'u-blox',
    model,
    firmware,
    protocolVersion: ext('PROTVER'),
    constellations,
    rtkBase: rtkModule || (hpg && !/F9R/.test(model ?? '')),
    rtkRover: rtkModule || hpg || /F9R/.test(model ?? ''),
  };
}
