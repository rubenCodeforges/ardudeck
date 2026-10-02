import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MSP, MSP2 } from '@ardudeck/msp-ts';

const sent: Array<{ cmd: number; payload: number[] }> = [];
const replies = new Map<number, Uint8Array>();
let rejectCmd: number | null = null;

vi.mock('./msp-transport.js', () => {
  const reply = async (cmd: number, payload?: Uint8Array) => {
    sent.push({ cmd, payload: payload ? Array.from(payload) : [] });
    if (cmd === rejectCmd) throw new Error(`MSP command ${cmd} rejected by the flight controller`);
    return replies.get(cmd) ?? new Uint8Array(0);
  };
  return {
    sendMspRequest: (cmd: number) => reply(cmd),
    sendMspRequestWithPayload: (cmd: number, p: Uint8Array) => reply(cmd, p),
    sendMspV2Request: (cmd: number) => reply(cmd),
    sendMspV2RequestWithPayload: (cmd: number, p: Uint8Array) => reply(cmd, p),
    withConfigLock: <T>(fn: () => Promise<T>) => fn(),
    isCliModeBlockedError: () => false,
  };
});

const mixerConfig = { numberOfMotors: 4, numberOfServos: 2 };
vi.mock('./msp-mixer.js', () => ({
  getInavMixerConfig: async () => ({
    yawMotorDirection: 1, yawJumpPreventionLimit: 200, motorStopOnLow: 0, platformType: 0,
    hasFlaps: 0, appliedMixerPreset: 0, ...mixerConfig,
  }),
}));

const settingStore: Record<string, string | number> = {};
const rejectedSettings = new Set<string>();
vi.mock('./msp-settings.js', () => ({
  getSetting: async (name: string) => (name in settingStore ? { value: settingStore[name], info: {} } : null),
  setSetting: async (name: string, value: string | number) => {
    if (rejectedSettings.has(name)) return false;
    settingStore[name] = value;
    return true;
  },
}));

vi.mock('./msp-telemetry.js', () => ({ stopMspTelemetry: () => {}, startMspTelemetry: () => {} }));
vi.mock('./msp-cleanup.js', () => ({ cleanupMspConnection: () => {} }));

const { ctx } = await import('./msp-context.js');
const { getRcTuning, setRcTuning } = await import('./msp-pid-rates.js');
const { setMotorMixer } = await import('./msp-motor-mixer.js');
const { setServoMixerRules, saveServoConfigViaCli, setServoConfig } = await import('./msp-servo.js');
const { setNavConfig, getNavConfig } = await import('./msp-navigation.js');
const { setFilterConfig } = await import('./msp-peripheral-config.js');

beforeEach(() => {
  sent.length = 0;
  replies.clear();
  rejectCmd = null;
  rejectedSettings.clear();
  for (const k of Object.keys(settingStore)) delete settingStore[k];
  ctx.currentTransport = { isOpen: true } as unknown as typeof ctx.currentTransport;
  ctx.isInavFirmware = true;
  ctx.cachedInavRateProfile = null;
  ctx.servoCliModeActive = false;
  ctx.sendLog = () => {};
});

describe('INAV rates save', () => {
  it('keeps the MANUAL rates read from the FC', async () => {
    const fromFc = new Uint8Array([50, 0, 10, 0xdc, 0x05, 70, 20, 36, 36, 20, 35, 25, 80, 90, 60]);
    replies.set(MSP2.INAV_RATE_PROFILE, fromFc);
    const rc = await getRcTuning();
    expect(await setRcTuning({ ...rc!, rollRate: 400 })).toBe(true);
    const write = sent.find(s => s.cmd === MSP2.INAV_SET_RATE_PROFILE)!;
    expect(write.payload.slice(10)).toEqual([35, 25, 80, 90, 60]);
    expect(write.payload[7]).toBe(40);
  });

  it('reads the profile first when nothing is cached', async () => {
    replies.set(MSP2.INAV_RATE_PROFILE, new Uint8Array([50, 0, 10, 0xdc, 0x05, 70, 20, 36, 36, 20, 1, 2, 3, 4, 5]));
    const ok = await setRcTuning({ rollRate: 360, pitchRate: 360, yawRate: 200 } as never);
    expect(ok).toBe(true);
    expect(sent[0]!.cmd).toBe(MSP2.INAV_RATE_PROFILE);
    expect(sent[1]!.payload.slice(10)).toEqual([1, 2, 3, 4, 5]);
  });

  it('returns false on rejection instead of falling back to MSP1 or CLI', async () => {
    replies.set(MSP2.INAV_RATE_PROFILE, new Uint8Array(15));
    rejectCmd = MSP2.INAV_SET_RATE_PROFILE;
    expect(await setRcTuning({ rollRate: 360 } as never)).toBe(false);
    expect(sent.some(s => s.cmd === MSP.SET_RC_TUNING)).toBe(false);
  });
});

