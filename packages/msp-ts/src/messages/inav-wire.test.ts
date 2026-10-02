import { describe, it, expect } from 'vitest';
import { MSP2 } from '../core/constants.js';
import {
  deserializeServoConfigurations,
  deserializeInavServoConfigs,
  serializeInavServoConfig,
  serializeServoConfiguration,
  serializeServoMixerRule,
  deserializeServoMixerRules,
  buildServoMixerSlotPayloads,
  activeServoMixerRules,
  buildMotorMixerSlotPayloads,
  EMPTY_SERVO_MIXER_RULE,
  deserializeInavRateProfile,
  serializeInavRateProfile,
  inavRateProfileToRcTuning,
  rcTuningToInavRateProfile,
  serializeInavVtxConfig,
  deserializeInavVtxConfig,
  serializeVtxConfig,
} from './config.js';

const bytes = (u: Uint8Array) => Array.from(u);

describe('MSP2 constants', () => {
  it('0x2016/0x2017 are OSD preferences, not nav config', () => {
    expect(MSP2.INAV_OSD_PREFERENCES).toBe(0x2016);
    expect(MSP2.INAV_OSD_SET_PREFERENCES).toBe(0x2017);
    expect(Object.keys(MSP2).some(k => k.includes('RTH_AND_LAND'))).toBe(false);
  });

  it('servo config and programming codes match MSPCodes.js', () => {
    expect(MSP2.INAV_SERVO_CONFIG).toBe(0x2200);
    expect(MSP2.INAV_SET_SERVO_CONFIG).toBe(0x2201);
    expect(MSP2.INAV_GLOBAL_FUNCTIONS).toBe(0x2024);
    expect(MSP2.INAV_LOGIC_CONDITIONS_STATUS).toBe(0x2026);
    expect(MSP2.INAV_GVAR_STATUS).toBe(0x2027);
    expect(MSP2.INAV_PROGRAMMING_PID).toBe(0x2028);
    expect(MSP2.INAV_SET_PROGRAMMING_PID).toBe(0x2029);
    expect(MSP2.INAV_PROGRAMMING_PID_STATUS).toBe(0x202a);
  });
});

describe('INAV servo config (MSP2 0x2200 / 0x2201)', () => {
  it('writes 8 bytes like MSPHelper.sendServoConfigurations, ignoring forward/reversed', () => {
    const payload = serializeInavServoConfig(3, {
      min: 1000, max: 2000, middle: 1500, rate: 100, forwardFromChannel: 7, reversedSources: 0xffffffff,
    });
    expect(bytes(payload)).toEqual([3, 0xe8, 0x03, 0xd0, 0x07, 0xdc, 0x05, 100]);
  });

  it('writes a negative (reversed) rate as int8 two\'s complement', () => {
    const payload = serializeInavServoConfig(0, {
      min: 1000, max: 2000, middle: 1500, rate: -100, forwardFromChannel: 255, reversedSources: 0,
    });
    expect(payload[7]).toBe(0x9c);
  });

  it('reads 7 bytes per servo with int16 limits and int8 rate', () => {
    const raw = new Uint8Array([
      0xe8, 0x03, 0xd0, 0x07, 0xdc, 0x05, 0x64,
      0xf4, 0x01, 0xc4, 0x09, 0xdc, 0x05, 0x9c,
    ]);
    const servos = deserializeInavServoConfigs(raw);
    expect(servos).toHaveLength(2);
    expect(servos[0]).toMatchObject({ min: 1000, max: 2000, middle: 1500, rate: 100 });
    expect(servos[1]).toMatchObject({ min: 500, max: 2500, middle: 1500, rate: -100 });
  });

  it('round-trips a negative rate', () => {
    const cfg = { min: 900, max: 2100, middle: 1520, rate: -75, forwardFromChannel: 255, reversedSources: 0 };
    // The SET payload minus its index byte has the same 7-byte shape the GET returns.
    const read = deserializeInavServoConfigs(serializeInavServoConfig(0, cfg).slice(1));
    expect(read[0]).toMatchObject({ min: 900, max: 2100, middle: 1520, rate: -75 });
  });

  it('rejects a payload that is not a whole number of 7-byte entries', () => {
    expect(deserializeInavServoConfigs(new Uint8Array(8))).toEqual([]);
  });
});

