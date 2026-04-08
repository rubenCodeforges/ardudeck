import { useState, useEffect, useRef } from 'react';
import { useConnectionStore } from '../../stores/connection-store';
import { useSettingsStore, type DefaultSitlType } from '../../stores/settings-store';
import { useSitlStore } from '../../stores/sitl-store';
import { useArduPilotSitlStore } from '../../stores/ardupilot-sitl-store';
import { useSigningStore, initSigningListener } from '../../stores/signing-store';
import type { SerialPortInfo } from '@ardudeck/comms';
import { formatPortDisplayName } from '../../utils/usb-device-names';
import { DriverAssistant } from './DriverAssistant';
import { MessagesPanel } from '../panels/MessagesPanel';

const BAUD_RATES = [1500000, 921600, 460800, 230400, 115200, 57600, 38400, 19200, 9600];

export function ConnectionPanel() {
  const { connectionState, isConnecting, error, connect, disconnect, setError } = useConnectionStore();
  const { connectionMemory, updateConnectionMemory } = useSettingsStore();
  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const [selectedPort, setSelectedPort] = useState('');
  const [baudRate, setBaudRate] = useState(115200);
  const [connectionType, setConnectionType] = useState<'serial' | 'tcp' | 'udp'>('serial');
  const [tcpHost, setTcpHost] = useState('127.0.0.1');
  const [tcpPort, setTcpPort] = useState(5760);
  const [udpPort, setUdpPort] = useState(14550);
  const [udpMode, setUdpMode] = useState<'listen' | 'client'>('listen');
  const [udpRemoteHost, setUdpRemoteHost] = useState('192.168.1.1');
  const [udpRemotePort, setUdpRemotePort] = useState(14550);
  const [tcpProtocol, setTcpProtocol] = useState<'mavlink' | 'msp'>('mavlink');
  const [udpProtocol, setUdpProtocol] = useState<'mavlink' | 'msp'>('mavlink');
  const [showDriverHelp, setShowDriverHelp] = useState(false);
  const [showSigning, setShowSigning] = useState(false);
  const [showSigningPassphrase, setShowSigningPassphrase] = useState(false);
  const [signingInputHasValue, setSigningInputHasValue] = useState(false);
  const signingInputRef = useRef<HTMLInputElement>(null);
  const hasAppliedMemory = useRef(false);
  const { hasKey, keyBase64, keyMismatch, savedKeys, loading: signingLoading, setKey: signingSetKey } = useSigningStore();

  // Apply connection memory on mount
  useEffect(() => {
    if (connectionMemory && !hasAppliedMemory.current) {
      if (connectionMemory.lastConnectionType) {
        setConnectionType(connectionMemory.lastConnectionType);
      }
      if (connectionMemory.lastBaudRate) {
        setBaudRate(connectionMemory.lastBaudRate);
      }
      if (connectionMemory.lastTcpHost) {
        setTcpHost(connectionMemory.lastTcpHost);
      }
      if (connectionMemory.lastTcpPort) {
        setTcpPort(connectionMemory.lastTcpPort);
      }
      if (connectionMemory.lastUdpPort) {
        setUdpPort(connectionMemory.lastUdpPort);
      }
      if (connectionMemory.lastUdpMode) {
        setUdpMode(connectionMemory.lastUdpMode);
      }
      if (connectionMemory.lastUdpRemoteHost) {
        setUdpRemoteHost(connectionMemory.lastUdpRemoteHost);
      }
      if (connectionMemory.lastUdpRemotePort) {
        setUdpRemotePort(connectionMemory.lastUdpRemotePort);
      }
      if (connectionMemory.lastTcpProtocol) {
        setTcpProtocol(connectionMemory.lastTcpProtocol);
      }
      if (connectionMemory.lastUdpProtocol) {
        setUdpProtocol(connectionMemory.lastUdpProtocol);
      }
      hasAppliedMemory.current = true;
    }
  }, [connectionMemory]);

  // Get SITL switch flag and default SITL type
  const { pendingSitlSwitch, setPendingSitlSwitch, defaultSitlType, setDefaultSitlType } = useSettingsStore();

  // iNav SITL state
  const {
    isRunning: inavIsRunning,
    isStarting: inavIsStarting,
    startSitl: startInavSitl,
    checkStatus: checkInavStatus,
    initListeners: initInavListeners
  } = useSitlStore();

  // ArduPilot SITL state
  const {
    isRunning: ardupilotIsRunning,
    isStarting: ardupilotIsStarting,
    start: startArdupilotSitl,
    checkStatus: checkArdupilotStatus,
    initListeners: initArdupilotListeners,
    vehicleType: ardupilotVehicleType,
    binaryInfo: ardupilotBinaryInfo,
    checkBinary: checkArdupilotBinary,
    usesDocker: ardupilotUsesDocker,
    download: downloadArdupilotBinary,
    isDownloading: ardupilotIsDownloading,
    downloadProgress: ardupilotDownloadProgress,
  } = useArduPilotSitlStore();

  // Combined SITL state
  const anySitlRunning = inavIsRunning || ardupilotIsRunning;
  const anySitlStarting = inavIsStarting || ardupilotIsStarting;

  // ArduPilot status - needs download?
  const ardupilotNeedsDownload = defaultSitlType === 'ardupilot' && !ardupilotBinaryInfo?.exists;

  // Initialize SITL listeners and check status on mount
  useEffect(() => {
    checkInavStatus();
    checkArdupilotStatus();
    const cleanupInav = initInavListeners();
    const cleanupArdupilot = initArdupilotListeners();
    const cleanupSigning = initSigningListener();
    return () => {
      cleanupInav();
      cleanupArdupilot();
      cleanupSigning();
    };
  }, [checkInavStatus, checkArdupilotStatus, initInavListeners, initArdupilotListeners]);

  // Check ArduPilot binary when default type or vehicle type changes
  useEffect(() => {
    if (defaultSitlType === 'ardupilot') {
      checkArdupilotBinary();
    }
  }, [defaultSitlType, ardupilotVehicleType, checkArdupilotBinary]);

  // Handle SITL quick-start based on default type
  const handleSitlQuickStart = async () => {
    // For ArduPilot, download binary if needed then start
    if (defaultSitlType === 'ardupilot' && !ardupilotBinaryInfo?.exists) {
      setError(null);
      const downloaded = await downloadArdupilotBinary();
      if (!downloaded) {
        const detail = useArduPilotSitlStore.getState().lastError;
        setError(
          detail
            ? `Failed to download ArduPilot ${ardupilotVehicleType} binary: ${detail}`
            : `Failed to download ArduPilot ${ardupilotVehicleType} binary.`
        );
        return;
      }
    }

    let success = false;

    if (defaultSitlType === 'ardupilot') {
      success = await startArdupilotSitl();
    } else {
      success = await startInavSitl();
    }

    if (success) {
      // Trigger the existing auto-connect mechanism
      setPendingSitlSwitch(true);
    }
  };

  // Handle connecting to already-running SITL
  const handleSitlConnect = async () => {
    setError(null);
    try {
      // Determine protocol based on which SITL is running
      const protocol = ardupilotIsRunning ? 'mavlink' : 'msp';
      const success = await connect({ type: 'tcp', host: '127.0.0.1', tcpPort: 5760, protocol });
      if (success) {
        updateConnectionMemory({
          lastTcpHost: '127.0.0.1',
          lastTcpPort: 5760,
          lastConnectionType: 'tcp',
        });
      } else {
        setError('Could not connect to SITL. Make sure it is running on TCP port 5760.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to SITL');
    }
  };

  // Respond to SITL starting - switch to TCP and auto-connect with retry
  useEffect(() => {
    if (pendingSitlSwitch && !connectionState.isConnected) {
      setConnectionType('tcp');
      setTcpHost('127.0.0.1');
      setTcpPort(5760);
      // Clear the flag
      setPendingSitlSwitch(false);

      // Auto-connect with retry - SITL may take a moment to start TCP server
      const autoConnectWithRetry = async () => {
        const maxRetries = 10;
        const retryDelayMs = 1000;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          console.log(`[ConnectionPanel] SITL auto-connect attempt ${attempt}/${maxRetries}...`);

          // Wait before trying (SITL needs time to start TCP server)
          await new Promise(r => setTimeout(r, retryDelayMs));

          // Check if we're already connected (user may have connected manually)
          if (useConnectionStore.getState().connectionState.isConnected) {
            console.log('[ConnectionPanel] Already connected, stopping auto-connect');
            return;
          }

          // Check if SITL is still running - if it crashed/failed, stop retrying
          const inavStillRunning = useSitlStore.getState().isRunning;
          const ardupilotStillRunning = useArduPilotSitlStore.getState().isRunning;
          if (!inavStillRunning && !ardupilotStillRunning) {
            console.warn('[ConnectionPanel] SITL process is no longer running, aborting auto-connect');
            setError('SITL process failed to start. Check the SITL tab for details.');
            return;
          }

          const success = await connect({ type: 'tcp', host: '127.0.0.1', tcpPort: 5760 });
          if (success) {
            console.log('[ConnectionPanel] SITL auto-connect successful!');
            updateConnectionMemory({
              lastTcpHost: '127.0.0.1',
              lastTcpPort: 5760,
              lastConnectionType: 'tcp',
            });
            return;
          }

          console.log(`[ConnectionPanel] SITL auto-connect attempt ${attempt} failed, retrying...`);
        }

        console.warn('[ConnectionPanel] SITL auto-connect failed after all retries');
        setError('Could not connect to SITL. Try connecting manually.');
      };

      autoConnectWithRetry();
    }
  }, [pendingSitlSwitch, connectionState.isConnected, setPendingSitlSwitch, connect, updateConnectionMemory, setError]);

  useEffect(() => {
    if (window.electronAPI) {
      refreshPorts();

      // Start port watching for new devices (only when not connected)
      if (!connectionState.isConnected) {
        window.electronAPI.startPortWatch();
      }

      // Listen for new port events
      const unsubscribePortChange = window.electronAPI.onPortChange((event) => {
        console.log('[ConnectionPanel] Port change detected:', event);
        refreshPorts().then(() => {
          // If a new port matches our last used port, auto-select it
          if (event.newPorts.length > 0 && connectionMemory?.lastSerialPort) {
            const rememberedPort = event.newPorts.find(p => p.path === connectionMemory.lastSerialPort);
            if (rememberedPort) {
              console.log('[ConnectionPanel] Auto-selecting remembered port:', rememberedPort.path);
              setSelectedPort(rememberedPort.path);
            }
          }
        });
      });

      // Listen for connection errors from main process
      const unsubscribeError = window.electronAPI.onConnectionError((errorMsg) => {
        setError(errorMsg);
      });

      return () => {
        unsubscribePortChange();
        unsubscribeError();
        window.electronAPI.stopPortWatch();
      };
    }
  }, [setError, connectionMemory?.lastSerialPort, connectionState.isConnected]);

  // Restart port watching when disconnected
  useEffect(() => {
    if (!connectionState.isConnected && window.electronAPI) {
      // Small delay to ensure disconnect is complete
      const timer = setTimeout(() => {
        window.electronAPI.startPortWatch();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [connectionState.isConnected]);

  const refreshPorts = async () => {
    const portList = await window.electronAPI.listPorts();
    setPorts(portList);

    // Try to select the remembered port, fall back to first available
    if (portList.length > 0 && !selectedPort) {
      const rememberedPort = connectionMemory?.lastSerialPort;
      const portToSelect = portList.find(p => p.path === rememberedPort) || portList[0];
      setSelectedPort(portToSelect?.path ?? '');
    }
  };

  const handleConnect = async () => {
    let success = false;

    if (connectionType === 'serial') {
      success = await connect({ type: 'serial', port: selectedPort, baudRate });
      if (success) {
        updateConnectionMemory({
          lastSerialPort: selectedPort,
          lastBaudRate: baudRate,
          lastConnectionType: 'serial',
        });
      }
    } else if (connectionType === 'tcp') {
      success = await connect({
        type: 'tcp',
        host: tcpHost,
        tcpPort,
        protocol: tcpProtocol,
      });
      if (success) {
        updateConnectionMemory({
          lastTcpHost: tcpHost,
          lastTcpPort: tcpPort,
          lastTcpProtocol: tcpProtocol,
          lastConnectionType: 'tcp',
        });
      }
    } else {
      success = await connect({
        type: 'udp',
        udpPort,
        udpMode,
        udpRemoteHost: udpMode === 'client' ? udpRemoteHost : undefined,
        udpRemotePort: udpMode === 'client' ? udpRemotePort : undefined,
        protocol: udpProtocol,
      });
      if (success) {
        updateConnectionMemory({
          lastUdpPort: udpPort,
          lastUdpMode: udpMode,
          lastUdpRemoteHost: udpRemoteHost,
          lastUdpRemotePort: udpRemotePort,
          lastUdpProtocol: udpProtocol,
          lastConnectionType: 'udp',
        });
      }
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-800/50">
        <h2 className="text-base font-semibold text-white flex items-center gap-2">
          <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
          </svg>
          Connection
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* SITL Quick Start - only show when not connected */}
        {!connectionState.isConnected && !connectionState.isWaitingForHeartbeat && (
          <div className="space-y-0">
            <button
              onClick={anySitlRunning ? handleSitlConnect : handleSitlQuickStart}
              disabled={anySitlStarting || isConnecting || ardupilotIsDownloading}
              className={`w-full rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden ${
                ardupilotNeedsDownload
                  ? 'bg-amber-600/10 hover:bg-amber-600/15 border border-amber-500/30 hover:border-amber-500/50'
                  : defaultSitlType === 'ardupilot'
                  ? 'bg-blue-600/10 hover:bg-blue-600/15 border border-blue-500/30 hover:border-blue-500/50'
                  : 'bg-purple-600/10 hover:bg-purple-600/15 border border-purple-500/30 hover:border-purple-500/50'
              }`}
            >
              {/* Header row */}
              <div className="flex items-center gap-3 px-4 pt-3.5 pb-2">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                  ardupilotNeedsDownload
                    ? 'bg-amber-600/20'
                    : defaultSitlType === 'ardupilot'
                    ? 'bg-blue-600/20'
                    : 'bg-purple-600/20'
                }`}>
                  <svg className={`w-[18px] h-[18px] ${
                    ardupilotNeedsDownload
                      ? 'text-amber-400'
                      : defaultSitlType === 'ardupilot'
                      ? 'text-blue-400'
                      : 'text-purple-400'
                  }`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div className="text-[13px] font-medium text-white">SITL Simulator</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    {ardupilotIsDownloading ? `Downloading${ardupilotDownloadProgress ? ` ${ardupilotDownloadProgress.progress}%` : '...'}`
                      : anySitlStarting ? 'Starting...'
                      : inavIsRunning ? 'iNav running on TCP :5760'
                      : ardupilotIsRunning ? `ArduPilot ${ardupilotVehicleType} running on TCP :5760`
                      : ardupilotNeedsDownload ? 'Click to download and launch'
                      : 'Launch virtual flight controller'}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {anySitlRunning && (
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  )}
                  {anySitlStarting || ardupilotIsDownloading ? (
                    <svg className={`w-5 h-5 animate-spin ${defaultSitlType === 'ardupilot' ? 'text-blue-400' : 'text-purple-400'}`} fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : ardupilotNeedsDownload ? (
                    <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  ) : (
                    <svg className={`w-4 h-4 ${defaultSitlType === 'ardupilot' ? 'text-blue-400' : 'text-purple-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                </div>
              </div>
              {/* Tags row */}
              <div className="flex items-center gap-1.5 px-4 pb-3">
                <span className={`px-2 py-0.5 text-[10px] font-medium rounded-md ${
                  defaultSitlType === 'ardupilot'
                    ? 'bg-blue-500/15 text-blue-400'
                    : 'bg-purple-500/15 text-purple-400'
                }`}>
                  {defaultSitlType === 'ardupilot'
                    ? `ArduPilot ${ardupilotVehicleType.charAt(0).toUpperCase() + ardupilotVehicleType.slice(1)}`
                    : 'iNav'}
                </span>
                {ardupilotNeedsDownload && (
                  <span className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-amber-500/15 text-amber-400">
                    Download needed
                  </span>
                )}
                {ardupilotUsesDocker && defaultSitlType === 'ardupilot' && !ardupilotNeedsDownload && (
                  <span className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-blue-500/15 text-blue-400">
                    Docker
                  </span>
                )}
              </div>
              {/* Download progress bar */}
              {ardupilotIsDownloading && ardupilotDownloadProgress && (
                <div className="px-4 pb-3">
                  <div className="h-1 rounded-full bg-gray-700/50 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-blue-500 transition-all duration-300"
                      style={{ width: `${ardupilotDownloadProgress.progress}%` }}
                    />
                  </div>
                </div>
              )}
            </button>
            {/* SITL Type Selector - show when not running */}
            {!anySitlRunning && !anySitlStarting && !ardupilotIsDownloading && (
              <div className="flex items-center justify-center gap-1.5 pt-2">
                <button
                  onClick={() => setDefaultSitlType('inav')}
                  className={`px-2.5 py-1 text-[10px] rounded-md transition-colors ${
                    defaultSitlType === 'inav'
                      ? 'bg-purple-500/20 text-purple-300 font-medium'
                      : 'text-gray-500 hover:text-gray-400 hover:bg-gray-700/30'
                  }`}
                >
                  iNav
                </button>
                <button
                  onClick={() => setDefaultSitlType('ardupilot')}
                  className={`px-2.5 py-1 text-[10px] rounded-md transition-colors ${
                    defaultSitlType === 'ardupilot'
                      ? 'bg-blue-500/20 text-blue-300 font-medium'
                      : 'text-gray-500 hover:text-gray-400 hover:bg-gray-700/30'
                  }`}
                >
                  ArduPilot
                </button>
              </div>
            )}
          </div>
        )}

        {/* Connection type tabs */}
        <div className="tab-group">
          {(['serial', 'tcp', 'udp'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setConnectionType(type)}
              className={`tab ${connectionType === type ? 'tab-active' : ''}`}
            >
              {type.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Recent connections - show for TCP/UDP when not connected */}
        {!connectionState.isConnected && (connectionType === 'tcp' || connectionType === 'udp') && (() => {
          const filtered = (connectionMemory.recentConnections ?? []).filter(c => c.type === connectionType);
          if (filtered.length === 0) return null;
          // Build current label to match against recents
          const currentLabel = connectionType === 'tcp'
            ? `${tcpHost}:${tcpPort} (${tcpProtocol.toUpperCase()})`
            : udpMode === 'client'
              ? `${udpRemoteHost}:${udpRemotePort} (UDP ${udpProtocol.toUpperCase()})`
              : `UDP :${udpPort} listen (${udpProtocol.toUpperCase()})`;
          const selectedRecent = filtered.find(c => c.label === currentLabel)?.label ?? '';
          return (
            <div>
              <select
                value={selectedRecent}
                onChange={(e) => {
                  const c = filtered.find(r => r.label === e.target.value);
                  if (!c) return;
                  if (c.type === 'tcp') {
                    setTcpHost(c.host ?? '127.0.0.1');
                    setTcpPort(c.port);
                    setTcpProtocol(c.protocol);
                  } else {
                    setUdpProtocol(c.protocol);
                    if (c.udpMode === 'client') {
                      setUdpMode('client');
                      setUdpRemoteHost(c.udpRemoteHost ?? '192.168.1.1');
                      setUdpRemotePort(c.udpRemotePort ?? 14550);
                    } else {
                      setUdpMode('listen');
                      setUdpPort(c.port);
                    }
                  }
                }}
                className="select text-xs"
              >
                <option value="" disabled>Recent connections...</option>
                {filtered.map((c) => (
                  <option key={c.label} value={c.label}>{c.label}</option>
                ))}
              </select>
            </div>
          );
        })()}

        {/* Serial settings */}
        {connectionType === 'serial' && (
          <div className="space-y-4">
            <div>
              <label className="label">Port</label>
              <div className="flex gap-2">
                <select
                  value={selectedPort}
                  onChange={(e) => setSelectedPort(e.target.value)}
                  className="select flex-1"
                  disabled={connectionState.isConnected}
                >
                  {ports.length === 0 && <option value="">No ports available</option>}
                  {ports.map((port) => (
                    <option key={port.path} value={port.path}>
                      {formatPortDisplayName(port)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="label">Baud Rate</label>
              <select
                value={baudRate}
                onChange={(e) => setBaudRate(Number(e.target.value))}
                className="select"
                disabled={connectionState.isConnected}
              >
                {BAUD_RATES.map((rate) => (
                  <option key={rate} value={rate}>{rate}</option>
                ))}
              </select>
            </div>

          </div>
        )}

        {/* TCP settings */}
        {connectionType === 'tcp' && (
          <div className="space-y-4">
            <div>
              <label className="label">Host</label>
              <input
                type="text"
                value={tcpHost}
                onChange={(e) => setTcpHost(e.target.value)}
                className="input"
                placeholder="127.0.0.1"
                disabled={connectionState.isConnected}
              />
            </div>
            <div>
              <label className="label">Port</label>
              <input
                type="number"
                value={tcpPort}
                onChange={(e) => setTcpPort(Number(e.target.value))}
                className="input"
                disabled={connectionState.isConnected}
              />
            </div>
            <div>
              <label className="label">Protocol</label>
              <div className="flex rounded-lg overflow-hidden border border-gray-700/50">
                {(['mavlink', 'msp'] as const).map((proto) => (
                  <button
                    key={proto}
                    onClick={() => setTcpProtocol(proto)}
                    disabled={connectionState.isConnected}
                    className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                      tcpProtocol === proto
                        ? 'bg-blue-600/30 text-blue-300'
                        : 'text-gray-400 hover:text-gray-300 hover:bg-gray-700/30'
                    } ${proto === 'mavlink' ? 'border-r border-gray-700/50' : ''}`}
                  >
                    {proto === 'mavlink' ? 'MAVLink' : 'MSP'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* UDP settings */}
        {connectionType === 'udp' && (
          <div className="space-y-4">
            {/* UDP mode toggle */}
            <div className="flex rounded-lg overflow-hidden border border-gray-700/50">
              <button
                onClick={() => setUdpMode('listen')}
                disabled={connectionState.isConnected}
                className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                  udpMode === 'listen'
                    ? 'bg-blue-600/30 text-blue-300 border-r border-blue-500/30'
                    : 'text-gray-400 hover:text-gray-300 hover:bg-gray-700/30 border-r border-gray-700/50'
                }`}
              >
                Listen (Server)
              </button>
              <button
                onClick={() => setUdpMode('client')}
                disabled={connectionState.isConnected}
                className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                  udpMode === 'client'
                    ? 'bg-blue-600/30 text-blue-300'
                    : 'text-gray-400 hover:text-gray-300 hover:bg-gray-700/30'
                }`}
              >
                Client (Connect)
              </button>
            </div>

            {udpMode === 'listen' ? (
              <>
                <div>
                  <label className="label">Local Port</label>
                  <input
                    type="number"
                    value={udpPort}
                    onChange={(e) => setUdpPort(Number(e.target.value))}
                    className="input"
                    disabled={connectionState.isConnected}
                  />
                </div>
                <p className="text-xs text-gray-500">
                  Listen for incoming packets on this port
                </p>
              </>
            ) : (
              <>
                <div>
                  <label className="label">Remote Host</label>
                  <input
                    type="text"
                    value={udpRemoteHost}
                    onChange={(e) => setUdpRemoteHost(e.target.value)}
                    className="input"
                    placeholder="192.168.1.1"
                    disabled={connectionState.isConnected}
                  />
                </div>
                <div>
                  <label className="label">Remote Port</label>
                  <input
                    type="number"
                    value={udpRemotePort}
                    onChange={(e) => setUdpRemotePort(Number(e.target.value))}
                    className="input"
                    disabled={connectionState.isConnected}
                  />
                </div>
                <p className="text-xs text-gray-500">
                  Connect to a remote device at this address
                </p>
              </>
            )}

            <div>
              <label className="label">Protocol</label>
              <div className="flex rounded-lg overflow-hidden border border-gray-700/50">
                {(['mavlink', 'msp'] as const).map((proto) => (
                  <button
                    key={proto}
                    onClick={() => setUdpProtocol(proto)}
                    disabled={connectionState.isConnected}
                    className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                      udpProtocol === proto
                        ? 'bg-blue-600/30 text-blue-300'
                        : 'text-gray-400 hover:text-gray-300 hover:bg-gray-700/30'
                    } ${proto === 'mavlink' ? 'border-r border-gray-700/50' : ''}`}
                  >
                    {proto === 'mavlink' ? 'MAVLink' : 'MSP'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* MAVLink Signing - show for TCP/UDP MAVLink connections */}
        {!connectionState.isConnected && (
          (connectionType === 'tcp' && tcpProtocol === 'mavlink') ||
          (connectionType === 'udp' && udpProtocol === 'mavlink')
        ) && (
          <div className="rounded-xl border border-gray-700/30 overflow-hidden">
            <button
              onClick={() => setShowSigning(!showSigning)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-800/30 transition-colors"
            >
              <svg className={`w-4 h-4 ${savedKeys.length > 0 ? 'text-amber-400' : 'text-gray-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
              </svg>
              <span className="text-xs font-medium text-gray-300 flex-1 text-left">MAVLink Signing</span>
              {savedKeys.length > 0 && (
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${keyMismatch ? 'text-red-400 bg-red-400/10' : 'text-emerald-400 bg-emerald-400/10'}`}>
                  {keyMismatch ? 'Mismatch' : `${savedKeys.length} key${savedKeys.length > 1 ? 's' : ''}`}
                </span>
              )}
              <svg className={`w-3.5 h-3.5 text-gray-500 transition-transform ${showSigning ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showSigning && (
              <div className="px-3 pb-3 space-y-2.5 border-t border-gray-700/20 pt-2.5">
                <p className="text-[11px] text-gray-500">
                  Accepts passphrases, base64 keys (from Mission Planner), or hex keys. All keys are tried automatically on connect.
                </p>

                {/* Saved keys list */}
                {savedKeys.length > 0 && (
                  <div className="space-y-1">
                    {savedKeys.map((k) => {
                      // Convert hex fingerprint to base64 prefix for consistent display with Safety tab
                      let displayKey = k.fingerprint + '...';
                      try {
                        const bytes = k.fingerprint.match(/.{2}/g)?.map(h => parseInt(h, 16)) ?? [];
                        displayKey = btoa(String.fromCharCode(...bytes)).slice(0, 8) + '...';
                      } catch { /* fallback to hex */ }
                      const isActive = keyBase64?.startsWith(displayKey.slice(0, 4));
                      return (
                        <div key={k.fingerprint} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gray-800/40">
                          <svg className={`w-3 h-3 shrink-0 ${isActive ? 'text-emerald-400' : 'text-gray-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                          </svg>
                          <code className="text-[10px] font-mono text-gray-400 flex-1 truncate">{displayKey}</code>
                          {k.systemIds.length > 0 && (
                            <span className="text-[9px] text-gray-600" title={`Matched FC sysid: ${k.systemIds.join(', ')}`}>
                              sysid {k.systemIds.join(',')}
                            </span>
                          )}
                          {isActive && (
                            <span className="text-[9px] text-emerald-500">active</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Add new key - uncontrolled input to prevent autofill hijacking */}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      ref={signingInputRef}
                      type={showSigningPassphrase ? 'text' : 'password'}
                      onChange={() => setSigningInputHasValue(!!(signingInputRef.current?.value?.trim()))}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter') {
                          const val = signingInputRef.current?.value?.trim() ?? '';
                          if (!val) return;
                          const ok = await signingSetKey(val);
                          if (ok && signingInputRef.current) { signingInputRef.current.value = ''; setSigningInputHasValue(false); }
                        }
                      }}
                      placeholder="Passphrase, base64, or hex key..."
                      autoComplete="new-password"
                      name={`signing-key-${Date.now()}`}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-amber-500/50 pr-8"
                      disabled={signingLoading}
                    />
                    <button
                      onClick={() => setShowSigningPassphrase(!showSigningPassphrase)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                      type="button"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        {showSigningPassphrase ? (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        ) : (
                          <>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </>
                        )}
                      </svg>
                    </button>
                  </div>
                  <button
                    onClick={async () => {
                      const val = signingInputRef.current?.value?.trim() ?? '';
                      if (!val) return;
                      const ok = await signingSetKey(val);
                      if (ok && signingInputRef.current) { signingInputRef.current.value = ''; setSigningInputHasValue(false); }
                    }}
                    disabled={signingLoading || !signingInputHasValue}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs rounded-lg transition-colors shrink-0"
                  >
                    Add Key
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Error display */}
        {error && (
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-red-300">{error}</p>
            </div>
            {/* Show driver help after scan failure or connection error on serial */}
            {connectionType === 'serial' && (
              <DriverAssistant />
            )}
          </div>
        )}

        {/* Connect/Disconnect button */}
        {connectionState.isConnected || connectionState.isWaitingForHeartbeat ? (
          <button onClick={disconnect} className="btn btn-danger w-full">
            Disconnect
          </button>
        ) : (
          <button
            onClick={handleConnect}
            disabled={isConnecting || (connectionType === 'serial' && !selectedPort)}
            className="btn btn-primary w-full"
          >
            {isConnecting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Connecting...
              </span>
            ) : (
              'Connect'
            )}
          </button>
        )}

        {/* Waiting for heartbeat indicator */}
        {connectionState.isWaitingForHeartbeat && (
          <div className="card border-yellow-500/30">
            <div className="card-body">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-yellow-400 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-yellow-400">Waiting for heartbeat...</p>
                  <p className="text-xs text-gray-500">{connectionState.transport}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Connection info card */}
        {connectionState.isConnected && (
          <div className="card border-emerald-500/30">
            <div className="card-header">
              <h3 className="text-sm font-medium text-gray-300 flex items-center gap-2">
                <div className="status-dot status-dot-connected" />
                Connected
              </h3>
            </div>
            <div className="card-body space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Transport</span>
                <span className="text-gray-200 font-medium">{connectionState.transport}</span>
              </div>
              {connectionState.autopilot && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Autopilot</span>
                  <span className="text-gray-200 font-medium">{connectionState.autopilot}</span>
                </div>
              )}
              {connectionState.vehicleType && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Vehicle</span>
                  <span className="text-gray-200 font-medium">{connectionState.vehicleType}</span>
                </div>
              )}
              {connectionState.systemId !== undefined && (
                <div className="flex justify-between">
                  <span className="text-gray-500">System ID</span>
                  <span className="text-gray-200 font-medium">{connectionState.systemId}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Messages panel - show when connected via MAVLink/ArduPilot */}
        {connectionState.isConnected && connectionState.protocol === 'mavlink' && (
          <div className="h-64">
            <MessagesPanel />
          </div>
        )}

        {/* Manual driver help toggle - only show for serial when not already showing due to error */}
        {connectionType === 'serial' && !connectionState.isConnected && !error && (
          <div className="pt-2 border-t border-gray-800/50">
            <button
              onClick={() => setShowDriverHelp(!showDriverHelp)}
              className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Device not showing? Get driver help
            </button>
            {showDriverHelp && (
              <div className="mt-3">
                <DriverAssistant />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
