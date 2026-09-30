/**
 * VtxConfigTab
 *
 * VTX (Video Transmitter) configuration for Betaflight/iNav.
 * Allows configuring band, channel, power level, and pit mode.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
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
  Monitor,
  Hash,
} from 'lucide-react';

/** Prefer the i18n key; falls back to the literal. */
function vtxText(t: (key: string) => string, key: string | undefined, fallback: string): string {
  return key ? t(key) : fallback;
}

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
const VTX_TYPE_NAMES: Record<number, { name: string; nameKey?: string }> = {
  0: { name: 'Unknown', nameKey: 'vtx.type.unknown' },
  1: { name: 'Tramp' },
  2: { name: 'SmartAudio' },
  3: { name: 'RTC6705' },
  4: { name: 'MSP' },
};

// Low power disarm modes
const LOW_POWER_DISARM_OPTIONS = [
  {
    value: 0,
    label: 'Off',
    labelKey: 'vtx.disarm.off',
    description: 'Always use configured power',
    descriptionKey: 'vtx.disarm.off-desc',
  },
  {
    value: 1,
    label: 'On',
    labelKey: 'vtx.disarm.on',
    description: 'Low power when disarmed',
    descriptionKey: 'vtx.disarm.on-desc',
  },
  {
    value: 2,
    label: 'Until First Arm',
    labelKey: 'vtx.disarm.until-arm',
    description: 'Low power until first arm',
    descriptionKey: 'vtx.disarm.until-arm-desc',
  },
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
  const { t } = useTranslation('params');
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
      } else {
        setError(t('vtx.error.config-unavailable'));
      }
    } catch (err) {
      console.error('[VtxConfig] Load error:', err);
      setError(err instanceof Error ? err.message : t('vtx.error.load-failed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

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
      const saveSuccess = await window.electronAPI.mspSetVtxConfig(config);
      if (!saveSuccess) {
        setError(t('vtx.error.send-failed'));
        return;
      }

      // Save to EEPROM
      const eepromSuccess = await window.electronAPI.mspSaveEeprom();
      if (!eepromSuccess) {
        setError(t('vtx.error.eeprom-failed'));
        return;
      }

      setSuccess(t('vtx.success.saved'));
      setModified(false);
    } catch (err) {
      console.error('[VtxConfig] Save error:', err);
      setError(err instanceof Error ? err.message : t('vtx.error.save-failed'));
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
      return Array.from({ length: config.vtxTablePowerLevels }, (_, i) =>
        t('vtx.power.level-n', { n: i + 1 })
      );
    }
    return DEFAULT_POWER_LEVELS;
  }, [config?.vtxTableAvailable, config?.vtxTablePowerLevels, t]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full mb-2 mx-auto" />
          <p className="text-content-secondary">{t('vtx.loading')}</p>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* What is VTX explanation */}
        <div className="bg-purple-500/10 rounded-xl border-purple-500/30 p-5">
          <div className="flex items-start gap-4">
            <Radio className="w-10 h-10 text-purple-400 shrink-0" />
            <div>
              <h3 className="text-lg font-semibold text-purple-300">{t('vtx.about.title')}</h3>
              <p className="text-sm text-content-secondary mt-2">
                <strong>{t('vtx.about.definition')}</strong>
                {t('vtx.about.body')}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-content-secondary">
                <div className="flex items-center gap-2">
                  <Radio className="w-3.5 h-3.5 text-purple-400" />
                  <span>{t('vtx.about.frequency')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 text-purple-400" />
                  <span>{t('vtx.about.power')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Monitor className="w-3.5 h-3.5 text-purple-400" />
                  <span>{t('vtx.about.bands')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Hash className="w-3.5 h-3.5 text-purple-400" />
                  <span>{t('vtx.about.channels')}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Not detected message */}
        <div className="bg-surface rounded-xl border p-5 text-center">
          <XCircle className="w-12 h-12 text-amber-400 mx-auto mb-3" />
          <h4 className="text-content font-medium">{t('vtx.not-detected.title')}</h4>
          <p className="text-sm text-content-secondary mt-2 max-w-md mx-auto">
            {t('vtx.not-detected.body')}
          </p>

          <div className="mt-4 p-4 bg-surface-raised rounded-lg text-left">
            <p className="text-xs font-medium text-content-secondary mb-2">
              {t('vtx.not-detected.reasons-title')}
            </p>
            <ul className="text-xs text-content-secondary space-y-1">
              <li>• {t('vtx.not-detected.reason.power')}</li>
              <li>• {t('vtx.not-detected.reason.wire')}</li>
              <li>• {t('vtx.not-detected.reason.protocol')}</li>
              <li>• {t('vtx.not-detected.reason.no-remote')}</li>
            </ul>
          </div>

          <button
            onClick={loadConfig}
            className="mt-4 px-4 py-2 text-sm bg-purple-600 hover:bg-purple-500 text-white rounded-lg flex items-center gap-2 mx-auto"
          >
            <RefreshCw className="w-4 h-4" />
            {t('vtx.not-detected.retry')}
          </button>
        </div>

        {/* Skip message */}
        <p className="text-center text-xs text-content-tertiary">{t('vtx.not-detected.skip')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-4">
      {/* Header Info */}
      <div className="bg-purple-500/10 rounded-xl border-purple-500/30 p-5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center shrink-0">
            <Radio className="w-6 h-6 text-purple-400" />
          </div>
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-purple-300">{t('vtx.header.title')}</h2>
                <p className="text-sm text-content-secondary mt-1">{t('vtx.header.subtitle')}</p>
              </div>
              <div className="flex items-center gap-2">
                {config.deviceReady ? (
                  <span className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-green-500/20 text-xs text-green-400">
                    <CheckCircle className="w-3.5 h-3.5" /> {t('vtx.status.connected')}
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-yellow-500/20 text-xs text-yellow-400">
                    <AlertTriangle className="w-3.5 h-3.5" /> {t('vtx.status.not-ready')}
                  </span>
                )}
                <span className="text-xs px-2 py-1 rounded-lg bg-surface-raised text-content">
                  {vtxText(
                    t,
                    VTX_TYPE_NAMES[config.vtxType]?.nameKey,
                    VTX_TYPE_NAMES[config.vtxType]?.name ?? t('vtx.type.unknown')
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border-red-500/30 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400" />
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300">
            ×
          </button>
        </div>
      )}

      {/* Success */}
      {success && (
        <div className="bg-green-500/10 border-green-500/30 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-400" />
          <p className="text-sm text-green-400">{success}</p>
          <button onClick={() => setSuccess(null)} className="ml-auto text-green-400 hover:text-green-300">
            ×
          </button>
        </div>
      )}

      {/* Band & Channel Selection */}
      <div className="bg-surface rounded-xl border-subtle p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
            <Radio className="w-5 h-5 text-purple-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-medium text-content">{t('vtx.band-channel.title')}</h3>
            <p className="text-xs text-content-secondary">{t('vtx.band-channel.subtitle')}</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-mono text-purple-400">{frequencyDisplay}</div>
            <div className="text-xs text-content-secondary">
              {VTX_BANDS.find(b => b.value === config.band)?.label || '?'}{config.channel}
            </div>
          </div>
        </div>

        {/* Band Selection */}
        <div>
          <label className="text-xs text-content-secondary block mb-2">
            {t('vtx.band-channel.band')}
          </label>
          <div className="grid grid-cols-5 gap-2">
            {VTX_BANDS.map((band) => (
              <button
                key={band.value}
                onClick={() => updateConfig({ band: band.value })}
                className={`p-3 rounded-lg border-2 text-center transition-all ${
                  config.band === band.value
                    ? 'border-purple-500 bg-purple-500/20 text-purple-300'
                    : 'border bg-surface text-content-secondary hover:border'
                }`}
              >
                <div className="text-lg font-bold">{band.label}</div>
                <div className="text-[10px] text-content-secondary">{band.name}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Channel Selection */}
        <div>
          <label className="text-xs text-content-secondary block mb-2">
            {t('vtx.band-channel.channel')}
          </label>
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
                      : 'border bg-surface text-content-secondary hover:border'
                  }`}
                >
                  <div className="text-lg font-bold">{channel}</div>
                  <div className="text-[10px] text-content-secondary">{freq}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Frequency Chart - Visual representation */}
        <div className="mt-4 p-3 bg-surface-raised rounded-lg">
          <div className="text-xs text-content-secondary mb-2">
            {t('vtx.band-channel.overview')}
          </div>
          <div className="relative h-8">
            {/* Background scale */}
            <div className="absolute inset-0 flex items-center">
              <div className="w-full h-1 bg-surface-raised rounded" />
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
            <div className="absolute -bottom-4 left-0 text-[10px] text-content-tertiary">5645</div>
            <div className="absolute -bottom-4 right-0 text-[10px] text-content-tertiary">5945</div>
          </div>
        </div>
      </div>

      {/* Power & Pit Mode */}
      <div className="bg-surface rounded-xl border-subtle p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
            <Zap className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-content">{t('vtx.power.title')}</h3>
            <p className="text-xs text-content-secondary">{t('vtx.power.subtitle')}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Power Level */}
          <div>
            <label className="text-xs text-content-secondary block mb-2">
              {t('vtx.power.level-label')}
            </label>
            <select
              value={config.power}
              onChange={(e) => updateConfig({ power: parseInt(e.target.value, 10) })}
              className="w-full px-3 py-2 bg-surface-raised border rounded-lg text-content focus:outline-none focus:border-orange-500"
            >
              {powerLevels.map((level, idx) => (
                <option key={idx} value={idx}>
                  {level}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-content-tertiary mt-1">{t('vtx.power.heat-hint')}</p>
          </div>

          {/* Low Power Disarm */}
          <div>
            <label className="text-xs text-content-secondary block mb-2">
              {t('vtx.power.low-power-label')}
            </label>
            <select
              value={config.lowPowerDisarm}
              onChange={(e) => updateConfig({ lowPowerDisarm: parseInt(e.target.value, 10) })}
              className="w-full px-3 py-2 bg-surface-raised border rounded-lg text-content focus:outline-none focus:border-orange-500"
            >
              {LOW_POWER_DISARM_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {vtxText(t, opt.labelKey, opt.label)}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-content-tertiary mt-1">
              {vtxText(
                t,
                LOW_POWER_DISARM_OPTIONS.find(o => o.value === config.lowPowerDisarm)
                  ?.descriptionKey,
                LOW_POWER_DISARM_OPTIONS.find(o => o.value === config.lowPowerDisarm)
                  ?.description ?? ''
              )}
            </p>
          </div>
        </div>

        {/* Pit Mode Toggle */}
        <div className="p-3 bg-surface-raised rounded-lg">
          <label className="flex items-center justify-between cursor-pointer">
            <div className="flex items-center gap-3">
              <Volume2 className={`w-5 h-5 ${config.pitMode ? 'text-yellow-400' : 'text-content-secondary'}`} />
              <div>
                <span className="text-sm text-content">{t('vtx.power.pit-mode')}</span>
                <p className="text-[10px] text-content-tertiary">{t('vtx.power.pit-mode-hint')}</p>
              </div>
            </div>
            <div
              onClick={() => updateConfig({ pitMode: !config.pitMode })}
              className={`w-11 h-6 rounded-full transition-colors cursor-pointer relative ${
                config.pitMode ? 'bg-yellow-500' : 'bg-surface-inset'
              }`}
            >
              <div
                className={`absolute w-4 h-4 bg-white border border-strong shadow-sm rounded-full top-1 transition-transform ${
                  config.pitMode ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </div>
          </label>
        </div>

        {config.pitModeFrequency > 0 && (
          <div className="text-xs text-content-secondary">
            {t('vtx.power.pit-mode-frequency', { freq: config.pitModeFrequency })}
          </div>
        )}
      </div>

      {/* VTX Table Info */}
      {config.vtxTableAvailable && (
        <div className="bg-blue-500/10 rounded-xl border-blue-500/30 p-4 flex items-start gap-4">
          <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-blue-400 font-medium text-sm">{t('vtx.table.title')}</p>
            <p className="text-xs text-content-secondary mt-1">
              {t('vtx.table.summary', {
                bands: config.vtxTableBands,
                channels: config.vtxTableChannels,
                levels: config.vtxTablePowerLevels,
              })}
            </p>
          </div>
        </div>
      )}

      {/* Safety Warning */}
      <div className="bg-amber-500/10 rounded-xl border-amber-500/30 p-4 flex items-start gap-4">
        <AlertTriangle className="w-6 h-6 text-amber-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-amber-400 font-medium">{t('vtx.safety.title')}</p>
          <ul className="text-sm text-content-secondary mt-1 space-y-1 list-disc list-inside">
            <li>{t('vtx.safety.regulation')}</li>
            <li>{t('vtx.safety.pit-mode')}</li>
            <li>{t('vtx.safety.coordinate')}</li>
          </ul>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex justify-end gap-3">
        <button
          onClick={loadConfig}
          disabled={loading}
          className="px-4 py-2 text-sm bg-surface-raised text-content rounded-lg hover:bg-surface-raised flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {t('vtx.actions.refresh')}
        </button>
        <button
          onClick={saveConfig}
          disabled={!modified || saving}
          className={`px-4 py-2 text-sm rounded-lg flex items-center gap-2 ${
            modified
              ? 'bg-purple-500 text-white hover:bg-purple-400'
              : 'bg-surface-raised text-content-secondary cursor-not-allowed'
          }`}
        >
          <Save className={`w-4 h-4 ${saving ? 'animate-pulse' : ''}`} />
          {saving ? t('vtx.actions.saving') : t('vtx.actions.save')}
        </button>
      </div>
    </div>
  );
}