describe('MSP 120 servo configurations size detection', () => {
  it('reads iNav legacy 14-byte entries even though 14 is a multiple of 7', () => {
    const entry = [0xe8, 0x03, 0xd0, 0x07, 0xdc, 0x05, 0x64, 0, 0, 0xff, 0, 0, 0, 0];
    const raw = new Uint8Array([...entry, ...entry, ...entry, ...entry, ...entry, ...entry, ...entry, ...entry]);
    const servos = deserializeServoConfigurations(raw);
    expect(servos).toHaveLength(8);
    expect(servos[7]).toMatchObject({ min: 1000, max: 2000, middle: 1500, rate: 100, forwardFromChannel: 255 });
  });

  it('reads Betaflight 12-byte entries when told the layout', () => {
    const entry = [0xe8, 0x03, 0xd0, 0x07, 0xdc, 0x05, 0x64, 0x03, 0x01, 0, 0, 0];
    const raw = new Uint8Array(Array.from({ length: 8 }, () => entry).flat());
    const servos = deserializeServoConfigurations(raw, 12);
    expect(servos).toHaveLength(8);
    expect(servos[0]).toMatchObject({ forwardFromChannel: 3, reversedSources: 1 });
  });

  it('keeps the Betaflight 13-byte SET layout', () => {
    expect(serializeServoConfiguration(1, {
      min: 1000, max: 2000, middle: 1500, rate: 100, forwardFromChannel: 255, reversedSources: 0,
    })).toHaveLength(13);
  });
});

describe('servo mixer rules', () => {
  it('encodes condition -1 ("always") as 0xFF and reads it back as -1', () => {
    const payload = serializeServoMixerRule(2, {
      targetChannel: 1, inputSource: 0, rate: -100, speed: 0, min: 0, max: 0, box: -1,
    });
    expect(bytes(payload)).toEqual([2, 1, 0, 0x9c, 0xff, 0, 0xff]);
    expect(deserializeServoMixerRules(payload.slice(1))[0]).toMatchObject({ rate: -100, box: -1 });
  });

  it('writes every slot and clears the unused ones to the configurator empty rule', () => {
    const rules = [{ targetChannel: 3, inputSource: 0, rate: 100, speed: 0, min: 0, max: 0, box: -1 }];
    const payloads = buildServoMixerSlotPayloads(rules, 4);
    expect(payloads).toHaveLength(4);
    expect(bytes(payloads[0]!)).toEqual([0, 3, 0, 100, 0, 0, 0xff]);
    for (let i = 1; i < 4; i++) {
      expect(bytes(payloads[i]!)).toEqual([i, 0, 0, 0, 0, 0, 0xff]);
    }
    expect(EMPTY_SERVO_MIXER_RULE.box).toBe(-1);
  });

  it('refuses more active rules than slots, but tolerates trailing empty ones', () => {
    const active = { targetChannel: 0, inputSource: 0, rate: 50, speed: 0, min: 0, max: 0, box: -1 };
    expect(() => buildServoMixerSlotPayloads([active, active, active], 2)).toThrow();
    expect(buildServoMixerSlotPayloads([active, EMPTY_SERVO_MIXER_RULE, EMPTY_SERVO_MIXER_RULE], 2)).toHaveLength(2);
  });

  it('keeps only the active mixer profile and drops unused slots, so an added rule still fits', () => {
    const used = { targetChannel: 0, inputSource: 0, rate: 100, speed: 0, min: 0, max: 0, box: -1 };
    const otherProfile = { ...used, targetChannel: 5 };
    // FC reply: 4 active slots (1 used) then the second profile's 4 slots
    const read = [used, EMPTY_SERVO_MIXER_RULE, EMPTY_SERVO_MIXER_RULE, EMPTY_SERVO_MIXER_RULE,
      otherProfile, EMPTY_SERVO_MIXER_RULE, EMPTY_SERVO_MIXER_RULE, EMPTY_SERVO_MIXER_RULE];
    const active = activeServoMixerRules(read, 4);
    expect(active).toEqual([used]);
    expect(buildServoMixerSlotPayloads([...active, { ...used, targetChannel: 2 }], 4)).toHaveLength(4);
  });
});

