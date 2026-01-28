/**
 * Filter Config Tab - Betaflight Filter Configuration
 *
 * Configure gyro and D-term filters, dynamic notch, and other
 * noise filtering settings for optimal flight performance.
 *
 * This tab is only shown for Betaflight boards.
 */

import { useState, useEffect, useCallback } from 'react';
import { DraggableSlider } from '../ui/DraggableSlider';
import { Activity, AlertTriangle, Settings, Waves, Save, RefreshCw, Zap, Filter as FilterIcon } from 'lucide-react';

// Filter config interface (matches MSPFilterConfig)
interface FilterConfig {
  // Gyro lowpass filters
  gyroLowpassHz: number;
  dTermLowpassHz: number;
  yawLowpassHz: number;
  // Gyro notch filter
  gyroNotchHz: number;
  gyroNotchCutoff: number;
  // D-term notch filter
  dTermNotchHz: number;
  dTermNotchCutoff: number;
  // Second gyro notch
  gyroNotch2Hz: number;
  gyroNotch2Cutoff: number;
  // Filter types
  gyroLowpassType: number;
  gyroLowpass2Hz: number;
  gyroLowpass2Type: number;
  dTermLowpass2Hz: number;
  dTermLowpassType: number;
  dTermLowpass2Type: number;
  // Dynamic notch
  dynNotchRange: number;
  dynNotchWidthPercent: number;
  dynNotchQ: number;
  dynNotchMinHz: number;
  dynNotchMaxHz: number;
  dynNotchCount: number;
  // ABG filter
  abgAlpha: number;
  abgBoost: number;
  abgHalfLife: number;
}

// Default values
const DEFAULT_CONFIG: FilterConfig = {
  gyroLowpassHz: 150,
  dTermLowpassHz: 150,
  yawLowpassHz: 100,
  gyroNotchHz: 0,
  gyroNotchCutoff: 0,
  dTermNotchHz: 0,
  dTermNotchCutoff: 0,
  gyroNotch2Hz: 0,
  gyroNotch2Cutoff: 0,
  gyroLowpassType: 0,
  gyroLowpass2Hz: 0,
  gyroLowpass2Type: 0,
  dTermLowpass2Hz: 0,
  dTermLowpassType: 0,
  dTermLowpass2Type: 0,
  dynNotchRange: 0,
  dynNotchWidthPercent: 8,
  dynNotchQ: 350,
  dynNotchMinHz: 100,
  dynNotchMaxHz: 350,
  dynNotchCount: 3,
  abgAlpha: 0,
  abgBoost: 275,
  abgHalfLife: 20,
};

// Filter type options
const FILTER_TYPES = [
  { value: 0, label: 'PT1', description: 'First order, gentle slope' },
  { value: 1, label: 'Biquad', description: 'Second order, steeper' },
  { value: 2, label: 'PT2', description: 'Second order PT' },
  { value: 3, label: 'PT3', description: 'Third order PT' },
];

interface Props {
  modified?: boolean;
  setModified?: (v: boolean) => void;
}

