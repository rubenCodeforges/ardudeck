/**
 * Pairing SITL's physics airframe with the flight code's mixer.
 *
 * These are two INDEPENDENT things inside ArduPilot and nothing links them:
 *
 *  - The simulated airframe (where the motors physically are) comes from a
 *    hardcoded angle table selected by the `-M<model>` string, in
 *    libraries/SITL/SIM_Frame.cpp.
 *  - The mixer (where the controller BELIEVES the motors are) comes from the
 *    FRAME_CLASS / FRAME_TYPE parameters, via AP_MotorsMatrix.
 *
 * Set one without the other and you get a vehicle whose motors are not where the
 * attitude controller thinks, which shows up as roll/pitch cross-coupling: a
 * rotating (coning) limit cycle rather than a clean per-axis oscillation. It is
 * NOT a tuning problem and no amount of PID work fixes it.
 *
 * ArduPilot's own SITL defaults are explicit about this: Tools/autotest/
 * default_params/copter.parm ships `FRAME_CLASS 1` AND `FRAME_TYPE 0`, because
 * its default physics frame is quad_plus_motors. We previously wrote FRAME_CLASS
 * only, so FRAME_TYPE kept the firmware default of 1 (X) while the physics stayed
 * Plus. On an octa that is a 22.5 degree offset on all eight motors, which is
 * unflyable (observed: 42 deg peak attitude error, motors at the rails, crash).
 *
 * Every pair below is machine-verified against apps/desktop/src/shared/ap-motor-layouts.json (a
 * dump of ArduPilot's own AP_Motors library test) by the accompanying test, which
 * re-derives the mapping from the SIM_Frame.cpp motor angles. If ArduPilot ever
 * changes a layout, that test fails rather than the vehicle falling out of the sky.
 */

/** FRAME_CLASS values (ArduPilot AP_Motors::motor_frame_class). */
export const FRAME_CLASS = {
  QUAD: 1,
  HEXA: 2,
  OCTA: 3,
  OCTAQUAD: 4,
  Y6: 5,
  HELI: 6,
  TRI: 7,
  SINGLECOPTER: 8,
  COAXCOPTER: 9,
  DODECAHEXA: 12,
  DECA: 14,
} as const;

/** FRAME_TYPE values (ArduPilot AP_Motors::motor_frame_type). */
export const FRAME_TYPE = {
  PLUS: 0,
  X: 1,
  V: 2,
  H: 3,
  BETAFLIGHT_X: 12,
} as const;

export interface SitlFrameGeometry {
  /** FRAME_CLASS the mixer must use to match this physics frame. */
  frameClass: number;
  /**
   * FRAME_TYPE the mixer must use to match this physics frame. `undefined` means
   * we have NOT verified a pairing for this model, so we deliberately leave
   * FRAME_TYPE alone rather than guess: non-matrix frames (heli, tricopter,
   * single/coax) largely ignore it, and writing a wrong value is worse than
   * writing none.
   */
  frameType?: number;
}

/**
 * SITL `-M<model>` string -> the mixer configuration that matches its physics.
 *
 * Keys are lowercase model strings as passed to SITL. Verified entries carry a
 * frameType; unverified ones intentionally omit it (see SitlFrameGeometry).
 */
export const SITL_COPTER_FRAMES: Record<string, SitlFrameGeometry> = {
  // quad_plus_motors: 90/CCW, -90/CCW, 0/CW, 180/CW.
  // "quad", "copter" and "+" are all the SAME Plus table in SIM_Frame.cpp - there
  // is no X-layout quad behind the name "quad", which is why the default copter
  // SITL needed FRAME_TYPE 0 and not the firmware's default of 1.
  quad: { frameClass: FRAME_CLASS.QUAD, frameType: FRAME_TYPE.PLUS },
  copter: { frameClass: FRAME_CLASS.QUAD, frameType: FRAME_TYPE.PLUS },
  '+': { frameClass: FRAME_CLASS.QUAD, frameType: FRAME_TYPE.PLUS },
  // quad_x_motors: 45/CCW, -135/CCW, -45/CW, 135/CW.
  x: { frameClass: FRAME_CLASS.QUAD, frameType: FRAME_TYPE.X },
  // hexa_motors: 0/CW, 180/CCW, -120/CW, 60/CCW, -60/CCW, 120/CW.
  hexa: { frameClass: FRAME_CLASS.HEXA, frameType: FRAME_TYPE.PLUS },
  // hexax_motors: 90/CW, -90/CCW, -30/CW, 150/CCW, 30/CCW, -150/CW.
  hexax: { frameClass: FRAME_CLASS.HEXA, frameType: FRAME_TYPE.X },
  // octa_motors: 0/CW, 180/CW, 45/CCW, 135/CCW, -45/CCW, -135/CCW, -90/CW, 90/CW.
  octa: { frameClass: FRAME_CLASS.OCTA, frameType: FRAME_TYPE.PLUS },

  // Below: class known, layout not verified against ap-motor-layouts.json yet.
  // FRAME_TYPE is left unset on purpose - see SitlFrameGeometry.frameType.
  octaquad: { frameClass: FRAME_CLASS.OCTAQUAD },
  y6: { frameClass: FRAME_CLASS.Y6 },
  heli: { frameClass: FRAME_CLASS.HELI },
  tri: { frameClass: FRAME_CLASS.TRI },
  singlecopter: { frameClass: FRAME_CLASS.SINGLECOPTER },
  coax: { frameClass: FRAME_CLASS.COAXCOPTER },
  'dodeca-hexa': { frameClass: FRAME_CLASS.DODECAHEXA },
  deca: { frameClass: FRAME_CLASS.DECA },
};

/**
 * Resolve a copter model string to its matching mixer configuration.
 * Unknown models fall back to Quad Plus, which is what SIM_Frame.cpp itself
 * defaults to when it cannot match a frame name.
 */
export function resolveCopterFrame(model: string | undefined): SitlFrameGeometry {
  const key = (model ?? '').toLowerCase().trim();
  return SITL_COPTER_FRAMES[key] ?? SITL_COPTER_FRAMES.quad!;
}

/**
 * The SITL physics frame string to launch for a custom-frame JSON with `motors`
 * motors. A custom frame JSON supplies mass / prop / battery numbers but NOT the
 * motor layout, so the layout still comes from this string and must be paired
 * with a matching FRAME_TYPE via resolveCopterFrame().
 *
 * Returns the Plus-layout name for each motor count, so FRAME_TYPE 0 is the
 * correct partner. Do not change one of these without the other.
 */
export function sitlFrameForMotorCount(motors: number): string {
  if (motors === 8) return 'octa';
  if (motors === 6) return 'hexa';
  return 'quad';
}
