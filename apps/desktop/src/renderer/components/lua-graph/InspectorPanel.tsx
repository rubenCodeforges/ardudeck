/**
 * Right sidebar — Inspector for the selected node's properties.
 * Shows node info, editable inputs, and configurable properties.
 */
import { useMemo } from 'react';

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
import { DraftNumberInput } from '../../hooks/useNumericDraft';
import { Settings2, Timer } from 'lucide-react';
import { useLuaGraphStore } from '../../stores/lua-graph-store';
import { getNodeDefinition, getEffectivePorts } from './node-library';
import { CATEGORY_COLORS, CATEGORY_LABELS } from './lua-graph-types';

export function InspectorPanel() {
  const { t } = useTranslation('lua');
  const selectedNodeId = useLuaGraphStore((s) => s.selectedNodeId);
  const nodes = useLuaGraphStore((s) => s.nodes);
  const updateNodeProperty = useLuaGraphStore((s) => s.updateNodeProperty);
  const updateNodeLabel = useLuaGraphStore((s) => s.updateNodeLabel);
  const graphName = useLuaGraphStore((s) => s.graphName);
  const graphDescription = useLuaGraphStore((s) => s.graphDescription);
  const runIntervalMs = useLuaGraphStore((s) => s.runIntervalMs);
  const setGraphName = useLuaGraphStore((s) => s.setGraphName);
  const setGraphDescription = useLuaGraphStore((s) => s.setGraphDescription);
  const setRunIntervalMs = useLuaGraphStore((s) => s.setRunIntervalMs);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId),
    [nodes, selectedNodeId],
  );

  if (!selectedNode) {
    return (
      <div className="h-full overflow-y-auto">
        {/* Script Settings — shown when no node is selected */}
        <div className="px-3 py-3 border-b border-subtle">
          <div className="flex items-center gap-2 mb-3">
            <Settings2 className="w-3.5 h-3.5 text-content-secondary" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-content-secondary">
              Script Settings
            </span>
          </div>

          <div className="flex flex-col gap-2.5">
            <div>
              <label className="text-[10px] text-content-secondary block mb-0.5">Name</label>
              <input
                type="text"
                value={graphName}
                onChange={(e) => setGraphName(e.target.value)}
                className="w-full text-xs bg-surface-input border border-subtle rounded px-2 py-1 text-content focus:outline-none focus:border-blue-500/40"
              />
            </div>
            <div>
              <label className="text-[10px] text-content-secondary block mb-0.5">Description</label>
              <textarea
                value={graphDescription}
                onChange={(e) => setGraphDescription(e.target.value)}
                rows={2}
                className="w-full text-xs bg-surface-input border border-subtle rounded px-2 py-1 text-content focus:outline-none focus:border-blue-500/40 resize-none"
                placeholder="What does this script do?"
              />
            </div>
          </div>
        </div>

        <div className="px-3 py-3">
          <div className="flex items-center gap-2 mb-3">
            <Timer className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-content-secondary">
              Run Interval
            </span>
          </div>
          <p className="text-[10px] text-content-tertiary mb-2">
            How often the script executes. Lower values give faster response but use more CPU.
          </p>
          <div className="flex items-center gap-2">
            <DraftNumberInput
              value={runIntervalMs}
              min={50}
              max={60000}
              step={50}
              integer
              onCommit={setRunIntervalMs}
              className="w-24 text-xs bg-surface-input border border-subtle rounded px-2 py-1 text-content focus:outline-none focus:border-blue-500/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="text-[10px] text-content-secondary">ms</span>
          </div>
          <div className="flex gap-1.5 mt-2">
            {[200, 500, 1000, 2000].map((ms) => (
              <button
                key={ms}
                onClick={() => setRunIntervalMs(ms)}
                className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                  runIntervalMs === ms
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'bg-surface text-content-secondary border border-subtle hover:text-content'
                }`}
              >
                {ms >= 1000 ? `${ms / 1000}s` : `${ms}ms`}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const def = getNodeDefinition(selectedNode.data.definitionType);
  if (!def) return null;

  const categoryColor = CATEGORY_COLORS[selectedNode.data.category] ?? '#6b7280';
  const props = selectedNode.data.propertyValues;
  const ports = getEffectivePorts(def, props);

  return (
    <div className="h-full overflow-y-auto">
      {/* Node Header */}
      <div className="px-3 py-3 border-b border-subtle">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: categoryColor }} />
          <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: categoryColor }}>
            {CATEGORY_LABELS[selectedNode.data.category]}
          </span>
        </div>
        <input
          type="text"
          value={selectedNode.data.label}
          onChange={(e) => updateNodeLabel(selectedNode.id, e.target.value)}
          className="w-full text-sm font-semibold text-content bg-transparent border-b border-transparent hover:border-default focus:border-blue-500/50 focus:outline-none pb-0.5 transition-colors"
        />
        <p className="text-[10px] text-content-secondary mt-1">{luaText(t, def.descriptionKey, def.description)}</p>
      </div>

      {/* Properties */}
      {def.properties.length > 0 && (
        <div className="px-3 py-3">
          <h4 className="text-[10px] font-medium uppercase tracking-wider text-content-secondary mb-2">
            Properties
          </h4>
          <div className="flex flex-col gap-2.5">
            {def.properties.map((propDef) => {
              const value = props[propDef.id] ?? propDef.defaultValue;

              if (propDef.type === 'select') {
                return (
                  <div key={propDef.id}>
                    <label className="text-[10px] text-content-secondary block mb-0.5">{propDef.label}</label>
                    <select
                      value={String(value)}
                      onChange={(e) => {
                        const opt = propDef.options?.find((o) => String(o.value) === e.target.value);
                        if (opt) updateNodeProperty(selectedNode.id, propDef.id, opt.value);
                      }}
                      className="w-full text-xs bg-surface-input border border-subtle rounded px-2 py-1 text-content focus:outline-none focus:border-blue-500/40"
                    >
                      {propDef.options?.map((opt) => (
                        <option key={String(opt.value)} value={String(opt.value)}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              }

              if (propDef.type === 'code') {
                return (
                  <div key={propDef.id}>
                    <label className="text-[10px] text-content-secondary block mb-0.5">{propDef.label}</label>
                    <textarea
                      value={String(value)}
                      onChange={(e) => updateNodeProperty(selectedNode.id, propDef.id, e.target.value)}
                      rows={10}
                      spellCheck={false}
                      className="w-full text-[11px] font-mono leading-snug bg-surface-input border border-subtle rounded px-2 py-1.5 text-content focus:outline-none focus:border-blue-500/40 resize-y whitespace-pre"
                    />
                    <p className="text-[10px] text-content-tertiary mt-1">
                      Input pins are available as local variables. Finish with <span className="font-mono">return</span> listing the output pins in order.
                    </p>
                  </div>
                );
              }

              if (propDef.type === 'boolean') {
                return (
                  <div key={propDef.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={Boolean(value)}
                      onChange={(e) => updateNodeProperty(selectedNode.id, propDef.id, e.target.checked)}
                      className="w-3.5 h-3.5 rounded border bg-surface-raised text-blue-500 focus:ring-0"
                    />
                    <label className="text-[11px] text-content-secondary">{propDef.label}</label>
                  </div>
                );
              }

              if (propDef.type === 'number' || propDef.type === 'channel') {
                return (
                  <div key={propDef.id}>
                    <label className="text-[10px] text-content-secondary block mb-0.5">{propDef.label}</label>
                    <DraftNumberInput
                      value={Number(value)}
                      min={propDef.min}
                      max={propDef.max}
                      step={propDef.step ?? 1}
                      onCommit={(v) => updateNodeProperty(selectedNode.id, propDef.id, v)}
                      className="w-full text-xs bg-surface-input border border-subtle rounded px-2 py-1 text-content focus:outline-none focus:border-blue-500/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                );
              }

              // string
              return (
                <div key={propDef.id}>
                  <label className="text-[10px] text-content-secondary block mb-0.5">{propDef.label}</label>
                  <input
                    type="text"
                    value={String(value)}
                    onChange={(e) => updateNodeProperty(selectedNode.id, propDef.id, e.target.value)}
                    className="w-full text-xs bg-surface-input border border-subtle rounded px-2 py-1 text-content focus:outline-none focus:border-blue-500/40"
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Port Info */}
      {(ports.inputs.length > 0 || ports.outputs.length > 0) && (
        <div className="px-3 py-3 border-t border-subtle">
          <h4 className="text-[10px] font-medium uppercase tracking-wider text-content-secondary mb-2">
            Ports
          </h4>
          {ports.inputs.length > 0 && (
            <div className="mb-2">
              <span className="text-[10px] text-content-tertiary">Inputs</span>
              <div className="mt-1 flex flex-col gap-1">
                {ports.inputs.map((p) => (
                  <div key={p.id} className="flex items-center gap-1.5 text-[10px]">
                    <div
                      className="w-1.5 h-1.5 rounded-full"
                      style={{
                        background:
                          p.type === 'number' ? '#3b82f6'
                          : p.type === 'boolean' ? '#a855f7'
                          : p.type === 'string' ? '#f97316'
                          : '#9ca3af',
                      }}
                    />
                    <span className="text-content-secondary">{p.label}</span>
                    <span className="text-content-tertiary ml-auto">{p.type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {ports.outputs.length > 0 && (
            <div>
              <span className="text-[10px] text-content-tertiary">Outputs</span>
              <div className="mt-1 flex flex-col gap-1">
                {ports.outputs.map((p) => (
                  <div key={p.id} className="flex items-center gap-1.5 text-[10px]">
                    <div
                      className="w-1.5 h-1.5 rounded-full"
                      style={{
                        background:
                          p.type === 'number' ? '#3b82f6'
                          : p.type === 'boolean' ? '#a855f7'
                          : p.type === 'string' ? '#f97316'
                          : '#9ca3af',
                      }}
                    />
                    <span className="text-content-secondary">{p.label}</span>
                    <span className="text-content-tertiary ml-auto">{p.type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
