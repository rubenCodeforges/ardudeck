import { t } from './i18n/index.js';

/**
 * SITL-unsafe parameter classification.
 *
 * Real-vehicle param dumps frequently encode hardware-specific identifiers
 * (compass dev_ids, IMU/baro chip IDs, board type, hardware-only driver
 * selections). When applied verbatim to ArduPilot SITL these can crash the
 * sim with HAL panics like:
 *   PANIC: Register 0x5a is not writable!
 * because the simulated peripheral does not exist or does not match the
 * real chip the dump was captured from.
 *
 * This helper flags those params so the UI can auto-deselect / hide them
 * when the active connection is SITL. The classification is based on
 * widely-known ArduPilot conventions and the actual crash signatures we've
 * seen in the field — it is conservative (better to skip a param than to
 * crash the sim).
 */

// ── Always-unsafe by name ────────────────────────────────────────────────────
// These IDs encode hardware identity directly. Cloning them across hardware
// (incl. real-FC → SITL) produces a misconfigured driver init that frequently
// panics HAL_SITL with errors like "Register 0x5a is not writable!".
const ALWAYS_UNSAFE_NAMES: ReadonlyArray<string> = [
  // Board-specific hardware selection
  'BRD_TYPE',
  'BRD_SD_SLOWDOWN',
  'BRD_IO_DSHOT',
  'BRD_IO_ENABLE',
  'BRD_PWM_VOLT_SEL',
  'BRD_SBUS_OUT',
  'BRD_SAFETY_DEFLT',
  'BRD_SER1_RTSCTS',
  'BRD_SER2_RTSCTS',
  'BRD_HEAT_TARG',
  'BRD_HEAT_P',
  'BRD_HEAT_I',
  'BRD_HEAT_IMAX',
  'BRD_HEAT_LOWMGN',
  'BRD_ALT_CONFIG',
  // EKF IMU mask: real vehicle may have 2-3 IMUs, SITL has 1
  'EK3_IMU_MASK',
  'EK3_PRIMARY',
  // Custom rotation enable + slot data — only meaningful with the original
  // mounted hardware
  'CUST_ROT_ENABLE',
  // INS sample rate / sensor selection: real-IMU specific values can panic
  // the sim IMU model
  'INS_GYRO_RATE',
  'INS_FAST_SAMPLE',
  'INS_USE',
  'INS_USE2',
  'INS_USE3',
  // Compass-presence flag is hardware-specific (real FC has internal+external,
  // SITL has only the simulated mag). Cloning this from a real vehicle makes
  // the user's diff-list churn endlessly because SITL's defaults overwrite it.
  'COMPASS_EXTERNAL',
  'COMPASS_EXTERN2',
  'COMPASS_EXTERN3',
  // Motor PWM type: DShot etc. needs ICU timer hardware not present in SITL
  'MOT_PWM_TYPE',
  // Notification LED hardware
  'NTF_LED_TYPES',
  'NTF_LED_OVERRIDE',
  'NTF_BUZZ_TYPES',
];

