import { describe, it, expect } from 'vitest';
import { resolveLanguage } from './index';

describe('resolveLanguage', () => {
  it('takes an exact shipped code', () => {
    expect(resolveLanguage('system', 'de')).toBe('de');
    expect(resolveLanguage('system', 'zh-TW')).toBe('zh-TW');
    expect(resolveLanguage('system', 'zh-CN')).toBe('zh-CN');
  });

  it('falls back to the base language for a region tag', () => {
    expect(resolveLanguage('system', 'de-AT')).toBe('de');
    expect(resolveLanguage('system', 'en-GB')).toBe('en');
  });

  // The regression: 'zh' names no shipped file, so these used to land on English.
  it('sends traditional Chinese to zh-TW', () => {
    expect(resolveLanguage('system', 'zh-Hant')).toBe('zh-TW');
    expect(resolveLanguage('system', 'zh-Hant-TW')).toBe('zh-TW');
    expect(resolveLanguage('system', 'zh-HK')).toBe('zh-TW');
    expect(resolveLanguage('system', 'zh-MO')).toBe('zh-TW');
  });

  it('sends simplified Chinese to zh-CN', () => {
    expect(resolveLanguage('system', 'zh-Hans')).toBe('zh-CN');
    expect(resolveLanguage('system', 'zh-Hans-CN')).toBe('zh-CN');
    expect(resolveLanguage('system', 'zh-SG')).toBe('zh-CN');
  });

  it('sends bare zh to simplified, the larger population', () => {
    expect(resolveLanguage('system', 'zh')).toBe('zh-CN');
  });

  it('is case insensitive about the script and region', () => {
    expect(resolveLanguage('system', 'zh-hant-hk')).toBe('zh-TW');
    expect(resolveLanguage('system', 'ZH-HANS')).toBe('zh-CN');
  });

  it('prefers an explicit preference over the OS locale', () => {
    expect(resolveLanguage('zh-TW', 'de-AT')).toBe('zh-TW');
    expect(resolveLanguage('de', 'zh-Hans')).toBe('de');
  });

  it('falls back to English for anything unshipped', () => {
    expect(resolveLanguage('system', 'it-IT')).toBe('en');
    expect(resolveLanguage('system', 'ja')).toBe('en');
  });
});
