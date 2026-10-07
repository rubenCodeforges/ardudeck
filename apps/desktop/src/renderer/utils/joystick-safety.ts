/**
 * Preconditions for handing the sticks to a joystick: every control must sit where the vehicle
 * calls neutral (RCMAP, RCn_TRIM/MIN/MAX/REVERSED, reversible thrust), or match its live radio.
 */
import { RC_MID, shapeAxis, type ChannelMap, type RawDevice, type RcFunctionMap } from './pseudo-tx';
import type { ArduPilotVehicleClass } from '../../shared/telemetry-types';
import { t } from '../../shared/i18n/index.js';

/** PWM a centred control may sit from its trim (about 12% of half travel). */
export const CENTRE_TOLERANCE_US = 60;
/** PWM an idle throttle may sit above its end stop. */
export const IDLE_TOLERANCE_US = 80;
/** A live radio value outside this is a failsafe or a dead receiver, not a stick. */
const RADIO_PLAUSIBLE: [number, number] = [900, 2100];

/** Where a channel must rest before the joystick may take it. `auto` lets the vehicle decide. */
export type SafeAt = 'auto' | 'centre' | 'low' | 'high' | 'any';
export const SAFE_AT_OPTIONS: SafeAt[] = ['auto', 'centre', 'low', 'high', 'any'];

export type StickRole = 'roll' | 'pitch' | 'throttle' | 'yaw';
const ROLES: StickRole[] = ['roll', 'pitch', 'throttle', 'yaw'];

/** Why a target is where it is; drives the wording of a refusal. */
export type TargetBasis = 'centre' | 'idle' | 'zeroThrust' | 'radio' | 'low' | 'high';

export interface ChannelTarget {
  /** 1-based RC channel. */
  channel: number;
  role: StickRole | null;
  basis: TargetBasis;
  /** near: within tolerance of pwm. atMost / atLeast: one-sided, for end stops. */
  mode: 'near' | 'atMost' | 'atLeast';
  pwm: number;
  tolerance: number;
}

export interface HandoverContext {
  roles: RcFunctionMap;
  vehicleClass: ArduPilotVehicleClass | null;
  /** A vehicle parameter, or undefined while not loaded. */
  param: (name: string) => number | undefined;
  /** What the vehicle's own radio sends right now (index 0 = CH1), or null when none is live. */
  liveRc: readonly number[] | null;
  /** Per-channel override from the mapping (index 0 = CH1). */
  safeAt: readonly (SafeAt | undefined)[];
}

/** Zero thrust in the middle of the stick: rovers and boats drive backwards, subs dive, planes may reverse. */
export function reversibleThrottle(vehicleClass: ArduPilotVehicleClass | null, param: HandoverContext['param']): boolean {
  if (vehicleClass === 'rover' || vehicleClass === 'sub') return true;
  if (vehicleClass === 'plane' || vehicleClass === 'vtol') return (param('THR_MIN') ?? 0) < 0;
  return false;
}

function roleOf(roles: RcFunctionMap, channel: number): StickRole | null {
  return ROLES.find((r) => roles[r] === channel) ?? null;
}

function limits(param: HandoverContext['param'], ch: number): { min: number; max: number; trim: number; reversed: boolean } {
  const min = param(`RC${ch}_MIN`) ?? 1000;
  const max = param(`RC${ch}_MAX`) ?? 2000;
  const trim = param(`RC${ch}_TRIM`) ?? RC_MID;
  return { min, max, trim, reversed: (param(`RC${ch}_REVERSED`) ?? 0) === 1 };
}

/** Is the vehicle's radio live and plausible on every stick channel? */
export function radioUsable(ctx: Pick<HandoverContext, 'roles' | 'liveRc'>): boolean {
  if (!ctx.liveRc) return false;
  return ROLES.every((r) => {
    const v = ctx.liveRc![ctx.roles[r] - 1];
    return v !== undefined && v >= RADIO_PLAUSIBLE[0] && v <= RADIO_PLAUSIBLE[1];
  });
}

