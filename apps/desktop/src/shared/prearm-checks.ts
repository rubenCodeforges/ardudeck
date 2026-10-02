/**
 * Pre-Arm Error Pattern Matcher
 *
 * Maps known ArduPilot pre-arm STATUSTEXT error patterns to the parameters
 * that can fix them. Used by MessagesPanel (inline fixes) and PreflightCheckCard.
 *
 * Sources: MissionPlanner PrearmStatus.cs, ParameterMetaDataBackup.xml, ArduPilot firmware
 */

import type { FirmwareSource } from './firmware-types';
import { t } from './i18n/index.js';

export type PreArmCategory = 'motors' | 'sensors' | 'gps' | 'rc' | 'battery' | 'system' | 'mission';

/** Where a quick fix sends the pilot: an app view (with its deep-link target) or a doc page. */
export type PreArmLinkTarget =
  | { kind: 'view'; view: string; target?: string }
  | { kind: 'external'; url: string };

export interface PreArmLink {
  label: string;
  to: PreArmLinkTarget;
}

/**
 * A fix points at the place the cause is fixed. It never disables or loosens a check:
 * a pilot who arms past a failing check is one bad decision from a crash.
 */
export interface PreArmFix {
  hint: string;
  links?: PreArmLink[];
  /** Configuration parameters to review, never check bypasses (ARMING_CHECK, COM_ARM_*, CBRK_*). */
  params?: string[];
}

// Link labels in the pattern tables are i18n keys; matchPreArmError translates them.
const calibrate = (type: string, label: string): PreArmLink => ({ label, to: { kind: 'view', view: 'calibration', target: type } });
const configTab = (tab: string, label: string): PreArmLink => ({ label, to: { kind: 'view', view: 'parameters', target: `tab:${tab}` } });
const openView = (view: string, label: string): PreArmLink => ({ label, to: { kind: 'view', view } });
const docs = (url: string, label: string): PreArmLink => ({ label, to: { kind: 'external', url } });

const ARDUPILOT_PREARM_DOCS = 'https://ardupilot.org/copter/docs/common-prearm-safety-checks.html';
const PX4_PREARM_DOCS = 'https://docs.px4.io/main/en/flying/pre_flight_checks.html';

export interface PreArmPattern {
  pattern: RegExp;
  category: PreArmCategory;
  fix: PreArmFix;
}

interface PreArmPatternDef {
  pattern: RegExp;
  category: PreArmCategory;
  fix: Omit<PreArmFix, 'hint'> & { hintKey: string };
}

export const PREARM_CATEGORIES: { id: PreArmCategory; label: string }[] = [
  { id: 'motors', label: 'Motors' }, // i18n-exempt
  { id: 'sensors', label: 'Sensors' }, // i18n-exempt
  { id: 'gps', label: 'GPS' }, // i18n-exempt
  { id: 'rc', label: 'RC' }, // i18n-exempt
  { id: 'battery', label: 'Battery' }, // i18n-exempt
  { id: 'system', label: 'System' }, // i18n-exempt
  { id: 'mission', label: 'Mission' }, // i18n-exempt
];

export function preArmCategoryLabel(id: PreArmCategory): string {
  return t(`shared:prearmChecks.category.${id}`);
}

