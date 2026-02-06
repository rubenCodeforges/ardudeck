/**
 * MSP Telemetry
 *
 * Telemetry polling, RC poll, GPS sender, getRc, setRawRc.
 */

import {
  MSP,
  MSP2,
  buildMspV1RequestWithPayload,
  buildMspV2RequestWithPayload,
  deserializeBoxNames,
  deserializeAttitude,
  deserializeAltitude,
  deserializeAnalog,
  deserializeRc,
  deserializeRawGps,
  deserializeBatteryState,
  deserializeStatus,
  deserializeInavStatus,
  isArmed,
  getArmingDisabledReasons,
  attitudeToDegrees,
  altitudeToMeters,
  gpsToDecimalDegrees,
  serializeMsp2SensorGps,
  type MSP2SensorGpsData,
} from '@ardudeck/msp-ts';
import { protocolBridge } from '../simulators/index.js';
import { isCliModeActive } from '../cli/cli-handlers.js';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';
import { ctx, TELEMETRY_STUCK_TIMEOUT, TELEMETRY_SKIP_LOG_INTERVAL } from './msp-context.js';
import { sendMspRequest, sendMspV2Request, acquireMutex, fetchRxMap } from './msp-transport.js';

/**
 * Decode the primary active flight mode from flightModeFlags bitmask.
 */
let boxNamesWarnCount = 0;
function decodeActiveFlightMode(flags: number, boxNames: string[]): string {
  if (boxNames.length === 0 && flags > 1) {
    // flags > 1 means bits beyond ARM are set, but we can't decode without boxNames
    if (boxNamesWarnCount++ % 50 === 0) {
      console.warn('[MSP] Cannot decode flight mode - boxNames empty, flags:', flags.toString(2));
    }
  }
  for (let i = 0; i < boxNames.length && i < 32; i++) {
    if ((flags & (1 << i)) !== 0) {
      const name = boxNames[i];
      if (name && name !== 'ARM') return name;
    }
  }
  return 'ACRO';
}

export function startMspTelemetry(rateHz: number = 10): void {
  if (ctx.telemetryInterval) {
    clearInterval(ctx.telemetryInterval);
  }

  const intervalMs = Math.round(1000 / rateHz);
  ctx.sendLog('info', `MSP telemetry started at ${rateHz}Hz`);

  const gen = ++ctx.telemetryGeneration;

  (async () => {
    try {
      await fetchRxMap();
    } catch (err) {
      console.warn('[MSP] Failed to fetch RX_MAP, using default AETR:', err);
    }

    if (gen !== ctx.telemetryGeneration) return;

    // Fetch BOXNAMES with retry - critical for flight mode decoding
    // Use MSPv2 framing: BOXNAMES response can exceed 255 bytes (MSPv1 max) on modern boards
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const boxPayload = attempt <= 2
          ? await sendMspV2Request(MSP.BOXNAMES, 2000)
          : await sendMspRequest(MSP.BOXNAMES, 2000); // v1 fallback on attempt 3
        ctx.cachedBoxNames = deserializeBoxNames(boxPayload);
        console.log('[MSP] Cached', ctx.cachedBoxNames.length, 'box names:', ctx.cachedBoxNames.slice(0, 10).join(', '));
        break;
      } catch (err) {
        ctx.cachedBoxNames = [];
        const msg = err instanceof Error ? err.message : String(err);
        if (attempt < 3) {
          console.warn(`[MSP] BOXNAMES fetch attempt ${attempt} failed (${msg}), retrying in 500ms...`);
          await new Promise(r => setTimeout(r, 500));
        } else {
          console.warn('[MSP] Failed to fetch BOXNAMES after 3 attempts - flight modes will show ACRO');
        }
      }
    }

    if (gen !== ctx.telemetryGeneration) return;
    startTelemetryInterval(intervalMs);
  })();

  startRcPoll(10);
}

