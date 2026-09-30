/**
 * Left sidebar — categorized, searchable list of available nodes.
 * Drag a node from here onto the canvas to add it.
 */
import { useState, useCallback } from 'react';

/**
 * Prefer the i18n key when the codemod added one, else fall back to the literal.
 * The codemod skips strings that need no translation (all-caps acronyms like
 * 'AND'), so the key is optional. Kept as a plain function rather than a
 * `useX`-named hook because it does no hook work and is called from callbacks;
 * `t` is threaded in by the calling component.
 */
function luaText(t: (key: string) => string, key: string | undefined, fallback: string): string {
  return key ? t(key) : fallback;
}
import { useTranslation } from 'react-i18next';
import {
  Search,
  // Sensors
  MapPin,
  Mountain,
  Battery,
  Wind,
  Radio,
  Ruler,
  Compass,
  Gauge,
  ToggleLeft,
  Scan,
  Navigation,
  Shield,
  Satellite,
  Home,
  Move3d,
  CloudSun,
  // Logic
  GitCompareArrows,
  GitBranch,
  Merge,
  Split,
  Ban,
  ArrowLeftRight,
  Route,
  // Math
  Plus,
  Minus,
  X,
  Divide,
  Grip,
  ArrowRightLeft,
  Hash,
  ChevronDown,
  ChevronUp,
  // Actions
  MessageSquare,
  Cog,
  Plane,
  Settings,
  Zap,
  Lightbulb,
  FileText,
  Music,
  Waypoints,
  // Timing
  Timer,
  Clock,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  ToggleRight,
  // Variables
  Brackets,
  Download,
  Upload,
  // Flow
  MessageCircle,
  // Categories
  Cpu,
  BrainCircuit,
  Calculator,
  Bolt,
  Hourglass,
  Variable,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import type { NodeCategory } from './lua-graph-types';
import { CATEGORY_COLORS, CATEGORY_LABELS } from './lua-graph-types';
import { NODE_LIBRARY, getNodesByCategory } from './node-library';
import { useLuaGraphStore } from '../../stores/lua-graph-store';

// ── Icon Maps ───────────────────────────────────────────────────

const NODE_ICONS: Record<string, LucideIcon> = {
  // Sensors
  'sensor-gps': MapPin,
  'sensor-baro-alt': Mountain,
  'sensor-battery': Battery,
  'sensor-airspeed': Wind,
  'sensor-rc-channel': Radio,
  'sensor-rangefinder': Ruler,
  'sensor-attitude': Compass,
  'sensor-groundspeed': Gauge,
  'sensor-rc-aux-switch': ToggleLeft,
  'sensor-rangefinder-orient': Scan,
  'sensor-flight-mode': Navigation,
  'sensor-armed': Shield,
  'sensor-gps-status': Satellite,
  'sensor-home': Home,
  'sensor-velocity-ned': Move3d,
  'sensor-wind': CloudSun,
  // Logic
  'logic-compare': GitCompareArrows,
  'logic-if-else': GitBranch,
  'logic-and': Merge,
  'logic-or': Split,
  'logic-not': Ban,
  'logic-range-check': ArrowLeftRight,
  'logic-switch': Route,
  // Math
  'math-add': Plus,
  'math-subtract': Minus,
  'math-multiply': X,
  'math-divide': Divide,
  'math-clamp': Grip,
  'math-map-range': ArrowRightLeft,
  'math-abs': Hash,
  'math-min': ChevronDown,
  'math-max': ChevronUp,
  // Actions
  'action-gcs-text': MessageSquare,
  'action-set-servo': Cog,
  'action-set-mode': Plane,
  'action-set-param': Settings,
  'action-relay': Zap,
  'action-set-led': Lightbulb,
  'action-log-to-file': FileText,
  'action-play-tune': Music,
  'action-set-waypoint': Waypoints,
  // Timing
  'timing-run-every': Timer,
  'timing-debounce': Clock,
  'timing-on-change': RefreshCw,
  'timing-rising-edge': TrendingUp,
  'timing-falling-edge': TrendingDown,
  'timing-latch': ToggleRight,
  // Variables
  'var-constant': Brackets,
  'var-get': Download,
  'var-set': Upload,
  // Flow
  'flow-comment': MessageCircle,
};

const CATEGORY_ICONS: Record<NodeCategory, LucideIcon> = {
  sensors: Cpu,
  logic: BrainCircuit,
  math: Calculator,
  actions: Bolt,
  timing: Hourglass,
  variables: Variable,
  flow: Workflow,
};

const CATEGORIES: NodeCategory[] = ['sensors', 'logic', 'math', 'actions', 'timing', 'variables', 'flow'];

export function NodePalette() {
  const { t } = useTranslation('lua');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategory, setExpandedCategory] = useState<NodeCategory | null>('sensors');
  const addNode = useLuaGraphStore((s) => s.addNode);

  const onDragStart = useCallback((e: React.DragEvent, definitionType: string) => {
    e.dataTransfer.setData('application/lua-graph-node', definitionType);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  // Double-click to add to center of canvas
  const onDoubleClick = useCallback(
    (definitionType: string) => {
      addNode(definitionType, { x: 300 + Math.random() * 100, y: 200 + Math.random() * 100 });
    },
    [addNode],
  );

  const toggleCategory = useCallback(
    (cat: NodeCategory) => {
      setExpandedCategory((prev) => (prev === cat ? null : cat));
    },
    [],
  );

  // Filter nodes by search query
  const filteredBySearch = searchQuery.trim()
    ? NODE_LIBRARY.filter(
        (n) =>
          // Match against what the user actually sees, not the source literal.
          luaText(t, n.labelKey, n.label).toLowerCase().includes(searchQuery.toLowerCase()) ||
          luaText(t, n.descriptionKey, n.description).toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : null;

  return (
    <div className="w-56 h-full bg-surface border-r border-subtle flex flex-col">
      {/* Search */}
      <div className="p-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-secondary" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search nodes..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-surface-input border border-subtle rounded-md text-content placeholder:text-content-tertiary focus:outline-none focus:border-blue-500/40"
          />
        </div>
      </div>

      {/* Node list */}
      <div className="flex-1 overflow-y-auto px-1 pb-2">
        {filteredBySearch ? (
          // Search results — flat list
          <div className="flex flex-col gap-0.5 px-1">
            {filteredBySearch.length === 0 && (
              <div className="text-xs text-content-tertiary text-center py-4">No matching nodes</div>
            )}
            {filteredBySearch.map((node) => (
              <NodeItem
                key={node.type}
                definitionType={node.type}
                label={luaText(t, node.labelKey, node.label)}
                description={luaText(t, node.descriptionKey, node.description)}
                color={CATEGORY_COLORS[node.category]}
                onDragStart={onDragStart}
                onDoubleClick={onDoubleClick}
              />
            ))}
          </div>
        ) : (
          // Category view
          CATEGORIES.map((cat) => {
            const nodes = getNodesByCategory(cat);
            const isExpanded = expandedCategory === cat;
            const color = CATEGORY_COLORS[cat];
            const CatIcon = CATEGORY_ICONS[cat];

            return (
              <div key={cat} className="mb-0.5">
                <button
                  onClick={() => toggleCategory(cat)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs font-medium text-content hover:bg-surface transition-colors"
                >
                  <CatIcon className="w-3.5 h-3.5 shrink-0" style={{ color }} />
                  <span className="flex-1 text-left">{CATEGORY_LABELS[cat]}</span>
                  <svg
                    className={`w-3 h-3 text-content-secondary transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="text-[10px] text-content-tertiary">{nodes.length}</span>
                </button>

                {isExpanded && (
                  <div className="flex flex-col gap-0.5 pl-2 pr-1 mt-0.5">
                    {nodes.map((node) => (
                      <NodeItem
                        key={node.type}
                        definitionType={node.type}
                        label={luaText(t, node.labelKey, node.label)}
                        description={luaText(t, node.descriptionKey, node.description)}
                        color={color}
                        onDragStart={onDragStart}
                        onDoubleClick={onDoubleClick}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Individual Node Item ────────────────────────────────────────

function NodeItem({
  definitionType,
  label,
  description,
  color,
  onDragStart,
  onDoubleClick,
}: {
  definitionType: string;
  label: string;
  description: string;
  color: string;
  onDragStart: (e: React.DragEvent, type: string) => void;
  onDoubleClick: (type: string) => void;
}) {
  const Icon = NODE_ICONS[definitionType];

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, definitionType)}
      onDoubleClick={() => onDoubleClick(definitionType)}
      className="flex items-center gap-2 px-2 py-1.5 rounded cursor-grab active:cursor-grabbing hover:bg-surface transition-colors group"
      title={description}
    >
      {Icon ? (
        <Icon
          className="w-3.5 h-3.5 shrink-0 opacity-50 group-hover:opacity-100 transition-opacity"
          style={{ color }}
        />
      ) : (
        <div
          className="w-1.5 h-4 rounded-full shrink-0 opacity-50 group-hover:opacity-100 transition-opacity"
          style={{ background: color }}
        />
      )}
      <span className="text-[11px] text-content-secondary group-hover:text-content truncate transition-colors">
        {label}
      </span>
    </div>
  );
}
