/**
 * PlaneTypeStep
 *
 * Step 1: Select aircraft type from visual cards.
 */

import { AircraftPreset, getPresetsByCategory } from '../presets/servo-presets';
import { useServoWizardStore } from '../../../stores/servo-wizard-store';

// Compact card - moved outside to prevent re-creation on every render
function PresetCard({
  preset,
  isSelected,
  onSelect,
}: {
  preset: AircraftPreset;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onSelect(preset.id)}
      className={`p-3 rounded-lg border-2 transition-all text-left ${
        isSelected
          ? 'border-blue-500 bg-blue-500/20'
          : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600 hover:bg-zinc-800'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-2xl">{preset.icon}</span>
        <div>
          <div className="text-sm font-medium text-white">{preset.name}</div>
          <div className="text-xs text-zinc-500">{preset.servoCount} servo{preset.servoCount !== 1 ? 's' : ''}</div>
        </div>
      </div>
    </button>
  );
}

export default function PlaneTypeStep() {
  const { selectedPresetId, selectAircraftType, nextStep, isMultirotor } = useServoWizardStore();

  const fixedWingPresets = getPresetsByCategory('fixed_wing');
  const multirotorPresets = getPresetsByCategory('multirotor');
  const otherPresets = getPresetsByCategory('other');

  // For multirotors (quad/hex), only show gimbal option
  if (isMultirotor) {
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="text-center">
          <h2 className="text-lg font-bold text-white">Gimbal Servo Setup</h2>
          <p className="text-sm text-zinc-400 mt-1">
            Your board is configured as a multirotor. You can set up gimbal servos for camera control.
          </p>
        </div>

        {/* Gimbal option only */}
        <div className="flex justify-center">
          {otherPresets.map((preset) => (
            <PresetCard
              key={preset.id}
              preset={preset}
              isSelected={selectedPresetId === preset.id}
              onSelect={selectAircraftType}
            />
          ))}
        </div>

        {/* Help tip + Continue button */}
        <div className="flex items-center justify-between gap-4 pt-2">
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg px-3 py-2 flex items-center gap-2 flex-1">
            <span className="text-lg">💡</span>
            <p className="text-xs text-zinc-400">
              Gimbal uses RC stick input to control pan/tilt servos for camera stabilization.
            </p>
          </div>
          <button
            onClick={() => selectedPresetId && nextStep()}
            disabled={!selectedPresetId}
            className={`px-6 py-2.5 rounded-lg font-medium transition-all whitespace-nowrap ${
              selectedPresetId
                ? 'bg-blue-500 text-white hover:bg-blue-400'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
            }`}
          >
            Continue →
          </button>
        </div>
      </div>
    );
  }

  const handleContinue = () => {
    if (selectedPresetId) {
      nextStep();
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-lg font-bold text-white">What type of aircraft do you have?</h2>
        <p className="text-sm text-zinc-400 mt-1">Select your aircraft type for the correct servo setup.</p>
      </div>

      {/* All categories in a compact grid */}
      <div className="grid grid-cols-4 gap-2">
        {/* Fixed wing */}
        {fixedWingPresets.map((preset) => (
          <PresetCard
            key={preset.id}
            preset={preset}
            isSelected={selectedPresetId === preset.id}
            onSelect={selectAircraftType}
          />
        ))}
      </div>

      <div className="grid grid-cols-4 gap-2">
        {/* Multirotor + Other */}
        {multirotorPresets.map((preset) => (
          <PresetCard
            key={preset.id}
            preset={preset}
            isSelected={selectedPresetId === preset.id}
            onSelect={selectAircraftType}
          />
        ))}
        {/* Quad/Hex placeholder */}
        <div className="p-3 rounded-lg border-2 border-zinc-800 bg-zinc-900/50 opacity-40">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🚁</span>
            <div>
              <div className="text-sm font-medium text-zinc-500">Quad/Hex</div>
              <div className="text-xs text-zinc-600">No servos</div>
            </div>
          </div>
        </div>
        {/* Other presets */}
        {otherPresets.map((preset) => (
          <PresetCard
            key={preset.id}
            preset={preset}
            isSelected={selectedPresetId === preset.id}
            onSelect={selectAircraftType}
          />
        ))}
      </div>

      {/* Help tip + Continue button in same row */}
      <div className="flex items-center justify-between gap-4 pt-2">
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg px-3 py-2 flex items-center gap-2 flex-1">
          <span className="text-lg">💡</span>
          <p className="text-xs text-zinc-400">
            <strong className="text-zinc-300">Quad with camera?</strong> Select Gimbal.
            <strong className="text-zinc-300 ml-2">Plane?</strong> Most are Traditional.
          </p>
        </div>
        <button
          onClick={handleContinue}
          disabled={!selectedPresetId}
          className={`px-6 py-2.5 rounded-lg font-medium transition-all whitespace-nowrap ${
            selectedPresetId
              ? 'bg-blue-500 text-white hover:bg-blue-400'
              : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
          }`}
        >
          Continue →
        </button>
      </div>
    </div>
  );
}
