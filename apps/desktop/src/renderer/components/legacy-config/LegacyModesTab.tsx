/**
 * Legacy Modes Tab
 *
 * Flight modes (aux) configuration for legacy F3 boards.
 * Modern UI with visual mode cards and range sliders.
 */

import { useTranslation } from 'react-i18next';
import { useLegacyConfigStore, type LegacyAuxMode } from '../../stores/legacy-config-store';
import { DraftNumberInput } from '../../hooks/useNumericDraft';
import {
  Zap, Ruler, Sunrise, Compass, Target, RefreshCw, Home, MapPin,
  Hand, Volume2, Monitor, Radio, Package, ShieldAlert, Map, Plane,
  CornerDownLeft, Settings, Camera, Rocket, OctagonX, Lightbulb, SlidersHorizontal,
  HelpCircle, type LucideIcon,
} from 'lucide-react';

// iNav mode IDs with icons and colors (names are firmware box names)
const MODE_INFO: Record<number, { name: string; icon: LucideIcon; color: string; descriptionKey: string }> = {
  0: { name: 'ARM', icon: Zap, color: 'bg-red-500', descriptionKey: 'legacy-config:legacyModesTab.modeDescriptions.m0' }, // i18n-exempt
  1: { name: 'ANGLE', icon: Ruler, color: 'bg-blue-500', descriptionKey: 'legacy-config:legacyModesTab.modeDescriptions.m1' }, // i18n-exempt
  2: { name: 'HORIZON', icon: Sunrise, color: 'bg-cyan-500', descriptionKey: 'legacy-config:legacyModesTab.modeDescriptions.m2' }, // i18n-exempt
  3: { name: 'NAV ALTHOLD', icon: SlidersHorizontal, color: 'bg-purple-500', descriptionKey: 'legacy-config:legacyModesTab.modeDescriptions.m3' }, // i18n-exempt
  5: { name: 'HEADING HOLD', icon: Compass, color: 'bg-indigo-500', descriptionKey: 'legacy-config:legacyModesTab.modeDescriptions.m5' }, // i18n-exempt
  6: { name: 'HEADFREE', icon: Target, color: 'bg-orange-500', descriptionKey: 'legacy-config:legacyModesTab.modeDescriptions.m6' }, // i18n-exempt
  7: { name: 'HEADADJ', icon: RefreshCw, color: 'bg-orange-400', descriptionKey: 'legacy-config:legacyModesTab.modeDescriptions.m7' }, // i18n-exempt
  10: { name: 'NAV RTH', icon: Home, color: 'bg-green-500', descriptionKey: 'legacy-config:legacyModesTab.modeDescriptions.m10' }, // i18n-exempt
  11: { name: 'NAV POSHOLD', icon: MapPin, color: 'bg-teal-500', descriptionKey: 'legacy-config:legacyModesTab.modeDescriptions.m11' }, // i18n-exempt
  12: { name: 'MANUAL', icon: Hand, color: 'bg-gray-500', descriptionKey: 'legacy-config:legacyModesTab.modeDescriptions.m12' }, // i18n-exempt
  13: { name: 'BEEPER', icon: Volume2, color: 'bg-yellow-500', descriptionKey: 'legacy-config:legacyModesTab.modeDescriptions.m13' }, // i18n-exempt
  19: { name: 'OSD SW', icon: Monitor, color: 'bg-surface-raised', descriptionKey: 'legacy-config:legacyModesTab.modeDescriptions.m19' }, // i18n-exempt
  20: { name: 'TELEMETRY', icon: Radio, color: 'bg-blue-400', descriptionKey: 'legacy-config:legacyModesTab.modeDescriptions.m20' }, // i18n-exempt
  26: { name: 'BLACKBOX', icon: Package, color: 'bg-pink-500', descriptionKey: 'legacy-config:legacyModesTab.modeDescriptions.m26' }, // i18n-exempt
  27: { name: 'FAILSAFE', icon: ShieldAlert, color: 'bg-red-600', descriptionKey: 'legacy-config:legacyModesTab.modeDescriptions.m27' }, // i18n-exempt
  28: { name: 'NAV WP', icon: Map, color: 'bg-emerald-500', descriptionKey: 'legacy-config:legacyModesTab.modeDescriptions.m28' }, // i18n-exempt
  35: { name: 'FLAPERON', icon: Plane, color: 'bg-sky-500', descriptionKey: 'legacy-config:legacyModesTab.modeDescriptions.m35' }, // i18n-exempt
  36: { name: 'TURN ASSIST', icon: CornerDownLeft, color: 'bg-violet-500', descriptionKey: 'legacy-config:legacyModesTab.modeDescriptions.m36' }, // i18n-exempt
  38: { name: 'SERVO AUTOTRIM', icon: Settings, color: 'bg-amber-500', descriptionKey: 'legacy-config:legacyModesTab.modeDescriptions.m38' }, // i18n-exempt
  39: { name: 'CAMERA 1', icon: Camera, color: 'bg-rose-500', descriptionKey: 'legacy-config:legacyModesTab.modeDescriptions.m39' }, // i18n-exempt
  40: { name: 'CAMERA 2', icon: Camera, color: 'bg-rose-400', descriptionKey: 'legacy-config:legacyModesTab.modeDescriptions.m40' }, // i18n-exempt
  41: { name: 'CAMERA 3', icon: Camera, color: 'bg-rose-300', descriptionKey: 'legacy-config:legacyModesTab.modeDescriptions.m41' }, // i18n-exempt
  45: { name: 'NAV CRUISE', icon: Rocket, color: 'bg-lime-500', descriptionKey: 'legacy-config:legacyModesTab.modeDescriptions.m45' }, // i18n-exempt
  46: { name: 'MC BRAKING', icon: OctagonX, color: 'bg-red-400', descriptionKey: 'legacy-config:legacyModesTab.modeDescriptions.m46' }, // i18n-exempt
};