function startTelemetryInterval(intervalMs: number): void {
  if (ctx.telemetryInterval) {
    clearInterval(ctx.telemetryInterval);
  }

  ctx.telemetryInterval = setInterval(async () => {
    if (!ctx.currentTransport?.isOpen) return;
    if (ctx.configLockCount > 0) return;
    if (ctx.servoCliModeActive || ctx.tuningCliModeActive || isCliModeActive()) return;

    if (ctx.telemetryInProgress) {
      const stuckTime = Date.now() - ctx.telemetryLastStartTime;
      if (stuckTime > TELEMETRY_STUCK_TIMEOUT) {
        console.warn(`[MSP] Force-resetting stuck telemetry (stuck for ${stuckTime}ms)`);
        ctx.telemetryInProgress = false;
        ctx.telemetrySkipCount = 0;
      } else {
        ctx.telemetrySkipCount++;
        if (ctx.telemetrySkipCount % TELEMETRY_SKIP_LOG_INTERVAL === 1) {
          console.warn(`[MSP] Skipping telemetry poll - previous still in progress (skipped ${ctx.telemetrySkipCount} times)`);
        }
        return;
      }
    }

    ctx.telemetryInProgress = true;
    ctx.telemetryLastStartTime = Date.now();
    ctx.telemetryPollCount++;

    // Periodic BOXNAMES re-fetch if still empty (every ~5s at 10Hz)
    if (ctx.cachedBoxNames.length === 0 && ctx.telemetryPollCount % 50 === 0) {
      try {
        const boxPayload = await sendMspV2Request(MSP.BOXNAMES, 2000);
        ctx.cachedBoxNames = deserializeBoxNames(boxPayload);
        if (ctx.cachedBoxNames.length > 0) {
          console.log('[MSP] BOXNAMES re-fetch succeeded:', ctx.cachedBoxNames.length, 'names:', ctx.cachedBoxNames.slice(0, 10).join(', '));
        }
      } catch {
        // Silent - will retry next cycle
      }
    }

    try {
      const interCommandDelay = () => new Promise(r => setTimeout(r, 10));

      const batch: {
        attitude?: { roll: number; pitch: number; yaw: number; rollSpeed: number; pitchSpeed: number; yawSpeed: number };
        vfrHud?: { airspeed: number; groundspeed: number; heading: number; throttle: number; alt: number; climb: number };
        battery?: { voltage: number; current: number; remaining: number; cellCount?: number; cellVoltage?: number; mahDrawn?: number };
        flight?: { mode: string; modeNum: number; armed: boolean; isFlying: boolean; armingDisabledReasons?: string[]; activeSensors?: number };
        gps?: { fixType: number; satellites: number; hdop: number; lat: number; lon: number; alt: number };
        position?: { lat: number; lon: number; alt: number; relativeAlt: number; vx: number; vy: number; vz: number };
      } = {};

      let headingDeg = 0;
      let altitudeM = 0;
      let varioMs = 0;

      try {
        const attitudePayload = await sendMspRequest(MSP.ATTITUDE, 300);
        const attitude = deserializeAttitude(attitudePayload);
        const degrees = attitudeToDegrees(attitude);
        headingDeg = degrees.yawDeg;
        batch.attitude = { roll: degrees.rollDeg, pitch: degrees.pitchDeg, yaw: degrees.yawDeg, rollSpeed: 0, pitchSpeed: 0, yawSpeed: 0 };
      } catch { /* ignore */ }

      await interCommandDelay();

      try {
        const altitudePayload = await sendMspRequest(MSP.ALTITUDE, 300);
        const altitude = deserializeAltitude(altitudePayload);
        const meters = altitudeToMeters(altitude);
        altitudeM = meters.altitudeM;
        varioMs = meters.varioMs;
        if (ctx.telemetryPollCount % 50 === 0) {
          console.log('[MSP] Altitude raw:', altitude, 'meters:', meters);
        }
      } catch (err) {
        if (ctx.telemetryPollCount % 50 === 0) {
          console.warn('[MSP] Altitude fetch failed:', err);
        }
      }

      await interCommandDelay();

      let batteryVoltage = 0;
      let batteryCurrent = 0;
      try {
        const analogPayload = await sendMspRequest(MSP.ANALOG, 300);
        const analog = deserializeAnalog(analogPayload);
        batteryVoltage = analog.voltage;
        batteryCurrent = analog.current;
      } catch { /* ignore */ }

      await interCommandDelay();

      let batteryPercentage = -1;
      let batteryCellCount = 0;
      let batteryCellVoltage = 0;
      let batteryMahDrawn = 0;
      try {
        const batteryPayload = await sendMspRequest(MSP.BATTERY_STATE, 300);
        const batteryState = deserializeBatteryState(batteryPayload);
        if (batteryState.voltage > 0) batteryVoltage = batteryState.voltage;
        batteryCellCount = batteryState.cellCount;
        batteryMahDrawn = batteryState.mAhDrawn;
        if (batteryState.cellCount > 0 && batteryVoltage > 0) {
          batteryCellVoltage = batteryVoltage / batteryState.cellCount;
          const minV = 3.3;
          const maxV = 4.2;
          batteryPercentage = Math.round(Math.max(0, Math.min(100, ((batteryCellVoltage - minV) / (maxV - minV)) * 100)));
        }
      } catch { /* ignore */ }

      batch.battery = { voltage: batteryVoltage, current: batteryCurrent, remaining: batteryPercentage, cellCount: batteryCellCount, cellVoltage: batteryCellVoltage, mahDrawn: batteryMahDrawn };

      await interCommandDelay();

      try {
        let status;
        const fcVariant = ctx.isInavFirmware ? 'INAV' : 'BTFL';
        if (ctx.isInavFirmware) {
          const statusPayload = await sendMspV2Request(MSP2.INAV_STATUS, 300);
          status = deserializeInavStatus(statusPayload);
        } else {
          const statusPayload = await sendMspRequest(MSP.STATUS_EX, 300);
          status = deserializeStatus(statusPayload);
        }

        const armed = isArmed(status.flightModeFlags);
        const armingDisabledReasons = status.armingDisableFlags ? getArmingDisabledReasons(status.armingDisableFlags, fcVariant) : [];

        if (!armed && status.armingDisableFlags !== ctx.lastArmingFlags) {
          ctx.lastArmingFlags = status.armingDisableFlags ?? null;
        } else if (armed && ctx.lastArmingFlags !== null) {
          ctx.lastArmingFlags = null;
        }

        batch.flight = {
          mode: decodeActiveFlightMode(status.flightModeFlags, ctx.cachedBoxNames),
          modeNum: status.flightModeFlags,
          armed,
          isFlying: armed,
          armingDisabledReasons,
          activeSensors: status.activeSensors,
        };

        if (ctx.telemetryPollCount % 50 === 0) {
          console.log('[MSP] Status - activeSensors:', status.activeSensors?.toString(2).padStart(8, '0'),
            '(ACC:', !!(status.activeSensors & 1), 'BARO:', !!(status.activeSensors & 2),
            'MAG:', !!(status.activeSensors & 4), 'GPS:', !!(status.activeSensors & 8),
            'SONAR:', !!(status.activeSensors & 16), 'GYRO:', !!(status.activeSensors & 32), ')');
          console.log('[MSP] Flight - flags:', status.flightModeFlags, 'binary:', status.flightModeFlags?.toString(2).padStart(16, '0'),
            'mode:', batch.flight?.mode, 'armed:', batch.flight?.armed,
            'boxNames:', ctx.cachedBoxNames.length, ctx.cachedBoxNames.length > 0 ? ctx.cachedBoxNames.slice(0, 8).join(',') : '(empty)');
        }
      } catch (err) {
        if (ctx.telemetryPollCount % 50 === 0) {
          console.warn('[MSP] Status fetch failed:', err);
        }
      }

      const throttlePercent = ctx.lastSentThrottlePercent !== null ? ctx.lastSentThrottlePercent : ctx.lastKnownThrottlePercent;

      await interCommandDelay();

      try {
        const gpsPayload = await sendMspRequest(MSP.RAW_GPS, 300);
        const gps = deserializeRawGps(gpsPayload);
        const decimal = gpsToDecimalDegrees(gps);

        batch.gps = { fixType: gps.fixType, satellites: gps.numSat, hdop: gps.hdop / 100, lat: decimal.latDeg, lon: decimal.lonDeg, alt: decimal.altM };
        batch.position = { lat: decimal.latDeg, lon: decimal.lonDeg, alt: decimal.altM, relativeAlt: decimal.altM, vx: 0, vy: 0, vz: 0 };
        batch.vfrHud = { airspeed: decimal.speedMs, groundspeed: decimal.speedMs, heading: headingDeg, throttle: throttlePercent, alt: altitudeM, climb: varioMs };
      } catch {
        batch.vfrHud = { airspeed: 0, groundspeed: 0, heading: headingDeg, throttle: throttlePercent, alt: altitudeM, climb: varioMs };
      }

      ctx.safeSend(IPC_CHANNELS.TELEMETRY_BATCH, batch);
    } catch (error) {
      console.error('[MSP] Telemetry poll error:', error);
    } finally {
      ctx.telemetryInProgress = false;
    }
  }, intervalMs);
}

