/** Which 1-based RC channel the vehicle reads each stick function from (RCMAP_*). */
export interface StickChannelMap {
  roll: number;
  pitch: number;
  throttle: number;
  yaw: number;
}

export interface StickValues {
  roll: number;
  pitch: number;
  throttle: number;
  yaw: number;
}

/** ArduPilot's RCMAP defaults (AETR). */
export const DEFAULT_STICK_MAP: StickChannelMap = { roll: 1, pitch: 2, throttle: 3, yaw: 4 };

/** RC_CHANNELS_OVERRIDE "leave this channel alone". */
export const RC_OVERRIDE_IGNORE = 65535;

export const RC_OVERRIDE_CHANNELS = 18;

const valid = (v: number | undefined): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= RC_OVERRIDE_CHANNELS;

/** The vehicle's RCMAP_*, each falling back to its default while the parameter is missing or out of range. Rover reads steering from RCMAP_ROLL. */
export function stickMapFrom(read: (name: string) => number | undefined): StickChannelMap {
  const pick = (name: string, fallback: number) => {
    const v = read(name);
    return valid(v) ? v : fallback;
  };
  return {
    roll: pick('RCMAP_ROLL', DEFAULT_STICK_MAP.roll),
    pitch: pick('RCMAP_PITCH', DEFAULT_STICK_MAP.pitch),
    throttle: pick('RCMAP_THROTTLE', DEFAULT_STICK_MAP.throttle),
    yaw: pick('RCMAP_YAW', DEFAULT_STICK_MAP.yaw),
  };
}

/** 18 override values, sticks on the vehicle's RCMAP channels; `pins` (1-based) never overwrite a stick channel. */
export function overrideChannels(sticks: StickValues, map: StickChannelMap = DEFAULT_STICK_MAP, pins: Record<number, number> = {}): number[] {
  const out = new Array<number>(RC_OVERRIDE_CHANNELS).fill(RC_OVERRIDE_IGNORE);
  const stickChannels = new Set([map.roll, map.pitch, map.throttle, map.yaw]);
  for (const [ch, pwm] of Object.entries(pins)) {
    const n = Number(ch);
    if (valid(n) && !stickChannels.has(n)) out[n - 1] = pwm;
  }
  out[map.roll - 1] = sticks.roll;
  out[map.pitch - 1] = sticks.pitch;
  out[map.yaw - 1] = sticks.yaw;
  // throttle last: if RCMAP ever doubles a channel, the low-throttle value must win
  out[map.throttle - 1] = sticks.throttle;
  return out;
}

type ChanField = 'chan1Raw' | 'chan2Raw' | 'chan3Raw' | 'chan4Raw' | 'chan5Raw' | 'chan6Raw' | 'chan7Raw' | 'chan8Raw' | 'chan9Raw'
  | 'chan10Raw' | 'chan11Raw' | 'chan12Raw' | 'chan13Raw' | 'chan14Raw' | 'chan15Raw' | 'chan16Raw' | 'chan17Raw' | 'chan18Raw';

/** chan1Raw..chan18Raw fields for serializeRcChannelsOverride. */
export function overrideFields(channels: number[]): Record<ChanField, number> {
  const f = {} as Record<ChanField, number>;
  for (let i = 0; i < RC_OVERRIDE_CHANNELS; i++) f[`chan${i + 1}Raw` as ChanField] = channels[i] ?? RC_OVERRIDE_IGNORE;
  return f;
}

/** Hands every channel back to the radio: ArduPilot releases ch1-8 on 0 and ch9-18 on UINT16_MAX-1 (UINT16_MAX only means "ignore"). */
export function releaseChannels(): number[] {
  return Array.from({ length: RC_OVERRIDE_CHANNELS }, (_, i) => (i < 8 ? 0 : RC_OVERRIDE_IGNORE - 1));
}

/** True when the vehicle's RC_CHANNELS carry a real pulse on any channel (a transmitter is driving it). */
export function hasLiveRcInput(channels: readonly number[]): boolean {
  return channels.some((v) => v >= 800 && v <= 2200);
}

export type StickAxis = keyof StickChannelMap;

/** Stick axes the vehicle reads reversed (RCn_REVERSED on the axis' RCMAP channel): there a low pulse means full deflection. */
export function reversedAxes(map: StickChannelMap, read: (name: string) => number | undefined): Set<StickAxis> {
  const out = new Set<StickAxis>();
  for (const axis of ['roll', 'pitch', 'throttle', 'yaw'] as const) {
    if (read(`RC${map[axis]}_REVERSED`) === 1) out.add(axis);
  }
  return out;
}

/** Stick positions as the pulses a transmitter would send: reversed axes mirror around 1500; RC_OVERRIDE_IGNORE stays. */
export function applyReversal(sticks: StickValues, reversed: ReadonlySet<StickAxis>): StickValues {
  const flip = (axis: StickAxis) => {
    const v = sticks[axis];
    return reversed.has(axis) && v !== RC_OVERRIDE_IGNORE && v > 0 ? 3000 - v : v;
  };
  return { roll: flip('roll'), pitch: flip('pitch'), throttle: flip('throttle'), yaw: flip('yaw') };
}

/**
 * Zero-throttle pulse on RC channel `n`: RCn_MIN, or RCn_MAX when reversed, since there a low
 * pulse is full throttle. Null while any of the three parameters is unknown. Same rule as
 * the mobile app's throttleLowPwm.
 */
export function throttleLowPwm(read: (name: string) => number | undefined, n: number): number | null {
  const min = read(`RC${n}_MIN`);
  const max = read(`RC${n}_MAX`);
  const reversed = read(`RC${n}_REVERSED`);
  if (min === undefined || max === undefined || reversed === undefined) return null;
  return Math.round(Math.round(reversed) === 1 ? max : min);
}

/**
 * One-shot RC_CHANNELS_OVERRIDE sent before arming, standing in for a missing transmitter.
 * Null when a transmitter is live: the override outranks it, and a wrong RCMAP puts 1500 on throttle (#152).
 * `rcChannels` null means the vehicle sent no RC_CHANNELS lately, so a transmitter cannot be ruled out.
 * `throttleLow` is the channel's zero-throttle pulse (throttleLowPwm); null skips the seed.
 */
export function armStandInChannels(
  map: StickChannelMap | null,
  rcChannels: readonly number[] | null,
  throttleLow: number | null,
): number[] | null {
  // Unknown RCMAP: a centred stick could land on the real throttle channel, so send nothing.
  if (!map || !rcChannels || hasLiveRcInput(rcChannels) || throttleLow === null) return null;
  return overrideChannels({ roll: 1500, pitch: 1500, throttle: throttleLow, yaw: 1500 }, map);
}
