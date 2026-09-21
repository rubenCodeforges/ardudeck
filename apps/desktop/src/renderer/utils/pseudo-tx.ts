/**
 * Pseudo Transmitter
 *
 * Turns a USB-connected handset (RadioMaster/EdgeTX in "USB Joystick" mode, or any HID
 * gamepad) into RC channels, so the screens that need a transmitter work with no flight
 * controller and no receiver in the loop: modes setup, quick setup, telemetry and the 3D view.
 *
 * Chromium exposes the handset through the standard Gamepad API, so this needs no native
 * module, no driver and no extra permission on macOS or Windows.
 *
 * This is deliberately the SAME shaping the simulator applies (see `rust/src/tx.rs` in
 * ardudeck-game): deadband, expo, reverse, trim, then 1000-2000 us. A stick that reads 1500
 * in the sim must read 1500 here, or the two disagree about the aircraft you are configuring.
 *
 * Pure functions only, so the mapping is unit-tested without a browser or a device.
 */

/** Channels an RC link carries. Anything unmapped holds mid. */
export const RC_CHANNEL_COUNT = 16;
export const RC_MIN = 1000;
export const RC_MID = 1500;
export const RC_MAX = 2000;

/** Where a channel's value comes from on the HID device. */
export type ChannelSource =
  | { kind: 'none' }
  | { kind: 'axis'; index: number }
  /** Two-position switch reported as a button: released low, pressed high. */
  | { kind: 'button'; index: number }
  /** Three-position switch as a pair of buttons; neither pressed is centre. */
  | { kind: 'button3'; low: number; high: number };

export interface ChannelMap {
  source: ChannelSource;
  reverse: boolean;
  /** Added after shaping, in stick units (-1..1). */
  trim: number;
  /** Centre deadband in stick units. EdgeTX gimbals rarely rest at exactly zero. */
  deadband: number;
  /** 0 = linear, 1 = maximum softening around centre, like EdgeTX expo. */
  expo: number;
}

export function defaultChannelMap(): ChannelMap {
  return { source: { kind: 'none' }, reverse: false, trim: 0, deadband: 0.02, expo: 0 };
}

/**
 * AETR on axes 0-3, then channels 5-8 on axes 4-7.
 *
 * EdgeTX in USB Joystick mode publishes switches as further PROPORTIONAL AXES, not as buttons,
 * so a handset with switches on channels 5-8 lands on axes 4-7. An earlier version left
 * everything above channel 4 unmapped, which meant the sticks worked and no switch did.
 *
 * Switch channels get no deadband: a 3-position switch parks at exactly centre, and a deadband
 * there would swallow the middle position entirely.
 */
export function defaultMapping(): ChannelMap[] {
  return Array.from({ length: RC_CHANNEL_COUNT }, (_, i) => ({
    ...defaultChannelMap(),
    deadband: i < 4 ? 0.02 : 0,
    source: i < 8 ? ({ kind: 'axis', index: i } as ChannelSource) : { kind: 'none' },
  }));
}

/** EdgeTX-style expo: soften around centre without moving the endpoints. */
export function applyExpo(v: number, expo: number): number {
  if (expo <= 0.001) return v;
  const e = Math.min(1, Math.max(0, expo));
  return v * (1 - e) + v * v * v * e;
}

/** Normalise one raw axis to -1..1 with deadband, expo, reverse and trim applied. */
export function shapeAxis(raw: number, map: ChannelMap): number {
  let v = Math.min(1, Math.max(-1, raw));
  if (Math.abs(v) < map.deadband) {
    v = 0;
  } else {
    // Rescale so there is no step at the edge of the deadband.
    const s = Math.sign(v);
    v = s * ((Math.abs(v) - map.deadband) / Math.max(1e-3, 1 - map.deadband));
  }
  v = applyExpo(v, map.expo);
  if (map.reverse) v = -v;
  return Math.min(1, Math.max(-1, v + map.trim));
}

export function toPwm(v: number): number {
  return Math.round(Math.min(RC_MAX, Math.max(RC_MIN, RC_MID + v * 500)));
}

export interface RawDevice {
  axes: readonly number[];
  buttons: readonly boolean[];
}

/**
 * Map a device snapshot to 16 PWM channels.
 *
 * Unmapped channels hold MID rather than dropping to zero: a flight controller reads a channel
 * at zero as a failed receiver, so an unassigned channel must look neutral, not broken.
 */
export function devicesToChannels(dev: RawDevice, mapping: ChannelMap[]): number[] {
  const out = new Array<number>(RC_CHANNEL_COUNT).fill(RC_MID);
  for (let c = 0; c < Math.min(mapping.length, RC_CHANNEL_COUNT); c++) {
    const m = mapping[c]!;
    const src = m.source;
    let v: number;
    switch (src.kind) {
      case 'none':
        continue;
      case 'axis':
        v = shapeAxis(dev.axes[src.index] ?? 0, m);
        break;
      case 'button':
        // Switches are not gimbals: no deadband, no expo, just the two ends.
        v = dev.buttons[src.index] ? 1 : -1;
        if (m.reverse) v = -v;
        break;
      case 'button3': {
        const lo = dev.buttons[src.low] ?? false;
        const hi = dev.buttons[src.high] ?? false;
        v = hi ? 1 : lo ? -1 : 0;
        if (m.reverse) v = -v;
        break;
      }
    }
    out[c] = toPwm(v);
  }
  return out;
}

