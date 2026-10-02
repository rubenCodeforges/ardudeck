/**
 * Receiver Setup Wizard
 *
 * Guided setup for configuring receiver on MSP boards.
 * Steps: Select Receiver Type → Select Port → Verify Signal → Done
 */

import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useReceiverStore, type SerialPort } from '../../stores/receiver-store';
import { useConnectionStore } from '../../stores/connection-store';
import {
  BOARD_UART_LABELS,
  BOARD_RX_SUGGESTION,
  boardRxSuggestionNote,
} from '../../../shared/board-uart-labels';
import {
  X,
  Radio,
  Cable,
  Signal,
  Check,
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { PRIMARY_CHANNEL_COUNT, getChannelName } from '../../utils/rc-channel-constants';
import { INAV_SERIALRX_PROVIDER_INDEX } from '../../utils/receiver-constants';

// =============================================================================
// Types
// =============================================================================

type WizardStep = 'select-rx' | 'select-port' | 'verify' | 'done';

interface ReceiverOption {
  id: string;
  label: string;
  descriptionKey: string;
  inavProvider: string;
  bfProvider: number;
}

const RECEIVER_OPTIONS: ReceiverOption[] = [
  {
    id: 'crsf',
    label: 'TBS Crossfire / ExpressLRS',
    descriptionKey: 'parameters:receiverWizard.descCrsf',
    inavProvider: 'CRSF',
    bfProvider: 9,
  },
  {
    id: 'sbus',
    label: 'SBUS (FrSky, Futaba)', // i18n-exempt
    descriptionKey: 'parameters:receiverWizard.descSbus',
    inavProvider: 'SBUS',
    bfProvider: 2,
  },
  {
    id: 'ibus',
    label: 'iBUS (FlySky)', // i18n-exempt
    descriptionKey: 'parameters:receiverWizard.descIbus',
    inavProvider: 'IBUS',
    bfProvider: 7,
  },
  {
    id: 'spektrum',
    label: 'Spektrum', // i18n-exempt
    descriptionKey: 'parameters:receiverWizard.descSpektrum',
    inavProvider: 'SPEK2048',
    bfProvider: 1,
  },
  {
    id: 'msp',
    label: 'MSP (GCS / SITL)', // i18n-exempt
    descriptionKey: 'parameters:receiverWizard.descMsp',
    inavProvider: 'MSP',
    bfProvider: 15,
  },
];

const RX_SERIAL_BIT = 6;

// =============================================================================
// Main Component
// =============================================================================

interface ReceiverWizardProps {
  isOpen: boolean;
  onClose: () => void;
  isInav: boolean;
}

export default function ReceiverWizard({ isOpen, onClose, isInav }: ReceiverWizardProps) {
  const { t } = useTranslation();
  const connection = useConnectionStore((s) => s.connectionState);
  const {
    serialConfig,
    channels,
    rxMap,
    signalStatus,
    startPolling,
    stopPolling,
    loadConfig,
    updatePortFunction,
  } = useReceiverStore();

  const displayChannels = channels;

  const [step, setStep] = useState<WizardStep>('select-rx');
  const [selectedRx, setSelectedRx] = useState<ReceiverOption | null>(null);
  const [selectedPort, setSelectedPort] = useState<number | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [channelBaseline, setChannelBaseline] = useState<number[]>([]);
  const [channelsDetected, setChannelsDetected] = useState(0);

  const boardId = connection?.boardId ?? '';
  const boardLabels = BOARD_UART_LABELS[boardId] ?? {};
  const rxSuggestion = BOARD_RX_SUGGESTION[boardId];

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setStep('select-rx');
      setSelectedRx(null);
      setSelectedPort(null);
      setIsApplying(false);
      setApplyError(null);
      setChannelBaseline([]);
      setChannelsDetected(0);
      loadConfig();
    }
  }, [isOpen]);

  // Start polling on verify step
  useEffect(() => {
    if (step === 'verify') {
      startPolling();
      setChannelBaseline([...displayChannels]);
      return () => stopPolling();
    }
  }, [step]);

  // Detect active channels on verify step
  useEffect(() => {
    if (step === 'verify' && channelBaseline.length > 0) {
      let count = 0;
      for (let i = 0; i < Math.min(displayChannels.length, 16); i++) {
        const base = channelBaseline[i] ?? 1500;
        const current = displayChannels[i] ?? 1500;
        if (Math.abs(current - base) > 50) count++;
      }
      setChannelsDetected(count);

      // Auto-advance when 4+ channels detected
      if (count >= 4) {
        const timer = setTimeout(() => setStep('done'), 500);
        return () => clearTimeout(timer);
      }
    }
  }, [channels, channelBaseline, step]);

  if (!isOpen) return null;

  const getAvailablePorts = (): SerialPort[] => {
    if (!serialConfig) return [];
    return serialConfig.ports
      .filter((p) => p.identifier !== 20) // Exclude USB VCP
      .sort((a, b) => a.identifier - b.identifier);
  };

  const getPortName = (identifier: number): string => {
    if (identifier >= 0 && identifier <= 7) return `UART${identifier + 1}`;
    if (identifier === 30) return 'SOFTSERIAL1';
    if (identifier === 31) return 'SOFTSERIAL2';
    return `PORT${identifier}`;
  };

  const handleApply = async () => {
    if (!selectedRx || selectedPort === null) return;

    setIsApplying(true);
    setApplyError(null);

    try {
      // 1. Set receiver protocol via MSP_SET_RX_CONFIG (45) — reliable for both iNav and BF
      if (isInav) {
        const rxTypeIdx = selectedRx.id === 'msp' ? 2 : 1; // 2=MSP, 1=SERIAL
        // An MSP receiver has no serial provider; keep whatever the board has.
        const providerIdx = INAV_SERIALRX_PROVIDER_INDEX[selectedRx.inavProvider]
          ?? (await window.electronAPI?.mspGetRxConfig())?.serialrxProvider;
        if (providerIdx !== undefined) await window.electronAPI?.mspSetRxConfig(providerIdx, rxTypeIdx);
      } else {
        await window.electronAPI?.mspSetRxConfig(selectedRx.bfProvider);
      }

      // 2. Set RX_SERIAL on selected port (clear from others)
      if (serialConfig && selectedRx.id !== 'msp') {
        for (const port of serialConfig.ports) {
          const hasRx = (port.functionMask & (1 << RX_SERIAL_BIT)) !== 0;
          if (port.identifier === selectedPort) {
            if (!hasRx) {
              updatePortFunction(port.identifier, port.functionMask | (1 << RX_SERIAL_BIT));
            }
          } else if (hasRx) {
            updatePortFunction(port.identifier, port.functionMask & ~(1 << RX_SERIAL_BIT));
          }
        }

        // Save serial config
        const store = useReceiverStore.getState();
        if (store.serialConfig) {
          await window.electronAPI?.mspSetSerialConfig(store.serialConfig);
        }
      }

      // 3. Save EEPROM
      await window.electronAPI?.mspSaveEeprom();

      // 4. Advance to verify
      setStep('verify');
    } catch (error) {
      setApplyError(error instanceof Error ? error.message : t('parameters:receiverWizard.configFailed'));
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-surface-solid rounded-2xl border w-full max-w-lg mx-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-subtle">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <Radio className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-content">{t('parameters:receiverWizard.title')}</h2>
              <p className="text-xs text-content-secondary">
                {step === 'select-rx' && t('parameters:receiverWizard.step1')}
                {step === 'select-port' && t('parameters:receiverWizard.step2')}
                {step === 'verify' && t('parameters:receiverWizard.step3')}
                {step === 'done' && t('parameters:receiverWizard.complete')}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-surface-raised rounded-lg transition-colors">
            <X className="w-5 h-5 text-content-secondary" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="px-6 pt-4">
          <div className="flex gap-1">
            {['select-rx', 'select-port', 'verify', 'done'].map((s, i) => {
              const steps: WizardStep[] = ['select-rx', 'select-port', 'verify', 'done'];
              const currentIdx = steps.indexOf(step);
              return (
                <div
                  key={s}
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    i <= currentIdx ? 'bg-blue-500' : 'bg-surface-raised'
                  }`}
                />
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 min-h-[300px]">
          {/* Step 1: Select Receiver Type */}
          {step === 'select-rx' && (
            <div className="space-y-2">
              {RECEIVER_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  onClick={() => setSelectedRx(option)}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                    selectedRx?.id === option.id
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border bg-surface hover:border'
                  }`}
                >
                  <div className="font-medium text-sm text-content">{option.label}</div>
                  <div className="text-xs text-content-secondary mt-0.5">{t(option.descriptionKey)}</div>
                </button>
              ))}
            </div>
          )}

          {/* Step 2: Select Port */}
          {step === 'select-port' && (
            <div className="space-y-3">
              {rxSuggestion && (
                <div className="p-3 rounded-lg bg-green-500/10 border-green-500/20">
                  <p className="text-xs text-green-300">
                    {t('parameters:receiverWizard.suggestedNote', { note: boardRxSuggestionNote(rxSuggestion) })}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                {getAvailablePorts().map((port) => {
                  const name = getPortName(port.identifier);
                  const label = boardLabels[port.identifier];
                  const isSuggested = rxSuggestion?.uart === port.identifier;
                  const hasRx = (port.functionMask & (1 << RX_SERIAL_BIT)) !== 0;

                  return (
                    <button
                      key={port.identifier}
                      onClick={() => setSelectedPort(port.identifier)}
                      className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                        selectedPort === port.identifier
                          ? 'border-blue-500 bg-blue-500/10'
                          : isSuggested
                          ? 'border-green-500/30 bg-green-500/5 hover:border-green-500/50'
                          : 'border bg-surface hover:border'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-medium text-sm text-content">{name}</span>
                          {label && <span className="text-xs text-content-secondary ml-2">{label}</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          {hasRx && (
                            <span className="px-1.5 py-0.5 text-[10px] rounded bg-green-500/20 text-green-400">RX</span>
                          )}
                          {isSuggested && (
                            <span className="px-1.5 py-0.5 text-[10px] rounded bg-green-500/20 text-green-400">{t('parameters:receiverWizard.suggested')}</span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {applyError && (
                <div className="p-3 rounded-lg bg-red-500/10 border-red-500/20">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    <p className="text-xs text-red-300">{applyError}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Verify Signal */}
          {step === 'verify' && (
            <div className="space-y-4">
              <p className="text-sm text-content-secondary">{t('parameters:receiverWizard.moveSticks')}</p>

              {/* Primary sticks */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                {displayChannels.slice(0, PRIMARY_CHANNEL_COUNT).map((value, i) => {
                  const base = channelBaseline[i] ?? 1500;
                  const isActive = Math.abs(value - base) > 50;
                  const name = getChannelName(i, 'msp');
                  const percent = Math.min(100, Math.max(0, ((value - 900) / 1200) * 100));

                  return (
                    <div key={i} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className={isActive ? 'text-green-400' : 'text-content-secondary'}>{name}</span>
                        <span className="text-content-secondary font-mono">{value}</span>
                      </div>
                      <div className="h-2 bg-surface-inset rounded-full overflow-hidden relative">
                        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-zinc-600" />
                        <div
                          className={`absolute top-0 bottom-0 w-2 rounded-full transition-all ${
                            isActive ? 'bg-green-500' : 'bg-zinc-600'
                          }`}
                          style={{ left: `calc(${percent}% - 4px)` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* AUX channels - compact layout */}
              {displayChannels.length > PRIMARY_CHANNEL_COUNT && (
                <>
                  <div className="border-t border-subtle" />
                  <div className="grid grid-cols-4 gap-x-3 gap-y-1.5">
                    {displayChannels.slice(PRIMARY_CHANNEL_COUNT).map((value, i) => {
                      const idx = i + PRIMARY_CHANNEL_COUNT;
                      const base = channelBaseline[idx] ?? 1500;
                      const isActive = Math.abs(value - base) > 50;
                      const name = getChannelName(idx, 'msp');
                      const percent = Math.min(100, Math.max(0, ((value - 900) / 1200) * 100));

                      return (
                        <div key={idx} className="space-y-0.5">
                          <div className="flex items-center justify-between">
                            <span className={`text-[11px] ${isActive ? 'text-green-400' : 'text-content-secondary'}`}>{name}</span>
                            <span className="text-[10px] text-content-tertiary font-mono">{value}</span>
                          </div>
                          <div className="h-1.5 bg-surface-inset rounded-full overflow-hidden relative">
                            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-surface-raised" />
                            <div
                              className={`absolute top-0 bottom-0 w-1.5 rounded-full transition-all ${
                                isActive ? 'bg-green-500' : 'bg-zinc-600'
                              }`}
                              style={{ left: `calc(${percent}% - 3px)` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              <div className="text-center text-xs text-content-secondary">
                {t('parameters:receiverWizard.channelsDetected', { count: channelsDetected })}
              </div>
            </div>
          )}

          {/* Step 4: Done */}
          {step === 'done' && (
            <div className="flex flex-col items-center justify-center h-full space-y-4 py-8">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
                <Check className="w-8 h-8 text-green-400" />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-semibold text-content">{t('parameters:receiverWizard.configured')}</h3>
                <p className="text-sm text-content-secondary mt-1">
                  {t('parameters:receiverWizard.rxOnPort', { rx: selectedRx?.label, port: selectedPort !== null ? getPortName(selectedPort) : 'MSP' })}
                </p>
              </div>
              <div className="text-xs text-content-secondary bg-surface-raised rounded-lg p-3 w-full max-w-xs">
                <div className="flex justify-between">
                  <span>{t('parameters:receiverWizard.protocolLabel')}</span>
                  <span className="text-content">{selectedRx?.label}</span>
                </div>
                {selectedPort !== null && (
                  <div className="flex justify-between mt-1">
                    <span>{t('parameters:receiverWizard.portLabel')}</span>
                    <span className="text-content">{getPortName(selectedPort)}</span>
                  </div>
                )}
                <div className="flex justify-between mt-1">
                  <span>{t('parameters:receiverWizard.channelsLabel')}</span>
                  <span className="text-green-400">{t('parameters:receiverWizard.activeCount', { count: channelsDetected })}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-subtle flex justify-between">
          {step !== 'select-rx' && step !== 'done' ? (
            <button
              onClick={() => {
                if (step === 'select-port') setStep('select-rx');
                if (step === 'verify') setStep('select-port');
              }}
              className="px-4 py-2 rounded-lg text-sm text-content-secondary hover:text-content hover:bg-surface-raised transition-all flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              {t('common:back')}
            </button>
          ) : (
            <div />
          )}

          {step === 'select-rx' && (
            <button
              onClick={() => {
                if (selectedRx?.id === 'msp') {
                  // MSP doesn't need a port
                  handleApply();
                } else {
                  setStep('select-port');
                }
              }}
              disabled={!selectedRx}
              className={`px-4 py-2 rounded-lg text-sm flex items-center gap-1 transition-all ${
                selectedRx
                  ? 'bg-blue-600 text-white hover:bg-blue-500'
                  : 'bg-surface-raised text-content-secondary cursor-not-allowed'
              }`}
            >
              {selectedRx?.id === 'msp' ? t('common:apply') : t('common:next')}
              <ChevronRight className="w-4 h-4" />
            </button>
          )}

          {step === 'select-port' && (
            <button
              onClick={handleApply}
              disabled={selectedPort === null || isApplying}
              className={`px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-all ${
                selectedPort !== null && !isApplying
                  ? 'bg-blue-600 text-white hover:bg-blue-500'
                  : 'bg-surface-raised text-content-secondary cursor-not-allowed'
              }`}
            >
              {isApplying && <Loader2 className="w-4 h-4 animate-spin" />}
              {isApplying ? t('parameters:receiverWizard.applying') : t('parameters:receiverWizard.applyVerify')}
            </button>
          )}

          {step === 'verify' && (
            <button
              onClick={() => setStep('done')}
              className="px-4 py-2 rounded-lg text-sm bg-surface-raised text-content hover:bg-surface-raised transition-all"
            >
              {t('common:skip')}
            </button>
          )}

          {step === 'done' && (
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-500 transition-all"
            >
              {t('common:done')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
