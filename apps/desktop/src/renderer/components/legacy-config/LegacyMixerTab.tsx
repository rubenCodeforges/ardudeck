/**
 * Legacy Mixer Tab
 *
 * Motor mixer (mmix) and servo mixer (smix) for legacy F3 boards.
 * Modern UI with visual mixing representation.
 */

import { useState } from 'react';
import { useLegacyConfigStore, type LegacyMotorMix, type LegacyServoMix } from '../../stores/legacy-config-store';

// Servo input sources for iNav
const SERVO_SOURCES: Record<number, { label: string; color: string }> = {
  0: { label: 'Stabilized Roll', color: '#EF4444' },
  1: { label: 'Stabilized Pitch', color: '#22C55E' },
  2: { label: 'Stabilized Yaw', color: '#3B82F6' },
  3: { label: 'Stabilized Throttle', color: '#F59E0B' },
  4: { label: 'RC Roll', color: '#EF4444' },
  5: { label: 'RC Pitch', color: '#22C55E' },
  6: { label: 'RC Yaw', color: '#3B82F6' },
  7: { label: 'RC Throttle', color: '#F59E0B' },
  8: { label: 'RC AUX 1', color: '#8B5CF6' },
  9: { label: 'RC AUX 2', color: '#EC4899' },
  10: { label: 'RC AUX 3', color: '#06B6D4' },
  11: { label: 'RC AUX 4', color: '#10B981' },
};

// Mixing value bar component
function MixBar({ value, color, label }: { value: number; color: string; label: string }) {
  const percentage = Math.abs(value) * 100;
  const isNegative = value < 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-400">{label}</span>
        <span className="font-mono" style={{ color }}>{value.toFixed(3)}</span>
      </div>
      <div className="relative h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="absolute top-0 h-full rounded-full transition-all"
          style={{
            left: isNegative ? `${50 - percentage / 2}%` : '50%',
            width: `${percentage / 2}%`,
            backgroundColor: color,
          }}
        />
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-zinc-600" />
      </div>
    </div>
  );
}

