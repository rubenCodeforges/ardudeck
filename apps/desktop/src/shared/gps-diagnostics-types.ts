export type { UbxSatellite, UbxPvt, UbxRfBlock, UbxVersion } from '@ardudeck/vehicle-core';
import type { UbxSatellite, UbxPvt, UbxRfBlock, UbxVersion } from '@ardudeck/vehicle-core';
// GPS diagnostics (UBX over MAVLink SERIAL_CONTROL) data shared by main and renderer.





export type GpsDiagEvent =
  | { kind: 'state'; open: boolean; error?: string }
  | { kind: 'sats'; sats: UbxSatellite[] }
  | { kind: 'pvt'; pvt: UbxPvt }
  | { kind: 'rf'; blocks: UbxRfBlock[] }
  | { kind: 'version'; version: UbxVersion }
  | { kind: 'traffic'; rxBytes: number }
  | { kind: 'bridge'; port: number | null; clients: number; error?: string };
