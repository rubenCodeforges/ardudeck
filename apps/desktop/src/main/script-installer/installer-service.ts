/**
 * Installer state machine for ArduDeck Lua scripts.
 *
 * Owns the install flow end-to-end:
 *   preflight → awaiting_consent → (configuring_params → rebooting)*
 *             → uploading → awaiting_heartbeat → verifying → success
 *
 * Cancellable at every step. Emits state changes to the renderer via the
 * supplied stateEmitter so the UI is purely reactive.
 *
 * The service is intentionally decoupled from MAVLink internals. It receives
 * an `FcAdapter` that exposes only the operations the installer needs:
 * read params, set params, reboot, FTP-write, get vehicle armed state. This
 * makes it testable and keeps the dependency graph clean.
 */

import { createHash } from 'crypto';
import type {
  AuditEntry,
  FcRegistryEntry,
  InstallErrorCode,
  InstallPhase,
  PreflightCheck,
  PreflightFix,
  ScriptManifest,
} from '../../shared/script-installer-types';
import { runPreflight, preflightOk } from './preflight';
import { resetHeartbeat, waitForHeartbeat } from './heartbeat-tracker';
import * as registry from './registry-store';
import { t } from '../../shared/i18n/index.js';

/**
 * Adapter interface the installer uses to talk to the connected flight
 * controller. The real implementation lives in the main process (wired to
 * currentTransport, sendMavlinkPacket, etc); a stub implementation is used
 * for tests.
 */
export interface FcAdapter {
  /** Stable per-FC ID derived from AUTOPILOT_VERSION (uid2 / uid). */
  getAutopilotUid(): string | null;
  /** Best-effort human-friendly label for the FC. */
  getVehicleLabel(): string | null;
  /** Whether MAVLink FTP is supported on this connection. */
  isFtpSupported(): boolean;
  /** Whether the vehicle is currently armed. */
  isVehicleArmed(): boolean;
  /** Whether this connection is an in-process SITL simulator (not real HW). */
  isSitl(): boolean;
  /**
   * Quick (≤2 s) writability probe. Tries to open a throwaway filename for
   * write to determine if the FC's SD card / filesystem accepts FTP writes.
   * Returns a structured verdict so the installer can pick the right path
   * (FTP vs manual) without burning 40+ seconds on retries.
   */
  probeWritability(probePath: string): Promise<WritabilityProbe>;
  /** Read multiple params in parallel. Missing params come back undefined. */
  readParams(paramIds: string[]): Promise<Record<string, number>>;
  /** Set a single param. Resolves after FC ACKs the value. */
  setParam(paramId: string, value: number): Promise<boolean>;
  /** Reboot the FC. Resolves after the connection has come back up. */
  rebootAndReconnect(timeoutSec: number): Promise<boolean>;
  /** Upload bytes to a path on the FC's SD card via MAVLink FTP. */
  ftpUpload(path: string, contents: Uint8Array, onProgress: (written: number, total: number) => void): Promise<boolean>;
  /** Optionally count loaded scripts (returns null if not determinable). */
  getLoadedScriptCount(): Promise<number | null>;
}

export type WritabilityProbe =
  | { verdict: 'writable' }
  | { verdict: 'no_sd_card'; detail: string }
  | { verdict: 'no_response'; detail: string }
  | { verdict: 'rejected'; detail: string };

/** Renderer-bound emitter the service uses to push state updates. */
export type InstallStateEmitter = (phase: InstallPhase) => void;

/** Computed at module load time from the bundled Lua source. */
export interface ScriptBundle {
  manifest: ScriptManifest;
  source: string;
  sourceBytes: Uint8Array;
}

/**
 * Build a manifest + bundle from the bundled Lua source. Computes the SHA256
 * over the actual bytes that will be written to the FC, so users can verify
 * the preview matches what's installed.
 */
export function buildScriptBundle(source: string, partialManifest: Omit<ScriptManifest, 'sha256' | 'sizeBytes'>): ScriptBundle {
  const sourceBytes = new TextEncoder().encode(source);
  const sha256 = createHash('sha256').update(sourceBytes).digest('hex');
  const manifest: ScriptManifest = {
    ...partialManifest,
    sha256,
    sizeBytes: sourceBytes.length,
  };
  return { manifest, source, sourceBytes };
}

