/**
 * Parameter types for MAVLink parameter management
 */

/**
 * MAVLink parameter type enum (MAV_PARAM_TYPE)
 */
export enum MavParamType {
  UINT8 = 1,
  INT8 = 2,
  UINT16 = 3,
  INT16 = 4,
  UINT32 = 5,
  INT32 = 6,
  UINT64 = 7,
  INT64 = 8,
  REAL32 = 9,
  REAL64 = 10,
}

/**
 * Get display name for parameter type
 */
export function getParamTypeName(type: MavParamType): string {
  switch (type) {
    case MavParamType.UINT8: return 'UINT8';
    case MavParamType.INT8: return 'INT8';
    case MavParamType.UINT16: return 'UINT16';
    case MavParamType.INT16: return 'INT16';
    case MavParamType.UINT32: return 'UINT32';
    case MavParamType.INT32: return 'INT32';
    case MavParamType.UINT64: return 'UINT64';
    case MavParamType.INT64: return 'INT64';
    case MavParamType.REAL32: return 'FLOAT';
    case MavParamType.REAL64: return 'DOUBLE';
    default: return 'UNKNOWN';
  }
}

/**
 * Core parameter data
 */
export interface Parameter {
  id: string;           // Parameter name (e.g., "ARMING_CHECK")
  value: number;        // Current value
  type: MavParamType;   // Data type
  index: number;        // Parameter index (0 to paramCount-1)
}

/**
 * Parameter with modification tracking
 */
export interface ParameterWithMeta extends Parameter {
  originalValue?: number;  // Original value from vehicle
  isModified?: boolean;    // Has been changed locally
  isReadOnly?: boolean;    // Dynamic/sensor param that shouldn't be edited
}

/**
 * Download progress tracking
 */
export interface ParameterProgress {
  total: number;        // Total parameters expected
  received: number;     // Parameters received so far
  percentage: number;   // 0-100
}

/**
 * PARAM_VALUE message payload (from MAVLink)
 */
export interface ParamValuePayload {
  paramId: string;
  paramValue: number;
  paramType: number;
  paramCount: number;
  paramIndex: number;
}

/**
 * Patterns for read-only/dynamic parameters that shouldn't show as "modified"
 * These are typically sensor readings that change during operation
 */
const READ_ONLY_PATTERNS = [
  /^TEMP_/i,           // Temperature sensors
  /^INS_ACC\d*_TEMP/i, // Accelerometer temperature
  /^INS_GYR\d*_TEMP/i, // Gyro temperature
  /^BARO\d*_TEMP/i,    // Barometer temperature
  /^STAT_/i,           // Runtime statistics
  /_TEMP$/i,           // Any param ending with _TEMP
];

/**
 * Check if a parameter is read-only/dynamic (shouldn't be edited or tracked as modified)
 */
export function isReadOnlyParameter(paramId: string): boolean {
  return READ_ONLY_PATTERNS.some(pattern => pattern.test(paramId));
}

/**
 * AI-generated parameter descriptions for common ArduPilot parameters
 * These provide fallback descriptions when official metadata is not available
 */
