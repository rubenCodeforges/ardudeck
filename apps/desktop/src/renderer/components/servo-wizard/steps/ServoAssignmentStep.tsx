/**
 * ServoAssignmentStep
 *
 * Step 2: Assign servos to control surfaces with visual diagram.
 */

import { useState } from 'react';
import { useServoWizardStore } from '../../../stores/servo-wizard-store';
import { CONTROL_SURFACE_INFO, ControlSurface } from '../presets/servo-presets';
import AircraftDiagram from '../diagrams/AircraftDiagram';
import { AlertTriangle } from 'lucide-react';

export default function ServoAssignmentStep() {
  const {
    selectedPresetId,
    selectedPreset,
    assignments,
    updateAssignment,
    nextStep,
    prevStep,
  } = useServoWizardStore();

  const [highlightedSurface, setHighlightedSurface] = useState<ControlSurface | null>(null);

  if (!selectedPreset || !selectedPresetId) {
    return <div className="text-zinc-400">No aircraft type selected</div>;
  }

  // Build servo labels for the diagram
  const servoLabels: Record<ControlSurface, string> = {} as Record<ControlSurface, string>;
  assignments.forEach((a) => {
    servoLabels[a.surface] = `S${a.servoIndex}`;
  });

  // Get available servo indices (0-8)
  const availableServos = Array.from({ length: 9 }, (_, i) => i);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-xl font-bold text-white">Assign Servos to Control Surfaces</h2>
        <p className="text-sm text-zinc-400 mt-2">
          Match each control surface to the servo output it's connected to on your flight controller.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-8">
        {/* Diagram */}
        <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 p-6">
          <AircraftDiagram
            presetId={selectedPresetId}
            highlightSurface={highlightedSurface}
            onSurfaceClick={(surface) => setHighlightedSurface(surface)}
            servoLabels={servoLabels}
          />
          <p className="text-xs text-zinc-500 text-center mt-4">
            Click a control surface to highlight it
          </p>
        </div>

        {/* Assignment table */}
        <div className="space-y-3">
          <div className="bg-zinc-800/30 rounded-lg p-3 mb-4">
            <p className="text-xs text-zinc-400">
              <strong className="text-zinc-300">Tip:</strong> Check your FC wiring. Servo outputs are usually labeled S1-S8 or SERVO1-8.
              S1 = Servo 0 in iNav.
            </p>
          </div>

          {assignments.map((assignment, index) => {
            const surfaceInfo = CONTROL_SURFACE_INFO[assignment.surface];
            const isHighlighted = highlightedSurface === assignment.surface;

            return (
              <div
                key={assignment.surface}
                className={`flex items-center gap-4 p-3 rounded-lg transition-all ${
                  isHighlighted
                    ? 'bg-blue-500/20 border border-blue-500/50'
                    : 'bg-zinc-800/50 border border-zinc-700/50'
                }`}
                onMouseEnter={() => setHighlightedSurface(assignment.surface)}
                onMouseLeave={() => setHighlightedSurface(null)}
              >
                {/* Surface name */}
                <div className="flex-1">
                  <div className="text-sm font-medium text-white">{surfaceInfo.name}</div>
                  <div className="text-xs text-zinc-500">{surfaceInfo.description}</div>
                </div>

                {/* Servo selector */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-400">Servo</span>
                  <select
                    value={assignment.servoIndex}
                    onChange={(e) =>
                      updateAssignment(index, { servoIndex: Number(e.target.value) })
                    }
                    className="w-20 px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
                  >
                    {availableServos.map((servo) => (
                      <option key={servo} value={servo}>
                        S{servo}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}

          {/* Warning if duplicate servos */}
          {hasDuplicateServos(assignments) && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-yellow-400">
                Warning: Multiple surfaces assigned to the same servo!
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={prevStep}
          className="px-6 py-2.5 rounded-lg font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
        >
          ← Back
        </button>
        <button
          onClick={nextStep}
          className="px-6 py-2.5 rounded-lg font-medium bg-blue-500 text-white hover:bg-blue-400"
        >
          Continue: Test Servos →
        </button>
      </div>
    </div>
  );
}

// Helper to check for duplicate servo assignments
function hasDuplicateServos(
  assignments: { servoIndex: number }[]
): boolean {
  const indices = assignments.map((a) => a.servoIndex);
  return new Set(indices).size !== indices.length;
}