const PREARM_PATTERNS: PreArmPatternDef[] = [
  // Motors
  {
    pattern: /Motors:.*frame class|Check firmware or FRAME/i,
    category: 'motors',
    fix: { hintKey: 'shared:prearmChecks.hint.apFrameClass', params: ['FRAME_CLASS', 'FRAME_TYPE'] },
  },
  {
    pattern: /Throttle.*(too high|not low)|throttle.*(above|high)/i,
    category: 'rc',
    fix: { hintKey: 'shared:prearmChecks.hint.apThrottleHigh', links: [configTab('receiver', 'shared:prearmChecks.link.checkRcInputs')] },
  },
  // Sensors
  {
    pattern: /Compass.*(not calibrated|offsets)|Compass.*calibration/i,
    category: 'sensors',
    fix: { hintKey: 'shared:prearmChecks.hint.apCompassUncalibrated', links: [calibrate('compass', 'shared:prearmChecks.link.calibrateCompass')] },
  },
  {
    pattern: /Compasses inconsistent|Check mag field|mag field/i,
    category: 'sensors',
    fix: {
      hintKey: 'shared:prearmChecks.hint.apCompassInconsistent',
      links: [calibrate('compass', 'shared:prearmChecks.link.calibrateCompass'), configTab('sensor-config', 'shared:prearmChecks.link.compassSetup')],
    },
  },
  {
    pattern: /Compass not healthy/i,
    category: 'sensors',
    fix: { hintKey: 'shared:prearmChecks.hint.apCompassUnhealthy', links: [configTab('sensor-config', 'shared:prearmChecks.link.compassSetup')] },
  },
  {
    pattern: /Gyros? (inconsistent|not calibrated|not healthy)/i,
    category: 'sensors',
    fix: { hintKey: 'shared:prearmChecks.hint.apGyro', links: [calibrate('gyro', 'shared:prearmChecks.link.calibrateGyro')] },
  },
  {
    pattern: /Accels? (inconsistent|not calibrated|not healthy|calibration needed)|Accel.*(not calibrated|calibration needed)/i,
    category: 'sensors',
    fix: { hintKey: 'shared:prearmChecks.hint.apAccel', links: [calibrate('accel-6point', 'shared:prearmChecks.link.calibrateAccel')] },
  },
  {
    pattern: /Baro.*not healthy/i,
    category: 'sensors',
    fix: { hintKey: 'shared:prearmChecks.hint.apBaro' },
  },
  {
    pattern: /Airspeed.*not healthy|Airspeed.*(fail|not)/i,
    category: 'sensors',
    fix: { hintKey: 'shared:prearmChecks.hint.apAirspeed', links: [configTab('sensor-config', 'shared:prearmChecks.link.sensorSetup')] },
  },
  {
    pattern: /AHRS.*not healthy/i,
    category: 'sensors',
    fix: { hintKey: 'shared:prearmChecks.hint.apAhrsNotReady' },
  },
  {
    pattern: /Rangefinder.*not healthy/i,
    category: 'sensors',
    fix: { hintKey: 'shared:prearmChecks.hint.apRangefinder', params: ['RNGFND1_TYPE'] },
  },
  // EKF / Estimation
  {
    pattern: /EKF.*attitude.*bad/i,
    category: 'sensors',
    fix: { hintKey: 'shared:prearmChecks.hint.apEkfAttitude', links: [openView('sitl', 'shared:prearmChecks.link.openSitl')] },
  },
  {
    pattern: /AHRS.*inconsistent/i,
    category: 'sensors',
    fix: { hintKey: 'shared:prearmChecks.hint.apAhrsInconsistent', links: [calibrate('accel-6point', 'shared:prearmChecks.link.calibrateAccel')] },
  },
  {
    pattern: /Need Position Estimate/i,
    category: 'sensors',
    fix: { hintKey: 'shared:prearmChecks.hint.apNeedPosition' },
  },
  {
    pattern: /Need Alt Estimate/i,
    category: 'sensors',
    fix: { hintKey: 'shared:prearmChecks.hint.apNeedAlt' },
  },
  {
    pattern: /Wait or rebo/i,
    category: 'sensors',
    fix: { hintKey: 'shared:prearmChecks.hint.apWaitOrReboot' },
  },
  // GPS
  {
    pattern: /Need 3D Fix/i,
    category: 'gps',
    fix: { hintKey: 'shared:prearmChecks.hint.apNeed3dFix' },
  },
  {
    pattern: /GPS.*(not ready|Bad|not healthy)/i,
    category: 'gps',
    fix: { hintKey: 'shared:prearmChecks.hint.apGpsNotReady', links: [configTab('sensor-config', 'shared:prearmChecks.link.gpsSetup')] },
  },
  // RC
  {
    pattern: /RC not calibrated/i,
    category: 'rc',
    fix: { hintKey: 'shared:prearmChecks.hint.apRcUncalibrated', links: [configTab('receiver', 'shared:prearmChecks.link.calibrateRadio')] },
  },
  {
    pattern: /Radio failsafe|RC failsafe|Throttle.*below failsafe/i,
    category: 'rc',
    fix: {
      hintKey: 'shared:prearmChecks.hint.apRadioFailsafe',
      links: [configTab('receiver', 'shared:prearmChecks.link.checkRcInputs'), configTab('safety', 'shared:prearmChecks.link.failsafeSettings')],
    },
  },
  // Battery
  {
    pattern: /Battery.*(not healthy|too low|failsafe|below)/i,
    category: 'battery',
    fix: { hintKey: 'shared:prearmChecks.hint.apBattery', links: [configTab('battery', 'shared:prearmChecks.link.batterySetup')] },
  },
  // System
  {
    pattern: /Logging.*(not available|failed)|No SD card|SD card/i,
    category: 'system',
    fix: { hintKey: 'shared:prearmChecks.hint.apLogging', links: [configTab('logging', 'shared:prearmChecks.link.loggingSetup')] },
  },
  {
    pattern: /Hardware safety switch/i,
    category: 'system',
    fix: { hintKey: 'shared:prearmChecks.hint.apSafetySwitch' },
  },
  {
    pattern: /Check board type/i,
    category: 'system',
    fix: { hintKey: 'shared:prearmChecks.hint.apBoardType', params: ['BRD_TYPE'] },
  },
  // Mission
  {
    pattern: /Fence.*(requires position|breach)/i,
    category: 'mission',
    fix: { hintKey: 'shared:prearmChecks.hint.apFence', links: [openView('mission', 'shared:prearmChecks.link.openFence')] },
  },
  {
    pattern: /Mission.*(not valid|no first item)|missing takeoff/i,
    category: 'mission',
    fix: { hintKey: 'shared:prearmChecks.hint.apMission', links: [openView('mission', 'shared:prearmChecks.link.openMission')] },
  },
];