export function stopMspTelemetry(): void {
  ctx.telemetryGeneration++;
  if (ctx.telemetryInterval) {
    clearInterval(ctx.telemetryInterval);
    ctx.telemetryInterval = null;
    ctx.sendLog('info', 'MSP telemetry stopped');
  }
  stopRcPoll();
  ctx.telemetryInProgress = false;
  ctx.telemetrySkipCount = 0;
  ctx.telemetryLastStartTime = 0;
}

function startRcPoll(rateHz: number = 10): void {
  if (ctx.rcPollInterval) {
    clearInterval(ctx.rcPollInterval);
  }

  const intervalMs = Math.round(1000 / rateHz);

  ctx.rcPollInterval = setInterval(async () => {
    if (!ctx.currentTransport?.isOpen) return;
    if (ctx.configLockCount > 0) return;
    if (ctx.servoCliModeActive || ctx.tuningCliModeActive || isCliModeActive()) return;
    if (ctx.rcPollActive) return;
    ctx.rcPollActive = true;

    try {
      const rcPayload = await sendMspRequest(MSP.RC, 200);
      const rc = deserializeRc(rcPayload);
      const THROTTLE_CHANNEL = 3;
      const throttleRaw = rc.channels[THROTTLE_CHANNEL];
      if (rc.channels.length > THROTTLE_CHANNEL && throttleRaw !== undefined) {
        ctx.lastKnownThrottlePercent = Math.round(Math.max(0, Math.min(100, ((throttleRaw - 1000) / 1000) * 100)));
      }
    } catch {
      // Silent fail
    } finally {
      ctx.rcPollActive = false;
    }
  }, intervalMs);
}

