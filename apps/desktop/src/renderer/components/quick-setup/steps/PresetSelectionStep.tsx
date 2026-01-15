/**
 * PresetSelectionStep
 *
 * First step of the Quick Setup wizard.
 * Shows vehicle type selection first, then preset cards for the selected vehicle.
 */

import React from 'react';
import { useQuickSetupStore } from '../../../stores/quick-setup-store';
import type { VehicleType } from '../../../stores/quick-setup-store';
import { QUICK_SETUP_PRESETS, type QuickSetupPreset } from '../presets/quick-setup-presets';
import { Rocket, Sparkles, ArrowLeft, Plane, Cpu } from 'lucide-react';

// ============================================================================
// Vehicle Type Card
// ============================================================================

interface VehicleCardProps {
  type: VehicleType;
  icon: React.ReactNode;
  title: string;
  description: string;
  presetCount: number;
  gradient: string;
  onSelect: () => void;
}

const VehicleCard: React.FC<VehicleCardProps> = ({
  icon,
  title,
  description,
  presetCount,
  gradient,
  onSelect,
}) => {
  return (
    <button
      onClick={onSelect}
      className={`w-full p-6 rounded-xl border bg-gradient-to-br ${gradient} hover:scale-[1.02] transition-transform text-left`}
    >
      <div className="flex items-center gap-5">
        {/* Icon */}
        <div className="text-5xl">{icon}</div>

        {/* Content */}
        <div className="flex-1">
          <h3 className="text-xl font-semibold text-zinc-100">{title}</h3>
          <p className="text-sm text-zinc-400 mt-1">{description}</p>
          <div className="mt-3">
            <span className="px-2.5 py-1 text-xs bg-white/10 rounded-full text-zinc-300">
              {presetCount} presets available
            </span>
          </div>
        </div>

        {/* Arrow */}
        <svg
          className="w-6 h-6 text-zinc-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
      </div>
    </button>
  );
};

// ============================================================================
// Preset Card
// ============================================================================

interface PresetCardProps {
  preset: QuickSetupPreset;
  onSelect: () => void;
}

const PresetCard: React.FC<PresetCardProps> = ({ preset, onSelect }) => {
  return (
    <button
      onClick={onSelect}
      className={`w-full p-5 rounded-xl border bg-gradient-to-br ${preset.gradient} hover:scale-[1.02] transition-transform text-left`}
    >
      <div className="flex items-start gap-4">
        {/* Large icon */}
        <div className="text-4xl">{preset.icon}</div>

        {/* Content */}
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-zinc-100">{preset.name}</h3>
          <p className="text-sm text-zinc-400 mt-1">{preset.description}</p>

          {/* What it configures */}
          <div className="flex flex-wrap gap-1.5 mt-3">
            <span className="px-2 py-0.5 text-xs bg-blue-500/20 rounded-full text-blue-300">
              PIDs
            </span>
            <span className="px-2 py-0.5 text-xs bg-purple-500/20 rounded-full text-purple-300">
              Rates
            </span>
            <span className="px-2 py-0.5 text-xs bg-green-500/20 rounded-full text-green-300">
              {preset.modes.length} Modes
            </span>
            <span className="px-2 py-0.5 text-xs bg-orange-500/20 rounded-full text-orange-300">
              Failsafe
            </span>
          </div>
        </div>

        {/* Arrow */}
        <svg
          className="w-5 h-5 text-zinc-400 mt-1"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
      </div>

      {/* Tip */}
      <div className="mt-4 pt-3 border-t border-white/10">
        <p className="text-xs text-zinc-500 italic">{preset.tip}</p>
      </div>
    </button>
  );
};

// ============================================================================
// Main Component
// ============================================================================

