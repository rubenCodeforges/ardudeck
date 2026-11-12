/** Kept by default: resetting these loses calibration or can cut the link the reset travels on. */
const KEEP_PATTERNS: RegExp[] = [
  // ArduPilot calibration
  /^INS_(ACC|GYR)\d*_?(OFFS|SCAL|ID|CALTEMP)/,
  /^INS_TCAL/,
  /^COMPASS_(OFS|DIA|ODI|MOT|SCALE|DEV_ID|PRIO|ORIENT|EXTERN)/,
  /^RC\d+_(MIN|MAX|TRIM|REVERSED|REV)$/,
  /^BARO\d*_(GND_PRESS|DEVID)/,
  /^AHRS_(TRIM_|ORIENTATION)/,
  /_DEV_?ID\d*$/,
  // ArduPilot identity, frame and links
  /^(FORMAT_VERSION|SYSID_THISMAV|SYSID_SW_|STAT_)/,
  /^(FRAME_CLASS|FRAME_TYPE|Q_ENABLE|Q_FRAME_)/,
  /^SERIAL\d+_(BAUD|PROTOCOL|OPTIONS)$/,
  // PX4 calibration, identity, airframe and links
  /^CAL_/,
  /^SENS_BOARD_(ROT|X_OFF|Y_OFF|Z_OFF)/,
  /^(MAV_SYS_ID|MAV_COMP_ID|SYS_AUTOSTART|SYS_AUTOCONFIG)$/,
  /^SER_/,
  /_CONFIG$/,
  /^MAV_\d+_(CONFIG|MODE|RATE)$/,
];

export function isKeptOnReset(id: string): boolean {
  return KEEP_PATTERNS.some((re) => re.test(id));
}

export interface ResettableParam {
  id: string;
  value: number;
  defaultValue?: number;
  isReadOnly?: boolean;
}

export interface ResetPlan<P extends ResettableParam> {
  reset: P[];
  kept: P[];
}

/** Writable parameters away from their firmware default, split into the ones to reset and the ones kept. */
export function planResetChanged<P extends ResettableParam>(params: Iterable<P>, keepProtected: boolean): ResetPlan<P> {
  const reset: P[] = [];
  const kept: P[] = [];
  for (const p of params) {
    if (p.isReadOnly || p.defaultValue === undefined || Math.fround(p.value) === Math.fround(p.defaultValue)) continue;
    if (keepProtected && isKeptOnReset(p.id)) kept.push(p);
    else reset.push(p);
  }
  const byId = (a: P, b: P) => a.id.localeCompare(b.id);
  return { reset: reset.sort(byId), kept: kept.sort(byId) };
}