// ── Always-unsafe by prefix ──────────────────────────────────────────────────
// Whole families that are real-hardware identity or driver-selection state.
const ALWAYS_UNSAFE_PREFIXES: ReadonlyArray<string> = [
  // Compass priority slots and legacy DEV_ID / per-instance offsets all
  // encode chip identity. Even cal data (OFS / DIA / ODI / SCALE / MOT) is
  // tied to a specific physical compass and validates against the chip ID.
  'COMPASS_PRIO',
  'COMPASS_DEV_ID',
  'COMPASS_OFS',
  'COMPASS_DIA',
  'COMPASS_ODI',
  'COMPASS_SCALE',
  'COMPASS_MOT',
  // CAN bus drivers / protocols / per-driver UAVCAN setup.
  'CAN_',
  // Custom rotation tables 1..N (per-mounted-IMU rotation calibration).
  'CUST_ROT1_',
  'CUST_ROT2_',
  // INS hardware identifiers and per-instance calibration tied to a chip.
  // Notch filters / logging / mounting offsets are software-only so we leave
  // those alone — they don't trigger driver init and won't panic the sim.
  // NOTE: ArduPilot's per-instance naming for these has TWO conventions —
  // suffix-after-`OFFS` (INS_GYROFFS_X / INS_GYR2OFFS_X / INS_GYR3OFFS_X),
  // and number-after-`GYR` (INS_GYR_CAL / INS_GYR1_CAL... / INS_GYR2_CAL...
  // for cal-temp tables). We need explicit prefixes for both forms to catch
  // every instance — `startsWith` doesn't infer a numeric wildcard.
  'INS_GYR_ID',
  'INS_ACC_ID',
  'INS_GYR2_ID',
  'INS_ACC2_ID',
  'INS_GYR3_ID',
  'INS_ACC3_ID',
  // Per-instance gyro/accel offsets and scales (cloned from real chip cal
  // data, meaningless on the simulator's ideal gyro). These keep showing up
  // as differences after every SITL reboot because SITL re-seeds them.
  'INS_GYROFFS',
  'INS_GYR2OFFS',
  'INS_GYR3OFFS',
  'INS_ACCOFFS',
  'INS_ACC2OFFS',
  'INS_ACC3OFFS',
  'INS_ACCSCAL',
  'INS_ACC2SCAL',
  'INS_ACC3SCAL',
  // Gyro temperature-calibration data (instance-1 named `INS_GYR_CAL...`,
  // instances 2-3 named `INS_GYR{N}_CAL...`). Per-physical-IMU thermal model.
  'INS_GYR_CAL',
  'INS_GYR1_CAL',
  'INS_GYR2_CAL',
  'INS_GYR3_CAL',
  // Per-instance temperature-calibration tables (TCAL): captured from a real
  // IMU's temp-vs-bias sweep, never matches a simulated gyro.
  'INS_TCAL1_',
  'INS_TCAL2_',
  'INS_TCAL3_',
  // Baro hardware IDs
  'BARO_DEVID',
  'BARO_PROBE_EXT',
  'BARO_PRIMARY',
  // EKF source set per-axis — defaults are safe; real FCs often change these
  // to match hardware (e.g., visual odometry, beacon). Keep SITL on defaults.
  'EK3_SRC1_',
  'EK3_SRC2_',
  'EK3_SRC3_',
  'EK3_SRC_OPTIONS',
  // Gimbal mounts — types/configs reference real hardware drivers.
  'MNT1_',
  'MNT2_',
  'MNT_',
  // Proximity sensors
  'PRX1_',
  'PRX2_',
  'PRX3_',
  'PRX4_',
  // Visual odometry, optical flow, RPM, EFI, winch, generator, beacons
  'VISO_',
  'OPTFLOW_',
  'RPM1_',
  'RPM2_',
  'EFI_',
  'WINCH_',
  'GEN_',
  'BCN_',
  // Airspeed sensors are hardware-specific
  'ARSPD_',
];

// ── Unsafe only at specific values (driver-type pickers) ─────────────────────
// These params CAN exist safely on SITL, but only with values that select a
// software/analog backend. Hardware-bus values (DroneCAN, SMBus, ESC-telem,
// etc.) need real peripherals and will fail / panic in SITL.
//
// `safeValues` is an allowlist; anything outside it is unsafe.
interface ValueGatedRule {
  readonly id: string | RegExp;
  readonly safeValues: ReadonlySet<number>;
  readonly reasonKey: string;
}

