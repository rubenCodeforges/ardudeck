/**
 * Rover Tuning Tab for MAVLink/ArduRover
 *
 * Controls speed, steering, and navigation for ground vehicles.
 * Features:
 * - Speed limits and cruise settings
 * - Steering behavior and turn radius
 * - Navigation tuning (optional section)
 */

import React, { useMemo, useCallback } from 'react';
import { Gauge, RotateCw, Navigation, Compass, AlertCircle } from 'lucide-react';
import { useParameterStore } from '../../stores/parameter-store';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { DraggableSlider } from '../ui/DraggableSlider';
import { InfoCard } from '../ui/InfoCard';
import { ThrottleResponsePlot } from './ThrottleResponsePlot';
import { SteeringResponsePlot } from './SteeringResponsePlot';
import { OutputVisual } from './servo-output/OutputVisual';
import { classifyOutput, travelFromEndpoints, isTravelEditable } from './servo-output/output-shape';
import { useParamBounds } from '../../hooks/useParamBounds';

/** Starting points for the parameters that shape how the stick feels.
 * Expo is NEGATIVE for a softer low end: ArduPilot's curve raises low-throttle
 * output for positive values (see AP_MotorsUGV::get_scaled_throttle). */
/** None of these touch the slew rate: every bit of ramp is stick-to-motor
 * latency, and the same calm comes from less power and a softer low end. */
const THROTTLE_PRESETS = [
  { name: 'Gentle', blurb: 'Half power, soft low end', expo: -0.5, thrMax: 50, accel: 1 },
  { name: 'Balanced', blurb: 'Three quarter power, mild softening', expo: -0.25, thrMax: 75, accel: 2 },
  { name: 'Direct', blurb: 'ArduPilot stock: full power, no softening', expo: 0, thrMax: 100, accel: 0 },
];

/** Manual steering curves, described by what half stick actually gives, since
 * that is the part of the travel a driver lives in. */
const STEERING_PRESETS = [
  { name: 'Calm', blurb: 'Soft around centre, full lock unchanged', expo: 0.5 },
  { name: 'Balanced', blurb: 'A little softening', expo: 0.25 },
  { name: 'Direct', blurb: 'Stick angle is steering angle', expo: 0 },
];

/** Below this the ramp is long enough to feel as delay rather than smoothing. */
const SLUGGISH_SLEW = 200;

/** SERVOn_FUNCTION for GroundSteering; skid-steer rovers have no such output. */
const K_GROUND_STEERING = 26;

const SERVO_TRAVEL_MAX_US = 500;

interface RoverTuningTabProps {
  section?: 'speed-steering' | 'navigation';
}