/**
 * Which raw control moved most since a reference snapshot. Drives "wiggle the stick you want
 * to assign" mapping, which is the only reliable way to learn a handset's HID layout: the
 * axis order is a per-model setting on the transmitter and cannot be detected.
 */
export function detectMovedControl(
  baseline: RawDevice,
  now: RawDevice,
  axisThreshold = 0.35,
): ChannelSource | null {
  let bestIdx = -1;
  let bestDelta = axisThreshold;
  for (let i = 0; i < now.axes.length; i++) {
    const d = Math.abs((now.axes[i] ?? 0) - (baseline.axes[i] ?? 0));
    if (d > bestDelta) {
      bestDelta = d;
      bestIdx = i;
    }
  }
  if (bestIdx >= 0) return { kind: 'axis', index: bestIdx };

  for (let i = 0; i < now.buttons.length; i++) {
    if ((now.buttons[i] ?? false) !== (baseline.buttons[i] ?? false)) {
      return { kind: 'button', index: i };
    }
  }
  return null;
}

/** Heuristic: does this gamepad look like a transmitter rather than an Xbox pad? */
export function looksLikeTransmitter(id: string, axisCount: number): boolean {
  const s = id.toLowerCase();
  if (/edgetx|opentx|radiomaster|jumper|frsky|flysky|taranis|horus|tx16|tx12|boxer|mt12/.test(s)) {
    return true;
  }
  // A handset in joystick mode exposes more proportional axes than a console pad's two sticks
  // plus triggers.
  return axisCount >= 6;
}

/** Which RC channel carries each stick, as the flight controller sees it. */
export interface RcFunctionMap {
  roll: number;
  pitch: number;
  throttle: number;
  yaw: number;
}

/** ArduPilot's RCMAP_* defaults. */
export const DEFAULT_RC_FUNCTIONS: RcFunctionMap = { roll: 1, pitch: 2, throttle: 3, yaw: 4 };

/**
 * Channels for the on-screen sticks, placed by the vehicle's own RCMAP_*.
 *
 * A physical pad needs a learned mapping because its axis order is arbitrary.
 * On-screen sticks do not: we know which pad is throttle, and the FC already
 * publishes which channel it reads each function from. Assuming channel n maps
 * to axis n instead puts yaw on the roll channel the moment RCMAP is anything
 * but the default.
 *
 * `axes` is gamepad convention [leftX, leftY, rightX, rightY], y positive down.
 */
export function virtualChannels(axes: number[], fns: RcFunctionMap = DEFAULT_RC_FUNCTIONS): number[] {
  const out = new Array<number>(RC_CHANNEL_COUNT).fill(RC_MID);
  const [leftX = 0, leftY = 0, rightX = 0, rightY = 0] = axes;

  const put = (channel: number, pwm: number) => {
    const i = Math.round(channel) - 1;
    if (i >= 0 && i < RC_CHANNEL_COUNT) out[i] = Math.round(pwm);
  };
  const bipolar = (v: number) => RC_MID + Math.min(1, Math.max(-1, v)) * (RC_MAX - RC_MID);

  put(fns.roll, bipolar(rightX));
  put(fns.pitch, bipolar(rightY));
  put(fns.yaw, bipolar(leftX));
  // Throttle is unipolar and the pad's up is negative, so stick-up is full.
  put(fns.throttle, RC_MIN + ((1 - Math.min(1, Math.max(-1, leftY))) / 2) * (RC_MAX - RC_MIN));
  return out;
}

/**
 * A fresh pad mapping placed by the vehicle's own RCMAP_*, rather than
 * channel-n-to-axis-n.
 *
 * A console pad's axis order is a known convention (left stick throttle/yaw,
 * right stick pitch/roll), and the flight controller already publishes which
 * channel it reads each function from. Between the two there is nothing for
 * the pilot to teach for the four primaries. Identity mapping only happens to
 * work when RCMAP is at its defaults, and silently swaps controls when it is
 * not. Switches above channel 4 stay on the old axis-order assumption because
 * nothing publishes where a handset puts them.
 */
export function mappingFromRcFunctions(fns: RcFunctionMap = DEFAULT_RC_FUNCTIONS): ChannelMap[] {
  const out = defaultMapping();
  const assign = (channel: number, axis: number) => {
    const i = Math.round(channel) - 1;
    if (i < 0 || i >= RC_CHANNEL_COUNT) return;
    out[i] = { ...defaultChannelMap(), deadband: 0.02, source: { kind: 'axis', index: axis } };
  };
  // Gamepad convention: 0 leftX, 1 leftY, 2 rightX, 3 rightY.
  assign(fns.yaw, 0);
  assign(fns.throttle, 1);
  assign(fns.roll, 2);
  assign(fns.pitch, 3);
  return out;
}
