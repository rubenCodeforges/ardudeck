import { useTranslation } from 'react-i18next';
import type { VehicleProfile, WingShape, VtolStyle, MotorArrangement } from '../../../stores/settings-store.js';

interface ConfigSelectorsProps {
  vehicle: VehicleProfile;
  onUpdate: (updates: Partial<VehicleProfile>) => void;
}

/**
 * Option labels and hints live in the translation bundle, keyed by the config
 * value itself (`settings.vehicleProfile.selectors.options.<value>`), so the
 * tables below only carry ids and cannot drift from the translations.
 */
type OptionEntry<T extends string> = { value: T; key: string };
type SelectorKey = 'wingShape' | 'vtolStyle' | 'motorArrangement';

const WING_SHAPES: OptionEntry<WingShape>[] = [
  { value: 'standard',     key: 'standard' },
  { value: 'delta',        key: 'delta' },
  { value: 'flying-wing',  key: 'flying-wing' },
  { value: 'v-tail',       key: 'v-tail' },
  { value: 'biplane',      key: 'biplane' },
  { value: 'inverted-v',   key: 'inverted-v' },
];

const VTOL_STYLES: OptionEntry<VtolStyle>[] = [
  { value: 'quadplane',   key: 'quadplane' },
  { value: 'tailsitter',  key: 'tailsitter' },
  { value: 'tiltrotor',   key: 'tiltrotor' },
  { value: 'tiltwing',    key: 'tiltwing' },
];

const MOTOR_ARRANGEMENTS: OptionEntry<MotorArrangement>[] = [
  { value: 'quad-x',       key: 'quad-x' },
  { value: 'quad-plus',    key: 'quad-plus' },
  { value: 'quad-h',       key: 'quad-h' },
  { value: 'hex-x',        key: 'hex-x' },
  { value: 'hex-plus',     key: 'hex-plus' },
  { value: 'octo-x',       key: 'octo-x' },
  { value: 'octo-plus',    key: 'octo-plus' },
  { value: 'y6',           key: 'y6' },
  { value: 'tri',          key: 'tri' },
  { value: 'coaxial',      key: 'coaxial' },
  { value: 'inline-2',     key: 'inline-2' },
  { value: 'twin-tractor', key: 'twin-tractor' },
  { value: 'twin-pusher',  key: 'twin-pusher' },
];

/**
 * The three orthogonal configuration selectors + live param-hint row.
 * Only renders what's relevant for the vehicle type.
 */
export function ConfigSelectors({ vehicle, onUpdate }: ConfigSelectorsProps) {
  const showWing = vehicle.type === 'plane' || vehicle.type === 'vtol';
  const showVtol = vehicle.type === 'vtol';
  const showMotor = vehicle.type === 'copter' || vehicle.type === 'vtol';

  if (!showWing && !showVtol && !showMotor) return null;

  return (
    <div className="grid grid-cols-2 gap-4">
      {showWing && (
        <Selector
          selectorKey="wingShape"
          value={vehicle.wingShape}
          options={WING_SHAPES}
          onChange={v => onUpdate({ wingShape: v as WingShape })}
        />
      )}
      {showVtol && (
        <Selector
          selectorKey="vtolStyle"
          value={vehicle.vtolStyle}
          options={VTOL_STYLES}
          onChange={v => onUpdate({ vtolStyle: v as VtolStyle })}
        />
      )}
      {showMotor && (
        <Selector
          selectorKey="motorArrangement"
          value={vehicle.motorArrangement}
          options={MOTOR_ARRANGEMENTS}
          onChange={v => onUpdate({ motorArrangement: v as MotorArrangement })}
        />
      )}
    </div>
  );
}

interface SelectorProps<T extends string> {
  selectorKey: SelectorKey;
  value: T | undefined;
  options: OptionEntry<T>[];
  onChange: (value: T) => void;
}

function Selector<T extends string>({ selectorKey, value, options, onChange }: SelectorProps<T>) {
  const { t } = useTranslation('settings');
  const current = options.find(o => o.value === value);
  const optionPath = `vehicleProfile.selectors.options.${current?.key ?? ''}`;
  return (
    <div>
      <label className="block text-sm font-medium text-content mb-1.5">
        {t(`vehicleProfile.selectors.${selectorKey}`)}
      </label>
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value as T)}
        className="w-full px-3 py-2 bg-surface-input border border-border rounded-lg text-content focus:outline-none focus:border-blue-500"
      >
        <option value="">{t('vehicleProfile.selectors.selectPlaceholder')}</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>
            {t(`vehicleProfile.selectors.options.${o.key}.label`)}
          </option>
        ))}
      </select>
      {current && (
        <div className="text-[10px] text-content-secondary mt-1">{t(`${optionPath}.hint`)}</div>
      )}
    </div>
  );
}