describe('motor mixer full-slot write', () => {
  it('pads to the motor count with MotorMixRule(0,0,0,0) = 2000 on every axis', () => {
    const payloads = buildMotorMixerSlotPayloads([{ throttle: 1, roll: -1, pitch: 1, yaw: -1 }], 3);
    expect(payloads).toHaveLength(3);
    expect(bytes(payloads[0]!)).toEqual([0, 0xb8, 0x0b, 0xe8, 0x03, 0xb8, 0x0b, 0xe8, 0x03]);
    expect(bytes(payloads[1]!)).toEqual([1, 0xd0, 0x07, 0xd0, 0x07, 0xd0, 0x07, 0xd0, 0x07]);
    expect(bytes(payloads[2]!)).toEqual([2, 0xd0, 0x07, 0xd0, 0x07, 0xd0, 0x07, 0xd0, 0x07]);
  });

  it('clears all slots when given no rules', () => {
    expect(buildMotorMixerSlotPayloads([], 8)).toHaveLength(8);
  });

  it('refuses more motors than the board has', () => {
    const m = { throttle: 1, roll: 0, pitch: 0, yaw: 0 };
    expect(() => buildMotorMixerSlotPayloads([m, m, m], 2)).toThrow();
  });
});

describe('INAV rate profile', () => {
  // throttle mid/expo/dynThr/tpa(2), stabilized expo/yawExpo/roll/pitch/yaw, manual expo/yawExpo/roll/pitch/yaw
  const fromFc = new Uint8Array([50, 0, 10, 0xdc, 0x05, 70, 20, 36, 36, 20, 35, 25, 80, 90, 60]);

  it('preserves MANUAL rates byte for byte through read -> renderer shape -> write', () => {
    const profile = deserializeInavRateProfile(fromFc);
    const rcTuning = inavRateProfileToRcTuning(profile);
    const out = serializeInavRateProfile(rcTuningToInavRateProfile(rcTuning, profile));
    expect(bytes(out)).toEqual(bytes(fromFc));
  });

  it('changes stabilized rates without touching MANUAL ones', () => {
    const profile = deserializeInavRateProfile(fromFc);
    const rcTuning = { ...inavRateProfileToRcTuning(profile), rollRate: 500, yawRate: 300 };
    const out = serializeInavRateProfile(rcTuningToInavRateProfile(rcTuning, profile));
    expect(out[7]).toBe(50);
    expect(out[9]).toBe(30);
    expect(bytes(out.slice(10))).toEqual([35, 25, 80, 90, 60]);
  });

  it('does not invent a MANUAL section the FC did not send', () => {
    const short = fromFc.slice(0, 10);
    const profile = deserializeInavRateProfile(short);
    const out = serializeInavRateProfile(rcTuningToInavRateProfile(inavRateProfileToRcTuning(profile), profile));
    expect(bytes(out)).toEqual(bytes(short));
  });
});

describe('INAV VTX', () => {
  const base = {
    vtxType: 3, band: 5, channel: 3, power: 2, pitMode: true, frequency: 5732, deviceReady: true,
    lowPowerDisarm: 1, pitModeFrequency: 0, vtxTableAvailable: false, vtxTableBands: 0,
    vtxTableChannels: 0, vtxTablePowerLevels: 0,
  };

  it('sends 5 bytes: packed band/channel, power, pit mode 0, low power disarm', () => {
    // (5-1)*8 + (3-1) = 34
    expect(bytes(serializeInavVtxConfig(base))).toEqual([34, 0, 2, 0, 1]);
  });

  it('never turns pit mode on', () => {
    expect(serializeInavVtxConfig({ ...base, pitMode: true })[3]).toBe(0);
  });

  it('sends 6000 (ignore) when no band is set', () => {
    expect(bytes(serializeInavVtxConfig({ ...base, band: 0 }).slice(0, 2))).toEqual([0x70, 0x17]);
  });

  it('differs from the Betaflight payload', () => {
    expect(serializeVtxConfig(base).length).toBe(15);
  });

  it('reads the INAV MSP_VTX_CONFIG layout and derives the frequency', () => {
    const cfg = deserializeInavVtxConfig(new Uint8Array([3, 5, 3, 2, 1, 1, 2]));
    expect(cfg).toMatchObject({
      vtxType: 3, band: 5, channel: 3, power: 2, pitMode: true, deviceReady: true, lowPowerDisarm: 2, frequency: 5732,
    });
  });

  it('reads an unknown device as an empty config', () => {
    expect(deserializeInavVtxConfig(new Uint8Array([0xff]))).toMatchObject({ vtxType: 0xff, band: 0 });
  });
});
