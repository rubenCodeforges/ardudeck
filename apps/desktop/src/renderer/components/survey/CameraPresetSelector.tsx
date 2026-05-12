/**
 * Camera Preset Selector - Dropdown with grouped presets and custom option.
 */
import { useState, useRef, useEffect } from 'react';
import type { CameraPreset } from './survey-types';
import { CAMERA_PRESET_GROUPS, CUSTOM_CAMERA, MANUAL_CAMERA } from './camera-presets';

interface CameraPresetSelectorProps {
  value: CameraPreset;
  onChange: (preset: CameraPreset) => void;
}

export function CameraPresetSelector({ value, onChange }: CameraPresetSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

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
        <span className="truncate">{value.name}</span>
        <svg className={`w-3.5 h-3.5 text-content-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Sensor info summary */}
      {!isCustom && !isManual && (
        <div className="mt-1 text-[10px] text-content-secondary leading-tight">
          {value.sensorWidth}x{value.sensorHeight}mm sensor, {value.focalLength}mm, {value.imageWidth}x{value.imageHeight}px
        </div>
      )}
      {isManual && (
        <div className="mt-1 text-[10px] text-content-secondary leading-tight">
          Corridor width set directly (no camera)
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
              placeholder="Search cameras..."
              className="w-full px-2 py-1 text-xs bg-surface-input border border rounded text-content placeholder-content-tertiary focus:border-purple-500 focus:outline-none"
              autoFocus
            />
          </div>

          {/* Groups */}
          {filteredGroups.map(group => (
            <div key={group.group}>
              <div className="px-3 py-1 text-[10px] font-medium text-content-secondary uppercase tracking-wider bg-surface-input">
                {group.group}
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

          {/* Custom & Manual options — both are user-defined, but Custom still
              uses camera optics (sensor/focal) while Manual skips them entirely
              and sets the line spacing directly. */}
          <div className="border-t border-subtle">
            <button
              onClick={() => { onChange({ ...CUSTOM_CAMERA }); setIsOpen(false); }}
              className={`w-full px-3 py-1.5 text-left text-xs hover:bg-purple-600/20 transition-colors ${
                isCustom ? 'text-purple-300 bg-purple-600/10' : 'text-content-secondary'
              }`}
              title="Camera not in presets — enter sensor/focal specs to compute the footprint"
            >
              <div className="font-medium">Custom camera...</div>
              <div className="text-[10px] text-content-tertiary">Enter sensor + focal length</div>
            </button>
            <button
              onClick={() => { onChange({ ...MANUAL_CAMERA }); setIsOpen(false); }}
              className={`w-full px-3 py-1.5 text-left text-xs hover:bg-purple-600/20 transition-colors ${
                isManual ? 'text-purple-300 bg-purple-600/10' : 'text-content-secondary'
              }`}
              title="No camera — set the line spacing directly (e.g. rover/lawnmower deck width)"
            >
              <div className="font-medium">No camera (manual width)...</div>
              <div className="text-[10px] text-content-tertiary">Set corridor width directly (rover/mower)</div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
