/**
 * Template selection dialog — lets users pick a pre-built graph template.
 * Rich visual design with category colors, per-template icons, and stat badges.
 */
import { useCallback, useState } from 'react';

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
  X,
  Search,
  Layers,
  BatteryWarning,
  MapPin,
  Radio,
  PlaneLanding,
  Camera,
  Mountain,
  ArrowRight,
  GitFork,
  Timer,
  Anchor,
  Home,
  Package,
  Gauge,
  FileSpreadsheet,
  Cable,
  type LucideIcon,
} from 'lucide-react';
import { GRAPH_TEMPLATES } from './graph-templates';
import { useLuaGraphStore } from '../../stores/lua-graph-store';
import { ConfirmDialog } from './ConfirmDialog';

// ── Category styling ────────────────────────────────────────────

const CATEGORY_STYLE: Record<string, { accent: string; bg: string; text: string; badge: string }> = {
  Safety: {
    accent: 'border-t-red-500/70',
    bg: 'bg-red-500/10',
    text: 'text-red-400',
    badge: 'bg-red-500/15 text-red-400 border-red-500/20',
  },
  Utility: {
    accent: 'border-t-blue-500/70',
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    badge: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  },
  Automation: {
    accent: 'border-t-emerald-500/70',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  },
  Navigation: {
    accent: 'border-t-amber-500/70',
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    badge: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  },
  'Data Logging': {
    accent: 'border-t-cyan-500/70',
    bg: 'bg-cyan-500/10',
    text: 'text-cyan-400',
    badge: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
  },
};

const FALLBACK_STYLE = {
  accent: 'border-t-gray-500/70',
  bg: 'bg-gray-500/10',
  text: 'text-gray-400',
  badge: 'bg-gray-500/15 text-gray-400 border-gray-500/20',
};

// ── Per-template icons ──────────────────────────────────────────

const TEMPLATE_ICON: Record<string, LucideIcon> = {
  'low-battery-warning': BatteryWarning,
  'geofence-alert': MapPin,
  'mode-announcement': Radio,
  'landing-gear': PlaneLanding,
  'camera-trigger': Camera,
  'terrain-follow': Mountain,
  'depth-logger': Anchor,
  'auto-rtl-battery': Home,
  'payload-drop': Package,
  'speed-limit-warning': Gauge,
  'flight-data-logger': FileSpreadsheet,
  'custom-serial-telemetry': Cable,
};

// ── Format interval ─────────────────────────────────────────────

function fmtInterval(ms: number): string {
  if (ms >= 1000) return `${ms / 1000}s`;
  return `${ms}ms`;
}

// ── Component ───────────────────────────────────────────────────

interface TemplateDialogProps {
  onClose: () => void;
}

