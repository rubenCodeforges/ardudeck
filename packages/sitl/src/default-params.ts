import { resolveCopterFrame } from './frame-geometry.js';

export type SitlVehicleType = 'copter' | 'plane' | 'rover' | 'sub';

/**
 * Generate a defaults param file for SITL based on vehicle type and model.
 * This ensures essential parameters (like FRAME_CLASS) are set on first boot
 * or after EEPROM wipe, avoiding the "Check frame class" arming error.
 */
export function generateDefaultParams(
  vehicleType: SitlVehicleType,
  model: string,
  simBattVoltage?: number,
  simBattCapAh?: number,
): string {
  const lines: string[] = [];

  if (vehicleType === 'copter') {
    // FRAME_CLASS *and* FRAME_TYPE, together. SITL's simulated motor positions
    // come from the `-M<model>` frame table; the mixer comes from these two
    // params. Writing only FRAME_CLASS left FRAME_TYPE at the firmware default
    // of 1 (X) while every model we launch is a Plus layout, so the controller
    // commanded motors that were physically 22.5 deg (octa) to 45 deg (quad)
    // away from where it thought. That is unflyable and reads as a wobble.
    // ArduPilot's own copter.parm writes both for exactly this reason.
    const { frameClass, frameType } = resolveCopterFrame(model);
    lines.push(`FRAME_CLASS ${frameClass}`);
    if (frameType !== undefined) lines.push(`FRAME_TYPE ${frameType}`);
  }

  if (vehicleType === 'plane') {
    // Upstream ArduPilot plane-jsbsim.parm defaults. These are the
    // known-good baseline: without them, SITL plane drifts on the ground
    // with uncalibrated INS, modes don't map correctly, etc.
    // Source: ArduPilot/ardupilot Tools/autotest/default_params/plane-jsbsim.parm
    // Tracking:
    //   https://discuss.ardupilot.org/t/sitl-vehicle-on-mission-planner-moving-while-disarmed/65968
    lines.push('EK2_ENABLE      1');
    lines.push('BATT_MONITOR    4');
    lines.push('LOG_BITMASK     65535');
    lines.push('AIRSPEED_CRUISE 22.00');
    lines.push('PTCH_TRIM_DEG   0.00');
    lines.push('TRIM_THROTTLE   50');
    lines.push('PTCH_LIM_MIN_DEG -20.00');
    lines.push('PTCH_LIM_MAX_DEG 25.00');
    lines.push('ROLL_LIMIT_DEG  65.00');
    lines.push('LAND_DISARMDELAY 3');
    lines.push('LAND_PITCH_DEG  1.00');
    lines.push('LAND_FLARE_SEC  3');
    lines.push('ARSPD_USE       1');
    lines.push('AIRSPEED_MAX    30');
    lines.push('AIRSPEED_MIN    10');
    lines.push('KFF_RDDRMIX     0.5');
    lines.push('THR_MAX         100');
    // NOTE: the upstream JSBSim parm file sets RC2/RC4/SERVO2/SERVO4 REVERSED=1
    // because JSBSim's elevator/rudder sign convention is flipped. The
    // built-in `-Mplane` physics model is NOT flipped, so reversing here
    // makes the plane dive instead of climb during takeoff. Leaving them at
    // firmware default (not reversed).
    lines.push('RC1_MAX         2000');
    lines.push('RC1_MIN         1000');
    lines.push('RC1_TRIM        1500');
    lines.push('RC2_MAX         2000');
    lines.push('RC2_MIN         1000');
    lines.push('RC2_TRIM        1500');
    lines.push('RC3_MAX         2000');
    lines.push('RC3_MIN         1000');
    lines.push('RC3_TRIM        1000');
    lines.push('SERVO3_MIN      1000');
    lines.push('SERVO3_MAX      2000');
    lines.push('RC4_MAX         2000');
    lines.push('RC4_MIN         1000');
    lines.push('RC4_TRIM        1500');
    lines.push('RC5_MAX         2000');
    lines.push('RC5_MIN         1000');
    lines.push('RC5_TRIM        1500');
    lines.push('RC6_MAX         2000');
    lines.push('RC6_MIN         1000');
    lines.push('RC6_TRIM        1500');
    lines.push('RC7_MAX         2000');
    lines.push('RC7_MIN         1000');
    lines.push('RC7_TRIM        1500');
    lines.push('RC8_MAX         2000');
    lines.push('RC8_MIN         1000');
    lines.push('RC8_TRIM        1500');
    lines.push('FLTMODE1        10'); // AUTO
    lines.push('FLTMODE2        11'); // RTL
    lines.push('FLTMODE3        12'); // LOITER
    lines.push('FLTMODE4        5');  // FBWA
    lines.push('FLTMODE5        2');  // STABILIZE
    lines.push('FLTMODE6        0');  // MANUAL
    lines.push('FLTMODE_CH      8');
    lines.push('WP_LOITER_RAD   80');
    lines.push('WP_RADIUS       50');
    lines.push('RLL2SRV_RMAX    90');
    lines.push('RLL2SRV_TCONST  0.250000');
    lines.push('RLL_RATE_D      0.017430');
    lines.push('RLL_RATE_FF     0.237212');
    lines.push('RLL_RATE_I      0.25');
    lines.push('RLL_RATE_P      0.3');
    lines.push('PTCH2SRV_RMAX_DN 90');
    lines.push('PTCH2SRV_RMAX_UP 90');
    lines.push('PTCH2SRV_TCONST  0.25');
    lines.push('PTCH_RATE_D     0.007265');
    lines.push('PTCH_RATE_FF    0.595723');
    lines.push('PTCH_RATE_I     0.11');
    lines.push('PTCH_RATE_P     0.15');
    lines.push('PTCH2SRV_RLL    1');
    lines.push('NAVL1_PERIOD    15');
    lines.push('ACRO_LOCKING    1');
    lines.push('INS_ACCOFFS_X   0.001');
    lines.push('INS_ACCOFFS_Y   0.001');
    lines.push('INS_ACCOFFS_Z   0.001');
    lines.push('INS_ACCSCAL_X   1.001');
    lines.push('INS_ACCSCAL_Y   1.001');
    lines.push('INS_ACCSCAL_Z   1.001');
    lines.push('INS_ACC2OFFS_X  0.001');
    lines.push('INS_ACC2OFFS_Y  0.001');
    lines.push('INS_ACC2OFFS_Z  0.001');
    lines.push('INS_ACC2SCAL_X  1.001');
    lines.push('INS_ACC2SCAL_Y  1.001');
    lines.push('INS_ACC2SCAL_Z  1.001');
    lines.push('INS_GYR_CAL     0');

    // Layered on top of upstream defaults ----------------------------------

    // Disable RC failsafe in SITL: our UDP RC sender isn't recognized as
    // live RC → SHORT failsafe → CIRCLE, and LONG failsafe → RTL after 20s.
    //   https://discuss.ardupilot.org/t/fs-long-actn-and-fs-short-actn/77900
    lines.push('THR_FAILSAFE    0');
    lines.push('FS_SHORT_ACTN   0');
    lines.push('FS_LONG_ACTN    0');

    // TAKEOFF mode tuning so the plane actually climbs when mode switches
    // to TAKEOFF (13). Without these, plane ground-rolls forever without
    // rotating, or holds wings level past the target altitude.
    //   https://ardupilot.org/plane/docs/automatic-takeoff.html
    lines.push('TKOFF_ROTATE_SPD 12');
    lines.push('TKOFF_LVL_ALT   2');
    lines.push('TECS_PITCH_MAX  20');
    lines.push('TKOFF_THR_MAX   100');
    lines.push('TKOFF_THR_MINACC 0');
    lines.push('TKOFF_THR_MINSPD 0');

    // VTOL/quadplane/tailsitter only: enable Q-mode operations inside GUIDED.
    // Without this, NAV_VTOL_TAKEOFF in GUIDED is silently ignored — vehicle
    // stays armed at 0% throttle and never lifts. The param is harmless on
    // pure-plane builds where Q_ENABLE=0 (FCU just doesn't register it).
    //   https://ardupilot.org/plane/docs/parameters.html#q-guided-mode
    lines.push('Q_GUIDED_MODE   1');
  }

  // Sim-calmness for every vehicle (no wind).
  lines.push('SIM_WIND_SPD 0');
  lines.push('SIM_WIND_DIR 0');
  lines.push('SIM_WIND_T 0');
  // Simulated battery: must be set in defaults so SITL initializes the SOC
  // model on every boot. Runtime PARAM_SET on SIM_BATT_VOLTAGE alone does
  // NOT re-initialize the simulated battery; only SIM_BATT_CAP_AH change
  // resets state of charge. Writing both here forces a fresh init at boot.
  //
  // CRITICAL: SIM_BATT_VOLTAGE feeds the SITL motor model. Thrust scales with
  // supply voltage relative to the frame's reference voltage. The built-in
  // `-M<model>` frames (quad/hexa/plane/etc.) are calibrated around a ~12.6V (3S)
  // reference, so a higher default over-drives them: hover throttle produces
  // several times the intended thrust and the vehicle rockets past its takeoff
  // target and oscillates (a 14S/60.9V default made a 10m NAV_TAKEOFF climb to
  // >1200m). Keep the default matched to the built-in frames' reference. A high
  // industrial-pack voltage is only safe when paired with a custom frame whose
  // refVoltage matches, so pass it explicitly via simBattVoltage in that case.
  const battV = typeof simBattVoltage === 'number' && simBattVoltage > 0 ? simBattVoltage : 12.6;
  const battAh = typeof simBattCapAh === 'number' && simBattCapAh > 0 ? simBattCapAh : 10;
  lines.push(`SIM_BATT_VOLTAGE ${battV}`);
  lines.push(`SIM_BATT_CAP_AH ${battAh}`);
  // Disable SITL terrain model. If user picks a home location at a real-world
  // spot with high terrain (mountains), spawning at alt=0 AMSL puts the
  // vehicle below ground and AGL goes negative ("flying underground"). With
  // terrain disabled, SITL treats ground as flat at home altitude everywhere.
  lines.push('TERRAIN_ENABLE 0');
  lines.push('SIM_TERRAIN 0');

  return lines.join('\n');
}
