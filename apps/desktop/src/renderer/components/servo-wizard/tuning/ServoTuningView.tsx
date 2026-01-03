/**
 * ServoTuningView
 *
 * Visual split-panel view for fine-tuning servos after initial wizard setup.
 * Left: Aircraft diagram with animated control surfaces
 * Right: Servo tuning cards with live position and draggable endpoints
 */

import { useState, useEffect } from 'react';
import { useServoWizardStore } from '../../../stores/servo-wizard-store';
import { ControlSurface, CONTROL_SURFACE_INFO } from '../presets/servo-presets';
import AircraftDiagram from '../diagrams/AircraftDiagram';
import ServoTuningCard, { SERVO_COLORS } from './ServoTuningCard';

interface Props {
  onSwitchToWizard: () => void;
}

export default function ServoTuningView({ onSwitchToWizard }: Props) {
  const {
    selectedPresetId,
    selectedPreset,
    assignments,
    servoValues,
    isPollingServos,
    isSaving,
    saveError,
    updateAssignment,
    reverseServo,
    startServoPolling,
    stopServoPolling,
    saveToFC,
  } = useServoWizardStore();

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Start polling when view mounts
  useEffect(() => {
    startServoPolling();
    return () => stopServoPolling();
  }, [startServoPolling, stopServoPolling]);

  // Clear save success message after 3 seconds
  useEffect(() => {
    if (saveSuccess) {
      const timer = setTimeout(() => setSaveSuccess(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [saveSuccess]);

  // Handle save
  const handleSave = async () => {
    try {
      await saveToFC();
      setSaveSuccess(true);
    } catch (err) {
      // Error is already handled in the store
    }
  };

  // Handle endpoint update for a servo
  const handleUpdateEndpoints = (index: number) => (endpoints: { min: number; center: number; max: number }) => {
    updateAssignment(index, endpoints);
  };

  // Handle test position (move servo to min/center/max)
  const handleTestPosition = (index: number) => (position: 'min' | 'center' | 'max') => {
    const assignment = assignments[index];
    // TODO: Implement servo override command
    // For now, log what we would send
    const value = position === 'min' ? assignment.min : position === 'max' ? assignment.max : assignment.center;
    console.log(`[ServoTuning] Test servo ${assignment.servoIndex} to ${position}: ${value}µs`);
  };

  // Generate servo labels for the diagram
  const servoLabels: Record<ControlSurface, string> = {};
  assignments.forEach((a, i) => {
    servoLabels[a.surface] = `S${a.servoIndex}`;
  });

  // Calculate deflection values for live animation (-1 to +1)
  const surfaceDeflections: Partial<Record<ControlSurface, number>> = {};
  assignments.forEach((a) => {
    const value = servoValues[a.servoIndex] || 1500;
    const { min, center, max } = a;

    // Calculate normalized deflection
    let deflection = 0;
    if (value > center) {
      deflection = (value - center) / (max - center);
    } else if (value < center) {
      deflection = (value - center) / (center - min);
    }

    // Clamp to -1 to 1
    surfaceDeflections[a.surface] = Math.max(-1, Math.min(1, deflection));
  });

  // Get the selected surface for highlighting on diagram
  const selectedSurface = assignments[selectedIndex]?.surface;

  // No assignments yet - prompt to run wizard
  if (!selectedPresetId || assignments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 p-8 text-center">
        <div className="text-6xl">⚙️</div>
        <div>
          <h2 className="text-xl font-bold text-white mb-2">No Servo Configuration</h2>
          <p className="text-zinc-400">Run the setup wizard first to configure your servos.</p>
        </div>
        <button
          onClick={onSwitchToWizard}
          className="px-6 py-3 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-400 transition-colors"
        >
          Open Setup Wizard
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/50">
        <div className="flex items-center gap-3">
          <span className="text-xl">{selectedPreset?.icon}</span>
          <div>
            <h2 className="text-lg font-bold text-white">Servo Tuning</h2>
            <p className="text-xs text-zinc-500">{selectedPreset?.name} - {assignments.length} servos</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Polling indicator */}
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <div className={`w-2 h-2 rounded-full ${isPollingServos ? 'bg-green-500 animate-pulse' : 'bg-zinc-600'}`} />
            Live
          </div>

          {/* Switch to wizard button */}
          <button
            onClick={onSwitchToWizard}
            className="px-3 py-1.5 text-xs bg-zinc-800 text-zinc-400 rounded-lg hover:bg-zinc-700 transition-colors border border-zinc-700"
          >
            Wizard
          </button>
        </div>
      </div>

      {/* Split panel content */}
      <div className="flex-1 flex gap-4 p-4 overflow-hidden">
        {/* Left: Aircraft diagram */}
        <div className="w-1/3 flex flex-col">
          <div className="flex-1 flex items-center justify-center bg-zinc-900/30 rounded-xl border border-zinc-800/50 p-4">
            <AircraftDiagram
              presetId={selectedPresetId}
              highlightSurface={selectedSurface}
              onSurfaceClick={(surface) => {
                const idx = assignments.findIndex((a) => a.surface === surface);
                if (idx !== -1) setSelectedIndex(idx);
              }}
              servoLabels={servoLabels}
              surfaceDeflections={surfaceDeflections}
            />
          </div>

          {/* Legend */}
          <div className="mt-3 px-2">
            <div className="text-xs text-zinc-500 mb-2">Click surface to select</div>
            <div className="flex flex-wrap gap-2">
              {assignments.map((a, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedIndex(i)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-all ${
                    i === selectedIndex
                      ? 'bg-zinc-700 text-white'
                      : 'bg-zinc-800/50 text-zinc-500 hover:bg-zinc-800'
                  }`}
                >
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: SERVO_COLORS[i % SERVO_COLORS.length] }}
                  />
                  {CONTROL_SURFACE_INFO[a.surface].shortName}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Servo cards */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-3 pr-2">
            {assignments.map((assignment, index) => (
              <ServoTuningCard
                key={`${assignment.surface}-${index}`}
                assignment={assignment}
                index={index}
                currentValue={servoValues[assignment.servoIndex] || 1500}
                isSelected={index === selectedIndex}
                onSelect={() => setSelectedIndex(index)}
                onUpdateEndpoints={handleUpdateEndpoints(index)}
                onReverse={() => reverseServo(index)}
                onTestPosition={handleTestPosition(index)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Footer with save button */}
      <div className="px-4 py-3 border-t border-zinc-800/50">
        <div className="flex items-center justify-between">
          {/* Status messages */}
          <div className="text-sm">
            {saveError && (
              <span className="text-red-400">
                Failed to save: {saveError}
              </span>
            )}
            {saveSuccess && (
              <span className="text-green-400">
                Saved to flight controller
              </span>
            )}
          </div>

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={`px-6 py-2.5 rounded-xl font-medium transition-all flex items-center gap-2 ${
              isSaving
                ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
                : 'bg-blue-500 text-white hover:bg-blue-400'
            }`}
          >
            {isSaving ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Saving...
              </>
            ) : (
              <>
                💾 Save to FC
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
