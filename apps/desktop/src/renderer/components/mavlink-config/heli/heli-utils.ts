// On a heli, SERVOn_FUNCTION Motor1..3 are swashplate servos and Motor4 is the tail, not ESC outputs.

type Get = (key: string) => number | undefined;

/** ArduCopter heli frames: 6 single, 11 dual, 13 quad heli. */
export const HELI_FRAME_CLASSES = new Set([6, 11, 13]);

/** RCx_OPTION value of the Motor Interlock switch. */
export const MOTOR_INTERLOCK_OPTION = 32;

/** ArduPilot reads an aux switch as high above 1800 µs. */
export const AUX_HIGH_PWM = 1800;

export function isHeliBuild(get: Get): boolean {
  return get('H_RSC_MODE') !== undefined;
}

/** H_TAIL_TYPE 3/4: the tail rotor is driven by its own ESC on Motor4. */
export function isDirectDriveFixedPitchTail(get: Get): boolean {
  const tail = get('H_TAIL_TYPE');
  return tail === 3 || tail === 4;
}

export type HeliOutputRole =
  | { kind: 'swash'; swash: 1 | 2; servo: number }
  | { kind: 'tailServo' }
  | { kind: 'tailEsc' }
  | { kind: 'extGyro' }
  | { kind: 'rsc' }
  | { kind: 'tailRsc' };

/** What a SERVOn_FUNCTION value drives on this heli, or null when it means the same as on any vehicle. */
export function heliOutputRole(fn: number, get: Get): HeliOutputRole | null {
  if (fn === 31) return { kind: 'rsc' };
  if (fn === 32) return { kind: 'tailRsc' };
  const motor = fn >= 33 && fn <= 40 ? fn - 32 : null;
  if (motor === null) return null;

  const frameClass = get('FRAME_CLASS');
  if (frameClass === 11) {
    if (motor <= 3) return { kind: 'swash', swash: 1, servo: motor };
    if (motor <= 6) return { kind: 'swash', swash: 2, servo: motor - 3 };
    return null;
  }
  if (frameClass === 13) return null;

  const swType = get('H_SW_TYPE');
  if (motor <= 3) return { kind: 'swash', swash: 1, servo: motor };
  if (motor === 4) return isDirectDriveFixedPitchTail(get) ? { kind: 'tailEsc' } : { kind: 'tailServo' };
  if (motor === 5 && (swType === 4 || swType === 5)) return { kind: 'swash', swash: 1, servo: 4 };
  if (motor === 7 && get('H_TAIL_TYPE') === 1) return { kind: 'extGyro' };
  return null;
}

/** True when the output is a servo whose MIN/TRIM/MAX the builder sets (swash and tail servos). */
export function heliRoleIsServo(role: HeliOutputRole | null): boolean {
  return role?.kind === 'swash' || role?.kind === 'tailServo';
}

/** i18n key + params naming the role, for labels next to the firmware's own function name. */
export function heliRoleLabel(role: HeliOutputRole): { key: string; params?: Record<string, number> } {
  switch (role.kind) {
    case 'swash':
      return role.swash === 2
        ? { key: 'mavlink-config:heli.roles.swash2Servo', params: { n: role.servo } }
        : { key: 'mavlink-config:heli.roles.swashServo', params: { n: role.servo } };
    case 'tailServo': return { key: 'mavlink-config:heli.roles.tailServo' };
    case 'tailEsc': return { key: 'mavlink-config:heli.roles.tailEsc' };
    case 'extGyro': return { key: 'mavlink-config:heli.roles.extGyro' };
    case 'rsc': return { key: 'mavlink-config:heli.roles.rsc' };
    case 'tailRsc': return { key: 'mavlink-config:heli.roles.tailRsc' };
  }
}

/** 1-based RC channel carrying the Motor Interlock switch, or null when none is assigned. */
export function interlockChannel(get: Get): number | null {
  for (let ch = 1; ch <= 16; ch++) {
    if (get(`RC${ch}_OPTION`) === MOTOR_INTERLOCK_OPTION) return ch;
  }
  return null;
}

/** Output channels (1-based) whose SERVOn_FUNCTION is `fn`. */
export function channelsForFunction(fn: number, get: Get, count = 32): number[] {
  const out: number[] = [];
  for (let ch = 1; ch <= count; ch++) if (get(`SERVO${ch}_FUNCTION`) === fn) out.push(ch);
  return out;
}
