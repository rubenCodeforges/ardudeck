/**
 * Custom React Flow node component for the Lua Graph Editor.
 * Renders a node with typed input/output ports, category coloring, and label.
 */
import { memo, useCallback } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import type { GraphNodeData, PortValueType } from './lua-graph-types';
import { getNodeDefinition, getEffectivePorts } from './node-library';
import { CATEGORY_COLORS } from './lua-graph-types';
import { nodeInstanceLabel, portLabel } from './lua-graph-i18n';
import { useLuaGraphStore } from '../../stores/lua-graph-store';
import { useResolvedTheme } from '../../hooks/useTheme';

const PORT_TYPE_COLORS: Record<PortValueType, string> = {
  number: '#3b82f6',   // blue
  boolean: '#a855f7',  // purple
  string: '#f97316',   // orange
  vector3: '#22c55e',  // green
  any: '#9ca3af',      // gray
};

function GraphNodeComponent({ id, data, selected }: NodeProps<Node<GraphNodeData>>) {
  const { t } = useTranslation();
  const def = getNodeDefinition(data.definitionType);
  const categoryColor = CATEGORY_COLORS[data.category] ?? '#6b7280';
  const setSelectedNode = useLuaGraphStore((s) => s.setSelectedNode);
  const isLight = useResolvedTheme() === 'light';

  const handleClick = useCallback(() => {
    setSelectedNode(id);
  }, [id, setSelectedNode]);

  if (!def) {
    return (
      <div className="bg-red-900/80 border border-red-500/50 rounded-lg px-3 py-2 text-xs text-red-300">
        {t('lua-graph:graphNodeComponent.unknownNode', { type: data.definitionType })}
      </div>
    );
  }

  const ports = getEffectivePorts(def, data.propertyValues);

  // ── Comment / annotation node — lightweight label style ──
  if (data.definitionType === 'flow-comment') {
    const text = String(data.propertyValues['text'] ?? '');
    return (
      <div
        onClick={handleClick}
        className={`
          max-w-[240px] rounded-md border border-dashed px-3 py-1.5
          transition-all duration-150
          ${selected
            ? 'border-gray-400/60 bg-surface-raised'
            : 'border-gray-600/40 bg-surface hover:border-gray-500/50'
          }
        `}
      >
        <div className="text-[10px] font-bold text-content-secondary uppercase tracking-wider mb-0.5">
          {nodeInstanceLabel(t, def, data)}
        </div>
        {text && (
          <div className="text-[11px] text-content-secondary leading-snug">{text}</div>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={handleClick}
      className={`
        min-w-[160px] rounded-lg border shadow-lg backdrop-blur-sm
        transition-all duration-150
        ${selected
          ? isLight
            ? 'border-gray-400 shadow-gray-300/30 ring-1 ring-gray-400/30'
            : 'border-white/40 shadow-white/10 ring-1 ring-white/20'
          : isLight
            ? 'border-gray-300 shadow-gray-200/40 hover:border-gray-400'
            : 'border shadow-black/30 hover:border-gray-500/60'
        }
      `}
      style={{ background: isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(30, 30, 40, 0.92)' }}
    >
      {/* Header bar with category color */}
      <div
        className={`flex items-center gap-2 px-3 py-1.5 rounded-t-lg text-xs font-semibold ${isLight ? 'text-white' : 'text-white'}`}
        style={{ background: isLight ? `${categoryColor}cc` : `${categoryColor}30`, borderBottom: `1px solid ${categoryColor}${isLight ? '40' : '40'}` }}
      >
        <div className="w-2 h-2 rounded-full" style={{ background: categoryColor }} />
        <span className="truncate">{nodeInstanceLabel(t, def, data)}</span>
      </div>

      {/* Custom Lua — one-line code preview so the node isn't a blank box */}
      {data.definitionType === 'flow-custom-lua' && (
        <div className="px-3 pt-1.5 max-w-[220px]">
          <div className="text-[9px] font-mono text-content-tertiary truncate">
            {String(data.propertyValues['code'] ?? '').split('\n').find((l) => l.trim() && !l.trim().startsWith('--')) ?? t('lua-graph:graphNodeComponent.editCodeInInspector')}
          </div>
        </div>
      )}

      {/* Ports */}
      <div className="px-1 py-1.5 flex flex-col gap-0.5">
        {/* Input ports */}
        {ports.inputs.map((port) => (
          <div key={port.id} className="relative flex items-center h-5 pl-3 pr-2">
            <Handle
              type="target"
              position={Position.Left}
              id={port.id}
              className="!w-2.5 !h-2.5 !border-2 !border-surface-base !-left-[5px]"
              style={{ background: PORT_TYPE_COLORS[port.type] }}
            />
            <span className="text-[10px] text-content-secondary">{portLabel(t, def, port)}</span>
          </div>
        ))}

        {/* Output ports */}
        {ports.outputs.map((port) => (
          <div key={port.id} className="relative flex items-center justify-end h-5 pl-2 pr-3">
            <span className="text-[10px] text-content-secondary">{portLabel(t, def, port)}</span>
            <Handle
              type="source"
              position={Position.Right}
              id={port.id}
              className="!w-2.5 !h-2.5 !border-2 !border-surface-base !-right-[5px]"
              style={{ background: PORT_TYPE_COLORS[port.type] }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(GraphNodeComponent);
