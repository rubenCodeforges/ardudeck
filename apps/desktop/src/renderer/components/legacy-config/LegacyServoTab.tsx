/**
 * Legacy Servo Tab
 *
 * Servo endpoint configuration for legacy F3 boards.
 * Uses servo <index> <min> <max> <mid> <rate> CLI command.
 */

import { useLegacyConfigStore, type LegacyServoConfig } from '../../stores/legacy-config-store';

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
      <div className="text-center py-8 text-zinc-500">
        No servo configurations found. Add servos via CLI or they may not be configured.
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
        <p className="text-sm text-blue-300">
          <strong>Servo Endpoints:</strong> Configure min/max/center positions and rate for each servo.
          Range: 750-2250μs for legacy boards. Changes are sent immediately.
        </p>
      </div>

      <div className="space-y-3">
        {servoConfigs.map((servo) => (
          <div key={servo.index} className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-white">Servo {servo.index}</h3>
              <span className="text-xs text-zinc-500">
                Range: {servo.min}μs - {servo.max}μs
              </span>
            </div>

            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Min (μs)</label>
                <input
                  type="number"
                  min="750"
                  max="2250"
                  value={servo.min}
                  onChange={(e) => handleChange({ ...servo, min: parseInt(e.target.value) || 1000 })}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Max (μs)</label>
                <input
                  type="number"
                  min="750"
                  max="2250"
                  value={servo.max}
                  onChange={(e) => handleChange({ ...servo, max: parseInt(e.target.value) || 2000 })}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Center (μs)</label>
                <input
                  type="number"
                  min="750"
                  max="2250"
                  value={servo.mid}
                  onChange={(e) => handleChange({ ...servo, mid: parseInt(e.target.value) || 1500 })}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Rate (%)</label>
                <input
                  type="number"
                  min="-125"
                  max="125"
                  value={servo.rate}
                  onChange={(e) => handleChange({ ...servo, rate: parseInt(e.target.value) || 100 })}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white"
                />
              </div>
            </div>

            {/* Visual range indicator */}
            <div className="mt-3 relative h-2 bg-zinc-800 rounded">
              <div
                className="absolute h-full bg-blue-500/30 rounded"
                style={{
                  left: `${((servo.min - 750) / 1500) * 100}%`,
                  width: `${((servo.max - servo.min) / 1500) * 100}%`,
                }}
              />
              <div
                className="absolute w-1 h-full bg-blue-500 rounded"
                style={{ left: `${((servo.mid - 750) / 1500) * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-zinc-600 mt-1">
              <span>750</span>
              <span>1500</span>
              <span>2250</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
