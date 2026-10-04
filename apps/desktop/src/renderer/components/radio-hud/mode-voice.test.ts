import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { modeVoiceCfg, FALLBACK_CLIP } from './mode-voice';

const SND = join(__dirname, '../../../../resources/edgetx/ardudeck-hud/SD/WIDGETS/ardudeck/snd');
const parse = (cfg: string): Record<string, string> => Object.fromEntries(cfg.split(',').map((p) => p.split(':')));

describe('mode voice table', () => {
  it('speaks plane modes by their own name, not the copter mode with the same number', () => {
    const plane = parse(modeVoiceCfg('plane'));
    expect(plane['0']).toBe('mode_manual');
    expect(plane['5']).toBe('mode_fbwa');
    expect(plane['13']).toBe('mode_takeoff');
    expect(plane['11']).toBe('mode_6');
    expect(plane['12']).toBe('mode_5');
  });

  it('keeps the copter numbering for copters', () => {
    const copter = parse(modeVoiceCfg('copter'));
    expect(copter['0']).toBe('mode_0');
    expect(copter['13']).toBe('mode_13');
  });

  it('maps rover HOLD to its own clip', () => {
    expect(parse(modeVoiceCfg('rover'))['4']).toBe('mode_hold');
  });

  it.each(['copter', 'plane', 'vtol', 'rover', 'sub'] as const)('every %s clip exists on the SD card', (v) => {
    for (const clip of Object.values(parse(modeVoiceCfg(v)))) {
      expect(existsSync(join(SND, `${clip}.wav`)), clip).toBe(true);
    }
    expect(existsSync(join(SND, `${FALLBACK_CLIP}.wav`))).toBe(true);
  });
});