const AUX_CHANNELS = [
  { value: 0, label: 'AUX 1', ch: 'CH5' }, // i18n-exempt
  { value: 1, label: 'AUX 2', ch: 'CH6' }, // i18n-exempt
  { value: 2, label: 'AUX 3', ch: 'CH7' }, // i18n-exempt
  { value: 3, label: 'AUX 4', ch: 'CH8' }, // i18n-exempt
  { value: 4, label: 'AUX 5', ch: 'CH9' }, // i18n-exempt
  { value: 5, label: 'AUX 6', ch: 'CH10' }, // i18n-exempt
  { value: 6, label: 'AUX 7', ch: 'CH11' }, // i18n-exempt
  { value: 7, label: 'AUX 8', ch: 'CH12' }, // i18n-exempt
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
      <div className="relative h-8 bg-surface-raised rounded-lg overflow-hidden">
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
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-surface-raised" />

        {/* Tick marks */}
        {[900, 1100, 1300, 1500, 1700, 1900, 2100].map((tick) => {
          const percent = ((tick - min) / (max - min)) * 100;
          return (
            <div
              key={tick}
              className="absolute top-0 w-px h-2 bg-surface-raised"
              style={{ left: `${percent}%` }}
            />
          );
        })}

        {/* Start handle */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-6 rounded cursor-ew-resize border-2 border-strong bg-surface-raised hover:bg-surface-raised transition-colors"
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
          className="absolute top-1/2 -translate-y-1/2 w-4 h-6 rounded cursor-ew-resize border-2 border-strong bg-surface-raised hover:bg-surface-raised transition-colors"
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
      <div className="flex justify-between text-xs text-content-secondary">
        <span>900</span>
        <span>1500</span>
        <span>2100</span>
      </div>
    </div>
  );
}

