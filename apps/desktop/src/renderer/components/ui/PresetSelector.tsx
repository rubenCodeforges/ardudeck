/**
 * PresetSelector Component
 *
 * Reusable preset selection cards with gradient backgrounds and icons.
 * Used for PID, rates, safety, and other configuration presets.
 */

import React from 'react';
import { Wand2, type LucideIcon } from 'lucide-react';

export interface Preset {
  name: string;
  description: string;
  icon: LucideIcon;
  iconColor: string;
  color: string; // Tailwind gradient classes like "from-green-500/20 to-emerald-500/10 border-green-500/30"
}

export interface PresetSelectorProps<T extends Record<string, Preset>> {
  /** Object containing preset definitions */
  presets: T;
  /** Callback when a preset is applied */
  onApply: (key: keyof T) => void;
  /** Label shown above presets */
  label?: string;
  /** Subtitle/hint shown below label */
  hint?: string;
  /** Optional: Currently active preset key (for highlighting) */
  activeKey?: keyof T | null;
}

export function PresetSelector<T extends Record<string, Preset>>({
  presets,
  onApply,
  label = 'Quick Presets',
  hint = 'Click to apply a tuning style',
  activeKey,
}: PresetSelectorProps<T>) {
  return (
    <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/5 rounded-xl border border-indigo-500/20 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center">
            <Wand2 className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <p className="text-indigo-300 font-medium">{label}</p>
            <p className="text-xs text-gray-500">{hint}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {Object.entries(presets).map(([key, preset]) => {
            const IconComponent = preset.icon;
            const isActive = activeKey === key;
            return (
              <button
                key={key}
                onClick={() => onApply(key as keyof T)}
                className={`group flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-br ${preset.color} border hover:scale-105 transition-all duration-150 ${
                  isActive ? 'ring-2 ring-white/30 shadow-lg' : ''
                }`}
                title={preset.description}
              >
                <IconComponent className={`w-4 h-4 ${preset.iconColor}`} />
                <span className="text-sm text-gray-200 group-hover:text-white">{preset.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Compact preset selector variant for tighter spaces
 */
export function CompactPresetSelector<T extends Record<string, Preset>>({
  presets,
  onApply,
  activeKey,
}: Omit<PresetSelectorProps<T>, 'label' | 'hint'>) {
  return (
    <div className="flex gap-2 flex-wrap">
      {Object.entries(presets).map(([key, preset]) => {
        const IconComponent = preset.icon;
        const isActive = activeKey === key;
        return (
          <button
            key={key}
            onClick={() => onApply(key as keyof T)}
            className={`group flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-br ${preset.color} border hover:scale-105 transition-all duration-150 ${
              isActive ? 'ring-2 ring-white/30 shadow-lg' : ''
            }`}
            title={preset.description}
          >
            <IconComponent className={`w-4 h-4 ${preset.iconColor}`} />
            <span className="text-sm text-gray-200 group-hover:text-white">{preset.name}</span>
          </button>
        );
      })}
    </div>
  );
}

export default PresetSelector;
