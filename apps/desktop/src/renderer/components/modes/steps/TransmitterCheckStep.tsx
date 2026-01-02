/**
 * TransmitterCheckStep
 *
 * Verifies that the transmitter is connected and RC channels are being received.
 * User moves sticks to confirm channels are detected.
 */

import React, { useEffect } from 'react';
import { useModesWizardStore } from '../../../stores/modes-wizard-store';
import TransmitterVisualizer from '../shared/TransmitterVisualizer';

export const TransmitterCheckStep: React.FC = () => {
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
          <span className="text-3xl">📡</span>
        </div>
        <h2 className="text-xl font-semibold text-zinc-100">Check Your Transmitter</h2>
        <p className="text-sm text-zinc-400 mt-2 max-w-md mx-auto">
          Move your sticks and flip your switches to verify they&apos;re being received.
          Each channel should light up green when it detects movement.
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
          <span className="text-2xl">{hasMinimumChannels ? '✅' : '⏳'}</span>
          <div>
            <h3
              className={`font-medium ${
                hasMinimumChannels ? 'text-green-300' : 'text-yellow-300'
              }`}
            >
              {hasMinimumChannels
                ? `${detectedCount} channels detected!`
                : 'Waiting for channel movement...'}
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              {hasMinimumChannels
                ? 'Your transmitter is connected. Move switches to detect AUX channels.'
                : 'Move all your sticks to their extremes to verify the connection.'}
            </p>
          </div>
        </div>
      </div>

      {/* Transmitter visualizer */}
      <div className="p-4 bg-zinc-800/50 rounded-xl border border-zinc-700">
        <TransmitterVisualizer
          rcChannels={rcChannels}
          channelsDetected={channelsDetected}
        />
      </div>

      {/* Instructions */}
      <div className="p-4 bg-zinc-800/30 rounded-xl border border-zinc-700/50">
        <h4 className="text-sm font-medium text-zinc-300 mb-3">Quick Check:</h4>
        <ul className="space-y-2">
          <li className="flex items-center gap-2 text-sm text-zinc-400">
            <span className={channelsDetected[0] || channelsDetected[1] ? '✅' : '⬜'} />
            <span>Move left stick up/down and left/right</span>
          </li>
          <li className="flex items-center gap-2 text-sm text-zinc-400">
            <span className={channelsDetected[2] || channelsDetected[3] ? '✅' : '⬜'} />
            <span>Move right stick up/down and left/right</span>
          </li>
          <li className="flex items-center gap-2 text-sm text-zinc-400">
            <span className={channelsDetected[4] ? '✅' : '⬜'} />
            <span>Flip your ARM switch (usually AUX1)</span>
          </li>
          <li className="flex items-center gap-2 text-sm text-zinc-400">
            <span className={channelsDetected[5] ? '✅' : '⬜'} />
            <span>Move any other switches you plan to use</span>
          </li>
        </ul>
      </div>

      {/* Confirmation checkbox */}
      <label className="flex items-center gap-3 p-4 bg-zinc-800/30 rounded-xl border border-zinc-700/50 cursor-pointer hover:bg-zinc-700/30 transition-colors">
        <input
          type="checkbox"
          checked={transmitterConfirmed}
          onChange={(e) => setTransmitterConfirmed(e.target.checked)}
          className="w-5 h-5 rounded border-zinc-600 bg-zinc-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-zinc-900"
        />
        <span className="text-sm text-zinc-300">
          I can see my sticks and switches responding in the visualizer above
        </span>
      </label>

      {/* Navigation buttons */}
      <div className="flex gap-3">
        <button
          onClick={prevStep}
          className="px-4 py-2.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg transition-colors"
        >
          Back
        </button>
        <button
          onClick={handleConfirmAndContinue}
          disabled={!transmitterConfirmed && !hasMinimumChannels}
          className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium rounded-lg transition-colors disabled:cursor-not-allowed"
        >
          Continue to Mode Configuration
        </button>
      </div>

      {/* Troubleshooting note */}
      {!hasMinimumChannels && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
          <div className="flex items-start gap-3">
            <span className="text-xl">⚠️</span>
            <div>
              <h4 className="font-medium text-red-300 text-sm">No channels detected?</h4>
              <ul className="text-xs text-red-200/70 mt-2 space-y-1 list-disc list-inside">
                <li>Make sure your transmitter is turned on and bound to your receiver</li>
                <li>Check that the receiver is connected to your flight controller</li>
                <li>Verify the correct receiver protocol is set in Betaflight</li>
                <li>Try unplugging and reconnecting your flight controller</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TransmitterCheckStep;
