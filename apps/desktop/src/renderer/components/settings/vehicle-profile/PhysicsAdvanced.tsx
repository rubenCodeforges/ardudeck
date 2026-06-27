import { Cpu } from 'lucide-react';
import {
  dimensionInputValueFromMillimeters,
  toMillimetersFromDimensionUnit,
  UNIT_LABELS,
  UNIT_PRECISION,
  type DimensionUnit,
} from '../../../../shared/user-units.js';
import type { VehicleProfile } from '../../../stores/settings-store.js';
import { useSettingsStore } from '../../../stores/settings-store.js';

interface PhysicsAdvancedProps {
  vehicle: VehicleProfile;
  onUpdate: (updates: Partial<VehicleProfile>) => void;
}

/**
 * Collapsible "Physics (SITL fidelity)" section — drives SIM_* params.
 * Matches the existing <details>/<summary> pattern used elsewhere in the
 * Edit Vehicle modal (rotating chevron, icon, collapsed by default).
 */
export function PhysicsAdvanced({ vehicle, onUpdate }: PhysicsAdvancedProps) {
  const dimensionUnit = useSettingsStore((s) => s.unitPreferences.dimensions);
  const dimensionUnitLabel = UNIT_LABELS.dimensions[dimensionUnit];
  const toDisplayDimension = (millimeters: number | undefined) =>
    millimeters === undefined ? undefined : Number(dimensionInputValueFromMillimeters(millimeters, dimensionUnit));
  const toNativeMillimeters = (displayValue: number) =>
    Math.round(toMillimetersFromDimensionUnit(displayValue, dimensionUnit));

  return (
    <details className="group">
      <summary className="text-sm font-medium text-content-secondary cursor-pointer hover:text-content flex items-center gap-2">
        <svg className="w-4 h-4 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <Cpu className="w-4 h-4" />
        Physics (SITL fidelity)
      </summary>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <NumField
          label="Thrust/Weight ratio"
          value={vehicle.thrustToWeight}
          step={0.1}
          unit=""
          placeholder="2.0"
          onChange={v => onUpdate({ thrustToWeight: v })}
          hint="Used for SIM_ENGINE_MUL"
        />
        <NumField
          label="Prop Diameter"
          value={toDisplayDimension(vehicle.propDiameter)}
          step={dimensionInputStep(dimensionUnit)}
          unit={dimensionUnitLabel}
          placeholder={dimensionInputValueFromMillimeters(127, dimensionUnit)}
          onChange={v => onUpdate({ propDiameter: toNativeMillimeters(v) })}
          hint="Prop diameter"
        />
        <NumField
          label="Drag Coefficient"
          value={vehicle.dragCoefficient}
          step={0.01}
          unit=""
          placeholder="0.3"
          onChange={v => onUpdate({ dragCoefficient: v })}
          hint="SIM_DRAG_COEF (0.1–1.5 typical)"
        />
        <NumField
          label="Servo Speed"
          value={vehicle.servoSpeed}
          step={10}
          unit="°/s"
          placeholder="300"
          onChange={v => onUpdate({ servoSpeed: v })}
          hint="SIM_SERVO_SPEED response"
        />
        <div className="col-span-2 grid grid-cols-3 gap-2">
          <NumField
            label="CG Offset X"
            value={toDisplayDimension(vehicle.cogOffset?.x)}
            step={dimensionInputStep(dimensionUnit)}
            unit={dimensionUnitLabel}
            onChange={v => onUpdate({ cogOffset: { ...(vehicle.cogOffset ?? { x: 0, y: 0, z: 0 }), x: toNativeMillimeters(v) } })}
          />
          <NumField
            label="CG Offset Y"
            value={toDisplayDimension(vehicle.cogOffset?.y)}
            step={dimensionInputStep(dimensionUnit)}
            unit={dimensionUnitLabel}
            onChange={v => onUpdate({ cogOffset: { ...(vehicle.cogOffset ?? { x: 0, y: 0, z: 0 }), y: toNativeMillimeters(v) } })}
          />
          <NumField
            label="CG Offset Z"
            value={toDisplayDimension(vehicle.cogOffset?.z)}
            step={dimensionInputStep(dimensionUnit)}
            unit={dimensionUnitLabel}
            onChange={v => onUpdate({ cogOffset: { ...(vehicle.cogOffset ?? { x: 0, y: 0, z: 0 }), z: toNativeMillimeters(v) } })}
          />
        </div>
      </div>
    </details>
  );
}

interface NumFieldProps {
  label: string;
  value: number | undefined;
  step: number | string;
  unit: string;
  placeholder?: string;
  hint?: string;
  onChange: (value: number) => void;
}

function dimensionInputStep(unit: DimensionUnit): string {
  return String(1 / (10 ** UNIT_PRECISION.dimensions[unit]));
}

function NumField({ label, value, step, unit, placeholder, hint, onChange }: NumFieldProps) {
  return (
    <div>
      <label className="block text-[11px] text-content-secondary mb-1">{label}</label>
      <div className="relative">
        <input
          type="number"
          step={step}
          value={value ?? ''}
          placeholder={placeholder}
          onChange={e => {
            const v = parseFloat(e.target.value);
            if (!Number.isNaN(v)) onChange(v);
          }}
          className="w-full px-2 py-1.5 bg-surface-input border border-border rounded text-xs text-content focus:outline-none focus:border-blue-500"
        />
        {unit && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-content-tertiary">{unit}</span>}
      </div>
      {hint && <div className="text-[10px] text-content-tertiary mt-0.5">{hint}</div>}
    </div>
  );
}
