/**
 * Right sidebar (lower) — collapsible live Lua code preview.
 * Compiles the current graph in real-time and shows the output.
 */
import { useMemo, useState, useCallback } from 'react';
import { Code2, Copy, Check, ChevronUp, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLuaGraphStore } from '../../stores/lua-graph-store';
import { compileGraph } from './lua-compiler';
import { highlightLua } from './lua-highlighter';

export function LuaPreviewPanel() {
  const { t } = useTranslation();
  const nodes = useLuaGraphStore((s) => s.nodes);
  const edges = useLuaGraphStore((s) => s.edges);
  const graphName = useLuaGraphStore((s) => s.graphName);
  const runIntervalMs = useLuaGraphStore((s) => s.runIntervalMs);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const result = useMemo(
    () => compileGraph(nodes, edges, graphName, runIntervalMs),
    [nodes, edges, graphName, runIntervalMs],
  );

  const highlighted = useMemo(
    () => (result.code ? highlightLua(result.code) : null),
    [result.code],
  );

  const handleCopy = useCallback(async () => {
    if (!result.code) return;
    await navigator.clipboard.writeText(result.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [result.code]);

  return (
    <div className={`border-t border-subtle flex flex-col ${expanded ? 'h-52' : ''}`}>
      {/* Header — always visible, click to toggle */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between px-3 py-1.5 hover:bg-surface transition-colors shrink-0"
      >
        <div className="flex items-center gap-2">
          <Code2 className="w-3 h-3 text-content-secondary" />
          <span className="text-[10px] font-medium uppercase tracking-wider text-content-secondary">
            {t('lua-graph:luaPreviewPanel.title')}
          </span>
          {result.errors.length > 0 && (
            <span className="text-[9px] text-red-400 bg-red-500/10 px-1.5 rounded">
              {t('lua-graph:luaPreviewPanel.errShort', { count: result.errors.length })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {expanded && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleCopy();
              }}
              className="p-0.5 rounded hover:bg-surface-raised transition-colors"
              title={t('lua-graph:luaPreviewPanel.copyToClipboard')}
            >
              {copied ? (
                <Check className="w-3 h-3 text-emerald-400" />
              ) : (
                <Copy className="w-3 h-3 text-content-secondary" />
              )}
            </button>
          )}
          {expanded ? (
            <ChevronDown className="w-3 h-3 text-content-tertiary" />
          ) : (
            <ChevronUp className="w-3 h-3 text-content-tertiary" />
          )}
        </div>
      </button>

      {/* Collapsible content */}
      {expanded && (
        <>
          {/* Errors */}
          {result.errors.length > 0 && (
            <div className="px-3 py-1.5 bg-red-500/10 border-t border-red-500/20 shrink-0">
              {result.errors.map((err, i) => (
                <div key={i} className="text-[10px] text-red-400">{err}</div>
              ))}
            </div>
          )}

          {/* Code */}
          <div className="flex-1 overflow-auto px-3 py-2 min-h-0">
            {highlighted ? (
              <pre className="text-[10px] leading-4 text-content-secondary font-mono whitespace-pre">
                {highlighted}
              </pre>
            ) : (
              <div className="text-[10px] text-content-tertiary italic">
                {t('lua-graph:luaPreviewPanel.empty')}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
