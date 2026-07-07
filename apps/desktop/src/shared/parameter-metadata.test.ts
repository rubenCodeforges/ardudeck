import { describe, it, expect } from 'vitest';
import {
  validateParameterValue,
  getParameterDocsUrl,
  parseFirmwareVersionTag,
  paramNameToDocFragment,
  vehicleTypeToDocsSlug,
  vehicleTypeToDocsTitle,
  resolveArduPilotDocsContext,
  vehicleNameToVehicleType,
  firmwareVersionTagFromFlightSwVersion,
  packFlightSwVersion,
  FIRMWARE_VERSION_TYPE_OFFICIAL,
  type ParameterMetadata,
} from './parameter-metadata';

describe('validateParameterValue', () => {
  describe('enum value validation (values list)', () => {
    const servoFunctionMetadata: ParameterMetadata = {
      name: 'SERVO5_FUNCTION',
      humanName: 'Servo 5 Function',
      description: 'Function assigned to servo 5',
      values: {
        [-1]: 'GPIO',
        0: 'Disabled',
        1: 'RCPassThru',
        33: 'Motor1',
        34: 'Motor2',
      },
    };

    it('should accept -1 (GPIO) as a valid enum value', () => {
      const result = validateParameterValue(-1, servoFunctionMetadata);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.warning).toBeUndefined();
    });

    it('should accept 0 (Disabled) as a valid enum value', () => {
      const result = validateParameterValue(0, servoFunctionMetadata);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept other known enum values', () => {
      const result = validateParameterValue(33, servoFunctionMetadata);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should warn but still validate for unknown enum values', () => {
      const result = validateParameterValue(999, servoFunctionMetadata);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.warning).toBeDefined();
      expect(result.warning).toContain('999');
    });

    it('should warn but not block negative values not in the list', () => {
      const result = validateParameterValue(-5, servoFunctionMetadata);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.warning).toBeDefined();
    });
  });

  describe('no metadata', () => {
    it('should allow any value when no metadata is provided', () => {
      const result = validateParameterValue(-1, undefined);
      expect(result.valid).toBe(true);
    });
  });

  describe('range validation', () => {
    const rangeMetadata: ParameterMetadata = {
      name: 'SOME_PARAM',
      humanName: 'Some Param',
      description: 'Test param with range',
      range: { min: -10, max: 100 },
    };

    it('should accept values within range', () => {
      expect(validateParameterValue(50, rangeMetadata).valid).toBe(true);
      expect(validateParameterValue(-10, rangeMetadata).valid).toBe(true);
      expect(validateParameterValue(100, rangeMetadata).valid).toBe(true);
    });

    it('should reject values outside range', () => {
      const result = validateParameterValue(-11, rangeMetadata);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('bitmask validation', () => {
    const bitmaskMetadata: ParameterMetadata = {
      name: 'BITMASK_PARAM',
      humanName: 'Bitmask Param',
      description: 'Test bitmask param',
      bitmask: { 0: 'Bit0', 1: 'Bit1', 2: 'Bit2' },
    };

    it('should reject negative values for bitmask params', () => {
      const result = validateParameterValue(-1, bitmaskMetadata);
      expect(result.valid).toBe(false);
    });

    it('should accept non-negative integer values for bitmask params', () => {
      expect(validateParameterValue(0, bitmaskMetadata).valid).toBe(true);
      expect(validateParameterValue(7, bitmaskMetadata).valid).toBe(true);
    });
  });
});

describe('parseParameterXml value regex - negative code support', () => {
  // Test the regex pattern directly since parseParameterXml is not exported
  const valueRegex = /<value\s+code="(-?\d+)"[^>]*>([^<]*)<\/value>/g;

  it('should match positive value codes', () => {
    const xml = '<value code="0">Disabled</value>';
    const match = valueRegex.exec(xml);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('0');
    expect(match![2]).toBe('Disabled');
  });

  it('should match negative value codes like -1 for GPIO', () => {
    valueRegex.lastIndex = 0;
    const xml = '<value code="-1">GPIO</value>';
    const match = valueRegex.exec(xml);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('-1');
    expect(match![2]).toBe('GPIO');
  });

  it('should match all values including negative ones in a block', () => {
    valueRegex.lastIndex = 0;
    const xml = `
      <value code="-1">GPIO</value>
      <value code="0">Disabled</value>
      <value code="1">RCPassThru</value>
      <value code="33">Motor1</value>
    `;
    const matches: Array<{ code: string; label: string }> = [];
    let match;
    while ((match = valueRegex.exec(xml)) !== null) {
      matches.push({ code: match[1]!, label: match[2]!.trim() });
    }
    expect(matches).toHaveLength(4);
    expect(matches[0]).toEqual({ code: '-1', label: 'GPIO' });
    expect(matches[1]).toEqual({ code: '0', label: 'Disabled' });
    expect(matches[2]).toEqual({ code: '1', label: 'RCPassThru' });
    expect(matches[3]).toEqual({ code: '33', label: 'Motor1' });
  });

  it('should parse negative codes as negative numbers', () => {
    valueRegex.lastIndex = 0;
    const xml = '<value code="-1">GPIO</value>';
    const match = valueRegex.exec(xml);
    expect(match).not.toBeNull();
    const codeNumber = parseInt(match![1]!, 10);
    expect(codeNumber).toBe(-1);
  });

  // Verify the OLD regex would have failed
  it('old regex without negative support would miss -1 codes', () => {
    const oldValueRegex = /<value\s+code="(\d+)"[^>]*>([^<]*)<\/value>/g;
    const xml = '<value code="-1">GPIO</value>';
    const match = oldValueRegex.exec(xml);
    expect(match).toBeNull(); // Old regex cannot match negative codes
  });
});

describe('vehicleTypeToDocsSlug / vehicleTypeToDocsTitle', () => {
  it('maps all ArduPilot vehicles including tracker → antennatracker', () => {
    expect(vehicleTypeToDocsSlug('copter')).toBe('copter');
    expect(vehicleTypeToDocsSlug('plane')).toBe('plane');
    expect(vehicleTypeToDocsSlug('rover')).toBe('rover');
    expect(vehicleTypeToDocsSlug('sub')).toBe('sub');
    expect(vehicleTypeToDocsSlug('tracker')).toBe('antennatracker');
    expect(vehicleTypeToDocsTitle('copter')).toBe('Copter');
    expect(vehicleTypeToDocsTitle('tracker')).toBe('AntennaTracker');
  });
});

describe('parseFirmwareVersionTag', () => {
  it('parses V-prefixed three-part semver', () => {
    expect(parseFirmwareVersionTag('ArduCopter V4.6.3')).toBe('V4.6.3');
  });

  it('parses plain three-part semver', () => {
    expect(parseFirmwareVersionTag('APM:Copter 4.5.7')).toBe('V4.5.7');
  });

  it('returns null for two-part versions (Sphinx pages need full V*.*.*)', () => {
    expect(parseFirmwareVersionTag('V4.6')).toBeNull();
    expect(parseFirmwareVersionTag('Copter 4.6')).toBeNull();
  });

  it('returns null for pre-release / custom builds', () => {
    expect(parseFirmwareVersionTag('ArduCopter V4.6.3-dev')).toBeNull();
    expect(parseFirmwareVersionTag('4.5.7-rc1')).toBeNull();
    expect(parseFirmwareVersionTag('custom-build-xyz')).toBeNull();
    expect(parseFirmwareVersionTag('beta 4.5.7')).toBeNull();
  });

  it('returns null when unparseable (caller uses parameters.html)', () => {
    expect(parseFirmwareVersionTag('')).toBeNull();
    expect(parseFirmwareVersionTag(null)).toBeNull();
  });
});

describe('paramNameToDocFragment', () => {
  it('lowercases and hyphenates underscores', () => {
    expect(paramNameToDocFragment('AHRS_GPS_MINSATS')).toBe('ahrs-gps-minsats');
    expect(paramNameToDocFragment('ARMING_CHECK')).toBe('arming-check');
  });
});

describe('getParameterDocsUrl', () => {
  it('builds versioned URL with hyphenated fragment', () => {
    const url = getParameterDocsUrl('copter', 'AHRS_GPS_MINSATS', 'V4.5.7');
    expect(url).toBe(
      'https://ardupilot.org/copter/docs/parameters-Copter-stable-V4.5.7.html#ahrs-gps-minsats',
    );
  });

  it('uses unversioned parameters.html when version unknown', () => {
    const url = getParameterDocsUrl('plane', 'FLTMODE1', null);
    expect(url).toBe('https://ardupilot.org/plane/docs/parameters.html#fltmode1');
  });

  it('never emits parameters-*-stable-latest.html', () => {
    const url = getParameterDocsUrl('copter', 'ARMING_CHECK', 'latest');
    expect(url).not.toContain('stable-latest');
    expect(url).toContain('/parameters.html#arming-check');
  });

  it('falls back to unversioned for incomplete version tags', () => {
    const url = getParameterDocsUrl('copter', 'ARMING_CHECK', 'V4.6');
    expect(url).toBe('https://ardupilot.org/copter/docs/parameters.html#arming-check');
  });

  it('uses antennatracker path for tracker', () => {
    const url = getParameterDocsUrl('tracker', 'SERVO1_FUNCTION', null);
    expect(url).toContain('/antennatracker/docs/parameters.html#');
  });
});

describe('resolveArduPilotDocsContext', () => {
  it('resolves ArduPilot copter with firmware version', () => {
    const ctx = resolveArduPilotDocsContext({
      protocol: 'mavlink',
      autopilot: 'ArduPilot',
      mavType: 2,
      firmwareVersion: 'V4.6.3',
    });
    expect(ctx?.vehicleType).toBe('copter');
    expect(ctx?.versionTag).toBe('V4.6.3');
  });

  it('returns null for msp', () => {
    expect(
      resolveArduPilotDocsContext({
        protocol: 'msp',
        autopilot: 'BTFL',
        vehicleType: 'copter',
      }),
    ).toBeNull();
  });

  it('returns null for non-ArduPilot mavlink autopilot', () => {
    expect(
      resolveArduPilotDocsContext({
        protocol: 'mavlink',
        autopilot: 'PX4',
        mavType: 2,
        firmwareVersion: 'v1.15.0',
      }),
    ).toBeNull();
  });

  it('falls back to offline vehicle type without live autopilot', () => {
    const ctx = resolveArduPilotDocsContext({
      offlineVehicleType: 'Copter',
    });
    expect(ctx?.vehicleType).toBe('copter');
    expect(ctx?.versionTag).toBeNull();
  });

  it('prefers offline vehicle type over stale live vehicleType', () => {
    const ctx = resolveArduPilotDocsContext({
      vehicleType: 'Plane',
      offlineVehicleType: 'Rover',
    });
    expect(ctx?.vehicleType).toBe('rover');
  });

  it('returns null for non-ArduPilot offline labels', () => {
    expect(
      resolveArduPilotDocsContext({ offlineVehicleType: 'BTFL' }),
    ).toBeNull();
    expect(
      resolveArduPilotDocsContext({ offlineVehicleType: 'PX4' }),
    ).toBeNull();
  });

  it('rejects non-ArduPilot autopilot even without protocol', () => {
    expect(
      resolveArduPilotDocsContext({
        autopilot: 'PX4',
        mavType: 2,
        vehicleType: 'Quadrotor',
      }),
    ).toBeNull();
  });

  it('rejects bare vehicleType without AP context signal', () => {
    expect(
      resolveArduPilotDocsContext({ vehicleType: 'Copter' }),
    ).toBeNull();
  });
});

describe('vehicleNameToVehicleType', () => {
  it('maps MAV type display names used in headers', () => {
    expect(vehicleNameToVehicleType('Quadrotor')).toBe('copter');
    expect(vehicleNameToVehicleType('Hexarotor')).toBe('copter');
    expect(vehicleNameToVehicleType('Octorotor')).toBe('copter');
    expect(vehicleNameToVehicleType('Fixed Wing')).toBe('plane');
    expect(vehicleNameToVehicleType('Ground Rover')).toBe('rover');
    expect(vehicleNameToVehicleType('Antenna Tracker')).toBe('tracker');
  });
});

describe('firmwareVersionTagFromFlightSwVersion (vType packing)', () => {
  it('emits Vmajor.minor.patch only for official/stable type 255', () => {
    const official = packFlightSwVersion(4, 6, 3, FIRMWARE_VERSION_TYPE_OFFICIAL);
    expect(firmwareVersionTagFromFlightSwVersion(official)).toBe('V4.6.3');
  });

  it('returns undefined for dev/beta/rc type bytes', () => {
    expect(firmwareVersionTagFromFlightSwVersion(packFlightSwVersion(4, 6, 3, 0))).toBeUndefined(); // dev
    expect(firmwareVersionTagFromFlightSwVersion(packFlightSwVersion(4, 6, 3, 64))).toBeUndefined(); // alpha
    expect(firmwareVersionTagFromFlightSwVersion(packFlightSwVersion(4, 6, 3, 128))).toBeUndefined(); // beta
    expect(firmwareVersionTagFromFlightSwVersion(packFlightSwVersion(4, 6, 3, 192))).toBeUndefined(); // rc
  });

  it('returns undefined for zero / invalid packed values', () => {
    expect(firmwareVersionTagFromFlightSwVersion(0)).toBeUndefined();
  });
});
