/**
 * Pre-Arm Error Pattern Matcher
 *
 * Maps known ArduPilot pre-arm STATUSTEXT error patterns to the parameters
 * that can fix them. Used by MessagesPanel (inline fixes) and PreflightCheckCard.
 *
 * Sources: MissionPlanner PrearmStatus.cs, ParameterMetaDataBackup.xml, ArduPilot firmware
 */

import type { FirmwareSource } from './firmware-types';

export type PreArmCategory = 'motors' | 'sensors' | 'gps' | 'rc' | 'battery' | 'system' | 'mission';

export interface PreArmFix {
  params: string[];
  hint: string;
  action?: 'calibrate-accel' | 'calibrate-compass' | 'calibrate-rc';
  navigateTo?: string;
}

export interface PreArmPattern {
  pattern: RegExp;
  category: PreArmCategory;
  fix: PreArmFix;
}

export const PREARM_CATEGORIES: { id: PreArmCategory; label: string }[] = [
  { id: 'motors', label: 'Motors' },
  { id: 'sensors', label: 'Sensors' },
  { id: 'gps', label: 'GPS' },
  { id: 'rc', label: 'RC' },
  { id: 'battery', label: 'Battery' },
  { id: 'system', label: 'System' },
  { id: 'mission', label: 'Mission' },
];

const PREARM_PATTERNS: PreArmPattern[] = [
  // Motors
  {
    pattern: /Motors:.*frame class/i,
    category: 'motors',
    fix: { params: ['FRAME_CLASS', 'FRAME_TYPE'], hint: 'Set your vehicle\'s frame layout' },
  },
  {
    pattern: /Check firmware or FRAME/i,
    category: 'motors',
    fix: { params: ['FRAME_CLASS'], hint: 'Select the correct frame class for your vehicle' },
  },
  // Sensors
  {
    pattern: /Compass not healthy/i,
    category: 'sensors',
    fix: { params: ['COMPASS_ENABLE', 'COMPASS_USE'], hint: 'Enable or disable compass' },
  },
  {
    pattern: /Compass.*(not calibrated|offsets)/i,
    category: 'sensors',
    fix: { params: [], hint: 'Compass needs calibration', action: 'calibrate-compass' },
  },
  {
    pattern: /Gyro.*(not calibrated|not healthy)/i,
    category: 'sensors',
    fix: { params: ['INS_GYR_CAL'], hint: 'Gyro calibration setting' },
  },
  {
    pattern: /Accel.*(not calibrated|not healthy|inconsistent|calibration needed)/i,
    category: 'sensors',
    fix: { params: [], hint: 'Accelerometer needs calibration.', action: 'calibrate-accel' },
  },
  {
    pattern: /Baro.*not healthy/i,
    category: 'sensors',
    fix: { params: ['BARO_ENABLE'], hint: 'Barometer configuration' },
  },
  {
    pattern: /AHRS.*not healthy/i,
    category: 'sensors',
    fix: { params: ['AHRS_EKF_TYPE'], hint: 'EKF/AHRS configuration' },
  },
  {
    pattern: /Rangefinder.*not healthy/i,
    category: 'sensors',
    fix: { params: ['RNGFND1_TYPE'], hint: 'Rangefinder configuration' },
  },
  // EKF / Estimation
  {
    pattern: /EKF.*attitude.*bad/i,
    category: 'sensors',
    fix: { params: [], hint: 'EKF cannot converge. In SITL, restart with "Wipe EEPROM" and wait 60-90s after boot.' },
  },
  {
    pattern: /AHRS.*inconsistent/i,
    category: 'sensors',
    fix: { params: [], hint: 'IMU cores disagree - likely stale calibration data. Restart SITL with "Wipe EEPROM" enabled.' },
  },
  {
    pattern: /Need Position Estimate/i,
    category: 'sensors',
    fix: { params: [], hint: 'EKF needs a valid position. Wait 60-90s after boot for convergence, or restart SITL with "Wipe EEPROM".' },
  },
  {
    pattern: /Need Alt Estimate/i,
    category: 'sensors',
    fix: { params: [], hint: 'EKF needs altitude estimate. Cascades from other sensor errors - fix those first.' },
  },
  {
    pattern: /Wait or rebo/i,
    category: 'sensors',
    fix: { params: [], hint: 'ArduPilot is telling you to wait for sensors to settle or reboot the FC.' },
  },
  // GPS
  {
    pattern: /GPS.*(not ready|Bad|not healthy)/i,
    category: 'gps',
    fix: { params: ['GPS_TYPE'], hint: 'Configure GPS type or wait for fix' },
  },
  {
    pattern: /Need 3D Fix/i,
    category: 'gps',
    fix: { params: [], hint: 'Waiting for GPS 3D fix — move to open sky' },
  },
  // RC
  {
    pattern: /RC not calibrated/i,
    category: 'rc',
    fix: {
      params: ['RC1_MIN', 'RC1_MAX', 'RC2_MIN', 'RC2_MAX', 'RC3_MIN', 'RC3_MAX', 'RC4_MIN', 'RC4_MAX'],
      hint: 'RC channels need calibration',
      action: 'calibrate-rc',
    },
  },
  {
    pattern: /Throttle.*below failsafe/i,
    category: 'rc',
    fix: { params: ['FS_THR_VALUE'], hint: 'Throttle failsafe threshold' },
  },
  // Battery
  {
    pattern: /Battery.*(not healthy|too low|failsafe)/i,
    category: 'battery',
    fix: { params: ['BATT_MONITOR', 'ARMING_VOLT_MIN'], hint: 'Battery monitor type / minimum voltage' },
  },
  // System
  {
    pattern: /Logging.*not available/i,
    category: 'system',
    fix: { params: ['LOG_BACKEND_TYPE'], hint: 'Configure logging backend' },
  },
  {
    pattern: /Hardware safety switch/i,
    category: 'system',
    fix: { params: ['BRD_SAFETY_DEFLT'], hint: 'Disable hardware safety switch requirement' },
  },
  {
    pattern: /Check board type/i,
    category: 'system',
    fix: { params: ['BRD_TYPE'], hint: 'Board type configuration' },
  },
  // Mission
  {
    pattern: /Fence.*(requires position|breach)/i,
    category: 'mission',
    fix: { params: ['FENCE_ENABLE'], hint: 'Disable fence or wait for GPS' },
  },
  {
    pattern: /Mission.*(not valid|no first item)/i,
    category: 'mission',
    fix: { params: [], hint: 'Check mission in Mission tab', navigateTo: 'mission' },
  },
];

