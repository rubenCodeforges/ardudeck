/**
 * VtxConfigTab
 *
 * VTX (Video Transmitter) configuration for Betaflight/iNav.
 * Allows configuring band, channel, power level, and pit mode.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Radio,
  Zap,
  AlertTriangle,
  RefreshCw,
  Save,
  Info,
  CheckCircle,
  XCircle,
  Volume2,
} from 'lucide-react';

// VTX band names
const VTX_BANDS = [
  { value: 1, label: 'A', name: 'Boscam A' },
  { value: 2, label: 'B', name: 'Boscam B' },
  { value: 3, label: 'E', name: 'Boscam E' },
  { value: 4, label: 'F', name: 'Fatshark' },
  { value: 5, label: 'R', name: 'Raceband' },
];

// VTX channels (1-8)
const VTX_CHANNELS = [1, 2, 3, 4, 5, 6, 7, 8];

// Standard VTX frequency table (MHz)
const VTX_FREQUENCY_TABLE: Record<number, Record<number, number>> = {
  1: { 1: 5865, 2: 5845, 3: 5825, 4: 5805, 5: 5785, 6: 5765, 7: 5745, 8: 5725 }, // Band A
  2: { 1: 5733, 2: 5752, 3: 5771, 4: 5790, 5: 5809, 6: 5828, 7: 5847, 8: 5866 }, // Band B
  3: { 1: 5705, 2: 5685, 3: 5665, 4: 5645, 5: 5885, 6: 5905, 7: 5925, 8: 5945 }, // Band E
  4: { 1: 5740, 2: 5760, 3: 5780, 4: 5800, 5: 5820, 6: 5840, 7: 5860, 8: 5880 }, // Band F
  5: { 1: 5658, 2: 5695, 3: 5732, 4: 5769, 5: 5806, 6: 5843, 7: 5880, 8: 5917 }, // Raceband
};

// VTX device types
const VTX_TYPE_NAMES: Record<number, string> = {
  0: 'Unknown',
  1: 'Tramp',
  2: 'SmartAudio',
  3: 'RTC6705',
  4: 'MSP',
};

// Low power disarm modes
const LOW_POWER_DISARM_OPTIONS = [
  { value: 0, label: 'Off', description: 'Always use configured power' },
  { value: 1, label: 'On', description: 'Low power when disarmed' },
  { value: 2, label: 'Until First Arm', description: 'Low power until first arm' },
];

// Default power levels (mW) - actual values depend on VTX table
const DEFAULT_POWER_LEVELS = ['25mW', '100mW', '200mW', '400mW', '600mW'];

interface VtxConfig {
  vtxType: number;
  band: number;
  channel: number;
  power: number;
  pitMode: boolean;
  frequency: number;
  deviceReady: boolean;
  lowPowerDisarm: number;
  pitModeFrequency: number;
  vtxTableAvailable: boolean;
  vtxTableBands: number;
  vtxTableChannels: number;
  vtxTablePowerLevels: number;
}

interface Props {
  modified: boolean;
  setModified: (v: boolean) => void;
}

export default function VtxConfigTab({ modified, setModified }: Props) {
  const [config, setConfig] = useState<VtxConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Calculate frequency from band/channel
  const getFrequency = useCallback((band: number, channel: number): number => {
    const bandTable = VTX_FREQUENCY_TABLE[band];
    if (bandTable && bandTable[channel]) {
      return bandTable[channel];
    }
    return 0;
  }, []);

  // Load configuration
  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const data = await window.electronAPI.mspGetVtxConfig();
      if (data) {
        setConfig(data as VtxConfig);
        console.log('[VtxConfig] Loaded:', data);
      } else {
        setError('VTX configuration not available');
      }
    } catch (err) {
      console.error('[VtxConfig] Load error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load VTX config');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Update config helper
  const updateConfig = (updates: Partial<VtxConfig>) => {
    if (!config) return;

    // Calculate frequency if band or channel changes
    let newFrequency = config.frequency;
    const newBand = updates.band ?? config.band;
    const newChannel = updates.channel ?? config.channel;
    if (updates.band !== undefined || updates.channel !== undefined) {
      newFrequency = getFrequency(newBand, newChannel);
    }

    setConfig({ ...config, ...updates, frequency: newFrequency });
    setModified(true);
    setSuccess(null);
  };

  // Save configuration
  const saveConfig = async () => {
    if (!config) return;

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      console.log('[VtxConfig] Saving:', config);
      const saveSuccess = await window.electronAPI.mspSetVtxConfig(config);
      if (!saveSuccess) {
        setError('Failed to send VTX config');
        return;
      }

      // Save to EEPROM
      console.log('[VtxConfig] Saving to EEPROM...');
      const eepromSuccess = await window.electronAPI.mspSaveEeprom();
      if (!eepromSuccess) {
        setError('Config sent but EEPROM save failed - changes may not persist');
        return;
      }

      console.log('[VtxConfig] Saved successfully');
      setSuccess('VTX configuration saved');
      setModified(false);
    } catch (err) {
      console.error('[VtxConfig] Save error:', err);
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // Memoize the frequency display
  const frequencyDisplay = useMemo(() => {
    if (!config) return '---';
    return `${config.frequency} MHz`;
  }, [config?.frequency]);

  // Get power level options based on VTX table
  const powerLevels = useMemo(() => {
    if (!config) return DEFAULT_POWER_LEVELS;
    if (config.vtxTableAvailable && config.vtxTablePowerLevels > 0) {
      // Return indices if we have a VTX table
      return Array.from({ length: config.vtxTablePowerLevels }, (_, i) => `Level ${i + 1}`);
    }
    return DEFAULT_POWER_LEVELS;
  }, [config?.vtxTableAvailable, config?.vtxTablePowerLevels]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full mb-2 mx-auto" />
          <p className="text-gray-400">Loading VTX configuration...</p>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* What is VTX explanation */}
        <div className="bg-purple-500/10 rounded-xl border border-purple-500/30 p-5">
          <div className="flex items-start gap-4">
            <Radio className="w-10 h-10 text-purple-400 shrink-0" />
            <div>
              <h3 className="text-lg font-semibold text-purple-300">What is a VTX?</h3>
              <p className="text-sm text-zinc-400 mt-2">
                <strong>VTX (Video Transmitter)</strong> is the component that sends live video from your
                drone's camera to your FPV goggles or monitor. It broadcasts on specific radio frequencies
                that your goggles tune into.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-zinc-500">
                <div className="flex items-center gap-2">
                  <span className="text-purple-400">📡</span>
                  <span>Frequency: 5.8GHz band</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-purple-400">⚡</span>
                  <span>Power: 25mW - 800mW</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-purple-400">📺</span>
                  <span>Bands: A, B, E, F, Raceband</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-purple-400">🔢</span>
                  <span>Channels: 1-8 per band</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Not detected message */}
        <div className="bg-zinc-800/50 rounded-xl border border-zinc-700 p-5 text-center">
          <XCircle className="w-12 h-12 text-amber-400 mx-auto mb-3" />
          <h4 className="text-zinc-200 font-medium">VTX Not Detected</h4>
          <p className="text-sm text-zinc-500 mt-2 max-w-md mx-auto">
            Your flight controller couldn't communicate with a video transmitter.
          </p>

          <div className="mt-4 p-4 bg-zinc-900/50 rounded-lg text-left">
            <p className="text-xs font-medium text-zinc-400 mb-2">Common reasons:</p>
            <ul className="text-xs text-zinc-500 space-y-1">
              <li>• VTX not connected or powered</li>
              <li>• SmartAudio/Tramp wire not connected to FC</li>
              <li>• VTX protocol not configured in Ports tab</li>
              <li>• VTX doesn't support remote configuration</li>
            </ul>
          </div>

          <button
            onClick={loadConfig}
            className="mt-4 px-4 py-2 text-sm bg-purple-600 hover:bg-purple-500 text-white rounded-lg flex items-center gap-2 mx-auto"
          >
            <RefreshCw className="w-4 h-4" />
            Retry Detection
          </button>
        </div>

        {/* Skip message */}
        <p className="text-center text-xs text-zinc-600">
          Don't have a VTX? You can skip this tab - it's only for FPV video configuration.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-4">
      {/* Header Info */}
      <div className="bg-purple-500/10 rounded-xl border border-purple-500/30 p-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center shrink-0">
            <Radio className="w-6 h-6 text-purple-400" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-purple-300">Video Transmitter (VTX)</h2>
                <p className="text-sm text-zinc-400 mt-1">
                  Configure the frequency and power of your FPV video signal
                </p>
              </div>
              <div className="flex items-center gap-2">
                {config.deviceReady ? (
                  <span className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-green-500/20 text-xs text-green-400">
                    <CheckCircle className="w-3.5 h-3.5" /> Connected
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-yellow-500/20 text-xs text-yellow-400">
                    <AlertTriangle className="w-3.5 h-3.5" /> Not Ready
                  </span>
                )}
                <span className="text-xs px-2 py-1 rounded-lg bg-zinc-700 text-zinc-300">
                  {VTX_TYPE_NAMES[config.vtxType] || 'Unknown'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400" />
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300">
            ×
          </button>
        </div>
      )}

      {/* Success */}
      {success && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-400" />
          <p className="text-sm text-green-400">{success}</p>
          <button onClick={() => setSuccess(null)} className="ml-auto text-green-400 hover:text-green-300">
            ×
          </button>
        </div>
      )}

      {/* Band & Channel Selection */}
      <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
            <Radio className="w-5 h-5 text-purple-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-medium text-white">Band & Channel</h3>
            <p className="text-xs text-zinc-500">Select your VTX frequency</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-mono text-purple-400">{frequencyDisplay}</div>
            <div className="text-xs text-zinc-500">
              {VTX_BANDS.find(b => b.value === config.band)?.label || '?'}{config.channel}
            </div>
          </div>
        </div>

        {/* Band Selection */}
        <div>
          <label className="text-xs text-zinc-400 block mb-2">Band</label>
          <div className="grid grid-cols-5 gap-2">
            {VTX_BANDS.map((band) => (
              <button
                key={band.value}
                onClick={() => updateConfig({ band: band.value })}
                className={`p-3 rounded-lg border-2 text-center transition-all ${
                  config.band === band.value
                    ? 'border-purple-500 bg-purple-500/20 text-purple-300'
                    : 'border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600'
                }`}
              >
                <div className="text-lg font-bold">{band.label}</div>
                <div className="text-[10px] text-zinc-500">{band.name}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Channel Selection */}
        <div>
          <label className="text-xs text-zinc-400 block mb-2">Channel</label>
          <div className="grid grid-cols-8 gap-2">
            {VTX_CHANNELS.map((channel) => {
              const freq = getFrequency(config.band, channel);
              return (
                <button
                  key={channel}
                  onClick={() => updateConfig({ channel })}
                  className={`p-2 rounded-lg border-2 text-center transition-all ${
                    config.channel === channel
                      ? 'border-purple-500 bg-purple-500/20 text-purple-300'
                      : 'border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600'
                  }`}
                >
                  <div className="text-lg font-bold">{channel}</div>
                  <div className="text-[10px] text-zinc-500">{freq}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Frequency Chart - Visual representation */}
        <div className="mt-4 p-3 bg-zinc-800/50 rounded-lg">
          <div className="text-xs text-zinc-500 mb-2">Frequency Band Overview</div>
          <div className="relative h-8">
            {/* Background scale */}
            <div className="absolute inset-0 flex items-center">
              <div className="w-full h-1 bg-zinc-700 rounded" />
            </div>
            {/* Current frequency marker */}
            <div
              className="absolute top-0 bottom-0 flex items-center"
              style={{
                left: `${((config.frequency - 5645) / (5945 - 5645)) * 100}%`,
              }}
            >
              <div className="w-3 h-3 bg-purple-500 rounded-full shadow-lg shadow-purple-500/50" />
            </div>
            {/* Labels */}
            <div className="absolute -bottom-4 left-0 text-[10px] text-zinc-600">5645</div>
            <div className="absolute -bottom-4 right-0 text-[10px] text-zinc-600">5945</div>
          </div>
        </div>
      </div>

      {/* Power & Pit Mode */}
      <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
            <Zap className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-white">Power & Safety</h3>
            <p className="text-xs text-zinc-500">Configure transmit power and pit mode</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Power Level */}
          <div>
            <label className="text-xs text-zinc-400 block mb-2">Power Level</label>
            <select
              value={config.power}
              onChange={(e) => updateConfig({ power: parseInt(e.target.value, 10) })}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
            >
              {powerLevels.map((level, idx) => (
                <option key={idx} value={idx}>
                  {level}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-zinc-600 mt-1">
              Higher power = longer range but more heat
            </p>
          </div>

          {/* Low Power Disarm */}
          <div>
            <label className="text-xs text-zinc-400 block mb-2">Low Power When Disarmed</label>
            <select
              value={config.lowPowerDisarm}
              onChange={(e) => updateConfig({ lowPowerDisarm: parseInt(e.target.value, 10) })}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
            >
              {LOW_POWER_DISARM_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-zinc-600 mt-1">
              {LOW_POWER_DISARM_OPTIONS.find(o => o.value === config.lowPowerDisarm)?.description}
            </p>
          </div>
        </div>

        {/* Pit Mode Toggle */}
        <div className="p-3 bg-zinc-800/50 rounded-lg">
          <label className="flex items-center justify-between cursor-pointer">
            <div className="flex items-center gap-3">
              <Volume2 className={`w-5 h-5 ${config.pitMode ? 'text-yellow-400' : 'text-zinc-500'}`} />
              <div>
                <span className="text-sm text-zinc-300">Pit Mode</span>
                <p className="text-[10px] text-zinc-600">
                  Reduces power for bench testing or pit area use
                </p>
              </div>
            </div>
            <div
              onClick={() => updateConfig({ pitMode: !config.pitMode })}
              className={`w-11 h-6 rounded-full transition-colors cursor-pointer relative ${
                config.pitMode ? 'bg-yellow-500' : 'bg-zinc-700'
              }`}
            >
              <div
                className={`absolute w-4 h-4 bg-white rounded-full top-1 transition-transform ${
                  config.pitMode ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </div>
          </label>
        </div>

        {config.pitModeFrequency > 0 && (
          <div className="text-xs text-zinc-500">
            Pit mode frequency: {config.pitModeFrequency} MHz
          </div>
        )}
      </div>

      {/* VTX Table Info */}
      {config.vtxTableAvailable && (
        <div className="bg-blue-500/10 rounded-xl border border-blue-500/30 p-4 flex items-start gap-4">
          <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-blue-400 font-medium text-sm">VTX Table Configured</p>
            <p className="text-xs text-zinc-400 mt-1">
              {config.vtxTableBands} bands × {config.vtxTableChannels} channels, {config.vtxTablePowerLevels} power levels
            </p>
          </div>
        </div>
      )}

      {/* Safety Warning */}
      <div className="bg-amber-500/10 rounded-xl border border-amber-500/30 p-4 flex items-start gap-4">
        <AlertTriangle className="w-6 h-6 text-amber-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-amber-400 font-medium">Important</p>
          <ul className="text-sm text-zinc-400 mt-1 space-y-1 list-disc list-inside">
            <li>Check local regulations for legal power levels and frequencies</li>
            <li>Use pit mode when not flying to avoid interference</li>
            <li>Coordinate frequencies with other pilots at the field</li>
          </ul>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex justify-end gap-3">
        <button
          onClick={loadConfig}
          disabled={loading}
          className="px-4 py-2 text-sm bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
        <button
          onClick={saveConfig}
          disabled={!modified || saving}
          className={`px-4 py-2 text-sm rounded-lg flex items-center gap-2 ${
            modified
              ? 'bg-purple-500 text-white hover:bg-purple-400'
              : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
          }`}
        >
          <Save className={`w-4 h-4 ${saving ? 'animate-pulse' : ''}`} />
          {saving ? 'Saving...' : 'Save VTX Config'}
        </button>
      </div>
    </div>
  );
}
