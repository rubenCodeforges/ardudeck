/**
 * PresetSelectionStep
 *
 * First step of the Quick Setup wizard.
 * Shows vehicle type selection first, then preset cards for the selected vehicle.
 */

import React from 'react';
import { useQuickSetupStore } from '../../../stores/quick-setup-store';
import { useNavigationStore } from '../../../stores/navigation-store';
import { useFirmwareStore } from '../../../stores/firmware-store';
import type { VehicleType } from '../../../stores/quick-setup-store';
import { QUICK_SETUP_PRESETS, type QuickSetupPreset } from '../presets/quick-setup-presets';
import { BOX_ID } from '../../modes/presets/mode-presets';
import {
  Rocket,
  Sparkles,
  ArrowLeft,
  Plane,
  Cpu,
  AlertTriangle,
  Loader2,
  XCircle,
  RefreshCw,
  Wifi,
  RotateCcw,
  Info,
  Download,
  Plane as PlaneIcon,
} from 'lucide-react';

// iNav-only modes that don't exist in Betaflight
const INAV_ONLY_MODES = [
  BOX_ID.NAV_LAUNCH,
  BOX_ID.NAV_RTH,
  BOX_ID.NAV_POSHOLD,
  BOX_ID.NAV_WP,
  BOX_ID.NAV_CRUISE,
  BOX_ID.NAV_ALTHOLD,
  BOX_ID.NAV_COURSE_HOLD,
  BOX_ID.GCS_NAV,
];

/**
 * Check if a preset uses any iNav-only modes
 */
function usesInavOnlyModes(preset: QuickSetupPreset): boolean {
  return preset.modes.some((mode) => (INAV_ONLY_MODES as readonly number[]).includes(mode.boxId));
}

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
  needsPlatformChange?: boolean;
}