// Generic fallback for any unmatched ArduPilot PreArm: message
const GENERIC_FALLBACK: PreArmPattern = {
  pattern: /.*/,
  category: 'system',
  fix: { params: ['ARMING_CHECK'], hint: 'Disable this arming check via bitmask if not needed' },
};

/**
 * PX4 arming / preflight failure patterns. PX4 emits different STATUSTEXT
 * wording than ArduPilot ("Arming denied:", "Preflight Fail:", "Preflight: ")
 * and uses COM_/EKF2_/BAT_/GF_ parameter names. Kept separate from the
 * ArduPilot array so a PX4 connection never matches an ArduPilot-only hint
 * (and vice versa).
 *
 * Sources: PX4 commander/preflight check messages, PX4 parameter reference.
 */
const PX4_PREARM_PATTERNS: PreArmPattern[] = [
  // GPS / position estimate
  {
    pattern: /(global position|position).*(not ready|denied|fail|estimate)|(estimator|position).*(not ready|fail)/i,
    category: 'gps',
    fix: {
      params: ['COM_ARM_WO_GPS', 'EKF2_AID_MASK'],
      hint: 'Position estimate not ready. Wait for a 3D fix / position lock, or set COM_ARM_WO_GPS to allow arming without GPS if intentional.',
    },
  },
  {
    pattern: /\b(gps|gnss)\b.*(fix|lock|not ready|fail)|need.*3d fix/i,
    category: 'gps',
    fix: { params: ['COM_ARM_WO_GPS'], hint: 'Waiting for GPS fix. Move to open sky, or set COM_ARM_WO_GPS if arming without GPS is intended.' },
  },
  // Sensors / calibration
  {
    pattern: /(compass|mag(netometer)?).*(not calibrated|inconsistent|fail|interference)/i,
    category: 'sensors',
    fix: { params: ['COM_ARM_MAG_ANG_DEG'], hint: 'Magnetometer not calibrated or inconsistent. Run compass calibration; COM_ARM_MAG_ANG_DEG sets the allowed tolerance.', action: 'calibrate-compass' },
  },
  {
    pattern: /accel(erometer)?.*(not calibrated|inconsistent|fail)/i,
    category: 'sensors',
    fix: { params: [], hint: 'Accelerometer not calibrated or inconsistent. Run accelerometer calibration.', action: 'calibrate-accel' },
  },
  {
    pattern: /gyro(scope)?.*(not calibrated|inconsistent|fail)/i,
    category: 'sensors',
    fix: { params: [], hint: 'Gyroscope not calibrated. Run gyro/sensor calibration and keep the vehicle still.' },
  },
  {
    pattern: /(accelerometer.*clipping|high vibration|vibration)/i,
    category: 'sensors',
    fix: { params: [], hint: 'High vibration / accelerometer clipping. Improve flight controller mounting and isolation.' },
  },
  {
    pattern: /(attitude|tilt).*(estimate|quality|too large|fail)|(estimator|quality).*(attitude|tilt)/i,
    category: 'sensors',
    fix: { params: [], hint: 'Attitude estimate not stable. Level the vehicle, reduce vibration, and let the estimator settle.' },
  },
  // RC / manual control
  {
    pattern: /(rc|radio|manual control).*(not calibrated|lost|fail|not configured)/i,
    category: 'rc',
    fix: {
      params: ['COM_RC_IN_MODE'],
      hint: 'RC not calibrated or signal lost. Calibrate RC, or set COM_RC_IN_MODE for joystick / RC-optional operation.',
      action: 'calibrate-rc',
    },
  },
  // Battery
  {
    pattern: /(battery).*(low|unhealthy|warning|critical|not connected)/i,
    category: 'battery',
    fix: { params: ['BAT_LOW_THR', 'BAT_CRIT_THR', 'COM_ARM_BAT_MIN_VOLT'], hint: 'Battery low or unhealthy. Charge the pack, or review BAT_LOW_THR / BAT_CRIT_THR / COM_ARM_BAT_MIN_VOLT thresholds.' },
  },
  // ESC / motors
  {
    pattern: /(esc|motor).*(fail|not|telemetry|unhealthy)/i,
    category: 'motors',
    fix: { params: [], hint: 'ESC / motor problem detected. Check ESC wiring, telemetry, and motor outputs.' },
  },
  // Geofence
  {
    pattern: /(geofence|\bgf\b)/i,
    category: 'mission',
    fix: { params: ['GF_ACTION'], hint: 'Geofence condition blocking arming. Review geofence setup or GF_ACTION.' },
  },
  // Home position
  {
    pattern: /(home position|home not set)/i,
    category: 'mission',
    fix: { params: ['COM_HOME_EN'], hint: 'Home position not set. Wait for a valid position so home can be captured.' },
  },
  // Kill switch / safety
  {
    pattern: /(kill switch|emergency)/i,
    category: 'system',
    fix: { params: [], hint: 'Kill switch engaged. Disengage the kill switch before arming.' },
  },
];

