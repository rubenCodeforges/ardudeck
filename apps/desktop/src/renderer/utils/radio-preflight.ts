import { t } from '../../shared/i18n/index.js';

/**
 * Radio link preflight: plain-language checks that the vehicle is configured
 * to work over a MAVLink radio link (ELRS MAVLink mode, mLRS, etc.), with
 * machine-applicable fixes. Evaluated against the downloaded parameter set -
 * pure and unit-testable, no store or IPC dependencies.
 */

export interface PreflightFixParam {
  param: string;
  value: number;
}

export interface PreflightCheck {
  id: 'rc-over-mavlink' | 'rssi-source' | 'firmware-version';
  /** Plain-language check name - no parameter names. */
  title: string;
  /** One sentence: what this means for the user. */
  detail: string;
  status: 'pass' | 'fail' | 'unknown';
  /** Parameter writes that make the check pass, when auto-fixable. */
  fix: PreflightFixParam[] | null;
}

const RC_PROTOCOLS_ALL_BIT = 1;
const RC_PROTOCOLS_MAVLINK_RC_BIT = 65536; // bit 16, ArduPilot 4.6+ (MAVLINK_RADIO enum 15, +1 offset)

/** Parse "ArduRover V4.6.3 (3fc7011a)" style banners. */
export function parseArduPilotVersion(banner: string): { major: number; minor: number } | null {
  const m = banner.match(/Ardu\w+\s+V(\d+)\.(\d+)/i);
  if (!m) return null;
  return { major: parseInt(m[1]!, 10), minor: parseInt(m[2]!, 10) };
}

export function evaluateRadioPreflight(
  getParam: (name: string) => number | undefined,
  firmwareBanner: string | null,
): PreflightCheck[] {
  const checks: PreflightCheck[] = [];

  const rcProtocols = getParam('RC_PROTOCOLS');
  if (rcProtocols === undefined) {
    checks.push({
      id: 'rc-over-mavlink',
      title: t('utils:radioPreflight.rcOverMavlink'),
      detail: t('utils:radioPreflight.waitingParams'),
      status: 'unknown',
      fix: null,
    });
  } else if ((rcProtocols & RC_PROTOCOLS_ALL_BIT) !== 0 || (rcProtocols & RC_PROTOCOLS_MAVLINK_RC_BIT) !== 0) {
    checks.push({
      id: 'rc-over-mavlink',
      title: t('utils:radioPreflight.rcOverMavlink'),
      detail: t('utils:radioPreflight.rcOverMavlinkPass'),
      status: 'pass',
      fix: null,
    });
  } else {
    checks.push({
      id: 'rc-over-mavlink',
      title: t('utils:radioPreflight.rcOverMavlink'),
      detail: t('utils:radioPreflight.rcOverMavlinkFail'),
      status: 'fail',
      fix: [{ param: 'RC_PROTOCOLS', value: rcProtocols | RC_PROTOCOLS_MAVLINK_RC_BIT }],
    });
  }

  const rssiType = getParam('RSSI_TYPE');
  if (rssiType === undefined) {
    checks.push({
      id: 'rssi-source',
      title: t('utils:radioPreflight.rssiSource'),
      detail: t('utils:radioPreflight.waitingParams'),
      status: 'unknown',
      fix: null,
    });
  } else if (rssiType === 5) {
    checks.push({
      id: 'rssi-source',
      title: t('utils:radioPreflight.rssiSource'),
      detail: t('utils:radioPreflight.rssiSourcePass'),
      status: 'pass',
      fix: null,
    });
  } else {
    checks.push({
      id: 'rssi-source',
      title: t('utils:radioPreflight.rssiSource'),
      detail: t('utils:radioPreflight.rssiSourceFail'),
      status: 'fail',
      fix: [{ param: 'RSSI_TYPE', value: 5 }],
    });
  }

  const version = firmwareBanner ? parseArduPilotVersion(firmwareBanner) : null;
  if (!version) {
    checks.push({
      id: 'firmware-version',
      title: t('utils:radioPreflight.firmwareVersion'),
      detail: t('utils:radioPreflight.firmwareUnknown'),
      status: 'unknown',
      fix: null,
    });
  } else if (version.major > 4 || (version.major === 4 && version.minor >= 6)) {
    checks.push({
      id: 'firmware-version',
      title: t('utils:radioPreflight.firmwareVersion'),
      detail: t('utils:radioPreflight.firmwarePass', { major: version.major, minor: version.minor }),
      status: 'pass',
      fix: null,
    });
  } else {
    checks.push({
      id: 'firmware-version',
      title: t('utils:radioPreflight.firmwareVersion'),
      detail: t('utils:radioPreflight.firmwareFail', { major: version.major, minor: version.minor }),
      status: 'fail',
      fix: null,
    });
  }

  return checks;
}
