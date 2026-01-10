/**
 * OSD Element List
 *
 * Displays all OSD elements with toggles and position info.
 * Allows selecting elements for editing.
 */

import type { OsdElementId, OsdElementPosition } from '../../stores/osd-store';

interface Props {
  positions: Record<OsdElementId, OsdElementPosition>;
  selectedElement: OsdElementId | null;
  onSelect: (id: OsdElementId) => void;
  onToggle: (id: OsdElementId) => void;
}

/**
 * Format element ID to display name
 */
function formatElementName(id: OsdElementId): string {
  return id
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function OsdElementList({ positions, selectedElement, onSelect, onToggle }: Props) {
  const elements = Object.entries(positions) as [OsdElementId, OsdElementPosition][];

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-white">Elements</h3>
        <span className="text-xs text-gray-500">
          {elements.filter(([, pos]) => pos.enabled).length}/{elements.length} enabled
        </span>
      </div>

      <div className="overflow-y-auto space-y-0.5">
        {elements.map(([id, pos]) => (
          <div
            key={id}
            className={`
              flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors
              ${selectedElement === id ? 'bg-blue-500/20 border border-blue-500/50' : 'hover:bg-gray-700/50 border border-transparent'}
            `}
            onClick={() => onSelect(id)}
          >
            {/* Enable checkbox */}
            <input
              type="checkbox"
              checked={pos.enabled}
              onChange={(e) => {
                e.stopPropagation();
                onToggle(id);
              }}
              className="w-3.5 h-3.5 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
            />

            {/* Element name */}
            <span
              className={`flex-1 text-xs ${pos.enabled ? 'text-white' : 'text-gray-500'}`}
            >
              {formatElementName(id)}
            </span>

            {/* Position */}
            <span className="text-[10px] text-gray-500 font-mono">
              [{pos.x},{pos.y}]
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