const VALUE_GATED: ReadonlyArray<ValueGatedRule> = [
  // BATT*_MONITOR: 0=disabled, 3=analog volt, 4=analog volt+current,
  // 5=solo, 6=bebop, 7=SMBus-Maxell, 8=DroneCAN, 9=ESC, 10=SumOfBatts,
  // 11=FuelFlow, 12=FuelLevel, 13=NeoDesign, 14=SMBus-Maxell, 15=Sui3,
  // 16=Sui6. Only 0/3/4/10 are SITL-safe.
  { id: /^BATT\d?_MONITOR$/, safeValues: new Set([0, 3, 4, 10]), reasonKey: 'shared:sitlUnsafeParams.batteryMonitor' },
  // GPS_TYPE / GPS2_TYPE: 0=none, 1=auto, 2=ublox, 5=NMEA, 7=SBP,
  // 9=DroneCAN, 14=ESP32, etc. SITL only models a generic UBlox-ish GPS,
  // value 1 (Auto) or 0 (None) are safe; others try to drive a real chip.
  { id: /^GPS\d?_TYPE$/, safeValues: new Set([0, 1, 2]), reasonKey: 'shared:sitlUnsafeParams.gpsDriver' },
  // RNGFND*_TYPE: most rangefinder types touch hardware buses. Safe values
  // are 0 (None) and 100 (SITL-fake — present in modern ArduPilot).
  { id: /^RNGFND\d_TYPE$/, safeValues: new Set([0, 100]), reasonKey: 'shared:sitlUnsafeParams.rangefinder' },
  // ADSB_TYPE: 0=none, 1=uAvionix-MAVLink (works in SITL via MAVLink),
  // 2=Sagetech, 3=uAvionix-UCP (UAVCAN), 4=Sagetech-MX (UAVCAN). Only 0 or 1.
  { id: 'ADSB_TYPE', safeValues: new Set([0, 1]), reasonKey: 'shared:sitlUnsafeParams.adsb' },
];

// ── Unsafe by prefix when value is non-default ───────────────────────────────
// SERIAL*_PROTOCOL is fine in principle but specific values map to drivers
// that need real serial peripherals (e.g., DroneCAN-bridged GPS, RPM sensor).
// For SITL clones we conservatively skip non-default values, which usually
// correspond to real-hardware peripherals attached on the source FC.
const SERIAL_PROTOCOL_RE = /^SERIAL\d_PROTOCOL$/;
// 1=MAVLink1, 2=MAVLink2, -1=None, 0=GCS-default. The rest (5=GPS, 7=Alexmos
// gimbal, 8=SToRM32, 9=Lidar, 10=FrSky-SPort-Passthrough, 11=GPS-Inject,
// 13=Beacon, 14=Volz, 15=Sbus-out, 16=ESC-Telem, 17=Devo, 18=OpticalFlow,
// 19=Robotis, 20=NMEAOut, 21=WindVane, 22=SLCAN, 23=RCIN, 24=MegaSquirt,
// 25=LTM, 26=RunCam, 27=HottTelem, 28=Scripting, 29=Crossfire-VTX,
// 30=Generator, 31=Winch, 32=MSP, 33=DJI-FPV, 36=AirSpeed, 38=ADSB, 40=DDS)
// are device-specific and may need real wiring. Allowlist:
const SERIAL_PROTOCOL_SAFE = new Set([-1, 0, 1, 2, 23, 28, 32]);

// ── Public API ───────────────────────────────────────────────────────────────

export interface SitlUnsafeReason {
  reason: string;
  /** "always" = unsafe regardless of value. "value" = only at this value. */
  kind: 'always' | 'value';
}

/**
 * Returns a non-null reason if the given param/value combination is unsafe
 * to apply to a SITL target. Otherwise returns null.
 */
export function classifySitlUnsafeParam(paramId: string, value: number): SitlUnsafeReason | null {
  if (ALWAYS_UNSAFE_NAMES.includes(paramId)) {
    return { reason: t('shared:sitlUnsafeParams.boardSpecific'), kind: 'always' };
  }
  for (const prefix of ALWAYS_UNSAFE_PREFIXES) {
    if (paramId.startsWith(prefix)) {
      return { reason: t('shared:sitlUnsafeParams.driverFamily'), kind: 'always' };
    }
  }
  for (const rule of VALUE_GATED) {
    const match = typeof rule.id === 'string' ? paramId === rule.id : rule.id.test(paramId);
    if (match && !rule.safeValues.has(value)) {
      return { reason: t(rule.reasonKey), kind: 'value' };
    }
  }
  if (SERIAL_PROTOCOL_RE.test(paramId) && !SERIAL_PROTOCOL_SAFE.has(value)) {
    return { reason: t('shared:sitlUnsafeParams.serialProtocol'), kind: 'value' };
  }
  return null;
}

/** Convenience boolean wrapper for callers that don't need the reason. */
export function isSitlUnsafeParam(paramId: string, value: number): boolean {
  return classifySitlUnsafeParam(paramId, value) !== null;
}
