/**
 * MSP IPC Handler Registration
 *
 * Wires all ipcMain.handle() calls to domain module functions.
 */

import { ipcMain, BrowserWindow } from 'electron';
import type {
  MSPPid,
  MSPRcTuning,
  MSPModeRange,
  MSPServoConfig,
  MSPServoMixerRule,
  MSPMotorMixerRule,
  MSPWaypoint,
  MSPNavConfig,
  MSPGpsConfig,
  MSPFailsafeConfig,
  MSPGpsRescueConfig,
  MSPGpsRescuePids,
  MSPFilterConfig,
  MSPVtxConfig,
} from '@ardudeck/msp-ts';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';
import { initCliHandlers, setCliModeChangeCallback } from '../cli/cli-handlers.js';
import { ctx } from './msp-context.js';

// Domain module imports
import { startMspTelemetry, stopMspTelemetry, getRc, setRawRc, startGpsSender, stopGpsSender } from './msp-telemetry.js';
import { getPid, setPid, getRcTuning, setRcTuning } from './msp-pid-rates.js';
import { getModeRanges, setModeRange, getBoxNames, getBoxIds, getFeatures, setFeatures, getStatus, getActiveBoxes } from './msp-modes.js';
import { getInavMixerConfig, getMixerConfig, setMixerConfig, setInavPlatformType } from './msp-mixer.js';
import { getServoConfigs, setServoConfig, saveServoConfigViaCli, getServoValues, getServoMixer, setServoMixerRule, probeServoConfigMode } from './msp-servo.js';
import { getMotorMixer, setMotorMixer, setMotorMixerRulesViaCli, setServoMixerRulesViaCli, readSmixViaCli, readMmixViaCli } from './msp-motor-mixer.js';
import { getWaypoints, setWaypoint, uploadWaypoints, saveWaypoints, clearWaypoints, getMissionInfo } from './msp-navigation.js';
import { getNavConfig, setNavConfig, getGpsConfig, setGpsConfig } from './msp-navigation.js';
import { getFailsafeConfig, setFailsafeConfig, getGpsRescueConfig, setGpsRescueConfig, getGpsRescuePids, setGpsRescuePids, getFilterConfig, setFilterConfig, getVtxConfig, setVtxConfig, getOsdConfig, getRxConfig, setRxConfig } from './msp-peripheral-config.js';
import { getSetting, setSetting, getSettings, setSettings } from './msp-settings.js';
import { saveEeprom, calibrateAcc, calibrateMag, reboot, resetMspCliFlags } from './msp-commands.js';
import { cleanupMspConnection } from './msp-cleanup.js';

