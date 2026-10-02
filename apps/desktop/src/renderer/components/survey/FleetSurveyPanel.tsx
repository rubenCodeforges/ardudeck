/**
 * Fleet survey modal - split the current survey polygon across the connected
 * fleet and upload a slice to each vehicle.
 *
 * Flow: pick vehicles -> choose an optional altitude layer step -> Generate
 * (splits the polygon into bands, builds a grid per band) -> review per-vehicle
 * waypoint counts -> Upload all (sequential, reusing the proven mission engine).
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DraftNumberInput } from '../../hooks/useNumericDraft';
import { useSurveyStore } from '../../stores/survey-store';
import { useFleetSurveyStore } from '../../stores/fleet-survey-store';
import { useFleetVehicles } from '../../hooks/useFleet';
import { buildFleetSurvey } from './survey-fleet-split';

export function FleetSurveyPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const polygon = useSurveyStore((s) => s.polygon);
  const config = useSurveyStore((s) => s.config);
  const surveyResult = useSurveyStore((s) => s.result);
  const vehicles = useFleetVehicles();

  const building = useFleetSurveyStore((s) => s.building);
  const assignments = useFleetSurveyStore((s) => s.assignments);
  const uploadStatus = useFleetSurveyStore((s) => s.uploadStatus);
  const setBuilding = useFleetSurveyStore((s) => s.setBuilding);
  const setAssignments = useFleetSurveyStore((s) => s.setAssignments);
  const setUploadStatus = useFleetSurveyStore((s) => s.setUploadStatus);

  const [selected, setSelected] = useState<string[]>(() => vehicles.map((v) => v.key));
  const [altStep, setAltStep] = useState(0);
  const [uploading, setUploading] = useState(false);

  const toggle = (key: string) =>
    setSelected((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));

  const labelOf = (key: string) => vehicles.find((v) => v.key === key)?.label ?? key;

  const generate = async () => {
    if (!polygon || selected.length === 0) return;
    setBuilding(true);
    try {
      // Pass the generated plan so decomposing engines (TOPAS) split along
      // their cells instead of geometric bands.
      const plan = surveyResult
        ? { waypoints: surveyResult.waypoints, generatorResult: surveyResult.generatorResult }
        : undefined;
      const result = await buildFleetSurvey(polygon, config, selected, { altitudeStepM: altStep, plan });
      setAssignments(result);
    } finally {
      setBuilding(false);
    }
  };

  const uploadAll = async () => {
    setUploading(true);
    try {
      for (const a of assignments) {
        setUploadStatus(a.vehicleKey, 'uploading');
        const res = await window.electronAPI?.uploadMissionToVehicle?.(a.vehicleKey, a.missionItems);
        if (res?.success) setUploadStatus(a.vehicleKey, 'complete');
        else setUploadStatus(a.vehicleKey, 'error', res?.error ?? t('common:uploadFailed'));
      }
    } finally {
      setUploading(false);
    }
  };

  const canGenerate = !!polygon && selected.length >= 2 && !building;

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-[480px] max-h-[80vh] overflow-y-auto rounded-xl border border-subtle bg-surface-solid shadow-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-content">{t('survey:fleetSurveyPanel.title')}</h2>
          <button onClick={onClose} className="text-content-tertiary hover:text-content text-sm">✕</button>
        </div>

        {!polygon ? (
          <p className="text-xs text-content-secondary">{t('survey:fleetSurveyPanel.drawFirst')}</p>
        ) : (
          <>
            <div className="mb-4">
              <span className="text-[11px] uppercase tracking-wide text-content-secondary">{t('survey:fleetSurveyPanel.vehicles')}</span>
              <div className="mt-1.5 flex flex-col gap-1">
                {vehicles.map((v) => (
                  <label key={v.key} className="flex items-center gap-2 text-xs text-content cursor-pointer">
                    <input
                      type="checkbox"
                      className="accent-cyan-500"
                      checked={selected.includes(v.key)}
                      onChange={() => toggle(v.key)}
                    />
                    <span className="font-mono">{v.label}</span>
                    <span className="text-content-tertiary">{v.vehicleClass}</span>
                  </label>
                ))}
                {vehicles.length === 0 && (
                  <span className="text-xs text-content-tertiary">{t('survey:fleetSurveyPanel.noVehicles')}</span>
                )}
              </div>
            </div>

            <label className="flex items-center justify-between gap-3 mb-4 text-xs text-content">
              <span>{t('survey:fleetSurveyPanel.altitudeStep')}</span>
              <DraftNumberInput
                value={altStep}
                min={0}
                onCommit={setAltStep}
                className="w-20 bg-surface-input border border-subtle rounded px-2 py-1 font-mono text-right"
              />
            </label>

            <button
              onClick={generate}
              disabled={!canGenerate}
              className="w-full mb-4 px-3 py-2 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold disabled:opacity-50"
            >
              {building ? t('survey:fleetSurveyPanel.generating') : t('survey:fleetSurveyPanel.generateSplit', { count: selected.length })}
            </button>

            {assignments.length > 0 && (
              <div className="mb-4">
                <span className="text-[11px] uppercase tracking-wide text-content-secondary">{t('survey:fleetSurveyPanel.assignments')}</span>
                <div className="mt-1.5 rounded-lg border border-subtle overflow-hidden">
                  {assignments.map((a) => {
                    const st = uploadStatus[a.vehicleKey]?.state ?? 'idle';
                    const stColor =
                      st === 'complete' ? 'text-green-400' : st === 'error' ? 'text-red-400' : st === 'uploading' ? 'text-cyan-400' : 'text-content-tertiary';
                    return (
                      <div key={a.vehicleKey} className="flex items-center justify-between px-3 py-1.5 border-b border-subtle last:border-0 text-xs">
                        <span className="font-mono text-content">{labelOf(a.vehicleKey)}</span>
                        <span className="text-content-secondary font-mono">
                          {t('survey:fleetSurveyPanel.assignmentSummary', { waypoints: a.waypointCount, hectares: (a.areaCovered / 10000).toFixed(1), altitude: Math.round(a.altitude) })}
                        </span>
                        <span className={`font-mono ${stColor}`}>{st}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {assignments.length > 0 && (
              <button
                onClick={uploadAll}
                disabled={uploading}
                className="w-full px-3 py-2 rounded bg-surface-raised hover:bg-surface-solid border border-subtle text-content text-xs font-semibold disabled:opacity-50"
              >
                {uploading ? t('common:uploading') : t('survey:fleetSurveyPanel.uploadAll')}
              </button>
            )}

            <p className="mt-3 text-[10px] text-content-tertiary leading-relaxed">
              {t('survey:fleetSurveyPanel.footnote')}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
