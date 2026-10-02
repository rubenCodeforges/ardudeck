/**
 * TuningTab
 *
 * Simplified tuning overview and fine-tuning sliders.
 * Hides PID complexity while giving users meaningful control.
 */

import React, { useMemo } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import {
  Sliders,
  Target,
  Zap,
  Wrench,
  Save,
  Lightbulb,
} from 'lucide-react';
import { useParameterStore } from '../../stores/parameter-store';
import { DraggableSlider } from '../ui/DraggableSlider';
import { InfoCard } from '../ui/InfoCard';

const TuningTab: React.FC = () => {
  const { t } = useTranslation();
  const { parameters, setParameter, modifiedCount, fetchParameters, isLoading, downloadState } = useParameterStore();

  // A completed download, not just whatever parameters happen to be present.
  const hasParameters = downloadState === 'complete' && parameters.size > 0;

  // Get current tuning values
  const tuningValues = useMemo(() => ({
    // Acro rates
    acroRpRate: parameters.get('ACRO_RP_RATE')?.value ?? 180,
    acroYRate: parameters.get('ACRO_Y_RATE')?.value ?? 90,
    // Angle limits
    angleMax: parameters.get('ANGLE_MAX')?.value ?? 4500,
    // Position controller
    pscVelxyP: parameters.get('PSC_VELXY_P')?.value ?? 4.0,
    pscPosxyP: parameters.get('PSC_POSXY_P')?.value ?? 1.0,
    // Loiter
    loitSpeed: parameters.get('LOIT_SPEED')?.value ?? 1000,
    loitAccMax: parameters.get('LOIT_ACC_MAX')?.value ?? 400,
    // Waypoint nav
    wpnavSpeed: parameters.get('WPNAV_SPEED')?.value ?? 1000,
    wpnavAccel: parameters.get('WPNAV_ACCEL')?.value ?? 250,
    wpnavRadius: parameters.get('WPNAV_RADIUS')?.value ?? 200,
  }), [parameters]);

  const modified = modifiedCount();

  // Helper to convert centidegrees to degrees
  const angleMaxDeg = tuningValues.angleMax / 100;

  return (
    <div className="p-6 space-y-6">
      {/* Parameters not loaded warning */}
      {!hasParameters && (
        <div className="bg-amber-500/10 rounded-xl border border-amber-500/30 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <Lightbulb className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-amber-300 font-medium">{t('mavlink-config:tuningTab.notLoaded')}</p>
              <p className="text-xs text-content-secondary">{t('mavlink-config:tuningTab.notLoadedBody')}</p>
            </div>
          </div>
          <button
            onClick={() => fetchParameters({ force: true })}
            disabled={isLoading}
            className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {isLoading ? t('common:loading') : t('mavlink-config:tuningTab.fetchParameters')}
          </button>
        </div>
      )}

      {/* Current Settings Overview */}
      <div className="bg-surface rounded-xl border border-subtle p-4 space-y-4">
        <h3 className="text-sm font-medium text-content">{t('mavlink-config:tuningTab.currentSettings')}</h3>

        <div className="grid grid-cols-3 gap-4">
          {/* Responsiveness */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <Zap className="w-4 h-4 text-purple-400" />
              </div>
              <span className="text-xs text-content-secondary">{t('mavlink-config:tuningTab.responsiveness')}</span>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-content-secondary">{t('mavlink-config:tuningTab.maxAngle')}</span>
                <span className="text-content font-mono">{angleMaxDeg}°</span>
              </div>
              <div className="h-1.5 bg-surface-inset rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-purple-400 rounded-full"
                  style={{ width: `${(tuningValues.angleMax / 8000) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* Acro Rates */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <Sliders className="w-4 h-4 text-blue-400" />
              </div>
              <span className="text-xs text-content-secondary">{t('mavlink-config:tuningTab.acroRates')}</span>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-content-secondary">{t('mavlink-config:tuningTab.rollPitch')}</span>
                <span className="text-content font-mono">{tuningValues.acroRpRate}°/s</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-content-secondary">{t('common:yaw')}</span>
                <span className="text-content font-mono">{tuningValues.acroYRate}°/s</span>
              </div>
            </div>
          </div>

          {/* Speeds */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                <Target className="w-4 h-4 text-green-400" />
              </div>
              <span className="text-xs text-content-secondary">{t('mavlink-config:tuningTab.navSpeed')}</span>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-content-secondary">{t('common:waypoint')}</span>
                <span className="text-content font-mono">{(tuningValues.wpnavSpeed / 100).toFixed(0)} m/s</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-content-secondary">{'Loiter' /* i18n-exempt */}</span>
                <span className="text-content font-mono">{(tuningValues.loitSpeed / 100).toFixed(0)} m/s</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Fine Tuning */}
      <div className="bg-surface rounded-xl border border-subtle p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-content">{t('mavlink-config:tuningTab.fineTuning')}</h3>
          <span className="text-xs text-content-secondary">{t('mavlink-config:tuningTab.adjustValues')}</span>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Max Angle */}
          <DraggableSlider
            label={t('mavlink-config:tuningTab.maxTiltAngle')}
            value={tuningValues.angleMax}
            onChange={(v) => setParameter('ANGLE_MAX', v)}
            min={1500}
            max={8000}
            step={100}
            color="#8B5CF6"
            hint={t('mavlink-config:tuningTab.maxTiltHint', { deg: (tuningValues.angleMax / 100).toFixed(0) })}
          />

          {/* Loiter Speed */}
          <DraggableSlider
            label={t('mavlink-config:tuningTab.loiterSpeed')}
            value={tuningValues.loitSpeed}
            onChange={(v) => setParameter('LOIT_SPEED', v)}
            min={250}
            max={2000}
            step={50}
            color="#22C55E"
            hint={`${(tuningValues.loitSpeed / 100).toFixed(1)} m/s`}
          />

          {/* Waypoint Speed */}
          <DraggableSlider
            label={t('mavlink-config:tuningTab.waypointSpeed')}
            value={tuningValues.wpnavSpeed}
            onChange={(v) => setParameter('WPNAV_SPEED', v)}
            min={100}
            max={2000}
            step={50}
            color="#3B82F6"
            hint={`${(tuningValues.wpnavSpeed / 100).toFixed(1)} m/s`}
          />

          {/* Acro Roll/Pitch Rate */}
          <DraggableSlider
            label={t('mavlink-config:tuningTab.acroRpRate')}
            value={tuningValues.acroRpRate}
            onChange={(v) => setParameter('ACRO_RP_RATE', v)}
            min={45}
            max={720}
            step={15}
            color="#F59E0B"
            hint={`${tuningValues.acroRpRate}°/s`}
          />
        </div>
      </div>

      {/* AutoTune Info */}
      <InfoCard title={t('mavlink-config:tuningTab.autotuneTitle')} variant="tip" icon={Wrench}>
        {t('mavlink-config:tuningTab.autotuneBody')}
      </InfoCard>

      {/* Save Reminder */}
      {modified > 0 && (
        <div className="bg-amber-500/10 rounded-xl border border-amber-500/30 p-4 flex items-center gap-3">
          <Save className="w-5 h-5 text-amber-400" />
          <p className="text-sm text-amber-400">
            <Trans i18nKey="mavlink-config:tuningTab.unsaved" components={{ b: <span className="font-medium" /> }} />
          </p>
        </div>
      )}
    </div>
  );
};

export default TuningTab;
