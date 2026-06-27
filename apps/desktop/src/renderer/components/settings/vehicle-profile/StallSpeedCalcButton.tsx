import { Calculator } from 'lucide-react';
import type { VehicleProfile } from '../../../stores/settings-store.js';
import { useSettingsStore } from '../../../stores/settings-store.js';
import { Tooltip } from '../../ui/Tooltip.js';
import {
  formatAreaFromSquareCentimeters,
  formatSpeedFromMetersPerSecond,
  formatWeightFromGrams,
} from '../../../../shared/user-units.js';

interface StallSpeedCalcButtonProps {
  vehicle: VehicleProfile;
  onCompute: (mps: number) => void;
}

/**
 * Physics-based stall speed estimator. Button sits beside the Stall Speed
 * label; hover shows a tooltip with the lift equation and the exact values
 * being plugged in; click fills the input.
 *
 *   V_stall = sqrt( 2·m·g / (ρ·S·C_Lmax) )
 */
export function StallSpeedCalcButton({ vehicle, onCompute }: StallSpeedCalcButtonProps) {
  const estimate = computeStallSpeed(vehicle);
  const canCompute = estimate !== null;

  const tooltip = canCompute
    ? <StallExplanation vehicle={vehicle} estimate={estimate!} />
    : <MissingInputsHint vehicle={vehicle} />;

  return (
    <Tooltip content={tooltip} placement="left" nowrap={false}>
      <button
        type="button"
        onClick={() => { if (estimate !== null) onCompute(round(estimate, 1)); }}
        disabled={!canCompute}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <Calculator className="w-3 h-3" />
        Calc
      </button>
    </Tooltip>
  );
}

function StallExplanation({ vehicle, estimate }: { vehicle: VehicleProfile; estimate: number }) {
  const speedUnit = useSettingsStore((s) => s.unitPreferences.speed);
  const weightUnit = useSettingsStore((s) => s.unitPreferences.weight);
  const areaUnit = useSettingsStore((s) => s.unitPreferences.area);
  const clMax = getClMax(vehicle);

  return (
    <div className="w-[260px] text-left p-1 space-y-2">
      <div className="flex items-baseline justify-between gap-3 pb-1.5 border-b border-subtle">
        <span className="text-[11px] text-content-secondary">Estimated stall speed</span>
        <span className="text-sm font-semibold text-content">{formatSpeedFromMetersPerSecond(estimate, speedUnit)}</span>
      </div>

      <div className="text-[11px] text-content-secondary leading-snug">
        From the lift equation at max C<span className="text-[9px] align-baseline">Lmax</span>:
      </div>
      <div className="font-mono text-[10px] text-content-secondary bg-surface-overlay-subtle rounded px-2 py-1">
        V = √(2·m·g / (ρ·S·Cmax))
      </div>

      <div className="text-[11px] space-y-0.5">
        <Row label="AUW"           value={formatWeightFromGrams(vehicle.weight ?? 0, weightUnit)} />
        <Row label="Wing area (S)" value={formatAreaFromSquareCentimeters(vehicle.wingArea ?? 0, areaUnit)} />
        <Row label="Air density"   value="1.225 kg/m³" />
        <Row label="C Lmax"        value={`${clMax} (${wingShapeLabel(vehicle)})`} />
      </div>

      <div className="text-[10px] text-content-tertiary leading-snug pt-1 border-t border-subtle">
        Theoretical clean-stall — real-world stall can be lower with flaps, higher in turns or heavier loading.
      </div>
    </div>
  );
}

function MissingInputsHint({ vehicle }: { vehicle: VehicleProfile }) {
  const hasWeight = (vehicle.weight ?? 0) > 0;
  const hasArea   = (vehicle.wingArea ?? 0) > 0;
  const missing: string[] = [];
  if (!hasWeight) missing.push('all-up weight');
  if (!hasArea) missing.push('wing area');
  return (
    <div className="w-[200px] text-[11px] text-content-secondary leading-snug p-1">
      Set {missing.join(' and ')} to estimate stall speed.
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-content-tertiary">{label}</span>
      <span className="font-mono text-content">{value}</span>
    </div>
  );
}

/** C_Lmax per wing shape. Conservative values for sport/handlaunch craft. */
function getClMax(vehicle: VehicleProfile): number {
  switch (vehicle.wingShape) {
    case 'delta':        return 0.9;
    case 'flying-wing':  return 1.0;
    case 'biplane':      return 1.5;
    case 'v-tail':
    case 'inverted-v':
    case 'standard':
    default:             return 1.3;
  }
}

function wingShapeLabel(vehicle: VehicleProfile): string {
  switch (vehicle.wingShape) {
    case 'delta':        return 'delta';
    case 'flying-wing':  return 'flying wing';
    case 'biplane':      return 'biplane';
    case 'v-tail':       return 'V-tail';
    case 'inverted-v':   return 'inverted-V';
    case 'standard':     return 'standard';
    default:             return 'standard wing';
  }
}

function computeStallSpeed(vehicle: VehicleProfile): number | null {
  const weight_g = vehicle.weight ?? 0;
  const wingArea_cm2 = vehicle.wingArea ?? 0;
  if (weight_g <= 0 || wingArea_cm2 <= 0) return null;
  const m = weight_g / 1000;       // kg
  const S = wingArea_cm2 / 10000;  // m²
  const g = 9.81;
  const rho = 1.225;
  const clMax = getClMax(vehicle);
  return Math.sqrt((2 * m * g) / (rho * S * clMax));
}

function round(n: number, digits: number): number {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}