/**
 * Generic fallback for an unmatched PX4 arming/preflight message. PX4 has no
 * single ARMING_CHECK bitmask, so this points at the relevant check params.
 */
const PX4_GENERIC_FALLBACK: PreArmPattern = {
  pattern: /.*/,
  category: 'system',
  fix: { params: ['COM_ARM_WO_GPS', 'COM_PREARM_MODE'], hint: 'Arming/preflight check failed. Resolve the reported condition, or review the relevant COM_ARM_/COM_PREARM_ check parameters.' },
};

// PX4 STATUSTEXT prefixes for arming / preflight failures.
const PX4_PREARM_PREFIX = /^(arming denied|preflight fail|preflight)\s*:/i;

/**
 * Check if a STATUSTEXT message is a pre-arm message.
 *
 * Defaults to ArduPilot detection ("PreArm:" / "Arm:") so existing callers are
 * unchanged. Pass firmware 'px4' to also match PX4 prefixes ("Arming denied:",
 * "Preflight Fail:", "Preflight:").
 */
export function isPreArmMessage(text: string, firmware?: FirmwareSource): boolean {
  if (firmware === 'px4') {
    return PX4_PREARM_PREFIX.test(text.trim());
  }
  return /(?:PreArm|Arm):/i.test(text);
}

/**
 * Extract the reason part from a pre-arm or arm-time error message.
 * ArduPilot: "PreArm: Motors: Check frame class" -> "Motors: Check frame class"
 * PX4:       "Arming denied: GPS not ready" -> "GPS not ready"
 */
export function extractPreArmReason(text: string, firmware?: FirmwareSource): string {
  if (firmware === 'px4') {
    const px4Match = text.trim().match(/^(?:arming denied|preflight fail|preflight)\s*:\s*(.+)/i);
    return px4Match ? px4Match[1]!.trim() : text.trim();
  }
  const match = text.match(/(?:PreArm|Arm):\s*(.+)/i);
  return match ? match[1]!.trim() : text;
}

/**
 * Match a STATUSTEXT message against known pre-arm patterns.
 * Returns null if the message is not a pre-arm message.
 * Returns a generic fallback if it's a pre-arm message but no specific pattern matches.
 *
 * Defaults to ArduPilot. Pass firmware 'px4' to match PX4 arming/preflight
 * patterns instead. The two pattern sets never cross-match.
 */
export function matchPreArmError(
  text: string,
  firmware?: FirmwareSource,
): { pattern: PreArmPattern; reason: string } | null {
  if (!isPreArmMessage(text, firmware)) return null;

  const reason = extractPreArmReason(text, firmware);

  const patterns = firmware === 'px4' ? PX4_PREARM_PATTERNS : PREARM_PATTERNS;
  const fallback = firmware === 'px4' ? PX4_GENERIC_FALLBACK : GENERIC_FALLBACK;

  for (const entry of patterns) {
    if (entry.pattern.test(reason)) {
      return { pattern: entry, reason };
    }
  }

  // Fallback: it's a pre-arm message but no specific pattern matched
  return { pattern: fallback, reason };
}
