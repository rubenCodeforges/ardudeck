import { Ruler } from 'lucide-react';
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
  { kind: 'distance', label: 'Distance', options: DISTANCE_UNITS },
  { kind: 'altitude', label: 'Altitude', options: ALTITUDE_UNITS },
  { kind: 'speed', label: 'Speed', options: SPEED_UNITS },
  { kind: 'verticalSpeed', label: 'Vertical speed', options: VERTICAL_SPEED_UNITS },
  { kind: 'electricCapacity', label: 'E-Capacity', options: ELECTRIC_CAPACITY_UNITS },
  { kind: 'weight', label: 'Weight', options: WEIGHT_UNITS },
  { kind: 'dimensions', label: 'Dimensions', options: DIMENSION_UNITS },
  { kind: 'area', label: 'Area', options: AREA_UNITS },
  { kind: 'windSpeed', label: 'Wind speed', options: WIND_SPEED_UNITS },
] as const;

function unitLabel(kind: UnitKind, unit: string): string {
  const labels = UNIT_LABELS[kind] as Record<string, string>;
  return labels[unit] ?? unit;
}

export function UnitSelectionCard() {
  const unitPreferences = useSettingsStore((state) => state.unitPreferences);
  const setUnitPreference = useSettingsStore((state) => state.setUnitPreference);

  const updateUnitPreference = <K extends UnitKind>(kind: K, value: string) => {
    setUnitPreference(kind, value as UserUnitPreferences[K]);
  };

  return (
    <div className="bg-gradient-to-br from-surface to-surface-base rounded-xl border border-subtle p-4 mb-4" data-tour="unit-preferences">
      <div className="flex items-center gap-3 mb-4">
        <Ruler className="w-4 h-4 text-blue-400" aria-hidden="true" />
        <div className="text-sm font-medium text-content">Display Units</div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {UNIT_FIELDS.map((field) => (
          <label key={field.kind} className="space-y-1.5">
            <span className="block text-xs font-medium text-content-secondary">{field.label}</span>
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
