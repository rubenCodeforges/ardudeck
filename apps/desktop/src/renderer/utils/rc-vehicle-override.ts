import type { ChannelMap, RcFunctionMap } from './pseudo-tx';

/** UINT16_MAX in RC_CHANNELS_OVERRIDE = "leave this channel alone". */
export const OVERRIDE_IGNORE = 65535;

export const OVERRIDE_CHANNELS = 18;

// Unmapped channels MUST stay OVERRIDE_IGNORE: 1500 or 0 there hijacks
// FLTMODE_CH and RCx_OPTION aux functions.
/** On-screen sticks drive only the four stick channels; every other channel stays with the vehicle's radio. */
export function packStickChannels(channels: number[], fns: RcFunctionMap): number[] {
  const out = new Array<number>(OVERRIDE_CHANNELS).fill(OVERRIDE_IGNORE);
  for (const ch of [fns.roll, fns.pitch, fns.throttle, fns.yaw]) {
    const pwm = channels[ch - 1];
    if (pwm !== undefined && ch >= 1 && ch <= OVERRIDE_CHANNELS) out[ch - 1] = Math.max(800, Math.min(2200, Math.round(pwm)));
  }
  return out;
}

export function packOverrideChannels(channels: number[], mapping: ChannelMap[]): number[] {
  const out = new Array<number>(OVERRIDE_CHANNELS).fill(OVERRIDE_IGNORE);
  for (let i = 0; i < OVERRIDE_CHANNELS; i++) {
    const map = mapping[i];
    if (!map || map.source.kind === 'none') continue;
    const pwm = channels[i];
    if (pwm === undefined) continue;
    out[i] = Math.max(800, Math.min(2200, Math.round(pwm)));
  }
  return out;
}
