import { Ruler } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  ALTITUDE_UNITS,
  AREA_UNITS,
  DIMENSION_UNITS,
  DISTANCE_UNITS,
  ELECTRIC_CAPACITY_UNITS,
  SPEED_UNITS,
  UNIT_LABELS,
  VERTICAL_SPEED_UNITS,
  WEIGHT_UNITS,
  WIND_SPEED_UNITS,
  type UserUnitPreferences,
} from '../../../shared/user-units.js';
import { useSettingsStore } from '../../stores/settings-store';

type UnitKind = keyof UserUnitPreferences;

const UNIT_FIELDS = [
  { kind: 'distance', labelKey: 'common:distance', options: DISTANCE_UNITS },
  { kind: 'altitude', labelKey: 'common:altitude', options: ALTITUDE_UNITS },
  { kind: 'speed', labelKey: 'common:speed', options: SPEED_UNITS },
  { kind: 'verticalSpeed', labelKey: 'common:verticalSpeed', options: VERTICAL_SPEED_UNITS },
  { kind: 'electricCapacity', labelKey: 'settings:unitSelectionCard.eCapacity', options: ELECTRIC_CAPACITY_UNITS },
  { kind: 'weight', labelKey: 'settings:unitSelectionCard.weight', options: WEIGHT_UNITS },
  { kind: 'dimensions', labelKey: 'settings:unitSelectionCard.dimensions', options: DIMENSION_UNITS },
  { kind: 'area', labelKey: 'common:area', options: AREA_UNITS },
  { kind: 'windSpeed', labelKey: 'settings:unitSelectionCard.windSpeed', options: WIND_SPEED_UNITS },
] as const;

function unitLabel(kind: UnitKind, unit: string): string {
  const labels = UNIT_LABELS[kind] as Record<string, string>;
  return labels[unit] ?? unit;
}

export function UnitSelectionCard() {
  const { t } = useTranslation();
  const unitPreferences = useSettingsStore((state) => state.unitPreferences);
  const setUnitPreference = useSettingsStore((state) => state.setUnitPreference);

  const updateUnitPreference = <K extends UnitKind>(kind: K, value: string) => {
    setUnitPreference(kind, value as UserUnitPreferences[K]);
  };

  return (
    <div className="bg-gradient-to-br from-surface to-surface-base rounded-xl border border-subtle p-4 mb-4" data-tour="unit-preferences">
      <div className="flex items-center gap-3 mb-4">
        <Ruler className="w-4 h-4 text-blue-400" aria-hidden="true" />
        <div className="text-sm font-medium text-content">{t('settings:unitSelectionCard.title')}</div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {UNIT_FIELDS.map((field) => (
          <label key={field.kind} className="space-y-1.5">
            <span className="block text-xs font-medium text-content-secondary">{t(field.labelKey)}</span>
            <select
              value={unitPreferences[field.kind]}
              onChange={(event) => updateUnitPreference(field.kind, event.target.value)}
              className="w-full bg-surface-input border border-border rounded-lg px-3 py-2 text-sm text-content focus:outline-none focus:border-blue-500/50"
            >
              {field.options.map((unit) => (
                <option key={unit} value={unit}>
                  {unitLabel(field.kind, unit)}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </div>
  );
}
