/**
 * ModeCard
 *
 * Displays a single mode with:
 * - Icon, name, and description
 * - Beginner-friendly explanation
 * - RC channel bar with live indicator
 * - Edit/delete buttons for advanced mode
 */

import React from 'react';
import type { MSPModeRange } from '@ardudeck/msp-ts';
import { MODE_INFO, AUX_CHANNELS } from '../presets/mode-presets';
import RcChannelBar from './RcChannelBar';
import { HelpCircle, Pencil, Trash2, Settings2 } from 'lucide-react';

interface ModeCardProps {
  mode: MSPModeRange;
  rcValue: number;
  onEdit?: () => void;
  onDelete?: () => void;
  onConfigure?: (tabId: string) => void; // Navigate to configure tab
  expanded?: boolean;
  showDescription?: boolean;
  readOnly?: boolean;
  /** Dynamic mode name from FC (overrides hardcoded name when provided) */
  dynamicName?: string;
}

export const ModeCard: React.FC<ModeCardProps> = ({
  mode,
  rcValue,
  onEdit,
  onDelete,
  onConfigure,
  expanded = false,
  showDescription = true,
  readOnly = false,
  dynamicName,
}) => {
  const modeInfo = MODE_INFO[mode.boxId];
  const info = modeInfo || {
    name: `Mode ${mode.boxId}`,
    icon: HelpCircle,
    description: 'Unknown mode',
    color: 'bg-zinc-500',
    beginner: '',
  };
  // Use dynamic name from FC if provided (for Betaflight compatibility)
  const displayName = dynamicName || info.name;
  const IconComponent = info.icon;

  const auxChannel = AUX_CHANNELS[mode.auxChannel];
  const isActive = rcValue >= mode.rangeStart && rcValue <= mode.rangeEnd;

  return (
    <div
      className={`rounded-xl border transition-all ${
        isActive
          ? 'bg-zinc-800/80 border-green-500/50 shadow-lg shadow-green-500/10'
          : 'bg-zinc-800/50 border-zinc-700/50'
      }`}
    >
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Icon with color */}
          <div
            className={`w-10 h-10 rounded-lg ${info.color}/20 flex items-center justify-center`}
          >
            <IconComponent className={`w-5 h-5 ${info.color.replace('bg-', 'text-')}`} />
          </div>

          {/* Name and description */}
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-zinc-100">{displayName}</h3>
              {info.essential && (
                <span className="px-1.5 py-0.5 text-[10px] bg-amber-500/20 text-amber-400 rounded">
                  ESSENTIAL
                </span>
              )}
            </div>
            <p className="text-sm text-zinc-400">{info.description}</p>
          </div>
        </div>

        {/* Channel badge + Actions */}
        <div className="flex items-center gap-2">
          <div className="px-2 py-1 bg-zinc-700 rounded text-xs text-zinc-300">
            {auxChannel?.name || `AUX ${mode.auxChannel + 1}`}
          </div>

          {/* Configure button (for modes with configurable settings) */}
          {modeInfo?.configureTab && onConfigure && (
            <button
              onClick={() => onConfigure(modeInfo.configureTab!)}
              className="px-2 py-1 text-xs bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 rounded-lg transition-colors flex items-center gap-1"
              title={`Configure ${displayName} settings`}
            >
              <Settings2 className="w-3 h-3" />
              Configure
            </button>
          )}

          {!readOnly && (
            <>
              {onEdit && (
                <button
                  onClick={onEdit}
                  className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 rounded-lg transition-colors"
                  title="Edit mode"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              )}
              {onDelete && (
                <button
                  onClick={onDelete}
                  className="p-2 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  title="Remove mode"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Beginner description */}
      {showDescription && info.beginner && (expanded || info.essential) && (
        <div className="px-4 pb-3">
          <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <p className="text-sm text-blue-200">{info.beginner}</p>
          </div>
        </div>
      )}

      {/* RC Channel Bar */}
      <div className="px-4 pb-4">
        <RcChannelBar
          rangeStart={mode.rangeStart}
          rangeEnd={mode.rangeEnd}
          rcValue={rcValue}
          color={info.color}
          compact={!expanded}
        />
      </div>

      {/* Range info (expanded only) */}
      {expanded && (
        <div className="px-4 pb-4 pt-0 flex items-center justify-between text-xs text-zinc-500">
          <span>
            Range: <span className="font-mono text-zinc-300">{mode.rangeStart}</span> -{' '}
            <span className="font-mono text-zinc-300">{mode.rangeEnd}</span>
          </span>
          <span>
            Channel: <span className="text-zinc-300">{auxChannel?.name}</span>
          </span>
        </div>
      )}
    </div>
  );
};

export default ModeCard;
