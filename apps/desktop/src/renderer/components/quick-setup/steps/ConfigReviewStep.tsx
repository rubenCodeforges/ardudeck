/**
 * ConfigReviewStep
 *
 * Review step showing a summary of all configuration that will be applied.
 * Allows user to see exactly what changes will be made before applying.
 */

import React from 'react';
import { useQuickSetupStore } from '../../../stores/quick-setup-store';
import {
  ArrowLeft,
  ArrowRight,
  SlidersHorizontal,
  Gauge,
  Gamepad2,
  Shield,
  Plane,
  CheckCircle2,
} from 'lucide-react';

// Section component for displaying configuration details
const ConfigSection: React.FC<{
  icon: React.ReactNode;
  title: string;
  items: string[];
  color: string;
}> = ({ icon, title, items, color }) => {
  return (
    <div className={`p-4 rounded-xl border bg-gradient-to-br ${color}`}>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 className="font-medium text-zinc-100">{title}</h3>
      </div>
      <ul className="space-y-1.5">
        {items.map((item, index) => (
          <li key={index} className="flex items-center gap-2 text-sm text-zinc-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export const ConfigReviewStep: React.FC = () => {
  const { selectedPreset, nextStep, prevStep, boardType } = useQuickSetupStore();

  if (!selectedPreset) {
    return (
      <div className="text-center py-8">
        <p className="text-zinc-400">No preset selected. Please go back and select a preset.</p>
      </div>
    );
  }

  // Generate summary items
  const pidItems = [
    `Roll: P=${selectedPreset.pids.roll.p} I=${selectedPreset.pids.roll.i} D=${selectedPreset.pids.roll.d}`,
    `Pitch: P=${selectedPreset.pids.pitch.p} I=${selectedPreset.pids.pitch.i} D=${selectedPreset.pids.pitch.d}`,
    `Yaw: P=${selectedPreset.pids.yaw.p} I=${selectedPreset.pids.yaw.i}`,
  ];

  const rateItems = [
    `RC Rate: ${selectedPreset.rates.rcRate}`,
    `Expo: ${selectedPreset.rates.rcExpo}%`,
    `Roll/Pitch Rate: ${selectedPreset.rates.rollRate}`,
    `Yaw Rate: ${selectedPreset.rates.yawRate}`,
  ];

  // Mode names lookup (iNav permanent box IDs)
  const modeNames: Record<number, string> = {
    0: 'ARM',
    1: 'ANGLE',
    2: 'HORIZON',
    3: 'NAV ALTHOLD',
    5: 'HEADING HOLD',
    10: 'NAV RTH',
    11: 'NAV POSHOLD',
    12: 'MANUAL',
    13: 'BEEPER',
    27: 'FAILSAFE',
    28: 'NAV WP',
    29: 'AIRMODE',
    30: 'HOME RESET',
    31: 'GCS NAV',
    35: 'TURN ASSIST',
    36: 'NAV LAUNCH',
    45: 'NAV CRUISE',
    51: 'PREARM',
    52: 'TURTLE',
    53: 'COURSE HOLD',
  };

  const modeItems = selectedPreset.modes.map((mode) => {
    const name = modeNames[mode.boxId] || `Mode ${mode.boxId}`;
    const channel = `AUX${mode.auxChannel + 1}`;
    return `${name} on ${channel} (${mode.rangeStart}-${mode.rangeEnd})`;
  });

  const failsafeItems = [
    `Procedure: ${selectedPreset.failsafe.procedure}`,
    `Delay: ${selectedPreset.failsafe.delay} seconds`,
    `Landing timeout: ${selectedPreset.failsafe.offDelay} seconds`,
  ];

  const aircraftItems =
    selectedPreset.category === 'fixed_wing'
      ? [
          'Platform: Airplane',
          `Servo mixer: ${selectedPreset.aircraft.servoMixerRules.length} rules`,
          `Motor mixer: ${selectedPreset.aircraft.motorMixerRules.length} motors`,
        ]
      : [
          'Platform: Multirotor',
          `Motor mixer: Quad X (${selectedPreset.aircraft.motorMixerRules.length} motors)`,
        ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 mb-4">
          <span className="text-3xl">{selectedPreset.icon}</span>
        </div>
        <h2 className="text-xl font-semibold text-zinc-100">
          Review: {selectedPreset.name}
        </h2>
        <p className="text-sm text-zinc-400 mt-2 max-w-md mx-auto">
          The following configuration will be applied to your flight controller.
          Review the settings below before proceeding.
        </p>
      </div>

      {/* Board type badge */}
      <div className="flex justify-center">
        <span
          className={`px-3 py-1 text-xs font-medium rounded-full ${
            boardType === 'msp'
              ? 'bg-green-500/20 text-green-300 border border-green-500/30'
              : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
          }`}
        >
          {boardType === 'msp' ? 'Via MSP Protocol' : 'Via CLI Commands'}
        </span>
      </div>

      {/* Configuration sections */}
      <div className="grid gap-4">
        {/* Aircraft Type */}
        <ConfigSection
          icon={<Plane className="w-5 h-5 text-sky-400" />}
          title="Aircraft Type"
          items={aircraftItems}
          color="from-sky-500/10 to-blue-500/5 border-sky-500/20"
        />

        {/* PIDs */}
        <ConfigSection
          icon={<SlidersHorizontal className="w-5 h-5 text-purple-400" />}
          title="PID Tuning"
          items={pidItems}
          color="from-purple-500/10 to-violet-500/5 border-purple-500/20"
        />

        {/* Rates */}
        <ConfigSection
          icon={<Gauge className="w-5 h-5 text-blue-400" />}
          title="Rates"
          items={rateItems}
          color="from-blue-500/10 to-cyan-500/5 border-blue-500/20"
        />

        {/* Modes */}
        <ConfigSection
          icon={<Gamepad2 className="w-5 h-5 text-green-400" />}
          title="Flight Modes"
          items={modeItems}
          color="from-green-500/10 to-emerald-500/5 border-green-500/20"
        />

        {/* Failsafe */}
        <ConfigSection
          icon={<Shield className="w-5 h-5 text-orange-400" />}
          title="Failsafe"
          items={failsafeItems}
          color="from-orange-500/10 to-amber-500/5 border-orange-500/20"
        />
      </div>

      {/* Warning */}
      <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
        <div className="flex items-start gap-3">
          <span className="text-xl">⚠️</span>
          <div>
            <h4 className="font-medium text-amber-200 text-sm">
              This will overwrite your current settings
            </h4>
            <p className="text-xs text-amber-100/70 mt-1">
              Make sure you've backed up your configuration if you want to preserve your
              current settings. The changes will be saved to EEPROM immediately.
            </p>
          </div>
        </div>
      </div>

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
          className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors"
        >
          Apply Configuration
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default ConfigReviewStep;
