/** UBX record shapes decoded by ubx.ts (layouts per the u-blox interface descriptions). */

export interface UbxSatellite {
  gnssId: number;
  svId: number;
  /** Carrier to noise, dBHz; 0 means not received. */
  cno: number;
  elevDeg: number;
  azimDeg: number;
  /** 0 no signal ... 4+ code and carrier locked. */
  quality: number;
  used: boolean;
  /** 1 healthy, 2 unhealthy, 0 unknown. */
  health: number;
}

export interface UbxPvt {
  fixType: number;
  numSv: number;
  /** Horizontal and vertical accuracy estimates, metres. */
  hAccM: number;
  vAccM: number;
  pDop: number;
}

export interface UbxRfBlock {
  blockId: number;
  /** 0 unknown, 1 ok, 2 warning, 3 critical. */
  jammingState: number;
  /** 0 init, 1 don't know, 2 ok, 3 short, 4 open. */
  antStatus: number;
  /** 0 off, 1 on, 2 don't know. */
  antPower: number;
  noisePerMs: number;
  /** AGC monitor, 0..8191. */
  agcCnt: number;
  /** CW jamming indicator, 0 (none) .. 255 (strong). */
  jamInd: number;
}

export interface UbxVersion {
  software: string;
  hardware: string;
  extensions: string[];
}
