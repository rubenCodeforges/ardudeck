import { describe, it, expect } from 'vitest';
import {
  INAV_NAV_SETTING_NAMES,
  INAV_NAV_NUMERIC_SETTINGS,
  navConfigFromSettings,
  navConfigToSettingWrites,
  gpsConfigFromInav,
  planInavGpsWrite,
  INAV_MISC_GPS_TYPE_OFFSET,
  INAV_MISC_GPS_SBAS_OFFSET,
} from './inav-nav-gps.js';

// Names as they appear in inav-configurator tabs/advanced_tuning.html data-setting attributes.
const CONFIGURATOR_NAV_SETTINGS = [
  'nav_auto_speed', 'nav_mc_auto_climb_rate', 'nav_manual_speed', 'nav_mc_manual_climb_rate',
  'nav_land_maxalt_vspd', 'nav_land_slowdown_minalt', 'nav_land_slowdown_maxalt', 'nav_emerg_landing_speed',
  'nav_rth_abort_threshold', 'nav_rth_altitude', 'nav_wp_radius', 'nav_mc_bank_angle', 'nav_mc_hover_thr',
  'nav_rth_alt_mode', 'nav_user_control_mode', 'nav_mc_althold_throttle',
];

const fc = {
  nav_auto_speed: 300,
  nav_mc_auto_climb_rate: 500,
  nav_manual_speed: 500,
  nav_mc_manual_climb_rate: 200,
  nav_land_maxalt_vspd: 200,
  nav_land_slowdown_minalt: 500,
  nav_land_slowdown_maxalt: 2000,
  nav_emerg_landing_speed: 500,
  nav_rth_abort_threshold: 50000,
  nav_rth_altitude: 1000,
  nav_wp_radius: 100,
  nav_mc_bank_angle: 30,
  nav_mc_hover_thr: 1300,
  nav_rth_alt_mode: 'AT_LEAST',
  nav_user_control_mode: 'ATTI',
  nav_mc_althold_throttle: 'HOVER',
};

describe('nav config via INAV settings', () => {
  it('uses only setting names the configurator uses', () => {
    expect([...INAV_NAV_SETTING_NAMES].sort()).toEqual([...CONFIGURATOR_NAV_SETTINGS].sort());
  });

  it('maps the renderer fields to the expected settings (units unchanged)', () => {
    expect(INAV_NAV_NUMERIC_SETTINGS.rthAltitude).toBe('nav_rth_altitude');
    expect(INAV_NAV_NUMERIC_SETTINGS.maxNavigationSpeed).toBe('nav_auto_speed');
    expect(INAV_NAV_NUMERIC_SETTINGS.waypointRadius).toBe('nav_wp_radius');
    expect(INAV_NAV_NUMERIC_SETTINGS.emergencyDescentRate).toBe('nav_emerg_landing_speed');
  });

  it('reads settings into the renderer shape', () => {
    expect(navConfigFromSettings(fc)).toEqual({
      maxNavigationSpeed: 300,
      maxClimbRate: 500,
      maxManualSpeed: 500,
      maxManualClimbRate: 200,
      landDescendRate: 200,
      landSlowdownMinAlt: 500,
      landSlowdownMaxAlt: 2000,
      emergencyDescentRate: 500,
      rthAbortThreshold: 50000,
      rthAltitude: 1000,
      waypointRadius: 100,
      maxBankAngle: 30,
      hoverThrottle: 1300,
      rthAltControlMode: 4,
      userControlMode: 0,
      useThrottleMidForAlthold: false,
    });
  });

  it('leaves out settings the FC did not return', () => {
    const cfg = navConfigFromSettings({ nav_rth_altitude: 1500, nav_wp_radius: null });
    expect(cfg).toEqual({ rthAltitude: 1500 });
  });

  it('reports an RTH mode outside the renderer list as -1', () => {
    expect(navConfigFromSettings({ nav_rth_alt_mode: 'AT_LEAST_LINEAR_DESCENT' }).rthAltControlMode).toBe(-1);
  });

  it('writes nothing when nothing changed', () => {
    const { writes, unsupported } = navConfigToSettingWrites(navConfigFromSettings(fc), fc);
    expect(writes).toEqual({});
    expect(unsupported).toEqual([]);
  });

  it('writes only changed settings, enums by name', () => {
    const cfg = { ...navConfigFromSettings(fc), rthAltitude: 3000, rthAltControlMode: 2 };
    expect(navConfigToSettingWrites(cfg, fc).writes).toEqual({ nav_rth_altitude: 3000, nav_rth_alt_mode: 'FIXED' });
  });

  it('does not clobber althold HOVER when the renderer bool is false', () => {
    const cfg = { useThrottleMidForAlthold: false };
    expect(navConfigToSettingWrites(cfg, fc).writes).toEqual({});
    expect(navConfigToSettingWrites({ useThrottleMidForAlthold: true }, fc).writes)
      .toEqual({ nav_mc_althold_throttle: 'MID_STICK' });
    expect(navConfigToSettingWrites({ useThrottleMidForAlthold: false }, { ...fc, nav_mc_althold_throttle: 'MID_STICK' }).writes)
      .toEqual({ nav_mc_althold_throttle: 'STICK' });
  });

  it('skips an unknown (-1) enum and ignores waypointSafeAlt', () => {
    const { writes, unsupported } = navConfigToSettingWrites({ rthAltControlMode: -1, waypointSafeAlt: 5000 }, fc);
    expect(writes).toEqual({});
    expect(unsupported).toEqual([]);
  });

  it('flags a field whose setting the FC lacks', () => {
    const { unsupported } = navConfigToSettingWrites({ rthAltitude: 2000 }, { nav_rth_altitude: null });
    expect(unsupported).toEqual(['rthAltitude']);
  });
});

