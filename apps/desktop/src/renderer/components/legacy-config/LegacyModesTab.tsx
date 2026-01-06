/**
 * Legacy Modes Tab
 *
 * Flight modes (aux) configuration for legacy F3 boards.
 * Uses aux <index> <mode> <channel> <start> <end> <logic> CLI command.
 */

import { useLegacyConfigStore, type LegacyAuxMode } from '../../stores/legacy-config-store';

// iNav mode IDs (common ones)
const MODE_NAMES: Record<number, string> = {
  0: 'ARM',
  1: 'ANGLE',
  2: 'HORIZON',
  3: 'NAV ALTHOLD',
  5: 'HEADING HOLD',
  6: 'HEADFREE',
  7: 'HEADADJ',
  10: 'NAV RTH',
  11: 'NAV POSHOLD',
  12: 'MANUAL',
  13: 'BEEPER',
  19: 'OSD SW',
  20: 'TELEMETRY',
  26: 'BLACKBOX',
  27: 'FAILSAFE',
  28: 'NAV WP',
  35: 'FLAPERON',
  36: 'TURN ASSIST',
  38: 'SERVO AUTOTRIM',
  39: 'CAMERA 1',
  40: 'CAMERA 2',
  41: 'CAMERA 3',
  45: 'NAV CRUISE',
  46: 'MC BRAKING',
};

const AUX_CHANNELS = [
  { value: 0, label: 'AUX 1 (CH5)' },
  { value: 1, label: 'AUX 2 (CH6)' },
  { value: 2, label: 'AUX 3 (CH7)' },
  { value: 3, label: 'AUX 4 (CH8)' },
  { value: 4, label: 'AUX 5 (CH9)' },
  { value: 5, label: 'AUX 6 (CH10)' },
  { value: 6, label: 'AUX 7 (CH11)' },
  { value: 7, label: 'AUX 8 (CH12)' },
];

export default function LegacyModesTab() {
  const { auxModes, updateAuxMode } = useLegacyConfigStore();

  const handleChange = (mode: LegacyAuxMode) => {
    updateAuxMode(mode.index, mode);
    // Send CLI command: aux <index> <mode> <channel> <start> <end> <logic>
    window.electronAPI.cliSendCommand(
      `aux ${mode.index} ${mode.modeId} ${mode.auxChannel} ${mode.rangeStart} ${mode.rangeEnd} ${mode.logic}`
    );
  };

  // Get all unique modes sorted by name
  const allModes = Object.entries(MODE_NAMES)
    .map(([id, name]) => ({ id: parseInt(id), name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
        <p className="text-sm text-blue-300">
          <strong>Flight Modes:</strong> Configure which AUX channels activate flight modes.
          Set range to 900-900 to disable a mode. Changes are sent immediately.
        </p>
      </div>

      {auxModes.length === 0 ? (
        <div className="text-center py-8 text-zinc-500">
          No aux mode rules found. Modes may not be configured.
        </div>
      ) : (
        <div className="space-y-3">
          {auxModes.map((mode) => (
            <div key={mode.index} className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs text-zinc-500 font-mono">#{mode.index}</span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  mode.rangeStart === 900 && mode.rangeEnd === 900
                    ? 'bg-zinc-700 text-zinc-400'
                    : 'bg-blue-500/20 text-blue-300'
                }`}>
                  {MODE_NAMES[mode.modeId] || `Mode ${mode.modeId}`}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Mode</label>
                  <select
                    value={mode.modeId}
                    onChange={(e) => handleChange({ ...mode, modeId: parseInt(e.target.value) })}
                    className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-white text-sm"
                  >
                    {allModes.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Channel</label>
                  <select
                    value={mode.auxChannel}
                    onChange={(e) => handleChange({ ...mode, auxChannel: parseInt(e.target.value) })}
                    className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-white text-sm"
                  >
                    {AUX_CHANNELS.map((ch) => (
                      <option key={ch.value} value={ch.value}>{ch.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Range Start</label>
                  <input
                    type="number"
                    min="900"
                    max="2100"
                    step="25"
                    value={mode.rangeStart}
                    onChange={(e) => handleChange({ ...mode, rangeStart: parseInt(e.target.value) || 900 })}
                    className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-500 mb-1">Range End</label>
                  <input
                    type="number"
                    min="900"
                    max="2100"
                    step="25"
                    value={mode.rangeEnd}
                    onChange={(e) => handleChange({ ...mode, rangeEnd: parseInt(e.target.value) || 900 })}
                    className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-white text-sm"
                  />
                </div>
              </div>

              {/* Visual range indicator */}
              <div className="mt-3 relative h-2 bg-zinc-800 rounded overflow-hidden">
                {mode.rangeStart !== 900 || mode.rangeEnd !== 900 ? (
                  <div
                    className="absolute h-full bg-green-500/50"
                    style={{
                      left: `${((mode.rangeStart - 900) / 1200) * 100}%`,
                      width: `${((mode.rangeEnd - mode.rangeStart) / 1200) * 100}%`,
                    }}
                  />
                ) : null}
              </div>
              <div className="flex justify-between text-xs text-zinc-600 mt-1">
                <span>900</span>
                <span>1500</span>
                <span>2100</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
