/**
 * ARM / DISARM button for the AppShell header.
 *
 * Compact pill button that shows armed state. Right-click or chevron
 * opens options (force-arm for MAVLink, arming-blocked reasons).
 *
 * Works with both protocols:
 * - MAVLink (ArduPilot): sends MAV_CMD_COMPONENT_ARM_DISARM directly
 * - MSP (iNav/Betaflight): uses RC simulation via flight-control-store
 */

import { useState, useRef, useEffect, useMemo } from 'react';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { useConnectionStore } from '../../stores/connection-store';
import { useFlightControlStore } from '../../stores/flight-control-store';
import { useMessagesStore } from '../../stores/messages-store';

export function ArmDisarmButton() {
  const flight = useTelemetryStore((s) => s.flight);
  const connectionState = useConnectionStore((s) => s.connectionState);
  const messages = useMessagesStore((s) => s.messages);
  const isConnected = connectionState?.isConnected ?? false;
  const protocol = connectionState?.protocol;

  // MSP flight control store (for iNav/Betaflight RC-based arming)
  const {
    canArm: mspCanArm,
    modeMappingsLoaded,
    arm: mspArm,
    disarm: mspDisarm,
    loadModeRanges,
    isOverrideActive,
    startOverride,
  } = useFlightControlStore();

  const [isLoading, setIsLoading] = useState(false);
  const [forceArm, setForceArm] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMenu]);

  // Load MSP mode ranges when connected
  useEffect(() => {
    if (isConnected && protocol === 'msp' && !modeMappingsLoaded) {
      loadModeRanges();
    }
  }, [isConnected, protocol, modeMappingsLoaded, loadModeRanges]);

  // Auto-start RC override for MSP when connected
  useEffect(() => {
    if (isConnected && protocol === 'msp' && connectionState.fcVariant && !isOverrideActive) {
      startOverride();
    }
  }, [isConnected, protocol, connectionState.fcVariant, isOverrideActive, startOverride]);

  const isArmed = flight.armed;
  const isMavlink = protocol === 'mavlink';
  const isMsp = protocol === 'msp';

  // For MAVLink: extract PreArm reasons from STATUSTEXT messages
  // For MSP: use armingDisabledReasons from telemetry
  const preArmReasons = useMemo(() => {
    if (isArmed || !isConnected) return [];
    if (isMavlink) {
      return messages
        .filter((m) => m.text.includes('PreArm:') || m.text.includes('Arm:'))
        .map((m) => {
          const match = m.text.match(/(?:Pre)?Arm:\s*(.+)/);
          return match ? match[1]!.trim() : m.text;
        })
        .filter((reason, i, arr) => arr.indexOf(reason) === i)
        .slice(0, 8);
    }
    return flight.armingDisabledReasons ?? [];
  }, [isArmed, isConnected, isMavlink, messages, flight.armingDisabledReasons]);

  if (!isConnected) return null;

  const canAttemptArm = isMavlink || (isMsp && mspCanArm);
  const hasBlockedReasons = preArmReasons.length > 0;

  const handleArmDisarm = async () => {
    if (isLoading) return;
    setIsLoading(true);

    try {
      if (isMavlink) {
        await window.electronAPI.mavlinkArmDisarm(!isArmed, !isArmed && forceArm);
      } else if (isMsp) {
        if (isArmed) {
          await mspDisarm();
        } else {
          await mspArm();
        }
      }
    } catch (err) {
      console.error('[ArmDisarm] Failed:', err);
    } finally {
      setTimeout(() => setIsLoading(false), 500);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowMenu(!showMenu);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={handleArmDisarm}
        onContextMenu={handleContextMenu}
        disabled={!canAttemptArm || isLoading}
        className={`
          flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide
          transition-all duration-200 select-none
          ${!canAttemptArm || isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          ${isArmed
            ? 'bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30'
            : forceArm && isMavlink
              ? 'bg-amber-500/20 border border-amber-500/40 text-amber-400 hover:bg-amber-500/30'
              : 'bg-gray-800/60 border border-gray-600/40 text-gray-400 hover:bg-gray-700/60 hover:text-gray-200'
          }
        `}
        title={`${isArmed ? 'Disarm' : forceArm && isMavlink ? 'Force arm (bypasses checks)' : 'Arm'} - Right-click for options`}
      >
        {/* Pulsing dot for armed state */}
        <div className={`w-1.5 h-1.5 rounded-full ${
          isArmed ? 'bg-red-400 animate-pulse' : 'bg-gray-500'
        }`} />

        {isLoading ? (
          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <span>{isArmed ? 'DISARM' : forceArm && isMavlink ? 'FORCE ARM' : 'ARM'}</span>
        )}

        {/* Chevron */}
        <svg
          className={`w-2.5 h-2.5 ml-0.5 opacity-50 transition-transform ${showMenu ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}
          onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Context menu */}
      {showMenu && (
        <div className="absolute right-0 top-full mt-1.5 w-60 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
          {/* Force ARM toggle (MAVLink only) */}
          {isMavlink && (
            <label className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-700/50 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={forceArm}
                onChange={(e) => setForceArm(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-gray-600 bg-gray-700 text-amber-500 focus:ring-amber-500/50 focus:ring-offset-0"
              />
              <div>
                <div className="text-xs text-gray-200 font-medium">Force ARM</div>
                <div className="text-[10px] text-gray-500">Bypass pre-arm safety checks</div>
              </div>
            </label>
          )}

          {isMsp && !mspCanArm && modeMappingsLoaded && (
            <div className="px-3 py-2.5 text-[10px] text-gray-500">
              ARM mode not configured on FC. Set an AUX channel for ARM in the Modes tab.
            </div>
          )}

          {/* Arming blocked reasons */}
          {hasBlockedReasons && (
            <div className={`px-3 py-2.5 ${isMavlink ? 'border-t border-gray-700/50' : ''}`}>
              <div className="text-[10px] font-medium text-red-400 uppercase tracking-wider mb-1">
                {isMavlink ? 'Pre-arm Checks Failed' : 'Arming Blocked'}
              </div>
              <div className="flex flex-col gap-0.5">
                {preArmReasons.map((reason, i) => (
                  <span key={i} className="px-1.5 py-0.5 bg-red-500/15 rounded text-red-300 text-[10px]">
                    {reason}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Protocol info */}
          <div className="px-3 py-2 border-t border-gray-700/50 text-[10px] text-gray-500">
            {isMavlink ? 'MAVLink' : `MSP (${connectionState.fcVariant || 'Unknown'})`}
          </div>
        </div>
      )}
    </div>
  );
}