describe('GPS config via MSPV2_INAV_MISC + settings', () => {
  const misc = () => {
    const m = new Uint8Array(41);
    for (let i = 0; i < m.length; i++) m[i] = (i * 7 + 3) & 0xff;
    m[INAV_MISC_GPS_TYPE_OFFSET] = 0; // UBLOX
    m[INAV_MISC_GPS_SBAS_OFFSET] = 0; // AUTO
    return m;
  };
  const settings = { gps_ublox_use_galileo: 'ON', gps_auto_config: 'ON', gps_auto_baud: 'OFF' };

  it('reads protocol and SBAS from MISC and maps them to the renderer numbering', () => {
    const m = misc();
    m[INAV_MISC_GPS_TYPE_OFFSET] = 1; // MSP
    m[INAV_MISC_GPS_SBAS_OFFSET] = 6; // NONE
    expect(gpsConfigFromInav(m, settings)).toEqual({
      provider: 2, sbasMode: 5, ubloxUseGalileo: true, autoConfig: true, autoBaud: false, homePointOnce: false,
    });
  });

  it('writes nothing when nothing changed', () => {
    const m = misc();
    const plan = planInavGpsWrite(gpsConfigFromInav(m, settings)!, m, settings);
    expect(plan).toEqual({ misc: null, writes: {}, unsupported: [] });
  });

  it('patches only the gps_type and SBAS bytes of MISC and echoes everything else', () => {
    const m = misc();
    const cfg = { ...gpsConfigFromInav(m, settings)!, provider: 3, sbasMode: 5 };
    const plan = planInavGpsWrite(cfg, m, settings);
    expect(plan.misc).not.toBeNull();
    expect(plan.misc!.length).toBe(41);
    for (let i = 0; i < 41; i++) {
      if (i === INAV_MISC_GPS_TYPE_OFFSET) expect(plan.misc![i]).toBe(2); // FAKE
      else if (i === INAV_MISC_GPS_SBAS_OFFSET) expect(plan.misc![i]).toBe(6); // NONE
      else expect(plan.misc![i]).toBe(m[i]);
    }
  });

  it('writes GPS toggles as ON/OFF settings', () => {
    const m = misc();
    const cfg = { ...gpsConfigFromInav(m, settings)!, ubloxUseGalileo: false, autoBaud: true };
    expect(planInavGpsWrite(cfg, m, settings).writes).toEqual({ gps_ublox_use_galileo: 'OFF', gps_auto_baud: 'ON' });
  });

  it('refuses NMEA and home-once, which INAV 9 does not have', () => {
    const m = misc();
    const cfg = { ...gpsConfigFromInav(m, settings)!, provider: 0, homePointOnce: true };
    expect(planInavGpsWrite(cfg, m, settings).unsupported).toEqual(['provider', 'homePointOnce']);
  });
});
