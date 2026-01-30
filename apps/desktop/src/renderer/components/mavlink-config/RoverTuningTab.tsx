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
import { DraggableSlider } from '../ui/DraggableSlider';
import { InfoCard } from '../ui/InfoCard';

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

  const handleChange = useCallback((param: string, value: number) => {
    setParameter(param, value);
  }, [setParameter]);

  if (section === 'navigation') {
    return (
      <div className="p-6 space-y-6">
        <InfoCard title="Navigation Tuning" variant="info">
          These settings control how your rover follows waypoints and holds position.
          L1 controller determines path following accuracy - lower period = tighter turns but more oscillation.
        </InfoCard>

        {/* Waypoint Settings */}
        <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 p-5">
          <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
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
        <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 p-5">
          <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
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
        <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 p-5">
          <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
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
      <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 p-5">
        <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
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

      {/* Steering Settings */}
      <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 p-5">
        <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
          <RotateCw className="w-5 h-5 text-emerald-400" /> Steering
        </h3>
        <div className="space-y-4">
          <DraggableSlider
            label="Turn Radius"
            value={values.TURN_RADIUS}
            onChange={(v) => handleChange('TURN_RADIUS', v)}
            min={0.1}
            max={10}
            step={0.1}
            color="#10B981"
            hint="Minimum turn radius at low speeds (m)"
          />
          <DraggableSlider
            label="Acro Turn Rate"
            value={values.ACRO_TURN_RATE}
            onChange={(v) => handleChange('ACRO_TURN_RATE', v)}
            min={30}
            max={360}
            step={10}
            color="#10B981"
            hint="Maximum turn rate in Acro mode (deg/s)"
          />
        </div>
      </div>

      {/* Pivot Turn Settings */}
      <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 p-5">
        <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
          <RotateCw className="w-5 h-5 text-orange-400" /> Pivot Turns (Skid Steer)
        </h3>
        <p className="text-sm text-zinc-400 mb-4">
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
      <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 p-4">
        <h3 className="text-sm font-medium text-zinc-300 mb-3">Current Settings Summary</h3>
        <div className="grid grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-2xl font-mono text-blue-400">{values.CRUISE_SPEED}</div>
            <div className="text-xs text-zinc-500">Cruise (m/s)</div>
          </div>
          <div>
            <div className="text-2xl font-mono text-blue-400">{values.SPEED_MAX}</div>
            <div className="text-xs text-zinc-500">Max (m/s)</div>
          </div>
          <div>
            <div className="text-2xl font-mono text-emerald-400">{values.TURN_RADIUS}</div>
            <div className="text-xs text-zinc-500">Turn Radius (m)</div>
          </div>
          <div>
            <div className="text-2xl font-mono text-orange-400">{values.PIVOT_TURN_ANGLE}</div>
            <div className="text-xs text-zinc-500">Pivot Threshold</div>
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
