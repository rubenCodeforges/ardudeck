/**
 * TransmitterCheckStep
 *
 * RC transmitter check step - verifies that the transmitter is connected
 * and channels are being received before applying configuration.
 *
 * Includes an inline receiver troubleshooter that expands when no RC signal
 * is detected, letting users fix their receiver config without leaving the wizard.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useQuickSetupStore } from '../../../stores/quick-setup-store';
import { Radio, CheckCircle2, AlertTriangle, ArrowLeft, ArrowRight, Wrench, Loader2 } from 'lucide-react';
import { PRIMARY_CHANNEL_COUNT, getChannelName, reorderChannels } from '../../../utils/rc-channel-constants';
import { useReceiverStore } from '../../../stores/receiver-store';
import {
  INAV_RECEIVER_TYPES,
  INAV_QUICK_SELECT,
  BF_QUICK_SELECT,
  BF_PROVIDERS,
  PROTOCOL_HINTS,
  BF_PROTOCOL_HINTS,
  SERIAL_FUNCTION_BIT_RX,
  INAV_RECEIVER_TYPE_INDEX,
  SERIALRX_PROVIDER_INDEX,
} from '../../../utils/receiver-constants';
import type { SerialPort } from '../../../stores/receiver-store';

// Channel bar component
const ChannelBar: React.FC<{
  channelIndex: number;
  value: number;
  detected: boolean;
}> = ({ channelIndex, value, detected }) => {
  const percent = Math.min(100, Math.max(0, ((value - 900) / 1200) * 100));
  const channelName = getChannelName(channelIndex, 'msp');

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className={detected ? 'text-green-400' : 'text-zinc-400'}>
          {channelName}
        </span>
        <span className="text-zinc-500 font-mono">{value}</span>
      </div>
      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden relative">
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-zinc-600" />
        <div
          className={`absolute top-0 bottom-0 w-2 rounded-full transition-all ${
            detected ? 'bg-green-500' : 'bg-zinc-600'
          }`}
          style={{ left: `calc(${percent}% - 4px)` }}
        />
      </div>
    </div>
  );
};

/** Compact channel bar for AUX channels */
const CompactChannelBar: React.FC<{
  channelIndex: number;
  value: number;
  detected: boolean;
}> = ({ channelIndex, value, detected }) => {
  const percent = Math.min(100, Math.max(0, ((value - 900) / 1200) * 100));
  const channelName = getChannelName(channelIndex, 'msp');

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <span className={`text-[11px] ${detected ? 'text-green-400' : 'text-zinc-500'}`}>
          {channelName}
        </span>
        <span className="text-[10px] text-zinc-600 font-mono">{value}</span>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden relative">
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-zinc-700" />
        <div
          className={`absolute top-0 bottom-0 w-1.5 rounded-full transition-all ${
            detected ? 'bg-green-500' : 'bg-zinc-600'
          }`}
          style={{ left: `calc(${percent}% - 3px)` }}
        />
      </div>
    </div>
  );
};

/** Get human-readable port name from identifier */
function getPortName(identifier: number): string {
  if (identifier === 20) return 'USB VCP';
  if (identifier === 30) return 'SOFTSERIAL1';
  if (identifier === 31) return 'SOFTSERIAL2';
  if (identifier >= 0 && identifier <= 7) return `UART${identifier + 1}`;
  return `PORT${identifier}`;
}