export function registerMspHandlers(window: BrowserWindow): void {
  ctx.mainWindow = window;

  // Initialize CLI handlers
  initCliHandlers(window);

  // Set up CLI mode change callback to pause/resume telemetry and reset CLI flags
  setCliModeChangeCallback((cliActive) => {
    if (cliActive) {
      stopMspTelemetry();
    } else {
      // CRITICAL: Reset ALL CLI mode flags when CLI mode is exited
      // This ensures MSP operations aren't blocked by stale flags
      ctx.servoCliModeActive = false;
      ctx.tuningCliModeActive = false;
      startMspTelemetry();
    }
  });

  // Config handlers
  ipcMain.handle(IPC_CHANNELS.MSP_GET_PID, async () => getPid());
  ipcMain.handle(IPC_CHANNELS.MSP_SET_PID, async (_event, pid: MSPPid) => setPid(pid));
  ipcMain.handle(IPC_CHANNELS.MSP_GET_RC_TUNING, async () => getRcTuning());
  ipcMain.handle(IPC_CHANNELS.MSP_SET_RC_TUNING, async (_event, rcTuning: MSPRcTuning) => setRcTuning(rcTuning));
  ipcMain.handle(IPC_CHANNELS.MSP_GET_MODE_RANGES, async () => getModeRanges());
  ipcMain.handle(IPC_CHANNELS.MSP_SET_MODE_RANGE, async (_event, index: number, mode: MSPModeRange) => setModeRange(index, mode));
  ipcMain.handle(IPC_CHANNELS.MSP_GET_BOX_NAMES, async () => getBoxNames());
  ipcMain.handle(IPC_CHANNELS.MSP_GET_BOX_IDS, async () => getBoxIds());
  ipcMain.handle(IPC_CHANNELS.MSP_GET_FEATURES, async () => getFeatures());
  ipcMain.handle(IPC_CHANNELS.MSP_SET_FEATURES, async (_event, features: number) => setFeatures(features));
  ipcMain.handle(IPC_CHANNELS.MSP_GET_STATUS, async () => getStatus());
  ipcMain.handle(IPC_CHANNELS.MSP_GET_MIXER_CONFIG, async () => getMixerConfig());
  ipcMain.handle(IPC_CHANNELS.MSP_SET_MIXER_CONFIG, async (_event, mixerType: number) => setMixerConfig(mixerType));
  // iNav-specific mixer config (proper MSP2 commands)
  ipcMain.handle(IPC_CHANNELS.MSP_GET_INAV_MIXER_CONFIG, async () => getInavMixerConfig());
  ipcMain.handle(IPC_CHANNELS.MSP_SET_INAV_PLATFORM_TYPE, async (_event, platformType: number, mixerType?: number) => setInavPlatformType(platformType, mixerType));
  ipcMain.handle(IPC_CHANNELS.MSP_GET_RC, async () => getRc());

  // Servo config handlers (iNav)
  ipcMain.handle(IPC_CHANNELS.MSP_GET_SERVO_CONFIGS, async () => getServoConfigs());
  ipcMain.handle(IPC_CHANNELS.MSP_SET_SERVO_CONFIG, async (_event, index: number, config: MSPServoConfig) => setServoConfig(index, config));
  ipcMain.handle(IPC_CHANNELS.MSP_SAVE_SERVO_CLI, async () => saveServoConfigViaCli()); // CLI fallback for old iNav
  ipcMain.handle(IPC_CHANNELS.MSP_GET_SERVO_VALUES, async () => getServoValues());
  ipcMain.handle(IPC_CHANNELS.MSP_GET_SERVO_MIXER, async () => getServoMixer());
  ipcMain.handle(IPC_CHANNELS.MSP_SET_SERVO_MIXER, async (_event, index: number, rule: MSPServoMixerRule) => setServoMixerRule(index, rule));
  ipcMain.handle(IPC_CHANNELS.MSP_GET_SERVO_CONFIG_MODE, async () => probeServoConfigMode());
  ipcMain.handle(IPC_CHANNELS.MSP_GET_MOTOR_MIXER, async () => getMotorMixer());
  ipcMain.handle(IPC_CHANNELS.MSP_SET_MOTOR_MIXER, async (_event, rules: MSPMotorMixerRule[]) => setMotorMixer(rules));
  ipcMain.handle(IPC_CHANNELS.MSP_SET_MOTOR_MIXER_CLI, async (_event, rules: Array<{ motorIndex: number; throttle: number; roll: number; pitch: number; yaw: number }>) => setMotorMixerRulesViaCli(rules));
  ipcMain.handle(IPC_CHANNELS.MSP_SET_SERVO_MIXER_CLI, async (_event, rules: Array<{ servoIndex: number; inputSource: number; rate: number }>) => setServoMixerRulesViaCli(rules));
  ipcMain.handle(IPC_CHANNELS.MSP_READ_SMIX_CLI, async () => readSmixViaCli());
  ipcMain.handle(IPC_CHANNELS.MSP_READ_MMIX_CLI, async () => readMmixViaCli());

  // Waypoint/Mission handlers (iNav)
  ipcMain.handle(IPC_CHANNELS.MSP_GET_WAYPOINTS, async () => getWaypoints());
  ipcMain.handle(IPC_CHANNELS.MSP_SET_WAYPOINT, async (_event, wp: MSPWaypoint) => setWaypoint(wp));
  ipcMain.handle(IPC_CHANNELS.MSP_SAVE_WAYPOINTS, async (_event, waypoints: MSPWaypoint[]) => {
    // Upload all waypoints then save to EEPROM
    const uploaded = await uploadWaypoints(waypoints);
    if (!uploaded) return false;
    return await saveWaypoints();
  });
  ipcMain.handle(IPC_CHANNELS.MSP_CLEAR_WAYPOINTS, async () => clearWaypoints());
  ipcMain.handle(IPC_CHANNELS.MSP_GET_MISSION_INFO, async () => getMissionInfo());

  // Navigation config handlers (iNav)
  ipcMain.handle(IPC_CHANNELS.MSP_GET_NAV_CONFIG, async () => getNavConfig());
  ipcMain.handle(IPC_CHANNELS.MSP_SET_NAV_CONFIG, async (_event, config: Partial<MSPNavConfig>) => setNavConfig(config));
  ipcMain.handle(IPC_CHANNELS.MSP_GET_GPS_CONFIG, async () => getGpsConfig());
  ipcMain.handle(IPC_CHANNELS.MSP_SET_GPS_CONFIG, async (_event, config: MSPGpsConfig) => setGpsConfig(config));

  // Failsafe configuration
  ipcMain.handle(IPC_CHANNELS.MSP_GET_FAILSAFE_CONFIG, async () => getFailsafeConfig());
  ipcMain.handle(IPC_CHANNELS.MSP_SET_FAILSAFE_CONFIG, async (_event, config: MSPFailsafeConfig) => setFailsafeConfig(config));

  // GPS Rescue configuration (Betaflight)
  ipcMain.handle(IPC_CHANNELS.MSP_GET_GPS_RESCUE, async () => getGpsRescueConfig());
  ipcMain.handle(IPC_CHANNELS.MSP_SET_GPS_RESCUE, async (_event, config: MSPGpsRescueConfig) => setGpsRescueConfig(config));
  ipcMain.handle(IPC_CHANNELS.MSP_GET_GPS_RESCUE_PIDS, async () => getGpsRescuePids());
  ipcMain.handle(IPC_CHANNELS.MSP_SET_GPS_RESCUE_PIDS, async (_event, pids: MSPGpsRescuePids) => setGpsRescuePids(pids));

  // Filter configuration (Betaflight)
  ipcMain.handle(IPC_CHANNELS.MSP_GET_FILTER_CONFIG, async () => getFilterConfig());
  ipcMain.handle(IPC_CHANNELS.MSP_SET_FILTER_CONFIG, async (_event, config: MSPFilterConfig) => setFilterConfig(config));

  // VTX configuration
  ipcMain.handle(IPC_CHANNELS.MSP_GET_VTX_CONFIG, async () => getVtxConfig());
  ipcMain.handle(IPC_CHANNELS.MSP_SET_VTX_CONFIG, async (_event, config: Partial<MSPVtxConfig>) => setVtxConfig(config));

  // OSD configuration
  ipcMain.handle(IPC_CHANNELS.MSP_GET_OSD_CONFIG, async () => getOsdConfig());

  // RX configuration
  ipcMain.handle(IPC_CHANNELS.MSP_GET_RX_CONFIG, async () => getRxConfig());
  ipcMain.handle(IPC_CHANNELS.MSP_SET_RX_CONFIG, async (_event, newProvider: number) => setRxConfig(newProvider));

  // Generic settings API (read/write any CLI setting via MSP)
  ipcMain.handle(IPC_CHANNELS.MSP_GET_SETTING, async (_event, name: string) => getSetting(name));
  ipcMain.handle(IPC_CHANNELS.MSP_SET_SETTING, async (_event, name: string, value: string | number) => setSetting(name, value));
  ipcMain.handle(IPC_CHANNELS.MSP_GET_SETTINGS, async (_event, names: string[]) => getSettings(names));
  ipcMain.handle(IPC_CHANNELS.MSP_SET_SETTINGS, async (_event, settings: Record<string, string | number>) => setSettings(settings));

  // Command handlers
  ipcMain.handle(IPC_CHANNELS.MSP_SAVE_EEPROM, async () => saveEeprom());
  ipcMain.handle(IPC_CHANNELS.MSP_CALIBRATE_ACC, async () => calibrateAcc());
  ipcMain.handle(IPC_CHANNELS.MSP_CALIBRATE_MAG, async () => calibrateMag());
  ipcMain.handle(IPC_CHANNELS.MSP_REBOOT, async () => reboot());

  // CLI flag reset - resets all MSP CLI mode flags to unblock MSP operations
  ipcMain.handle(IPC_CHANNELS.CLI_RESET_ALL_FLAGS, async () => {
    resetMspCliFlags();
    return true;
  });

  // RC Control handlers (GCS arm/disarm, mode switching)
  ipcMain.handle(IPC_CHANNELS.MSP_SET_RAW_RC, async (_event, channels: number[]) => setRawRc(channels));
  ipcMain.handle(IPC_CHANNELS.MSP_GET_ACTIVE_BOXES, async () => getActiveBoxes());

  // Telemetry control handlers
  ipcMain.handle(IPC_CHANNELS.MSP_START_TELEMETRY, async (_event, rateHz?: number) => {
    startMspTelemetry(rateHz ?? 10);
  });
  ipcMain.handle(IPC_CHANNELS.MSP_STOP_TELEMETRY, async () => {
    stopMspTelemetry();
  });

  // GPS MSP sender (for SITL with gps_provider=MSP)
  ipcMain.handle(IPC_CHANNELS.MSP_START_GPS_SENDER, async () => {
    startGpsSender();
    return { success: true };
  });
  ipcMain.handle(IPC_CHANNELS.MSP_STOP_GPS_SENDER, async () => {
    stopGpsSender();
    return { success: true };
  });

}