describe('INAV mixer writes', () => {
  it('writes every motor slot and clears the unused ones', async () => {
    expect(await setMotorMixer([{ throttle: 1, roll: 0, pitch: 0, yaw: 0 }])).toBe(true);
    const writes = sent.filter(s => s.cmd === MSP2.COMMON_SET_MOTOR_MIXER);
    expect(writes.map(w => w.payload[0])).toEqual([0, 1, 2, 3]);
    expect(writes[3]!.payload).toEqual([3, 0xd0, 0x07, 0xd0, 0x07, 0xd0, 0x07, 0xd0, 0x07]);
  });

  it('clears all motors when given an empty list instead of reporting success without writing', async () => {
    expect(await setMotorMixer([])).toBe(true);
    expect(sent.filter(s => s.cmd === MSP2.COMMON_SET_MOTOR_MIXER)).toHaveLength(4);
  });

  it('writes numberOfServos * 2 servo rule slots', async () => {
    const ok = await setServoMixerRules([
      { targetChannel: 1, inputSource: 0, rate: 100, speed: 0, min: 0, max: 0, box: -1 },
    ]);
    expect(ok).toBe(true);
    const writes = sent.filter(s => s.cmd === MSP2.INAV_SET_SERVO_MIXER);
    expect(writes).toHaveLength(4);
    expect(writes[3]!.payload).toEqual([3, 0, 0, 0, 0, 0, 0xff]);
  });
});

describe('INAV servo config', () => {
  it('uses MSP2_INAV_SET_SERVO_CONFIG and returns false on rejection', async () => {
    const cfg = { min: 1000, max: 2000, middle: 1500, rate: -100, forwardFromChannel: 255, reversedSources: 0 };
    expect(await setServoConfig(1, cfg)).toBe(true);
    expect(sent[0]).toEqual({ cmd: MSP2.INAV_SET_SERVO_CONFIG, payload: [1, 0xe8, 0x03, 0xd0, 0x07, 0xdc, 0x05, 0x9c] });
    rejectCmd = MSP2.INAV_SET_SERVO_CONFIG;
    expect(await setServoConfig(1, cfg)).toBe(false);
  });

  it('CLI save does not report success when no CLI session is open', async () => {
    expect(await saveServoConfigViaCli()).toBe(false);
  });
});

describe('INAV nav config', () => {
  it('reads and writes named settings, never OSD preferences', async () => {
    Object.assign(settingStore, { nav_rth_altitude: 1000, nav_rth_alt_mode: 'AT_LEAST' });
    const nav = await getNavConfig();
    expect(nav).toMatchObject({ rthAltitude: 1000, rthAltControlMode: 4 });
    expect(await setNavConfig({ rthAltitude: 2500 })).toBe(true);
    expect(settingStore.nav_rth_altitude).toBe(2500);
    expect(sent.some(s => s.cmd === 0x2016 || s.cmd === 0x2017)).toBe(false);
  });

  it('returns false when a setting write is rejected', async () => {
    settingStore.nav_rth_altitude = 1000;
    rejectedSettings.add('nav_rth_altitude');
    expect(await setNavConfig({ rthAltitude: 2500 })).toBe(false);
  });
});

describe('filters on INAV', () => {
  it('never sends the Betaflight filter layout', async () => {
    expect(await setFilterConfig({} as never)).toBe(false);
    expect(sent).toHaveLength(0);
  });
});