export const TransmitterCheckStep: React.FC = () => {
  const {
    rcChannels,
    isPollingRc,
    startRcPolling,
    stopRcPolling,
    transmitterConfirmed,
    setTransmitterConfirmed,
    channelsDetected,
    resetChannelDetection,
    nextStep,
    prevStep,
    selectedPreset,
    fcVariant,
  } = useQuickSetupStore();

  const isInav = fcVariant === 'INAV';
  const rxMap = useReceiverStore((s) => s.rxMap);

  // Reorder raw channels and detection flags into logical order using rxMap
  const displayChannels = React.useMemo(
    () => reorderChannels(rcChannels, rxMap),
    [rcChannels, rxMap],
  );
  const displayDetected = React.useMemo(
    () => reorderChannels(channelsDetected, rxMap),
    [channelsDetected, rxMap],
  );

  // Start polling when component mounts
  useEffect(() => {
    startRcPolling();
    return () => stopRcPolling();
  }, [startRcPolling, stopRcPolling]);

  // Auto-confirm if 4+ channels detected
  useEffect(() => {
    const detectedCount = channelsDetected.filter(Boolean).length;
    if (detectedCount >= 4 && !transmitterConfirmed) {
      // Small delay to show the user the detection
      const timer = setTimeout(() => {
        setTransmitterConfirmed(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [channelsDetected, transmitterConfirmed, setTransmitterConfirmed]);

  // No-signal diagnostic: show after 5 seconds of no detection
  const [noSignalTimeout, setNoSignalTimeout] = useState(false);
  const detectedCount = channelsDetected.filter(Boolean).length;
  const allDetected = detectedCount >= 4;

  useEffect(() => {
    if (allDetected) {
      setNoSignalTimeout(false);
      return;
    }
    const timer = setTimeout(() => {
      if (!allDetected) setNoSignalTimeout(true);
    }, 5000);
    return () => clearTimeout(timer);
  }, [allDetected]);

  // =========================================================================
  // Inline Troubleshooter State
  // =========================================================================

  const [showTroubleshoot, setShowTroubleshoot] = useState(false);
  const [rxType, setRxType] = useState<string | null>(null);
  const [inavProvider, setInavProvider] = useState<string | null>(null);
  const [bfProvider, setBfProvider] = useState<number | null>(null);
  const [serialPorts, setSerialPorts] = useState<SerialPort[]>([]);
  const [rxPortId, setRxPortId] = useState<number>(-1);
  const [isSavingRx, setIsSavingRx] = useState(false);
  const [rxSaveError, setRxSaveError] = useState<string | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);

  const loadReceiverConfig = useCallback(async () => {
    try {
      // 1. Load serial ports — find which port has RX_SERIAL
      const config = await window.electronAPI?.mspGetSerialConfig();
      if (config?.ports) {
        // Filter to real UARTs only (no VCP, no softserial)
        const uarts = config.ports.filter(
          (p: SerialPort) => p.identifier >= 0 && p.identifier <= 7
        );
        setSerialPorts(uarts);
        const rxPort = uarts.find(
          (p: SerialPort) => (p.functionMask & (1 << SERIAL_FUNCTION_BIT_RX)) !== 0
        );
        if (rxPort) setRxPortId(rxPort.identifier);
      }

      // 2. Load receiver protocol via MSP_RX_CONFIG (44) — reliable for both iNav and BF
      const rxConfig = await window.electronAPI?.mspGetRxConfig();
      if (rxConfig) {
        if (isInav) {
          if (rxConfig.receiverTypeName != null) {
            setRxType(rxConfig.receiverTypeName);
          }
          if (rxConfig.serialrxProviderName) {
            setInavProvider(rxConfig.serialrxProviderName.toUpperCase());
          }
        } else {
          setBfProvider(rxConfig.serialrxProvider);
        }
      }

      setConfigLoaded(true);
    } catch (err) {
      console.error('[TransmitterCheck] Failed to load receiver config:', err);
    }
  }, [isInav]);

  // Load config when troubleshooter opens
  useEffect(() => {
    if (showTroubleshoot && !configLoaded) {
      loadReceiverConfig();
    }
  }, [showTroubleshoot, configLoaded, loadReceiverConfig]);

  const applyReceiverConfig = async () => {
    setIsSavingRx(true);
    setRxSaveError(null);

    try {
      // 1. Update serial port — enable RX_SERIAL on selected UART, disable on others
      if (rxPortId >= 0 && serialPorts.length > 0) {
        const updatedPorts = serialPorts.map((p) => ({
          ...p,
          functionMask:
            p.identifier === rxPortId
              ? p.functionMask | (1 << SERIAL_FUNCTION_BIT_RX)
              : p.functionMask & ~(1 << SERIAL_FUNCTION_BIT_RX),
        }));
        await window.electronAPI?.mspSetSerialConfig({ ports: updatedPorts });
      }

      // 2. Set receiver protocol via MSP_SET_RX_CONFIG (45) — works for both iNav and BF
      if (isInav) {
        const providerIdx = inavProvider != null ? SERIALRX_PROVIDER_INDEX[inavProvider] : undefined;
        const rxTypeIdx = rxType != null ? INAV_RECEIVER_TYPE_INDEX[rxType] : undefined;
        if (providerIdx !== undefined) {
          await window.electronAPI?.mspSetRxConfig(providerIdx, rxTypeIdx);
        }
      } else if (bfProvider != null) {
        await window.electronAPI?.mspSetRxConfig(bfProvider);
      }

      // 3. Save EEPROM
      await window.electronAPI?.mspSaveEeprom();

      // 4. Reset detection and hide troubleshooter
      resetChannelDetection();
      setShowTroubleshoot(false);
      setNoSignalTimeout(false);
      setConfigLoaded(false); // reload next time if needed
    } catch (err) {
      setRxSaveError(err instanceof Error ? err.message : 'Failed to save receiver config');
    } finally {
      setIsSavingRx(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div
          className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 ${
            allDetected ? 'bg-green-500/20' : 'bg-amber-500/20'
          }`}
        >
          {allDetected ? (
            <CheckCircle2 className="w-8 h-8 text-green-400" />
          ) : (
            <Radio className="w-8 h-8 text-amber-400 animate-pulse" />
          )}
        </div>
        <h2 className="text-xl font-semibold text-zinc-100">
          {allDetected ? 'Transmitter Connected!' : 'Wiggle Your Sticks'}
        </h2>
        <p className="text-sm text-zinc-400 mt-2 max-w-md mx-auto">
          {allDetected
            ? 'Your transmitter is working. You can proceed to review your configuration.'
            : 'Turn on your transmitter and move all sticks to verify they are being received.'}
        </p>
      </div>

      {/* Status indicator */}
      <div
        className={`p-4 rounded-xl border ${
          allDetected
            ? 'bg-green-500/10 border-green-500/30'
            : 'bg-amber-500/10 border-amber-500/30'
        }`}
      >
        <div className="flex items-center gap-3">
          {allDetected ? (
            <CheckCircle2 className="w-5 h-5 text-green-400" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          )}
          <div>
            <p className={`text-sm font-medium ${allDetected ? 'text-green-300' : 'text-amber-300'}`}>
              {detectedCount}/4 channels detected
            </p>
            <p className="text-xs text-zinc-400 mt-0.5">
              {allDetected
                ? 'All primary channels (Roll, Pitch, Throttle, Yaw) are responding'
                : 'Wiggle each stick to detect remaining channels'}
            </p>
          </div>
        </div>
      </div>

      {/* Channel bars */}
      <div className="p-4 bg-zinc-800/50 rounded-xl space-y-3">
        <h3 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
          <Radio className="w-4 h-4" />
          RC Channels
          {isPollingRc && (
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          )}
        </h3>

        {/* Primary sticks (reordered by rxMap) */}
        <div className="grid grid-cols-2 gap-4">
          {displayChannels.slice(0, PRIMARY_CHANNEL_COUNT).map((value, index) => (
            <ChannelBar
              key={index}
              channelIndex={index}
              value={value}
              detected={displayDetected[index] ?? false}
            />
          ))}
        </div>

        {/* AUX channels - compact layout */}
        {displayChannels.length > PRIMARY_CHANNEL_COUNT && (
          <>
            <div className="border-t border-zinc-700/50 mt-3" />
            <div className="grid grid-cols-3 gap-x-4 gap-y-2 mt-2">
              {displayChannels.slice(PRIMARY_CHANNEL_COUNT).map((value, i) => (
                <CompactChannelBar
                  key={i + PRIMARY_CHANNEL_COUNT}
                  channelIndex={i + PRIMARY_CHANNEL_COUNT}
                  value={value}
                  detected={displayDetected[i + PRIMARY_CHANNEL_COUNT] ?? false}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* No signal diagnostic + inline troubleshooter */}
      {!allDetected && noSignalTimeout && (
        <div className="space-y-3">
          {/* Warning banner */}
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-300">
                  No RC signal detected
                </p>
                <p className="text-xs text-zinc-400 mt-1">
                  Your receiver may not be configured correctly. Check that it's powered, bound to your transmitter, and the correct protocol is set.
                </p>
                {!showTroubleshoot && (
                  <button
                    onClick={() => setShowTroubleshoot(true)}
                    className="mt-3 flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-amber-300 bg-amber-500/20 hover:bg-amber-500/30 rounded-lg transition-colors"
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    Fix Receiver Config
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Inline troubleshooter panel */}
          {showTroubleshoot && (
            <div className="p-4 rounded-xl bg-zinc-800/50 border border-zinc-700/30 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-blue-400" />
                  <h3 className="text-sm font-medium text-zinc-200">Receiver Configuration</h3>
                </div>
                <button
                  onClick={() => setShowTroubleshoot(false)}
                  className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Close
                </button>
              </div>

              {!configLoaded ? (
                <div className="flex items-center justify-center gap-2 py-4 text-zinc-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Loading config from FC...</span>
                </div>
              ) : (
                <>
                  {/* Receiver type (iNav) or provider (BF) */}
                  {isInav ? (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-zinc-400 mb-1.5 block">Receiver Type</label>
                        <div className="flex gap-1.5 flex-wrap">
                          {INAV_RECEIVER_TYPES.map((t) => (
                            <button
                              key={t.value}
                              onClick={() => setRxType(t.value)}
                              className={`px-3 py-1.5 rounded-lg text-xs transition-all ${
                                rxType === t.value
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'
                              }`}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {rxType === 'SERIAL' && (
                        <div>
                          <label className="text-xs text-zinc-400 mb-1.5 block">Serial RX Protocol</label>
                          <div className="flex gap-1.5 flex-wrap">
                            {INAV_QUICK_SELECT.map((p) => (
                              <button
                                key={p.value}
                                onClick={() => setInavProvider(p.value)}
                                className={`px-3 py-1.5 rounded-lg text-xs transition-all ${
                                  inavProvider === p.value
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'
                                }`}
                              >
                                {p.label}
                              </button>
                            ))}
                          </div>
                          {inavProvider && PROTOCOL_HINTS[inavProvider] && (
                            <p className="text-[11px] text-zinc-500 mt-1.5">{PROTOCOL_HINTS[inavProvider]}</p>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-zinc-400 mb-1.5 block">Receiver Protocol</label>
                        <div className="flex gap-1.5 flex-wrap">
                          {BF_QUICK_SELECT.map((p) => (
                            <button
                              key={p.value}
                              onClick={() => setBfProvider(p.value)}
                              className={`px-3 py-1.5 rounded-lg text-xs transition-all ${
                                bfProvider === p.value
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'
                              }`}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-zinc-400 mb-1.5 block">All Protocols</label>
                        <select
                          value={bfProvider ?? ''}
                          onChange={(e) => setBfProvider(Number(e.target.value))}
                          className="w-full bg-zinc-700 text-zinc-200 rounded-lg px-3 py-1.5 text-xs border border-zinc-600 focus:border-blue-500 focus:outline-none"
                        >
                          {bfProvider === null && <option value="">Not loaded</option>}
                          {BF_PROVIDERS.map((p) => (
                            <option key={p.value} value={p.value}>{p.label}</option>
                          ))}
                        </select>
                      </div>
                      {bfProvider != null && BF_PROTOCOL_HINTS[bfProvider] && (
                        <p className="text-[11px] text-zinc-500">{BF_PROTOCOL_HINTS[bfProvider]}</p>
                      )}
                    </div>
                  )}

                  {/* Serial RX Port selector */}
                  {serialPorts.length > 0 && (rxType === 'SERIAL' || !isInav) && (
                    <div>
                      <label className="text-xs text-zinc-400 mb-1.5 block">Serial RX Port</label>
                      <select
                        value={rxPortId}
                        onChange={(e) => setRxPortId(Number(e.target.value))}
                        className="w-full bg-zinc-700 text-zinc-200 rounded-lg px-3 py-1.5 text-xs border border-zinc-600 focus:border-blue-500 focus:outline-none"
                      >
                        <option value={-1}>None selected</option>
                        {serialPorts.map((p) => (
                          <option key={p.identifier} value={p.identifier}>
                            {getPortName(p.identifier)}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-zinc-500 mt-1">
                        Select the UART your receiver is wired to. Only one port can have Serial RX.
                      </p>
                    </div>
                  )}

                  {/* Error message */}
                  {rxSaveError && (
                    <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/30">
                      <p className="text-xs text-red-400">{rxSaveError}</p>
                    </div>
                  )}

                  {/* Apply button */}
                  <button
                    onClick={applyReceiverConfig}
                    disabled={isSavingRx}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSavingRx ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      'Apply & Retry'
                    )}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Selected preset reminder */}
      {selectedPreset && (
        <div className="p-3 bg-zinc-800/30 rounded-lg border border-zinc-700">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{selectedPreset.icon}</span>
            <div>
              <p className="text-sm text-zinc-300">
                Applying <strong>{selectedPreset.name}</strong> preset
              </p>
              <p className="text-xs text-zinc-500">{selectedPreset.description}</p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation buttons */}
      <div className="flex items-center justify-between pt-4 border-t border-zinc-700">
        <button
          onClick={prevStep}
          className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <button
          onClick={nextStep}
          disabled={!transmitterConfirmed}
          className={`flex items-center gap-2 px-6 py-2 text-sm font-medium rounded-lg transition-colors ${
            transmitterConfirmed
              ? 'bg-blue-600 text-white hover:bg-blue-500'
              : 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
          }`}
        >
          Continue
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Skip option */}
      <div className="text-center">
        <button
          onClick={() => {
            setTransmitterConfirmed(true);
            nextStep();
          }}
          className="text-xs text-zinc-500 hover:text-zinc-400 underline"
        >
          Skip transmitter check (not recommended)
        </button>
      </div>
    </div>
  );
};

export default TransmitterCheckStep;
