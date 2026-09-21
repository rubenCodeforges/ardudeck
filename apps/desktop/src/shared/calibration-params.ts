/**
 * Classification of parameters that are per-unit calibration or per-unit
 * identity, as opposed to portable configuration. ArduPilot and PX4 both.
 *
 * Used by the fleet vault: restoring a snapshot or applying another unit's
 * config must NEVER overwrite these by default. Compass offsets from a
 * different airframe, another board's accel cal or a stale learned hover
 * throttle are actively dangerous to write to a vehicle.
 */

const CAL_PATTERNS: RegExp[] = [
  // Compass calibration (offsets, diagonals, off-diagonals, motor compensation, scale)
  /^COMPASS_OFS\d?_?[XYZ]$/,
  /^COMPASS_DIA\d?_?[XYZ]$/,
  /^COMPASS_ODI\d?_?[XYZ]$/,
  /^COMPASS_MOT\d?_?[XYZ]$/,
  /^COMPASS_SCALE\d?$/,
  /^COMPASS_ORIENT\d?$/,
  /^COMPASS_PRIO\d_ID$/,
  // IMU calibration (accel offsets/scale, gyro offsets, temperature cal)
  /^INS_ACC\d?_?OFFS_[XYZ]$/,
  /^INS_ACC\d?_?SCAL_[XYZ]$/,
  /^INS_GYR\d?_?OFFS_[XYZ]$/,
  /^INS_GYR\d?_CALTEMP$/,
  /^INS_ACC\d?_CALTEMP$/,
  /^INS_TCAL\d_.+$/,
  // Board level trim from accel cal
  /^AHRS_TRIM_[XYZ]$/,
  // Barometer per-unit state
  /^BARO\d?_?GND_PRESS$/,
  /^BARO_ALT_OFFSET$/,
  // Airspeed sensor calibration
  /^ARSPD\d?_OFFSET$/,
  /^ARSPD\d?_RATIO$/,
  // Power module calibration
  /^BATT\d?_VOLT_MULT$/,
  /^BATT\d?_AMP_PERVLT$/,
  /^BATT\d?_AMP_OFFSET$/,
  // RC radio calibration (per transmitter, not per airframe config)
  /^RC\d+_MIN$/,
  /^RC\d+_MAX$/,
  /^RC\d+_TRIM$/,
  // Learned in-flight values
  /^MOT_THST_HOVER$/,
  /^Q_M_THST_HOVER$/,
  // Device IDs: bind calibration to physical sensors; copying them across
  // units defeats ArduPilot's "calibration matches hardware" checks
  /^.*_DEV_?ID\d?$/,
  /^COMPASS_DEV_ID\d?$/,
  /^INS_(ACC|GYR)\d?_ID$/,
  // Board identity and stats
  /^SYSID_THISMAV$/,
  /^STAT_.+$/,

  // PX4. Same danger, different names: CAL_* is the whole per-sensor
  // calibration set, SENS_BOARD_* is this airframe's mounting.
  /^CAL_(ACC|GYRO|MAG)\d+_(X|Y|Z)(OFF|SCALE|ODIAG|COMP)$/,
  /^CAL_(ACC|GYRO|MAG)\d+_(ID|PRIO|ROT|ROLL|PITCH|YAW|TEMP)$/,
  /^CAL_MAG_SIDES$/,
  /^CAL_AIR_(TUBELEN|TUBED_MM|CMODEL)$/,
  /^SENS_BOARD_(ROT|[XYZ]_OFF)$/,
  /^ASPD_SCALE_\d$/,
  /^BAT\d?_(V_DIV|A_PER_V|V_CHARGED|V_EMPTY)$/,
  /^RC\d+_REV$/,
  /^MAV_SYS_ID$/,
  /^COM_FLIGHT_UUID$/,
];

export type ParamClass = 'calibration' | 'config';

export function isCalibrationParam(name: string): boolean {
  const upper = name.toUpperCase();
  return CAL_PATTERNS.some((re) => re.test(upper));
}

export function classifyParam(name: string): ParamClass {
  return isCalibrationParam(name) ? 'calibration' : 'config';
}