export function stopRcPoll(): void {
  if (ctx.rcPollInterval) {
    clearInterval(ctx.rcPollInterval);
    ctx.rcPollInterval = null;
  }
  ctx.rcPollActive = false;
}

export function startGpsSender(): void {
  if (ctx.gpsSenderInterval) return;

  ctx.gpsSenderEnabled = true;
  ctx.gpsSenderLoggedOnce = false;

  ctx.gpsSenderInterval = setInterval(async () => {
    if (!ctx.gpsSenderEnabled || !ctx.currentTransport || !ctx.mspParser) return;

    const fgData = protocolBridge.getLastData();
    if (!fgData) return;

    const gpsData: MSP2SensorGpsData = {
      instance: 0,
      fixType: 3,
      numSat: 12,
      lat: fgData.latitude,
      lon: fgData.longitude,
      alt: fgData.altitudeMsl * 0.3048,
      groundSpeed: fgData.groundspeed * 0.514444,
      groundCourse: fgData.heading,
      velN: fgData.groundspeed * 0.514444 * Math.cos(fgData.heading * Math.PI / 180),
      velE: fgData.groundspeed * 0.514444 * Math.sin(fgData.heading * Math.PI / 180),
      velD: -fgData.verticalSpeed * 0.00508,
      hdop: 1.0,
      vdop: 1.5,
    };

    try {
      const payload = serializeMsp2SensorGps(gpsData);
      const packet = buildMspV2RequestWithPayload(MSP2.SENSOR_GPS, payload);
      await ctx.currentTransport.write(Buffer.from(packet));
      ctx.gpsSenderLoggedOnce = true;
    } catch (err) {
      console.error('[MSP GPS] Send error:', err);
    }
  }, 100);
}