export default function FilterConfigTab({ setModified }: Props) {
  // State
  const [config, setConfig] = useState<FilterConfig>(DEFAULT_CONFIG);
  const [originalConfig, setOriginalConfig] = useState<FilterConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Check if modified
  const hasChanges = JSON.stringify(config) !== JSON.stringify(originalConfig);

  // Load config from FC
  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const filterConfig = await window.electronAPI.mspGetFilterConfig() as FilterConfig | null;

      if (filterConfig) {
        setConfig(filterConfig);
        setOriginalConfig(filterConfig);
      }
    } catch (err) {
      console.error('[FilterConfigTab] Failed to load config:', err);
      setError('Failed to load filter configuration');
    } finally {
      setLoading(false);
    }
  }, []);

  // Save config to FC
  const saveConfig = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await window.electronAPI.mspSetFilterConfig(config);
      if (!result) {
        setError('Failed to save filter settings');
        setSaving(false);
        return;
      }

      // Save to EEPROM
      await window.electronAPI.mspSaveEeprom();

      setOriginalConfig({ ...config });
      setSuccess('Filter settings saved!');
      setModified?.(false);
    } catch (err) {
      console.error('[FilterConfigTab] Failed to save:', err);
      setError('Failed to save filter settings');
    } finally {
      setSaving(false);
    }
  };

  // Load on mount
  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Update modified state
  useEffect(() => {
    setModified?.(hasChanges);
  }, [hasChanges, setModified]);

  // Update field helper
  const updateConfig = (field: keyof FilterConfig, value: number) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-full px-4 space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-500/10 to-violet-500/5 rounded-xl border border-purple-500/30 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
              <Waves className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-purple-300">Filter Configuration</h2>
              <p className="text-sm text-gray-400">
                Configure noise filtering for smooth and clean flight
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadConfig}
              disabled={loading}
              className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded-lg text-sm flex items-center gap-2 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={saveConfig}
              disabled={saving || !hasChanges}
              className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
                hasChanges
                  ? 'bg-purple-600 hover:bg-purple-500 text-white'
                  : 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
              }`}
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 bg-green-500/20 border border-green-500/30 rounded-lg text-green-400 text-sm flex items-center gap-2">
          <Waves className="w-4 h-4" />
          {success}
        </div>
      )}

      {/* Main Settings Grid */}
      <div className="grid grid-cols-2 gap-6">
        {/* Gyro Filters Section */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-blue-400" />
            <h3 className="text-white font-medium">Gyro Filters</h3>
          </div>
          <div className="space-y-4">
            <DraggableSlider
              label="Lowpass 1 (Hz)"
              value={config.gyroLowpassHz}
              onChange={(v) => updateConfig('gyroLowpassHz', v)}
              min={0}
              max={500}
              step={5}
              color="#3B82F6"
              hint="Primary noise filter (0 = off)"
            />
            <div className="flex items-center gap-4">
              <label className="text-sm text-gray-400 min-w-[100px]">Type</label>
              <select
                value={config.gyroLowpassType}
                onChange={(e) => updateConfig('gyroLowpassType', parseInt(e.target.value, 10))}
                className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
              >
                {FILTER_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
            <DraggableSlider
              label="Lowpass 2 (Hz)"
              value={config.gyroLowpass2Hz}
              onChange={(v) => updateConfig('gyroLowpass2Hz', v)}
              min={0}
              max={500}
              step={5}
              color="#60A5FA"
              hint="Secondary filter (0 = off)"
            />
            <DraggableSlider
              label="Yaw Lowpass (Hz)"
              value={config.yawLowpassHz}
              onChange={(v) => updateConfig('yawLowpassHz', v)}
              min={0}
              max={500}
              step={5}
              color="#93C5FD"
              hint="Yaw-specific filtering"
            />
          </div>
        </div>

        {/* D-Term Filters Section */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-5 h-5 text-orange-400" />
            <h3 className="text-white font-medium">D-Term Filters</h3>
          </div>
          <div className="space-y-4">
            <DraggableSlider
              label="Lowpass 1 (Hz)"
              value={config.dTermLowpassHz}
              onChange={(v) => updateConfig('dTermLowpassHz', v)}
              min={0}
              max={500}
              step={5}
              color="#F97316"
              hint="Primary D-term filter (0 = off)"
            />
            <div className="flex items-center gap-4">
              <label className="text-sm text-gray-400 min-w-[100px]">Type</label>
              <select
                value={config.dTermLowpassType}
                onChange={(e) => updateConfig('dTermLowpassType', parseInt(e.target.value, 10))}
                className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500"
              >
                {FILTER_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
            <DraggableSlider
              label="Lowpass 2 (Hz)"
              value={config.dTermLowpass2Hz}
              onChange={(v) => updateConfig('dTermLowpass2Hz', v)}
              min={0}
              max={500}
              step={5}
              color="#FB923C"
              hint="Secondary D-term filter (0 = off)"
            />
          </div>
        </div>
      </div>

      {/* Dynamic Notch Section */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <FilterIcon className="w-5 h-5 text-cyan-400" />
          <h3 className="text-white font-medium">Dynamic Notch Filter</h3>
          <span className="text-xs text-gray-500">Tracks and removes motor noise</span>
        </div>
        <div className="grid grid-cols-3 gap-6">
          <div className="space-y-4">
            <DraggableSlider
              label="Min Frequency (Hz)"
              value={config.dynNotchMinHz}
              onChange={(v) => updateConfig('dynNotchMinHz', v)}
              min={30}
              max={500}
              step={5}
              color="#06B6D4"
              hint="Lower frequency bound"
            />
            <DraggableSlider
              label="Max Frequency (Hz)"
              value={config.dynNotchMaxHz}
              onChange={(v) => updateConfig('dynNotchMaxHz', v)}
              min={100}
              max={1000}
              step={10}
              color="#22D3EE"
              hint="Upper frequency bound"
            />
          </div>
          <div className="space-y-4">
            <DraggableSlider
              label="Notch Count"
              value={config.dynNotchCount}
              onChange={(v) => updateConfig('dynNotchCount', v)}
              min={0}
              max={8}
              step={1}
              color="#67E8F9"
              hint="Number of notches (0 = off)"
            />
            <DraggableSlider
              label="Q Factor"
              value={config.dynNotchQ}
              onChange={(v) => updateConfig('dynNotchQ', v)}
              min={50}
              max={1000}
              step={10}
              color="#A5F3FC"
              hint="Notch width (higher = narrower)"
            />
          </div>
          <div className="space-y-4">
            <DraggableSlider
              label="Width Percent"
              value={config.dynNotchWidthPercent}
              onChange={(v) => updateConfig('dynNotchWidthPercent', v)}
              min={0}
              max={20}
              step={1}
              color="#0EA5E9"
              hint="Notch width adjustment"
            />
          </div>
        </div>
      </div>

      {/* Advanced Settings (Collapsible) */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full px-5 py-4 flex items-center justify-between hover:bg-zinc-800/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-gray-400" />
            <h3 className="text-white font-medium">Advanced Settings</h3>
            <span className="text-xs text-gray-500">(Notch Filters & ABG)</span>
          </div>
          <svg
            className={`w-5 h-5 text-gray-400 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showAdvanced && (
          <div className="px-5 pb-5 border-t border-zinc-800">
            <div className="grid grid-cols-2 gap-6 mt-4">
              {/* Static Notch Filters */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-purple-400">Gyro Notch 1</h4>
                <DraggableSlider
                  label="Center (Hz)"
                  value={config.gyroNotchHz}
                  onChange={(v) => updateConfig('gyroNotchHz', v)}
                  min={0}
                  max={500}
                  step={5}
                  color="#A855F7"
                  hint="0 = disabled"
                />
                <DraggableSlider
                  label="Cutoff (Hz)"
                  value={config.gyroNotchCutoff}
                  onChange={(v) => updateConfig('gyroNotchCutoff', v)}
                  min={0}
                  max={500}
                  step={5}
                  color="#C084FC"
                />
                <h4 className="text-sm font-medium text-purple-400 mt-4">Gyro Notch 2</h4>
                <DraggableSlider
                  label="Center (Hz)"
                  value={config.gyroNotch2Hz}
                  onChange={(v) => updateConfig('gyroNotch2Hz', v)}
                  min={0}
                  max={500}
                  step={5}
                  color="#D8B4FE"
                  hint="0 = disabled"
                />
                <DraggableSlider
                  label="Cutoff (Hz)"
                  value={config.gyroNotch2Cutoff}
                  onChange={(v) => updateConfig('gyroNotch2Cutoff', v)}
                  min={0}
                  max={500}
                  step={5}
                  color="#E9D5FF"
                />
              </div>

              {/* D-Term Notch & ABG */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-orange-400">D-Term Notch</h4>
                <DraggableSlider
                  label="Center (Hz)"
                  value={config.dTermNotchHz}
                  onChange={(v) => updateConfig('dTermNotchHz', v)}
                  min={0}
                  max={500}
                  step={5}
                  color="#F97316"
                  hint="0 = disabled"
                />
                <DraggableSlider
                  label="Cutoff (Hz)"
                  value={config.dTermNotchCutoff}
                  onChange={(v) => updateConfig('dTermNotchCutoff', v)}
                  min={0}
                  max={500}
                  step={5}
                  color="#FB923C"
                />
                <h4 className="text-sm font-medium text-green-400 mt-4">ABG Filter</h4>
                <DraggableSlider
                  label="Alpha"
                  value={config.abgAlpha}
                  onChange={(v) => updateConfig('abgAlpha', v)}
                  min={0}
                  max={1000}
                  step={10}
                  color="#22C55E"
                  hint="0 = disabled"
                />
                <DraggableSlider
                  label="Boost"
                  value={config.abgBoost}
                  onChange={(v) => updateConfig('abgBoost', v)}
                  min={0}
                  max={1000}
                  step={10}
                  color="#4ADE80"
                />
                <DraggableSlider
                  label="Half Life"
                  value={config.abgHalfLife}
                  onChange={(v) => updateConfig('abgHalfLife', v)}
                  min={0}
                  max={100}
                  step={1}
                  color="#86EFAC"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Help Text */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Activity className="w-5 h-5 text-blue-400 mt-0.5" />
          <div>
            <h4 className="font-medium text-blue-300">Filter Tuning Tips</h4>
            <ul className="text-sm text-gray-400 mt-2 space-y-1">
              <li><strong>Lowpass:</strong> Lower values = more filtering, less noise, but more delay. Start at 150Hz.</li>
              <li><strong>Dynamic Notch:</strong> Automatically tracks motor noise. Set min/max to bracket your motor frequencies.</li>
              <li><strong>D-Term:</strong> More aggressive filtering here reduces motor heat and oscillations.</li>
              <li><strong>Set to 0:</strong> Disables that filter completely.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
