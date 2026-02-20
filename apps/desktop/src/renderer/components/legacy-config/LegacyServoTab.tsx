/**
 * Legacy Servo Tab
 *
 * Servo endpoint configuration for legacy F3 boards.
 * Modern UI with visual sliders and range indicators.
 */

import { useLegacyConfigStore, type LegacyServoConfig } from '../../stores/legacy-config-store';
import { CompactSlider } from '../ui/DraggableSlider';
import { Settings } from 'lucide-react';

export default function LegacyServoTab() {
  const { servoConfigs, updateServoConfig } = useLegacyConfigStore();

  const handleChange = (config: LegacyServoConfig) => {
    updateServoConfig(config.index, config);
    // Send CLI command: servo <index> <min> <max> <mid> <rate>
    window.electronAPI.cliSendCommand(
      `servo ${config.index} ${config.min} ${config.max} ${config.mid} ${config.rate}`
    );
  };

  if (servoConfigs.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-500">
        <Settings className="w-10 h-10 text-zinc-500 mb-3 mx-auto" />
        <p>No servo configurations found.</p>
        <p className="text-sm mt-1">Run the dump command to load configuration.</p>
      </div>
    );
  }

  const servoColors = ['#EF4444', '#22C55E', '#3B82F6', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#10B981'];

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
        <div className="flex items-start gap-3">
          <Settings className="w-6 h-6 text-amber-400 shrink-0" />
          <div>
            <p className="text-sm text-amber-300 font-medium">Servo Endpoint Configuration</p>
            <p className="text-xs text-amber-300/70 mt-1">
              Configure min/max/center positions and rate for each servo.
              Range: 750-2250μs for legacy F3 boards. Changes are sent immediately.
            </p>
          </div>
        </div>
      </div>

      {/* Servo Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {servoConfigs.map((servo, idx) => {
          const color = servoColors[idx % servoColors.length]!;
          const travelRange = servo.max - servo.min;
          const isReversed = servo.rate < 0;

          return (
            <div key={servo.index} className="bg-zinc-900/50 rounded-xl border border-zinc-800 overflow-hidden">
              {/* Header */}
              <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
                    style={{ backgroundColor: color }}
                  >
                    S{servo.index}
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">Servo {servo.index}</h3>
                    <p className="text-xs text-zinc-400">Travel: {travelRange}μs</p>
                  </div>
                </div>
                {isReversed && (
                  <span className="px-2 py-1 rounded-full bg-orange-500/20 text-orange-400 text-xs font-medium">
                    Reversed
                  </span>
                )}
              </div>

              {/* Controls */}
              <div className="p-5 space-y-4">
                {/* Visual Range */}
                <div className="relative h-8 bg-zinc-800 rounded-lg overflow-hidden">
                  {/* Range bar */}
                  <div
                    className="absolute h-full transition-all opacity-40"
                    style={{
                      left: `${((servo.min - 750) / 1500) * 100}%`,
                      width: `${((servo.max - servo.min) / 1500) * 100}%`,
                      backgroundColor: color,
                    }}
                  />
                  {/* Center marker */}
                  <div
                    className="absolute w-1 h-full transition-all"
                    style={{
                      left: `${((servo.mid - 750) / 1500) * 100}%`,
                      backgroundColor: color,
                    }}
                  />
                  {/* PWM center line */}
                  <div className="absolute left-1/2 top-0 bottom-0 w-px bg-zinc-600" />
                </div>
                <div className="flex justify-between text-xs text-zinc-500">
                  <span>750μs</span>
                  <span>1500μs</span>
                  <span>2250μs</span>
                </div>

                {/* Sliders */}
                <div className="grid grid-cols-2 gap-4">
                  <CompactSlider
                    label="Minimum"
                    value={servo.min}
                    onChange={(v) => handleChange({ ...servo, min: v })}
                    min={750}
                    max={2250}
                    step={10}
                    color={color}
                  />
                  <CompactSlider
                    label="Maximum"
                    value={servo.max}
                    onChange={(v) => handleChange({ ...servo, max: v })}
                    min={750}
                    max={2250}
                    step={10}
                    color={color}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <CompactSlider
                    label="Center"
                    value={servo.mid}
                    onChange={(v) => handleChange({ ...servo, mid: v })}
                    min={750}
                    max={2250}
                    step={10}
                    color={color}
                  />
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-400">Rate</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleChange({ ...servo, rate: -servo.rate })}
                          className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs"
                        >
                          Reverse
                        </button>
                        <input
                          type="number"
                          min={-125}
                          max={125}
                          value={servo.rate}
                          onChange={(e) => handleChange({ ...servo, rate: parseInt(e.target.value) || 100 })}
                          className="w-16 px-2 py-0.5 text-center text-sm bg-zinc-900 border border-zinc-700 rounded text-white"
                        />
                      </div>
                    </div>
                    <div className="relative h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="absolute top-0 h-full rounded-full transition-all"
                        style={{
                          left: servo.rate >= 0 ? '50%' : `${50 + (servo.rate / 125) * 50}%`,
                          width: `${(Math.abs(servo.rate) / 125) * 50}%`,
                          backgroundColor: color,
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Quick presets */}
                <div className="flex gap-2 pt-2 border-t border-zinc-800">
                  <button
                    onClick={() => handleChange({ ...servo, min: 1000, max: 2000, mid: 1500, rate: 100 })}
                    className="flex-1 py-1.5 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors"
                  >
                    Reset Default
                  </button>
                  <button
                    onClick={() => handleChange({ ...servo, min: 1100, max: 1900, mid: 1500, rate: 100 })}
                    className="flex-1 py-1.5 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors"
                  >
                    Safe Range
                  </button>
                  <button
                    onClick={() => handleChange({ ...servo, min: 750, max: 2250, mid: 1500, rate: 100 })}
                    className="flex-1 py-1.5 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors"
                  >
                    Full Range
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
