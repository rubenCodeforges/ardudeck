/**
 * Pre-Arm Error Pattern Matcher
 *
 * Maps known ArduPilot pre-arm STATUSTEXT error patterns to the parameters
 * that can fix them. Used by MessagesPanel (inline fixes) and PreflightCheckCard.
 *
 * Sources: MissionPlanner PrearmStatus.cs, ParameterMetaDataBackup.xml, ArduPilot firmware
 */

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
    fix: {
      params: ['FS_BATT_ENABLE', 'ARMING_MIN_VOLT', 'BATT_LOW_VOLT', 'BATT_MONITOR', 'SIM_BATT_VOLTAGE', 'BATT_FS_LOW_ACT'],
      hint: 'SITL: ArduDeck pushes battery/arming fixes over MAVLink after parameters load (EEPROM can override --defaults). If this still shows, reconnect once or use Wipe EEPROM when starting SITL.',
    },
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

// Generic fallback for any unmatched PreArm: message
const GENERIC_FALLBACK: PreArmPattern = {
  pattern: /.*/,
  category: 'system',
  fix: { params: ['ARMING_CHECK'], hint: 'Disable this arming check via bitmask if not needed' },
};

/**
 * Check if a STATUSTEXT message is a pre-arm message.
 */
export function isPreArmMessage(text: string): boolean {
  return /(?:PreArm|Arm):/i.test(text);
}

/**
 * Extract the reason part from a pre-arm or arm-time error message.
 * "PreArm: Motors: Check frame class" → "Motors: Check frame class"
 * "Arm: Motors: Check frame class" → "Motors: Check frame class"
 */
export function extractPreArmReason(text: string): string {
  const match = text.match(/(?:PreArm|Arm):\s*(.+)/i);
  return match ? match[1]!.trim() : text;
}

/**
 * Match a STATUSTEXT message against known pre-arm patterns.
 * Returns null if the message is not a pre-arm message.
 * Returns the generic ARMING_CHECK fallback if it's a pre-arm message but no specific pattern matches.
 */
export function matchPreArmError(text: string): { pattern: PreArmPattern; reason: string } | null {
  if (!isPreArmMessage(text)) return null;

  const reason = extractPreArmReason(text);

  for (const entry of PREARM_PATTERNS) {
    if (entry.pattern.test(reason)) {
      return { pattern: entry, reason };
    }
  }

  // Fallback: it's a PreArm message but no specific pattern matched
  return { pattern: GENERIC_FALLBACK, reason };
}
