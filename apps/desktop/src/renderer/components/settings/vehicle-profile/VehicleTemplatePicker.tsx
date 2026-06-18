import { useEffect, useMemo, useState } from 'react';
import { X, Search, Download, Info } from 'lucide-react';
import type { VehicleTemplate } from '../../../lib/vehicle-templates/types.js';
import { VEHICLE_TEMPLATES } from '../../../lib/vehicle-templates/registry.js';
import { useConnectionStore } from '../../../stores/connection-store.js';
import { useParameterStore } from '../../../stores/parameter-store.js';
import { inferProfileFromParams } from '../../../lib/vehicle-templates/import.js';

type CategoryFilter = 'all' | VehicleTemplate['category'];

const CATEGORIES: Array<{ id: CategoryFilter; label: string }> = [
  { id: 'all',        label: 'All' },
  { id: 'multirotor', label: 'Multirotor' },
  { id: 'fixed-wing', label: 'Fixed Wing' },
  { id: 'vtol',       label: 'VTOL' },
  { id: 'rover',      label: 'Rover' },
  { id: 'boat',       label: 'Boat' },
  { id: 'sub',        label: 'Sub' },
];

interface VehicleTemplatePickerProps {
  onSelect: (template: VehicleTemplate) => void;
  onImportFromConnected: () => void;
  onClose: () => void;
}

/**
 * Full-screen dialog for picking a starter template. Also exposes
 * "Import from connected vehicle" when a connection + param cache is live.
 */
export function VehicleTemplatePicker({ onSelect, onImportFromConnected, onClose }: VehicleTemplatePickerProps) {
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [query, setQuery] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(0);

  const isConnected = useConnectionStore(s => s.connectionState.isConnected);
  const firmware = useConnectionStore(s => s.connectionState.firmware);
  const paramSize = useParameterStore(s => s.parameters.size);
  const canImport = isConnected && paramSize > 0;
  // These templates emit ArduPilot FRAME_CLASS / FRAME_TYPE / Q_* parameters,
  // which do not apply to PX4 (PX4 selects an airframe via SYS_AUTOSTART).
  const isPx4 = firmware === 'px4';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return VEHICLE_TEMPLATES.filter(t => {
      if (category !== 'all' && t.category !== category) return false;
      if (!q) return true;
      return t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.slug.includes(q);
    });
  }, [category, query]);

  useEffect(() => {
    setFocusedIndex(0);
  }, [category, query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (isPx4) return;
      if (e.key === 'Enter') {
        const t = filtered[focusedIndex];
        if (t) onSelect(t);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex(i => Math.min(i + 3, filtered.length - 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex(i => Math.max(i - 3, 0));
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setFocusedIndex(i => Math.min(i + 1, filtered.length - 1));
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setFocusedIndex(i => Math.max(i - 1, 0));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [filtered, focusedIndex, onClose, onSelect, isPx4]);

  return (
    <div className="fixed inset-0 bg-surface-overlay flex items-center justify-center z-[70] p-4">
      <div className="bg-surface-raised rounded-xl border border-subtle w-full max-w-5xl max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-subtle">
          <div>
            <h2 className="text-base font-semibold text-content">Choose a vehicle template</h2>
            <p className="text-xs text-content-secondary mt-0.5">
              Pick the configuration that matches your aircraft — you can tweak fields after.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-overlay-subtle text-content-secondary hover:text-content">
            <X className="w-4 h-4" />
          </button>
        </div>

        {isPx4 ? (
          <div className="flex-1 overflow-y-auto p-8">
            <div className="max-w-md mx-auto mt-6 bg-surface rounded-xl border border-subtle p-6 text-center">
              <div className="w-10 h-10 rounded-lg bg-surface-raised flex items-center justify-center mx-auto mb-4">
                <Info className="w-5 h-5 text-content-secondary" />
              </div>
              <p className="text-sm text-content-secondary leading-relaxed">
                These starter templates configure ArduPilot airframe parameters and do not apply to PX4.
                On PX4, the airframe is selected via SYS_AUTOSTART and can be set from the Parameters tab.
              </p>
            </div>
          </div>
        ) : (
        <>
        {/* Filter bar */}
        <div className="px-5 py-3 border-b border-subtle flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1">
            {CATEGORIES.map(c => (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={`px-3 py-1 rounded-full text-xs transition-colors ${
                  category === c.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-surface-overlay-subtle text-content-secondary hover:text-content hover:bg-surface-overlay-subtle'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 bg-surface-overlay-subtle rounded-lg px-3 py-1.5 ml-auto">
            <Search className="w-3.5 h-3.5 text-content-secondary" />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search templates…"
              className="bg-transparent text-xs text-content placeholder:text-content-secondary outline-none w-48"
            />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {canImport && category === 'all' && !query && (
            <button
              onClick={onImportFromConnected}
              className="w-full mb-5 p-4 rounded-xl border border-dashed border-blue-500/50 bg-blue-500/5 hover:bg-blue-500/10 transition-colors text-left group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/15 flex items-center justify-center">
                  <Download className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <div className="text-sm font-medium text-content">Import from connected vehicle</div>
                  <div className="text-xs text-content-secondary mt-0.5">
                    Read parameters from the currently connected vehicle and infer the matching template.
                  </div>
                </div>
              </div>
            </button>
          )}

          {filtered.length === 0 ? (
            <div className="text-center py-12 text-content-secondary text-sm">
              No templates match the current filter.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map((t, i) => (
                <TemplateCard
                  key={t.slug}
                  template={t}
                  focused={i === focusedIndex}
                  onClick={() => onSelect(t)}
                  onMouseEnter={() => setFocusedIndex(i)}
                />
              ))}
            </div>
          )}
        </div>
        </>
        )}

        <div className="px-5 py-3 border-t border-subtle text-[10px] text-content-secondary flex items-center justify-between">
          <span>{isPx4 ? 'PX4 airframe via SYS_AUTOSTART' : `${filtered.length} template${filtered.length === 1 ? '' : 's'}`}</span>
          <span>↑↓←→ navigate · Enter select · Esc cancel</span>
        </div>
      </div>
    </div>
  );
}

interface TemplateCardProps {
  template: VehicleTemplate;
  focused: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
}

function TemplateCard({ template, focused, onClick, onMouseEnter }: TemplateCardProps) {
  const Icon = template.icon;
  const paramCount = template.toParams(template.defaults as never).length;
  return (
    <button
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={`p-4 rounded-xl border text-left transition-all ${
        focused
          ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30 scale-[1.01]'
          : 'border-subtle bg-surface hover:bg-blue-500/5 hover:border-blue-500/40'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-content truncate">{template.name}</div>
          <div className="text-xs text-content-secondary mt-0.5 line-clamp-2">{template.description}</div>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 uppercase font-medium tracking-wide">
              {template.vehicleType}
            </span>
            <span className="text-[10px] text-content-tertiary">{paramCount} params</span>
          </div>
        </div>
      </div>
    </button>
  );
}