const RoverTuningTab: React.FC<RoverTuningTabProps> = ({ section = 'speed-steering' }) => {
  const { parameters, setParameter } = useParameterStore();

  // Get current values from parameters
  const values = useMemo(() => ({
    // Speed settings
    CRUISE_SPEED: parameters.get('CRUISE_SPEED')?.value ?? 2,
    CRUISE_THROTTLE: parameters.get('CRUISE_THROTTLE')?.value ?? 50,
    SPEED_MAX: parameters.get('SPEED_MAX')?.value ?? 10,
    // Throttle feel. Slew rate, top throttle and the thrust curve are the
    // three that act in MANUAL, where the stick drives the motors directly;
    // the acceleration limits below only bite in the modes that hold a speed.
    MOT_SLEWRATE: parameters.get('MOT_SLEWRATE')?.value ?? 100,
    MOT_THR_MAX: parameters.get('MOT_THR_MAX')?.value ?? 100,
    MOT_THST_EXPO: parameters.get('MOT_THST_EXPO')?.value ?? 0,
    ATC_ACCEL_MAX: parameters.get('ATC_ACCEL_MAX')?.value ?? 0,
    ATC_DECEL_MAX: parameters.get('ATC_DECEL_MAX')?.value ?? 0,
    // Braking: most rover ESCs can drive the motors backwards to slow down,
    // which ArduPilot only uses when it is told it may.
    ATC_BRAKE: parameters.get('ATC_BRAKE')?.value ?? 0,
    ATC_STOP_SPEED: parameters.get('ATC_STOP_SPEED')?.value ?? 0.1,
    // Manual steering shaping, the steering twin of the thrust curve.
    MANUAL_STR_EXPO: parameters.get('MANUAL_STR_EXPO')?.value ?? 0,
    MOT_SPD_SCA_BASE: parameters.get('MOT_SPD_SCA_BASE')?.value ?? 1,
    // Steering settings
    TURN_RADIUS: parameters.get('TURN_RADIUS')?.value ?? 0.9,
    ACRO_TURN_RATE: parameters.get('ACRO_TURN_RATE')?.value ?? 180,
    PIVOT_TURN_ANGLE: parameters.get('PIVOT_TURN_ANGLE')?.value ?? 60,
    PIVOT_TURN_RATE: parameters.get('PIVOT_TURN_RATE')?.value ?? 90,
    // Navigation settings
    WP_RADIUS: parameters.get('WP_RADIUS')?.value ?? 2,
    WP_SPEED: parameters.get('WP_SPEED')?.value ?? 0,
    LOIT_RADIUS: parameters.get('LOIT_RADIUS')?.value ?? 2,
    LOIT_SPEED_GAIN: parameters.get('LOIT_SPEED_GAIN')?.value ?? 0.5,
    NAVL1_PERIOD: parameters.get('NAVL1_PERIOD')?.value ?? 8,
    NAVL1_DAMPING: parameters.get('NAVL1_DAMPING')?.value ?? 0.75,
  }), [parameters]);

  // Manual and Hold pass the sticks straight through; everything else runs
  // them through a controller first.
  const flightMode = useTelemetryStore((s) => s.flight.mode);
  const passthroughMode = /manual|hold/i.test(flightMode);

  const handleChange = useCallback((param: string, value: number) => {
    setParameter(param, value);
  }, [setParameter]);

  const metadata = useParameterStore((s) => s.metadata);

  const steering = useMemo(() => {
    for (let ch = 1; ch <= 16; ch++) {
      const fn = parameters.get(`SERVO${ch}_FUNCTION`)?.value;
      if (fn !== K_GROUND_STEERING) continue;
      const min = parameters.get(`SERVO${ch}_MIN`)?.value;
      const max = parameters.get(`SERVO${ch}_MAX`)?.value;
      const trim = parameters.get(`SERVO${ch}_TRIM`)?.value;
      if (min === undefined || max === undefined || trim === undefined) return null;
      const functionName = metadata?.[`SERVO${ch}_FUNCTION`]?.values?.[fn];
      return {
        ch,
        min,
        max,
        trim,
        functionName,
        travel: travelFromEndpoints(min, trim, max),
        ...classifyOutput({ functionName, min, trim, max }),
      };
    }
    return null;
  }, [parameters, metadata]);

  const strExpoBounds = useParamBounds('MANUAL_STR_EXPO', -0.5, 0.9, 0.05);
  const thstExpoBounds = useParamBounds('MOT_THST_EXPO', -1, 1, 0.05);
  const acroRateBounds = useParamBounds('ACRO_TURN_RATE', 10, 360, 5);
  const turnRadiusBounds = useParamBounds('TURN_RADIUS', 0.1, 10, 0.1);

  const handleSteeringTravel = useCallback((percent: number) => {
    if (!steering) return;
    const t = Math.round((percent / 100) * SERVO_TRAVEL_MAX_US);
    setParameter(`SERVO${steering.ch}_MIN`, steering.trim - t);
    setParameter(`SERVO${steering.ch}_MAX`, steering.trim + t);
  }, [steering, setParameter]);

  if (section === 'navigation') {
    return (
      <div className="p-6 space-y-6">
        <InfoCard title="Navigation Tuning" variant="info">
          These settings control how your rover follows waypoints and holds position.
          L1 controller determines path following accuracy - lower period = tighter turns but more oscillation.
        </InfoCard>

        {/* Waypoint Settings */}
        <div className="bg-surface rounded-xl border border-subtle p-5">
          <h3 className="text-lg font-medium text-content mb-4 flex items-center gap-2">
            <Navigation className="w-5 h-5 text-blue-400" /> Waypoint Settings
          </h3>
          <div className="grid grid-cols-2 gap-6">
            <DraggableSlider
              label="Waypoint Radius"
              value={values.WP_RADIUS}
              onChange={(v) => handleChange('WP_RADIUS', v)}
              min={0.5}
              max={20}
              step={0.5}
              color="#3B82F6"
              hint="Distance to consider waypoint reached (m)"
            />
            <DraggableSlider
              label="Waypoint Speed"
              value={values.WP_SPEED}
              onChange={(v) => handleChange('WP_SPEED', v)}
              min={0}
              max={30}
              step={0.5}
              color="#3B82F6"
              hint="Speed during missions (0 = use CRUISE_SPEED)"
            />
          </div>
        </div>

        {/* Loiter Settings */}
        <div className="bg-surface rounded-xl border border-subtle p-5">
          <h3 className="text-lg font-medium text-content mb-4 flex items-center gap-2">
            <Compass className="w-5 h-5 text-emerald-400" /> Loiter / Position Hold
          </h3>
          <div className="grid grid-cols-2 gap-6">
            <DraggableSlider
              label="Loiter Radius"
              value={values.LOIT_RADIUS}
              onChange={(v) => handleChange('LOIT_RADIUS', v)}
              min={0.5}
              max={20}
              step={0.5}
              color="#10B981"
              hint="Acceptable drift distance (m)"
            />
            <DraggableSlider
              label="Loiter Aggression"
              value={values.LOIT_SPEED_GAIN}
              onChange={(v) => handleChange('LOIT_SPEED_GAIN', v)}
              min={0.1}
              max={2}
              step={0.1}
              color="#10B981"
              hint="How aggressively to correct position"
            />
          </div>
        </div>

        {/* L1 Controller */}
        <div className="bg-surface rounded-xl border border-subtle p-5">
          <h3 className="text-lg font-medium text-content mb-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-400" /> L1 Path Following (Advanced)
          </h3>
          <div className="grid grid-cols-2 gap-6">
            <DraggableSlider
              label="L1 Period"
              value={values.NAVL1_PERIOD}
              onChange={(v) => handleChange('NAVL1_PERIOD', v)}
              min={5}
              max={30}
              step={1}
              color="#F59E0B"
              hint="Lookahead time (s) - lower = tighter turns"
            />
            <DraggableSlider
              label="L1 Damping"
              value={values.NAVL1_DAMPING}
              onChange={(v) => handleChange('NAVL1_DAMPING', v)}
              min={0.5}
              max={1}
              step={0.05}
              color="#F59E0B"
              hint="Damping factor - higher = smoother"
            />
          </div>
        </div>

        <InfoCard title="Tip" variant="tip">
          Start with default L1 settings and only adjust if the rover oscillates on straight paths
          or cuts corners too much. Increase L1 Period for smoother driving, decrease for tighter following.
        </InfoCard>
      </div>
    );
  }

  // Default: Speed & Steering section
  return (
    <div className="p-6 space-y-6">
      <InfoCard title="Speed & Steering" variant="info">
        Configure how fast your rover drives and how it turns.
        Cruise speed is used for autonomous missions, max speed is the absolute limit.
      </InfoCard>

      {/* Speed Settings */}
      <div className="bg-surface rounded-xl border border-subtle p-5">
        <h3 className="text-lg font-medium text-content mb-4 flex items-center gap-2">
          <Gauge className="w-5 h-5 text-blue-400" /> Speed Control
        </h3>
        <div className="space-y-4">
          <DraggableSlider
            label="Cruise Speed"
            value={values.CRUISE_SPEED}
            onChange={(v) => handleChange('CRUISE_SPEED', v)}
            min={0.5}
            max={20}
            step={0.5}
            color="#3B82F6"
            hint="Target speed for autonomous modes (m/s)"
          />
          <DraggableSlider
            label="Maximum Speed"
            value={values.SPEED_MAX}
            onChange={(v) => handleChange('SPEED_MAX', v)}
            min={1}
            max={30}
            step={1}
            color="#3B82F6"
            hint="Absolute maximum speed (m/s)"
          />
          <DraggableSlider
            label="Cruise Throttle"
            value={values.CRUISE_THROTTLE}
            onChange={(v) => handleChange('CRUISE_THROTTLE', v)}
            min={10}
            max={100}
            step={5}
            color="#3B82F6"
            hint="Base throttle percentage in auto modes"
          />
        </div>
      </div>

      {/* Throttle feel */}
      <div className="bg-surface rounded-xl border border-subtle p-5">
        <h3 className="text-lg font-medium text-content mb-1 flex items-center gap-2">
          <Gauge className="w-5 h-5 text-amber-400" /> Throttle feel
        </h3>
        <p className="text-xs text-content-secondary mb-3">
          How the rover answers the stick. The first three work in every mode including Manual;
          the acceleration limits only apply where the autopilot holds a speed.
        </p>

        {/* The mode decides whether the stick IS the throttle or merely asks
            for a speed, and nothing else on this page matters until you know
            which. Acro feeling slow is the controller working, not a fault. */}
        <div className={`mb-4 rounded-lg px-3 py-2 text-xs ${
          passthroughMode
            ? 'bg-emerald-500/10 text-emerald-300'
            : 'bg-blue-500/10 text-blue-300'
        }`}>
          {passthroughMode
            ? `In ${flightMode} the stick is the motor output: what you set here is what you feel.`
            : `In ${flightMode} the stick asks for a speed and a turn rate, and the controllers decide the outputs. Response depends on the steering and speed PIDs, not on these settings. Switch to Manual to feel the settings on this page directly.`}
        </div>
        <div className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,320px)_1fr]">
          <ThrottleResponsePlot
            expo={values.MOT_THST_EXPO}
            thrMax={values.MOT_THR_MAX}
            slew={values.MOT_SLEWRATE}
          />

          <div className="space-y-2">
            <div className="text-xs text-content-secondary">
              Start from one of these, then fine-tune below. The chart follows every change.
            </div>
            {THROTTLE_PRESETS.map((preset) => {
              const active = Math.abs(values.MOT_THST_EXPO - preset.expo) < 0.03
                && Math.abs(values.MOT_THR_MAX - preset.thrMax) < 1;
              return (
                <button
                  key={preset.name}
                  onClick={() => {
                    handleChange('MOT_THST_EXPO', preset.expo);
                    handleChange('MOT_THR_MAX', preset.thrMax);
                    handleChange('ATC_ACCEL_MAX', preset.accel);
                    handleChange('ATC_DECEL_MAX', preset.accel);
                  }}
                  data-tip={`Curve ${preset.expo}, top ${preset.thrMax}%, accel limit ${preset.accel} m/s². Leaves the throttle ramp alone.`}
                  className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    active
                      ? 'border-amber-500/50 bg-amber-500/10'
                      : 'border-subtle bg-surface-raised hover:bg-surface-overlay'
                  }`}
                >
                  <span
                    className="h-8 w-8 shrink-0 rounded-md flex items-center justify-center text-[11px] font-semibold"
                    style={{
                      background: active ? 'rgba(245,158,11,0.2)' : 'var(--bg-surface-overlay, rgba(148,163,184,0.12))',
                      color: active ? '#F59E0B' : 'var(--text-tertiary)',
                    }}
                  >
                    {preset.thrMax}%
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-content">{preset.name}</span>
                    <span className="block text-[11px] text-content-tertiary">{preset.blurb}</span>
                  </span>
                  {active && (
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-amber-400">current</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <DraggableSlider
            label="Throttle ramp (adds latency)"
            value={values.MOT_SLEWRATE}
            onChange={(v) => handleChange('MOT_SLEWRATE', v)}
            min={0}
            max={400}
            step={5}
            color="#F59E0B"
            hint={values.MOT_SLEWRATE === 0
              ? 'No limit: the motors follow the stick instantly. Leave it here unless the drivetrain needs protecting from sudden reversals.'
              : values.MOT_SLEWRATE < SLUGGISH_SLEW
                ? `${(100 / values.MOT_SLEWRATE).toFixed(1)} s from stop to full, and the same back: you will feel this as delay on the stick`
                : `${(100 / values.MOT_SLEWRATE).toFixed(2)} s from stop to full throttle`}
          />
          <DraggableSlider
            label="Top throttle"
            value={values.MOT_THR_MAX}
            onChange={(v) => handleChange('MOT_THR_MAX', v)}
            min={5}
            max={100}
            step={5}
            color="#F59E0B"
            hint="Most throttle the rover will ever use (%)"
          />
          <DraggableSlider
            label="Stick curve"
            value={values.MOT_THST_EXPO}
            onChange={(v) => handleChange('MOT_THST_EXPO', v)}
            min={thstExpoBounds.min}
            max={thstExpoBounds.max}
            step={thstExpoBounds.step}
            color="#F59E0B"
            hint={values.MOT_THST_EXPO < -0.05
              ? 'Soft low end: half stick gives well under half power'
              : values.MOT_THST_EXPO > 0.05
                ? 'Strong low end, for a motor that needs throttle before it pulls'
                : 'Linear: stick position is throttle'}
          />
          <DraggableSlider
            label="Acceleration limit"
            value={values.ATC_ACCEL_MAX}
            onChange={(v) => handleChange('ATC_ACCEL_MAX', v)}
            min={0}
            max={10}
            step={0.1}
            color="#F59E0B"
            hint="Auto and speed-controlled modes only, m/s² (0 = no limit)"
          />
          <DraggableSlider
            label="Braking limit"
            value={values.ATC_DECEL_MAX}
            onChange={(v) => handleChange('ATC_DECEL_MAX', v)}
            min={0}
            max={10}
            step={0.1}
            color="#F59E0B"
            hint="How hard it may slow down, m/s² (0 = same as acceleration)"
          />
        </div>

        {parameters.has('ATC_BRAKE') && (
          <div className="mt-5 border-t border-subtle pt-4 space-y-4">
            <div>
              <h4 className="text-sm text-content">Braking</h4>
              <p className="text-[11px] text-content-tertiary">
                Most rover ESCs can drive the motors backwards to slow the vehicle. ArduPilot only
                does it when told it may, and only in the modes where it controls speed: Acro,
                Steering, Auto and Guided. In Manual the stick IS the output, so pulling back
                commands reverse directly and what happens then is the ESC's own brake or reverse
                behaviour, not this setting.
              </p>
            </div>

            <button
              onClick={() => handleChange('ATC_BRAKE', values.ATC_BRAKE ? 0 : 1)}
              className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors ${
                values.ATC_BRAKE
                  ? 'border-amber-500/50 bg-amber-500/10'
                  : 'border-subtle bg-surface-raised'
              }`}
            >
              <div>
                <div className="text-sm text-content">Brake with the motors</div>
                <div className="mt-0.5 text-[11px] text-content-tertiary">
                  {values.ATC_BRAKE
                    ? 'Reversed output is used to slow down; needs an ESC that can reverse'
                    : 'The vehicle coasts to a stop instead'}
                </div>
              </div>
              <span className={`text-[10px] uppercase tracking-wide ${
                values.ATC_BRAKE ? 'text-amber-300' : 'text-content-tertiary'
              }`}>
                {values.ATC_BRAKE ? 'on' : 'off'}
              </span>
            </button>

            {parameters.has('ATC_STOP_SPEED') && (
              <DraggableSlider
                label="Call it stopped below"
                value={values.ATC_STOP_SPEED}
                onChange={(v) => handleChange('ATC_STOP_SPEED', v)}
                min={0}
                max={0.5}
                step={0.01}
                color="#F59E0B"
                hint="Outputs drop to zero under this speed (m/s), so it settles instead of hunting"
              />
            )}
          </div>
        )}
      </div>

      {/* Steering Settings */}
      <div className="bg-surface rounded-xl border border-subtle p-5">
        <h3 className="text-lg font-medium text-content mb-1 flex items-center gap-2">
          <RotateCw className="w-5 h-5 text-emerald-400" /> Steering
        </h3>
        <p className="text-xs text-content-secondary mb-4">
          Steering has its own curve, and it only shapes the stick in Manual. In Acro the stick
          asks for a turn rate instead.
        </p>

        {steering && isTravelEditable(steering.shape) && (
          <div className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,320px)_1fr]">
            <OutputVisual
              channel={steering.ch}
              shape={steering.shape}
              functionName={steering.functionName}
              min={steering.min}
              trim={steering.trim}
              max={steering.max}
              maxUs={SERVO_TRAVEL_MAX_US}
            />
            <div className="space-y-2 self-center">
              <DraggableSlider
                label="Steering travel"
                value={Math.round((steering.travel / SERVO_TRAVEL_MAX_US) * 100)}
                onChange={handleSteeringTravel}
                min={10}
                max={100}
                step={1}
                color="#10B981"
                hint={`Full stick puts servo ${steering.ch} at ${Math.round((steering.travel / SERVO_TRAVEL_MAX_US) * 100)}% travel (${steering.trim - steering.travel}–${steering.trim + steering.travel} µs)`}
              />
              <p className="text-[11px] text-content-tertiary">
                100% is the full ±500 µs a servo accepts. This scales the whole range rather than
                clipping it: at 40%, full stick gives 40% and half stick gives 20%. Turn it down
                when the wheels reach full lock before the stick does, so the travel you have left
                is travel that still steers.
              </p>
              {steering.trim - steering.min !== steering.max - steering.trim && (
                <p className="text-[11px] text-amber-400">
                  Endpoints are uneven around trim ({steering.min}/{steering.trim}/{steering.max} µs),
                  so it steers further one way than the other. Moving the slider evens them up.
                </p>
              )}
            </div>
          </div>
        )}

        {parameters.has('MANUAL_STR_EXPO') && (
          <div className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,320px)_1fr]">
            <SteeringResponsePlot expo={values.MANUAL_STR_EXPO} />
            <div className="space-y-2 self-center">
              {STEERING_PRESETS.map((preset) => {
                const active = Math.abs(values.MANUAL_STR_EXPO - preset.expo) < 0.03;
                const half = Math.round(((1 - preset.expo) * 0.5) / (1 - preset.expo * 0.5) * 100);
                return (
                  <button
                    key={preset.name}
                    onClick={() => handleChange('MANUAL_STR_EXPO', preset.expo)}
                    data-tip={`MANUAL_STR_EXPO ${preset.expo}: half stick gives ${half}% steering`}
                    className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                      active
                        ? 'border-emerald-500/50 bg-emerald-500/10'
                        : 'border-subtle bg-surface-raised hover:bg-surface-overlay'
                    }`}
                  >
                    <span
                      className="h-8 w-8 shrink-0 rounded-md flex items-center justify-center text-[11px] font-semibold"
                      style={{
                        background: active ? 'rgba(16,185,129,0.2)' : 'var(--bg-surface-overlay, rgba(148,163,184,0.12))',
                        color: active ? '#10B981' : 'var(--text-tertiary)',
                      }}
                    >
                      {half}%
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-content">{preset.name}</span>
                      <span className="block text-[11px] text-content-tertiary">{preset.blurb}</span>
                    </span>
                    {active && (
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-emerald-400">current</span>
                    )}
                  </button>
                );
              })}

              <DraggableSlider
                label="Steering curve (Manual)"
                value={values.MANUAL_STR_EXPO}
                onChange={(v) => handleChange('MANUAL_STR_EXPO', v)}
                min={strExpoBounds.min}
                max={strExpoBounds.max}
                step={strExpoBounds.step}
                color="#10B981"
                hint={values.MANUAL_STR_EXPO > 0.05
                  ? 'Calm around centre, full lock still reaches full lock'
                  : values.MANUAL_STR_EXPO < -0.05
                    ? 'Sharper around centre: twitchy, rarely what you want on a car'
                    : 'Linear: stick angle is steering angle'}
              />
            </div>
          </div>
        )}

        <div className="space-y-4">
          <DraggableSlider
            label="Turn Radius"
            value={values.TURN_RADIUS}
            onChange={(v) => handleChange('TURN_RADIUS', v)}
            min={turnRadiusBounds.min}
            max={turnRadiusBounds.max}
            step={turnRadiusBounds.step}
            color="#10B981"
            hint="Minimum turn radius at low speeds (m)"
          />
          <DraggableSlider
            label="Turn rate at full stick (Acro)"
            value={values.ACRO_TURN_RATE}
            onChange={(v) => handleChange('ACRO_TURN_RATE', v)}
            min={acroRateBounds.min}
            max={acroRateBounds.max}
            step={acroRateBounds.step}
            color="#10B981"
            hint={`A full turn takes ${(360 / Math.max(1, values.ACRO_TURN_RATE)).toFixed(1)} s at full lock`}
          />
        </div>
      </div>

      {/* Pivot Turn Settings */}
      <div className="bg-surface rounded-xl border border-subtle p-5">
        <h3 className="text-lg font-medium text-content mb-4 flex items-center gap-2">
          <RotateCw className="w-5 h-5 text-orange-400" /> Pivot Turns (Skid Steer)
        </h3>
        <p className="text-sm text-content-secondary mb-4">
          For differential drive rovers that can spin in place.
        </p>
        <div className="space-y-4">
          <DraggableSlider
            label="Pivot Threshold"
            value={values.PIVOT_TURN_ANGLE}
            onChange={(v) => handleChange('PIVOT_TURN_ANGLE', v)}
            min={0}
            max={180}
            step={10}
            color="#F97316"
            hint="Angle to target before using pivot turn (0 = disabled)"
          />
          <DraggableSlider
            label="Pivot Turn Rate"
            value={values.PIVOT_TURN_RATE}
            onChange={(v) => handleChange('PIVOT_TURN_RATE', v)}
            min={30}
            max={180}
            step={10}
            color="#F97316"
            hint="Rotation speed during pivot turns (deg/s)"
          />
        </div>
      </div>

      {/* Current settings summary */}
      <div className="bg-surface rounded-xl border border-subtle p-4">
        <h3 className="text-sm font-medium text-content mb-3">Current Settings Summary</h3>
        <div className="grid grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-2xl font-mono text-blue-400">{values.CRUISE_SPEED}</div>
            <div className="text-xs text-content-secondary">Cruise (m/s)</div>
          </div>
          <div>
            <div className="text-2xl font-mono text-blue-400">{values.SPEED_MAX}</div>
            <div className="text-xs text-content-secondary">Max (m/s)</div>
          </div>
          <div>
            <div className="text-2xl font-mono text-emerald-400">{values.TURN_RADIUS}</div>
            <div className="text-xs text-content-secondary">Turn Radius (m)</div>
          </div>
          <div>
            <div className="text-2xl font-mono text-orange-400">{values.PIVOT_TURN_ANGLE}</div>
            <div className="text-xs text-content-secondary">Pivot Threshold</div>
          </div>
        </div>
      </div>

      <InfoCard title="Tip" variant="tip">
        Start with conservative speeds (2-5 m/s) and increase gradually after testing.
        If your rover has skid steering (tank drive), enable pivot turns for sharper maneuvering.
      </InfoCard>
    </div>
  );
};

export default RoverTuningTab;
