/**
 * Legacy Modes Tab
 *
 * Flight modes (aux) configuration for legacy F3 boards.
 * Modern UI with visual mode cards and range sliders.
 */

import { useLegacyConfigStore, type LegacyAuxMode } from '../../stores/legacy-config-store';

// iNav mode IDs with icons and colors
const MODE_INFO: Record<number, { name: string; icon: string; color: string; description: string }> = {
  0: { name: 'ARM', icon: '⚡', color: 'bg-red-500', description: 'Enable motors' },
  1: { name: 'ANGLE', icon: '📐', color: 'bg-blue-500', description: 'Self-leveling mode' },
  2: { name: 'HORIZON', icon: '🌅', color: 'bg-cyan-500', description: 'Hybrid self-level + acro' },
  3: { name: 'NAV ALTHOLD', icon: '📏', color: 'bg-purple-500', description: 'Hold altitude' },
  5: { name: 'HEADING HOLD', icon: '🧭', color: 'bg-indigo-500', description: 'Hold compass heading' },
  6: { name: 'HEADFREE', icon: '🎯', color: 'bg-orange-500', description: 'Headless mode' },
  7: { name: 'HEADADJ', icon: '🔄', color: 'bg-orange-400', description: 'Adjust headfree reference' },
  10: { name: 'NAV RTH', icon: '🏠', color: 'bg-green-500', description: 'Return to home' },
  11: { name: 'NAV POSHOLD', icon: '📍', color: 'bg-teal-500', description: 'Hold GPS position' },
  12: { name: 'MANUAL', icon: '✋', color: 'bg-gray-500', description: 'Direct passthrough' },
  13: { name: 'BEEPER', icon: '🔊', color: 'bg-yellow-500', description: 'Find my quad' },
  19: { name: 'OSD SW', icon: '📺', color: 'bg-gray-600', description: 'Toggle OSD' },
  20: { name: 'TELEMETRY', icon: '📡', color: 'bg-blue-400', description: 'Enable telemetry' },
  26: { name: 'BLACKBOX', icon: '📦', color: 'bg-pink-500', description: 'Log flight data' },
  27: { name: 'FAILSAFE', icon: '🛡️', color: 'bg-red-600', description: 'Emergency failsafe' },
  28: { name: 'NAV WP', icon: '🗺️', color: 'bg-emerald-500', description: 'Waypoint mission' },
  35: { name: 'FLAPERON', icon: '✈️', color: 'bg-sky-500', description: 'Flaperon control' },
  36: { name: 'TURN ASSIST', icon: '↩️', color: 'bg-violet-500', description: 'Coordinated turns' },
  38: { name: 'SERVO AUTOTRIM', icon: '⚙️', color: 'bg-amber-500', description: 'Auto trim servos' },
  39: { name: 'CAMERA 1', icon: '📷', color: 'bg-rose-500', description: 'Camera control 1' },
  40: { name: 'CAMERA 2', icon: '📷', color: 'bg-rose-400', description: 'Camera control 2' },
  41: { name: 'CAMERA 3', icon: '📷', color: 'bg-rose-300', description: 'Camera control 3' },
  45: { name: 'NAV CRUISE', icon: '🚀', color: 'bg-lime-500', description: 'Cruise control' },
  46: { name: 'MC BRAKING', icon: '🛑', color: 'bg-red-400', description: 'Multi-rotor braking' },
};

const AUX_CHANNELS = [
  { value: 0, label: 'AUX 1', ch: 'CH5' },
  { value: 1, label: 'AUX 2', ch: 'CH6' },
  { value: 2, label: 'AUX 3', ch: 'CH7' },
  { value: 3, label: 'AUX 4', ch: 'CH8' },
  { value: 4, label: 'AUX 5', ch: 'CH9' },
  { value: 5, label: 'AUX 6', ch: 'CH10' },
  { value: 6, label: 'AUX 7', ch: 'CH11' },
  { value: 7, label: 'AUX 8', ch: 'CH12' },
];

