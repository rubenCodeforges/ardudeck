/**
 * ConfigReviewStep
 *
 * Review step showing a summary of all configuration that will be applied.
 * Allows user to see exactly what changes will be made before applying.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
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
  AlertTriangle,
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
        <h3 className="font-medium text-content">{title}</h3>
      </div>
      <ul className="space-y-1.5">
        {items.map((item, index) => (
          <li key={index} className="flex items-center gap-2 text-sm text-content">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export const ConfigReviewStep: React.FC = () => {
  const { t } = useTranslation();
  const { selectedPreset, nextStep, prevStep, boardType } = useQuickSetupStore();

  if (!selectedPreset) {
    return (
      <div className="text-center py-8">
        <p className="text-content-secondary">{t('quick-setup:configReview.noPreset')}</p>
      </div>
    );
  }

  // Generate summary items
  const pidItems = [
    t('quick-setup:configReview.rollPid', { ...selectedPreset.pids.roll }),
    t('quick-setup:configReview.pitchPid', { ...selectedPreset.pids.pitch }),
    t('quick-setup:configReview.yawPid', { ...selectedPreset.pids.yaw }),
  ];

  const rateItems = [
    t('quick-setup:summary.rcRate', { value: selectedPreset.rates.rcRate }),
    t('quick-setup:summary.expo', { value: selectedPreset.rates.rcExpo }),
    t('quick-setup:summary.rollPitchRate', { value: selectedPreset.rates.rollRate }),
    t('quick-setup:summary.yawRate', { value: selectedPreset.rates.yawRate }),
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
    const name = modeNames[mode.boxId] || `Mode ${mode.boxId}`; // i18n-exempt
    const channel = `AUX${mode.auxChannel + 1}`;
    return t('quick-setup:configReview.modeItem', { mode: name, channel, start: mode.rangeStart, end: mode.rangeEnd });
  });

  const failsafeItems = [
    t('quick-setup:configReview.procedure', { value: selectedPreset.failsafe.procedure }),
    t('quick-setup:configReview.delaySeconds', { value: selectedPreset.failsafe.delay }),
    t('quick-setup:configReview.landingTimeout', { value: selectedPreset.failsafe.offDelay }),
  ];

  const aircraftItems =
    selectedPreset.category === 'fixed_wing'
      ? [
          t('quick-setup:configReview.platformAirplane'),
          t('quick-setup:configReview.servoMixerRules', { n: selectedPreset.aircraft.servoMixerRules.length }),
          t('quick-setup:configReview.motorMixerMotors', { n: selectedPreset.aircraft.motorMixerRules.length }),
        ]
      : [
          t('quick-setup:configReview.platformMultirotor'),
          t('quick-setup:configReview.motorMixerQuadX', { n: selectedPreset.aircraft.motorMixerRules.length }),
        ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 mb-4">
          <selectedPreset.icon className="w-8 h-8 text-content" />
        </div>
        <h2 className="text-xl font-semibold text-content">
          {t('quick-setup:configReview.title', { name: t(selectedPreset.nameKey) })}
        </h2>
        <p className="text-sm text-content-secondary mt-2 max-w-md mx-auto">
          {t('quick-setup:configReview.intro')}
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
          {boardType === 'msp' ? t('quick-setup:configReview.viaMsp') : t('quick-setup:configReview.viaCli')}
        </span>
      </div>

      {/* Configuration sections */}
      <div className="grid gap-4">
        {/* Aircraft Type */}
        <ConfigSection
          icon={<Plane className="w-5 h-5 text-sky-400" />}
          title={t('quick-setup:summary.aircraftType')}
          items={aircraftItems}
          color="from-sky-500/10 to-blue-500/5 border-sky-500/20"
        />

        {/* PIDs */}
        <ConfigSection
          icon={<SlidersHorizontal className="w-5 h-5 text-purple-400" />}
          title={t('quick-setup:summary.pidTuning')}
          items={pidItems}
          color="from-purple-500/10 to-violet-500/5 border-purple-500/20"
        />

        {/* Rates */}
        <ConfigSection
          icon={<Gauge className="w-5 h-5 text-blue-400" />}
          title={t('common:rates')}
          items={rateItems}
          color="from-blue-500/10 to-cyan-500/5 border-blue-500/20"
        />

        {/* Modes */}
        <ConfigSection
          icon={<Gamepad2 className="w-5 h-5 text-green-400" />}
          title={t('common:flightModes')}
          items={modeItems}
          color="from-green-500/10 to-emerald-500/5 border-green-500/20"
        />

        {/* Failsafe */}
        <ConfigSection
          icon={<Shield className="w-5 h-5 text-orange-400" />}
          title={t('common:failsafe')}
          items={failsafeItems}
          color="from-orange-500/10 to-amber-500/5 border-orange-500/20"
        />
      </div>

      {/* Warning */}
      <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
          <div>
            <h4 className="font-medium text-amber-200 text-sm">
              {t('quick-setup:configReview.overwriteWarning')}
            </h4>
            <p className="text-xs text-amber-100/70 mt-1">
              {t('quick-setup:configReview.overwriteHint')}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation buttons */}
      <div className="flex items-center justify-between pt-4 border-t border">
        <button
          onClick={prevStep}
          className="flex items-center gap-2 px-4 py-2 text-sm text-content-secondary hover:text-content hover:bg-surface-raised rounded-lg transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('common:back')}
        </button>

        <button
          onClick={nextStep}
          className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors"
        >
          {t('quick-setup:configReview.applyConfiguration')}
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default ConfigReviewStep;