const PresetCard: React.FC<PresetCardProps> = ({ preset, onSelect, needsPlatformChange }) => {
  return (
    <button
      onClick={onSelect}
      className={`w-full p-5 rounded-xl border bg-gradient-to-br ${preset.gradient} hover:scale-[1.02] transition-transform text-left`}
    >
      <div className="flex items-start gap-4">
        {/* Large icon */}
        <div className="w-10 h-10 flex items-center justify-center"><preset.icon className="w-8 h-8 text-zinc-300" /></div>

        {/* Content */}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-zinc-100">{preset.name}</h3>
            {needsPlatformChange && (
              <span className="flex items-center gap-1 px-2 py-0.5 text-xs bg-amber-500/20 rounded-full text-amber-300">
                <AlertTriangle className="w-3 h-3" />
                Platform change
              </span>
            )}
          </div>
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
  const {
    selectVehicle,
    selectPreset,
    nextStep,
    boardType,
    fcVariant,
    selectedVehicle,
    currentPlatformName,
    platformMismatch,
    platformChangeState,
    platformChangeError,
    changePlatform,
    dismissPlatformMismatch,
    selectedPreset,
    closeWizard,
  } = useQuickSetupStore();

  const { setView } = useNavigationStore();
  const { setSelectedSource } = useFirmwareStore();

  // Check if running Betaflight (not iNav)
  const isBetaflight = fcVariant === 'BTFL';

  // Navigate to firmware flash with iNav preselected
  const handleFlashInav = () => {
    closeWizard();
    setSelectedSource('inav');
    setView('firmware');
  };

  const handleSelectVehicle = (vehicle: VehicleType) => {
    selectVehicle(vehicle);
  };

  const handleSelectPreset = (presetId: string) => {
    selectPreset(presetId);
    // Only proceed if no platform mismatch (mismatch is handled by showing dialog)
    const state = useQuickSetupStore.getState();
    if (!state.platformMismatch) {
      nextStep();
    }
  };

  const handleBackToVehicle = () => {
    selectVehicle(null);
  };

  const handleCancelMismatch = () => {
    dismissPlatformMismatch();
  };

  const handleChangePlatform = async () => {
    await changePlatform();
    // After successful platform change and reconnect, proceed to next step
    const state = useQuickSetupStore.getState();
    if (!state.platformMismatch && state.selectedPreset) {
      nextStep();
    }
  };

  // Get presets by category, filtering for Betaflight compatibility
  const multirotorPresets = Object.values(QUICK_SETUP_PRESETS).filter((p) => {
    if (p.category !== 'multirotor') return false;
    // For Betaflight: filter out presets that use iNav-only navigation modes
    if (isBetaflight && usesInavOnlyModes(p)) return false;
    return true;
  });

  // Betaflight fixed-wing support is experimental and doesn't have navigation modes
  // Only show fixed-wing presets for iNav
  const fixedWingPresets = isBetaflight
    ? [] // No fixed-wing presets for Betaflight
    : Object.values(QUICK_SETUP_PRESETS).filter((p) => p.category === 'fixed_wing');

  // ============================================================================
  // Render: Platform Mismatch Dialog
  // ============================================================================

  if (platformMismatch) {
    const isPlatformChanging = platformChangeState !== 'idle' && platformChangeState !== 'error';

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 bg-amber-500/20">
            {platformChangeState === 'disconnected' ? (
              <Wifi className="w-8 h-8 text-amber-400" />
            ) : platformChangeState === 'rebooting' ? (
              <RotateCcw className="w-8 h-8 text-amber-400 animate-spin" />
            ) : platformChangeState === 'error' ? (
              <XCircle className="w-8 h-8 text-red-400" />
            ) : isPlatformChanging ? (
              <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
            ) : (
              <AlertTriangle className="w-8 h-8 text-amber-400" />
            )}
          </div>
          <h2 className="text-xl font-semibold text-zinc-100">
            {platformChangeState === 'error'
              ? 'Platform Change Failed'
              : platformChangeState === 'disconnected'
              ? 'Reconnecting...'
              : platformChangeState === 'rebooting'
              ? 'Rebooting Flight Controller...'
              : platformChangeState === 'saving'
              ? 'Saving Configuration...'
              : platformChangeState === 'changing'
              ? 'Changing Platform...'
              : 'Platform Change Required'}
          </h2>
          <p className="text-sm text-zinc-400 mt-2 max-w-md mx-auto">
            {platformChangeState === 'error'
              ? platformChangeError || 'An error occurred while changing the platform.'
              : platformChangeState === 'disconnected'
              ? 'Board is rebooting. Attempting to reconnect automatically...'
              : platformChangeState === 'rebooting'
              ? 'Waiting for the flight controller to reboot...'
              : isPlatformChanging
              ? 'Please wait while the platform type is being changed...'
              : `"${selectedPreset?.name}" requires ${platformMismatch.requiredName} platform, but your board is set to ${platformMismatch.currentName}.`}
          </p>
        </div>

        {/* Platform comparison */}
        {platformChangeState === 'idle' && (
          <div className="p-4 bg-zinc-800/50 rounded-xl">
            <div className="flex items-center justify-center gap-8">
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-zinc-700/50 flex items-center justify-center mx-auto mb-2">
                  <Plane className="w-6 h-6 text-zinc-400" />
                </div>
                <p className="text-xs text-zinc-500">Current</p>
                <p className="text-sm font-medium text-zinc-300">{platformMismatch.currentName}</p>
              </div>
              <div className="text-2xl text-zinc-600">→</div>
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto mb-2">
                  <Plane className="w-6 h-6 text-amber-400" />
                </div>
                <p className="text-xs text-zinc-500">Required</p>
                <p className="text-sm font-medium text-amber-300">{platformMismatch.requiredName}</p>
              </div>
            </div>
          </div>
        )}

        {/* Progress indicator during platform change */}
        {isPlatformChanging && (
          <div className="p-4 bg-zinc-800/50 rounded-xl">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
              <span className="text-sm text-zinc-300">
                {platformChangeState === 'changing' && 'Setting platform type...'}
                {platformChangeState === 'saving' && 'Saving to EEPROM...'}
                {platformChangeState === 'rebooting' && 'Rebooting flight controller...'}
                {platformChangeState === 'disconnected' && 'Waiting for reconnection...'}
              </span>
            </div>
          </div>
        )}

        {/* Error state */}
        {platformChangeState === 'error' && platformChangeError && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
            <div className="flex items-start gap-3">
              <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-red-200 text-sm">Error Details</h4>
                <p className="text-xs text-red-100/70 mt-1">{platformChangeError}</p>
              </div>
            </div>
          </div>
        )}

        {/* Info box */}
        {platformChangeState === 'idle' && (
          <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-medium text-blue-200 text-sm">What happens when you change platform?</h4>
                <ul className="text-xs text-blue-100/70 mt-1 space-y-1 list-disc list-inside">
                  <li>The platform type will be changed on your flight controller</li>
                  <li>Configuration will be saved to EEPROM</li>
                  <li>The board will reboot automatically</li>
                  <li>We'll reconnect and continue the setup wizard</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-zinc-700">
          {platformChangeState === 'error' ? (
            <>
              <button
                onClick={handleCancelMismatch}
                className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Cancel
              </button>
              <button
                onClick={handleChangePlatform}
                className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-500 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Retry
              </button>
            </>
          ) : isPlatformChanging ? (
            <>
              <div /> {/* Spacer */}
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Please wait...
              </div>
            </>
          ) : (
            <>
              <button
                onClick={handleCancelMismatch}
                className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Choose Different Preset
              </button>
              <button
                onClick={handleChangePlatform}
                className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-500 transition-colors"
              >
                <Plane className="w-4 h-4" />
                Change Platform
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

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

        {/* Board type and platform indicator */}
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs">
          {boardType && (
            <div className="flex items-center gap-2 text-zinc-500">
              <div
                className={`w-2 h-2 rounded-full ${boardType === 'msp' ? 'bg-green-500' : 'bg-amber-500'}`}
              />
              <span>
                {boardType === 'msp' ? 'MSP Configuration' : 'CLI Configuration (Legacy)'}
              </span>
            </div>
          )}
          {currentPlatformName && (
            <div className="flex items-center gap-2 px-2 py-1 bg-zinc-800 rounded-full text-zinc-400">
              <Plane className="w-3 h-3" />
              <span>Current: {currentPlatformName}</span>
            </div>
          )}
        </div>

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

          {isBetaflight ? (
            // Betaflight fixed-wing warning
            <div className="w-full p-6 rounded-xl border border-zinc-700 bg-zinc-800/50">
              <div className="flex items-center gap-5">
                <div className="text-5xl opacity-50">
                  <Plane className="w-12 h-12 text-zinc-500" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-semibold text-zinc-400">Fixed Wing</h3>
                    <span className="px-2 py-0.5 text-xs bg-amber-500/20 rounded-full text-amber-300">
                      iNav Recommended
                    </span>
                  </div>
                  <p className="text-sm text-zinc-500 mt-1">
                    Betaflight's fixed-wing support is experimental and lacks navigation features.
                  </p>
                  <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                    <div className="flex items-start gap-2">
                      <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-xs text-amber-200/80">
                          For airplanes, flying wings, and gliders, we recommend{' '}
                          <strong className="text-amber-300">iNav firmware</strong> which provides
                          full navigation, auto-launch, waypoints, and return-to-home.
                        </p>
                        <button
                          onClick={handleFlashInav}
                          className="mt-2 px-3 py-1.5 text-xs font-medium bg-amber-600 hover:bg-amber-500 text-white rounded-lg flex items-center gap-1.5 transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Flash iNav Firmware
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <VehicleCard
              type="fixed_wing"
              icon={<Plane className="w-12 h-12 text-amber-400" />}
              title="Fixed Wing"
              description="Airplanes, flying wings, gliders, and other fixed-wing aircraft"
              presetCount={fixedWingPresets.length}
              gradient="from-amber-500/10 to-orange-500/10 border-amber-500/30 hover:border-amber-400/50"
              onSelect={() => handleSelectVehicle('fixed_wing')}
            />
          )}
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
              {isBetaflight && (
                <p className="text-xs text-amber-200/70 mt-2">
                  <strong>Note:</strong> Navigation presets (GPS position hold, waypoints, RTH) are
                  only available for iNav. Configure GPS Rescue separately in the GPS Rescue tab.
                </p>
              )}
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
  const VehicleIcon = selectedVehicle === 'multirotor' ? RotateCcw : PlaneIcon;

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
          <VehicleIcon className="w-8 h-8 text-zinc-300" />
        </div>
        <h2 className="text-xl font-semibold text-zinc-100">{vehicleTitle} Presets</h2>
        <p className="text-sm text-zinc-400 mt-2 max-w-md mx-auto">
          Select a preset to configure <strong>everything at once</strong>: PIDs, rates, flight
          modes, and failsafe settings.
        </p>
      </div>

      {/* Board type and platform indicator */}
      <div className="flex flex-wrap items-center justify-center gap-4 text-xs">
        {boardType && (
          <div className="flex items-center gap-2 text-zinc-500">
            <div
              className={`w-2 h-2 rounded-full ${boardType === 'msp' ? 'bg-green-500' : 'bg-amber-500'}`}
            />
            <span>
              {boardType === 'msp' ? 'MSP Configuration' : 'CLI Configuration (Legacy)'}
            </span>
          </div>
        )}
        {currentPlatformName && (
          <div className="flex items-center gap-2 px-2 py-1 bg-zinc-800 rounded-full text-zinc-400">
            <Plane className="w-3 h-3" />
            <span>Current: {currentPlatformName}</span>
          </div>
        )}
      </div>

      {/* Preset Cards */}
      <div className="grid gap-3">
        {presets.map((preset) => {
          const { currentPlatform } = useQuickSetupStore.getState();
          const needsPlatformChange =
            currentPlatform !== null && preset.aircraft.platformType !== currentPlatform;

          return (
            <PresetCard
              key={preset.id}
              preset={preset}
              onSelect={() => handleSelectPreset(preset.id)}
              needsPlatformChange={needsPlatformChange}
            />
          );
        })}
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

      {/* Betaflight GPS Rescue note */}
      {isBetaflight && selectedVehicle === 'multirotor' && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-amber-200 text-sm">GPS Return Home</h4>
              <p className="text-xs text-amber-100/70 mt-1">
                Betaflight uses <strong>GPS Rescue</strong> instead of iNav's navigation modes.
                After applying a preset, configure GPS Rescue in the <strong>GPS Rescue tab</strong>{' '}
                for emergency return-to-home functionality.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PresetSelectionStep;
