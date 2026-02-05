/**
 * OSD Element Browser
 *
 * Categorized accordion browser for all OSD elements.
 * Features search, collapsible groups, inline font previews,
 * and element enable/select controls.
 */

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useOsdStore, type OsdElementId, type OsdElementPosition } from '../../stores/osd-store';
import { ELEMENT_CATEGORIES, type OsdElementCategory } from '../../utils/osd/element-categories';
import { ELEMENT_REGISTRY, getElementsByCategory, type OsdElementDefinition } from '../../utils/osd/element-registry';
import { OSD_CHAR_WIDTH, OSD_CHAR_HEIGHT, getCharacterDataUrl } from '../../utils/osd/font-renderer';

interface Props {
  selectedElement: OsdElementId | null;
  onSelect: (id: OsdElementId) => void;
}

export function OsdElementBrowser({ selectedElement, onSelect }: Props) {
  const elementPositions = useOsdStore((s) => s.elementPositions);
  const toggleElement = useOsdStore((s) => s.toggleElement);
  const currentFont = useOsdStore((s) => s.currentFont);

  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<OsdElementCategory>>(() => {
    // Start with categories that have enabled elements expanded
    const expanded = new Set<OsdElementCategory>();
    for (const def of ELEMENT_REGISTRY) {
      if (elementPositions[def.id]?.enabled) {
        expanded.add(def.category);
      }
    }
    return expanded;
  });

  // Group elements by category
  const groupedElements = useMemo(() => getElementsByCategory(), []);

  // Filter elements by search
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groupedElements;

    const query = searchQuery.toLowerCase();
    const filtered = new Map<OsdElementCategory, OsdElementDefinition[]>();

    for (const [cat, elements] of groupedElements) {
      const matching = elements.filter(
        (el) =>
          el.name.toLowerCase().includes(query) ||
          el.description.toLowerCase().includes(query) ||
          el.id.includes(query)
      );
      if (matching.length > 0) {
        filtered.set(cat, matching);
      }
    }

    return filtered;
  }, [groupedElements, searchQuery]);

  // Auto-expand categories when searching
  useEffect(() => {
    if (searchQuery.trim()) {
      setExpandedCategories(new Set(filteredGroups.keys()));
    }
  }, [searchQuery, filteredGroups]);

  const toggleCategory = useCallback((cat: OsdElementCategory) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  // Count enabled elements per category
  const enabledCounts = useMemo(() => {
    const counts = new Map<OsdElementCategory, number>();
    for (const def of ELEMENT_REGISTRY) {
      const cat = def.category;
      const count = counts.get(cat) || 0;
      if (elementPositions[def.id]?.enabled) {
        counts.set(cat, count + 1);
      } else {
        counts.set(cat, count);
      }
    }
    return counts;
  }, [elementPositions]);

  const totalEnabled = useMemo(
    () => Object.values(elementPositions).filter((p) => p.enabled).length,
    [elementPositions]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-3 border-b border-gray-700">
        <input
          type="text"
          placeholder="Search elements..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-gray-800 text-white text-xs rounded px-2.5 py-1.5 border border-gray-600 focus:border-blue-500 focus:outline-none placeholder-gray-500"
        />
        <div className="mt-1.5 text-[10px] text-gray-500">
          {totalEnabled} of {ELEMENT_REGISTRY.length} enabled
        </div>
      </div>

      {/* Accordion list */}
      <div className="flex-1 overflow-y-auto">
        {ELEMENT_CATEGORIES.map((catDef) => {
          const elements = filteredGroups.get(catDef.id);
          if (!elements || elements.length === 0) return null;

          const isExpanded = expandedCategories.has(catDef.id);
          const enabledCount = enabledCounts.get(catDef.id) || 0;

          return (
            <div key={catDef.id} className="border-b border-gray-800">
              {/* Category header */}
              <button
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-800/50 text-left"
                onClick={() => toggleCategory(catDef.id)}
              >
                <svg
                  className={`w-3 h-3 text-gray-500 shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M9 18l6-6-6-6" />
                </svg>
                <span className="text-xs font-medium text-gray-300 flex-1">{catDef.name}</span>
                {enabledCount > 0 && (
                  <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 rounded-full">
                    {enabledCount}
                  </span>
                )}
              </button>

              {/* Elements */}
              {isExpanded && (
                <div className="pb-1">
                  {elements.map((def) => {
                    const pos = elementPositions[def.id];
                    if (!pos) return null;
                    const isSelected = selectedElement === def.id;

                    return (
                      <ElementRow
                        key={def.id}
                        def={def}
                        position={pos}
                        isSelected={isSelected}
                        currentFont={currentFont}
                        onSelect={onSelect}
                        onToggle={toggleElement}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Single element row with checkbox, font preview, name, and position
 */
function ElementRow({
  def,
  position,
  isSelected,
  currentFont,
  onSelect,
  onToggle,
}: {
  def: OsdElementDefinition;
  position: OsdElementPosition;
  isSelected: boolean;
  currentFont: ReturnType<typeof useOsdStore.getState>['currentFont'];
  onSelect: (id: OsdElementId) => void;
  onToggle: (id: OsdElementId) => void;
}) {
  // Get font preview data URL
  const previewSrc = useMemo(() => {
    if (!currentFont || !def.previewSymbol) return null;
    try {
      return getCharacterDataUrl(currentFont, def.previewSymbol, 1);
    } catch {
      return null;
    }
  }, [currentFont, def.previewSymbol]);

  return (
    <div
      className={`
        flex items-center gap-1.5 pl-7 pr-3 py-1 cursor-pointer
        ${isSelected ? 'bg-blue-500/15' : 'hover:bg-gray-800/30'}
      `}
      onClick={() => onSelect(def.id)}
      title={def.description}
    >
      <input
        type="checkbox"
        checked={position.enabled}
        onChange={(e) => {
          e.stopPropagation();
          onToggle(def.id);
        }}
        className="w-3 h-3 rounded-sm bg-gray-700 border-gray-600 text-blue-500 shrink-0"
      />

      {/* Inline font preview */}
      {previewSrc && (
        <img
          src={previewSrc}
          alt=""
          className="shrink-0 opacity-70"
          style={{
            width: OSD_CHAR_WIDTH,
            height: OSD_CHAR_HEIGHT,
            imageRendering: 'pixelated',
          }}
        />
      )}

      <span
        className={`flex-1 text-[11px] truncate ${position.enabled ? 'text-gray-200' : 'text-gray-500'}`}
      >
        {def.name}
      </span>

      {position.enabled && (
        <span className="text-[9px] text-gray-600 font-mono shrink-0">
          {position.x},{position.y}
        </span>
      )}
    </div>
  );
}