export default function LegacyModesTab() {
  const { t } = useTranslation();
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
    const info = MODE_INFO[mode.modeId] || { name: t('legacy-config:legacyModesTab.modeN', { id: mode.modeId }), icon: HelpCircle, color: 'bg-gray-500', descriptionKey: 'legacy-config:legacyModesTab.unknownMode' } as { name: string; icon: LucideIcon; color: string; descriptionKey: string };
    const isActive = !(mode.rangeStart === 900 && mode.rangeEnd === 900);
    const channel = AUX_CHANNELS.find((c) => c.value === mode.auxChannel);

    return (
      <div
        key={mode.index}
        className={`rounded-xl border transition-all ${
          isActive
            ? 'bg-surface border'
            : 'bg-surface border-subtle'
        }`}
      >
        {/* Header */}
        <div className="p-4 border-b border-subtle">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg ${info.color} flex items-center justify-center`}>
                <info.icon className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-content">{info.name}</span>
                  <span className="text-xs text-content-secondary font-mono">#{mode.index}</span>
                </div>
                <p className="text-xs text-content-secondary">{t(info.descriptionKey)}</p>
              </div>
            </div>
            {isActive && (
              <span className="px-2 py-1 rounded-full bg-green-500/20 text-green-400 text-xs font-medium">
                {t('common:active')}
              </span>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Mode selector */}
            <div>
              <label className="block text-xs text-content-secondary mb-1.5">{t('legacy-config:legacyModesTab.mode')}</label>
              <select
                value={mode.modeId}
                onChange={(e) => handleChange({ ...mode, modeId: parseInt(e.target.value) })}
                className="w-full px-3 py-2 bg-surface-raised border border rounded-lg text-content text-sm focus:border-blue-500 focus:outline-none"
              >
                {allModes.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Channel selector */}
            <div>
              <label className="block text-xs text-content-secondary mb-1.5">{t('legacy-config:legacyModesTab.switchChannel')}</label>
              <select
                value={mode.auxChannel}
                onChange={(e) => handleChange({ ...mode, auxChannel: parseInt(e.target.value) })}
                className="w-full px-3 py-2 bg-surface-raised border border rounded-lg text-content text-sm focus:border-blue-500 focus:outline-none"
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
              <label className="text-xs text-content-secondary">{t('legacy-config:legacyModesTab.activationRange')}</label>
              <div className="flex items-center gap-2 text-xs">
                <DraftNumberInput
                  min={900}
                  max={2100}
                  step="25"
                  integer
                  value={mode.rangeStart}
                  onCommit={(v) => handleChange({ ...mode, rangeStart: v })}
                  className="w-16 px-2 py-1 bg-surface-raised border border rounded text-content text-center"
                />
                <span className="text-content-secondary">-</span>
                <DraftNumberInput
                  min={900}
                  max={2100}
                  step="25"
                  integer
                  value={mode.rangeEnd}
                  onCommit={(v) => handleChange({ ...mode, rangeEnd: v })}
                  className="w-16 px-2 py-1 bg-surface-raised border border rounded text-content text-center"
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
              className="w-full py-2 text-sm text-content-secondary hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
            >
              {t('legacy-config:legacyModesTab.disableMode')}
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
          <Lightbulb className="w-6 h-6 text-amber-400 shrink-0" />
          <div>
            <p className="text-sm text-amber-300 font-medium">{t('legacy-config:legacyModesTab.title')}</p>
            <p className="text-xs text-amber-300/70 mt-1">
              {t('legacy-config:legacyModesTab.description')}
            </p>
          </div>
        </div>
      </div>

      {auxModes.length === 0 ? (
        <div className="text-center py-12 text-content-secondary">
          <SlidersHorizontal className="w-10 h-10 text-content-secondary mb-3" />
          <p>{t('legacy-config:legacyModesTab.noRules')}</p>
          <p className="text-sm mt-1">{t('legacy-config:legacyServoTab.noConfigsHint')}</p>
        </div>
      ) : (
        <>
          {/* Active Modes */}
          {activeModes.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-content mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                {t('legacy-config:legacyModesTab.activeModes', { count: activeModes.length })}
              </h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {activeModes.map(renderModeCard)}
              </div>
            </div>
          )}

          {/* Inactive Modes */}
          {inactiveModes.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-content-secondary mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-surface-raised" />
                {t('legacy-config:legacyModesTab.disabledModes', { count: inactiveModes.length })}
              </h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
                {inactiveModes.map((mode) => {
                  const info = MODE_INFO[mode.modeId] || { name: t('legacy-config:legacyModesTab.modeN', { id: mode.modeId }), icon: HelpCircle, color: 'bg-gray-500' };
                  return (
                    <div
                      key={mode.index}
                      className="flex items-center gap-3 p-3 bg-surface border border-subtle rounded-lg hover:bg-surface-input transition-colors cursor-pointer"
                      onClick={() => {
                        // Quick enable with default range
                        handleChange({ ...mode, rangeStart: 1700, rangeEnd: 2100 });
                      }}
                    >
                      <div className={`w-8 h-8 rounded-lg ${info.color} opacity-50 flex items-center justify-center`}>
                        <info.icon className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-content-secondary truncate">{info.name}</div>
                        <div className="text-xs text-content-tertiary">{t('legacy-config:legacyModesTab.clickToEnable', { index: mode.index })}</div>
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
