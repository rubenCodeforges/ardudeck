import { useState, useEffect, useRef } from 'react';
import { useConnectionStore } from '../../stores/connection-store';
import { useSettingsStore } from '../../stores/settings-store';
import type { SerialPortInfo } from '@ardudeck/comms';
import { DriverAssistant } from './DriverAssistant';

const BAUD_RATES = [115200, 57600, 38400, 19200, 9600];

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
  const [isScanning, setIsScanning] = useState(false);
  const [showDriverHelp, setShowDriverHelp] = useState(false);
  const [scanFailed, setScanFailed] = useState(false);
  const hasAppliedMemory = useRef(false);

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
      hasAppliedMemory.current = true;
    }
  }, [connectionMemory]);

  // Get SITL switch flag
  const { pendingSitlSwitch, setPendingSitlSwitch } = useSettingsStore();

  // Respond to SITL starting - switch to TCP when flag is set
  useEffect(() => {
    if (pendingSitlSwitch && !connectionState.isConnected) {
      setConnectionType('tcp');
      setTcpHost('127.0.0.1');
      setTcpPort(5760);
      // Clear the flag
      setPendingSitlSwitch(false);
    }
  }, [pendingSitlSwitch, connectionState.isConnected, setPendingSitlSwitch]);

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

  const handleScan = async () => {
    setIsScanning(true);
    setError(null);
    setScanFailed(false);
    try {
      const results = await window.electronAPI.scanPorts();
      if (results.length > 0) {
        const first = results[0]!;
        setSelectedPort(first.port);
        setBaudRate(first.baudRate);
        setScanFailed(false);
      } else {
        setError('No MAVLink devices found');
        setScanFailed(true);
      }
    } finally {
      setIsScanning(false);
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
      success = await connect({ type: 'tcp', host: tcpHost, tcpPort });
      if (success) {
        updateConnectionMemory({
          lastTcpHost: tcpHost,
          lastTcpPort: tcpPort,
          lastConnectionType: 'tcp',
        });
      }
    } else {
      success = await connect({ type: 'udp', udpPort });
      if (success) {
        updateConnectionMemory({
          lastUdpPort: udpPort,
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
                      {port.path} {port.manufacturer && `(${port.manufacturer})`}
                    </option>
                  ))}
                </select>
                <button
                  onClick={refreshPorts}
                  className="btn btn-secondary px-3"
                  disabled={connectionState.isConnected}
                  title="Refresh ports"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
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

            <button
              onClick={handleScan}
              disabled={isScanning || connectionState.isConnected}
              className="btn btn-secondary w-full flex items-center justify-center gap-2"
            >
              {isScanning ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Scanning...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  Scan
                </>
              )}
            </button>
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
          </div>
        )}

        {/* UDP settings */}
        {connectionType === 'udp' && (
          <div className="space-y-4">
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
              Listen for incoming MAVLink packets on this port
            </p>
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
