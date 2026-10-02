/**
 * Camera Preset Selector - Dropdown with grouped presets and custom option.
 */
import { useState, useRef, useEffect } from 'react';
import type { CameraPreset } from './survey-types';
import { CAMERA_PRESET_GROUPS, CUSTOM_CAMERA, MANUAL_CAMERA } from './camera-presets';
import { useSettingsStore } from '../../stores/settings-store';
import { useTranslation } from 'react-i18next';

interface CameraPresetSelectorProps {
  value: CameraPreset;
  onChange: (preset: CameraPreset) => void;
}

export function CameraPresetSelector({ value, onChange }: CameraPresetSelectorProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const userCameraPresets = useSettingsStore((s) => s.userCameraPresets);
  const removeCameraPreset = useSettingsStore((s) => s.removeCameraPreset);

  const savedMatches = userCameraPresets.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  const filteredGroups = CAMERA_PRESET_GROUPS.map(group => ({
    ...group,
    presets: group.presets.filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()),
    ),
  })).filter(group => group.presets.length > 0);

  const isCustom = value.name === 'Custom';
  const isManual = value.name === 'Manual';

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => { setIsOpen(!isOpen); setSearch(''); }}
        className="w-full px-3 py-2 text-left text-xs bg-surface-raised border border rounded-lg text-content hover:border transition-colors flex items-center justify-between"
      >
        <span className="truncate">{isCustom ? t('survey:cameraPresets.custom') : isManual ? t('survey:cameraPresets.manual') : value.name}</span>
        <svg className={`w-3.5 h-3.5 text-content-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Sensor info summary */}
      {!isCustom && !isManual && (
        <div className="mt-1 text-[10px] text-content-secondary leading-tight">
          {t('survey:cameraPresetSelector.sensorSummary', { sensorWidth: value.sensorWidth, sensorHeight: value.sensorHeight, focalLength: value.focalLength, imageWidth: value.imageWidth, imageHeight: value.imageHeight })}
        </div>
      )}
      {isManual && (
        <div className="mt-1 text-[10px] text-content-secondary leading-tight">
          {t('survey:cameraPresetSelector.manualSummary')}
        </div>
      )}

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-surface-solid border border rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
          {/* Search */}
          <div className="sticky top-0 bg-surface-solid p-2 border-b border-subtle">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('survey:cameraPresetSelector.searchPlaceholder')}
              className="w-full px-2 py-1 text-xs bg-surface-input border border rounded text-content placeholder-content-tertiary focus:border-purple-500 focus:outline-none"
              autoFocus
            />
          </div>

          {/* Groups */}
          {filteredGroups.map(group => (
            <div key={group.group}>
              <div className="px-3 py-1 text-[10px] font-medium text-content-secondary uppercase tracking-wider bg-surface-input">
                {group.groupKey ? t(group.groupKey) : group.group}
              </div>
              {group.presets.map(preset => (
                <button
                  key={preset.name}
                  onClick={() => { onChange(preset); setIsOpen(false); }}
                  className={`w-full px-3 py-1.5 text-left text-xs hover:bg-purple-600/20 transition-colors ${
                    value.name === preset.name ? 'text-purple-300 bg-purple-600/10' : 'text-content'
                  }`}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          ))}

          {/* User-saved cameras — appear in their own group with a delete affordance. */}
          {savedMatches.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[10px] font-medium text-content-secondary uppercase tracking-wider bg-surface-input">
                {t('survey:cameraPresetSelector.saved')}
              </div>
              {savedMatches.map((preset) => (
                <div
                  key={preset.name}
                  className={`group flex items-center hover:bg-purple-600/20 transition-colors ${
                    value.name === preset.name ? 'bg-purple-600/10' : ''
                  }`}
                >
                  <button
                    onClick={() => { onChange({ ...preset }); setIsOpen(false); }}
                    className={`flex-1 px-3 py-1.5 text-left text-xs ${
                      value.name === preset.name ? 'text-purple-300' : 'text-content'
                    }`}
                  >
                    {preset.name}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeCameraPreset(preset.name); }}
                    className="opacity-0 group-hover:opacity-100 px-2 text-content-tertiary hover:text-red-400 transition-opacity"
                    title={t('survey:cameraPresetSelector.deleteSaved')}
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Custom & Manual options — both are user-defined, but Custom still
              uses camera optics (sensor/focal) while Manual skips them entirely
              and sets the line spacing directly. */}
          <div className="border-t border-subtle">
            <button
              onClick={() => { onChange({ ...CUSTOM_CAMERA }); setIsOpen(false); }}
              className={`w-full px-3 py-1.5 text-left text-xs hover:bg-purple-600/20 transition-colors ${
                isCustom ? 'text-purple-300 bg-purple-600/10' : 'text-content-secondary'
              }`}
              title={t('survey:cameraPresetSelector.customTitle')}
            >
              <div className="font-medium">{t('survey:cameraPresetSelector.customLabel')}</div>
              <div className="text-[10px] text-content-tertiary">{t('survey:cameraPresetSelector.customHint')}</div>
            </button>
            <button
              onClick={() => { onChange({ ...MANUAL_CAMERA }); setIsOpen(false); }}
              className={`w-full px-3 py-1.5 text-left text-xs hover:bg-purple-600/20 transition-colors ${
                isManual ? 'text-purple-300 bg-purple-600/10' : 'text-content-secondary'
              }`}
              title={t('survey:cameraPresetSelector.manualTitle')}
            >
              <div className="font-medium">{t('survey:cameraPresetSelector.manualLabel')}</div>
              <div className="text-[10px] text-content-tertiary">{t('survey:cameraPresetSelector.manualHint')}</div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