interface InternalState {
  bundle: ScriptBundle;
  adapter: FcAdapter;
  emitter: InstallStateEmitter;
  /** Set to true on cancel - every long-running step polls this to abort. */
  cancelled: boolean;
  /** Pending consent promise: install pauses awaiting_consent until resolved. */
  consentPromise: { resolve: () => void; reject: (reason: Error) => void } | null;
}

let active: InternalState | null = null;

/** Begin an install. Idempotent: if one is already in flight, this is a no-op. */
export async function beginInstall(args: {
  bundle: ScriptBundle;
  adapter: FcAdapter;
  emitter: InstallStateEmitter;
}): Promise<void> {
  if (active) return; // already running
  active = {
    bundle: args.bundle,
    adapter: args.adapter,
    emitter: args.emitter,
    cancelled: false,
    consentPromise: null,
  };
  try {
    await runFlow(active);
  } finally {
    active = null;
  }
}

export function grantConsent(): void {
  if (active?.consentPromise) {
    const p = active.consentPromise;
    active.consentPromise = null;
    p.resolve();
  }
}

export function cancelInstall(): void {
  if (!active) return;
  active.cancelled = true;
  if (active.consentPromise) {
    const p = active.consentPromise;
    active.consentPromise = null;
    p.reject(new InstallCancelled());
  }
}

export async function applyFix(fix: PreflightFix): Promise<void> {
  if (!active) throw new Error('No install in progress'); // i18n-exempt
  const { adapter, emitter, bundle } = active;
  if (fix.type === 'set_param') {
    const before = (await adapter.readParams([fix.param]))[fix.param] ?? 0;
    emitter({
      phase: 'configuring_params',
      param: fix.param,
      before,
      after: fix.value,
      rebootRequired: fix.requiresReboot,
    });
    const ok = await adapter.setParam(fix.param, fix.value);
    if (!ok) {
      emitFatal(emitter, 'PARAM_SET_FAILED', t('main:scriptInstaller.setParamFailed', { param: fix.param }));
      return;
    }
    // Record the change for revert-on-uninstall.
    const uid = adapter.getAutopilotUid();
    if (uid) {
      // Best-effort: only record if we already have a registry entry. If the
      // user hasn't consented to install yet we don't want to create one.
      const existing = registry.get(uid);
      if (existing) {
        registry.recordParamChange(uid, {
          param: fix.param,
          before,
          after: fix.value,
          timestamp: new Date().toISOString(),
          revertible: true,
        });
        registry.appendAudit(uid, 'param_set', `${fix.param}: ${before} → ${fix.value}`);
      }
    }
    if (fix.requiresReboot) {
      if (adapter.isVehicleArmed()) {
        emitFatal(emitter, 'VEHICLE_ARMED_BLOCK', t('main:scriptInstaller.cannotRebootArmed'));
        return;
      }
      emitter({ phase: 'rebooting', secondsWaited: 0, estimatedTotalSec: 30 });
      // Tick the secondsWaited counter so the UI shows progress while rebooting.
      let elapsed = 0;
      const tick = setInterval(() => {
        elapsed += 1;
        emitter({ phase: 'rebooting', secondsWaited: elapsed, estimatedTotalSec: 30 });
      }, 1000);
      const ok = await adapter.rebootAndReconnect(45);
      clearInterval(tick);
      if (!ok) {
        emitFatal(emitter, 'REBOOT_TIMED_OUT', 'FC did not come back up after reboot. For SITL, you may need to restart the simulator and reconnect manually.');
        return;
      }
    }
    // After a fix, re-run preflight so the user sees updated state.
    await emitPreflight(active);
    // Re-emit awaiting_consent so the UI returns to the consent step.
    emitter({
      phase: 'awaiting_consent',
      manifest: bundle.manifest,
      checks: await runPreflightAgainst(active),
      sourceCode: bundle.source,
    });
  } else if (fix.type === 'reboot') {
    if (adapter.isVehicleArmed()) {
      emitFatal(emitter, 'VEHICLE_ARMED_BLOCK', t('main:scriptInstaller.cannotRebootArmed'));
      return;
    }
    emitter({ phase: 'rebooting', secondsWaited: 0, estimatedTotalSec: 20 });
    const ok = await adapter.rebootAndReconnect(45);
    if (!ok) {
      emitFatal(emitter, 'REBOOT_TIMED_OUT', 'FC did not come back up after reboot');
      return;
    }
    await emitPreflight(active);
  } else if (fix.type === 'disarm') {
    // We never auto-disarm. Surface an explanatory error.
    emitFatal(active.emitter, 'VEHICLE_ARMED_BLOCK', t('main:scriptInstaller.disarmFirst'));
  }
}