export function TemplateDialog({ onClose }: TemplateDialogProps) {
  const { t } = useTranslation('lua');
  const { loadGraph, isDirty } = useLuaGraphStore();
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const applyTemplate = useCallback(
    (templateId: string) => {
      const template = GRAPH_TEMPLATES.find((t) => t.id === templateId);
      if (!template) return;
      loadGraph(template.graph);
      useLuaGraphStore.setState({ filePath: null });
      onClose();
    },
    [loadGraph, onClose],
  );

  const handleSelect = useCallback(
    (templateId: string) => {
      if (isDirty) {
        setPendingTemplateId(templateId);
      } else {
        applyTemplate(templateId);
      }
    },
    [isDirty, applyTemplate],
  );

  // Search across name, description, and category
  const q = query.trim().toLowerCase();
  const visibleTemplates = q
    ? GRAPH_TEMPLATES.filter(
        // `tpl`, not `t`: the callback parameter would otherwise shadow the
        // translator returned by useTranslation.
        (tpl) =>
          luaText(t, tpl.nameKey, tpl.name).toLowerCase().includes(q) ||
          luaText(t, tpl.descriptionKey, tpl.description).toLowerCase().includes(q) ||
          tpl.category.toLowerCase().includes(q),
      )
    : GRAPH_TEMPLATES;

  // Group templates by category
  const categories = [...new Set(visibleTemplates.map((t) => t.category))];

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-surface-solid rounded-2xl border border-subtle w-full max-w-2xl mx-4 shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-subtle">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Layers className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-content">Graph Templates</h2>
                <p className="text-[10px] text-content-secondary mt-0.5">
                  Pre-built scripts to get you started quickly
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-surface-raised text-content-secondary hover:text-content transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Search */}
          <div className="px-5 pt-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-secondary" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search templates..."
                autoFocus
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-surface-input border border-subtle rounded-md text-content placeholder:text-content-tertiary focus:outline-none focus:border-blue-500/40"
              />
            </div>
          </div>

          {/* Body */}
          <div className="p-5 max-h-[65vh] overflow-y-auto space-y-6">
            {visibleTemplates.length === 0 && (
              <div className="py-10 text-center text-xs text-content-secondary">
                No templates match "{query.trim()}"
              </div>
            )}
            {categories.map((cat) => {
              const style = CATEGORY_STYLE[cat] ?? FALLBACK_STYLE;
              return (
                <div key={cat}>
                  {/* Category header */}
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded border ${style.badge}`}
                    >
                      {cat}
                    </span>
                    <div className="flex-1 h-px bg-subtle" />
                  </div>

                  {/* Template cards */}
                  <div className="grid grid-cols-2 gap-3">
                    {visibleTemplates.filter((t) => t.category === cat).map((template) => {
                      const Icon = TEMPLATE_ICON[template.id] ?? Layers;
                      const nodeCount = template.graph.nodes.filter(
                        (n) => n.type !== 'flow-comment',
                      ).length;
                      const edgeCount = template.graph.edges.length;

                      return (
                        <button
                          key={template.id}
                          onClick={() => handleSelect(template.id)}
                          className={`
                            group text-left rounded-xl border-t-2 border border-subtle
                            bg-surface hover:bg-surface-raised transition-all duration-200
                            hover:border hover:shadow-lg hover:shadow-black/20
                            ${style.accent}
                          `}
                        >
                          {/* Card content */}
                          <div className="p-4">
                            {/* Icon + Title row */}
                            <div className="flex items-start gap-3 mb-2.5">
                              <div
                                className={`w-9 h-9 rounded-lg ${style.bg} flex items-center justify-center shrink-0`}
                              >
                                <Icon className={`w-4.5 h-4.5 ${style.text}`} />
                              </div>
                              <div className="min-w-0">
                                <div className="text-[13px] font-medium text-content group-hover:text-content transition-colors leading-tight">
                                  {luaText(t, template.nameKey, template.name)}
                                </div>
                                <div className="text-[11px] text-content-secondary leading-relaxed mt-1">
                                  {luaText(t, template.descriptionKey, template.description)}
                                </div>
                              </div>
                            </div>

                            {/* Stats row */}
                            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-subtle">
                              <div className="flex items-center gap-1 text-[10px] text-content-tertiary">
                                <GitFork className="w-3 h-3" />
                                <span>
                                  {nodeCount} node{nodeCount !== 1 ? 's' : ''}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 text-[10px] text-content-tertiary">
                                <ArrowRight className="w-3 h-3" />
                                <span>
                                  {edgeCount} connection{edgeCount !== 1 ? 's' : ''}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 text-[10px] text-content-tertiary">
                                <Timer className="w-3 h-3" />
                                <span>{fmtInterval(template.graph.runIntervalMs)}</span>
                              </div>
                              <div className="flex-1" />
                              <ArrowRight
                                className="w-3.5 h-3.5 text-content-tertiary group-hover:text-content-secondary transition-colors"
                              />
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {pendingTemplateId && (
        <ConfirmDialog
          title="Unsaved changes"
          message="Your current graph has unsaved changes. Loading a template will discard them."
          confirmLabel="Load template"
          cancelLabel="Go back"
          onConfirm={() => {
            applyTemplate(pendingTemplateId);
            setPendingTemplateId(null);
          }}
          onCancel={() => setPendingTemplateId(null)}
        />
      )}
    </>
  );
}