const PARAM_DESCRIPTIONS: Record<string, string> = {
  // ===== ALT (Altitude - ArduPlane specific) =====
  'ALT_CTRL_ALG': 'Altitude control method: 0=automatic (pitch controls altitude), 1=airspeed priority',
  'ALT_HOLD_FBWCM': 'Target altitude in Fly By Wire mode (cm). Aircraft will try to hold this altitude',
  'ALT_HOLD_RTL': 'Altitude to fly at during Return To Launch (cm). 0=use current altitude',
  'ALT_MIX': 'Pitch vs throttle mix for altitude control (0-1). 0=pitch only, 1=throttle only',
  'ALT_OFFSET': 'Altitude offset added to target altitude (meters). For formation flying',

  // ===== ARSPD (Airspeed Sensor - ArduPlane) =====
  'ARSPD_TYPE': 'Airspeed sensor type: 0=none, 1=analog, 2=MS4525, 3=MS5525, etc.',
  'ARSPD_USE': 'Use airspeed sensor: 0=do not use, 1=use for flight control',
  'ARSPD_OFFSET': 'Airspeed sensor zero offset (calibrate with no airflow)',
  'ARSPD_RATIO': 'Airspeed calibration ratio (auto-learned if ARSPD_AUTOCAL=1)',
  'ARSPD_PIN': 'Analog pin for airspeed sensor',
  'ARSPD_AUTOCAL': 'Auto-calibrate airspeed ratio in flight: 0=disabled, 1=enabled',
  'ARSPD_TUBE_ORDER': 'Pitot tube order: 0=normal, 1=swapped (if reads backwards)',
  'ARSPD_SKIP_CAL': 'Skip airspeed calibration at startup: 0=calibrate, 1=skip',
  'ARSPD_PSI_RANGE': 'Pressure sensor range in PSI',
  'ARSPD_BUS': 'I2C bus for airspeed sensor',
  'ARSPD_PRIMARY': 'Primary airspeed sensor: 0=first, 1=second',
  'ARSPD_OPTIONS': 'Airspeed options (add: 1=disable for landing)',
  'ARSPD2_TYPE': 'Second airspeed sensor type',
  'ARSPD2_USE': 'Use second airspeed sensor',
  'ARSPD2_OFFSET': 'Second airspeed sensor offset',
  'ARSPD2_RATIO': 'Second airspeed sensor ratio',
  'ARSPD2_PIN': 'Second airspeed sensor pin',

  // ===== FBW (Fly By Wire - ArduPlane) =====
  'FBWA_TDRAG_CHAN': 'Taildragger ground steering channel in FBWA mode',
  'FBWB_CLIMB_RATE': 'Maximum climb rate in FBWB mode (m/s)',
  'FBWB_ELEV_REV': 'Reverse elevator in FBWB mode: 0=normal, 1=reversed',
  'FBW_OPTIONS': 'Fly by wire options',

  // ===== FLIGHT (ArduPlane flight limits) =====
  'FLIGHT_OPTIONS': 'Flight options (add: 1=disable throttle nudge, 2=disable stall prevention)',

  // ===== FLTT/FLTD (Roll/Pitch time constants) =====
  'FLTD_CD_RATING': 'Flightmode D controller rating',
  'FLTD_CD_LPFLTR': 'Flightmode D controller low pass filter',

  // ===== KFF (Feed-forward gains - ArduPlane) =====
  'KFF_RDDRMIX': 'Rudder mixing gain for coordinated turns',
  'KFF_THR2PTCH': 'Throttle to pitch feedforward (nose up with throttle)',

  // ===== LIM (Flight Limits - ArduPlane) =====
  'LIM_PITCH_MAX': 'Maximum pitch up angle (degrees × 100)',
  'LIM_PITCH_MIN': 'Maximum pitch down angle (degrees × 100, negative)',
  'LIM_ROLL_CD': 'Maximum roll angle (degrees × 100)',

  // ===== NAVL1 (L1 Navigation Controller - ArduPlane) =====
  'NAVL1_PERIOD': 'L1 navigation period (seconds). Lower = tighter turns',
  'NAVL1_DAMPING': 'L1 navigation damping (0.6-1.0). Higher = less overshoot',
  'NAVL1_XTRACK_I': 'L1 crosstrack integrator gain',
  'NAVL1_LIM_BANK': 'Maximum bank angle for L1 navigation (degrees)',

  // ===== PTCH (Pitch Controller - ArduPlane) =====
  'PTCH_RATE_P': 'Pitch rate P gain - main pitch responsiveness',
  'PTCH_RATE_I': 'Pitch rate I gain - corrects steady pitch errors',
  'PTCH_RATE_D': 'Pitch rate D gain - dampens pitch oscillations',
  'PTCH_RATE_FF': 'Pitch rate feedforward - response to control inputs',
  'PTCH_RATE_IMAX': 'Maximum pitch I term (prevents windup)',
  'PTCH_RATE_FLTT': 'Pitch rate target filter (Hz)',
  'PTCH_RATE_FLTE': 'Pitch rate error filter (Hz)',
  'PTCH_RATE_FLTD': 'Pitch rate D filter (Hz)',
  'PTCH2SRV_TCONST': 'Pitch controller time constant (seconds)',
  'PTCH2SRV_RMAX_DN': 'Maximum pitch rate down (degrees/sec)',
  'PTCH2SRV_RMAX_UP': 'Maximum pitch rate up (degrees/sec)',

  // ===== RLL (Roll Controller - ArduPlane) =====
  'RLL_RATE_P': 'Roll rate P gain - main roll responsiveness',
  'RLL_RATE_I': 'Roll rate I gain - corrects steady roll errors',
  'RLL_RATE_D': 'Roll rate D gain - dampens roll oscillations',
  'RLL_RATE_FF': 'Roll rate feedforward - response to control inputs',
  'RLL_RATE_IMAX': 'Maximum roll I term (prevents windup)',
  'RLL_RATE_FLTT': 'Roll rate target filter (Hz)',
  'RLL_RATE_FLTE': 'Roll rate error filter (Hz)',
  'RLL_RATE_FLTD': 'Roll rate D filter (Hz)',
  'RLL2SRV_TCONST': 'Roll controller time constant (seconds)',
  'RLL2SRV_RMAX': 'Maximum roll rate (degrees/sec)',

  // ===== SCALING (Control Scaling - ArduPlane) =====
  'SCALING_SPEED': 'Airspeed for control surface scaling (m/s)',

  // ===== STAB (Stability - ArduPlane) =====
  'STAB_PITCH_DOWN': 'Pitch down trim in stabilize (degrees × 100)',

  // ===== STALL (Stall Prevention - ArduPlane) =====
  'STALL_PREVENTION': 'Enable stall prevention: 0=off, 1=on',

  // ===== STICK (Stick Mixing - ArduPlane) =====
  'STICK_MIXING': 'Allow manual stick input in auto modes: 0=disabled, 1=FBW mixing, 2=direct',

  // ===== TECS (Total Energy Control - ArduPlane altitude/airspeed) =====
  'TECS_CLMB_MAX': 'Maximum climb rate (m/s)',
  'TECS_SINK_MIN': 'Minimum sink rate (m/s). Used for glide calculations',
  'TECS_SINK_MAX': 'Maximum sink rate (m/s)',
  'TECS_TIME_CONST': 'TECS time constant (seconds). Lower = faster response',
  'TECS_THR_DAMP': 'Throttle damping (0-1). Higher = smoother throttle',
  'TECS_INTEG_GAIN': 'TECS integrator gain',
  'TECS_VERT_ACC': 'Vertical acceleration limit (m/s²)',
  'TECS_HGT_OMEGA': 'Height controller frequency (rad/s)',
  'TECS_SPD_OMEGA': 'Speed controller frequency (rad/s)',
  'TECS_RLL2THR': 'Roll to throttle compensation (adds throttle in turns)',
  'TECS_SPDWEIGHT': 'Speed vs height priority (0=height, 1=speed, 2=both)',
  'TECS_PTCH_DAMP': 'Pitch damping (0-1). Higher = smoother pitch',
  'TECS_LAND_ARSPD': 'Landing approach airspeed (m/s)',
  'TECS_LAND_SPDWGT': 'Landing speed weight (prioritize speed during landing)',
  'TECS_PITCH_MAX': 'Maximum pitch for TECS (degrees)',
  'TECS_PITCH_MIN': 'Minimum pitch for TECS (degrees)',
  'TECS_LAND_SINK': 'Landing sink rate (m/s)',
  'TECS_LAND_TCONST': 'Landing time constant',
  'TECS_LAND_DAMP': 'Landing damping',
  'TECS_LAND_PMAX': 'Landing maximum pitch (degrees)',
  'TECS_APPR_SMAX': 'Approach maximum sink rate (m/s)',
  'TECS_LAND_SRC': 'Landing sink rate change',
  'TECS_OPTIONS': 'TECS options (add: 1=glider mode)',

  // ===== TRIM (Trim Settings - ArduPlane) =====
  'TRIM_ARSPD_CM': 'Target cruise airspeed (cm/s). E.g., 1500 = 15 m/s',
  'TRIM_PITCH_CD': 'Pitch trim for level flight (degrees × 100)',
  'TRIM_THROTTLE': 'Throttle for level cruise flight (%)',
  'TRIM_AUTO': 'Auto-trim in manual modes: 0=disabled, 1=enabled',

  // ===== YAW (Yaw Controller - ArduPlane) =====
  'YAW_RATE_P': 'Yaw rate P gain',
  'YAW_RATE_I': 'Yaw rate I gain',
  'YAW_RATE_D': 'Yaw rate D gain',
  'YAW_RATE_FF': 'Yaw rate feedforward',
  'YAW_RATE_IMAX': 'Maximum yaw I term',
  'YAW_RATE_FLTT': 'Yaw rate target filter (Hz)',
  'YAW_RATE_FLTE': 'Yaw rate error filter (Hz)',
  'YAW_RATE_FLTD': 'Yaw rate D filter (Hz)',
  'YAW2SRV_SLIP': 'Yaw controller sideslip gain',
  'YAW2SRV_INT': 'Yaw controller integrator gain',
  'YAW2SRV_DAMP': 'Yaw controller damping',
  'YAW2SRV_RLL': 'Yaw controller roll compensation',
  'YAW2SRV_IMAX': 'Yaw controller max integrator',

  // ===== Q_ (QuadPlane VTOL Settings) =====
  'Q_ENABLE': 'Enable QuadPlane VTOL: 0=disabled, 1=enabled',
  'Q_FRAME_CLASS': 'VTOL frame type: 1=quad, 2=hexa, 3=octa, etc.',
  'Q_FRAME_TYPE': 'VTOL motor arrangement: 0=plus, 1=X, etc.',
  'Q_THR_MIN_PWM': 'VTOL motor minimum PWM',
  'Q_THR_MAX_PWM': 'VTOL motor maximum PWM',
  'Q_ASSIST_SPEED': 'Airspeed below which VTOL motors assist (m/s)',
  'Q_ASSIST_ANGLE': 'Angle at which VTOL motors assist (degrees)',
  'Q_ASSIST_ALT': 'Altitude above which to disable assist (meters)',
  'Q_TILT_MASK': 'Which motors are tiltrotors',
  'Q_TILT_TYPE': 'Tiltrotor type: 0=continuous, 1=binary, 2=vectored',
  'Q_TAILSIT_ANGLE': 'Tailsitter transition angle (degrees)',
  'Q_TAILSIT_ANG_VT': 'Tailsitter VTOL angle (degrees)',
  'Q_TRANSITION_MS': 'Transition time from VTOL to plane (ms)',
  'Q_VELZ_MAX': 'Maximum VTOL vertical speed (cm/s)',
  'Q_ACCEL_Z': 'VTOL vertical acceleration (cm/s²)',
  'Q_WP_SPEED': 'VTOL waypoint speed (cm/s)',
  'Q_LAND_SPEED': 'VTOL landing speed (cm/s)',
  'Q_RTL_ALT': 'VTOL RTL altitude (cm)',
  'Q_RTL_MODE': 'VTOL RTL mode: 0=VTOL, 1=plane approach',
  'Q_GUIDED_MODE': 'Guided mode behavior: 0=VTOL, 1=plane',
  'Q_OPTIONS': 'QuadPlane options (many, check docs)',
  'Q_ANGLE_MAX': 'Maximum VTOL lean angle (degrees × 100)',
  'Q_TRIM_PITCH': 'VTOL hover pitch trim (degrees × 100)',
  'Q_THROTTLE_EXPO': 'VTOL throttle expo (0-1)',
  'Q_WVANE_GAIN': 'VTOL weathervane yaw gain',
  'Q_WVANE_MINROLL': 'VTOL weathervane min roll (degrees)',
  'Q_TILT_RATE_DN': 'Tiltrotor rate going down (degrees/sec)',
  'Q_TILT_RATE_UP': 'Tiltrotor rate going up (degrees/sec)',
  'Q_LAND_FINAL_SPD': 'VTOL final landing speed (cm/s)',
  'Q_LAND_FINAL_ALT': 'VTOL final landing altitude (meters)',

  // ===== ARMING =====
  'ARMING_CHECK': 'Which safety checks to run before arming (add values: 1=all, 2=barometer, 4=compass, etc.)',
  'ARMING_ACCTHRESH': 'How closely accelerometers must agree to allow arming (lower = stricter)',
  'ARMING_REQUIRE': 'How to arm the vehicle: 0=no checks, 1=throttle at bottom, 2=rudder gesture',
  'ARMING_RUDDER': 'Arm/disarm with rudder: 0=disabled, 1=arm only, 2=both arm and disarm',
  'ARMING_MIS_ITEMS': 'Mission items required before arming (0=none required)',

  // ===== AHRS (Attitude Heading Reference System) =====
  'AHRS_GPS_GAIN': 'How much GPS affects orientation calculation (0-1, higher = more GPS influence)',
  'AHRS_GPS_USE': 'Use GPS data for orientation: 0=no, 1=yes',
  'AHRS_YAW_P': 'Yaw (heading) correction strength - higher values correct faster',
  'AHRS_RP_P': 'Roll and pitch correction strength - higher values correct faster',
  'AHRS_WIND_MAX': 'Maximum wind speed the system will estimate (meters/sec)',
  'AHRS_GPS_MINSATS': 'Minimum GPS satellites needed for navigation',
  'AHRS_EKF_TYPE': 'Navigation filter type: 2=older (EKF2), 3=newer (EKF3, recommended)',
  'AHRS_TRIM_X': 'Level adjustment for roll (if aircraft drifts left/right when level)',
  'AHRS_TRIM_Y': 'Level adjustment for pitch (if aircraft drifts forward/back when level)',
  'AHRS_TRIM_Z': 'Level adjustment for yaw (rarely needed)',
  'AHRS_ORIENTATION': 'How the flight controller is mounted: 0=normal, 4=yaw90, 8=yaw180, etc.',

  // ===== ANGLE =====
  'ANGLE_MAX': 'Maximum tilt angle in degrees × 100 (e.g., 3000 = 30 degrees)',

  // ===== ATC (Attitude/Tuning Control) =====
  'ATC_ACCEL_P_MAX': 'How fast pitch can accelerate (degrees/sec² × 100). Higher = snappier',
  'ATC_ACCEL_R_MAX': 'How fast roll can accelerate (degrees/sec² × 100). Higher = snappier',
  'ATC_ACCEL_Y_MAX': 'How fast yaw can accelerate (degrees/sec² × 100). Higher = snappier',
  'ATC_ANG_LIM_TC': 'Smoothing for angle limits - higher = smoother but slower response',
  'ATC_ANG_PIT_P': 'Pitch angle tuning - how aggressively it corrects pitch errors',
  'ATC_ANG_RLL_P': 'Roll angle tuning - how aggressively it corrects roll errors',
  'ATC_ANG_YAW_P': 'Yaw angle tuning - how aggressively it corrects heading errors',
  'ATC_INPUT_TC': 'Stick input smoothing - higher = smoother but less responsive',
  'ATC_RATE_FF_ENAB': 'Enable advanced tuning (feedforward): 0=off, 1=on',
  'ATC_RAT_PIT_P': 'Pitch rate tuning P - main pitch responsiveness',
  'ATC_RAT_PIT_I': 'Pitch rate tuning I - corrects steady pitch errors over time',
  'ATC_RAT_PIT_D': 'Pitch rate tuning D - dampens pitch oscillations',
  'ATC_RAT_PIT_IMAX': 'Maximum pitch correction from I term (prevents windup)',
  'ATC_RAT_PIT_FLTD': 'Pitch D-term filter frequency (Hz) - lower = smoother, may add lag',
  'ATC_RAT_PIT_FLTE': 'Pitch error filter frequency (Hz) - reduces noise in pitch control',
  'ATC_RAT_PIT_FLTT': 'Pitch target filter frequency (Hz) - smooths pitch commands',
  'ATC_RAT_PIT_FF': 'Pitch feedforward - improves response to rapid stick movements',
  'ATC_RAT_RLL_P': 'Roll rate tuning P - main roll responsiveness',
  'ATC_RAT_RLL_I': 'Roll rate tuning I - corrects steady roll errors over time',
  'ATC_RAT_RLL_D': 'Roll rate tuning D - dampens roll oscillations',
  'ATC_RAT_RLL_IMAX': 'Maximum roll correction from I term (prevents windup)',
  'ATC_RAT_RLL_FLTD': 'Roll D-term filter frequency (Hz) - lower = smoother, may add lag',
  'ATC_RAT_RLL_FLTE': 'Roll error filter frequency (Hz) - reduces noise in roll control',
  'ATC_RAT_RLL_FLTT': 'Roll target filter frequency (Hz) - smooths roll commands',
  'ATC_RAT_RLL_FF': 'Roll feedforward - improves response to rapid stick movements',
  'ATC_RAT_YAW_P': 'Yaw rate tuning P - main yaw/heading responsiveness',
  'ATC_RAT_YAW_I': 'Yaw rate tuning I - corrects steady yaw drift over time',
  'ATC_RAT_YAW_D': 'Yaw rate tuning D - dampens yaw oscillations',
  'ATC_RAT_YAW_IMAX': 'Maximum yaw correction from I term (prevents windup)',
  'ATC_RAT_YAW_FLTD': 'Yaw D-term filter frequency (Hz) - lower = smoother, may add lag',
  'ATC_RAT_YAW_FLTE': 'Yaw error filter frequency (Hz) - reduces noise in yaw control',
  'ATC_RAT_YAW_FLTT': 'Yaw target filter frequency (Hz) - smooths yaw commands',
  'ATC_RAT_YAW_FF': 'Yaw feedforward - improves response to rapid stick movements',
  'ATC_SLEW_YAW': 'Maximum yaw rate change per second (smooths yaw movements)',
  'ATC_THR_MIX_MAN': 'Attitude vs throttle priority in manual modes (0.1-0.9)',
  'ATC_THR_MIX_MAX': 'Maximum attitude priority - how much throttle can be used for leveling',
  'ATC_THR_MIX_MIN': 'Minimum attitude priority - ensures some throttle for leveling',

  // ===== AUTOTUNE =====
  'AUTOTUNE_AXES': 'Which axes to tune: 1=roll, 2=pitch, 4=yaw (add together for multiple)',
  'AUTOTUNE_AGGR': 'How aggressive the tune: 0.05=gentle/smooth, 0.10=aggressive/snappy',
  'AUTOTUNE_MIN_D': 'Minimum D gain to use during autotune (prevents too-low values)',

  // ===== BARO (Barometer/Altitude Sensor) =====
  'BARO_ALT_OFFSET': 'Altitude offset in meters (adjusts reported altitude)',
  'BARO_PRIMARY': 'Which barometer to use for altitude: 0=first, 1=second, etc.',
  'BARO_EXT_BUS': 'External barometer connection bus number (-1=disabled)',
  'BARO_GND_TEMP': 'Ground temperature in Celsius for altitude calculations',
  'BARO_FLTR_RNG': 'Barometer filter range - higher = more filtering, smoother altitude',

  // ===== BATT (Battery Monitor) =====
  'BATT_MONITOR': 'Battery monitor type: 0=none, 3=voltage only, 4=voltage and current',
  'BATT_VOLT_PIN': 'Analog pin number for voltage sensing',
  'BATT_CURR_PIN': 'Analog pin number for current sensing',
  'BATT_VOLT_MULT': 'Voltage calibration multiplier (adjust if voltage reads wrong)',
  'BATT_AMP_PERVLT': 'Current sensor calibration (amps per volt from sensor)',
  'BATT_AMP_OFFSET': 'Current sensor zero offset voltage',
  'BATT_CAPACITY': 'Total battery capacity in milliamp-hours (mAh)',
  'BATT_ARM_VOLT': 'Minimum voltage required to arm (0=disabled)',
  'BATT_ARM_MAH': 'Minimum remaining capacity to arm (0=disabled)',
  'BATT_CRT_VOLT': 'Critical voltage - triggers emergency landing',
  'BATT_CRT_MAH': 'Critical remaining capacity - triggers emergency landing',
  'BATT_LOW_VOLT': 'Low battery voltage warning threshold',
  'BATT_LOW_MAH': 'Low battery remaining capacity warning threshold',
  'BATT_LOW_TIMER': 'Seconds at low battery before failsafe activates',
  'BATT_FS_VOLTSRC': 'Voltage for failsafe: 0=raw voltage, 1=sag-compensated',
  'BATT_FS_LOW_ACT': 'Action when battery is low: 0=none, 1=land, 2=RTL',
  'BATT_FS_CRT_ACT': 'Action when battery is critical: 0=none, 1=land, 2=RTL',
  'BATT_SERIAL_NUM': 'Smart battery serial number (for DJI, Tattu smart batteries)',
  'BATT2_MONITOR': 'Second battery monitor type: 0=none, 3=voltage, 4=voltage+current',
  'BATT2_CAPACITY': 'Second battery capacity in milliamp-hours',
  'BATT2_VOLT_PIN': 'Second battery voltage sensing pin',
  'BATT2_CURR_PIN': 'Second battery current sensing pin',
  'BATT2_VOLT_MULT': 'Second battery voltage calibration multiplier',
  'BATT2_AMP_PERVLT': 'Second battery current sensor calibration',

  // ===== BRD (Board/Hardware Settings) =====
  'BRD_TYPE': 'Flight controller board type (auto-detected, rarely changed)',
  'BRD_CAN_ENABLE': 'Enable CAN bus for DroneCAN devices: 0=off, 1=on',
  'BRD_SAFETY_DEFLT': 'Safety switch default: 0=off at boot, 1=on at boot',
  'BRD_SAFETY_MASK': 'Which outputs ignore safety switch (channel bitmask)',
  'BRD_IMU_TARGTEMP': 'Target temperature for IMU heater (degrees C, 0=off)',
  'BRD_SERIAL_NUM': 'User-assigned board serial number',
  'BRD_SAFETYOPTION': 'Safety switch behavior options',
  'BRD_HEAT_TARG': 'Board heater target temperature in Celsius',
  'BRD_BOOT_DELAY': 'Delay at boot before starting (milliseconds)',
  'BRD_PWM_COUNT': 'Number of PWM outputs available',
  'BRD_SER1_RTSCTS': 'Serial port 1 hardware flow control: 0=off, 1=on',
  'BRD_SER2_RTSCTS': 'Serial port 2 hardware flow control: 0=off, 1=on',

  // ===== CAM (Camera Trigger) =====
  'CAM_TRIGG_TYPE': 'How to trigger camera: 0=servo, 1=relay, 2=GoPro, 3=gimbal, 4=MAVLink',
  'CAM_DURATION': 'How long to hold trigger (tenths of a second, e.g., 10 = 1 sec)',
  'CAM_SERVO_ON': 'Servo position when triggered (typically 1100-1900)',
  'CAM_SERVO_OFF': 'Servo position when not triggered (typically 1100-1900)',
  'CAM_TRIGG_DIST': 'Auto-trigger every X meters during missions (0=disabled)',
  'CAM_RELAY_ON': 'Relay state when triggered: 0=low, 1=high',
  'CAM_MIN_INTERVAL': 'Minimum time between triggers (milliseconds)',
  'CAM_MAX_ROLL': 'Maximum roll angle to allow triggering (degrees, 0=no limit)',
  'CAM_FEEDBACK_PIN': 'Pin for camera hotshoe feedback (-1=disabled)',
  'CAM_FEEDBACK_POL': 'Feedback pin polarity: 0=low-active, 1=high-active',

  // ===== CAN (CAN Bus for DroneCAN) =====
  'CAN_P1_DRIVER': 'CAN port 1 driver type (1=first driver, 2=second)',
  'CAN_P1_BITRATE': 'CAN port 1 speed in bits/second (typically 1000000)',
  'CAN_P2_DRIVER': 'CAN port 2 driver type',
  'CAN_D1_PROTOCOL': 'CAN driver 1 protocol: 1=DroneCAN, 4=PiccoloCAN',
  'CAN_D2_PROTOCOL': 'CAN driver 2 protocol',

  // ===== CHUTE (Emergency Parachute) =====
  'CHUTE_ENABLED': 'Enable parachute system: 0=disabled, 1=enabled',
  'CHUTE_TYPE': 'Release type: 10=servo, 20=relay',
  'CHUTE_SERVO_ON': 'Servo position to release parachute (typically 1100-1900)',
  'CHUTE_SERVO_OFF': 'Servo position when parachute is held (typically 1100-1900)',
  'CHUTE_ALT_MIN': 'Minimum altitude for deployment (meters)',
  'CHUTE_DELAY_MS': 'Delay after motors stop before deployment (milliseconds)',
  'CHUTE_CRT_SINK': 'Deploy if falling faster than this (meters/second)',

  // ===== CIRCLE (Circle Flight Mode) =====
  'CIRCLE_RADIUS': 'Radius of circle in meters (positive=clockwise)',
  'CIRCLE_RATE': 'Speed around circle in degrees per second',
  'CIRCLE_OPTIONS': 'Circle options: 0=default, 1=face center, etc.',

  // ===== COMPASS (Magnetometer) =====
  'COMPASS_AUTODEC': 'Auto-calculate magnetic declination from GPS: 0=off, 1=on',
  'COMPASS_DEC': 'Magnetic declination angle (auto-set if AUTODEC=1)',
  'COMPASS_LEARN': 'Learn compass offsets during flight: 0=off, 1=on',
  'COMPASS_USE': 'Use compass 1 for heading: 0=no, 1=yes',
  'COMPASS_USE2': 'Use compass 2 for heading: 0=no, 1=yes',
  'COMPASS_USE3': 'Use compass 3 for heading: 0=no, 1=yes',
  'COMPASS_ORIENT': 'Compass 1 mounting orientation (0=normal)',
  'COMPASS_ORIENT2': 'Compass 2 mounting orientation',
  'COMPASS_ORIENT3': 'Compass 3 mounting orientation',
  'COMPASS_EXTERNAL': 'Compass 1 is external (on GPS): 0=internal, 1=external',
  'COMPASS_EXTERNAL2': 'Compass 2 is external: 0=internal, 1=external',
  'COMPASS_EXTERNAL3': 'Compass 3 is external: 0=internal, 1=external',
  'COMPASS_OFS_X': 'Compass 1 X calibration offset (set by calibration)',
  'COMPASS_OFS_Y': 'Compass 1 Y calibration offset (set by calibration)',
  'COMPASS_OFS_Z': 'Compass 1 Z calibration offset (set by calibration)',
  'COMPASS_OFS2_X': 'Compass 2 X calibration offset',
  'COMPASS_OFS2_Y': 'Compass 2 Y calibration offset',
  'COMPASS_OFS2_Z': 'Compass 2 Z calibration offset',
  'COMPASS_OFS3_X': 'Compass 3 X calibration offset',
  'COMPASS_OFS3_Y': 'Compass 3 Y calibration offset',
  'COMPASS_OFS3_Z': 'Compass 3 Z calibration offset',
  'COMPASS_MOT_X': 'Compass correction for motor interference (X axis)',
  'COMPASS_MOT_Y': 'Compass correction for motor interference (Y axis)',
  'COMPASS_MOT_Z': 'Compass correction for motor interference (Z axis)',
  'COMPASS_MOTCT': 'Motor interference compensation: 0=disabled, 1=throttle, 2=current',
  'COMPASS_PRIMARY': 'Which compass to use as primary: 0=first, 1=second, 2=third',
  'COMPASS_CAL_FIT': 'Calibration quality threshold (lower = stricter)',

  // ===== EK2 (Navigation Filter v2 - estimates position/velocity from sensors) =====
  'EK2_ENABLE': 'Turn on older navigation filter (EKF2): 0=off, 1=on. Use EKF3 instead for new builds',
  'EK2_GPS_TYPE': 'How to use GPS speed data: 0=3D speed, 1=only horizontal, 2=only vertical, 3=none',
  'EK2_VELNE_M_NSE': 'Expected GPS horizontal speed error (m/s). Higher = trust GPS less',
  'EK2_VELD_M_NSE': 'Expected GPS vertical speed error (m/s). Higher = trust GPS less',
  'EK2_VEL_I_GATE': 'How much GPS speed can differ before being rejected (higher = more tolerant)',
  'EK2_POSNE_M_NSE': 'Expected GPS horizontal position error (meters). Higher = trust GPS less',
  'EK2_POS_I_GATE': 'How much GPS position can differ before being rejected (higher = more tolerant)',
  'EK2_GLITCH_RAD': 'Maximum GPS jump to accept (meters). Larger jumps are ignored as glitches',
  'EK2_ALT_SOURCE': 'Main altitude source: 0=barometer, 1=rangefinder, 2=GPS, 3=beacon',
  'EK2_ALT_M_NSE': 'Expected altitude measurement error (meters). Higher = trust altitude less',
  'EK2_HGT_I_GATE': 'How much altitude can differ before being rejected (higher = more tolerant)',
  'EK2_HGT_DELAY': 'Altitude sensor delay in milliseconds (for timing corrections)',
  'EK2_MAG_M_NSE': 'Expected compass error (Gauss). Higher = trust compass less',
  'EK2_MAG_CAL': 'When to calibrate compass: 0=never, 1=after first arm, 2=when flying, 3=always',
  'EK2_MAG_I_GATE': 'How much compass can differ before being rejected (higher = more tolerant)',
  'EK2_EAS_M_NSE': 'Expected airspeed sensor error (m/s). Higher = trust airspeed less',
  'EK2_EAS_I_GATE': 'How much airspeed can differ before being rejected (higher = more tolerant)',
  'EK2_RNG_M_NSE': 'Expected rangefinder/lidar error (meters). Higher = trust rangefinder less',
  'EK2_RNG_I_GATE': 'How much rangefinder can differ before being rejected (higher = more tolerant)',
  'EK2_MAX_FLOW': 'Maximum optical flow rate (rad/sec). Faster motion readings are rejected',
  'EK2_FLOW_M_NSE': 'Expected optical flow error. Higher = trust flow sensor less',
  'EK2_FLOW_I_GATE': 'How much flow can differ before being rejected (higher = more tolerant)',
  'EK2_FLOW_DELAY': 'Optical flow sensor delay in milliseconds (for timing corrections)',
  'EK2_GYRO_P_NSE': 'Expected gyro drift rate. Higher = allows more gyro correction over time',
  'EK2_ACC_P_NSE': 'Expected accelerometer drift. Higher = allows more accel correction over time',
  'EK2_GBIAS_P_NSE': 'How fast gyro bias can change. Higher = more responsive to gyro drift',
  'EK2_ABIAS_P_NSE': 'How fast accelerometer bias can change. Higher = more responsive to accel drift',
  'EK2_WIND_P_NSE': 'How fast wind estimate can change. Higher = more responsive to wind changes',
  'EK2_WIND_PSCALE': 'Wind estimation rate multiplier based on altitude',
  'EK2_GPS_CHECK': 'GPS checks before using it (add values: 1=satellites, 2=quality, 4=accuracy, etc.)',
  'EK2_IMU_MASK': 'Which motion sensors to use: 1=first only, 3=first two, 7=all three',
  'EK2_CHECK_SCALE': 'GPS check strictness multiplier (higher = stricter checks)',
  'EK2_NOAID_M_NSE': 'Position drift rate when GPS is lost (m/s). Lower = hold position better',
  'EK2_YAW_M_NSE': 'Expected heading/yaw error (radians). Higher = trust heading less',
  'EK2_YAW_I_GATE': 'How much yaw can differ before being rejected (higher = more tolerant)',
  'EK2_TAU_OUTPUT': 'Output smoothing (seconds). Higher = smoother but more delayed',
  'EK2_MAGE_P_NSE': 'How fast earth magnetic field estimate can change',
  'EK2_MAGB_P_NSE': 'How fast vehicle magnetic interference estimate can change',
  'EK2_RNG_USE_HGT': 'Use rangefinder for altitude (meters AGL, -1=never use)',
  'EK2_TERR_GRAD': 'Maximum ground slope to follow with rangefinder (0=flat only, 1=any slope)',
  'EK2_BCN_M_NSE': 'Expected indoor beacon error (meters). Higher = trust beacons less',
  'EK2_BCN_I_GTE': 'How much beacon position can differ before rejected (higher = more tolerant)',
  'EK2_BCN_DELAY': 'Indoor beacon sensor delay in milliseconds (for timing corrections)',

  // ===== EK3 (Navigation Filter v3 - newer, recommended) =====
  'EK3_ENABLE': 'Turn on newer navigation filter (EKF3): 0=off, 1=on. Recommended for all vehicles',
  'EK3_GPS_TYPE': 'How to use GPS speed data: 0=3D speed, 1=only horizontal, 2=only vertical, 3=none',
  'EK3_VELNE_M_NSE': 'Expected GPS horizontal speed error (m/s). Higher = trust GPS less',
  'EK3_VELD_M_NSE': 'Expected GPS vertical speed error (m/s). Higher = trust GPS less',
  'EK3_VEL_I_GATE': 'How much GPS speed can differ before being rejected (higher = more tolerant)',
  'EK3_POSNE_M_NSE': 'Expected GPS horizontal position error (meters). Higher = trust GPS less',
  'EK3_POS_I_GATE': 'How much GPS position can differ before being rejected (higher = more tolerant)',
  'EK3_GLITCH_RAD': 'Maximum GPS jump to accept (meters). Larger jumps are ignored as glitches',
  'EK3_ALT_SOURCE': 'Main altitude source: 0=barometer, 1=rangefinder, 2=GPS, 3=beacon',
  'EK3_ALT_M_NSE': 'Expected altitude measurement error (meters). Higher = trust altitude less',
  'EK3_HGT_I_GATE': 'How much altitude can differ before being rejected (higher = more tolerant)',
  'EK3_HGT_DELAY': 'Altitude sensor delay in milliseconds (for timing corrections)',
  'EK3_MAG_M_NSE': 'Expected compass error (Gauss). Higher = trust compass less',
  'EK3_MAG_CAL': 'When to calibrate compass: 0=never, 1=after first arm, 2=when flying, 3=always',
  'EK3_MAG_I_GATE': 'How much compass can differ before being rejected (higher = more tolerant)',
  'EK3_EAS_M_NSE': 'Expected airspeed sensor error (m/s). Higher = trust airspeed less',
  'EK3_EAS_I_GATE': 'How much airspeed can differ before being rejected (higher = more tolerant)',
  'EK3_RNG_M_NSE': 'Expected rangefinder/lidar error (meters). Higher = trust rangefinder less',
  'EK3_RNG_I_GATE': 'How much rangefinder can differ before being rejected (higher = more tolerant)',
  'EK3_MAX_FLOW': 'Maximum optical flow rate (rad/sec). Faster motion readings are rejected',
  'EK3_FLOW_M_NSE': 'Expected optical flow error. Higher = trust flow sensor less',
  'EK3_FLOW_I_GATE': 'How much flow can differ before being rejected (higher = more tolerant)',
  'EK3_FLOW_DELAY': 'Optical flow sensor delay in milliseconds (for timing corrections)',
  'EK3_GYRO_P_NSE': 'Expected gyro drift rate. Higher = allows more gyro correction over time',
  'EK3_ACC_P_NSE': 'Expected accelerometer drift. Higher = allows more accel correction over time',
  'EK3_GBIAS_P_NSE': 'How fast gyro bias can change. Higher = more responsive to gyro drift',
  'EK3_ABIAS_P_NSE': 'How fast accelerometer bias can change. Higher = more responsive to accel drift',
  'EK3_WIND_P_NSE': 'How fast wind estimate can change. Higher = more responsive to wind changes',
  'EK3_WIND_PSCALE': 'Wind estimation rate multiplier based on altitude',
  'EK3_GPS_CHECK': 'GPS checks before using it (add values: 1=satellites, 2=quality, 4=accuracy, etc.)',
  'EK3_IMU_MASK': 'Which motion sensors to use: 1=first only, 3=first two, 7=all three',
  'EK3_CHECK_SCALE': 'GPS check strictness multiplier (higher = stricter checks)',
  'EK3_NOAID_M_NSE': 'Position drift rate when GPS is lost (m/s). Lower = hold position better',
  'EK3_PRIMARY': 'Which navigation filter instance to use as primary: 0=first, 1=second',
  'EK3_LOG_LEVEL': 'How much navigation data to record: 0=minimal, 1=normal, 2=everything',
  'EK3_SRC1_POSXY': 'Horizontal position source: 0=none, 1=GPS, 2=beacon, 3=visual, 4=external',
  'EK3_SRC1_VELXY': 'Horizontal velocity source: 0=none, 1=GPS, 2=beacon, 3=visual, 4=external, 5=optical flow',
  'EK3_SRC1_POSZ': 'Vertical position source: 0=barometer, 1=rangefinder, 2=GPS, 3=beacon, 4=visual',
  'EK3_SRC1_VELZ': 'Vertical velocity source: 0=none, 1=GPS, 2=beacon, 3=visual, 4=external',
  'EK3_SRC1_YAW': 'Heading source: 0=compass, 1=GPS course, 2=GPS heading, 3=visual, 4=external',

  // ===== FENCE (Virtual Boundaries) =====
  'FENCE_ENABLE': 'Turn on virtual boundary protection: 0=off, 1=on',
  'FENCE_TYPE': 'Boundary types to use (add values: 1=max altitude, 2=circle, 4=polygon shape)',
  'FENCE_ACTION': 'What to do if boundary crossed: 0=nothing, 1=warn, 2=return home, 3=land',
  'FENCE_ALT_MAX': 'Maximum allowed altitude in meters (vehicle cannot fly higher)',
  'FENCE_RADIUS': 'Circle boundary radius in meters from home (vehicle cannot fly farther)',
  'FENCE_MARGIN': 'Warning distance before reaching boundary (meters)',
  'FENCE_TOTAL': 'Number of polygon boundary points (set automatically)',
  'FENCE_ALT_MIN': 'Minimum allowed altitude in meters (prevents flying too low)',
  'FENCE_RET_RALLY': 'Return to nearest rally point instead of home: 0=home, 1=rally',
  'FENCE_RET_ALT': 'Altitude to fly at when returning after boundary breach (meters)',
  'FENCE_AUTOENABLE': 'Auto-enable fence on takeoff: 0=manual only, 1=auto-enable',
  'FENCE_OPTIONS': 'Extra fence options (add values: 1=disable floor when disarmed)',

  // ===== FLOW (Optical Flow - camera-based position hold) =====
  'FLOW_TYPE': 'Optical flow sensor type: 0=none, 1=PX4Flow, 2=Pixart, 5=CXOF, etc.',
  'FLOW_FXSCALER': 'X-axis scale correction (adjust if position drifts left/right)',
  'FLOW_FYSCALER': 'Y-axis scale correction (adjust if position drifts forward/back)',
  'FLOW_ORIENT_YAW': 'Sensor rotation relative to vehicle in degrees (0, 90, 180, 270)',
  'FLOW_POS_X': 'Sensor position forward/back from center (meters, positive=forward)',
  'FLOW_POS_Y': 'Sensor position left/right from center (meters, positive=right)',
  'FLOW_POS_Z': 'Sensor position up/down from center (meters, positive=down)',
  'FLOW_ADDR': 'I2C address of sensor (usually auto-detected)',

  // ===== FLTMODE (Flight Mode Selection) =====
  'FLTMODE1': 'Flight mode for switch position 1 (0=Stabilize, 2=AltHold, 3=Auto, 5=Loiter, 6=RTL, etc.)',
  'FLTMODE2': 'Flight mode for switch position 2',
  'FLTMODE3': 'Flight mode for switch position 3',
  'FLTMODE4': 'Flight mode for switch position 4',
  'FLTMODE5': 'Flight mode for switch position 5',
  'FLTMODE6': 'Flight mode for switch position 6',
  'FLTMODE_CH': 'Radio channel for flight mode switch (usually channel 5 or 8)',
  'FLTMODE_GCSBLOCK': 'Block ground station from changing flight mode: 0=allow, 1=block',

  // ===== FS (Failsafe - automatic emergency actions) =====
  'FS_BATT_ENABLE': 'Battery failsafe: 0=disabled, 1=land, 2=return home',
  'FS_BATT_MAH': 'Battery failsafe remaining capacity threshold (mAh = milliamp-hours)',
  'FS_BATT_VOLTAGE': 'Battery failsafe voltage threshold (e.g., 10.5V for 3S battery)',
  'FS_EKF_ACTION': 'Navigation failure action: 0=nothing, 1=land, 2=altitude hold, 3=land even from AltHold',
  'FS_EKF_THRESH': 'Navigation failure sensitivity (0.6-1.0, lower = more sensitive)',
  'FS_GCS_ENABLE': 'Ground station connection lost: 0=nothing, 1=return home, 2=continue mission, 3=land',
  'FS_GCS_TIMEOUT': 'Seconds without ground station before failsafe (usually 5-30)',
  'FS_THR_ENABLE': 'Radio signal lost: 0=nothing, 1=return home, 2=continue, 3=land, 4=land even in stabilize',
  'FS_THR_VALUE': 'Throttle value that indicates radio lost (usually 900-975)',
  'FS_CRASH_CHECK': 'Detect crashes and disarm: 0=disabled, 1=enabled',
  'FS_OPTIONS': 'Extra failsafe options (add values: 1=continue if in auto mode)',
  'FS_DR_ENABLE': 'GPS lost failsafe: 0=nothing, 1=land after timeout',
  'FS_DR_TIMEOUT': 'Seconds without GPS before land failsafe (usually 30-60)',

  // ===== GCS (Ground Control Station) =====
  'GCS_PID_MASK': 'Send tuning data to ground station (add values: 1=roll, 2=pitch, 4=yaw, 8=accel)',

  // ===== GPS =====
  'GPS_TYPE': 'GPS type: 0=none, 1=auto, 2=uBlox, 5=NMEA, 9=SBF, etc.',
  'GPS_TYPE2': 'Second GPS type (for dual GPS setups)',
  'GPS_NAVFILTER': 'GPS mode: 0=portable, 2=stationary, 3=pedestrian, 4=car, 5=sea, 6=air<1g, 7=air<2g, 8=air<4g',
  'GPS_AUTO_SWITCH': 'Switch GPSs automatically: 0=use primary only, 1=auto-switch on failure, 2=blend both',
  'GPS_MIN_DGPS': 'Minimum satellites needed for differential GPS corrections',
  'GPS_SBAS_MODE': 'Use SBAS (satellite-based augmentation): 0=off, 1=on (improves accuracy)',
  'GPS_INJECT_TO': 'Send RTK corrections to: 0=all GPSs, 1=first only, 2=second only',
  'GPS_SBP_LOGMASK': 'Swift GPS logging options (for debugging)',
  'GPS_RAW_DATA': 'Log raw GPS data for post-processing: 0=off, 1=on',
  'GPS_GNSS_MODE': 'Satellite systems to use: 0=default, or add: 1=GPS, 2=SBAS, 4=Galileo, 8=BeiDou, etc.',
  'GPS_SAVE_CFG': 'Save GPS config permanently: 0=every boot, 1=save once, 2=never configure',
  'GPS_AUTO_CONFIG': 'Auto-configure GPS on startup: 0=off, 1=on (recommended)',
  'GPS_RATE_MS': 'GPS update rate in milliseconds (100=10Hz, 200=5Hz)',
  'GPS_RATE_MS2': 'Second GPS update rate in milliseconds',
  'GPS_POS1_X': 'GPS antenna position forward/back (meters from center, positive=forward)',
  'GPS_POS1_Y': 'GPS antenna position left/right (meters from center, positive=right)',
  'GPS_POS1_Z': 'GPS antenna position up/down (meters from center, positive=down)',
  'GPS_POS2_X': 'Second GPS antenna forward/back position',
  'GPS_POS2_Y': 'Second GPS antenna left/right position',
  'GPS_POS2_Z': 'Second GPS antenna up/down position',
  'GPS_DELAY_MS': 'GPS signal delay compensation (milliseconds)',
  'GPS_DELAY_MS2': 'Second GPS signal delay compensation',
  'GPS_BLEND_MASK': 'Which GPSs to blend: 1=first, 2=second, 3=both',
  'GPS_BLEND_TC': 'GPS blending time constant (seconds, higher = smoother switching)',
  'GPS_DRV_OPTIONS': 'GPS driver options (advanced, usually leave at 0)',
  'GPS_COM_PORT': 'Which serial port for GPS (-1=auto)',
  'GPS_COM_PORT2': 'Which serial port for second GPS',
  'GPS_PRIMARY': 'Which GPS to prefer: 0=auto-select best, 1=always use first, 2=always use second',
  'GPS_CAN_NODEID1': 'DroneCAN GPS 1 node ID (for CAN-connected GPS)',
  'GPS_CAN_NODEID2': 'DroneCAN GPS 2 node ID',
  'GPS_MB1_TYPE': 'Moving baseline type for GPS 1 (for RTK heading)',
  'GPS_MB2_TYPE': 'Moving baseline type for GPS 2',

  // ===== INS (Motion Sensors - gyros and accelerometers) =====
  'INS_PRODUCT_ID': 'Motion sensor product ID (auto-detected)',
  'INS_GYROFFS_X': 'Gyro 1 X-axis calibration offset (set during calibration)',
  'INS_GYROFFS_Y': 'Gyro 1 Y-axis calibration offset (set during calibration)',
  'INS_GYROFFS_Z': 'Gyro 1 Z-axis calibration offset (set during calibration)',
  'INS_GYR2OFFS_X': 'Gyro 2 X-axis calibration offset',
  'INS_GYR2OFFS_Y': 'Gyro 2 Y-axis calibration offset',
  'INS_GYR2OFFS_Z': 'Gyro 2 Z-axis calibration offset',
  'INS_GYR3OFFS_X': 'Gyro 3 X-axis calibration offset',
  'INS_GYR3OFFS_Y': 'Gyro 3 Y-axis calibration offset',
  'INS_GYR3OFFS_Z': 'Gyro 3 Z-axis calibration offset',
  'INS_ACCSCAL_X': 'Accelerometer 1 X-axis scale factor (set during calibration)',
  'INS_ACCSCAL_Y': 'Accelerometer 1 Y-axis scale factor (set during calibration)',
  'INS_ACCSCAL_Z': 'Accelerometer 1 Z-axis scale factor (set during calibration)',
  'INS_ACCOFFS_X': 'Accelerometer 1 X-axis offset (set during calibration)',
  'INS_ACCOFFS_Y': 'Accelerometer 1 Y-axis offset (set during calibration)',
  'INS_ACCOFFS_Z': 'Accelerometer 1 Z-axis offset (set during calibration)',
  'INS_ACC2SCAL_X': 'Accelerometer 2 X-axis scale factor',
  'INS_ACC2SCAL_Y': 'Accelerometer 2 Y-axis scale factor',
  'INS_ACC2SCAL_Z': 'Accelerometer 2 Z-axis scale factor',
  'INS_ACC2OFFS_X': 'Accelerometer 2 X-axis offset',
  'INS_ACC2OFFS_Y': 'Accelerometer 2 Y-axis offset',
  'INS_ACC2OFFS_Z': 'Accelerometer 2 Z-axis offset',
  'INS_ACC3SCAL_X': 'Accelerometer 3 X-axis scale factor',
  'INS_ACC3SCAL_Y': 'Accelerometer 3 Y-axis scale factor',
  'INS_ACC3SCAL_Z': 'Accelerometer 3 Z-axis scale factor',
  'INS_ACC3OFFS_X': 'Accelerometer 3 X-axis offset',
  'INS_ACC3OFFS_Y': 'Accelerometer 3 Y-axis offset',
  'INS_ACC3OFFS_Z': 'Accelerometer 3 Z-axis offset',
  'INS_GYRO_FILTER': 'Gyro noise filter (Hz). Lower = smoother but more lag. Default 20Hz',
  'INS_ACCEL_FILTER': 'Accelerometer noise filter (Hz). Lower = smoother but more lag. Default 20Hz',
  'INS_USE': 'Use first motion sensor: 0=disabled, 1=enabled',
  'INS_USE2': 'Use second motion sensor: 0=disabled, 1=enabled',
  'INS_USE3': 'Use third motion sensor: 0=disabled, 1=enabled',
  'INS_STILL_THRESH': 'Motion threshold for "vehicle is still" detection during calibration',
  'INS_GYR_CAL': 'Gyro calibration at boot: 0=never, 1=only at power-on, 2=first arm',
  'INS_TRIM_OPTION': 'Accelerometer leveling: 0=never, 1=after first arm, 2=always',
  'INS_ACC_BODYFIX': 'Apply accelerometer offset in vehicle frame: 0=sensor frame, 1=body frame',
  'INS_POS1_X': 'Motion sensor 1 forward/back position (meters from center)',
  'INS_POS1_Y': 'Motion sensor 1 left/right position (meters from center)',
  'INS_POS1_Z': 'Motion sensor 1 up/down position (meters from center)',
  'INS_POS2_X': 'Motion sensor 2 forward/back position',
  'INS_POS2_Y': 'Motion sensor 2 left/right position',
  'INS_POS2_Z': 'Motion sensor 2 up/down position',
  'INS_POS3_X': 'Motion sensor 3 forward/back position',
  'INS_POS3_Y': 'Motion sensor 3 left/right position',
  'INS_POS3_Z': 'Motion sensor 3 up/down position',
  'INS_GYR_ID': 'Gyro 1 hardware ID (auto-detected)',
  'INS_GYR2_ID': 'Gyro 2 hardware ID (auto-detected)',
  'INS_GYR3_ID': 'Gyro 3 hardware ID (auto-detected)',
  'INS_ACC_ID': 'Accelerometer 1 hardware ID (auto-detected)',
  'INS_ACC2_ID': 'Accelerometer 2 hardware ID (auto-detected)',
  'INS_ACC3_ID': 'Accelerometer 3 hardware ID (auto-detected)',
  'INS_FAST_SAMPLE': 'Use fast sensor sampling for smoother flight: 0=off, 1=on (recommended)',
  'INS_ENABLE_MASK': 'Which motion sensors to enable: 1=first, 3=first two, 7=all three',
  'INS_GYRO_RATE': 'Gyro sampling rate: 0=1kHz, 1=2kHz, 2=4kHz, 3=8kHz (higher = smoother)',
  'INS_HNTCH_ENABLE': 'Enable motor vibration filter (removes propeller noise): 0=off, 1=on',
  'INS_HNTCH_FREQ': 'Base frequency to filter (Hz). Usually motor RPM / 60',
  'INS_HNTCH_BW': 'Filter width in Hz. Wider = more noise removed but may affect response',
  'INS_HNTCH_ATT': 'How much to reduce vibration (dB). Higher = more aggressive filtering',
  'INS_HNTCH_REF': 'Reference throttle or RPM for frequency tracking',
  'INS_HNTCH_MODE': 'How filter tracks frequency: 0=fixed, 1=throttle, 2=RPM, 3=ESC, 4=FFT',
  'INS_HNTCH_OPTS': 'Filter options (add values: 1=double notch, 2=dynamic, 4=enable on all axes)',
  'INS_HNTCH_HMNCS': 'Which harmonics to filter (add values: 1=1st, 2=2nd, 4=3rd, etc.)',
  'INS_HNTCH_FM_RAT': 'Minimum frequency multiplier (filter tracks down to this × reference)',
  'INS_NOTCH_ENABLE': 'Enable fixed frequency vibration filter: 0=off, 1=on',
  'INS_NOTCH_FREQ': 'Fixed vibration frequency to filter (Hz)',
  'INS_NOTCH_BW': 'Fixed filter width in Hz',
  'INS_NOTCH_ATT': 'Fixed filter strength (dB)',
  'INS_LOG_BAT_CNT': 'How many samples per batch for detailed vibration logging',
  'INS_LOG_BAT_MASK': 'Which sensors to log (add values: 1=first, 2=second, 4=third)',
  'INS_LOG_BAT_OPT': 'Batch logging options (add values: 1=pre-filter, 2=post-filter)',
  'INS_LOG_BAT_LGIN': 'Start batch logging at boot: 0=no, 1=yes',
  'INS_LOG_BAT_LGCT': 'Number of batches to log (0=continuous)',

  // ===== LAND (Landing Settings) =====
  'LAND_SPEED': 'Final descent speed when landing (cm/s, e.g., 50 = 0.5 m/s)',
  'LAND_SPEED_HIGH': 'Descent speed above LAND_ALT_LOW (cm/s). Faster initial descent',
  'LAND_ALT_LOW': 'Altitude to switch to slow descent (meters above ground)',
  'LAND_REPOSITION': 'Allow repositioning during landing: 0=no, 1=yes',

  // ===== LOG (Data Recording) =====
  'LOG_BACKEND_TYPE': 'Where to save logs: 0=none, 1=SD card, 2=MAVLink, 3=both',
  'LOG_FILE_BUFSIZE': 'Log file memory buffer size (KB). Larger = handles more data',
  'LOG_DISARMED': 'Log data while disarmed (for debugging): 0=no, 1=yes',
  'LOG_REPLAY': 'Enable log replay mode (for developers): 0=no, 1=yes',
  'LOG_FILE_DSRMROT': 'Create new log file when disarming: 0=same file, 1=new file',
  'LOG_FILE_TIMEOUT': 'Seconds before closing log file when idle',
  'LOG_FILE_RATEMAX': 'Maximum log write rate (KB/s). Prevents SD card overload',
  'LOG_MAV_BUFSIZE': 'MAVLink log streaming buffer size (KB)',
  'LOG_BITMASK': 'What to log (add values: 1=attitudes, 2=GPS, 4=sensors, 8=RC, etc.)',

  // ===== LOIT (Loiter/Position Hold Mode) =====
  'LOIT_SPEED': 'Maximum horizontal speed in loiter (cm/s, e.g., 1250 = 12.5 m/s)',
  'LOIT_ACC_MAX': 'Maximum acceleration in loiter (cm/s², e.g., 500 = 5 m/s²)',
  'LOIT_BRK_ACCEL': 'Braking strength when stick released (cm/s²)',
  'LOIT_BRK_DELAY': 'Delay before braking starts (seconds)',
  'LOIT_BRK_JERK': 'How quickly braking force builds up (higher = snappier)',
  'LOIT_ANG_MAX': 'Maximum lean angle in loiter (degrees × 100, e.g., 2000 = 20°)',

  // ===== MIS (Mission/Auto Mode) =====
  'MIS_RESTART': 'Mission behavior when entering Auto mode: 0=resume, 1=restart',
  'MIS_TOTAL': 'Total waypoints stored (set automatically when uploading mission)',
  'MIS_OPTIONS': 'Mission options (add values: 1=clear mission on boot)',

  // ===== MNT (Camera Gimbal) =====
  'MNT_TYPE': 'Gimbal type: 0=none, 1=servo, 2=MAVLink, 3=Alexmos, 4=SToRM32, etc.',
  'MNT_DEFLT_MODE': 'Default aiming mode: 0=retracted, 1=neutral, 2=point at location, 3=RC control',
  'MNT_RC_IN_TILT': 'Radio channel for manual tilt control (0=disabled)',
  'MNT_RC_IN_ROLL': 'Radio channel for manual roll control (0=disabled)',
  'MNT_RC_IN_PAN': 'Radio channel for manual pan control (0=disabled)',
  'MNT_ANGMIN_TIL': 'Minimum tilt angle in degrees × 100 (e.g., -4500 = -45° down)',
  'MNT_ANGMAX_TIL': 'Maximum tilt angle in degrees × 100 (e.g., 4500 = +45° up)',
  'MNT_ANGMIN_ROL': 'Minimum roll angle in degrees × 100',
  'MNT_ANGMAX_ROL': 'Maximum roll angle in degrees × 100',
  'MNT_ANGMIN_PAN': 'Minimum pan angle in degrees × 100 (e.g., -18000 = -180°)',
  'MNT_ANGMAX_PAN': 'Maximum pan angle in degrees × 100',
  'MNT_STAB_TILT': 'Stabilize tilt against vehicle movement: 0=off, 1=on',
  'MNT_STAB_ROLL': 'Stabilize roll against vehicle movement: 0=off, 1=on',
  'MNT_STAB_PAN': 'Stabilize pan against vehicle heading: 0=off, 1=on',
  'MNT_LEAD_RLL': 'Lead compensation for roll stabilization (degrees)',
  'MNT_LEAD_PTCH': 'Lead compensation for pitch stabilization (degrees)',

  // ===== MOT (Motor Settings) =====
  'MOT_SPIN_ARM': 'Motor spin level when armed but not flying (0.0-0.3, e.g., 0.1 = 10%)',
  'MOT_SPIN_MIN': 'Minimum motor spin when flying (0.0-0.5, e.g., 0.15 = 15%)',
  'MOT_SPIN_MAX': 'Maximum motor output limit (0.8-1.0, e.g., 0.95 = 95%)',
  'MOT_BAT_VOLT_MAX': 'Battery voltage at full charge (for motor scaling). E.g., 12.6V for 3S',
  'MOT_BAT_VOLT_MIN': 'Battery voltage when depleted (for motor scaling). E.g., 10.5V for 3S',
  'MOT_BAT_CURR_MAX': 'Maximum current draw (amps). Used for motor output limiting',
  'MOT_BAT_IDX': 'Which battery monitor to use for motor scaling: 0=first, 1=second',
  'MOT_PWM_TYPE': 'Motor signal type: 0=normal PWM, 4=DShot150, 5=DShot300, 6=DShot600',
  'MOT_PWM_MIN': 'Minimum motor signal (microseconds, typically 1000 for PWM)',
  'MOT_PWM_MAX': 'Maximum motor signal (microseconds, typically 2000 for PWM)',
  'MOT_SAFE_DISARM': 'Safe disarm behavior: 0=motors spin down, 1=motors stop immediately',
  'MOT_YAW_HEADROOM': 'Reserved motor headroom for yaw control (0-500, e.g., 200 = 20%)',
  'MOT_THST_EXPO': 'Thrust curve linearization (0.0=linear, 0.5-0.8 typical for most motors)',
  'MOT_THST_HOVER': 'Throttle needed to hover (0.0-1.0, e.g., 0.35 = 35%). Auto-learned if enabled',
  'MOT_HOVER_LEARN': 'Learn hover throttle automatically: 0=disabled, 1=learn only, 2=learn and save',
  'MOT_BOOST_SCALE': 'Motor boost for better attitude control (0=disabled, 0.5-1.5 typical)',
  'MOT_SPOOL_TIME': 'Time for motors to spin up to full speed (seconds, e.g., 0.5)',
  'MOT_SLEW_UP_TIME': 'Maximum time for throttle to go from 0 to 100% (seconds)',
  'MOT_SLEW_DN_TIME': 'Maximum time for throttle to go from 100% to 0 (seconds)',

  // ===== NTF (Notifications - LED and Buzzer) =====
  'NTF_LED_BRIGHT': 'LED brightness: 0=off, 1=low, 2=medium, 3=high',
  'NTF_LED_LEN': 'Number of LEDs in addressable LED strip',
  'NTF_LED_OVERRIDE': 'LED override pattern (0=normal, 1-255=special patterns)',
  'NTF_DISPLAY_TYPE': 'External display type: 0=none, 1=SSD1306, 2=SH1106, etc.',
  'NTF_OREO_THEME': 'OreoLED color theme: 0=off, 1=aircraft, 2=automobile',
  'NTF_BUZZ_ENABLE': 'Enable buzzer for warnings: 0=off, 1=on',
  'NTF_BUZZ_PIN': 'Buzzer output pin (-1=auto, 0=disabled)',
  'NTF_BUZZ_ON_LVL': 'Buzzer active level: 0=active low, 1=active high',
  'NTF_BUZZ_VOLUME': 'Buzzer volume: 0-100',
  'NTF_LED_TYPES': 'LED types enabled (add values: 1=built-in, 2=external, 4=NeoPixel, etc.)',

  // ===== OSD (On-Screen Display) =====
  'OSD_TYPE': 'OSD type: 0=none, 1=MAX7456 (analog), 2=MSP, 3=DJI, 4=MSP_DisplayPort',
  'OSD_CHAN': 'Radio channel to control OSD pages (0=disabled)',
  'OSD_OPTIONS': 'OSD options (add values: 1=show GPS if unhealthy, 2=show compass cal)',
  'OSD_FONT': 'OSD font: 0=default, 1=clarity, 2=betaflight, 3=bold, 4=digital',
  'OSD_V_OFFSET': 'Vertical position offset (pixels)',
  'OSD_H_OFFSET': 'Horizontal position offset (pixels)',
  'OSD_W_RSSI': 'Warn when radio signal (RSSI) below this % (0=disable)',
  'OSD_W_NSAT': 'Warn when GPS satellites below this count (0=disable)',
  'OSD_W_BATVOLT': 'Warn when battery voltage below this (0=use BATT_LOW_VOLT)',
  'OSD_UNITS': 'Display units: 0=metric (m, km/h), 1=imperial (ft, mph), 2=aviation (ft, knots)',
  'OSD_MSG_TIME': 'How long to show OSD messages (seconds)',
  'OSD_ARM_SCR': 'Show arming screen for this many seconds (0=disabled)',
  'OSD_DSBL_SCR': 'Show disarm screen for this many seconds (0=disabled)',

  // ===== PILOT (Pilot Input Settings) =====
  'PILOT_THR_FILT': 'Throttle stick smoothing (Hz). Lower = smoother but laggy. Default 0 (off)',
  'PILOT_TKOFF_ALT': 'Take Off mode target altitude in meters (e.g., 2.5)',
  'PILOT_TKOFF_DZ': 'Throttle deadzone for takeoff detection (% of stick, e.g., 10)',
  'PILOT_THR_BHV': 'Throttle behavior: 0=feedback from mid, 1=high deadband, 2=low deadband',
  'PILOT_ACCEL_Z': 'Maximum climb/descent rate change (cm/s². Higher = snappier response)',
  'PILOT_SPEED_UP': 'Maximum climb speed (cm/s, e.g., 250 = 2.5 m/s)',
  'PILOT_SPEED_DN': 'Maximum descent speed (cm/s, e.g., 150 = 1.5 m/s)',
  'PILOT_Y_RATE': 'Maximum yaw rotation rate (degrees/sec, e.g., 200)',
  'PILOT_Y_RATE_TC': 'Yaw rate smoothing (seconds). Higher = slower yaw response',
  'PILOT_Y_EXPO': 'Yaw stick expo (0-1). Higher = more sensitive near center',

  // ===== PLND (Precision Landing using IR beacons or visual targets) =====
  'PLND_ENABLED': 'Enable precision landing: 0=disabled, 1=enabled',
  'PLND_TYPE': 'Sensor type: 0=none, 1=IR-Lock, 2=companion computer, 3=scripting',
  'PLND_EST_TYPE': 'Position estimator: 0=raw sensor, 1=Kalman filter (smoother)',
  'PLND_LAG': 'Sensor delay compensation (milliseconds)',
  'PLND_LAND_OFS_X': 'Landing target X offset from sensor (cm)',
  'PLND_LAND_OFS_Y': 'Landing target Y offset from sensor (cm)',
  'PLND_CAM_POS_X': 'Sensor forward/back from center (meters, positive=forward)',
  'PLND_CAM_POS_Y': 'Sensor left/right from center (meters, positive=right)',
  'PLND_CAM_POS_Z': 'Sensor up/down from center (meters, positive=down)',
  'PLND_BUS': 'I2C bus for sensor (-1=disabled)',
  'PLND_TIMEOUT': 'Maximum time without detection before aborting (seconds)',
  'PLND_STRICT': 'Require valid target to land: 0=land anyway, 1=strict (must see target)',
  'PLND_RET_BEHAVE': 'Retry behavior: 0=continue if target lost, 1=retry approach',
  'PLND_ORIENT': 'Sensor pointing direction: 0=down, 4=forward',
  'PLND_OPTIONS': 'Precision landing options (advanced)',

  // ===== PRX (Proximity/Obstacle Sensors) =====
  'PRX_TYPE': 'Proximity sensor type: 0=none, 1=Rangefinder, 2=MAVLink, 4=TeraRanger, etc.',
  'PRX_ORIENT': 'Sensor orientation: 0=forward, 2=up, 4=backward, 6=left, 8=right, 25=down',
  'PRX_YAW_CORR': 'Yaw correction for sensor facing (degrees)',
  'PRX_IGN_ANG1': 'First direction to ignore obstacles (degrees from forward)',
  'PRX_IGN_WID1': 'Width of first ignore zone (degrees)',
  'PRX_IGN_ANG2': 'Second direction to ignore obstacles (degrees)',
  'PRX_IGN_WID2': 'Width of second ignore zone (degrees)',
  'PRX_IGN_ANG3': 'Third direction to ignore obstacles (degrees)',
  'PRX_IGN_WID3': 'Width of third ignore zone (degrees)',
  'PRX_IGN_ANG4': 'Fourth direction to ignore obstacles (degrees)',
  'PRX_IGN_WID4': 'Width of fourth ignore zone (degrees)',
  'PRX_LOG_RAW': 'Log raw proximity data: 0=no, 1=yes (uses more storage)',
  'PRX_FILT': 'Distance filter smoothing (Hz). Lower = smoother',
  'PRX_MIN': 'Minimum valid distance reading (meters)',
  'PRX_MAX': 'Maximum valid distance reading (meters)',

  // ===== PSC (Position/Speed Controller Tuning) =====
  'PSC_POSXY_P': 'Horizontal position hold strength. Higher = tighter position hold',
  'PSC_VELXY_P': 'Horizontal velocity P - main responsiveness to position errors',
  'PSC_VELXY_I': 'Horizontal velocity I - corrects steady drift over time',
  'PSC_VELXY_D': 'Horizontal velocity D - dampens overshoots',
  'PSC_VELXY_IMAX': 'Maximum horizontal I correction (prevents windup)',
  'PSC_VELXY_FLTE': 'Horizontal error filter (Hz). Lower = smoother',
  'PSC_VELXY_FLTD': 'Horizontal D filter (Hz). Lower = smoother',
  'PSC_VELXY_FF': 'Horizontal feedforward - improves tracking during movement',
  'PSC_POSZ_P': 'Altitude hold strength. Higher = tighter altitude hold',
  'PSC_VELZ_P': 'Vertical velocity P - responsiveness to altitude errors',
  'PSC_ACCZ_P': 'Vertical acceleration P - throttle response strength',
  'PSC_ACCZ_I': 'Vertical acceleration I - corrects steady altitude drift',
  'PSC_ACCZ_D': 'Vertical acceleration D - dampens altitude oscillations',
  'PSC_ACCZ_IMAX': 'Maximum vertical I correction (prevents windup)',
  'PSC_ACCZ_FLTE': 'Vertical error filter (Hz). Lower = smoother',
  'PSC_ACCZ_FLTD': 'Vertical D filter (Hz). Lower = smoother',
  'PSC_ACCZ_FF': 'Vertical feedforward - improves climb/descent response',
  'PSC_JERK_XY': 'Horizontal jerk limit (m/s³). Lower = smoother but slower response',
  'PSC_JERK_Z': 'Vertical jerk limit (m/s³). Lower = smoother but slower response',
  'PSC_ANGLE_MAX': 'Maximum lean angle for position control (degrees × 100)',

  // ===== RALLY (Alternate Landing Sites) =====
  'RALLY_LIMIT_KM': 'Maximum distance to rally point (km). Beyond this, use home instead',
  'RALLY_INCL_HOME': 'Treat home as a rally point: 0=no, 1=yes',
  'RALLY_TOTAL': 'Number of rally points stored (set automatically)',

  // ===== RC (Radio Channel Mapping) =====
  'RCMAP_ROLL': 'Radio channel for roll control (typically 1)',
  'RCMAP_PITCH': 'Radio channel for pitch control (typically 2)',
  'RCMAP_THROTTLE': 'Radio channel for throttle (typically 3)',
  'RCMAP_YAW': 'Radio channel for yaw/rudder (typically 4)',

  // ===== RELAY (On/Off Switches) =====
  'RELAY_PIN': 'Output pin for relay 1 (-1=disabled)',
  'RELAY_PIN2': 'Output pin for relay 2 (-1=disabled)',
  'RELAY_PIN3': 'Output pin for relay 3 (-1=disabled)',
  'RELAY_PIN4': 'Output pin for relay 4 (-1=disabled)',
  'RELAY_PIN5': 'Output pin for relay 5 (-1=disabled)',
  'RELAY_PIN6': 'Output pin for relay 6 (-1=disabled)',
  'RELAY_DEFAULT': 'Relay default state at boot: 0=off, 1=on',

  // ===== RNGFND (Rangefinder/Lidar for Altitude) =====
  'RNGFND1_TYPE': 'Rangefinder type: 0=none, 1=analog, 2=MaxSonar, 5=PWM, 9=Benewake, 10=LightWare, etc.',
  'RNGFND1_MIN_CM': 'Minimum valid reading (cm). Readings below this are ignored',
  'RNGFND1_MAX_CM': 'Maximum valid reading (cm). Readings above this are ignored',
  'RNGFND1_GNDCLEAR': 'Ground clearance when landed (cm). Offset for height above ground',
  'RNGFND1_ORIENT': 'Sensor direction: 0=forward, 25=down (most common)',
  'RNGFND1_POS_X': 'Sensor forward/back from center (meters)',
  'RNGFND1_POS_Y': 'Sensor left/right from center (meters)',
  'RNGFND1_POS_Z': 'Sensor up/down from center (meters)',
  'RNGFND1_ADDR': 'I2C address for digital rangefinders',
  'RNGFND1_PIN': 'Analog input pin for analog rangefinders',
  'RNGFND1_SCALING': 'Analog voltage to distance conversion factor',
  'RNGFND1_OFFSET': 'Distance offset for calibration (meters)',
  'RNGFND1_FUNCTION': 'Function: 0=disabled, 1=altitude control',
  'RNGFND1_RMETRIC': 'Ratiometric scaling: 0=absolute, 1=ratiometric',
  'RNGFND_LANDING': 'Use rangefinder during landing: 0=no, 1=yes',
  'RNGFND_GAIN': 'Rangefinder usage gain (higher = more influence on altitude)',

  // ===== RSSI (Radio Signal Strength) =====
  'RSSI_TYPE': 'RSSI source: 0=disabled, 1=analog pin, 2=RC channel, 3=receiver protocol, 4=PWM pin',
  'RSSI_ANA_PIN': 'Analog pin number for RSSI (-1=disabled)',
  'RSSI_PIN_LOW': 'Voltage when signal is 0% (typically 0.0)',
  'RSSI_PIN_HIGH': 'Voltage when signal is 100% (typically 3.3 or 5.0)',
  'RSSI_CHANNEL': 'Radio channel carrying RSSI value (0=disabled)',
  'RSSI_CHAN_LOW': 'PWM value representing 0% signal (typically 1000)',
  'RSSI_CHAN_HIGH': 'PWM value representing 100% signal (typically 2000)',

  // ===== RTL (Return to Launch/Home) =====
  'RTL_ALT': 'Return altitude (cm). 0=maintain current altitude. E.g., 1500 = 15m',
  'RTL_CONE_SLOPE': 'Descend toward home: 0=hold altitude until over home, 1-10=glide slope',
  'RTL_SPEED': 'Return speed (cm/s). 0=use WPNAV_SPEED. E.g., 500 = 5 m/s',
  'RTL_ALT_FINAL': 'Final altitude after reaching home (cm). 0=land, else hover at this height',
  'RTL_CLIMB_MIN': 'Minimum climb before returning (cm). E.g., 100 = climb at least 1m first',
  'RTL_LOIT_TIME': 'Loiter time over home before landing (ms). E.g., 5000 = 5 seconds',
  'RTL_OPTIONS': 'RTL options (add values: 2=ignore pilot yaw, 4=continue mission)',

  // ===== SCHED (Task Scheduler) =====
  'SCHED_DEBUG': 'Scheduler debug level: 0=none, 2=show slow tasks',
  'SCHED_LOOP_RATE': 'Main control loop rate (Hz). Usually 400 for copters',
  'SCHED_OPTIONS': 'Scheduler options (advanced)',

  // ===== SERIAL (Serial Port Configuration) =====
  'SERIAL0_PROTOCOL': 'USB port protocol: 1=MAVLink1, 2=MAVLink2, etc.',
  'SERIAL0_BAUD': 'USB baud rate: 57=57600, 115=115200, etc.',
  'SERIAL1_PROTOCOL': 'TELEM1 port protocol: 1=MAVLink, 2=GPS, 5=RC input, etc.',
  'SERIAL1_BAUD': 'TELEM1 baud rate',
  'SERIAL2_PROTOCOL': 'TELEM2 port protocol',
  'SERIAL2_BAUD': 'TELEM2 baud rate',
  'SERIAL3_PROTOCOL': 'GPS port protocol (usually 5 for GPS)',
  'SERIAL3_BAUD': 'GPS port baud rate',
  'SERIAL4_PROTOCOL': 'Serial 4 protocol',
  'SERIAL4_BAUD': 'Serial 4 baud rate',
  'SERIAL5_PROTOCOL': 'Serial 5 protocol',
  'SERIAL5_BAUD': 'Serial 5 baud rate',
  'SERIAL6_PROTOCOL': 'Serial 6 protocol',
  'SERIAL6_BAUD': 'Serial 6 baud rate',
  'SERIAL7_PROTOCOL': 'Serial 7 protocol',
  'SERIAL7_BAUD': 'Serial 7 baud rate',

  // ===== SERVO (Motor/Servo Output Settings) =====
  'SERVO_RATE': 'Servo update rate (Hz). Usually 50 for servos, 400 for ESCs',
  'SERVO_DSHOT_RATE': 'DShot update rate: 0=loop rate, 1=1kHz, 2=2kHz, etc.',
  'SERVO_DSHOT_ESC': 'DShot ESC type: 0=disabled, 1=BLHeli32, 2=KiSS, 3=APD',
  'SERVO_GPIO_MASK': 'Which outputs to use as GPIO instead of servo (pin mask)',
  'SERVO_RC_FS_MSK': 'Outputs to disable on radio failsafe (pin mask)',
  'SERVO_BLH_AUTO': 'Auto-enable BLHeli passthrough: 0=disabled, 1=enabled',
  'SERVO_BLH_DEBUG': 'BLHeli debug output: 0=off, 1=on',
  'SERVO_BLH_MASK': 'Which outputs have BLHeli ESCs (pin mask)',
  'SERVO_BLH_OTYPE': 'BLHeli output type: 0=disabled, 1=OneShot, 2=OneShot125, etc.',
  'SERVO_BLH_PORT': 'Serial port for BLHeli telemetry',
  'SERVO_BLH_POLES': 'Motor magnet poles for RPM calculation (usually 14)',
  'SERVO_BLH_REMASK': 'Reverse motor outputs (pin mask)',
  'SERVO_BLH_3DMASK': '3D/reversible motor outputs (pin mask)',
  'SERVO_BLH_BDMASK': 'Bidirectional DShot outputs (pin mask)',
  'SERVO_BLH_RVMASK': 'Reversed rotation outputs (pin mask)',
  'SERVO_FTW_MASK': 'Outputs with FETtec ESCs (pin mask)',
  'SERVO_FTW_RVMSK': 'FETtec reversed rotation (pin mask)',
  'SERVO_FTW_POLES': 'FETtec motor poles',

  // ===== SIMPLE (Beginner-Friendly Flying Modes) =====
  'SIMPLE': 'Simple mode (stick forward=away from you): per-mode enable (add flight mode numbers)',
  'SUPER_SIMPLE': 'Super simple mode (stick forward=away from home): per-mode enable',

  // ===== SR (MAVLink Stream Rates - data sent to ground station) =====
  'SR0_RAW_SENS': 'Raw sensor data rate to GCS (Hz). E.g., 2 = twice per second',
  'SR0_EXT_STAT': 'Extended status rate to GCS (Hz)',
  'SR0_RC_CHAN': 'RC channel data rate to GCS (Hz)',
  'SR0_RAW_CTRL': 'Raw control output rate to GCS (Hz)',
  'SR0_POSITION': 'Position data rate to GCS (Hz)',
  'SR0_EXTRA1': 'Extra data 1 rate (attitude) to GCS (Hz)',
  'SR0_EXTRA2': 'Extra data 2 rate (VFR HUD) to GCS (Hz)',
  'SR0_EXTRA3': 'Extra data 3 rate to GCS (Hz)',
  'SR0_PARAMS': 'Parameter update rate to GCS (Hz)',
  'SR0_ADSB': 'ADS-B traffic data rate to GCS (Hz)',
  'SR1_RAW_SENS': 'Raw sensor rate to second GCS',
  'SR1_EXT_STAT': 'Extended status rate to second GCS',
  'SR1_RC_CHAN': 'RC channel rate to second GCS',
  'SR1_RAW_CTRL': 'Raw control rate to second GCS',
  'SR1_POSITION': 'Position rate to second GCS',
  'SR1_EXTRA1': 'Extra 1 rate to second GCS',
  'SR1_EXTRA2': 'Extra 2 rate to second GCS',
  'SR1_EXTRA3': 'Extra 3 rate to second GCS',
  'SR1_PARAMS': 'Parameter rate to second GCS',
  'SR2_RAW_SENS': 'Raw sensor rate to third GCS',
  'SR2_EXT_STAT': 'Extended status rate to third GCS',
  'SR2_RC_CHAN': 'RC channel rate to third GCS',
  'SR2_RAW_CTRL': 'Raw control rate to third GCS',
  'SR2_POSITION': 'Position rate to third GCS',
  'SR2_EXTRA1': 'Extra 1 rate to third GCS',
  'SR2_EXTRA2': 'Extra 2 rate to third GCS',
  'SR2_EXTRA3': 'Extra 3 rate to third GCS',

  // ===== SYSID (System Identification) =====
  'SYSID_THISMAV': 'This vehicle MAVLink ID (1-255). Each vehicle needs unique ID',
  'SYSID_MYGCS': 'Ground station MAVLink ID to accept commands from (255=any)',
  'SYSID_SW_TYPE': 'Software type identifier (auto-set, do not change)',
  'SYSID_SW_MREV': 'Software minor revision (auto-set)',
  'SYSID_ENFORCE': 'Only accept commands from SYSID_MYGCS: 0=accept any, 1=enforce',

  // ===== TERRAIN (Terrain Following) =====
  'TERRAIN_ENABLE': 'Enable terrain data from ground station: 0=off, 1=on',
  'TERRAIN_SPACING': 'Terrain grid spacing in meters (30-500)',
  'TERRAIN_OPTIONS': 'Terrain options (add values: 1=use terrain for RTL)',

  // ===== THR (Throttle) =====
  'THR_DZ': 'Throttle stick deadzone around center (0-300). Larger = more deadband',
  'THR_MIN': 'Minimum throttle output in modes that allow it',
  'THR_MAX': 'Maximum throttle output',
  'THR_FS_VALUE': 'Throttle PWM value that triggers failsafe (usually 950-975)',

  // ===== TKOFF (Takeoff) =====
  'TKOFF_ALT': 'Auto takeoff target altitude (meters)',
  'TKOFF_ANGLE': 'Maximum tilt angle during takeoff (degrees × 100)',

  // ===== TUNE (In-Flight Tuning) =====
  'TUNE': 'Parameter to adjust with tuning knob: 0=none, 1=roll P, 4=pitch P, 6=yaw P, etc.',
  'TUNE_LOW': 'Tuning knob minimum value (depends on parameter)',
  'TUNE_HIGH': 'Tuning knob maximum value (depends on parameter)',
  'TUNE_MIN': 'Alternative tuning minimum',
  'TUNE_MAX': 'Alternative tuning maximum',

  // ===== VISO (Visual Odometry - camera-based positioning) =====
  'VISO_TYPE': 'Visual odometry type: 0=none, 1=MAVLink, 2=scripting',
  'VISO_POS_X': 'Camera forward/back from center (meters)',
  'VISO_POS_Y': 'Camera left/right from center (meters)',
  'VISO_POS_Z': 'Camera up/down from center (meters)',
  'VISO_ORIENT': 'Camera mounting orientation (0=forward, 4=backward, etc.)',
  'VISO_SCALE': 'Position scale factor (if camera reports wrong distance)',
  'VISO_DELAY_MS': 'Camera delay compensation (milliseconds)',
  'VISO_VEL_M_NSE': 'Expected velocity error from camera (m/s)',
  'VISO_POS_M_NSE': 'Expected position error from camera (meters)',
  'VISO_YAW_M_NSE': 'Expected heading error from camera (radians)',

  // ===== WPNAV (Waypoint Navigation Speed) =====
  'WPNAV_SPEED': 'Mission/Auto horizontal speed (cm/s). E.g., 500 = 5 m/s',
  'WPNAV_RADIUS': 'Waypoint acceptance radius (cm). Vehicle moves to next waypoint when within this',
  'WPNAV_SPEED_UP': 'Mission climb speed (cm/s). E.g., 250 = 2.5 m/s',
  'WPNAV_SPEED_DN': 'Mission descent speed (cm/s). E.g., 150 = 1.5 m/s',
  'WPNAV_ACCEL': 'Mission horizontal acceleration (cm/s²)',
  'WPNAV_ACCEL_Z': 'Mission vertical acceleration (cm/s²)',
  'WPNAV_RFND_USE': 'Use rangefinder during missions: 0=no, 1=yes',
  'WPNAV_JERK': 'Waypoint jerk limit (m/s³). Lower = smoother but slower',
  'WPNAV_TER_MARGIN': 'Terrain following altitude margin (meters)',

  // ===== WP (Waypoint Behavior) =====
  'WP_NAVALT_MIN': 'Minimum altitude for safe navigation (meters)',
  'WP_YAW_BEHAVIOR': 'Yaw during waypoints: 0=never change, 1=face next waypoint, 2=face POI, 3=always',

  // ===== VTX (Video Transmitter Control) =====
  'VTX_ENABLE': 'Control video transmitter settings: 0=disabled, 1=enabled',
  'VTX_POWER': 'VTX power level (depends on VTX type)',
  'VTX_CHANNEL': 'VTX channel (1-8 typically)',
  'VTX_BAND': 'VTX band: 0=auto, 1=A, 2=B, 3=E, 4=FS, 5=RaceBand',
  'VTX_FREQ': 'VTX frequency in MHz (overrides band/channel if set)',
  'VTX_OPTIONS': 'VTX options (add values: 1=force pit mode on boot)',
  'VTX_MAX_POWER': 'Maximum allowed VTX power level',

  // ===== ACRO (Acrobatic Flight Mode) =====
  'ACRO_RP_RATE': 'Roll/pitch rotation rate (degrees/sec). Higher = faster flips',
  'ACRO_RP_EXPO': 'Roll/pitch expo (0-1). Higher = more sensitive near center',
  'ACRO_YAW_RATE': 'Yaw rotation rate (degrees/sec)',
  'ACRO_YAW_EXPO': 'Yaw expo (0-1). Higher = more sensitive near center',
  'ACRO_BAL_ROLL': 'Auto-level roll strength (0-3). Higher = more self-leveling',
  'ACRO_BAL_PITCH': 'Auto-level pitch strength (0-3). Higher = more self-leveling',
  'ACRO_TRAINER': 'Acro trainer: 0=disabled, 1=limited angle, 2=limited+leveling',
  'ACRO_RP_P': 'Acro roll/pitch P gain (affects rate response)',
  'ACRO_RP_RATE_TC': 'Roll/pitch rate smoothing (seconds)',
  'ACRO_Y_RATE_TC': 'Yaw rate smoothing (seconds)',
  'ACRO_OPTIONS': 'Acro options (add values: 1=rate request if not moving)',

  // ===== AVOID (Obstacle Avoidance) =====
  'AVOID_ENABLE': 'Obstacle avoidance: 0=disabled, 1=basic stop, 2=slide around, 3=stop+backup',
  'AVOID_MARGIN': 'Distance to maintain from obstacles (meters)',
  'AVOID_ANGLE_MAX': 'Maximum lean angle toward obstacles (degrees × 100)',
  'AVOID_DIST_MAX': 'Maximum distance to detect obstacles (meters)',
  'AVOID_ALT_MIN': 'Minimum altitude for avoidance (meters)',
  'AVOID_ACCEL_MAX': 'Maximum avoidance acceleration (m/s²)',
  'AVOID_BACKUP_SPD': 'Backup speed when obstacle too close (m/s)',

  // ===== FRAME (Vehicle Frame Type) =====
  'FRAME_CLASS': 'Vehicle frame: 0=undefined, 1=quad, 2=hexa, 3=octa, 4=octaquad, 5=Y6, 6=heli, etc.',
  'FRAME_TYPE': 'Motor layout: 0=plus, 1=X, 2=V, 3=H, 4=VTail, 5=dead-cat, etc.',

  // ===== FORMAT =====
  'FORMAT_VERSION': 'Parameter storage format version (do not change)',

  // ===== H_ (Traditional Helicopter Settings) =====
  'H_TAIL_TYPE': 'Tail type: 0=servo, 1=servo with external gyro, 2=direct drive, 3=DDVP',
  'H_TAIL_SPEED': 'Direct drive tail motor speed',
  'H_GYR_GAIN': 'External gyro gain in normal modes',
  'H_GYR_GAIN_ACRO': 'External gyro gain in acro mode',
  'H_COLYAW': 'Collective to yaw mixing (counters torque changes)',
  'H_FLYBAR_MODE': 'Flybar mode: 0=flybarless, 1=flybar',
  'H_COL_MAX': 'Maximum collective pitch (degrees × 10)',
  'H_COL_MID': 'Mid collective pitch for hover (degrees × 10)',
  'H_COL_MIN': 'Minimum collective pitch (degrees × 10)',
  'H_COL_LAND_MIN': 'Minimum collective for landing (degrees × 10)',
  'H_COL_ZERO_THRST': 'Collective position for zero thrust (for autorotation)',
  'H_CYC_MAX': 'Maximum cyclic pitch (degrees)',
  'H_SWASH_TYPE': 'Swashplate type: 0=H3, 1=H1, 2=H3-140, 3=H3-120, etc.',
  'H_SW_TYPE': 'Swashplate type (legacy parameter)',
  'H_SW_COL_DIR': 'Collective servo direction: 0=normal, 1=reversed',
  'H_SW_LIN_SVO': 'Linearize servo outputs: 0=no, 1=yes',
  'H_SW_H3_ENABLE': 'Enable H3 swashplate setup: 0=no, 1=yes',
  'H_SW_H3_SV1_POS': 'H3 servo 1 position (degrees)',
  'H_SW_H3_SV2_POS': 'H3 servo 2 position (degrees)',
  'H_SW_H3_SV3_POS': 'H3 servo 3 position (degrees)',
  'H_SW_H3_PHANG': 'H3 phase angle (degrees)',
  'H_HOVER_LEARN': 'Learn hover collective: 0=disabled, 1=learn, 2=learn and save',
  'H_RSC_MODE': 'Rotor speed control: 0=Ch8 input, 1=setpoint, 2=throttle curve, 3=governor',
  'H_RSC_SETPOINT': 'Target rotor speed as % of maximum',
  'H_RSC_CRITICAL': 'Critical rotor speed % (below this, autorotation starts)',
  'H_RSC_IDLE': 'Rotor idle output when disarmed (0-0.3)',
  'H_RSC_RAMP_TIME': 'Time to ramp up rotor speed (seconds)',
  'H_RSC_RUNUP_TIME': 'Time for rotor to reach full speed (seconds)',
  'H_RSC_SLEWRATE': 'Maximum throttle change rate (% per second)',
  'H_RSC_THRCRV_0': 'Throttle curve at 0% collective',
  'H_RSC_THRCRV_25': 'Throttle curve at 25% collective',
  'H_RSC_THRCRV_50': 'Throttle curve at 50% collective',
  'H_RSC_THRCRV_75': 'Throttle curve at 75% collective',
  'H_RSC_THRCRV_100': 'Throttle curve at 100% collective',
  'H_RSC_GOV_RANGE': 'Governor operating range (% of setpoint)',
  'H_RSC_GOV_SETPNT': 'Governor target RPM',
  'H_RSC_GOV_DISGAG': 'Governor disengage throttle level',
  'H_RSC_GOV_DROOP': 'Governor droop response (load compensation)',
  'H_RSC_GOV_TCGAIN': 'Governor torque control gain',
  'H_RSC_APTS_N': 'Number of blade passages per revolution (for RPM sensing)',
  'H_RSC_APTS_RADIUS': 'Blade radius (for auto-throttle calculations)',

  // ===== MISC (Other) =====
  'GND_ABS_PRESS': 'Ground level atmospheric pressure (Pascals). Auto-set on boot',
  'GND_TEMP': 'Ground level temperature (Celsius). Used for altitude calculations',
  'GND_ALT_OFFSET': 'Altitude offset for barometer (meters)',
  'GND_EXT_BUS': 'External barometer I2C bus (-1=disabled)',
  'STAT_BOOTCNT': 'Number of times flight controller has booted',
  'STAT_FLTTIME': 'Total accumulated flight time (seconds)',
  'STAT_RESET': 'Time when statistics were last reset',
  'STAT_RUNTIME': 'Total powered-on time (seconds)',
};

