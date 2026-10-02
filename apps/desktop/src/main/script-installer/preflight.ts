/**
 * Preflight checks for installing ArduDeck commands onto a flight controller.
 *
 * Reads the FC parameters and current vehicle state, then evaluates each
 * requirement from the script manifest. Returns a structured list the UI
 * can render with severity colors and inline-fix actions.
 *
 * This module is pure - it doesn't talk to the FC directly. Callers are
 * expected to fetch params via PARAM_READ_BATCH first and pass them in.
 * That keeps preflight testable and decouples it from MAVLink internals.
 */

import type {
  PreflightCheck,
  ScriptManifest,
} from '../../shared/script-installer-types';
import { t } from '../../shared/i18n/index.js';

interface PreflightInputs {
  manifest: ScriptManifest;
  /** Param values read from the FC (paramId → value). Missing params should be omitted. */
  paramValues: Record<string, number>;
  /** Vehicle armed state from telemetry. */
  vehicleArmed: boolean;
  /** Whether the FC connection supports MAVLink FTP. */
  ftpSupported: boolean;
  /**
   * Currently-loaded script count on the FC. Optional - if we can't determine
   * it cheaply, the check is skipped (the install will still respect the FC's
   * actual SCR_LD_NUM at upload time, just without a friendly preflight warning).
   */
  loadedScriptCount?: number;
}

/**
 * Evaluate every check and return them in a stable order suitable for UI.
 *
 * Order matters: checks are listed in roughly "most important / most likely
 * to block" order so users scanning from the top see the deal-breakers first.
 */
export function runPreflight(inputs: PreflightInputs): PreflightCheck[] {
  const { manifest, paramValues, vehicleArmed, ftpSupported, loadedScriptCount } = inputs;
  const out: PreflightCheck[] = [];

  // 1. FTP capability is a hard prerequisite - we can't write without it.
  out.push({
    id: 'ftp_supported',
    label: t('main:scriptPreflight.ftpLabel'),
    severity: ftpSupported ? 'pass' : 'block',
    detail: ftpSupported
      ? t('main:scriptPreflight.ftpPass')
      : t('main:scriptPreflight.ftpFail'),
    fix: null,
  });

  // 2. Manifest-declared parameter requirements (e.g. SCR_ENABLE = 1, SCR_HEAP_SIZE >= 65536).
  for (const req of manifest.requirements) {
    const current = paramValues[req.param];
    let pass = false;
    let detail = req.why;

    if (current === undefined) {
      pass = false;
      detail = t('main:scriptPreflight.paramMissing', { why: req.why, param: req.param });
    } else if (req.exact !== undefined) {
      pass = current === req.exact;
      detail = pass
        ? t('main:scriptPreflight.paramExactPass', { why: req.why, current })
        : t('main:scriptPreflight.paramExactFail', { why: req.why, param: req.param, current, target: req.exact });
    } else if (req.min !== undefined) {
      pass = current >= req.min;
      detail = pass
        ? t('main:scriptPreflight.paramMinPass', { why: req.why, current, min: req.min })
        : t('main:scriptPreflight.paramMinFail', { why: req.why, param: req.param, current, min: req.min });
    }

    const target = req.exact ?? req.min ?? 0;
    out.push({
      id: `param_${req.param}`,
      label: req.exact !== undefined
        ? `${req.param} = ${req.exact}`
        : `${req.param} ≥ ${req.min}`,
      severity: pass ? 'pass' : 'block',
      detail,
      currentValue: current ?? 'unknown',
      expectedValue: target,
      fix: pass ? null : {
        type: 'set_param',
        param: req.param,
        value: target,
        requiresReboot: req.rebootIfChanged,
      },
    });
  }

  // 3. Free script slots (best-effort - skipped if we don't know).
  if (loadedScriptCount !== undefined) {
    const scrLdNum = paramValues['SCR_LD_NUM'] ?? 6;
    const free = Math.max(0, scrLdNum - loadedScriptCount);
    out.push({
      id: 'script_slots',
      label: t('main:scriptPreflight.slotsLabel'),
      severity: free >= 1 ? 'pass' : 'block',
      detail: free >= 1
        ? t('main:scriptPreflight.slotsPass', { free, max: scrLdNum })
        : t('main:scriptPreflight.slotsFail', { loaded: loadedScriptCount, max: scrLdNum }),
      currentValue: t('main:scriptPreflight.slotsValue', { free, max: scrLdNum }),
      expectedValue: t('main:scriptPreflight.slotsExpected'),
      fix: free >= 1 ? null : null,
    });
  }

  // 4. Vehicle armed - warn but don't block. User may have a reason to install
  //    mid-flight (e.g. landed but still armed). However any required reboot
  //    will be blocked separately when applying the fix.
  out.push({
    id: 'armed_state',
    label: t('main:scriptPreflight.disarmedLabel'),
    severity: vehicleArmed ? 'warn' : 'pass',
    detail: vehicleArmed
      ? t('main:scriptPreflight.armedWarn')
      : t('main:scriptPreflight.disarmedPass'),
    fix: vehicleArmed ? { type: 'disarm' } : null,
  });

  return out;
}

/**
 * Convenience: returns true iff every check is at most warn severity (i.e.
 * nothing is blocking). Use to gate the "Install" button in the consent UI.
 */
export function preflightOk(checks: PreflightCheck[]): boolean {
  return checks.every(c => c.severity !== 'block');
}
