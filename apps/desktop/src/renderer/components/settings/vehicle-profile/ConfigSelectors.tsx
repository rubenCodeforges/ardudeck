import { useTranslation } from 'react-i18next';
import type { VehicleProfile, WingShape, VtolStyle, MotorArrangement } from '../../../stores/settings-store.js';

interface ConfigSelectorsProps {
  vehicle: VehicleProfile;
  onUpdate: (updates: Partial<VehicleProfile>) => void;
}

const WING_SHAPES: Array<{ value: WingShape; labelKey: string; hintKey: string }> = [
  { value: 'standard', labelKey: 'settings:configSelectors.wing.standard', hintKey: 'settings:configSelectors.wing.standardHint' },
  { value: 'delta', labelKey: 'settings:configSelectors.wing.delta', hintKey: 'settings:configSelectors.wing.deltaHint' },
  { value: 'flying-wing', labelKey: 'settings:configSelectors.wing.flyingWing', hintKey: 'settings:configSelectors.wing.flyingWingHint' },
  { value: 'v-tail', labelKey: 'settings:configSelectors.wing.vTail', hintKey: 'settings:configSelectors.wing.vTailHint' },
  { value: 'biplane', labelKey: 'settings:configSelectors.wing.biplane', hintKey: 'settings:configSelectors.wing.biplaneHint' },
  { value: 'inverted-v', labelKey: 'settings:configSelectors.wing.invertedV', hintKey: 'settings:configSelectors.wing.invertedVHint' },
];

const VTOL_STYLES: Array<{ value: VtolStyle; labelKey: string; hintKey: string }> = [
  { value: 'quadplane', labelKey: 'settings:configSelectors.vtol.quadplane', hintKey: 'settings:configSelectors.vtol.quadplaneHint' },
  { value: 'tailsitter', labelKey: 'settings:configSelectors.vtol.tailsitter', hintKey: 'settings:configSelectors.vtol.tailsitterHint' },
  { value: 'tiltrotor', labelKey: 'settings:configSelectors.vtol.tiltrotor', hintKey: 'settings:configSelectors.vtol.tiltrotorHint' },
  { value: 'tiltwing', labelKey: 'settings:configSelectors.vtol.tiltwing', hintKey: 'settings:configSelectors.vtol.tiltwingHint' },
];

const MOTOR_ARRANGEMENTS: Array<{ value: MotorArrangement; labelKey: string; hintKey: string }> = [
  { value: 'quad-x', labelKey: 'settings:configSelectors.motor.quadX', hintKey: 'settings:configSelectors.motor.quadXHint' },
  { value: 'quad-plus', labelKey: 'settings:configSelectors.motor.quadPlus', hintKey: 'settings:configSelectors.motor.quadPlusHint' },
  { value: 'quad-h', labelKey: 'settings:configSelectors.motor.quadH', hintKey: 'settings:configSelectors.motor.quadHHint' },
  { value: 'hex-x', labelKey: 'settings:configSelectors.motor.hexX', hintKey: 'settings:configSelectors.motor.hexXHint' },
  { value: 'hex-plus', labelKey: 'settings:configSelectors.motor.hexPlus', hintKey: 'settings:configSelectors.motor.hexPlusHint' },
  { value: 'octo-x', labelKey: 'settings:configSelectors.motor.octoX', hintKey: 'settings:configSelectors.motor.octoXHint' },
  { value: 'octo-plus', labelKey: 'settings:configSelectors.motor.octoPlus', hintKey: 'settings:configSelectors.motor.octoPlusHint' },
  { value: 'y6', labelKey: 'settings:configSelectors.motor.y6', hintKey: 'settings:configSelectors.motor.y6Hint' },
  { value: 'tri', labelKey: 'settings:configSelectors.motor.tri', hintKey: 'settings:configSelectors.motor.triHint' },
  { value: 'coaxial', labelKey: 'settings:configSelectors.motor.coaxial', hintKey: 'settings:configSelectors.motor.coaxialHint' },
  { value: 'inline-2', labelKey: 'settings:configSelectors.motor.inline2', hintKey: 'settings:configSelectors.motor.inline2Hint' },
  { value: 'twin-tractor', labelKey: 'settings:configSelectors.motor.twinTractor', hintKey: 'settings:configSelectors.motor.twinTractorHint' },
  { value: 'twin-pusher', labelKey: 'settings:configSelectors.motor.twinPusher', hintKey: 'settings:configSelectors.motor.twinPusherHint' },
];

/**
 * The three orthogonal configuration selectors + live param-hint row.
 * Only renders what's relevant for the vehicle type.
 */
export function ConfigSelectors({ vehicle, onUpdate }: ConfigSelectorsProps) {
  const { t } = useTranslation();
  const showWing = vehicle.type === 'plane' || vehicle.type === 'vtol';
  const showVtol = vehicle.type === 'vtol';
  const showMotor = vehicle.type === 'copter' || vehicle.type === 'vtol';

  if (!showWing && !showVtol && !showMotor) return null;

  return (
    <div className="grid grid-cols-2 gap-4">
      {showWing && (
        <Selector
          label={t('settings:configSelectors.wingShape')}
          value={vehicle.wingShape}
          options={WING_SHAPES}
          onChange={v => onUpdate({ wingShape: v as WingShape })}
        />
      )}
      {showVtol && (
        <Selector
          label={t('settings:configSelectors.vtolStyle')}
          value={vehicle.vtolStyle}
          options={VTOL_STYLES}
          onChange={v => onUpdate({ vtolStyle: v as VtolStyle })}
        />
      )}
      {showMotor && (
        <Selector
          label={t('settings:configSelectors.motorArrangement')}
          value={vehicle.motorArrangement}
          options={MOTOR_ARRANGEMENTS}
          onChange={v => onUpdate({ motorArrangement: v as MotorArrangement })}
        />
      )}
    </div>
  );
}

interface SelectorProps<T extends string> {
  label: string;
  value: T | undefined;
  options: Array<{ value: T; labelKey: string; hintKey: string }>;
  onChange: (value: T) => void;
}

function Selector<T extends string>({ label, value, options, onChange }: SelectorProps<T>) {
  const { t } = useTranslation();
  const current = options.find(o => o.value === value);
  return (
    <div>
      <label className="block text-sm font-medium text-content mb-1.5">{label}</label>
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value as T)}
        className="w-full px-3 py-2 bg-surface-input border border-border rounded-lg text-content focus:outline-none focus:border-blue-500"
      >
        <option value="">{t('settings:configSelectors.select')}</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
        ))}
      </select>
      {current && (
        <div className="text-[10px] text-content-secondary mt-1">{t(current.hintKey)}</div>
      )}
    </div>
  );
}

