/**
 * Shared visual language for the pre-flight weather briefing. Colours are the
 * theme-aware instrument status vars (--gauge-green / amber / red), so every
 * accent reads in both light and dark; the state wash and pill are built with
 * color-mix off those same vars, never an opacity-suffixed semantic token.
 *
 * This is the scaled-up sibling of the compact weather card in the Vehicle &
 * Status settings section: same state-wash + pill + small-caps stat language.
 */
import {
  Sun, Moon, Cloud, CloudSun, CloudRain, CloudFog, type LucideIcon,
} from 'lucide-react';
import type { WeatherSummary } from '../../utils/weather-api';
import { type WxStatus } from './weather-thresholds';

export type Grade = WxStatus | 'info';

/** Vivid, theme-aware accent per grade. 'info' is a neutral (non-gating) tone. */
export const GRADE_COLOR: Record<Grade, string> = {
  go: 'var(--gauge-green)',
  caution: 'var(--gauge-amber)',
  nogo: 'var(--gauge-red)',
  info: 'var(--gauge-text-dim)',
};

export const STATUS_PILL_WORD_KEY: Record<WxStatus, string> = {
  go: 'weather:status.go',
  caution: 'weather:status.caution',
  nogo: 'weather:status.nogoPill',
};

export const STATUS_SUMMARY_KEY: Record<WxStatus, string> = {
  go: 'weather:status.goSummary',
  caution: 'weather:status.cautionSummary',
  nogo: 'weather:status.nogoSummary',
};

/**
 * Soft diagonal wash + border for the whole briefing surface, tied to the
 * verdict. Fades the status colour into the solid surface then the page base
 * so on NO-GO the surface itself reads red, in either theme.
 */
export function washStyle(color: string): { background: string; borderColor: string; boxShadow: string } {
  return {
    background: `linear-gradient(158deg,
      color-mix(in srgb, ${color} 22%, var(--bg-surface-solid)) 0%,
      color-mix(in srgb, ${color} 9%, var(--bg-base)) 46%,
      var(--bg-base) 100%)`,
    borderColor: `color-mix(in srgb, ${color} 45%, transparent)`,
    boxShadow: `0 18px 48px -24px color-mix(in srgb, ${color} 60%, transparent)`,
  };
}

/** Tinted inset panel (wind block, warning strip) built off a status colour. */
export function tintStyle(color: string, fill = 12, border = 34): { background: string; borderColor: string } {
  return {
    background: `color-mix(in srgb, ${color} ${fill}%, transparent)`,
    borderColor: `color-mix(in srgb, ${color} ${border}%, transparent)`,
  };
}

export function pillStyle(color: string): { background: string; borderColor: string; color: string } {
  return {
    background: `color-mix(in srgb, ${color} 18%, transparent)`,
    borderColor: `color-mix(in srgb, ${color} 42%, transparent)`,
    color,
  };
}

export interface Condition {
  labelKey: string;
  Icon: LucideIcon;
  isNight: boolean;
}

// Open-Meteo local ISO times share the site timezone, so a lexical compare of
// "YYYY-MM-DDTHH:MM" against sunrise/sunset is a correct day/night test.
function isNight(wx: WeatherSummary): boolean {
  const now = wx.currentTimeIso;
  if (!now || !wx.sunriseIso || !wx.sunsetIso) return false;
  return now < wx.sunriseIso || now >= wx.sunsetIso;
}

/**
 * Plain-language condition from the fields the briefing already fetches (no
 * weather_code in this endpoint): precipitation and visibility first, then
 * cloud cover, with a day/night glyph for clear skies.
 */
export function deriveCondition(wx: WeatherSummary): Condition {
  const night = isNight(wx);
  if (wx.precipMm >= 0.1 || wx.precipProbPct >= 60) {
    return { labelKey: 'weather:condition.rain', Icon: CloudRain, isNight: night };
  }
  if (wx.visibilityM > 0 && wx.visibilityM < 1000) {
    return { labelKey: 'weather:condition.fog', Icon: CloudFog, isNight: night };
  }
  if (wx.cloudCoverPct >= 85) {
    return { labelKey: 'weather:condition.overcast', Icon: Cloud, isNight: night };
  }
  if (wx.cloudCoverPct >= 40) {
    return { labelKey: 'weather:condition.partlyCloudy', Icon: CloudSun, isNight: night };
  }
  return { labelKey: 'weather:condition.clear', Icon: night ? Moon : Sun, isNight: night };
}