export default function LegacyMixerTab() {
  const { motorMixer, servoMixer, updateMotorMix, updateServoMix } = useLegacyConfigStore();
  const [activeSection, setActiveSection] = useState<'motor' | 'servo'>('motor');

  const handleMotorMixChange = (mix: LegacyMotorMix) => {
    updateMotorMix(mix.index, mix);
    window.electronAPI.cliSendCommand(
      `mmix ${mix.index} ${mix.throttle.toFixed(3)} ${mix.roll.toFixed(3)} ${mix.pitch.toFixed(3)} ${mix.yaw.toFixed(3)}`
    );
  };

  const handleServoMixChange = (mix: LegacyServoMix) => {
    updateServoMix(mix.index, mix);
    window.electronAPI.cliSendCommand(
      `smix ${mix.index} ${mix.targetChannel} ${mix.inputSource} ${mix.rate} ${mix.speed} ${mix.min} ${mix.max} ${mix.box}`
    );
  };

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
        <div className="flex items-start gap-3">
          <span className="text-2xl">🔧</span>
          <div>
            <p className="text-sm text-amber-300 font-medium">Mixer Configuration</p>
            <p className="text-xs text-amber-300/70 mt-1">
              Define how motors and servos respond to flight controller outputs.
              Values range from -1.0 to 1.0. Changes are sent immediately.
            </p>
          </div>
        </div>
      </div>

      {/* Section Tabs */}
      <div className="flex gap-2 p-1 bg-zinc-900 rounded-lg w-fit">
        <button
          onClick={() => setActiveSection('motor')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeSection === 'motor'
              ? 'bg-blue-600 text-white shadow-lg'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <span className="mr-2">⚙️</span>
          Motor Mixer ({motorMixer.length})
        </button>
        <button
          onClick={() => setActiveSection('servo')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeSection === 'servo'
              ? 'bg-blue-600 text-white shadow-lg'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <span className="mr-2">🔩</span>
          Servo Mixer ({servoMixer.length})
        </button>
      </div>

      {/* Motor Mixer */}
      {activeSection === 'motor' && (
        <div>
          {motorMixer.length === 0 ? (
            <div className="text-center py-12 text-zinc-500">
              <div className="text-4xl mb-3">⚙️</div>
              <p>No motor mixer rules found.</p>
              <p className="text-sm mt-1">This is normal for fixed-wing aircraft.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {motorMixer.map((mix) => (
                <div key={mix.index} className="bg-zinc-900/50 rounded-xl border border-zinc-800 overflow-hidden">
                  {/* Header */}
                  <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-white font-bold">
                      M{mix.index}
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">Motor {mix.index}</h3>
                      <p className="text-xs text-zinc-400">Output channel</p>
                    </div>
                  </div>

                  {/* Mix values */}
                  <div className="p-4 space-y-3">
                    <MixBar value={mix.throttle} color="#F59E0B" label="Throttle" />
                    <MixBar value={mix.roll} color="#EF4444" label="Roll" />
                    <MixBar value={mix.pitch} color="#22C55E" label="Pitch" />
                    <MixBar value={mix.yaw} color="#3B82F6" label="Yaw" />

                    {/* Edit controls */}
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-800">
                      <div>
                        <label className="block text-xs text-zinc-500 mb-1">Throttle</label>
                        <input
                          type="number"
                          step="0.01"
                          min="-1"
                          max="1"
                          value={mix.throttle}
                          onChange={(e) => handleMotorMixChange({ ...mix, throttle: parseFloat(e.target.value) || 0 })}
                          className="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-white text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-zinc-500 mb-1">Roll</label>
                        <input
                          type="number"
                          step="0.01"
                          min="-1"
                          max="1"
                          value={mix.roll}
                          onChange={(e) => handleMotorMixChange({ ...mix, roll: parseFloat(e.target.value) || 0 })}
                          className="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-white text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-zinc-500 mb-1">Pitch</label>
                        <input
                          type="number"
                          step="0.01"
                          min="-1"
                          max="1"
                          value={mix.pitch}
                          onChange={(e) => handleMotorMixChange({ ...mix, pitch: parseFloat(e.target.value) || 0 })}
                          className="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-white text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-zinc-500 mb-1">Yaw</label>
                        <input
                          type="number"
                          step="0.01"
                          min="-1"
                          max="1"
                          value={mix.yaw}
                          onChange={(e) => handleMotorMixChange({ ...mix, yaw: parseFloat(e.target.value) || 0 })}
                          className="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-white text-sm"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Servo Mixer */}
      {activeSection === 'servo' && (
        <div>
          {servoMixer.length === 0 ? (
            <div className="text-center py-12 text-zinc-500">
              <div className="text-4xl mb-3">🔩</div>
              <p>No servo mixer rules found.</p>
              <p className="text-sm mt-1">Add rules to control servos from flight controller outputs.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {servoMixer.map((mix) => {
                const source = SERVO_SOURCES[mix.inputSource] || { label: `Source ${mix.inputSource}`, color: '#6B7280' };

                return (
                  <div key={mix.index} className="bg-zinc-900/50 rounded-xl border border-zinc-800 overflow-hidden">
                    {/* Header */}
                    <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-500 font-mono text-sm">Rule #{mix.index}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div
                            className="px-3 py-1 rounded-full text-sm font-medium"
                            style={{ backgroundColor: `${source.color}20`, color: source.color }}
                          >
                            {source.label}
                          </div>
                          <span className="text-zinc-500">→</span>
                          <div className="px-3 py-1 rounded-full bg-blue-500/20 text-blue-400 text-sm font-medium">
                            Servo {mix.targetChannel}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-zinc-500">Rate:</span>
                        <span
                          className={`font-mono text-sm ${mix.rate < 0 ? 'text-orange-400' : 'text-green-400'}`}
                        >
                          {mix.rate > 0 ? '+' : ''}{mix.rate}%
                        </span>
                      </div>
                    </div>

                    {/* Controls */}
                    <div className="p-5">
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <div>
                          <label className="block text-xs text-zinc-500 mb-1.5">Input Source</label>
                          <select
                            value={mix.inputSource}
                            onChange={(e) => handleServoMixChange({ ...mix, inputSource: parseInt(e.target.value) })}
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                          >
                            {Object.entries(SERVO_SOURCES).map(([id, src]) => (
                              <option key={id} value={id}>{src.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-zinc-500 mb-1.5">Rate (%)</label>
                          <input
                            type="number"
                            min="-125"
                            max="125"
                            value={mix.rate}
                            onChange={(e) => handleServoMixChange({ ...mix, rate: parseInt(e.target.value) || 0 })}
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-zinc-500 mb-1.5">Speed</label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={mix.speed}
                            onChange={(e) => handleServoMixChange({ ...mix, speed: parseInt(e.target.value) || 0 })}
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-zinc-500 mb-1.5">Min</label>
                          <input
                            type="number"
                            min="-125"
                            max="125"
                            value={mix.min}
                            onChange={(e) => handleServoMixChange({ ...mix, min: parseInt(e.target.value) || 0 })}
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-zinc-500 mb-1.5">Max</label>
                          <input
                            type="number"
                            min="-125"
                            max="125"
                            value={mix.max}
                            onChange={(e) => handleServoMixChange({ ...mix, max: parseInt(e.target.value) || 0 })}
                            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
                          />
                        </div>
                      </div>

                      {/* Rate visualization */}
                      <div className="mt-4 pt-4 border-t border-zinc-800">
                        <div className="flex items-center gap-4">
                          <span className="text-xs text-zinc-500">Mix strength:</span>
                          <div className="flex-1 relative h-2 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className="absolute top-0 h-full rounded-full transition-all"
                              style={{
                                left: mix.rate >= 0 ? '50%' : `${50 + (mix.rate / 125) * 50}%`,
                                width: `${(Math.abs(mix.rate) / 125) * 50}%`,
                                backgroundColor: source.color,
                              }}
                            />
                            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-zinc-600" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
