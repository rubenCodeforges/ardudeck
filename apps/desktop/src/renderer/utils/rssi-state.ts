import { t } from '../../shared/i18n/index.js';

/**
 * What the vehicle's RSSI reading actually means.
 *
 * ArduPilot sends 255 for "RSSI is switched off" and a scaled 0-254 otherwise,
 * where RSSI_TYPE picks the source. A live RC link reporting exactly 0 is not a
 * dying link, it is RSSI_TYPE pointing at a source that produces nothing (an
 * analog pin on a CRSF setup, say), and showing that as 0% has people chasing a
 * radio problem they do not have.
 */

export type RssiKind = 'value' | 'off' | 'unconfigured' | 'no-link';

export interface RssiState {
  kind: RssiKind;
  /** 0-100, only meaningful when kind is 'value'. */
  pct: number;
  /** True when the number comes from the telemetry modem, not the receiver. */
  fromModem: boolean;
}

export interface RssiInputs {
  connected: boolean;
  /** RC_CHANNELS.rssi, 0-254, 255 = unknown. */
  rcRssi: number;
  /** RC_CHANNELS.chancount; 0 means no RC data at all. */
  chancount: number;
  /** RADIO_STATUS.rssi from a SiK/RFD-class modem, if any. */
  modemRssi: number | null;
}

const UNKNOWN = 255;

export function rssiState({ connected, rcRssi, chancount, modemRssi }: RssiInputs): RssiState {
  if (!connected) return { kind: 'no-link', pct: 0, fromModem: false };

  const rcReporting = chancount > 0 && rcRssi !== UNKNOWN;
  const modemReporting = modemRssi !== null && modemRssi !== UNKNOWN;

  if (rcReporting && rcRssi > 0) {
    return { kind: 'value', pct: toPct(rcRssi), fromModem: false };
  }
  // A receiver that is delivering channels while reporting zero strength is
  // the misconfigured case; fall back to the modem before saying so.
  if (modemReporting && modemRssi > 0) {
    return { kind: 'value', pct: toPct(modemRssi), fromModem: true };
  }
  if (rcReporting && rcRssi === 0) {
    return { kind: 'unconfigured', pct: 0, fromModem: false };
  }
  if (modemReporting && modemRssi === 0) {
    return { kind: 'unconfigured', pct: 0, fromModem: true };
  }
  return { kind: 'off', pct: 0, fromModem: false };
}

function toPct(raw: number): number {
  return Math.round((Math.min(raw, 254) / 254) * 100);
}

/** Short label for a gauge face. */
export function rssiText(state: RssiState): string {
  return state.kind === 'value' ? `${state.pct}` : '--';
}

/** One line explaining a reading that is not a number. */
export function rssiHint(state: RssiState): string | null {
  switch (state.kind) {
    case 'value': return null;
    case 'no-link': return t('utils:rssiState.noLink');
    case 'off': return t('utils:rssiState.off');
    case 'unconfigured': return t('utils:rssiState.unconfigured');
  }
}