export function stopGpsSender(): void {
  if (ctx.gpsSenderInterval) {
    clearInterval(ctx.gpsSenderInterval);
    ctx.gpsSenderInterval = null;
    ctx.gpsSenderEnabled = false;
  }
}

export async function getRc(): Promise<{ channels: number[] } | null> {
  if (!ctx.currentTransport?.isOpen) return null;
  if (ctx.rcPollInFlight) return null;

  ctx.rcPollInFlight = true;
  try {
    const payload = await sendMspRequest(MSP.RC, 200);
    const rc = deserializeRc(payload);
    return { channels: rc.channels };
  } catch {
    return null;
  } finally {
    ctx.rcPollInFlight = false;
  }
}

export async function setRawRc(channels: number[]): Promise<boolean> {
  ctx.setRawRcCounter++;
  const shouldLog = ctx.setRawRcCounter % 50 === 1;

  if (!ctx.currentTransport?.isOpen) {
    if (shouldLog) console.warn('[MSP] setRawRc: Transport not open, skipping');
    return false;
  }

  if (ctx.servoCliModeActive || ctx.tuningCliModeActive || isCliModeActive()) {
    if (shouldLog) console.warn('[MSP] setRawRc: CLI mode active, skipping');
    return false;
  }

  try {
    if (channels.length < 8 || channels.length > 16) {
      console.error('[MSP] setRawRc: Invalid channel count. Expected 8-16, got:', channels.length);
      return false;
    }

    const validatedChannels = channels.map((ch, i) => {
      const clamped = Math.max(1000, Math.min(2000, Math.round(ch)));
      if (ch < 1000 || ch > 2000) {
        console.warn(`[MSP] setRawRc: Channel ${i} value ${ch} clamped to ${clamped}`);
      }
      return clamped;
    });

    const sentThrottle = validatedChannels[2] ?? 1000;
    ctx.lastSentThrottlePercent = Math.round(Math.max(0, Math.min(100, ((sentThrottle - 1000) / 1000) * 100)));

    const payload = new Uint8Array(validatedChannels.length * 2);
    const view = new DataView(payload.buffer);
    validatedChannels.forEach((ch, i) => {
      view.setUint16(i * 2, ch, true);
    });

    const release = await acquireMutex();
    try {
      if (!ctx.currentTransport?.isOpen) return false;
      const packet = buildMspV1RequestWithPayload(MSP.SET_RAW_RC, payload);
      await ctx.currentTransport.write(packet);
    } finally {
      release();
    }

    if (shouldLog) {
      console.log('[MSP] setRawRc #' + ctx.setRawRcCounter, 'ch:', validatedChannels.slice(0, 8).join(','));
    }
    return true;
  } catch (error) {
    if (shouldLog) console.error('[MSP] setRawRc failed:', error);
    return false;
  }
}
