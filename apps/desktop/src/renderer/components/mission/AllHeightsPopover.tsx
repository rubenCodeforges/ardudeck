import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMissionStore } from '../../stores/mission-store';
import { useSettingsStore } from '../../stores/settings-store';
import { DraftNumberInput } from '../../hooks/useNumericDraft';
import { commandHasLocation } from '../../../shared/mission-types';
import { isSurveyGroup } from '../../../shared/mission-group-types';
import { altitudeValueFromMeters, toMetersFromAltitudeUnit, UNIT_LABELS } from '../../../shared/user-units.js';
import { selectionTouchesGroups } from './bulk-edit';

type Mode = 'set' | 'shift';

/** Every waypoint's altitude at once: one value for all, or the same raise/lower keeping the profile's shape. */
export function AllHeightsPopover({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { missionItems, groups, bulkSetAltitude, bulkShiftAltitude } = useMissionStore();
  const unit = useSettingsStore((s) => s.unitPreferences.altitude);
  const located = useMemo(() => missionItems.filter((it) => commandHasLocation(it.command)), [missionItems]);
  const [mode, setMode] = useState<Mode>('shift');
  const [setDisplay, setSetDisplay] = useState(() => Math.round(altitudeValueFromMeters(located[0]?.altitude ?? 50, unit)));
  const [shiftDisplay, setShiftDisplay] = useState(() => Math.round(altitudeValueFromMeters(10, unit)));

  const touchesSurvey = useMemo(() => {
    const surveyIds = new Set<string>();
    for (const g of groups) {
      if (!isSurveyGroup(g)) continue;
      surveyIds.add(g.id);
      for (const c of g.distribution?.chunks ?? []) surveyIds.add(c.groupId);
    }
    return selectionTouchesGroups(missionItems, new Set(located.map((it) => it.seq)), surveyIds);
  }, [groups, missionItems, located]);

  const apply = (sign: 1 | -1 = 1) => {
    const seqs = located.map((it) => it.seq);
    if (mode === 'set') bulkSetAltitude(seqs, toMetersFromAltitudeUnit(setDisplay, unit));
    else bulkShiftAltitude(seqs, sign * toMetersFromAltitudeUnit(shiftDisplay, unit));
    onClose();
  };

  const tab = (m: Mode, label: string) => (
    <button
      onClick={() => setMode(m)}
      className={`flex-1 px-2 py-1.5 text-[11px] transition-colors ${mode === m ? 'bg-blue-600 text-white' : 'text-content-secondary hover:bg-surface-raised'}`}
    >
      {label}
    </button>
  );

  return (
    <>
      <div className="fixed inset-0 z-[2000]" onClick={onClose} />
      <div className="absolute right-2 top-7 z-[2001] w-64 bg-surface-solid border border-subtle rounded-lg shadow-xl p-3 space-y-2.5">
        <div className="text-xs font-medium text-content">{t('mission:allHeights.title', { count: located.length })}</div>
        <div className="flex items-center rounded overflow-hidden border border-subtle">
          {tab('shift', t('mission:allHeights.shift'))}
          <div className="w-px h-5 bg-subtle" />
          {tab('set', t('mission:allHeights.set'))}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-8 flex items-stretch bg-surface-input border border-default rounded overflow-hidden">
            <DraftNumberInput
              value={mode === 'set' ? setDisplay : shiftDisplay}
              onCommit={mode === 'set' ? setSetDisplay : setShiftDisplay}
              min={0}
              step={1}
              autoFocus
              className="flex-1 min-w-0 bg-transparent px-2 text-sm text-content outline-none tabular-nums"
            />
            <span className="px-2 self-center text-xs text-content-secondary">{UNIT_LABELS.altitude[unit]}</span>
          </div>
        </div>
        <p className="text-[10px] text-content-tertiary">{mode === 'set' ? t('mission:allHeights.setHint') : t('mission:allHeights.shiftHint')}</p>
        <p className="text-[10px] text-content-tertiary">{t('mission:waypointTable.list.altFramesNote')}</p>
        {touchesSurvey && <p className="text-[10px] text-amber-400">{t('mission:allHeights.surveyWarning')}</p>}
        <div className="flex items-center justify-end gap-2 pt-0.5">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-content-secondary hover:text-content">{t('common:cancel')}</button>
          {mode === 'shift' ? (
            <>
              <button onClick={() => apply(-1)} className="px-3 py-1.5 text-xs font-medium bg-surface-raised hover:brightness-125 text-content rounded-lg">{t('mission:allHeights.lower')}</button>
              <button onClick={() => apply(1)} className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg">{t('mission:allHeights.raise')}</button>
            </>
          ) : (
            <button onClick={() => apply()} className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg">{t('common:apply')}</button>
          )}
        </div>
      </div>
    </>
  );
}