// Range slider component
function RangeSlider({
  start,
  end,
  onStartChange,
  onEndChange,
  color,
}: {
  start: number;
  end: number;
  onStartChange: (v: number) => void;
  onEndChange: (v: number) => void;
  color: string;
}) {
  const min = 900;
  const max = 2100;
  const startPercent = ((start - min) / (max - min)) * 100;
  const endPercent = ((end - min) / (max - min)) * 100;
  const isDisabled = start === 900 && end === 900;

  return (
    <div className="space-y-2">
      <div className="relative h-8 bg-zinc-800 rounded-lg overflow-hidden">
        {/* Range highlight */}
        {!isDisabled && (
          <div
            className="absolute h-full transition-all"
            style={{
              left: `${startPercent}%`,
              width: `${endPercent - startPercent}%`,
              backgroundColor: color,
              opacity: 0.4,
            }}
          />
        )}

        {/* Center line */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-zinc-600" />

        {/* Tick marks */}
        {[900, 1100, 1300, 1500, 1700, 1900, 2100].map((tick) => {
          const percent = ((tick - min) / (max - min)) * 100;
          return (
            <div
              key={tick}
              className="absolute top-0 w-px h-2 bg-zinc-600"
              style={{ left: `${percent}%` }}
            />
          );
        })}

        {/* Start handle */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-6 rounded cursor-ew-resize border-2 border-white/50 bg-zinc-700 hover:bg-zinc-600 transition-colors"
          style={{ left: `calc(${startPercent}% - 8px)` }}
          onMouseDown={(e) => {
            const bar = e.currentTarget.parentElement!;
            const rect = bar.getBoundingClientRect();
            const onMove = (ev: MouseEvent) => {
              const x = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
              const value = Math.round((min + x * (max - min)) / 25) * 25;
              if (value < end) onStartChange(value);
            };
            const onUp = () => {
              document.removeEventListener('mousemove', onMove);
              document.removeEventListener('mouseup', onUp);
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
          }}
        />

        {/* End handle */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-6 rounded cursor-ew-resize border-2 border-white/50 bg-zinc-700 hover:bg-zinc-600 transition-colors"
          style={{ left: `calc(${endPercent}% - 8px)` }}
          onMouseDown={(e) => {
            const bar = e.currentTarget.parentElement!;
            const rect = bar.getBoundingClientRect();
            const onMove = (ev: MouseEvent) => {
              const x = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
              const value = Math.round((min + x * (max - min)) / 25) * 25;
              if (value > start) onEndChange(value);
            };
            const onUp = () => {
              document.removeEventListener('mousemove', onMove);
              document.removeEventListener('mouseup', onUp);
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
          }}
        />
      </div>

      {/* Labels */}
      <div className="flex justify-between text-xs text-zinc-500">
        <span>900</span>
        <span>1500</span>
        <span>2100</span>
      </div>
    </div>
  );
}

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
  const allModes = Object.entries(MODE_INFO)
    .map(([id, info]) => ({ id: parseInt(id), ...info }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Group modes by active/inactive
  const activeModes = auxModes.filter((m) => !(m.rangeStart === 900 && m.rangeEnd === 900));
  const inactiveModes = auxModes.filter((m) => m.rangeStart === 900 && m.rangeEnd === 900);

  const renderModeCard = (mode: LegacyAuxMode) => {
    const info = MODE_INFO[mode.modeId] || { name: `Mode ${mode.modeId}`, icon: '?', color: 'bg-gray-500', description: 'Unknown mode' };
    const isActive = !(mode.rangeStart === 900 && mode.rangeEnd === 900);
    const channel = AUX_CHANNELS.find((c) => c.value === mode.auxChannel);

    return (
      <div
        key={mode.index}
        className={`rounded-xl border transition-all ${
          isActive
            ? 'bg-zinc-900/70 border-zinc-700'
            : 'bg-zinc-900/30 border-zinc-800'
        }`}
      >
        {/* Header */}
        <div className="p-4 border-b border-zinc-800">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg ${info.color} flex items-center justify-center text-xl`}>
                {info.icon}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white">{info.name}</span>
                  <span className="text-xs text-zinc-500 font-mono">#{mode.index}</span>
                </div>
                <p className="text-xs text-zinc-400">{info.description}</p>
              </div>
            </div>
            {isActive && (
              <span className="px-2 py-1 rounded-full bg-green-500/20 text-green-400 text-xs font-medium">
                Active
              </span>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Mode selector */}
            <div>
              <label className="block text-xs text-zinc-500 mb-1.5">Mode</label>
              <select
                value={mode.modeId}
                onChange={(e) => handleChange({ ...mode, modeId: parseInt(e.target.value) })}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
              >
                {allModes.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.icon} {m.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Channel selector */}
            <div>
              <label className="block text-xs text-zinc-500 mb-1.5">Switch Channel</label>
              <select
                value={mode.auxChannel}
                onChange={(e) => handleChange({ ...mode, auxChannel: parseInt(e.target.value) })}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:border-blue-500 focus:outline-none"
              >
                {AUX_CHANNELS.map((ch) => (
                  <option key={ch.value} value={ch.value}>
                    {ch.label} ({ch.ch})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Range slider */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-zinc-500">Activation Range</label>
              <div className="flex items-center gap-2 text-xs">
                <input
                  type="number"
                  min="900"
                  max="2100"
                  step="25"
                  value={mode.rangeStart}
                  onChange={(e) => handleChange({ ...mode, rangeStart: parseInt(e.target.value) || 900 })}
                  className="w-16 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-white text-center"
                />
                <span className="text-zinc-500">-</span>
                <input
                  type="number"
                  min="900"
                  max="2100"
                  step="25"
                  value={mode.rangeEnd}
                  onChange={(e) => handleChange({ ...mode, rangeEnd: parseInt(e.target.value) || 900 })}
                  className="w-16 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-white text-center"
                />
              </div>
            </div>
            <RangeSlider
              start={mode.rangeStart}
              end={mode.rangeEnd}
              onStartChange={(v) => handleChange({ ...mode, rangeStart: v })}
              onEndChange={(v) => handleChange({ ...mode, rangeEnd: v })}
              color={info.color.replace('bg-', '#').replace('-500', '')}
            />
          </div>

          {/* Quick disable */}
          {isActive && (
            <button
              onClick={() => handleChange({ ...mode, rangeStart: 900, rangeEnd: 900 })}
              className="w-full py-2 text-sm text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
            >
              Disable Mode
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
        <div className="flex items-start gap-3">
          <span className="text-2xl">💡</span>
          <div>
            <p className="text-sm text-amber-300 font-medium">Flight Mode Configuration</p>
            <p className="text-xs text-amber-300/70 mt-1">
              Set which AUX switch positions activate each flight mode.
              Drag the range handles or enter values directly. Set both to 900 to disable.
            </p>
          </div>
        </div>
      </div>

      {auxModes.length === 0 ? (
        <div className="text-center py-12 text-zinc-500">
          <div className="text-4xl mb-3">🎛️</div>
          <p>No aux mode rules found.</p>
          <p className="text-sm mt-1">Run the dump command to load configuration.</p>
        </div>
      ) : (
        <>
          {/* Active Modes */}
          {activeModes.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                Active Modes ({activeModes.length})
              </h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {activeModes.map(renderModeCard)}
              </div>
            </div>
          )}

          {/* Inactive Modes */}
          {inactiveModes.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-zinc-400 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-zinc-600" />
                Disabled ({inactiveModes.length})
              </h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
                {inactiveModes.map((mode) => {
                  const info = MODE_INFO[mode.modeId] || { name: `Mode ${mode.modeId}`, icon: '?', color: 'bg-gray-500' };
                  return (
                    <div
                      key={mode.index}
                      className="flex items-center gap-3 p-3 bg-zinc-900/30 border border-zinc-800 rounded-lg hover:bg-zinc-900/50 transition-colors cursor-pointer"
                      onClick={() => {
                        // Quick enable with default range
                        handleChange({ ...mode, rangeStart: 1700, rangeEnd: 2100 });
                      }}
                    >
                      <div className={`w-8 h-8 rounded-lg ${info.color} opacity-50 flex items-center justify-center text-lg`}>
                        {info.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-zinc-400 truncate">{info.name}</div>
                        <div className="text-xs text-zinc-600">#{mode.index} - Click to enable</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
