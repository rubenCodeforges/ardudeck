/**
 * Mode-request state machine for the Flight Control annunciator.
 *
 * A MAVLink mode change is an order with latency: we send it, and the vehicle's
 * next HEARTBEAT (its `custom_mode`) is the only proof it actually engaged. So
 * we never paint a mode as active on the click. Instead we drive four states,
 * borrowed from cockpit Flight-Mode Annunciators (armed vs engaged):
 *
 *   active      - annunciator shows the vehicle's real current mode (truth).
 *   requesting  - we sent a mode; awaiting the confirming heartbeat. A watchdog
 *                 times it out. Committing modes wait behind a confirm first.
 *   rejected    - watchdog expired (or the send failed): revert to the real
 *                 mode and say why. Never leaves the pilot on a stale "pending".
 *
 * `justConfirmed` briefly flags the moment a request becomes real, so the UI can
 * flash the transition (the FMA "box the newly-captured mode" idea).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ArduPilotVehicleClass } from '../../shared/telemetry-types';
import { modeMetaFor } from '../../shared/flight-mode-meta';

export type ModePhase = 'active' | 'requesting' | 'rejected';

const MODE_WATCHDOG_MS = 3000; // a few missed heartbeats on a healthy link
const REJECT_LINGER_MS = 2800; // how long the red "rejected" state shows before reverting
const CONFIRM_FLASH_MS = 2000; // transient highlight on the confirming heartbeat
const RECENTS_MAX = 5;

function recentsKey(vehicleClass: ArduPilotVehicleClass): string {
  return `ardudeck.modeRecents.${vehicleClass}`;
}

function loadRecents(vehicleClass: ArduPilotVehicleClass): number[] {
  try {
    const raw = localStorage.getItem(recentsKey(vehicleClass));
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.filter((n) => typeof n === 'number').slice(0, RECENTS_MAX);
    }
  } catch {
    /* ignore */
  }
  return [];
}

function saveRecents(vehicleClass: ArduPilotVehicleClass, next: number[]): number[] {
  try {
    localStorage.setItem(recentsKey(vehicleClass), JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export interface ModeRequestState {
  phase: ModePhase;
  requestedMode: number | null;
  rejectLabel: string;
  /** A committing mode awaiting the user's explicit confirm (not yet sent). */
  pendingCommit: number | null;
  justConfirmed: boolean;
  recents: number[];
  /** Request a mode. Committing modes pop a confirm first unless `skipConfirm`
   *  (used by explicit actions like the mission Start/Pause buttons). */
  requestMode: (modeNum: number, opts?: { skipConfirm?: boolean }) => void;
  confirmCommit: () => void;
  cancelCommit: () => void;
}

export function useModeRequest(
  vehicleClass: ArduPilotVehicleClass,
  currentModeNum: number | undefined,
  sendMode: (modeNum: number) => Promise<boolean>,
): ModeRequestState {
  const [phase, setPhase] = useState<ModePhase>('active');
  const [requestedMode, setRequestedMode] = useState<number | null>(null);
  const [rejectLabel, setRejectLabel] = useState('Rejected');
  const [pendingCommit, setPendingCommit] = useState<number | null>(null);
  const [justConfirmed, setJustConfirmed] = useState(false);
  const [recents, setRecents] = useState<number[]>(() => loadRecents(vehicleClass));

  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rejectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-seed recents when the vehicle class changes (different mode numbering).
  useEffect(() => { setRecents(loadRecents(vehicleClass)); }, [vehicleClass]);

  const clearWatchdog = useCallback(() => {
    if (watchdog.current) { clearTimeout(watchdog.current); watchdog.current = null; }
  }, []);

  const enterRejected = useCallback((label: string) => {
    clearWatchdog();
    setPhase('rejected');
    setRejectLabel(label);
    setRequestedMode(null);
    if (rejectTimer.current) clearTimeout(rejectTimer.current);
    rejectTimer.current = setTimeout(() => setPhase('active'), REJECT_LINGER_MS);
  }, [clearWatchdog]);

  const send = useCallback(async (modeNum: number) => {
    clearWatchdog();
    if (rejectTimer.current) { clearTimeout(rejectTimer.current); rejectTimer.current = null; }
    setPendingCommit(null);
    setRequestedMode(modeNum);
    setPhase('requesting');
    watchdog.current = setTimeout(() => enterRejected('No response'), MODE_WATCHDOG_MS);
    let ok = false;
    try {
      ok = await sendMode(modeNum);
    } catch {
      ok = false;
    }
    if (!ok) enterRejected('Not sent');
  }, [clearWatchdog, enterRejected, sendMode]);

  const requestMode = useCallback((modeNum: number, opts?: { skipConfirm?: boolean }) => {
    const meta = modeMetaFor(vehicleClass, modeNum);
    if (meta?.commit && !opts?.skipConfirm) { setPendingCommit(modeNum); return; }
    void send(modeNum);
  }, [vehicleClass, send]);

  const confirmCommit = useCallback(() => {
    if (pendingCommit != null) void send(pendingCommit);
  }, [pendingCommit, send]);

  const cancelCommit = useCallback(() => setPendingCommit(null), []);

  // Confirm: the vehicle's heartbeat now reports the requested mode.
  useEffect(() => {
    if (phase !== 'requesting' || requestedMode == null) return;
    if (currentModeNum !== requestedMode) return;
    clearWatchdog();
    setPhase('active');
    const confirmed = requestedMode;
    setRequestedMode(null);
    setRecents((r) => saveRecents(vehicleClass, [confirmed, ...r.filter((x) => x !== confirmed)].slice(0, RECENTS_MAX)));
    setJustConfirmed(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setJustConfirmed(false), CONFIRM_FLASH_MS);
  }, [phase, requestedMode, currentModeNum, vehicleClass, clearWatchdog]);

  useEffect(() => () => {
    if (watchdog.current) clearTimeout(watchdog.current);
    if (rejectTimer.current) clearTimeout(rejectTimer.current);
    if (flashTimer.current) clearTimeout(flashTimer.current);
  }, []);

  return { phase, requestedMode, rejectLabel, pendingCommit, justConfirmed, recents, requestMode, confirmCommit, cancelCommit };
}
