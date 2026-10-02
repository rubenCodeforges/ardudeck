/**
 * ReviewStep
 *
 * Final step of the wizard.
 * Shows summary of all configured modes and saves to FC.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useModesWizardStore } from '../../../stores/modes-wizard-store';
import { MODE_INFO, AUX_CHANNELS, PRESET_ICONS } from '../presets/mode-presets';
import ModeCard from '../shared/ModeCard';
import { ClipboardList, AlertTriangle, XCircle, CheckCircle2, Lightbulb, HelpCircle } from 'lucide-react';

export const ReviewStep: React.FC = () => {
  const { t } = useTranslation();
  const {
    selectedPreset,
    pendingModes,
    originalModes,
    rcChannels,
    isSaving,
    saveError,
    saveToFC,
    prevStep,
    closeWizard,
  } = useModesWizardStore();

  // Get RC value for a mode's AUX channel
  const getRcValue = (auxChannel: number) => rcChannels[auxChannel + 4] || 1500;

  // Find changes from original configuration
  const hasChanges = pendingModes.length !== originalModes.length ||
    pendingModes.some((mode, idx) => {
      const original = originalModes[idx];
      return !original ||
        mode.boxId !== original.boxId ||
        mode.auxChannel !== original.auxChannel ||
        mode.rangeStart !== original.rangeStart ||
        mode.rangeEnd !== original.rangeEnd;
    });

  const handleSave = async () => {
    const success = await saveToFC();
    if (success) {
      // Close wizard after successful save
      setTimeout(() => {
        closeWizard();
      }, 1500);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/20 mb-4">
          <ClipboardList className="w-8 h-8 text-green-400" />
        </div>
        <h2 className="text-xl font-semibold text-content">{t('modes:reviewStep.title')}</h2>
        <p className="text-sm text-content-secondary mt-2 max-w-md mx-auto">
          {selectedPreset
            ? t('modes:reviewStep.usingPreset', { name: t(selectedPreset.nameKey), count: pendingModes.length })
            : t('modes:reviewStep.configured', { count: pendingModes.length })}
        </p>
      </div>

      {/* Preset info */}
      {selectedPreset && (() => {
        const PresetIcon = PRESET_ICONS[selectedPreset.icon] || HelpCircle;
        return (
          <div className={`p-4 rounded-xl border bg-gradient-to-br ${selectedPreset.gradient}`}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-surface-overlay-subtle flex items-center justify-center">
                <PresetIcon className="w-5 h-5 text-content" />
              </div>
              <div>
                <h3 className="font-medium text-content">{t('modes:reviewStep.presetTitle', { name: t(selectedPreset.nameKey) })}</h3>
                <p className="text-xs text-content-secondary mt-0.5">{t(selectedPreset.tipKey)}</p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Mode cards */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-content">{t('modes:reviewStep.configuredModes')}</h3>
        {pendingModes.map((mode, index) => (
          <ModeCard
            key={index}
            mode={mode}
            rcValue={getRcValue(mode.auxChannel)}
            readOnly
            expanded={false}
            showDescription={false}
          />
        ))}
      </div>

      {/* Summary table */}
      <div className="overflow-hidden rounded-xl border border">
        <table className="w-full text-sm">
          <thead className="bg-surface-raised">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-content">{t('common:mode')}</th>
              <th className="px-4 py-2 text-left font-medium text-content">{t('common:channel')}</th>
              <th className="px-4 py-2 text-left font-medium text-content">{t('common:range')}</th>
              <th className="px-4 py-2 text-left font-medium text-content">{t('common:status')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-subtle">
            {pendingModes.map((mode, index) => {
              const info = MODE_INFO[mode.boxId];
              const IconComponent = info?.icon || HelpCircle;
              const aux = AUX_CHANNELS[mode.auxChannel];
              const rcValue = getRcValue(mode.auxChannel);
              const isActive = rcValue >= mode.rangeStart && rcValue <= mode.rangeEnd;

              return (
                <tr key={index} className="bg-surface-input">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <IconComponent className={`w-4 h-4 ${(info?.color || 'bg-zinc-500').replace('bg-', 'text-')}`} />
                      <span className="text-content">{info?.name || t('modes:modeFallback', { id: mode.boxId })}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-content-secondary">{aux?.name || `AUX ${mode.auxChannel + 1}`}</td>
                  <td className="px-4 py-3 font-mono text-content-secondary">
                    {mode.rangeStart} - {mode.rangeEnd}
                  </td>
                  <td className="px-4 py-3">
                    {isActive ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs">
                        <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                        {t('common:active')}
                      </span>
                    ) : (
                      <span className="text-content-secondary text-xs">{t('modes:reviewStep.ready')}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Warning if ARM is missing */}
      {!pendingModes.some((m) => m.boxId === 0) && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-red-300">{t('modes:reviewStep.armMissing')}</h4>
              <p className="text-xs text-red-200/70 mt-1">
                {t('modes:reviewStep.armMissingHint')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Save error */}
      {saveError && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
          <div className="flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-red-300">{t('common:failedToSave')}</h4>
              <p className="text-xs text-red-200/70 mt-1">{saveError}</p>
            </div>
          </div>
        </div>
      )}

      {/* Success message */}
      {isSaving === false && !saveError && hasChanges === false && (
        <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl animate-pulse">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-green-400 shrink-0" />
            <div>
              <h4 className="font-medium text-green-300">{t('modes:reviewStep.saved')}</h4>
              <p className="text-xs text-green-200/70">
                {t('modes:reviewStep.savedHint')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Important note */}
      <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
        <div className="flex items-start gap-3">
          <Lightbulb className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-amber-200 text-sm">{t('modes:reviewStep.beforeFly')}</h4>
            <ul className="text-xs text-amber-100/70 mt-2 space-y-1 list-disc list-inside">
              <li>{t('modes:reviewStep.tipArm')}</li>
              <li>{t('modes:reviewStep.tipFailsafe')}</li>
              <li>{t('modes:reviewStep.tipAux')}</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Navigation buttons */}
      <div className="flex gap-3 pt-4">
        <button
          onClick={prevStep}
          disabled={isSaving}
          className="px-4 py-2.5 bg-surface-raised hover:bg-surface-raised disabled:opacity-50 text-content rounded-lg transition-colors"
        >
          {t('common:back')}
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving || pendingModes.length === 0}
          className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-500 disabled:bg-surface-raised disabled:text-content-secondary text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {isSaving ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              {t('common:saving')}
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              {t('modes:reviewStep.saveToFc')}
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default ReviewStep;
