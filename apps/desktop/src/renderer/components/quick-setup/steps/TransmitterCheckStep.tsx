/**
 * TransmitterCheckStep
 *
 * RC transmitter check step - verifies that the transmitter is connected
 * and channels are being received before applying configuration.
 */

import React, { useEffect } from 'react';
import { useQuickSetupStore } from '../../../stores/quick-setup-store';
import { Radio, CheckCircle2, AlertTriangle, ArrowLeft, ArrowRight } from 'lucide-react';

// Channel bar component
const ChannelBar: React.FC<{
  channelIndex: number;
  value: number;
  detected: boolean;
}> = ({ channelIndex, value, detected }) => {
  // Calculate position as percentage (900-2100 range)
  const percent = Math.min(100, Math.max(0, ((value - 900) / 1200) * 100));

  // Determine channel name
  const channelNames = ['Roll', 'Pitch', 'Throttle', 'Yaw', 'AUX1', 'AUX2', 'AUX3', 'AUX4'];
  const channelName = channelNames[channelIndex] || `CH${channelIndex + 1}`;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className={detected ? 'text-green-400' : 'text-zinc-400'}>
          {channelName}
        </span>
        <span className="text-zinc-500 font-mono">{value}</span>
      </div>
      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden relative">
        {/* Center marker */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-zinc-600" />

        {/* Value indicator */}
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

export const TransmitterCheckStep: React.FC = () => {
  const {
    rcChannels,
    isPollingRc,
    startRcPolling,
    stopRcPolling,
    transmitterConfirmed,
    setTransmitterConfirmed,
    channelsDetected,
    nextStep,
    prevStep,
    selectedPreset,
  } = useQuickSetupStore();

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

  const detectedCount = channelsDetected.filter(Boolean).length;
  const allDetected = detectedCount >= 4;

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
          {allDetected ? 'Transmitter Connected!' : 'Checking Transmitter'}
        </h2>
        <p className="text-sm text-zinc-400 mt-2 max-w-md mx-auto">
          {allDetected
            ? 'Your transmitter is working. You can proceed to review your configuration.'
            : 'Move your sticks and flip some switches to verify your transmitter is connected.'}
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
                : 'Move your sticks to detect remaining channels'}
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

        <div className="grid grid-cols-2 gap-4">
          {rcChannels.slice(0, 8).map((value, index) => (
            <ChannelBar
              key={index}
              channelIndex={index}
              value={value}
              detected={channelsDetected[index] ?? false}
            />
          ))}
        </div>
      </div>

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
