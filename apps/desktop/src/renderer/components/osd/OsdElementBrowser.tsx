/**
 * OSD Element Browser
 *
 * Categorized accordion browser for all OSD elements.
 * Features search, collapsible groups, inline font previews,
 * and element enable/select controls.
 */

import { useState, useMemo, useRef, useEffect, useCallback, useSyncExternalStore } from 'react';

/** Prefer the i18n key when the codemod added one, else the literal. */
function osdText(t: (key: string) => string, key: string | undefined, fallback: string): string {
  return key ? t(key) : fallback;
}
import { useTranslation } from 'react-i18next';
import { useOsdStore, type OsdElementId, type OsdElementKey, type OsdElementPosition } from '../../stores/osd-store';
import { ELEMENT_CATEGORIES, type OsdElementCategory } from '../../utils/osd/element-categories';
import { getAllOsdElements, type AnyOsdElementDef } from '../../utils/osd/element-registry';
import {
  subscribeModuleOsdElements,
  getModuleOsdElement,
} from '../../modules/module-osd-registry';
import { OSD_CHAR_WIDTH, OSD_CHAR_HEIGHT, getCharacterDataUrl } from '../../utils/osd/font-renderer';
import { useGatedOffOsdElements } from '../../modules/capabilities';

interface Props {
  selectedElement: OsdElementKey | null;
  onSelect: (id: OsdElementKey) => void;
}

/** Snapshot count so useSyncExternalStore re-renders when the module set changes. */
function useModuleOsdRevision(): number {
  return useSyncExternalStore(
    subscribeModuleOsdElements,
    () => getAllOsdElements().length,
  );
}

export function OsdElementBrowser({ selectedElement, onSelect }: Props) {
  const { t } = useTranslation('osd');
  const elementPositions = useOsdStore((s) => s.elementPositions);
  const toggleElement = useOsdStore((s) => s.toggleElement);
  const currentFont = useOsdStore((s) => s.currentFont);
  const supportedElements = useOsdStore((s) => s.supportedElements);
  const target = useOsdStore((s) => s.target);

  // Re-read (built-in + module) elements whenever the module set changes.
  const moduleRev = useModuleOsdRevision();
  // Cargo-gated built-in elements (see CAPABILITIES) hide while their cargo is off.
  const gatedOffElements = useGatedOffOsdElements();
  const allElements = useMemo(
    () => getAllOsdElements().filter((el) => !gatedOffElements.has(el.id)),
    [moduleRev, gatedOffElements],
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<OsdElementCategory>>(() => {
    // Start with categories that have enabled elements expanded
    const expanded = new Set<OsdElementCategory>();
    for (const def of getAllOsdElements()) {
      if (elementPositions[def.id]?.enabled) {
        expanded.add(def.category as OsdElementCategory);
      }
    }
    return expanded;
  });

  // Group elements by category (built-ins + module contributions)
  const groupedElements = useMemo(() => {
    const map = new Map<OsdElementCategory, AnyOsdElementDef[]>();
    for (const def of allElements) {
      const cat = def.category as OsdElementCategory;
      const list = map.get(cat) ?? [];
      list.push(def);
      map.set(cat, list);
    }
    return map;
  }, [allElements]);

  // Filter elements by search
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groupedElements;

    const query = searchQuery.toLowerCase();
    const filtered = new Map<OsdElementCategory, AnyOsdElementDef[]>();

    for (const [cat, elements] of groupedElements) {
      const matching = elements.filter(
        (el) =>
          // Match what the user sees, not the source literal.
          osdText(t, el.nameKey, el.name).toLowerCase().includes(query) ||
          osdText(t, el.descriptionKey, el.description).toLowerCase().includes(query) ||
          el.id.includes(query)
      );
      if (matching.length > 0) {
        filtered.set(cat, matching);
      }
    }

    return filtered;
    // `t` belongs here: the filter matches on translated names/descriptions, so
    // the memo must recompute when the language changes.
  }, [groupedElements, searchQuery, t]);

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
    for (const def of allElements) {
      const cat = def.category as OsdElementCategory;
      const count = counts.get(cat) || 0;
      if (elementPositions[def.id]?.enabled) {
        counts.set(cat, count + 1);
      } else {
        counts.set(cat, count);
      }
    }
    return counts;
  }, [elementPositions, allElements]);

  const totalEnabled = useMemo(
    () => Object.values(elementPositions).filter((p) => p.enabled).length,
    [elementPositions]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-3 border-b border-subtle">
        <input
          type="text"
          placeholder={t('browser.search-placeholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-surface-raised text-content text-xs rounded px-2.5 py-1.5 border border-subtle focus:border-blue-500 focus:outline-none placeholder-content-tertiary"
        />
        <div className="mt-1.5 text-[10px] text-content-secondary">
          {totalEnabled} of {allElements.length} enabled
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
            <div key={catDef.id} className="border-b border-subtle">
              {/* Category header */}
              <button
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface text-left"
                onClick={() => toggleCategory(catDef.id)}
              >
                <svg
                  className={`w-3 h-3 text-content-secondary shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M9 18l6-6-6-6" />
                </svg>
                <span className="text-xs font-medium text-content flex-1">{catDef.name}</span>
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
                    // Module elements render ground-side, so the ArduPilot FC
                    // support gate never applies to them.
                    const isModule = getModuleOsdElement(def.id) != null;
                    const unsupported =
                      !isModule &&
                      target === 'ardupilot' &&
                      supportedElements != null &&
                      !supportedElements.has(def.id as OsdElementId);

                    return (
                      <ElementRow
                        key={def.id}
                        def={def}
                        position={pos}
                        isSelected={isSelected}
                        unsupported={unsupported}
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
  unsupported,
  currentFont,
  onSelect,
  onToggle,
}: {
  def: AnyOsdElementDef;
  position: OsdElementPosition;
  isSelected: boolean;
  unsupported: boolean;
  currentFont: ReturnType<typeof useOsdStore.getState>['currentFont'];
  onSelect: (id: OsdElementKey) => void;
  onToggle: (id: OsdElementKey) => void;
}) {
  const { t } = useTranslation('osd');
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
        ${isSelected ? 'bg-blue-500/15' : 'hover:bg-surface-overlay-subtle'}
        ${unsupported ? 'opacity-45' : ''}
      `}
      onClick={() => onSelect(def.id)}
      data-tip={unsupported ? t('unsupported') : osdText(t, def.descriptionKey, def.description)}
    >
      <input
        type="checkbox"
        checked={position.enabled}
        onChange={(e) => {
          e.stopPropagation();
          onToggle(def.id);
        }}
        className="w-3 h-3 rounded-sm bg-surface-raised border text-blue-500 shrink-0"
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
        className={`flex-1 text-[11px] truncate ${position.enabled ? 'text-content' : 'text-content-secondary'}`}
      >
        {osdText(t, def.nameKey, def.name)}
      </span>

      {position.enabled && (
        <span className="text-[9px] text-content-tertiary font-mono shrink-0">
          {position.x},{position.y}
        </span>
      )}
    </div>
  );
}
