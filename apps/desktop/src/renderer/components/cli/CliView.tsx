/**
 * CLI View
 *
 * Dedicated sidebar view for CLI terminal access to iNav/Betaflight boards.
 * Provides raw CLI access for power users and legacy F3 board configuration.
 */

import { useState, useEffect } from 'react';
import { useConnectionStore } from '../../stores/connection-store';
import { useCliStore } from '../../stores/cli-store';
import CliTerminal from './CliTerminal';

export default function CliView() {
  const { connectionState } = useConnectionStore();
  const {
    isCliMode,
    hasDumpData,
    fetchDump,
    output,
    clearOutput,
    rebootState,
    rebootMessage,
    rebootError,
    clearRebootState,
    exitCliMode,
  } = useCliStore();
  const [isSaving, setIsSaving] = useState(false);

  // Exit CLI mode when navigating away from this view
  // This prevents the board from staying in CLI mode which breaks MSP commands
  useEffect(() => {
    return () => {
      // Only exit if we're actually in CLI mode and connected
      if (isCliMode && connectionState.isConnected) {
        console.log('[CLI View] Navigating away, exiting CLI mode...');
        exitCliMode().catch((err) => {
          console.error('[CLI View] Failed to exit CLI mode on navigation:', err);
        });
      }
    };
  }, [isCliMode, connectionState.isConnected, exitCliMode]);

  const handleSaveOutput = async () => {
    if (!output) return;
    setIsSaving(true);
    try {
      await window.electronAPI.cliSaveOutput(output);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          {/* Terminal icon */}
          <div className="w-8 h-8 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">CLI Terminal</h1>
            <p className="text-xs text-zinc-500">
              {connectionState.fcVariant && connectionState.fcVersion
                ? `${connectionState.fcVariant} ${connectionState.fcVersion}`
                : 'Raw command-line interface'}
            </p>
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-2">
          {/* Save output to file */}
          <button
            onClick={handleSaveOutput}
            disabled={!output || isSaving}
            className="px-3 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            title="Save terminal output to file"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            {isSaving ? 'Saving...' : 'Save'}
          </button>

          {/* Clear terminal */}
          <button
            onClick={clearOutput}
            disabled={!output}
            className="px-3 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            title="Clear terminal output"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Clear
          </button>

          {/* Load config for autocomplete */}
          {!hasDumpData && isCliMode && (
            <button
              onClick={() => fetchDump()}
              className="px-3 py-1.5 text-xs font-medium text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-lg transition-colors"
              title="Load config for autocomplete"
            >
              Load Config
            </button>
          )}
          {hasDumpData && (
            <span className="px-2 py-1 text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded">
              Autocomplete Active
            </span>
          )}
        </div>
      </div>

      {/* Connection warning */}
      {!connectionState.isConnected && (
        <div className="mx-4 mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-amber-300">Not Connected</p>
              <p className="text-xs text-amber-400/70 mt-0.5">
                Connect to a flight controller to use the CLI terminal.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* MSP protocol info */}
      {connectionState.isConnected && connectionState.protocol === 'msp' && (
        <div className="mx-4 mt-4 p-3 bg-zinc-800/50 border border-zinc-700/50 rounded-lg">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-xs text-zinc-400">
              <p>
                <span className="text-zinc-300 font-medium">CLI Mode</span> - MSP telemetry paused while in CLI.
              </p>
              <p className="mt-1">
                Type <code className="px-1 py-0.5 bg-zinc-900 rounded text-green-400">help</code> for commands,{' '}
                <code className="px-1 py-0.5 bg-zinc-900 rounded text-green-400">dump</code> for full config,{' '}
                <code className="px-1 py-0.5 bg-zinc-900 rounded text-green-400">exit</code> to return to MSP mode.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Terminal */}
      <div className="flex-1 p-4 min-h-0">
        <CliTerminal />
      </div>

      {/* Reboot/Reconnect overlay */}
      {rebootState !== 'idle' && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-8 max-w-md mx-4 shadow-2xl text-center">
            {/* Icon based on state */}
            {rebootState === 'error' ? (
              <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            ) : rebootState === 'done' ? (
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            ) : (
              <div className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center mx-auto mb-4">
                <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {/* Title */}
            <h3 className="text-lg font-semibold text-white mb-2">
              {rebootState === 'saving' && 'Saving Configuration'}
              {rebootState === 'rebooting' && 'Rebooting Board'}
              {rebootState === 'reconnecting' && 'Disconnecting'}
              {rebootState === 'done' && 'Save Complete'}
              {rebootState === 'error' && 'Save Failed'}
            </h3>

            {/* Message */}
            <p className="text-sm text-zinc-400 mb-4">
              {rebootError || rebootMessage}
            </p>

            {/* Progress indicator for non-terminal states */}
            {(rebootState === 'saving' || rebootState === 'rebooting' || rebootState === 'reconnecting') && (
              <div className="flex items-center justify-center gap-2 text-xs text-zinc-500">
                <div className="flex gap-1">
                  <div className={`w-2 h-2 rounded-full ${rebootState === 'saving' ? 'bg-blue-500' : 'bg-zinc-600'}`} />
                  <div className={`w-2 h-2 rounded-full ${rebootState === 'rebooting' ? 'bg-blue-500' : 'bg-zinc-600'}`} />
                  <div className={`w-2 h-2 rounded-full ${rebootState === 'reconnecting' ? 'bg-blue-500' : 'bg-zinc-600'}`} />
                </div>
              </div>
            )}

            {/* Dismiss button for terminal states */}
            {(rebootState === 'done' || rebootState === 'error') && (
              <button
                onClick={clearRebootState}
                className="mt-4 px-6 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg text-sm transition-colors"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