export const PresetSelectionStep: React.FC = () => {
  const { selectVehicle, selectPreset, nextStep, boardType, selectedVehicle } =
    useQuickSetupStore();

  const handleSelectVehicle = (vehicle: VehicleType) => {
    selectVehicle(vehicle);
  };

  const handleSelectPreset = (presetId: string) => {
    selectPreset(presetId);
    nextStep();
  };

  const handleBackToVehicle = () => {
    selectVehicle(null);
  };

  // Get presets by category
  const multirotorPresets = Object.values(QUICK_SETUP_PRESETS).filter(
    (p) => p.category === 'multirotor'
  );
  const fixedWingPresets = Object.values(QUICK_SETUP_PRESETS).filter(
    (p) => p.category === 'fixed_wing'
  );

  // ============================================================================
  // Render: Vehicle Type Selection
  // ============================================================================

  if (!selectedVehicle) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 mb-4">
            <Rocket className="w-8 h-8 text-blue-400" />
          </div>
          <h2 className="text-xl font-semibold text-zinc-100">Quick Setup</h2>
          <p className="text-sm text-zinc-400 mt-2 max-w-md mx-auto">
            Select your vehicle type to see available presets
          </p>
        </div>

        {/* Board type indicator */}
        {boardType && (
          <div className="flex items-center justify-center gap-2 text-xs text-zinc-500">
            <div
              className={`w-2 h-2 rounded-full ${boardType === 'msp' ? 'bg-green-500' : 'bg-amber-500'}`}
            />
            <span>
              {boardType === 'msp' ? 'MSP Configuration' : 'CLI Configuration (Legacy Board)'}
            </span>
          </div>
        )}

        {/* Vehicle Type Cards */}
        <div className="space-y-4">
          <VehicleCard
            type="multirotor"
            icon={<Cpu className="w-12 h-12 text-cyan-400" />}
            title="Multirotor"
            description="Quadcopters, hexacopters, and other multi-motor aircraft"
            presetCount={multirotorPresets.length}
            gradient="from-cyan-500/10 to-blue-500/10 border-cyan-500/30 hover:border-cyan-400/50"
            onSelect={() => handleSelectVehicle('multirotor')}
          />

          <VehicleCard
            type="fixed_wing"
            icon={<Plane className="w-12 h-12 text-amber-400" />}
            title="Fixed Wing"
            description="Airplanes, flying wings, gliders, and other fixed-wing aircraft"
            presetCount={fixedWingPresets.length}
            gradient="from-amber-500/10 to-orange-500/10 border-amber-500/30 hover:border-amber-400/50"
            onSelect={() => handleSelectVehicle('fixed_wing')}
          />
        </div>

        {/* Info box */}
        <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-blue-200 text-sm">One-Click Configuration</h4>
              <p className="text-xs text-blue-100/70 mt-1">
                Each preset applies a complete, tested configuration including PIDs, rates, flight
                modes, and failsafe settings. You can always fine-tune later.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // Render: Preset Selection for Selected Vehicle
  // ============================================================================

  const presets = selectedVehicle === 'multirotor' ? multirotorPresets : fixedWingPresets;
  const vehicleTitle = selectedVehicle === 'multirotor' ? 'Multirotor' : 'Fixed Wing';
  const vehicleIcon = selectedVehicle === 'multirotor' ? '🚁' : '✈️';

  return (
    <div className="space-y-6">
      {/* Header with back button */}
      <div className="text-center">
        <button
          onClick={handleBackToVehicle}
          className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Change vehicle type
        </button>
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 mb-4">
          <span className="text-3xl">{vehicleIcon}</span>
        </div>
        <h2 className="text-xl font-semibold text-zinc-100">{vehicleTitle} Presets</h2>
        <p className="text-sm text-zinc-400 mt-2 max-w-md mx-auto">
          Select a preset to configure <strong>everything at once</strong>: PIDs, rates, flight
          modes, and failsafe settings.
        </p>
      </div>

      {/* Board type indicator */}
      {boardType && (
        <div className="flex items-center justify-center gap-2 text-xs text-zinc-500">
          <div
            className={`w-2 h-2 rounded-full ${boardType === 'msp' ? 'bg-green-500' : 'bg-amber-500'}`}
          />
          <span>
            {boardType === 'msp' ? 'MSP Configuration' : 'CLI Configuration (Legacy Board)'}
          </span>
        </div>
      )}

      {/* Preset Cards */}
      <div className="grid gap-3">
        {presets.map((preset) => (
          <PresetCard
            key={preset.id}
            preset={preset}
            onSelect={() => handleSelectPreset(preset.id)}
          />
        ))}
      </div>

      {/* Info box */}
      <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-blue-200 text-sm">One-Click Configuration</h4>
            <p className="text-xs text-blue-100/70 mt-1">
              These presets apply a complete, tested configuration. You can always fine-tune
              individual settings later in the dedicated tabs.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PresetSelectionStep;