/**
 * Generate a fallback description from a parameter name
 * Uses AI-generated lookup table, falls back to pattern-based generation
 */
export function generateFallbackDescription(paramId: string): string {
  // First try exact match in our lookup table
  if (PARAM_DESCRIPTIONS[paramId]) {
    return PARAM_DESCRIPTIONS[paramId];
  }

  // Try to match numbered variants (e.g., SERVO1_FUNCTION -> SERVO_FUNCTION pattern)
  const withoutNumber = paramId.replace(/(\d+)/, '');
  if (PARAM_DESCRIPTIONS[withoutNumber]) {
    const num = paramId.match(/(\d+)/)?.[1];
    return num ? `${PARAM_DESCRIPTIONS[withoutNumber]} (instance ${num})` : PARAM_DESCRIPTIONS[withoutNumber];
  }

  // For RC channels, generate specific descriptions
  const rcMatch = paramId.match(/^RC(\d+)_(.+)$/);
  if (rcMatch) {
    const [, channel, suffix] = rcMatch;
    const suffixMeanings: Record<string, string> = {
      'MIN': 'minimum PWM',
      'MAX': 'maximum PWM',
      'TRIM': 'trim PWM',
      'REV': 'reversed',
      'DZ': 'deadzone',
      'OPTION': 'option/function',
    };
    const meaning = suffixMeanings[suffix] || suffix.toLowerCase();
    return `RC channel ${channel} ${meaning}`;
  }

  // For SERVO outputs, generate specific descriptions
  const servoMatch = paramId.match(/^SERVO(\d+)_(.+)$/);
  if (servoMatch) {
    const [, channel, suffix] = servoMatch;
    const suffixMeanings: Record<string, string> = {
      'MIN': 'minimum PWM output',
      'MAX': 'maximum PWM output',
      'TRIM': 'trim PWM output',
      'REVERSED': 'reversed output',
      'FUNCTION': 'output function assignment',
    };
    const meaning = suffixMeanings[suffix] || suffix.toLowerCase();
    return `Servo output ${channel} ${meaning}`;
  }

  // Smart fallback - use prefix hints to generate better descriptions
  const prefixHints: Record<string, string> = {
    'ADSB': 'ADS-B aircraft tracking',
    'AFS': 'Advanced failsafe',
    'AIRSPEED': 'Airspeed sensor',
    'ARSPD': 'Airspeed sensor',
    'AUTO': 'Auto mode',
    'AUTOTUNE': 'Auto-tuning',
    'AVD': 'Avoidance',
    'BARO': 'Barometer/altitude sensor',
    'BCN': 'Beacon',
    'BTN': 'Button',
    'CAL': 'Calibration',
    'CAM': 'Camera',
    'CAN': 'CAN bus',
    'CRUISE': 'Cruise mode',
    'DSPOILER': 'Differential spoiler',
    'EFI': 'Electronic fuel injection',
    'ESC': 'Electronic speed controller',
    'FBW': 'Fly by wire mode',
    'FLAP': 'Flaps',
    'FOLL': 'Follow mode',
    'FRSKY': 'FrSky telemetry',
    'GEN': 'Generator',
    'GLIDE': 'Glide mode',
    'GRIP': 'Gripper',
    'GUIDED': 'Guided mode',
    'HLD': 'Hold',
    'HOME': 'Home position',
    'ICE': 'Internal combustion engine',
    'KDE': 'KDE motor',
    'KTUN': 'K-controller tuning',
    'LGR': 'Landing gear',
    'LIM': 'Limits',
    'LOITER': 'Loiter mode',
    'MAG': 'Compass/magnetometer',
    'MAN': 'Manual mode',
    'MIN': 'Minimum',
    'MAX': 'Maximum',
    'MIXING': 'Control mixing',
    'NAV': 'Navigation',
    'NAVL1': 'L1 navigation controller',
    'NTF': 'Notifications',
    'OA': 'Object avoidance',
    'ONESHOT': 'OneShot ESC protocol',
    'PTCH': 'Pitch control',
    'Q_': 'QuadPlane VTOL',
    'RALLY': 'Rally point',
    'RCIN': 'RC input',
    'RLL': 'Roll control',
    'SOAR': 'Thermal soaring',
    'SPRAY': 'Sprayer',
    'STAB': 'Stabilize mode',
    'STALL': 'Stall prevention',
    'STEER': 'Steering',
    'STICK': 'Stick input',
    'TECS': 'Total energy control (airspeed/altitude)',
    'THR': 'Throttle',
    'TKOFF': 'Takeoff',
    'TRIM': 'Trim',
    'TROT': 'Throttle',
    'TUNE': 'Tuning',
    'WENC': 'Wheel encoder',
    'WRC': 'Winch',
    'YAW': 'Yaw control',
  };

  // Find matching prefix
  for (const [prefix, hint] of Object.entries(prefixHints)) {
    if (paramId.startsWith(prefix)) {
      const rest = paramId.slice(prefix.length).replace(/^_/, '');
      const humanRest = rest.replace(/_/g, ' ').toLowerCase();
      return `${hint}${humanRest ? ': ' + humanRest : ''} parameter`;
    }
  }

  // Final fallback - format nicely
  const parts = paramId.split('_');
  const formatted = parts.map(p => p.toLowerCase()).join(' ');
  return `${formatted} (check ArduPilot docs for details)`;
}
