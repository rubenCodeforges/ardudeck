/**
 * Legacy Mixer Tab
 *
 * Motor mixer (mmix) and servo mixer (smix) for legacy F3 boards.
 * Displays and edits mixing rules via CLI commands.
 */

import { useState } from 'react';
import { useLegacyConfigStore, type LegacyMotorMix, type LegacyServoMix } from '../../stores/legacy-config-store';

// Servo input sources for iNav
const SERVO_SOURCES = [
  { value: 0, label: 'Stabilized Roll' },
  { value: 1, label: 'Stabilized Pitch' },
  { value: 2, label: 'Stabilized Yaw' },
  { value: 3, label: 'Stabilized Throttle' },
  { value: 4, label: 'RC Roll' },
  { value: 5, label: 'RC Pitch' },
  { value: 6, label: 'RC Yaw' },
  { value: 7, label: 'RC Throttle' },
  { value: 8, label: 'RC AUX 1' },
  { value: 9, label: 'RC AUX 2' },
  { value: 10, label: 'RC AUX 3' },
  { value: 11, label: 'RC AUX 4' },
];

export default function LegacyMixerTab() {
  const { motorMixer, servoMixer, updateMotorMix, updateServoMix } = useLegacyConfigStore();
  const [activeSection, setActiveSection] = useState<'motor' | 'servo'>('motor');

  const handleMotorMixChange = (mix: LegacyMotorMix) => {
    updateMotorMix(mix.index, mix);
    // Send CLI command: mmix <index> <throttle> <roll> <pitch> <yaw>
    window.electronAPI.cliSendCommand(
      `mmix ${mix.index} ${mix.throttle.toFixed(3)} ${mix.roll.toFixed(3)} ${mix.pitch.toFixed(3)} ${mix.yaw.toFixed(3)}`
    );
  };

  const handleServoMixChange = (mix: LegacyServoMix) => {
    updateServoMix(mix.index, mix);
    // Send CLI command: smix <index> <target> <input> <rate> <speed> <min> <max> <box>
    window.electronAPI.cliSendCommand(
      `smix ${mix.index} ${mix.targetChannel} ${mix.inputSource} ${mix.rate} ${mix.speed} ${mix.min} ${mix.max} ${mix.box}`
    );
  };

  return (
    <div className="space-y-4">
      <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
        <p className="text-sm text-blue-300">
          <strong>Mixer Configuration:</strong> Define how motors and servos respond to flight controller outputs.
          Changes are sent immediately. Save to EEPROM when done.
        </p>
      </div>

      {/* Section tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveSection('motor')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeSection === 'motor'
              ? 'bg-blue-600 text-white'
              : 'bg-zinc-800 text-zinc-400 hover:text-white'
          }`}
        >
          Motor Mixer ({motorMixer.length})
        </button>
        <button
          onClick={() => setActiveSection('servo')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeSection === 'servo'
              ? 'bg-blue-600 text-white'
              : 'bg-zinc-800 text-zinc-400 hover:text-white'
          }`}
        >
          Servo Mixer ({servoMixer.length})
        </button>
      </div>

      {/* Motor Mixer */}
      {activeSection === 'motor' && (
        <div className="space-y-3">
          {motorMixer.length === 0 ? (
            <div className="text-center py-8 text-zinc-500">
              No motor mixer rules found. This is normal for fixed-wing aircraft.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-6 gap-2 text-xs text-zinc-500 font-medium px-2">
                <div>Index</div>
                <div>Throttle</div>
                <div>Roll</div>
                <div>Pitch</div>
                <div>Yaw</div>
                <div></div>
              </div>
              {motorMixer.map((mix) => (
                <div key={mix.index} className="grid grid-cols-6 gap-2 bg-zinc-900 rounded-lg p-2 border border-zinc-800">
                  <div className="flex items-center text-zinc-400 font-mono">#{mix.index}</div>
                  <input
                    type="number"
                    step="0.001"
                    min="-1"
                    max="1"
                    value={mix.throttle}
                    onChange={(e) => handleMotorMixChange({ ...mix, throttle: parseFloat(e.target.value) || 0 })}
                    className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-white text-sm"
                  />
                  <input
                    type="number"
                    step="0.001"
                    min="-1"
                    max="1"
                    value={mix.roll}
                    onChange={(e) => handleMotorMixChange({ ...mix, roll: parseFloat(e.target.value) || 0 })}
                    className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-white text-sm"
                  />
                  <input
                    type="number"
                    step="0.001"
                    min="-1"
                    max="1"
                    value={mix.pitch}
                    onChange={(e) => handleMotorMixChange({ ...mix, pitch: parseFloat(e.target.value) || 0 })}
                    className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-white text-sm"
                  />
                  <input
                    type="number"
                    step="0.001"
                    min="-1"
                    max="1"
                    value={mix.yaw}
                    onChange={(e) => handleMotorMixChange({ ...mix, yaw: parseFloat(e.target.value) || 0 })}
                    className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-white text-sm"
                  />
                  <div></div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Servo Mixer */}
      {activeSection === 'servo' && (
        <div className="space-y-3">
          {servoMixer.length === 0 ? (
            <div className="text-center py-8 text-zinc-500">
              No servo mixer rules found. Add rules to control servos.
            </div>
          ) : (
            <>
              <div className="text-xs text-zinc-500 mb-2">
                Servo mixer maps flight controller outputs to servo channels with mixing rules.
              </div>
              {servoMixer.map((mix) => (
                <div key={mix.index} className="bg-zinc-900 rounded-lg p-3 border border-zinc-800">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-zinc-400 font-mono text-sm">Rule #{mix.index}</span>
                    <span className="text-zinc-600">→</span>
                    <span className="text-blue-400 text-sm">Servo {mix.targetChannel}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Input Source</label>
                      <select
                        value={mix.inputSource}
                        onChange={(e) => handleServoMixChange({ ...mix, inputSource: parseInt(e.target.value) })}
                        className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-white text-sm"
                      >
                        {SERVO_SOURCES.map((src) => (
                          <option key={src.value} value={src.value}>{src.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Rate</label>
                      <input
                        type="number"
                        min="-125"
                        max="125"
                        value={mix.rate}
                        onChange={(e) => handleServoMixChange({ ...mix, rate: parseInt(e.target.value) || 0 })}
                        className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Min</label>
                      <input
                        type="number"
                        min="-125"
                        max="125"
                        value={mix.min}
                        onChange={(e) => handleServoMixChange({ ...mix, min: parseInt(e.target.value) || 0 })}
                        className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-500 mb-1">Max</label>
                      <input
                        type="number"
                        min="-125"
                        max="125"
                        value={mix.max}
                        onChange={(e) => handleServoMixChange({ ...mix, max: parseInt(e.target.value) || 0 })}
                        className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-white text-sm"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