// Any ArduPilot pre-arm message without a known fix.
const GENERIC_FALLBACK: PreArmPatternDef = {
  pattern: /.*/,
  category: 'system',
  fix: {
    hintKey: 'shared:prearmChecks.hint.apGeneric',
    links: [docs(ARDUPILOT_PREARM_DOCS, 'shared:prearmChecks.link.ardupilotReference')],
  },
};

/**
 * ArduPilot re-broadcasts every failing pre-arm check roughly every 30 s while
 * disarmed (PREARM_DISPLAY_PERIOD). A pre-arm message older than this window
 * means the FC has stopped reporting it - the failure is resolved (e.g. a
 * fresh battery was plugged in). One broadcast period plus margin.
 */
export const PREARM_STALE_MS = 40_000;

/**
 * PX4 arming / preflight failure patterns. PX4 emits different STATUSTEXT
 * wording than ArduPilot ("Arming denied:", "Preflight Fail:", "Preflight: ")
 * and uses COM_/EKF2_/BAT_/GF_ parameter names. Kept separate from the
 * ArduPilot array so a PX4 connection never matches an ArduPilot-only hint
 * (and vice versa).
 *
 * Sources: PX4 commander/preflight check messages, PX4 parameter reference.
 */
const PX4_PREARM_PATTERNS: PreArmPatternDef[] = [
  // GPS / position estimate
  {
    pattern: /(global position|position).*(not ready|denied|fail|estimate)|(estimator|position).*(not ready|fail)/i,
    category: 'gps',
    fix: { hintKey: 'shared:prearmChecks.hint.px4PositionEstimate' },
  },
  {
    pattern: /\b(gps|gnss)\b.*(fix|lock|not ready|fail)|need.*3d fix/i,
    category: 'gps',
    fix: { hintKey: 'shared:prearmChecks.hint.px4GpsFix', links: [configTab('sensor-config', 'shared:prearmChecks.link.gpsSetup')] },
  },
  // Sensors / calibration
  {
    pattern: /(compass|mag(netometer)?).*(not calibrated|inconsistent|fail|interference)/i,
    category: 'sensors',
    fix: { hintKey: 'shared:prearmChecks.hint.px4Mag', links: [calibrate('compass', 'shared:prearmChecks.link.calibrateCompass')] },
  },
  {
    pattern: /accel(erometer)?.*(not calibrated|inconsistent|fail)/i,
    category: 'sensors',
    fix: { hintKey: 'shared:prearmChecks.hint.px4Accel', links: [calibrate('accel-6point', 'shared:prearmChecks.link.calibrateAccel')] },
  },
  {
    pattern: /gyro(scope)?.*(not calibrated|inconsistent|fail)/i,
    category: 'sensors',
    fix: { hintKey: 'shared:prearmChecks.hint.px4Gyro', links: [calibrate('gyro', 'shared:prearmChecks.link.calibrateGyro')] },
  },
  {
    pattern: /(accelerometer.*clipping|high vibration|vibration)/i,
    category: 'sensors',
    fix: { hintKey: 'shared:prearmChecks.hint.px4Vibration' },
  },
  {
    pattern: /(attitude|tilt).*(estimate|quality|too large|fail)|(estimator|quality).*(attitude|tilt)/i,
    category: 'sensors',
    fix: { hintKey: 'shared:prearmChecks.hint.px4Attitude' },
  },
  // RC / manual control
  {
    pattern: /(rc|radio|manual control).*(not calibrated|lost|fail|not configured)/i,
    category: 'rc',
    fix: { hintKey: 'shared:prearmChecks.hint.px4Radio', links: [configTab('receiver', 'shared:prearmChecks.link.calibrateRadio')] },
  },
  // Battery
  {
    pattern: /(battery).*(low|unhealthy|warning|critical|not connected)/i,
    category: 'battery',
    fix: { hintKey: 'shared:prearmChecks.hint.px4Battery', links: [configTab('battery', 'shared:prearmChecks.link.batterySetup')] },
  },
  // ESC / motors
  {
    pattern: /(esc|motor).*(fail|not|telemetry|unhealthy)/i,
    category: 'motors',
    fix: { hintKey: 'shared:prearmChecks.hint.px4Esc' },
  },
  // Geofence
  {
    pattern: /(geofence|\bgf\b)/i,
    category: 'mission',
    fix: { hintKey: 'shared:prearmChecks.hint.px4Geofence', links: [openView('mission', 'shared:prearmChecks.link.openFence')] },
  },
  // Home position
  {
    pattern: /(home position|home not set)/i,
    category: 'mission',
    fix: { hintKey: 'shared:prearmChecks.hint.px4Home' },
  },
  // Kill switch / safety
  {
    pattern: /(kill switch|emergency)/i,
    category: 'system',
    fix: { hintKey: 'shared:prearmChecks.hint.px4KillSwitch' },
  },
];

// Any PX4 arming or preflight failure without a known fix.
const PX4_GENERIC_FALLBACK: PreArmPatternDef = {
  pattern: /.*/,
  category: 'system',
  fix: {
    hintKey: 'shared:prearmChecks.hint.px4Generic',
    links: [docs(PX4_PREARM_DOCS, 'shared:prearmChecks.link.px4Reference')],
  },
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
      return { pattern: translatePattern(entry), reason };
    }
  }

  // Fallback: it's a pre-arm message but no specific pattern matched
  return { pattern: translatePattern(fallback), reason };
}

function translatePattern(entry: PreArmPatternDef): PreArmPattern {
  const { hintKey, links, params } = entry.fix;
  const fix: PreArmFix = { hint: t(hintKey) };
  if (links) fix.links = links.map((link) => ({ ...link, label: t(link.label) }));
  if (params) fix.params = params;
  return { pattern: entry.pattern, category: entry.category, fix };
}
