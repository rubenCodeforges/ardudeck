/**
 * Main Lua Graph Editor view — the top-level component rendered in App.tsx.
 * Composes the toolbar, node palette, canvas, inspector, and lua preview.
 */
import { useMemo } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { GraphCanvas } from './GraphCanvas';
import { NodePalette } from './NodePalette';
import { InspectorPanel } from './InspectorPanel';
import { LuaPreviewPanel } from './LuaPreviewPanel';
import { GraphToolbar } from './GraphToolbar';
import { useLuaGraphStore } from '../../stores/lua-graph-store';
import { compileGraph } from './lua-compiler';

export function LuaGraphView() {
  const { t } = useTranslation();
  const nodes = useLuaGraphStore((s) => s.nodes);
  const edges = useLuaGraphStore((s) => s.edges);
  const graphName = useLuaGraphStore((s) => s.graphName);
  const runIntervalMs = useLuaGraphStore((s) => s.runIntervalMs);
  const selectedNodeId = useLuaGraphStore((s) => s.selectedNodeId);

  // Compile for status bar
  const compileResult = useMemo(
    () => compileGraph(nodes, edges, graphName, runIntervalMs),
    [nodes, edges, graphName, runIntervalMs],
  );

  return (
    <ReactFlowProvider>
      <div className="h-full flex flex-col bg-surface-base">
        {/* Toolbar */}
        <GraphToolbar />

        {/* Main content area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Node Palette */}
          <NodePalette />

          {/* Center: Canvas */}
          <div className="flex-1 relative">
            <GraphCanvas />
          </div>

          {/* Right: Inspector + Preview */}
          <div className="w-56 border-l border-subtle bg-surface flex flex-col">
            {/* Inspector — primary content, takes available space */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <InspectorPanel />
            </div>

            {/* Lua Preview — compact collapsible section at bottom */}
            <LuaPreviewPanel />
          </div>
        </div>

        {/* Status Bar */}
        <div className="flex items-center gap-4 px-3 py-1 bg-surface border-t border-subtle text-[10px] text-content-secondary">
          <span>{t('lua-graph:luaGraphView.nodeCount', { count: nodes.length })}</span>
          <span className="w-px h-3 bg-subtle" />
          <span
            className={compileResult.success ? 'text-emerald-500' : 'text-red-400'}
          >
            {compileResult.success ? t('lua-graph:luaGraphView.valid') : t('lua-graph:luaGraphView.errorCount', { count: compileResult.errors.length })}
          </span>
          <span className="w-px h-3 bg-subtle" />
          <span>
            {t('lua-graph:luaGraphView.estMemory', { kb: (compileResult.estimatedMemoryBytes / 1024).toFixed(1) })}
          </span>
          <div className="flex-1" />
          <span className="text-content-tertiary">{t('lua-graph:luaGraphView.footer')}</span>
        </div>
      </div>
    </ReactFlowProvider>
  );
}
