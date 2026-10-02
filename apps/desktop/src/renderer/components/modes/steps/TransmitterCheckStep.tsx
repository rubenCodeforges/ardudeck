/**
 * TransmitterCheckStep
 *
 * Verifies that the transmitter is connected and RC channels are being received.
 * User moves sticks to confirm channels are detected.
 */

import React, { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useModesWizardStore } from '../../../stores/modes-wizard-store';
import { useReceiverStore } from '../../../stores/receiver-store';
import TransmitterVisualizer from '../shared/TransmitterVisualizer';
import { Satellite, CheckCircle2, Clock, AlertTriangle, Square, CheckSquare } from 'lucide-react';

export const TransmitterCheckStep: React.FC = () => {
  const { t } = useTranslation();
  const {
    rcChannels,
    channelsDetected,
    transmitterConfirmed,
    setTransmitterConfirmed,
    startRcPolling,
    stopRcPolling,
    nextStep,
    prevStep,
  } = useModesWizardStore();
  const displayChannels = rcChannels;
  const displayDetected = channelsDetected;

  // Start RC polling when step mounts
  useEffect(() => {
    startRcPolling();
    return () => {
      // Don't stop polling - we need it for subsequent steps
    };
  }, [startRcPolling]);

  // Check if enough channels have been detected
  const detectedCount = channelsDetected.filter(Boolean).length;
  const hasMinimumChannels = detectedCount >= 4; // At least sticks detected

  const handleConfirmAndContinue = () => {
    setTransmitterConfirmed(true);
    nextStep();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/20 mb-4">
          <Satellite className="w-8 h-8 text-blue-400" />
        </div>
        <h2 className="text-xl font-semibold text-content">{t('modes:transmitterCheckStep.title')}</h2>
        <p className="text-sm text-content-secondary mt-2 max-w-md mx-auto">
          {t('modes:transmitterCheckStep.subtitle')}
        </p>
      </div>

      {/* Status indicator */}
      <div
        className={`p-4 rounded-xl border ${
          hasMinimumChannels
            ? 'bg-green-500/10 border-green-500/30'
            : 'bg-yellow-500/10 border-yellow-500/30'
        }`}
      >
        <div className="flex items-center gap-3">
          {hasMinimumChannels ? (
            <CheckCircle2 className="w-6 h-6 text-green-400 shrink-0" />
          ) : (
            <Clock className="w-6 h-6 text-yellow-400 shrink-0 animate-pulse" />
          )}
          <div>
            <h3
              className={`font-medium ${
                hasMinimumChannels ? 'text-green-300' : 'text-yellow-300'
              }`}
            >
              {hasMinimumChannels
                ? t('modes:transmitterCheckStep.channelsDetected', { count: detectedCount })
                : t('modes:transmitterCheckStep.waiting')}
            </h3>
            <p className="text-xs text-content-secondary mt-0.5">
              {hasMinimumChannels
                ? t('modes:transmitterCheckStep.connectedHint')
                : t('modes:transmitterCheckStep.waitingHint')}
            </p>
          </div>
        </div>
      </div>

      {/* Transmitter visualizer */}
      <div className="p-4 bg-surface rounded-xl border border">
        <TransmitterVisualizer
          rcChannels={displayChannels}
          channelsDetected={displayDetected}
        />
      </div>

      {/* Instructions */}
      <div className="p-4 bg-surface rounded-xl border border-subtle">
        <h4 className="text-sm font-medium text-content mb-3">{t('modes:transmitterCheckStep.quickCheck')}</h4>
        <ul className="space-y-2">
          <li className="flex items-center gap-2 text-sm text-content-secondary">
            {channelsDetected[0] || channelsDetected[1] ? (
              <CheckSquare className="w-4 h-4 text-green-400" />
            ) : (
              <Square className="w-4 h-4 text-content-tertiary" />
            )}
            <span>{t('modes:transmitterCheckStep.leftStick')}</span>
          </li>
          <li className="flex items-center gap-2 text-sm text-content-secondary">
            {channelsDetected[2] || channelsDetected[3] ? (
              <CheckSquare className="w-4 h-4 text-green-400" />
            ) : (
              <Square className="w-4 h-4 text-content-tertiary" />
            )}
            <span>{t('modes:transmitterCheckStep.rightStick')}</span>
          </li>
          <li className="flex items-center gap-2 text-sm text-content-secondary">
            {channelsDetected[4] ? (
              <CheckSquare className="w-4 h-4 text-green-400" />
            ) : (
              <Square className="w-4 h-4 text-content-tertiary" />
            )}
            <span>{t('modes:transmitterCheckStep.armSwitch')}</span>
          </li>
          <li className="flex items-center gap-2 text-sm text-content-secondary">
            {channelsDetected[5] ? (
              <CheckSquare className="w-4 h-4 text-green-400" />
            ) : (
              <Square className="w-4 h-4 text-content-tertiary" />
            )}
            <span>{t('modes:transmitterCheckStep.otherSwitches')}</span>
          </li>
        </ul>
      </div>

      {/* Confirmation checkbox */}
      <label className="flex items-center gap-3 p-4 bg-surface rounded-xl border border-subtle cursor-pointer hover:bg-surface-overlay-subtle transition-colors">
        <input
          type="checkbox"
          checked={transmitterConfirmed}
          onChange={(e) => setTransmitterConfirmed(e.target.checked)}
          className="w-5 h-5 rounded border bg-surface-raised text-blue-500 focus:ring-blue-500 focus:ring-offset-zinc-900"
        />
        <span className="text-sm text-content">
          {t('modes:transmitterCheckStep.confirm')}
        </span>
      </label>

      {/* Navigation buttons */}
      <div className="flex gap-3">
        <button
          onClick={prevStep}
          className="px-4 py-2.5 bg-surface-raised hover:bg-surface-raised text-content rounded-lg transition-colors"
        >
          {t('common:back')}
        </button>
        <button
          onClick={handleConfirmAndContinue}
          disabled={!transmitterConfirmed && !hasMinimumChannels}
          className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-surface-raised disabled:text-content-secondary text-white font-medium rounded-lg transition-colors disabled:cursor-not-allowed"
        >
          {t('modes:transmitterCheckStep.continue')}
        </button>
      </div>

      {/* Troubleshooting note */}
      {!hasMinimumChannels && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-red-300 text-sm">{t('modes:transmitterCheckStep.noChannels')}</h4>
              <ul className="text-xs text-red-200/70 mt-2 space-y-1 list-disc list-inside">
                <li>{t('modes:transmitterCheckStep.tipBound')}</li>
                <li>{t('modes:transmitterCheckStep.tipReceiver')}</li>
                <li>{t('modes:transmitterCheckStep.tipProtocol')}</li>
                <li>{t('modes:transmitterCheckStep.tipReconnect')}</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TransmitterCheckStep;