export function unregisterMspHandlers(): void {
  cleanupMspConnection();

  // Config handlers
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_PID);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SET_PID);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_RC_TUNING);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SET_RC_TUNING);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_MODE_RANGES);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SET_MODE_RANGE);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_BOX_NAMES);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_BOX_IDS);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_FEATURES);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SET_FEATURES);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_STATUS);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_MIXER_CONFIG);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SET_MIXER_CONFIG);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_INAV_MIXER_CONFIG);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SET_INAV_PLATFORM_TYPE);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_RC);

  // Servo config handlers (iNav)
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_SERVO_CONFIGS);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SET_SERVO_CONFIG);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SAVE_SERVO_CLI);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_SERVO_VALUES);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_SERVO_MIXER);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SET_SERVO_MIXER);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_SERVO_CONFIG_MODE);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_MOTOR_MIXER);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SET_MOTOR_MIXER);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SET_MOTOR_MIXER_CLI);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SET_SERVO_MIXER_CLI);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_READ_SMIX_CLI);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_READ_MMIX_CLI);

  // Waypoint/Mission handlers (iNav)
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_WAYPOINTS);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SET_WAYPOINT);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SAVE_WAYPOINTS);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_CLEAR_WAYPOINTS);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_MISSION_INFO);

  // Navigation config handlers (iNav)
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_NAV_CONFIG);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SET_NAV_CONFIG);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_GPS_CONFIG);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SET_GPS_CONFIG);

  // Failsafe config handlers
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_FAILSAFE_CONFIG);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SET_FAILSAFE_CONFIG);

  // GPS Rescue config handlers (Betaflight)
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_GPS_RESCUE);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SET_GPS_RESCUE);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_GPS_RESCUE_PIDS);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SET_GPS_RESCUE_PIDS);

  // Filter config handlers (Betaflight)
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_FILTER_CONFIG);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SET_FILTER_CONFIG);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_VTX_CONFIG);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SET_VTX_CONFIG);

  // OSD config handler
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_OSD_CONFIG);

  // RX config handlers
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_RX_CONFIG);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SET_RX_CONFIG);

  // Generic settings API
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_SETTING);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SET_SETTING);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_SETTINGS);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SET_SETTINGS);

  // Command handlers
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SAVE_EEPROM);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_CALIBRATE_ACC);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_CALIBRATE_MAG);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_REBOOT);
  ipcMain.removeHandler(IPC_CHANNELS.CLI_RESET_ALL_FLAGS);

  // RC Control handlers
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SET_RAW_RC);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_ACTIVE_BOXES);

  // Telemetry control handlers
  ipcMain.removeHandler(IPC_CHANNELS.MSP_START_TELEMETRY);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_STOP_TELEMETRY);

  // GPS sender handlers
  ipcMain.removeHandler(IPC_CHANNELS.MSP_START_GPS_SENDER);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_STOP_GPS_SENDER);

  ctx.mainWindow = null;
}
