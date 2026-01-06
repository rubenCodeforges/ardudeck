/**
 * Legacy PID Tab
 *
 * PID tuning for legacy F3 boards via CLI commands.
 * Uses set p_roll, i_roll, d_roll, etc.
 */

import { useLegacyConfigStore } from '../../stores/legacy-config-store';

export default function LegacyPidTab() {
  const { pid, updatePid } = useLegacyConfigStore();

  if (!pid) {
    return (
      <div className="text-center py-8 text-zinc-500">
        No PID data loaded. Run dump command first.
      </div>
    );
  }

  const handleChange = (axis: 'roll' | 'pitch' | 'yaw', field: 'p' | 'i' | 'd' | 'ff', value: number) => {
    const updated = { ...pid };
    updated[axis] = { ...updated[axis], [field]: value };
    updatePid(updated);

    // Send CLI command
    const paramName = field === 'ff' ? `f_${axis}` : `${field}_${axis}`;
    window.electronAPI.cliSendCommand(`set ${paramName} = ${value}`);
  };

  const renderAxisPid = (axis: 'roll' | 'pitch' | 'yaw', label: string) => (
    <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
      <h3 className="text-sm font-medium text-zinc-300 mb-3">{label}</h3>
      <div className="grid grid-cols-4 gap-3">
        {['p', 'i', 'd', 'ff'].map((field) => (
          <div key={field}>
            <label className="block text-xs text-zinc-500 uppercase mb-1">{field}</label>
            <input
              type="number"
              value={pid[axis][field as 'p' | 'i' | 'd' | 'ff'] || 0}
              onChange={(e) => handleChange(axis, field as 'p' | 'i' | 'd' | 'ff', parseInt(e.target.value) || 0)}
              className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-white text-sm"
            />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
        <p className="text-sm text-blue-300">
          <strong>Legacy CLI Mode:</strong> Changes are sent immediately via CLI commands.
          Click "Save to EEPROM" when done to persist changes.
        </p>
      </div>

      {renderAxisPid('roll', 'Roll')}
      {renderAxisPid('pitch', 'Pitch')}
      {renderAxisPid('yaw', 'Yaw')}

      {pid.level && (
        <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
          <h3 className="text-sm font-medium text-zinc-300 mb-3">Level (Angle Mode)</h3>
          <div className="grid grid-cols-3 gap-3">
            {['p', 'i', 'd'].map((field) => (
              <div key={field}>
                <label className="block text-xs text-zinc-500 uppercase mb-1">{field}</label>
                <input
                  type="number"
                  value={pid.level![field as 'p' | 'i' | 'd'] || 0}
                  onChange={(e) => {
                    const updated = { ...pid };
                    updated.level = { ...updated.level!, [field]: parseInt(e.target.value) || 0 };
                    updatePid(updated);
                    window.electronAPI.cliSendCommand(`set ${field}_level = ${e.target.value}`);
                  }}
                  className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-white text-sm"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