// ─── Internals ───────────────────────────────────────────────────────────────

class InstallCancelled extends Error {
  constructor() { super('Install cancelled by user'); } // i18n-exempt
}

function emitFatal(emitter: InstallStateEmitter, code: InstallErrorCode, message: string) {
  emitter({ phase: 'error', code, message, retriable: code !== 'CANCELLED' });
}

async function runPreflightAgainst(state: InternalState): Promise<PreflightCheck[]> {
  const requiredParams = state.bundle.manifest.requirements.map(r => r.param);
  // Always also probe SCR_LD_NUM so we can compute free slots if loaded count is available.
  const allParams = Array.from(new Set([...requiredParams, 'SCR_LD_NUM']));
  const paramValues = await state.adapter.readParams(allParams);
  const loadedScriptCount = await state.adapter.getLoadedScriptCount();
  return runPreflight({
    manifest: state.bundle.manifest,
    paramValues,
    vehicleArmed: state.adapter.isVehicleArmed(),
    ftpSupported: state.adapter.isFtpSupported(),
    loadedScriptCount: loadedScriptCount ?? undefined,
  });
}

async function emitPreflight(state: InternalState): Promise<PreflightCheck[]> {
  state.emitter({ phase: 'preflight', checks: [] });
  const checks = await runPreflightAgainst(state);
  state.emitter({ phase: 'preflight', checks });
  return checks;
}

