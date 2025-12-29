import type { ReactNode } from 'react';
import { useConnectionStore } from '../../stores/connection-store';
import { DebugConsole } from '../debug/DebugConsole';
import iconImage from '../../assets/icon.png';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { connectionState } = useConnectionStore();

  return (
    <div className="h-screen flex flex-col bg-[#0a0a0f]">
      {/* Header */}
      <header className="h-14 border-b border-gray-800/50 bg-gray-900/50 backdrop-blur-sm flex items-center px-6 shrink-0">
        <div className="flex items-center gap-3">
          {/* Logo */}
          <img src={iconImage} alt="ArduDeck" className="h-8 rounded-md" />
          <h1 className="text-lg font-semibold text-white">ArduDeck</h1>
        </div>

        <div className="ml-auto flex items-center gap-6">
          {/* Stats */}
          {connectionState.isConnected && (
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2 text-gray-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
                <span>RX: <span className="text-gray-200">{connectionState.packetsReceived}</span></span>
              </div>
              <div className="flex items-center gap-2 text-gray-400">
                <span>TX: <span className="text-gray-200">{connectionState.packetsSent}</span></span>
              </div>
            </div>
          )}

          {/* Connection status */}
          <div className={`flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-gray-800/50 border ${
            connectionState.isConnected
              ? 'border-emerald-500/30'
              : connectionState.isWaitingForHeartbeat
              ? 'border-yellow-500/30'
              : 'border-gray-700/50'
          }`}>
            {connectionState.isWaitingForHeartbeat ? (
              <svg className="w-2.5 h-2.5 text-yellow-400 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <div
                className={`status-dot ${
                  connectionState.isConnected ? 'status-dot-connected' : 'status-dot-disconnected'
                }`}
              />
            )}
            <span className="text-sm font-medium text-gray-300">
              {connectionState.isConnected
                ? connectionState.transport
                : connectionState.isWaitingForHeartbeat
                ? 'Waiting...'
                : 'Disconnected'}
            </span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 overflow-hidden">{children}</div>

      {/* Debug console */}
      <DebugConsole />
    </div>
  );
}