/** Where each channel has to be for a safe handover. Channels that do not matter are left out. */
export function handoverTargets(ctx: HandoverContext, channelCount = 16): ChannelTarget[] {
  const radio = radioUsable(ctx);
  const out: ChannelTarget[] = [];
  for (let ch = 1; ch <= channelCount; ch++) {
    const role = roleOf(ctx.roles, ch);
    const safe = ctx.safeAt[ch - 1] ?? 'auto';
    if (safe === 'any' || (safe === 'auto' && role === null)) continue;
    const l = limits(ctx.param, ch);
    const near = (pwm: number, basis: TargetBasis): ChannelTarget => ({ channel: ch, role, basis, mode: 'near', pwm, tolerance: CENTRE_TOLERANCE_US });
    if (safe === 'centre') { out.push(near(l.trim, 'centre')); continue; }
    if (safe === 'low') { out.push({ channel: ch, role, basis: 'low', mode: 'atMost', pwm: l.min + IDLE_TOLERANCE_US, tolerance: IDLE_TOLERANCE_US }); continue; }
    if (safe === 'high') { out.push({ channel: ch, role, basis: 'high', mode: 'atLeast', pwm: l.max - IDLE_TOLERANCE_US, tolerance: IDLE_TOLERANCE_US }); continue; }
    // auto, on a stick channel
    if (radio) { out.push(near(ctx.liveRc![ch - 1]!, 'radio')); continue; }
    if (role !== 'throttle') { out.push(near(l.trim, 'centre')); continue; }
    if (reversibleThrottle(ctx.vehicleClass, ctx.param)) { out.push(near(l.trim, 'zeroThrust')); continue; }
    out.push(l.reversed
      ? { channel: ch, role, basis: 'idle', mode: 'atLeast', pwm: l.max - IDLE_TOLERANCE_US, tolerance: IDLE_TOLERANCE_US }
      : { channel: ch, role, basis: 'idle', mode: 'atMost', pwm: l.min + IDLE_TOLERANCE_US, tolerance: IDLE_TOLERANCE_US });
  }
  return out;
}

export function targetMet(target: ChannelTarget, pwm: number): boolean {
  if (target.mode === 'atMost') return pwm <= target.pwm;
  if (target.mode === 'atLeast') return pwm >= target.pwm;
  return Math.abs(pwm - target.pwm) <= target.tolerance;
}

export interface ChannelVerdict {
  target: ChannelTarget;
  /** What the joystick would send on this channel, or null when it does not drive it. */
  pwm: number | null;
  ok: boolean;
}

export interface ControlCheck {
  ok: boolean;
  /** One line per failing channel, in channel order. */
  problems: string[];
  channels: ChannelVerdict[];
  /** radio: matching the live radio. rules: the vehicle's parameters. defaults: no parameters yet. */
  basis: 'radio' | 'rules' | 'defaults';
}

function roleName(role: StickRole | null, channel: number): string {
  return role ? t(`utils:joystickSafety.role.${role}`) : t('utils:joystickSafety.channel', { n: channel });
}

function wantText(target: ChannelTarget): string {
  return t(`utils:joystickSafety.want.${target.basis}`, { pwm: Math.round(target.pwm) });
}

/** Is it safe to hand the sticks over right now, given what the joystick would send on each channel? */
export function checkHandover(ctx: HandoverContext, sent: (channel: number) => number | null): ControlCheck {
  const targets = handoverTargets(ctx);
  const channels: ChannelVerdict[] = targets.map((target) => {
    const pwm = sent(target.channel);
    return { target, pwm, ok: pwm !== null && targetMet(target, pwm) };
  });
  const problems: string[] = [];
  const unassigned = channels.filter((c) => c.pwm === null && c.target.role !== null);
  if (unassigned.length > 0) {
    problems.push(t('utils:joystickSafety.assign', { names: unassigned.map((c) => `${roleName(c.target.role, c.target.channel)} (CH${c.target.channel})`).join(', ') }));
  }
  for (const c of channels) {
    if (c.ok || c.pwm === null) continue;
    problems.push(t('utils:joystickSafety.offTarget', {
      name: roleName(c.target.role, c.target.channel), ch: c.target.channel, pwm: Math.round(c.pwm), want: wantText(c.target),
    }));
  }
  const basis = radioUsable(ctx) ? 'radio' : ctx.param(`RCMAP_THROTTLE`) === undefined ? 'defaults' : 'rules';
  return { ok: problems.length === 0, problems, channels, basis };
}

/** Value of one mapped channel in stick units, or null when unmapped. */
export function channelValue(mapping: ChannelMap[], dev: RawDevice, channel: number): number | null {
  const map = mapping[channel];
  if (!map || map.source.kind === 'none') return null;
  switch (map.source.kind) {
    case 'axis':
      return shapeAxis(dev.axes[map.source.index] ?? 0, map);
    case 'button':
      return (dev.buttons[map.source.index] ? 1 : -1) * (map.reverse ? -1 : 1);
    case 'button3': {
      const lo = dev.buttons[map.source.low] ?? false;
      const hi = dev.buttons[map.source.high] ?? false;
      return (hi ? 1 : lo ? -1 : 0) * (map.reverse ? -1 : 1);
    }
  }
}

/** PWM a channel would be commanded at right now, for the live preview. */
export function channelPwm(mapping: ChannelMap[], dev: RawDevice, channel: number): number | null {
  const v = channelValue(mapping, dev, channel);
  return v === null ? null : Math.round(RC_MID + v * 500);
}