async function runFlow(state: InternalState) {
  const { adapter, emitter, bundle } = state;
  try {
    // 1. Preflight
    if (!adapter.getAutopilotUid()) {
      emitFatal(emitter, 'NOT_CONNECTED', t('main:scriptInstaller.noFc'));
      return;
    }
    const checks = await emitPreflight(state);
    if (state.cancelled) throw new InstallCancelled();

    // 2. Consent (block until grantConsent or cancelInstall)
    if (!preflightOk(checks)) {
      // Stay in awaiting_consent so user can apply fixes inline
    }
    emitter({
      phase: 'awaiting_consent',
      manifest: bundle.manifest,
      checks,
      sourceCode: bundle.source,
    });
    await waitForConsent(state);
    if (state.cancelled) throw new InstallCancelled();

    // Re-run preflight one final time to catch any drift between consent and upload.
    const finalChecks = await runPreflightAgainst(state);
    if (!preflightOk(finalChecks)) {
      emitFatal(emitter, 'PRECHECK_FAILED', t('main:scriptInstaller.preflightFailedAfterConsent'));
      return;
    }

    // 3. Capability probe before attempting the real upload. This is the
    // single most impactful UX change: instead of burning 40+ seconds on
    // FTP retries when the FC has no SD card / SITL / write-disabled FTP,
    // we ask one quick question (≤1.5 s) and route to manual install
    // immediately if the answer is "no can do".
    const path = `/APM/scripts/${bundle.manifest.filename}`;
    const probePath = `/APM/scripts/.ardudeck_probe_${Date.now()}`;
    emitter({ phase: 'probing_capability' });
    const probe = await adapter.probeWritability(probePath);
    if (probe.verdict !== 'writable') {
      emitter({
        phase: 'manual_install_needed',
        manifest: bundle.manifest,
        ftpError: `${probe.verdict}: ${probe.detail}`,
        targetPath: path,
      });
      return;
    }

    // 4. Upload (probe says writes work, so this should succeed)
    emitter({ phase: 'uploading', filename: bundle.manifest.filename, bytesWritten: 0, bytesTotal: bundle.sourceBytes.length });
    let uploaded = false;
    let uploadError: string | undefined;
    try {
      uploaded = await adapter.ftpUpload(path, bundle.sourceBytes, (written, total) => {
        emitter({ phase: 'uploading', filename: bundle.manifest.filename, bytesWritten: written, bytesTotal: total });
      });
    } catch (err) {
      uploadError = err instanceof Error ? err.message : String(err);
    }
    if (!uploaded) {
      // Detect "filesystem refused the write" errors that the user can fix by
      // dropping the .lua on the SD card themselves. ArduPilot's MAVLink-FTP
      // write support is genuinely flaky across builds; offering a clean
      // manual path is more honest than retrying ad infinitum.
      const isFsRejection = uploadError ? /Fail|FailErrno|FileNotFound|FileExists|InvalidDataSize/i.test(uploadError) : false;
      if (isFsRejection) {
        emitter({
          phase: 'manual_install_needed',
          manifest: bundle.manifest,
          ftpError: uploadError ?? 'unknown',
          targetPath: path,
        });
        return;
      }
      // Genuine failure (timeout, transport closed, etc) - surface as error.
      const detail = uploadError
        ? `FTP upload failed: ${uploadError}`
        : 'FTP upload failed (no specific error reported)';
      emitFatal(emitter, 'FTP_WRITE_FAILED', detail);
      return;
    }

    const uid = adapter.getAutopilotUid()!;
    const auditEntry: AuditEntry = {
      type: 'ftp_write',
      timestamp: new Date().toISOString(),
      summary: `Wrote ${bundle.manifest.filename} (${bundle.sourceBytes.length} bytes)`, // i18n-exempt
    };

    // 4. Wait for heartbeat - script must publish AD_HB to confirm it loaded.
    // Generous timeout: SITL needs ~6-10 s for cold-boot ArduPilot init + a
    // few seconds before the scripting subsystem starts running update().
    // Real hardware boots faster but a longer ceiling doesn't hurt.
    const HEARTBEAT_TIMEOUT_SEC = 60;
    resetHeartbeat();
    emitter({ phase: 'awaiting_heartbeat', secondsWaited: 0, timeoutSec: HEARTBEAT_TIMEOUT_SEC });
    // Tick the secondsWaited counter so the UI shows progress while waiting.
    let waitElapsed = 0;
    const waitTick = setInterval(() => {
      waitElapsed += 1;
      emitter({ phase: 'awaiting_heartbeat', secondsWaited: waitElapsed, timeoutSec: HEARTBEAT_TIMEOUT_SEC });
    }, 1000);
    const observedVersion = await waitForHeartbeat(HEARTBEAT_TIMEOUT_SEC * 1000);
    clearInterval(waitTick);
    if (observedVersion === null) {
      emitFatal(emitter, 'HEARTBEAT_TIMED_OUT', t('main:scriptInstaller.noHeartbeat', { name: bundle.manifest.heartbeat.name, seconds: HEARTBEAT_TIMEOUT_SEC }));
      return;
    }

    // 5. Verify version
    emitter({ phase: 'verifying', expectedVersion: bundle.manifest.version });
    const expectedFloat = parseFloat(bundle.manifest.version);
    if (!Number.isNaN(expectedFloat) && Math.abs(observedVersion - expectedFloat) > 0.001) {
      emitFatal(emitter, 'VERSION_MISMATCH', t('main:scriptInstaller.versionMismatch', { expected: bundle.manifest.version, observed: observedVersion }));
      return;
    }

    // 6. Persist registry
    const entry: FcRegistryEntry = registry.buildFreshEntry({
      autopilotUid: uid,
      vehicleLabel: adapter.getVehicleLabel(),
      scriptVersion: bundle.manifest.version,
      scriptSha256: bundle.manifest.sha256,
      enabledCommands: bundle.manifest.commands.map(c => c.name),
    });
    entry.auditLog.push(auditEntry);
    registry.setEntry(entry);

    emitter({ phase: 'success', installedAt: entry.installedAt });
  } catch (err) {
    if (err instanceof InstallCancelled) {
      emitFatal(emitter, 'CANCELLED', t('main:scriptInstaller.cancelled'));
      return;
    }
    const msg = err instanceof Error ? err.message : t('common:unknownError');
    emitFatal(emitter, 'UNKNOWN', msg);
  }
}

function waitForConsent(state: InternalState): Promise<void> {
  return new Promise((resolve, reject) => {
    state.consentPromise = { resolve, reject };
  });
}
